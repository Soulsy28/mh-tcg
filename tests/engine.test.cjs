const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');
const C = require('../dist/catalog.js');

function keep(s) { s=E.dispatch(s,{id:'keep'},C);return E.dispatch(s,{id:'keep'},C); }
function act(s,type,sourceId,targetIds=[],choiceId) {
  const a=E.getActions(s,C).find(a=>a.type===type&&(!sourceId||a.sourceId===sourceId));
  assert.ok(a,'Action '+type+' '+(sourceId||'')+' disponible');
  return E.dispatch(s,{...a,targetIds,choiceId},C);
}
function pass(s) { return act(s,'pass'); }
function auto(s,max=120) {
  for(let i=0;i<max&&s.winner===null;i++){
    if(s.phase==='main'&&!s.pending&&!s.stack.length&&!s.combat)return s;
    const as=E.getActions(s,C);let a=as.find(a=>a.type==='skip')||as.find(a=>a.type==='choose')||as.find(a=>a.type==='pass');
    assert.ok(a,'Une résolution possède une action de continuation');
    if(a.type==='choose')a={...a,targetIds:(a.targets||[]).slice(0,a.targetMin||0).map(t=>t.id),choiceId:a.choices?.[0]?.id};
    s=E.dispatch(s,a,C);
  }
  assert.ok(s.winner!==null||s.phase==='main','Résolution finie sans boucle');return s;
}
function base() {
  const s=keep(E.createGame(C,{seed:123}));
  s.hunting=[];s.stack=[];s.pending=null;s.triggers=[];s.decisions=[];s.combat=null;s.flow='main';s.phase='main';
  for(const p of s.players){p.hand=[];p.camp=[];p.items=[];p.discard=[];p.rations={ready:10,tapped:0,deck:2};}
  return s;
}
function add(s,id,p,zone='hand',extra={}) {
  const c={uid:'t'+(++s.seq),cardId:id,owner:p,controller:p,incarnation:0,tapped:false,damage:0,counters:{},mods:[],used:{},overexerted:false,...extra};
  if(zone==='hunting')s.hunting.push(c);else s.players[p][zone].push(c);return c;
}

test('les deux decks de départ sont légaux et ne contiennent aucune carte non automatisée',()=>{
  for(const d of E.STARTER_DECKS){assert.equal(d.cards.length,50);assert.equal(new Set(d.cards).size,17);assert.deepEqual(E.validateDeck(d,C).errors,[]);}
});
test('les limites de taille, exemplaires, couleurs et prise en charge sont vérifiées',()=>{
  const d=structuredClone(E.STARTER_DECKS[0]);d.cards.pop();assert.equal(E.validateDeck(d,C).valid,false);
  d.cards.push('001');assert.equal(E.validateDeck(d,C).valid,false);
  d.cards[0]='078';assert.equal(E.validateDeck(d,C).valid,false);
  assert.equal(E.supports('002'),false);
});
test('mise en place : cinq cartes, puis une ration et une pioche au premier tour',()=>{
  let s=E.createGame(C,{seed:7});assert.equal(s.players[0].hand.length,5);assert.equal(s.players[1].hand.length,5);
  s=keep(s);assert.equal(s.turn,1);assert.equal(s.players[0].hand.length,6);assert.deepEqual(s.players[0].rations,{ready:1,tapped:0,deck:11});assert.equal(s.players[1].rations.ready,0);
});
test('mulligan : nouvelle main disjointe, une seule fois par joueur',()=>{
  let s=E.createGame(C,{seed:9});const ids=s.players[0].hand.map(c=>c.uid);
  s=act(s,'mulligan');assert.equal(s.players[0].mulliganUsed,true);assert.equal(s.players[0].hand.length,5);assert.ok(s.players[0].hand.every(c=>!ids.includes(c.uid)));
  assert.equal(s.priorityPlayer,1);s=act(s,'mulligan');assert.equal(s.players[0].mulliganUsed,true);assert.equal(s.players[1].mulliganUsed,true);assert.ok(!E.getActions(s,C).some(a=>a.type==='mulligan'));
});
test('fin de tour : le passage actif laisse le joueur non actif répondre',()=>{
  let s=base();s=act(s,'endturn');assert.equal(s.priorityPlayer,0);s=pass(s);assert.equal(s.priorityPlayer,1);assert.equal(s.turn,1);s=pass(s);assert.equal(s.turn,2);assert.equal(s.activePlayer,1);assert.equal(s.players[1].rations.ready,11);
});
test('le Chef ne possède aucune attaque ni Force',()=>{
  const s=base();assert.equal(E.stats(s,s.players[0].chief.uid,C).force,null);assert.ok(!E.getActions(s,C).some(a=>a.type==='attack'&&a.sourceId===s.players[0].chief.uid));
});
test('annoncer une carte paie son coût avant sa résolution',()=>{
  let s=base();const c=add(s,'008',0);const before=JSON.stringify(s);s=act(s,'play',c.uid);assert.equal(s.players[0].rations.ready,7);assert.equal(s.stack.length,1);assert.equal(s.hunting.length,0);assert.notEqual(JSON.stringify(s),before);s=auto(s);assert.equal(s.hunting.length,1);assert.equal(s.hunting[0].tapped,true);assert.deepEqual(s.players[0].rations,{ready:7,tapped:4,deck:1});
});
test('une cible requise absente interdit l’annonce sans paiement',()=>{
  const s=base();add(s,'018',0);const before=JSON.stringify(s);assert.ok(!E.getActions(s,C).some(a=>a.type==='play'));assert.equal(JSON.stringify(s),before);
});
test('un Monstre d’arrivée sans cible de capacité peut arriver normalement',()=>{
  let s=base();const c=add(s,'114',0);s=auto(act(s,'play',c.uid));assert.ok(s.hunting.some(x=>x.uid===c.uid));assert.equal(s.pending,null);
});
test('pile LIFO : contre sans remboursement et effet plus ancien conservé',()=>{
  let s=base();const a=add(s,'014',0,'camp'),b=add(s,'042',1,'camp');const leap=add(s,'023',0),block=add(s,'055',1),storm=add(s,'140',0);
  s=act(s,'play',leap.uid,[a.uid]);s=pass(s);s=act(s,'play',block.uid,[b.uid]);const blockEntry=s.stack.at(-1).uid;s=act(s,'play',storm.uid,[blockEntry]);
  assert.equal(s.stack.length,3);s=pass(pass(s));assert.equal(s.stack.length,1);assert.equal(s.players[1].rations.ready,9);assert.ok(s.players[1].discard.some(c=>c.uid===block.uid));s=auto(s);assert.equal(E.stats(s,a.uid,C).force,4);assert.equal(E.stats(s,b.uid,C).armor,0);
});
test('une seule Interposition est possible et peut rediriger vers son propre Monstre',()=>{
  let s=base();const a=add(s,'014',0,'camp'),m=add(s,'031',1,'hunting'),i=add(s,'010',0,'hunting');add(s,'010',1,'hunting');
  s=act(s,'attack',a.uid,[m.uid]);s=act(s,'interpose',i.uid);assert.equal(s.combat.targetId,i.uid);assert.equal(s.combat.interpositionUsed,true);assert.ok(!E.getActions(s,C).some(a=>a.type==='interpose'));
});
test('Provocation contraint les cibles ennemies mais laisse attaquer ses propres Monstres',()=>{
  const s=base();const a=add(s,'014',0,'camp'),own=add(s,'008',0,'hunting'),boss=add(s,'118',1,'hunting');add(s,'031',1,'hunting');
  const attack=E.getActions(s,C).find(x=>x.type==='attack'&&x.sourceId===a.uid);assert.deepEqual(attack.targets.map(t=>t.id).sort(),[own.uid,boss.uid].sort());
});
test('blessures de combat simultanées : le Chasseur mort marque encore son point',()=>{
  let s=base();const a=add(s,'014',0,'camp',{damage:5}),m=add(s,'031',1,'hunting',{damage:2});
  s=auto(act(s,'attack',a.uid,[m.uid]));assert.ok(s.players[0].discard.some(c=>c.uid===a.uid));assert.ok(s.players[1].discard.some(c=>c.uid===m.uid));assert.equal(s.players[0].score,1);
});
test('Cuirasse réduit les blessures de combat jusqu’à 1, sans créer de blessure à Force 0',()=>{
  let s=base();const a=add(s,'014',0,'camp',{mods:[{kind:'setForce',value:0,duration:'turn'}]}),m=add(s,'031',1,'hunting',{mods:[{kind:'armor',value:99,duration:'turn'}]});
  s=auto(act(s,'attack',a.uid,[m.uid]));assert.equal(s.hunting.find(c=>c.uid===m.uid).damage,0);
  let z=base();const aa=add(z,'014',0,'camp'),mm=add(z,'031',1,'hunting',{mods:[{kind:'armor',value:99,duration:'turn'}]});z=auto(act(z,'attack',aa.uid,[mm.uid]));assert.equal(z.hunting.find(c=>c.uid===mm.uid).damage,1);
});
test('Cuirasse ne réduit pas une blessure d’effet',()=>{
  let s=base();const gun=add(s,'045',0,'camp'),m=add(s,'031',1,'hunting',{mods:[{kind:'armor',value:99,duration:'turn'}]});s=auto(act(s,'ability',gun.uid,[m.uid]));assert.equal(s.hunting.find(c=>c.uid===m.uid).damage,1);
});
test('le calcul de Force conserve tous les bonus et malus avant le plancher 0',()=>{
  const s=base();const a=add(s,'013',0,'camp',{mods:[{kind:'force',value:-3},{kind:'force',value:2}]});assert.equal(E.stats(s,a.uid,C).force,1);a.mods.push({kind:'setForce',value:0});assert.equal(E.stats(s,a.uid,C).force,0);a.mods=[{kind:'setForce',value:0},{kind:'force',value:2}];assert.equal(E.stats(s,a.uid,C).force,2);
});
test('un sixième Chasseur remplace sans déclencher une mort',()=>{
  let s=base();for(let i=0;i<5;i++)add(s,'014',0,'camp');const replacement=add(s,'013',0);s=act(s,'play',replacement.uid);s=pass(pass(s));assert.equal(s.pending.kind,'replace');const replaced=s.pending.targets[0].id;s=act(s,'choose',null,[replaced]);assert.equal(s.players[0].camp.length,5);assert.ok(s.players[0].discard.some(c=>c.uid===replaced));assert.ok(!s.log.some(x=>x.text.includes('meurt')));
});
test('le sixième point termine la partie',()=>{
  let s=base();s.players[0].score=5;const a=add(s,'014',0,'camp'),m=add(s,'031',1,'hunting',{damage:2});s=auto(act(s,'attack',a.uid,[m.uid]));assert.equal(s.winner,0);assert.equal(s.phase,'ended');assert.deepEqual(E.getActions(s,C),[]);
});
test('Lao-Shan Lung gagne par retrait du dernier marqueur au début du tour',()=>{
  let s=base();const lao=add(s,'001',0,'hunting',{counters:{Quête:1}});s=auto(act(s,'endturn'));assert.equal(s.activePlayer,1);s=auto(act(s,'endturn'));assert.equal(s.winner,0);assert.equal(s.hunting.find(c=>c.uid===lao.uid).counters.Quête,0);
});
test('une pioche impossible fait perdre immédiatement ; les rations vides sont sans défaite',()=>{
  let s=base();s.players[1].deck=[];s.players[1].rations={ready:12,tapped:0,deck:0};s=auto(act(s,'endturn'));assert.equal(s.winner,0);
  let t=base();t.players[1].rations={ready:12,tapped:0,deck:0};t=auto(act(t,'endturn'));assert.equal(t.winner,null);assert.equal(t.players[1].rations.ready,12);
});
test('sauvegarde sérialisée et reprise donnent exactement les mêmes actions/résultats',()=>{
  let s=E.createScenario(C);const saved=JSON.parse(JSON.stringify(s));assert.deepEqual(E.getActions(s,C),E.getActions(saved,C));const a=E.getActions(s,C).find(a=>a.type==='endturn');assert.deepEqual(E.dispatch(s,a,C),E.dispatch(saved,a,C));
});
test('une partie complète jouée avec les seules actions légales peut se terminer',()=>{
  let s=keep(E.createGame(C,{seed:101}));let steps=0;
  while(s.winner===null&&steps++<8000){
    const actions=E.getActions(s,C);assert.ok(actions.length);
    let a=actions.find(a=>a.type==='skip')||actions.find(a=>a.type==='choose')||actions.find(a=>a.type==='pass')||actions.find(a=>a.type==='endturn');
    if(a.type==='choose')a={...a,targetIds:(a.targets||[]).slice(0,a.targetMin||0).map(t=>t.id),choiceId:a.choices?.[0]?.id};
    s=E.dispatch(s,a,C);
  }
  assert.ok(s.winner!==null);assert.ok(steps<8000);
});
