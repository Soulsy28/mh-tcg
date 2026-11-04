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
  const nodes = [], queryNodes=new Map();
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
      querySelector(selector){return queryNodes.get(selector) || (selector==='.inspector-panel'?inspector:selector==='.board-scroll'?boardScroller:null);},querySelectorAll(){return [];},
      addEventListener(name,fn){this.listeners[name]=fn;}, removeEventListener(name){delete this.listeners[name];},
      showModal(){this.open=true;},close(){this.open=false;},remove(){this.removed=true;}
    };
    nodes.push(node);return node;
  }
  const inspector=element(), container=element(), boardScroller=element(), language=I.create({storage:null,document:null});
  Object.assign(boardScroller,{scrollLeft:0,scrollTop:0,scrollHeight:300,clientHeight:300,scrollWidth:600,clientWidth:600,getBoundingClientRect:()=>({left:0,right:600,top:100,bottom:400})});
  const document={listeners:{},createElement:element,elementFromPoint:()=>null,documentElement:{clientHeight:800,clientWidth:1200},scrollingElement:{scrollTop:0,scrollHeight:2400,clientHeight:800},addEventListener(name,fn){this.listeners[name]=fn;},removeEventListener(name){delete this.listeners[name];}};
  const frames=new Map();let frameId=0;
  const context={document,listeners:{},innerHeight:800,innerWidth:1200,requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:id=>frames.delete(id),MHI18n:{...language,apply(){}}};
  context.addEventListener=(name,fn)=>{context.listeners[name]=fn;};context.removeEventListener=name=>{delete context.listeners[name];};
  const tick=time=>{const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(time);};
  vm.runInNewContext(source,context);
  const sent=[];
  const ui=context.MHGameUI.create({container,catalog:C,mode:'manual',onAction:action=>sent.push(JSON.parse(JSON.stringify(action))),...options});
  const shell=container.children[0],content=shell.children[0],dialog=shell.children[1],arrows=shell.children[2];
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
  return {ui,shell,content,dialog,inspector,arrows,state,sent,event,card,update,drag,language,document,frames,tick,boardScroller,context,element,queryNodes};
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
  let next=T.dispatch(h.state,h.sent[0],C);const cost=C.cards.find(x=>x.id===c.cardId).cost||0;
  assert.equal(next.hunting.length,0,'le glisser annonce la carte et laisse répondre');
  assert.equal(next.stack.at(-1).card.uid,c.uid);assert.equal(next.players[0].rations.tapped,cost);
  for(let count=0;count<2;count++)next=T.dispatch(next,T.getActions(next,C).find(a=>a.type==='pass'),C);
  assert(next.hunting.some(x=>x.uid===c.uid));assert.equal(next.stack.length,0);
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
  for(const [type,condition,zone] of [['technique',c=>c.id==='025','effect'],['item',c=>/Persistant\s*-\s*Camp/i.test(c.text),'camp']]) {
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

test('le carnet rend tous les événements conservés par le moteur en ordre chronologique',()=>{
  const h=harness();h.state.log=Array.from({length:250},(_,index)=>({text:'Événement '+index}));h.update();
  assert.equal((h.content.innerHTML.match(/class="history-entry system-entry"/g)||[]).length,250);
  assert.match(h.content.innerHTML,/Événement 0<\/p>/);assert.match(h.content.innerHTML,/Événement 249<\/p>/);
  assert(h.content.innerHTML.indexOf('Événement 0</p>')<h.content.innerHTML.indexOf('Événement 249</p>'));
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

function fieldCard(h,type,id,player=0) {
  const card=h.card(type,player,definition=>definition.id===id);
  h.state.players[player].hand=h.state.players[player].hand.filter(c=>c!==card);
  if(['small','large'].includes(type))h.state.hunting.push(card);
  else h.state.players[player][type==='hunter'?'camp':'items'].push(card);
  return card;
}

test('la pile est LIFO, les seules copies d’effet sont grisées, et la source reste inspectable en couleur',()=>{
  const h=harness(),source=fieldCard(h,'item','022');
  h.state.stack=[{uid:'first',kind:'cast',player:1,cardId:'025',label:'Étude de terrain'},
    {uid:'last',kind:'ability',player:0,sourceId:source.uid,sourceCardId:source.cardId,label:'Effet des jumelles'}];
  h.state.phase='response';h.update([]);
  const html=h.content.innerHTML;
  assert(html.indexOf('data-game-stack="last"')<html.indexOf('data-game-stack="first"'));
  assert.match(html,/stack-card ability-copy next[^>]+data-game-stack="last"/);
  assert.match(html,/stack-card\s+[^>]+data-game-stack="first"/);
  assert.equal((html.match(/ability-copy/g)||[]).length,1);
  assert.match(html,new RegExp('class="game-card [^\"]*" data-game-uid="'+source.uid+'"'));
  h.event('pointerover',{gamePreviewUid:'stack-preview:last'});
  assert.match(h.inspector.innerHTML,/Jumelles de terrain/);
  h.state.pending={kind:'manual-resolution',entryId:'last',player:0};h.update([]);
  assert.match(h.content.innerHTML,/stack-item next resolving/);assert.match(h.content.innerHTML,/Résolution manuelle en cours/);
  h.language.setLanguage('en');assert.match(h.content.innerHTML,/Last added, first resolved|Manual resolution in progress/);
  assert.match(h.content.innerHTML,/EFFECT/);assert.match(h.content.innerHTML,/PLAYED CARD/);
});

test('F + clic demande la confirmation du coût avant de transmettre la capacité canonique sans modifier la source',async()=>{
  const h=harness(),item=fieldCard(h,'item','022');h.update();
  const allowed=T.getActions(h.state,C).find(a=>a.type==='ability'&&a.sourceId===item.uid);
  const initial=JSON.stringify(h.state);
  assert.equal(h.event('keydown',{}, {key:'f'}).prevented,true);
  assert.match(h.content.innerHTML,/F maintenu/);
  h.event('click',{gameUid:item.uid});
  assert(h.dialog.open);assert.match(h.dialog.innerHTML,/data-game-choice="0"/);assert.equal(h.sent.length,0);
  h.event('keyup',{}, {key:'f'});assert(h.dialog.open,'relâcher F ne ferme pas le choix');
  h.event('click',{gameChoice:'0'});await settle();
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].id,allowed.id);assert.equal(h.sent[0].choiceId,allowed.choices[0].id);
  assert.equal(JSON.stringify(h.state),initial,'la vue délègue paiement et pile au moteur');
  const next=T.dispatch(h.state,h.sent[0],C);assert.equal(next.stack.at(-1).sourceId,item.uid);assert(next.players[0].items.find(c=>c.uid===item.uid).tapped);
});

test('un déclenchement F + clic garde la confirmation et les cibles avant l’ajout dans la pile',async()=>{
  const h=harness(),hunter=fieldCard(h,'hunter','015');h.update();
  const allowed=T.getActions(h.state,C).find(a=>a.type==='manual-trigger'&&a.sourceId===hunter.uid);
  assert(allowed);h.event('keydown',{}, {key:'F'});h.event('click',{gameUid:hunter.uid});
  assert.match(h.dialog.innerHTML,/Confirmer que ce déclenchement/);h.event('click',{gameChoice:'0'});
  assert.match(h.dialog.innerHTML,/data-game-target="0"/);assert.equal(h.sent.length,0);
  h.event('click',{gameTarget:'0'});h.event('click',{gameConfirmTargets:''});await settle();
  assert.equal(h.sent[0].type,'manual-trigger');assert.equal(h.sent[0].choiceId,allowed.choices[0].id);assert.deepEqual(h.sent[0].targetIds,[hunter.uid]);
  assert.equal(T.dispatch(h.state,h.sent[0],C).stack.at(-1).kind,'trigger');
});

test('le choix entre deux capacités utilise leur identifiant canonique même si les actions ont changé d’ordre',async()=>{
  const h=harness(),hunter=fieldCard(h,'hunter','012');fieldCard(h,'large','001');h.update();
  const original=T.getActions(h.state,C),abilities=original.filter(a=>a.sourceId===hunter.uid&&['ability','manual-trigger'].includes(a.type));
  assert.equal(abilities.length,2);h.event('keydown',{}, {key:'f'});h.event('click',{gameUid:hunter.uid});
  assert.match(h.dialog.innerHTML,/data-game-candidate=/);assert.equal(h.sent.length,0);
  h.update([...original].reverse());h.language.setLanguage('en');assert.match(h.dialog.innerHTML,/Choose an ability/);
  h.event('click',{gameCandidate:abilities.find(a=>a.type==='manual-trigger').id});
  h.event('click',{gameChoice:'0'});await settle();
  assert.equal(h.sent[0].type,'manual-trigger');assert.equal(h.sent[0].sourceId,hunter.uid);
});

test('F ne crée pas de capacité fictive et n’autorise ni la priorité adverse ni une carte cachée',async()=>{
  const h=harness({localPlayer:0}),staticCard=fieldCard(h,'hunter','014'),item=fieldCard(h,'item','022'),enemy=h.card('hunter',1);
  h.update();h.event('keydown',{}, {key:'f'});h.event('click',{gameUid:staticCard.uid});
  // Zora possède un déclenchement légal à déclarer, mais le moteur strict ne fournit ici aucune action.
  h.event('click',{gameClose:''});h.update([]);h.event('click',{gameUid:staticCard.uid});
  assert.match(h.dialog.innerHTML,/Aucune capacité activable/);assert.equal(h.sent.length,0);
  h.event('click',{gameClose:''});h.state.priorityPlayer=1;h.update(T.getActions(h.state,C));
  h.event('click',{gameUid:item.uid});assert.match(h.dialog.innerHTML,/Aucune capacité activable/);h.event('click',{gameClose:''});
  h.event('click',{gameUid:enemy.uid});assert.equal(h.dialog.open,false);await settle();assert.equal(h.sent.length,0);
});

test('F est ignoré dans les champs et avec les raccourcis du navigateur, puis relâché au blur et à la destruction',()=>{
  const h=harness();fieldCard(h,'item','022');h.update();
  for(const extra of [{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true},{target:{tagName:'INPUT'}},{target:{isContentEditable:true}}]){
    const e={key:'f',preventDefault(){this.prevented=true;},...extra};h.document.listeners.keydown(e);
    assert(!h.content.innerHTML.includes('F maintenu'));
  }
  h.document.listeners.keydown({key:'f',preventDefault(){}});assert.match(h.content.innerHTML,/F maintenu/);
  h.context.listeners.blur();assert(!h.content.innerHTML.includes('F maintenu'));
  h.ui.destroy();assert.deepEqual(Object.keys(h.document.listeners),[]);assert.deepEqual(Object.keys(h.context.listeners),[]);
});

test('l’outil Flèche relie deux cartes publiques sans jouer, activer ou déplacer une carte',async()=>{
  const h=harness({localPlayer:0}),a=fieldCard(h,'item','022'),b=fieldCard(h,'hunter','014',1),hand=h.card('large');
  h.state.priorityPlayer=1;h.update([]);h.event('click',{gameCommand:'arrow'});
  assert.match(h.content.innerHTML,/aria-pressed="true"/);h.event('click',{gameUid:hand.uid});assert.equal(h.sent.length,0);
  h.event('click',{gameUid:a.uid,gameArrowNode:'card:'+a.uid});assert.match(h.content.innerHTML,/Choisis la carte d’arrivée/);
  h.drag(hand.uid,'hunting');assert.equal(h.sent.length,0);
  h.event('click',{gameUid:b.uid,gameArrowNode:'card:'+b.uid});await settle();
  assert.deepEqual(h.sent,[{id:'arrow:add',type:'annotation',player:0,sourceId:'card:'+a.uid,targetIds:['card:'+b.uid]}]);
  h.state.arrows=[{id:'arrow-1',player:0,from:'card:'+a.uid,to:'card:'+b.uid},{id:'arrow-2',player:1,from:'card:'+b.uid,to:'card:'+a.uid}];
  h.update([]);h.event('click',{gameCommand:'clear-arrows'});await settle();
  assert.deepEqual(h.sent.at(-1),{id:'arrow:clear',type:'annotation',player:0});
});

test('les flèches acceptent les copies publiques dans la pile et Échap annule une origine choisie',async()=>{
  const h=harness(),a=fieldCard(h,'item','022');
  h.state.stack=[{uid:'entry-1',kind:'ability',player:0,cardId:a.cardId}];h.update([]);
  h.event('click',{gameCommand:'arrow'});h.event('click',{gameUid:a.uid,gameArrowNode:'card:'+a.uid});
  h.event('keydown',{}, {key:'Escape'});h.event('click',{gameStack:'entry-1',gameArrowNode:'stack:entry-1',gamePreviewUid:'stack-preview:entry-1'});
  assert.equal(h.sent.length,0);assert.match(h.inspector.innerHTML,/Jumelles de terrain/);
  h.event('click',{gameCommand:'arrow'});h.event('click',{gameUid:a.uid,gameArrowNode:'card:'+a.uid});
  h.event('click',{gameStack:'entry-1',gameArrowNode:'stack:entry-1'});await settle();
  assert.deepEqual(h.sent[0].targetIds,['stack:entry-1']);
});

test('les flèches restent bornées au plateau et ne dessinent aucun endpoint caché ou hors défilement',()=>{
  const h=harness(),a=fieldCard(h,'item','022'),b=fieldCard(h,'hunter','014',1);
  h.shell.getBoundingClientRect=()=>({left:0,top:0,right:900,bottom:900});
  const node=(id,left,top)=>{const n=h.element('button',{gameArrowNode:id});n.getBoundingClientRect=()=>({left,top,right:left+100,bottom:top+140});return n;};
  const first=node('card:'+a.uid,100,100),second=node('card:'+b.uid,500,100),obstacle=node('private-card',300,100);
  h.content.querySelectorAll=selector=>selector==='[data-game-arrow-node]'?[first,second]:selector==='.game-card,.stack-card,.inspector-image'?[first,second,obstacle]:[];
  h.state.arrows=[{id:'visible',player:0,from:'card:'+a.uid,to:'card:'+b.uid},{id:'hidden',player:1,from:'private-card',to:'card:'+a.uid}];h.update([]);h.tick(16);
  assert.match(h.arrows.innerHTML,/data-arrow-id="visible"/);assert(!h.arrows.innerHTML.includes('data-arrow-id="hidden"'));
  assert.match(h.arrows.innerHTML,/class="game-arrow-line"[^>]+marker-end="url\(#mh-game-arrow-1-0\)"/);
  const path=h.arrows.innerHTML.match(/class="game-arrow-line" d="([^"]+)"/)[1];
  assert(!/NaN|Infinity/.test(path));
  const numbers=path.match(/-?\d+(?:\.\d+)?/g).map(Number),points=[];
  for(let index=0;index<numbers.length;index+=2)points.push({x:numbers[index],y:numbers[index+1]});
  assert(points.every(point=>point.x>=0&&point.x<=900&&point.y>=0&&point.y<=900),'la route reste dans le plateau');
  for(let index=1;index<points.length;index++) {
    const from=points[index-1],to=points[index];
    if(from.y===to.y)assert(!(from.y>100&&from.y<240&&Math.max(from.x,to.x)>300&&Math.min(from.x,to.x)<400),'le segment horizontal contourne la carte intermédiaire');
    if(from.x===to.x)assert(!(from.x>300&&from.x<400&&Math.max(from.y,to.y)>100&&Math.min(from.y,to.y)<240),'le segment vertical contourne la carte intermédiaire');
  }
  const clipping=h.element('section');clipping.getBoundingClientRect=()=>({left:0,top:150,right:900,bottom:900});
  first.closest=selector=>selector==='.board-scroll,.stack-cards,.hand-cards,.inspector-panel'?clipping:null;
  h.context.listeners.scroll();h.tick(32);assert(!h.arrows.innerHTML.includes('data-arrow-id="visible"'));
  // La carte de pile seule s’arrête à y=240, mais ses libellés continuent
  // jusqu’à y=360. Une flèche vers la carte située en dessous doit sortir
  // de l’entrée complète, sans traverser son propre nom ou sa résolution.
  const stack=node('stack:with-metadata',100,100),entry=h.element('li');
  entry.getBoundingClientRect=()=>({left:100,top:100,right:248,bottom:360});
  stack.closest=selector=>selector==='.stack-item'?entry:null;
  second.getBoundingClientRect=()=>({left:100,top:500,right:200,bottom:640});
  h.content.querySelectorAll=selector=>['[data-game-arrow-node]','.game-card,.stack-card,.inspector-image'].includes(selector)?[stack,second]:[];
  h.state.stack=[{uid:'with-metadata',kind:'ability',player:0,cardId:'022'}];
  h.state.arrows=[{id:'metadata-source',player:0,from:'stack:with-metadata',to:'card:'+b.uid},{id:'metadata-target',player:1,from:'card:'+b.uid,to:'stack:with-metadata'}];
  h.update([]);h.tick(48);
  for(const id of ['metadata-source','metadata-target']) {
    const group=h.arrows.innerHTML.match(new RegExp('data-arrow-id="'+id+'">([\\s\\S]+?)<\\/g>'))[1];
    const route=group.match(/class="game-arrow-line" d="([^"]+)"/)[1];
    const coordinates=route.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const startOrEnd=id==='metadata-source'?coordinates.slice(0,2):coordinates.slice(-2);
    const [x,y]=startOrEnd;
    assert(x<100||x>248||y<100||y>360,'le départ et la pointe sont hors de la carte ET de sa légende');
    for(let index=2;index<coordinates.length;index+=2) {
      const ax=coordinates[index-2],ay=coordinates[index-1],bx=coordinates[index],by=coordinates[index+1];
      if(ay===by)assert(!(ay>240&&ay<360&&Math.max(ax,bx)>100&&Math.min(ax,bx)<248),'le segment ne barre pas les métadonnées de pile');
      if(ax===bx)assert(!(ax>100&&ax<248&&Math.max(ay,by)>240&&Math.min(ay,by)<360),'le segment ne traverse pas les métadonnées de pile');
    }
  }
  h.ui.destroy();assert.equal(h.frames.size,0);
});

test('les deux points de chasse sont mis en évidence et la vue attend la confirmation d’une action en ligne',async()=>{
  let finish;const h=harness({localPlayer:0,onAction:()=>new Promise(resolve=>{finish=resolve;})});
  const a=fieldCard(h,'item','022'),b=fieldCard(h,'hunter','014',1);h.state.players[0].score=5;h.state.players[1].score=3;h.update([]);
  assert.match(h.content.innerHTML,/scoreboard-value">5<small> \/ 6/);assert.match(h.content.innerHTML,/scoreboard-value">3<small> \/ 6/);
  assert.match(h.content.innerHTML,/scoreboard-player active/);
  h.event('click',{gameCommand:'arrow'});h.event('click',{gameUid:a.uid,gameArrowNode:'card:'+a.uid});h.event('click',{gameUid:b.uid,gameArrowNode:'card:'+b.uid});
  assert.match(h.content.innerHTML,/arrow-tool[^>]+disabled/);assert.equal(typeof finish,'function');
  finish();await settle();assert(!/arrow-tool[^>]+disabled/.test(h.content.innerHTML));
});

test('le carnet distingue les messages des joueurs, conserve leur texte brut et mélange les événements dans le bon ordre',()=>{
  const h=harness();h.state.players[0].name='Accueil';h.state.players[1].name='<Second>';
  h.state.log=[{public:true,text:'Première action',turn:1},{public:true,kind:'chat',player:1,text:'<img src=x onerror=alert(1)> Accueil Felyne Infirmier',turn:1},{public:true,text:'Dernière action',turn:1}];h.update();h.language.setLanguage('en');
  const html=h.content.innerHTML;
  assert.match(html,/class="chat-entry [^"]*" data-chat-player="1"/);
  assert.match(html,/class="chat-name">&lt;Second&gt;<\/strong>/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt; Accueil Felyne Infirmier/);
  assert(!html.includes('<img src=x'));
  assert(html.indexOf('Première action')<html.indexOf('class="chat-message"'));
  assert(html.indexOf('class="chat-message"')<html.indexOf('Dernière action'));
  assert.match(html,/data-no-i18n/);assert.match(html,/Log &amp; chat|Log & chat/);
});

test('le tchat peut envoyer hors priorité et après la fin sans modifier l’état local ou perdre la sélection',async()=>{
  const h=harness({localPlayer:0}),source=fieldCard(h,'item','022');h.state.priorityPlayer=1;h.state.winner=1;h.update([]);
  h.event('click',{gameUid:source.uid});const before=JSON.stringify(h.state);
  h.event('input',{gameChatInput:''},{value:'unused',target:{hasAttribute:name=>name==='data-game-chat-input',value:'  Bonjour !  '}});
  h.event('submit',{gameChatForm:''});await settle();
  assert.deepEqual(h.sent,[{id:'chat:send',type:'chat',player:0,text:'Bonjour !'}]);
  assert.equal(JSON.stringify(h.state),before);assert.match(h.content.innerHTML,new RegExp('class="game-card [^"]*selected[^"]*" data-game-uid="'+source.uid+'"'));
  assert.match(h.content.innerHTML,/data-game-chat-input[^>]+value=""/);
});

test('le solo choisit l’auteur du message, et un échec ou une requête en attente conserve le brouillon',async()=>{
  let finish;const h=harness({onAction:()=>new Promise(resolve=>{finish=resolve;})});h.update();
  h.event('change',{gameChatAuthor:''},{target:{hasAttribute:name=>name==='data-game-chat-author',value:'1'}});
  const input=text=>h.event('input',{},{target:{hasAttribute:name=>name==='data-game-chat-input',value:text}});
  input('message du camp deux');h.event('submit',{gameChatForm:''});assert.equal(typeof finish,'function');assert.match(h.content.innerHTML,/chat-submit[^>]+disabled/);
  input('nouveau brouillon pendant l’envoi');h.event('submit',{gameChatForm:''});
  finish(false);await settle();assert.match(h.content.innerHTML,/value="nouveau brouillon pendant l’envoi"/);
  h.language.setLanguage('en');assert.match(h.content.innerHTML,/value="nouveau brouillon pendant l’envoi"/);
  const sent=[];const simple=harness({onAction:action=>sent.push(action)});simple.update();simple.event('change',{},{target:{hasAttribute:name=>name==='data-game-chat-author',value:'1'}});
  simple.event('input',{},{target:{hasAttribute:name=>name==='data-game-chat-input',value:' Camp deux '}});simple.event('submit',{gameChatForm:''});await settle();
  assert.equal(sent[0].player,1);assert.equal(sent[0].text,'Camp deux');
});

test('un tchat déconnecté conserve la saisie et n’émet aucune demande, même au clavier',async()=>{
  const h=harness({localPlayer:0,isConnected:()=>false});h.update();
  h.event('input',{},{target:{hasAttribute:name=>name==='data-game-chat-input',value:'Je reprends bientôt'}});h.event('submit',{gameChatForm:''});await settle();
  assert.equal(h.sent.length,0);assert.match(h.content.innerHTML,/chat-submit[^>]+disabled/);
  h.state.turn=2;h.update();assert.match(h.content.innerHTML,/value="Je reprends bientôt"/);
  h.document.listeners.keydown({key:'f',target:{tagName:'INPUT'},preventDefault(){throw Error('Le champ ne doit pas être intercepté');}});
});

test('une mise à jour conserve le focus et la sélection du brouillon ainsi que la lecture d’anciens messages',()=>{
  const h=harness();h.update();const input=h.element('input',{gameChatInput:''}),feed=h.element();
  input.selectionStart=2;input.selectionEnd=5;input.focus=()=>{h.document.activeElement=input;};input.setSelectionRange=(start,end)=>{input.range=[start,end];};
  Object.assign(feed,{scrollTop:35,scrollHeight:600,clientHeight:100});h.queryNodes.set('[data-game-chat-input]',input);h.queryNodes.set('.communication-feed',feed);h.document.activeElement=input;
  h.event('input',{},{target:{hasAttribute:name=>name==='data-game-chat-input',value:'brouillon long'}});h.state.log.push({public:true,kind:'chat',player:1,turn:1,text:'Réponse'});h.update();
  assert.deepEqual(input.range,[2,5]);assert.equal(h.document.activeElement,input);assert.equal(feed.scrollTop,35);
  assert.match(h.content.innerHTML,/value="brouillon long"/);assert.match(h.content.innerHTML,/data-game-command="feed-latest" >/);
  h.event('click',{gameCommand:'feed-latest'});assert.equal(feed.scrollTop,600);
  assert.match(h.content.innerHTML,/data-game-command="feed-latest" hidden/);
});

test('les quatre marqueurs utilisent des logos distincts avec un nombre seulement à partir de deux',()=>{
  const h=harness(),card=fieldCard(h,'hunter','014');card.counters={Spirituel:1,Chaleur:2,Charge:3,'Quête':4};h.update();
  for(const [kind,count] of Object.entries(card.counters)){
    const badge=h.content.innerHTML.match(new RegExp('class="card-counter-badge counter-'+kind+'"[^>]*>([\\s\\S]+?)<\\/span>'))[1];
    assert.match(badge,/class="counter-icon"/);assert.equal(badge.includes('<b>'),count>1);if(count>1)assert.match(badge,new RegExp('<b>'+count+'<\\/b>'));
  }
  assert.equal((h.content.innerHTML.match(/data-game-counter-kind=/g)||[]).length,4);
  h.language.setLanguage('en');assert.match(h.content.innerHTML,/Spiritual: 1/);assert.match(h.content.innerHTML,/Heat: 2/);assert.match(h.content.innerHTML,/Quest: 4/);
});

test('choisir un marqueur puis une carte publique délègue les ajouts et retraits canoniques sans mutation locale',async()=>{
  const h=harness(),card=fieldCard(h,'hunter','014');h.update();
  for(const marker of ['Spirituel','Chaleur','Charge','Quête']){
    const expected=T.getActions(h.state,C).find(action=>action.type==='marker-add'&&action.sourceId===card.uid&&action.marker===marker),before=JSON.stringify(h.state);
    h.event('click',{gameCounterKind:marker});h.event('click',{gameUid:card.uid});await settle();assert.deepEqual(h.sent.at(-1),expected);assert.equal(JSON.stringify(h.state),before);
    Object.assign(h.state,T.dispatch(h.state,h.sent.at(-1),C));h.update();
  }
  h.event('click',{gameCommand:'counter-mode'});h.event('click',{gameUid:card.uid});await settle();assert.equal(h.sent.at(-1).type,'marker-remove');assert.equal(h.sent.at(-1).marker,'Quête');
  const next=T.dispatch(h.state,h.sent.at(-1),C);assert(!next.players[0].camp.find(c=>c.uid===card.uid).counters.Quête);
});

test('le glisser de marqueur souris et tactile vérifie la cible publique puis transmet une seule action',async()=>{
  for(const pointerType of ['mouse','touch']){
    const h=harness(),card=fieldCard(h,'hunter','014'),target=h.element('button',{gameUid:card.uid});h.update();h.document.elementFromPoint=()=>target;
    h.event('pointerdown',{gameCounterKind:'Spirituel'},{pointerType,pointerId:42,clientX:10,clientY:10});
    h.event('pointermove',{}, {pointerType,pointerId:42,clientX:80,clientY:150});h.event('pointerup',{}, {pointerType,pointerId:42,clientX:80,clientY:150});await settle();
    assert.equal(h.sent.length,1);assert.equal(h.sent[0].type,'marker-add');assert.equal(h.sent[0].sourceId,card.uid);assert.equal(h.sent[0].marker,'Spirituel');assert.equal(h.frames.size,0);
  }
});

test('un marqueur ne se dépose ni dans une main, ni sans priorité, ni dans le mode automatisé',async()=>{
  for(const mode of ['hand','priority','auto']){
    const h=harness({localPlayer:0,mode:mode==='auto'?'auto':'manual'}),card=mode==='hand'?h.card('hunter'):fieldCard(h,'hunter','014');
    if(mode==='priority')h.state.priorityPlayer=1;h.update();h.document.elementFromPoint=()=>h.element('button',{gameUid:card.uid});
    h.event('pointerdown',{gameCounterKind:'Charge'},{pointerId:8,clientX:10,clientY:10});h.event('pointermove',{}, {pointerId:8,clientX:80,clientY:150});h.event('pointerup',{}, {pointerId:8,clientX:80,clientY:150});await settle();assert.equal(h.sent.length,0,mode);
  }
});

test('annuler le marqueur ou recevoir une mise à jour distante ne pose rien au relâchement',async()=>{
  for(const finish of ['cancel','escape','update','blur','destroy']){
    const h=harness(),card=fieldCard(h,'hunter','014');h.update();h.document.elementFromPoint=()=>h.element('button',{gameUid:card.uid});
    h.event('pointerdown',{gameCounterKind:'Chaleur'},{pointerId:8,clientX:10,clientY:10});h.event('pointermove',{}, {pointerId:8,clientX:80,clientY:150});
    if(finish==='cancel')h.event('pointercancel',{}, {pointerId:8});else if(finish==='escape')h.event('keydown',{}, {key:'Escape'});else if(finish==='update')h.update();else if(finish==='blur')h.context.listeners.blur();else h.ui.destroy();
    h.event('pointerup',{}, {pointerId:8,clientX:80,clientY:150});await settle();assert.equal(h.sent.length,0,finish);assert.equal(h.frames.size,0,finish);
  }
});

test('les panneaux compacts s’ouvrent et se referment sans masquer ni révéler une autre main',()=>{
  const h=harness({localPlayer:0}),enemy=h.card('hunter',1);h.update();h.event('click',{gameCommand:'panels'});assert.match(h.content.innerHTML,/arena-panel-toggle[^>]+aria-expanded="true"/);
  h.event('keydown',{}, {key:'Escape'});assert.match(h.content.innerHTML,/arena-panel-toggle[^>]+aria-expanded="false"/);
  assert(!h.content.innerHTML.includes('data-game-preview-uid="'+enemy.uid+'"'));assert.match(h.content.innerHTML,/arena-mobile-actions/);
});
