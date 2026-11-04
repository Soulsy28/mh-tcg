'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../dist/match.js');
const P=require('../dist/peer.js');
const E=require('../dist/engine.js');
const T=require('../dist/table.js');
const C=require('../dist/catalog.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const intent=(text,extra={})=>({id:'chat:send',type:'chat',text,...extra});
const host=(state,engine)=>new M.HostMatch({catalog:C,engine,initialState:state});
const withoutLog=state=>{const result=clone(state);delete result.log;return result;};
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');

test('tchat : les deux moteurs acceptent les messages hors priorité et dans chaque phase sans modifier les règles',()=>{
  for(const engine of [E,T])for(const phase of ['mulligan','main','ended']){
    const initial=engine===E?E.createGame(C,{seed:39}):T.createGame(C,{seed:39});
    initial.phase=phase;if(phase==='ended')initial.winner=0;
    const before=clone(initial),match=host(initial,engine),matchBefore=match.state;
    match.apply(1,intent('Je suis prêt.',{player:0,name:'Faux auteur',turn:999,public:false}),0);
    assert.deepEqual(initial,before);assert.deepEqual(withoutLog(match.state),withoutLog(matchBefore));
    assert.equal(match.revision,1);
    const event=match.state.log.at(-1);
    assert.deepEqual(event,{kind:'chat',public:true,player:1,turn:initial.turn,text:'Je suis prêt.'});
    for(const viewer of [0,1])assert.deepEqual(match.viewFor(viewer).state.log.at(-1),{kind:'chat',player:1,turn:initial.turn,text:'Je suis prêt.'});
  }
});

test('tchat : journal commun chronologique, auteur dérivé et texte brut préservés en solo et en ligne',()=>{
  const initial=E.createGame(C,{seed:28,names:['Accueil','Silas']});
  const before=clone(initial),message='<img src=x onerror=alert(1)> Accueil · Silas';
  const solo=M.applyCommunication(initial,intent('  Bonjour\r\n'+message+'  ',{player:1,sender:{name:'PRIVATE'}}),0);
  assert.deepEqual(initial,before);assert.equal(solo.log.at(-1).text,'Bonjour\n'+message);assert.equal(solo.log.at(-1).player,0);
  const match=host(initial,E);
  match.apply(1,intent('Premier message'),0);
  match.apply(0,{id:'keep'},1);
  match.apply(0,intent(message,{player:1,sourceSnapshot:{secret:'PRIVATE'}}),2);
  const log=match.viewFor(1).state.log;
  assert.equal(log.at(-3).text,'Premier message');assert.equal(log.at(-3).player,1);
  assert.match(log.at(-2).text,/garde sa main/);assert.equal(log.at(-2).kind,undefined);
  assert.equal(log.at(-1).text,message);assert.equal(log.at(-1).player,0);
  assert(!JSON.stringify(log).includes('PRIVATE'));assert(!JSON.stringify(log).includes('sender'));
});

test('tchat : texte vide, données forgées et rejeu sont refusés atomiquement',()=>{
  const initial=E.createGame(C,{seed:7}),match=host(initial,E),before=match.state;
  const invalid=[intent(''),intent(' \n\t '),intent('a'.repeat(501)),intent('nul\0interdit'),intent(45),intent('bonjour',{id:'chat:delete'}),intent('bonjour',{type:'log'}),{id:'chat:send',type:'chat'}];
  for(const action of invalid){assert.throws(()=>match.apply(1,action,0));assert.equal(match.revision,0);assert.deepEqual(match.state,before);}
  assert.throws(()=>M.applyCommunication(initial,intent('bonjour'),2),/joueur/);
  match.apply(1,intent('💬'.repeat(250)),0);
  assert.equal(match.state.log.at(-1).text.length,500);
  const after=match.state;assert.throws(()=>match.apply(1,intent('rejeu'),0),/ancienne version/);
  assert.deepEqual(match.state,after);assert.equal(match.revision,1);
});

test('tchat : le budget de 16 Kio retire les anciens messages et préserve les événements du moteur',()=>{
  let state=E.createGame(C,{seed:8});
  state.log=[{text:'Événement de règles conservé',turn:1,public:true}];
  for(let index=0;index<80;index++)state=M.applyCommunication(state,intent(index+':'+ '界'.repeat(490)),index%2);
  assert.equal(state.log[0].text,'Événement de règles conservé');
  const chats=state.log.filter(event=>event.kind==='chat');
  assert(chats.length<80);assert(chats.length>0);assert.match(chats.at(-1).text,/^79:/);
  assert(chats.reduce((total,event)=>total+bytes(event)+1,0)<=16384);
  const view=P.redactState(state,1);
  assert(bytes(view)<65536,'Le journal ne fait pas dépasser un message RTC courant');
  assert(view.log.some(event=>event.text==='Événement de règles conservé'));
  assert(view.log.filter(event=>event.kind==='chat').reduce((total,event)=>total+bytes(event)+1,0)<=16384);
  for(let index=0;index<100;index++)state=M.applyCommunication(state,intent('court '+index),0);
  assert(state.log.length<=250);assert(state.log.filter(event=>event.kind==='chat').length<=80);
});

test('tchat : la vue publique recadre un ancien journal, retire champs privés et faux auteurs',()=>{
  const state=E.createGame(C,{seed:54}),before=clone(state);
  state.log=[{text:'SECRET-LEGACY',turn:0},{kind:'chat',public:true,player:2,text:'SECRET-FAKE-AUTHOR'},{kind:'chat',player:0,text:'SECRET-NONPUBLIC'}];
  for(let index=0;index<200;index++)state.log.push({kind:'chat',public:true,player:index%2,turn:1,text:index+':'+ '界'.repeat(490),name:'SECRET-NAME',sourceSnapshot:{secret:'SECRET-SNAPSHOT'}});
  state.log.splice(198,0,{turn:1,text:'Action conservée',public:true,privateDeck:'SECRET-DECK'});
  const saved=clone(state);
  for(const viewer of [0,1]){
    const log=P.redactState(state,viewer).log;
    assert(!JSON.stringify(log).includes('SECRET-'));assert(log.some(event=>event.text==='Action conservée'));
    assert(log.filter(event=>event.kind==='chat').reduce((total,event)=>total+bytes(event)+1,0)<=16384);
    for(const event of log)assert.deepEqual(Object.keys(event).sort(),event.kind==='chat'?['kind','player','text','turn']:['text','turn']);
  }
  assert.deepEqual(state,saved);assert.deepEqual(withoutLog(state),withoutLog(before));
});

test('tchat : six messages rapides par camp, refus sans mutation puis reprise après dix secondes',t=>{
  let now=100000;t.mock.method(Date,'now',()=>now);
  const match=host(E.createGame(C,{seed:19}),E);
  for(let index=0;index<6;index++)match.apply(0,intent('message '+index),match.revision);
  const before=match.state,revision=match.revision;
  assert.throws(()=>match.apply(0,intent('trop rapide'),revision),/Patiente/);
  assert.equal(match.revision,revision);assert.deepEqual(match.state,before);
  match.apply(1,intent('L’autre camp peut écrire.'),match.revision);
  now+=10000;match.apply(0,intent('La discussion peut reprendre.'),match.revision);
  assert.equal(match.state.log.at(-1).text,'La discussion peut reprendre.');
});
