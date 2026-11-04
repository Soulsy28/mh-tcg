'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const T=require('../dist/table.js');
const E=require('../dist/engine.js');
const M=require('../dist/match.js');
const C=require('../dist/catalog.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const markers=['Quête','Spirituel','Chaleur','Charge'];
const instance=(uid,cardId,player)=>({uid,cardId,owner:player,controller:player,tapped:false,damage:0,counters:{},mods:[],used:{},incarnation:0,overexerted:false});
function manual(){
  let state=T.createGame(C,{seed:36,names:['Hôte','Invité']});
  state=T.dispatch(state,T.getActions(state,C).find(action=>action.type==='keep'),C);
  state=T.dispatch(state,T.getActions(state,C).find(action=>action.type==='keep'),C);
  state.players[0].camp.push(instance('palette-hunter','014',0));
  state.players[1].items.push(instance('palette-item','186',1));
  state.hunting.push(instance('palette-monster','031',0));
  return state;
}
function action(state,type,uid,marker){return T.getActions(state,C).find(value=>value.type===type&&value.sourceId===uid&&value.marker===marker);}

test('marqueurs : quatre types sur chaque carte publique, même sans marqueur imprimé, avec cumul et retrait',()=>{
  let state=manual();const before=clone(state);
  const ids=[state.players[0].chief.uid,'palette-hunter','palette-item','palette-monster'];
  for(const uid of ids)for(const marker of markers){
    const add=action(state,'marker-add',uid,marker);assert(add,uid+' '+marker);
    state=T.dispatch(state,{...add,marker:'FORGED',amount:999},C);
    state=T.dispatch(state,action(state,'marker-add',uid,marker),C);
    const card=[...state.hunting,...state.players.flatMap(p=>[p.chief,...p.camp,...p.items])].find(c=>c.uid===uid);
    assert.equal(card.counters[marker],2);assert.equal(card.counters.FORGED,undefined);
    state=T.dispatch(state,action(state,'marker-remove',uid,marker),C);
    assert.equal([...state.hunting,...state.players.flatMap(p=>[p.chief,...p.camp,...p.items])].find(c=>c.uid===uid).counters[marker],1);
    state=T.dispatch(state,action(state,'marker-remove',uid,marker),C);
    assert(!action(state,'marker-remove',uid,marker));
  }
  assert.deepEqual(before,manual());assert.equal(state.priorityPlayer,before.priorityPlayer);
});

test('marqueurs : la limite de 99 et les droits canoniques sont vérifiés sans faire confiance au client',()=>{
  const state=manual();state.hunting[0].counters.Spirituel=98;
  const host=new M.HostMatch({catalog:C,engine:T,initialState:state});
  const add=host.viewFor(0).actions.find(a=>a.type==='marker-add'&&a.sourceId==='palette-monster'&&a.marker==='Spirituel');
  assert(add);assert.equal(add.marker,'Spirituel');
  const before=host.state;
  assert.throws(()=>host.apply(1,add,0),/pas autorisée/);assert.deepEqual(host.state,before);
  host.apply(0,{...add,marker:'Charge',amount:100000,player:1},0);
  assert.equal(host.state.hunting[0].counters.Spirituel,99);assert.equal(host.state.hunting[0].counters.Charge,undefined);
  assert(!host.viewFor(0).actions.some(a=>a.id===add.id));
  const capped=host.state;assert.throws(()=>host.apply(0,add,1),/pas autorisée/);assert.deepEqual(host.state,capped);
  assert.equal(host.viewFor(1).state.hunting[0].counters.Spirituel,99);
  assert(host.viewFor(0).state.log.at(-1).text.includes('99 marqueur(s) Spirituel'));
});

test('marqueurs : main, deck, défausse et cartes en pile restent exclus, le mode automatisé ne reçoit pas de réglage libre',()=>{
  const state=manual(),secret=state.players[0].hand[0];
  state.players[0].discard.push(instance('palette-discard','014',0));
  state.stack.push({uid:'palette-entry',kind:'cast',player:0,card:instance('palette-stack-card','014',0),cardId:'014',label:'Carte en pile'});
  const forbidden=[secret.uid,state.players[0].deck[0].uid,'palette-discard','palette-stack-card'];
  const host=new M.HostMatch({catalog:C,engine:T,initialState:state}),before=host.state;
  for(const uid of forbidden){
    assert(!T.getActions(state,C).some(a=>a.type==='marker-add'&&a.sourceId===uid));
    assert.throws(()=>host.apply(0,{id:'marker-add:'+uid+':Spirituel',type:'marker-add',sourceId:uid},0));
  }
  assert.deepEqual(host.state,before);assert.equal(host.revision,0);
  const strict=E.createScenario(C);
  assert(!E.getActions(strict,C).some(a=>['marker-add','marker-remove'].includes(a.type)));
  const strictHost=new M.HostMatch({catalog:C,engine:E,initialState:strict});
  assert.throws(()=>strictHost.apply(0,{id:'marker-add:'+strict.players[0].chief.uid+':Spirituel',type:'marker-add',sourceId:strict.players[0].chief.uid},0));
});

test('marqueurs : une résolution manuelle garde son contrôleur et les marqueurs disparaissent en quittant le terrain',()=>{
  let state=manual();state.players[0].camp[0].counters.Chaleur=2;
  const entry={uid:'marker-resolving',kind:'ability',player:1,sourceId:state.players[1].chief.uid,sourceCardId:'203',label:'Effet manuel'};
  state.stack=[entry];state.pending={kind:'manual-resolution',player:1,entry:clone(entry),label:'Résolution'};state.phase='resolving';state.priorityPlayer=1;
  state=T.dispatch(state,action(state,'marker-add','palette-hunter','Charge'),C);
  assert.equal(state.priorityPlayer,1);assert.equal(state.pending.entry.uid,entry.uid);assert.equal(state.stack.length,1);
  assert.equal(state.players[0].camp[0].counters.Charge,1);
  const back=T.getActions(state,C).find(a=>a.type==='return'&&a.sourceId==='palette-hunter');
  state=T.dispatch(state,back,C);
  const card=state.players[0].hand.find(c=>c.uid==='palette-hunter');assert(card);assert.deepEqual(card.counters,{});
  assert(!T.getActions(state,C).some(a=>a.sourceId==='palette-hunter'&&a.type==='marker-add'));
});
