'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../dist/match.js');
const P=require('../dist/peer.js');
const E=require('../dist/engine.js');
const T=require('../dist/table.js');
const C=require('../dist/catalog.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const arrow=(from,to,extra={})=>({id:'arrow:add',type:'annotation',sourceId:from,targetIds:[to],...extra});
const clear=()=>({id:'arrow:clear',type:'annotation'});
const host=(state=E.createScenario(C),engine=E)=>new M.HostMatch({catalog:C,engine,initialState:state});
const chiefs=state=>state.players.map(player=>'card:'+player.chief.uid);
function gameplay(state){const result=clone(state);delete result.arrows;delete result.arrowSeq;return result;}

test('une flèche hors priorité est partagée entre les vues sans changer une règle de jeu',()=>{
  for(const engine of [E,T]){
    const initial=engine===E?E.createScenario(C):T.createGame(C,{seed:41});
    const [from,to]=chiefs(initial),match=host(initial,engine),before=match.state;
    match.apply(1,arrow(from,to,{player:0,idForged:'ignored',card:{private:'ignored'}}),0);
    assert.equal(match.revision,1);assert.deepEqual(gameplay(match.state),gameplay(before));
    assert.deepEqual(initial,engine===E?E.createScenario(C):T.createGame(C,{seed:41}));
    const expected=[{id:'arrow-1',player:1,from,to}];
    assert.deepEqual(match.state.arrows,expected);
    assert.deepEqual(match.viewFor(0).state.arrows,expected);assert.deepEqual(match.viewFor(1).state.arrows,expected);
    assert(!JSON.stringify(match.viewFor(0)).includes('ignored'));
  }
});

test('ajout et nettoyage solo sont purs, dédoublonnés et limités au joueur réel',()=>{
  const state=E.createScenario(C),before=clone(state),[from,to]=chiefs(state);
  let next=M.applyAnnotation(state,arrow(from,to,{player:1}),0);
  assert.deepEqual(state,before);assert.equal(next.arrows[0].player,0);
  const duplicate=M.applyAnnotation(next,arrow(from,to),0);assert.deepEqual(duplicate,next);assert.notEqual(duplicate,next);
  next=M.applyAnnotation(next,arrow(from,to),1);assert.equal(next.arrows.length,2);
  next=M.applyAnnotation(next,clear(),0);assert.deepEqual(next.arrows.map(a=>a.player),[1]);
  assert.equal(next.priorityPlayer,state.priorityPlayer);assert.equal(next.passCount,state.passCount);
  next=M.applyAnnotation(next,clear(),1);assert.deepEqual(next.arrows,[]);
  assert.throws(()=>M.applyAnnotation(state,arrow(from,to),2),/joueur/);
});

test('main, deck, défausse, cible identique et faux nœuds sont refusés atomiquement',()=>{
  const initial=E.createScenario(C);initial.players[0].discard.push({...initial.players[0].hand[0],uid:'discard-private-test'});
  const match=host(initial),before=match.state,[from,to]=chiefs(initial);
  const hidden=[initial.players[0].hand[0].uid,initial.players[1].hand[0].uid,initial.players[0].deck[0].uid,initial.players[1].deck[0].uid,'discard-private-test'];
  const invalid=[...hidden.map(id=>arrow('card:'+id,to)),...hidden.map(id=>arrow(from,'card:'+id)),arrow(from,from),arrow('stack:pending-private',to),arrow(from,'card:unknown'),arrow(from,to,{sourceId:42}),arrow(from,to,{targetIds:'invalid'}),arrow(from,to,{targetIds:[to,from]})];
  for(const intent of invalid){assert.throws(()=>match.apply(0,intent,0));assert.equal(match.revision,0);assert.deepEqual(match.state,before);}
  assert.throws(()=>match.apply(0,{id:'arrow:delete',type:'annotation'},0),/invalide/);
  assert.throws(()=>match.apply(1,arrow(from,to),-1),/ancienne version/);
  assert.equal(match.revision,0);assert.deepEqual(match.state,before);
});

test('six flèches par joueur, identifiants attribués par l’hôte et rejeux refusés',()=>{
  const initial=E.createScenario(C),nodes=[...P.publicArrowNodes(initial)],match=host(initial);
  for(let index=1;index<=6;index++)match.apply(0,arrow(nodes[0],nodes[index],{arrowId:'forged',owner:1}),match.revision);
  assert.equal(match.state.arrows.length,6);assert.deepEqual(match.state.arrows.map(a=>a.id),['arrow-1','arrow-2','arrow-3','arrow-4','arrow-5','arrow-6']);
  const before=match.state;
  assert.throws(()=>match.apply(0,arrow(nodes[1],nodes[0]),match.revision),/six flèches/);assert.deepEqual(match.state,before);
  match.apply(1,arrow(nodes[0],nodes[1]),match.revision);assert.equal(match.state.arrows.length,7);
  assert.throws(()=>match.apply(0,clear(),5),/ancienne version/);
  match.apply(0,clear(),match.revision);assert.equal(match.state.arrows.length,1);assert.equal(match.state.arrows[0].player,1);
});

test('une sortie du terrain retire les flèches et conserve une copie publique de la capacité',()=>{
  const initial=E.createScenario(C);
  const source={...clone(initial.players[0].camp[0]),uid:'eva-arrow-source',cardId:'124',damage:0,tapped:false,counters:{},mods:[],used:{}};
  initial.players[0].camp.push(source);
  const match=host(initial),[to]=chiefs(initial);
  match.apply(1,arrow('card:'+source.uid,to),0);
  match.apply(0,{id:'ability:'+source.uid,type:'ability'},1);
  assert.deepEqual(match.state.arrows,[]);assert(match.state.players[0].hand.some(c=>c.uid===source.uid));
  const entry=match.state.stack.find(e=>e.sourceId===source.uid),guest=match.viewFor(1).state;
  assert(entry);assert.equal(guest.stack.find(e=>e.uid===entry.uid).sourceId,null);
  assert.equal(guest.stack.find(e=>e.uid===entry.uid).sourceCardId,'124');
  assert.equal(guest.stack.find(e=>e.uid===entry.uid).sourceCard.cardId,'124');
  assert(!JSON.stringify(guest).includes('"'+source.uid+'"'));assert(!JSON.stringify(guest).includes('sourceSnapshot'));
  match.apply(1,arrow('stack:'+entry.uid,to),2);assert.equal(match.state.arrows[0].from,'stack:'+entry.uid);
  // Le retour d'Eva est aussi le premier événement du nouveau Silas 202 :
  // son soin ciblé doit être annoncé et résolu avant la capacité d'Eva.
  assert.equal(match.state.pending.kind,'triggerTarget');assert.equal(match.state.pending.entry.kind,'silas');
  const choice=match.viewFor(0).actions.find(action=>action.type==='choose');
  assert(choice?.targets.length);assert(!choice.targets.some(target=>target.id===source.uid));
  match.apply(0,{id:choice.id,type:'choose',targetIds:[choice.targets[0].id]},match.revision);
  assert(!JSON.stringify(match.viewFor(1).state).includes('"'+source.uid+'"'));
  match.apply(0,{id:'pass'},match.revision);match.apply(1,{id:'pass'},match.revision);
  assert(match.state.stack.some(e=>e.uid===entry.uid),'La capacité d’Eva attend après le soin de Silas');
  assert.equal(match.state.arrows[0].from,'stack:'+entry.uid,'La flèche reste attachée à sa véritable entrée');
  match.apply(0,{id:'pass'},match.revision);match.apply(1,{id:'pass'},match.revision);
  assert(!match.state.stack.some(e=>e.uid===entry.uid));assert.deepEqual(match.state.arrows,[]);
});

test('une carte dans la pile est un nœud public puis sa disparition nettoie les liens',()=>{
  let state=E.createScenario(C);const source=state.players[0].hand.find(c=>c.cardId==='023'),target=state.players[0].camp[0];
  state=E.dispatch(state,{id:'play:'+source.uid,type:'play',targetIds:[target.uid]},C);
  const entry=state.stack.find(e=>e.card?.uid===source.uid),[to]=chiefs(state);
  assert(entry);assert(P.publicArrowNodes(state).has('stack:'+entry.uid));
  const next=M.applyAnnotation(state,arrow('stack:'+entry.uid,to),1);
  assert.equal(next.arrows.length,1);assert.equal(P.redactState(next,1).stack.find(e=>e.uid===entry.uid).card.cardId,'023');
  next.stack=[];const pruned=M.pruneAnnotations(next);assert.deepEqual(pruned.arrows,[]);assert.equal(next.arrows.length,1);
});

test('la vue publique filtre les annotations malformées et tous les champs privés',()=>{
  const state=E.createScenario(C),[from,to]=chiefs(state),before=clone(state);
  state.arrows=[
    {id:'arrow-1',player:0,from,to,privateDeck:'SECRET-ANNOTATION',sourceSnapshot:{secret:'SECRET-SNAPSHOT'}},
    {id:'arrow-2',player:1,from:'card:'+state.players[0].hand[0].uid,to},
    {id:'arrow-3',player:1,from,to:'card:'+state.players[1].deck[0].uid},
    {id:'arrow-4',player:2,from,to},
    {id:'SECRET-ID',player:0,from,to},
    {id:{private:'SECRET-ID'},player:0,from,to},
    {id:'arrow-5',player:0,from,to},
    {id:'arrow-1',player:1,from:to,to:from}
  ];
  const saved=clone(state);
  for(const viewer of [0,1]){
    const view=P.redactState(state,viewer),text=JSON.stringify(view);
    assert.deepEqual(view.arrows,[{id:'arrow-1',player:0,from,to}]);assert(!text.includes('SECRET-'));
    for(const card of [...state.players[1-viewer].hand,...state.players.flatMap(p=>p.deck)])assert(!text.includes('"'+card.uid+'"'));
  }
  assert.deepEqual(state,saved);assert.deepEqual(gameplay(state),before);
});

test('une sauvegarde ancienne sans annotations conserve les mêmes actions',()=>{
  const state=E.createScenario(C),before=clone(state),pruned=M.pruneAnnotations(state);
  assert.deepEqual(pruned.arrows,[]);assert.deepEqual(E.getActions(pruned,C),E.getActions(state,C));assert.deepEqual(gameplay(pruned),before);assert.deepEqual(state,before);
});

test('la résolution manuelle annonce seulement son entrée publique et jamais son snapshot',()=>{
  const state=E.createScenario(C);
  state.stack.push({uid:'manual-entry',kind:'ability',player:0,sourceCardId:'011',sourceId:state.hunting[0].uid,label:'Soin annoncé',sourceSnapshot:{secret:'PRIVATE-SNAPSHOT'}});
  state.pending={kind:'manual-resolution',player:0,label:'Appliquer le soin annoncé',entry:{uid:'manual-entry',sourceSnapshot:{secret:'PRIVATE-SNAPSHOT'},privateDeck:state.players[0].deck}};
  const before=clone(state);
  for(const viewer of [0,1]){
    const view=P.redactState(state,viewer);
    assert.deepEqual(view.pending,{kind:'manual-resolution',entryId:'manual-entry',player:0,label:'Appliquer le soin annoncé',private:false});
    assert.equal(view.stack.at(-1).sourceCard.cardId,'011');assert(!JSON.stringify(view).includes('PRIVATE-SNAPSHOT'));
    assert(!('entry' in view.pending));assert(!('sourceSnapshot' in view.stack.at(-1)));
  }
  state.pending.entry.uid=state.players[0].hand[0].uid;
  assert.equal(P.redactState(state,1).pending.entryId,null);
  state.pending.entry.uid='manual-entry';assert.deepEqual(state,before);
});
