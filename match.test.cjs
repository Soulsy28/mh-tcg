'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {HostMatch}=require('../dist/match.js');
const E=require('../dist/engine.js');
const T=require('../dist/table.js');
const C=require('../dist/catalog.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const create=(state=E.createGame(C,{seed:33}),engine=E)=>new HostMatch({catalog:C,engine,initialState:state});

test('le match commence à la révision zéro et ne livre que les actions du bon joueur',()=>{
  const match=create();assert.equal(match.revision,0);assert.equal(match.engineMode,'auto');
  assert(match.viewFor(0).actions.some(a=>a.type==='keep'));
  assert.deepEqual(match.viewFor(1).actions,[]);
  assert.equal(match.viewFor(0).type,'state');assert.equal(match.viewFor(0).revision,0);
  assert.throws(()=>match.viewFor(2),/joueur/);
  assert.throws(()=>match.apply('0',{id:'keep'},0),/joueur/);
});
test('le client ne peut pas jouer à la place du joueur actif avec un pseudo-joueur forgé',()=>{
  const match=create(),before=match.state;
  assert.throws(()=>match.apply(1,{id:'keep',type:'keep',player:0},0),/pas autorisée/);
  assert.equal(match.revision,0);assert.deepEqual(match.state,before);
  match.apply(0,{id:'keep',type:'keep',player:1},0);
  assert.equal(match.revision,1);assert.equal(match.state.priorityPlayer,1);
  assert.deepEqual(match.state.mulliganDone,[true,false]);
});
test('une révision manquante, ancienne, textuelle ou future ne peut pas modifier la partie',()=>{
  const match=create();match.apply(0,{id:'keep'},0);const before=match.state;
  for(const revision of [undefined,-1,'1',0,2,NaN,1.5])assert.throws(()=>match.apply(1,{id:'keep'},revision),/ancienne version/);
  assert.equal(match.revision,1);assert.deepEqual(match.state,before);
  match.apply(1,{id:'keep'},1);assert.equal(match.revision,2);
});
test('l’action canonique ignore coût, joueur, carte et snapshot fournis par le client',()=>{
  const initial=E.createScenario(C),source=initial.players[0].hand.find(c=>c.cardId==='023'),target=initial.players[0].camp[0];let received;
  const engine={...E,dispatch(s,a,c){received=clone(a);return E.dispatch(s,a,c);}};
  const match=create(initial,engine),action=match.viewFor(0).actions.find(a=>a.id==='play:'+source.uid);
  match.apply(0,{...action,targetIds:[target.uid],cost:-999,player:1,cardId:'001',sourceSnapshot:{cardId:'secret'},forged:'ignored',effect:'win'},0);
  assert.equal(received.cost,2);assert.equal(received.player,0);assert.equal(received.sourceId,source.uid);
  assert(!('forged' in received));assert(!('effect' in received));assert(!('sourceSnapshot' in received));assert(!('cardId' in received));
  assert.equal(match.state.players[0].rations.ready,6);assert.equal(match.state.players[0].rations.tapped,2);
});
test('type, carte source et cibles forgés sont refusés atomiquement',()=>{
  const initial=E.createScenario(C),source=initial.players[0].hand.find(c=>c.cardId==='023'),target=initial.players[0].camp[0],match=create(initial);
  const action=match.viewFor(0).actions.find(a=>a.id==='play:'+source.uid),before=match.state;
  for(const intent of [
    {...action,type:'victory',targetIds:[target.uid]},
    {...action,sourceId:'uid-faux',targetIds:[target.uid]},
    {...action,targetIds:['uid-faux']},
    {...action,targetIds:'not-array'},
    {...action,targetIds:Array(21).fill(target.uid)},
    {...action,targetIds:[]},
    {...action,targetIds:[42]}
  ])assert.throws(()=>match.apply(0,intent,0));
  assert.equal(match.revision,0);assert.deepEqual(match.state,before);
});
test('une erreur de moteur même après mutation locale ne modifie pas le match',()=>{
  const engine={...E,dispatch(state){state.players[0].score=99;state.players[1].hand=[];throw Error('Erreur de test après mutation.');}};
  const match=create(undefined,engine),before=match.state;
  assert.throws(()=>match.apply(0,{id:'keep'},0),/après mutation/);
  assert.deepEqual(match.state,before);assert.equal(match.revision,0);
});
test('les objets externes ne donnent pas de référence modifiable à l’état autoritaire',()=>{
  const state=E.createGame(C,{seed:123}),match=create(state),before=match.state;
  state.players[0].score=88;
  const external=match.state;external.players[0].score=99;external.players[0].deck=[];
  const view=match.viewFor(0);view.state.players[0].score=100;view.actions[0].player=1;
  assert.deepEqual(match.state,before);assert.equal(match.revision,0);
});
test('les deux vues cachent decks, main adverse, seed, snapshots et journaux privés',()=>{
  const initial=E.createScenario(C);initial.log.push({text:'Le deck contient SECRET-DECK-CARD',turn:5});
  initial.pending={id:'private-decision',kind:'discard',player:0,label:'Choix privé hôte',targets:initial.players[0].hand.map(c=>({id:c.uid,label:C.cards.find(d=>d.id===c.cardId).name})),targetCount:1,targetMin:1,entry:{sourceSnapshot:{secret:'SECRET-DECK-CARD'}}};
  const match=create(initial);
  for(const player of [0,1]){
    const packet=match.viewFor(player),text=JSON.stringify(packet);
    assert(packet.state.players.every(p=>p.deck.every(c=>c.hidden&&c.uid===null&&!c.cardId)));
    assert(packet.state.players[1-player].hand.every(c=>c.hidden&&c.uid===null&&!c.cardId));
    assert(packet.state.players[player].hand.every(c=>c.cardId));
    assert(!('seed' in packet.state));assert(!('seq' in packet.state));assert(!('triggers' in packet.state));assert(!('decisions' in packet.state));
    assert(!text.includes('SECRET-DECK-CARD'));
    for(const hidden of initial.players[1-player].hand)assert(!text.includes('"'+hidden.uid+'"'));
    for(const hidden of initial.players.flatMap(p=>p.deck))assert(!text.includes('"'+hidden.uid+'"'));
  }
  assert(match.viewFor(0).actions[0].targets.some(t=>t.id===initial.players[0].hand[0].uid));
  assert.deepEqual(match.viewFor(1).actions,[]);
  assert.equal(match.viewFor(1).state.pending.label,'L’adversaire effectue un choix.');
});
test('les modèles exposés ne contiennent que les champs autorisés, sans coût ni snapshot',()=>{
  const base=E.createScenario(C),engine={...E,getActions(state,catalog){return E.getActions(state,catalog).map(a=>({...a,cost:99,sourceSnapshot:{secret:'PRIVATE'},privateDeck:state.players[1].deck}));}};
  const match=create(base,engine),allowed=new Set(['id','type','label','player','sourceId','targetCount','targetMin','targets','choices','description']);
  const actions=match.viewFor(0).actions;
  assert(actions.length>0);
  for(const action of actions)for(const key of Object.keys(action))assert(allowed.has(key),key);
  assert(!JSON.stringify(actions).includes('PRIVATE'));
});
test('une action qui révèle un uid de main adverse ou de deck n’est pas exposée ni applicable',()=>{
  const initial=E.createGame(C,{seed:123});
  for(const hidden of [initial.players[1].hand[0],initial.players[0].deck[0]]){
    const custom={...E,getActions(){return [{id:'private-action',type:'choose',player:0,label:'Choix',targetCount:1,targets:[{id:hidden.uid,label:'PRIVATE-NAME'}]}];}};
    const match=create(initial,custom),before=match.state;
    assert.deepEqual(match.viewFor(0).actions,[]);
    assert.throws(()=>match.apply(0,{id:'private-action',type:'choose',targetIds:[hidden.uid]},0),/visible/);
    assert.deepEqual(match.state,before);assert.equal(match.revision,0);
  }
});
test('les statistiques et les événements explicitement publics sont transmis sans journaux privés',()=>{
  const initial=E.createScenario(C);initial.log.push({turn:5,text:'SECRET-ANCIEN-JOURNAL'});
  initial.log.push({turn:5,text:'Événement public.',public:true,sourceSnapshot:{secret:'SECRET-METADATA'}});
  const match=create(initial),packet=match.viewFor(0),card=packet.state.players[0].camp[0];
  assert.equal(card.computedStats.force,3);assert.equal(card.computedStats.remainingHp,6);
  assert(packet.state.log.some(event=>event.text==='Événement public.'));
  match.apply(0,{id:'endturn',type:'endturn'},0);
  const log=match.viewFor(1).state.log;
  assert(log.some(event=>/Fin de tour annoncée/.test(event.text)));
  assert(log.every(event=>Object.keys(event).sort().join(',')==='text,turn'));
  assert(!JSON.stringify(log).includes('SECRET-'));
});
test('la table libre utilise les mêmes contrôles et transmet ses choix canoniques',()=>{
  const initial=T.createGame(C,{seed:5}),match=create(initial,T);
  assert.equal(match.engineMode,'manual');assert.equal(match.viewFor(0).engineMode,'manual');
  match.apply(0,{id:'keep'},0);match.apply(1,{id:'keep'},1);
  const me=match.state.priorityPlayer,action=match.viewFor(me).actions.find(a=>a.id==='ration-add');
  assert(action && action.choices.length===2);
  const before=match.state;
  assert.throws(()=>match.apply(me,{...action,choiceId:'win'},2),/options/);assert.deepEqual(match.state,before);
  match.apply(me,{...action,choiceId:'tapped',player:1-me,cost:-99},2);
  assert.equal(match.revision,3);assert.equal(match.state.players[me].rations.tapped,1);
});

test('la pioche de table libre reste canonique, privée et protégée contre le rejeu',()=>{
  const initial=T.createGame(C,{seed:5,names:['Hôte','Invité']}),match=create(initial,T);
  match.apply(0,{id:'keep'},0);match.apply(1,{id:'keep'},1);
  match.apply(0,{id:'pass'},2);
  const action=match.viewFor(1).actions.find(a=>a.type==='draw');
  assert(action);assert.deepEqual(match.viewFor(0).actions,[]);
  const before=match.state,drawn=before.players[1].deck[0];
  assert.throws(()=>match.apply(0,{...action,player:1},3),/pas autorisée/);
  assert.throws(()=>match.apply(1,{...action,targetIds:[before.players[0].hand[0].uid]},3),/cibles/);
  assert.deepEqual(match.state,before);assert.equal(match.revision,3);
  match.apply(1,{...action,player:0,amount:50,targetPlayer:0,cost:-99,state:{winner:1}},3);
  const after=match.state;
  assert.equal(after.players[1].deck.length,before.players[1].deck.length-1);
  assert.equal(after.players[1].hand.length,before.players[1].hand.length+1);
  assert.deepEqual(after.players[0],before.players[0]);
  assert.equal(after.winner,null);assert.equal(match.revision,4);
  assert.throws(()=>match.apply(1,action,3),/ancienne version/);
  assert.deepEqual(match.state,after);assert.equal(match.revision,4);
  const host=match.viewFor(0),guest=match.viewFor(1);
  assert(host.state.players[1].hand.every(card=>card.hidden&&!card.cardId&&card.uid===null));
  assert(!JSON.stringify(host).includes('"'+drawn.uid+'"'));
  assert(guest.state.players[1].hand.some(card=>card.uid===drawn.uid));
  const event=host.state.log.findLast(entry=>/Invité.*pioche/.test(entry.text));
  assert(event);assert.match(event.text,/1 carte/);
  assert(!event.text.includes(drawn.uid));assert(!event.text.includes(T.getCard(C,drawn.cardId).name));
});

test('le protocole ne crée pas de pioche gratuite dans le moteur automatisé',()=>{
  const match=create(E.createScenario(C)),before=match.state;
  assert(!match.viewFor(0).actions.some(action=>action.type==='draw'));
  assert.throws(()=>match.apply(0,{id:'draw',type:'draw',player:0},0),/pas autorisée/);
  assert.equal(match.revision,0);assert.deepEqual(match.state,before);
});

test('les options ne peuvent pas exposer ni sélectionner un uid de carte cachée',()=>{
  const initial=E.createGame(C,{seed:123});
  for(const hidden of [initial.players[1].hand[0],initial.players[0].deck[0]]){
    const custom={...E,getActions(){return [{id:'private-choice',type:'choose',player:0,label:'Choix',choices:[{id:hidden.uid,label:'PRIVATE-NAME'}]}];}};
    const match=create(initial,custom),before=match.state;
    assert.deepEqual(match.viewFor(0).actions,[]);
    assert.throws(()=>match.apply(0,{id:'private-choice',type:'choose',choiceId:hidden.uid},0),/visible/);
    assert.equal(match.revision,0);assert.deepEqual(match.state,before);
  }
});
