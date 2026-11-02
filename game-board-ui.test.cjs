'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../dist/catalog.js');
const T = require('../dist/table.js');
const I = require('../dist/i18n.js');
const source = fs.readFileSync(require.resolve('../dist/game-ui.js'), 'utf8');

// The view delegates every move to its caller. A small DOM harness lets these
// tests inspect those requests without coupling them to CSS or a browser driver.
function harness(options = {}) {
  const nodes = [];
  function element(tag = 'div', dataset = {}) {
    const node = {tag, dataset, innerHTML:'', children:[], listeners:{}, open:false, style:{},
      classList:{toggle(){}, remove(){}},
      append(...items){this.children.push(...items);}, appendChild(item){this.children.push(item);},
      setAttribute(name,value){this[name]=String(value);},
      hasAttribute(name){return name.startsWith('data-') && Object.hasOwn(this.dataset,name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()));},
      closest(selector){
        if(selector==='button')return this.tag==='button'?this:null;
        const match=selector.match(/^\[([^\]]+)\]$/);
        return match&&this.hasAttribute(match[1])?this:null;
      },
      contains(item){return !!item && item.inShell!==false;},
      querySelector(selector){return selector==='.inspector-panel'?inspector:selector==='.board-scroll'?boardScroller:null;},querySelectorAll(){return [];},
      addEventListener(name,fn){this.listeners[name]=fn;}, removeEventListener(name){delete this.listeners[name];},
      showModal(){this.open=true;},close(){this.open=false;},remove(){this.removed=true;}
    };
    nodes.push(node);return node;
  }
  const inspector=element(), container=element(), boardScroller=element(), language=I.create({storage:null,document:null});
  Object.assign(boardScroller,{scrollLeft:0,scrollTop:0,scrollHeight:300,clientHeight:300,scrollWidth:600,clientWidth:600,getBoundingClientRect:()=>({left:0,right:600,top:100,bottom:400})});
  const document={createElement:element,elementFromPoint:()=>null,documentElement:{clientHeight:800,clientWidth:1200},scrollingElement:{scrollTop:0,scrollHeight:2400,clientHeight:800}};
  const frames=new Map();let frameId=0;
  const context={document,innerHeight:800,innerWidth:1200,requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:id=>frames.delete(id),MHI18n:{...language,apply(){}}};
  const tick=time=>{const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(time);};
  vm.runInNewContext(source,context);
  const sent=[];
  const ui=context.MHGameUI.create({container,catalog:C,mode:'manual',onAction:action=>sent.push(JSON.parse(JSON.stringify(action))),...options});
  const shell=container.children[0],content=shell.children[0],dialog=shell.children[1];
  const event=(type,dataset={},extra={})=>{
    const target=element('button',dataset), e={target,button:0,pointerType:'mouse',prevented:false,preventDefault(){this.prevented=true;},...extra};
    shell.listeners[type]?.(e);return e;
  };
  const state=T.createGame(C,{seed:16});
  state.phase='main';state.turn=1;state.activePlayer=0;state.priorityPlayer=0;
  state.players.forEach((p,index)=>{p.hand=[];p.camp=[];p.items=[];p.rations={ready:6,tapped:0,deck:6};p.chief.controller=index;});
  function card(type,player=0,condition=()=>true) {
    const d=C.cards.find(c=>c.type===type&&condition(c));
    const value={uid:'ui'+(++state.seq),cardId:d.id,owner:player,controller:player,tapped:false,damage:0,counters:{}};
    state.players[player].hand.push(value);return value;
  }
  function update(actions=T.getActions(state,C)){ui.update(state,actions);}
  function drag(uid,zone,player=0){
    const destination=element('section',{gameDrop:zone,gamePlayer:String(player)});
    document.elementFromPoint=()=>destination;
    const start=event('pointerdown',{gameUid:uid,gamePreviewUid:uid,gameDraggable:'true'},{pointerId:1,clientX:20,clientY:20});
    event('pointermove',{}, {pointerId:1,clientX:80,clientY:150});
    const drop=event('pointerup',{}, {pointerId:1,clientX:80,clientY:150});
    return {start,drop};
  }
  return {ui,shell,content,dialog,inspector,state,sent,event,card,update,drag,language,document,frames,tick,boardScroller};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('le plateau présente les rations physiques, les cinq étapes et un inspecteur fixe',()=>{
  const h=harness();h.state.players[0].rations={ready:2,tapped:3,deck:7};h.state.players[1].rations={ready:0,tapped:0,deck:12};h.update();
  assert.equal((h.content.innerHTML.match(/class="ration-card /g)||[]).length,5);
  assert.equal((h.content.innerHTML.match(/class="ration-card spent"/g)||[]).length,3);
  assert.equal((h.content.innerHTML.match(/class="phase-step /g)||[]).length,5);
  assert.match(h.content.innerHTML,/inspector-placeholder/);assert.match(h.content.innerHTML,/assets\/game\/ration.webp/);
  h.state.flow='start';h.state.phase='response';h.update();
  assert.match(h.content.innerHTML,/phase-step current[^>]*aria-current="step"><b>2<\/b>/);
  h.state.flow='end';h.update();assert.match(h.content.innerHTML,/phase-step current[^>]*aria-current="step"><b>5<\/b>/);
});

test('survol, focus et toucher utilisent le même aperçu, sans révéler une main masquée',()=>{
  const h=harness(),c=h.card('hunter');h.update();
  h.event('focusin',{gamePreviewUid:c.uid});assert.match(h.inspector.innerHTML,/inspector-image/);
  assert.match(h.inspector.innerHTML,new RegExp(C.cards.find(x=>x.id===c.cardId).name));
  assert.equal(h.shell.listeners.pointerout,undefined,'sortir de la carte ne masque pas son aperçu');
  h.event('click',{gameCommand:'hand'});assert.match(h.content.innerHTML,/inspector-placeholder/);
  const before=h.inspector.innerHTML;h.event('pointerover',{gamePreviewUid:c.uid});assert.equal(h.inspector.innerHTML,before);
  h.ui.destroy();assert.equal(Object.keys(h.shell.listeners).length,0);
});

test('le geste souris pointerdown → move → up émet la véritable action payante sans mutation locale',async()=>{
  const h=harness(),c=h.card('large',0,c=>c.cost<=6);h.update();
  const allowed=T.getActions(h.state,C).find(a=>a.type==='play'&&a.sourceId===c.uid);
  const initial=JSON.stringify(h.state);h.drag(c.uid,'hunting');await settle();
  assert.equal(h.sent.length,1);assert.deepEqual(h.sent[0],allowed);assert.equal(JSON.stringify(h.state),initial);
  const next=T.dispatch(h.state,h.sent[0],C),cost=C.cards.find(x=>x.id===c.cardId).cost||0;
  assert(next.hunting.some(x=>x.uid===c.uid));assert.equal(next.players[0].rations.tapped,cost);
});

test('mauvaise zone, mauvais camp, coût insuffisant et mulligan interdisent le glisser',async()=>{
  const h=harness(),monster=h.card('large',0,c=>c.cost<=6),hunter=h.card('hunter');h.update();
  h.drag(monster.uid,'camp');h.drag(hunter.uid,'camp',1);await settle();assert.equal(h.sent.length,0);
  h.state.players[0].rations.ready=0;h.state.players[0].pool=0;
  const costly=h.card('large',0,c=>c.cost>0);h.update();
  h.drag(costly.uid,'hunting');await settle();assert.equal(h.sent.length,0);
  h.state.phase='mulligan';h.update();h.drag(hunter.uid,'camp');await settle();assert.equal(h.sent.length,0);
});

test('le remplacement de Chasseur conserve le choix de cible avant de jouer',async()=>{
  const h=harness(),hunter=h.card('hunter');
  h.state.players[0].camp=Array.from({length:5},(_,i)=>({...hunter,uid:'camp'+i}));h.update();
  h.drag(hunter.uid,'camp');assert(h.dialog.open);assert.match(h.dialog.innerHTML,/data-game-target/);assert.equal(h.sent.length,0);
  h.event('click',{gameTarget:'0'});h.event('click',{gameConfirmTargets:''});await settle();
  assert.equal(h.sent.length,1);assert.deepEqual(h.sent[0].targetIds,['camp0']);
  assert.equal(T.dispatch(h.state,h.sent[0],C).players[0].camp.length,5);
});

test('les Techniques et les Objets persistants sont déposés dans leur zone propre',async()=>{
  for(const [type,condition,zone] of [['technique',()=>true,'effect'],['item',c=>/Persistant\s*-\s*Camp/i.test(c.text),'camp']]) {
    const h=harness(),c=h.card(type,0,condition);h.update();h.drag(c.uid,zone);await settle();assert.equal(h.sent.length,1);
  }
});

test('le glisser tactile utilise la même action et conserve le choix au simple toucher',async()=>{
  const h=harness(),hunter=h.card('hunter');h.update();
  const zone=h.event('unused',{gameDrop:'camp',gamePlayer:'0'}).target;
  h.document.elementFromPoint=()=>zone;
  h.event('pointerdown',{gameUid:hunter.uid,gamePreviewUid:hunter.uid,gameDraggable:'true'},{pointerType:'touch',pointerId:7,clientX:20,clientY:20});
  h.event('pointermove',{}, {pointerType:'touch',pointerId:7,clientX:22,clientY:23});assert.equal(h.sent.length,0);
  h.event('pointermove',{}, {pointerType:'touch',pointerId:7,clientX:80,clientY:150});
  h.event('pointerup',{}, {pointerType:'touch',pointerId:7,clientX:80,clientY:150});await settle();
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].sourceId,hunter.uid);assert.equal(h.sent[0].type,'play');
});

test('le glisser HTML5 natif est désactivé pour conserver un seul geste de déplacement',async()=>{
  const h=harness(),monster=h.card('small',0,c=>c.cost<=6);h.update();
  assert.match(h.content.innerHTML,/draggable="false" data-game-draggable="true"/);
  assert.equal(h.event('dragstart',{gameUid:monster.uid,gameDraggable:'true'}).prevented,true);
  await settle();assert.equal(h.sent.length,0);
});

test('pointercancel annule toujours le geste tactile sans jouer la carte',async()=>{
  const h=harness(),hunter=h.card('hunter');h.update();
  const zone=h.event('unused',{gameDrop:'camp',gamePlayer:'0'}).target;h.document.elementFromPoint=()=>zone;
  h.event('pointerdown',{gameUid:hunter.uid,gamePreviewUid:hunter.uid,gameDraggable:'true'},{pointerType:'touch',pointerId:7,clientX:20,clientY:20});
  h.event('pointermove',{}, {pointerType:'touch',pointerId:7,clientX:80,clientY:150});
  h.event('pointercancel',{}, {pointerType:'touch',pointerId:7});
  h.event('pointerup',{}, {pointerType:'touch',pointerId:7,clientX:80,clientY:150});await settle();
  assert.equal(h.sent.length,0);
});

test('une mise à jour distante annule le glisser en cours avant la résolution',async()=>{
  const h=harness(),hunter=h.card('hunter');h.update();
  const zone=h.event('unused',{gameDrop:'camp',gamePlayer:'0'}).target;h.document.elementFromPoint=()=>zone;
  h.event('pointerdown',{gameUid:hunter.uid,gamePreviewUid:hunter.uid,gameDraggable:'true'},{pointerId:1,clientX:20,clientY:20});
  h.event('pointermove',{}, {pointerId:1,clientX:80,clientY:150});
  h.state.priorityPlayer=1;h.update();
  h.event('pointerup',{}, {pointerId:1,clientX:80,clientY:150});await settle();assert.equal(h.sent.length,0);
});

test('Échap annule le déplacement souris sans jouer à son relâchement',async()=>{
  const h=harness(),hunter=h.card('hunter');h.update();
  const zone=h.event('unused',{gameDrop:'camp',gamePlayer:'0'}).target;h.document.elementFromPoint=()=>zone;
  h.event('pointerdown',{gameUid:hunter.uid,gamePreviewUid:hunter.uid,gameDraggable:'true'},{pointerId:1,clientX:20,clientY:20});
  h.event('pointermove',{}, {pointerId:1,clientX:80,clientY:150});
  assert.equal(h.event('keydown',{}, {key:'Escape'}).prevented,true);
  h.event('pointerup',{}, {pointerId:1,clientX:80,clientY:150});await settle();assert.equal(h.sent.length,0);
});

test('le maintien près des bords défile sans jouer et la boucle s’arrête au centre ou en butée',()=>{
  const h=harness(),hunter=h.card('hunter');h.update();h.document.scrollingElement.scrollTop=300;
  h.event('pointerdown',{gameUid:hunter.uid,gamePreviewUid:hunter.uid,gameDraggable:'true'},{pointerId:1,clientX:200,clientY:300});
  h.event('pointermove',{}, {pointerId:1,clientX:200,clientY:5});assert.equal(h.frames.size,1);
  h.tick(16);assert(h.document.scrollingElement.scrollTop<300);assert.equal(h.frames.size,1);assert.equal(h.sent.length,0);
  h.event('pointermove',{}, {pointerId:1,clientX:200,clientY:400});h.tick(32);assert.equal(h.frames.size,0);
  h.document.scrollingElement.scrollTop=0;h.event('pointermove',{}, {pointerId:1,clientX:200,clientY:5});h.tick(48);assert.equal(h.frames.size,0);
  h.event('pointercancel',{}, {pointerId:1});
});

test('une zone de plateau qui déborde peut aussi défiler horizontalement pendant le geste',()=>{
  const h=harness(),hunter=h.card('hunter');h.update();h.boardScroller.scrollWidth=1200;
  h.event('pointerdown',{gameUid:hunter.uid,gamePreviewUid:hunter.uid,gameDraggable:'true'},{pointerId:1,clientX:200,clientY:300});
  h.event('pointermove',{}, {pointerId:1,clientX:595,clientY:200});h.tick(16);
  assert(h.boardScroller.scrollLeft>0);assert.equal(h.sent.length,0);h.event('pointercancel',{}, {pointerId:1});assert.equal(h.frames.size,0);
});

test('up, cancel, Échap, mise à jour et destruction ne laissent aucune animation de défilement',()=>{
  for(const finish of ['up','cancel','escape','update','destroy']) {
    const h=harness(),hunter=h.card('hunter');h.update();h.document.scrollingElement.scrollTop=300;
    h.event('pointerdown',{gameUid:hunter.uid,gamePreviewUid:hunter.uid,gameDraggable:'true'},{pointerId:1,clientX:200,clientY:300});
    h.event('pointermove',{}, {pointerId:1,clientX:200,clientY:5});h.tick(16);assert.equal(h.frames.size,1,finish);
    if(finish==='up')h.event('pointerup',{}, {pointerId:1,clientX:200,clientY:5});
    else if(finish==='cancel')h.event('pointercancel',{}, {pointerId:1});
    else if(finish==='escape')h.event('keydown',{}, {key:'Escape'});
    else if(finish==='update')h.update();
    else h.ui.destroy();
    assert.equal(h.frames.size,0,finish);const stopped=h.document.scrollingElement.scrollTop;
    h.tick(32);h.tick(48);assert.equal(h.document.scrollingElement.scrollTop,stopped,finish);assert.equal(h.sent.length,0,finish);
  }
});

test('une fenêtre de réponses annonce correctement le début, la fin ou une réponse générique',()=>{
  const h=harness();h.state.phase='response';h.state.flow='start';h.update();
  assert.match(h.content.innerHTML,/Début du tour · Réponses/);assert.match(h.content.innerHTML,/Résous les effets de début du tour/);
  h.state.flow='end';h.update();assert.match(h.content.innerHTML,/Fin du tour · Réponses/);assert.match(h.content.innerHTML,/La fin du tour est annoncée/);
  h.state.flow='main';h.update();assert.match(h.content.innerHTML,/Une fenêtre de réponse est ouverte/);
});

test('le carnet rend tous les événements conservés par le moteur',()=>{
  const h=harness();h.state.log=Array.from({length:250},(_,index)=>({text:'Événement '+index}));h.update();
  assert.equal((h.content.innerHTML.match(/class="history-entry"/g)||[]).length,250);
  assert.match(h.content.innerHTML,/Événement 0<\/p>/);assert.match(h.content.innerHTML,/Événement 249<\/p>/);
});

test('le clic sur son deck ne pioche que si le moteur fournit l’action draw légale',async()=>{
  const h=harness();h.update();h.event('click',{gameDraw:'1'});await settle();assert.equal(h.sent.length,0);
  h.event('click',{gameClose:''});h.event('click',{gameDraw:'0'});await settle();assert.equal(h.sent.length,1);assert.equal(h.sent[0].type,'draw');
  const strict=harness({mode:'auto'});strict.update([]);strict.event('click',{gameDraw:'0'});await settle();
  assert.equal(strict.sent.length,0);assert.match(strict.dialog.innerHTML,/pioche de début de tour est automatique/);
});

test('en ligne on ne peut jouer ni piocher pour le camp distant, même avec ses actions',async()=>{
  const h=harness({localPlayer:0}),own=h.card('hunter',0),enemy=h.card('hunter',1);
  h.state.priorityPlayer=1;h.state.activePlayer=1;h.update();
  h.drag(own.uid,'camp',0);h.drag(enemy.uid,'camp',1);
  h.event('click',{gameDraw:'1'});await settle();assert.equal(h.sent.length,0);
  assert(!h.content.innerHTML.includes(`data-game-preview-uid="${enemy.uid}"`));
});

test('les nouveaux contrôles et l’aperçu basculent en anglais sans traduire les pseudos',()=>{
  const h=harness(),c=h.card('hunter');h.state.players[0].name='Accueil';h.update();h.event('focusin',{gamePreviewUid:c.uid});
  h.language.setLanguage('en');assert.match(h.content.innerHTML,/Techniques and instant items/);assert.match(h.content.innerHTML,/Card inspector/);
  assert.match(h.content.innerHTML,/>Accueil<\/strong>/);assert.match(h.content.innerHTML,/assets\/cards\/en\//);
});
