'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Table = require('../dist/table.js');
const Catalog = require('../dist/catalog.js');
const Auto = require('../dist/engine.js');
const act = (s, id, extra = {}) => {
  const action = Table.getActions(s, Catalog).find(a => a.id === id);
  assert.ok(action, 'Action absente : ' + id);
  return Table.dispatch(s, { ...action, ...extra }, Catalog);
};
function started() { let s = Table.createGame(Catalog, { seed: 72, decks: Auto.STARTER_DECKS }); s = act(s, 'keep'); s = act(s, 'keep'); return act(s, 'continue'); }
function put(s, id, player, zone, tapped = false, damage = 0) {
  for (const p of s.players) for (const key of ['hand', 'deck', 'discard']) { const i = p[key].findIndex(c => c.cardId === id); if (i >= 0) { const card = p[key].splice(i, 1)[0];card.owner = player;card.controller = player;card.tapped=tapped;card.damage=damage;if(zone==='hunting')s.hunting.push(card);else s.players[player][zone].push(card);return card; } }
  const c={uid:'test-'+(++s.seq),cardId:id,owner:player,controller:player,tapped,damage,counters:{},mods:[],used:{}};if(zone==='hunting')s.hunting.push(c);else s.players[player][zone].push(c);return c;
}
test('table libre accepte tout le catalogue actuel avec validation des decks',()=>{
  const current=Auto.STARTER_DECKS.map(d=>structuredClone(d));
  current[0].cards=current[0].cards.map(id=>id==='001'?'003':id);
  assert.equal(Table.validateDeck(current[0],Catalog).valid,true);
  assert.equal(Table.createGame(Catalog,{decks:current}).mode,'manual');
  const invalid=structuredClone(current[0]);invalid.cards[0]='197';assert.equal(Table.validateDeck(invalid,Catalog).valid,false);
  assert.equal(Table.validateDeck({...current[0],cards:current[0].cards.slice(1)},Catalog).valid,false);
  const tooMany=structuredClone(current[0]);tooMany.cards[0]=tooMany.cards[10];assert.ok(Table.validateDeck(tooMany,Catalog).errors.some(x=>x.includes('3 exemplaires')));
});
test('couleurs et identifiants canoniques : impossible de contourner 3 exemplaires',()=>{
  const deck=structuredClone(Auto.STARTER_DECKS[0]);deck.cards[0]='3';deck.cards[1]='003';deck.cards[2]='MhFG-003';deck.cards[3]='003';
  assert.ok(Table.validateDeck(deck,Catalog).errors.some(x=>x.includes('3 exemplaires')));
  deck.cards[3]='085';assert.ok(Table.validateDeck(deck,Catalog).errors.some(x=>x.includes('couleurs')));
});
test('mise en place, mulligan disjoint et début de tour manuel avant ration et pioche',()=>{
  let s=Table.createGame(Catalog,{seed:89,decks:Auto.STARTER_DECKS});const first=s.players[0].hand.map(c=>c.uid);
  s=act(s,'mulligan');assert.equal(s.players[0].mulliganUsed,true);assert.ok(s.players[0].hand.every(c=>!first.includes(c.uid)));
  s=act(s,'keep');assert.equal(s.phase,'start');assert.equal(s.players[0].rations.ready,0);assert.equal(s.players[0].hand.length,5);
  s=act(s,'continue');assert.equal(s.phase,'main');assert.equal(s.players[0].hand.length,6);assert.deepEqual(s.players[0].rations,{ready:1,tapped:0,deck:11});
  assert.ok(s.notice.includes('manuellement'));assert.equal(s.stack.length,0);
});
test('rations physiques conservées à 12 pendant ajout, paiement, Manger et tours',()=>{
  let s=started();s=act(s,'ration-add',{choiceId:'tapped'});s=act(s,'ration-tap');s=act(s,'eat',{choiceId:'tapped'});
  s=act(s,'ration-untap');for(const p of s.players)assert.equal(Object.values(p.rations).reduce((a,b)=>a+b,0),12);
  s=act(s,'endturn');assert.equal(s.phase,'start');s=act(s,'continue');for(const p of s.players)assert.equal(Object.values(p.rations).reduce((a,b)=>a+b,0),12);
});
test('chef sans Force ni attaque et commandes privées limitées à la priorité',()=>{
  const s=started(),actions=Table.getActions(s,Catalog),chief=s.players[0].chief;
  assert.equal(Table.stats(s,chief.uid,Catalog).force,null);assert.ok(!actions.some(a=>a.sourceId===chief.uid&&a.type==='attack'));
  assert.ok(!actions.some(a=>s.players[1].hand.some(c=>c.uid===a.sourceId)));
  const pass=actions.find(a=>a.type==='pass');assert.throws(()=>Table.dispatch(s,{...pass,player:1},Catalog),/pas autorisée/);
});
test('créatures et Objets persistants arrivent dans leur zone correcte',()=>{
  let s=started();const creature=put(s,'003',0,'hand'),item=put(s,'103',0,'hand'),tech=put(s,'023',0,'hand');
  s.players[0].pool=30;s=act(s,'play:'+creature.uid);assert.ok(s.hunting.find(c=>c.uid===creature.uid)?.tapped);
  s=act(s,'play:'+item.uid);assert.equal(s.hunting.find(c=>c.uid===item.uid)?.tapped,false);
  s=act(s,'play:'+tech.uid);assert.ok(s.players[0].discard.some(c=>c.uid===tech.uid));assert.equal(s.stack.length,0);
  assert.ok(s.log.at(-1).text.includes('manuellement'));
});
test('sixième Chasseur demande une cible de remplacement ; aucun point ni mort',()=>{
  let s=started();for(let i=0;i<5;i++)put(s,'014',0,'camp');const incoming=put(s,'015',0,'hand');
  const action=Table.getActions(s,Catalog).find(a=>a.id==='place:'+incoming.uid);assert.equal(action.targetCount,1);
  assert.throws(()=>Table.dispatch(s,{...action,targetIds:['fake']},Catalog),/cibles légales/);
  const replaced=s.players[0].camp[0];s=Table.dispatch(s,{...action,targetIds:[replaced.uid]},Catalog);
  assert.equal(s.players[0].camp.length,5);assert.ok(s.players[0].discard.some(c=>c.uid===replaced.uid));assert.equal(s.players[0].score,0);
  assert.ok(s.log.some(e=>e.text.includes('sans mourir')));
});
test('combat de base : blessures simultanées, point au Chasseur même mort',()=>{
  let s=started();const hunter=put(s,'014',0,'camp',false,5),monster=put(s,'031',1,'hunting',false,2);
  s=act(s,'attack:'+hunter.uid,{targetIds:[monster.uid]});for(let i=0;i<4;i++)s=act(s,'pass');
  assert.equal(s.combat,null);assert.ok(s.players[0].discard.some(c=>c.uid===hunter.uid));assert.ok(s.players[1].discard.some(c=>c.uid===monster.uid));assert.equal(s.players[0].score,1);assert.equal(s.players[1].score,0);
});
test('Interposition une fois par attaque et retour en main interrompant le combat',()=>{
  let s=started();const hunter=put(s,'014',0,'camp'),target=put(s,'031',1,'hunting'),interposer=put(s,'010',1,'hunting');
  s=act(s,'attack:'+hunter.uid,{targetIds:[target.uid]});s=act(s,'pass');s=act(s,'interpose:'+interposer.uid);
  assert.equal(s.combat.targetId,interposer.uid);assert.ok(!Table.getActions(s,Catalog).some(a=>a.type==='interpose'));
  s=act(s,'return:'+interposer.uid);assert.equal(s.combat,null);assert.equal(s.phase,'main');assert.equal(hunter.damage,0);
});
test('ajustements manuels sur carte publique et disparition des bonus en fin de tour',()=>{
  let s=started();const monster=put(s,'003',1,'hunting');const before=structuredClone(s);
  s=act(s,'force-down:'+monster.uid);assert.equal(Table.stats(s,monster.uid,Catalog).force,1);assert.deepEqual(before.hunting[0].mods,[]);
  s=act(s,'marker-up:'+monster.uid);assert.equal(s.hunting[0].counters.Manuel,1);
  s=act(s,'endturn');assert.equal(Table.stats(s,monster.uid,Catalog).force,2);
});
test('jetons arrivent dégagés et disparaissent au changement de zone',()=>{
  let s=started();s=act(s,'token',{choiceId:'token-minerai'});const token=s.players[0].items[0];assert.equal(token.tapped,false);
  s=act(s,'sacrifice:'+token.uid);assert.equal(s.players[0].items.length,0);assert.ok(!s.players.flatMap(p=>[...p.hand,...p.discard,...p.deck]).some(c=>c.uid===token.uid));
});
test('pioche impossible perd immédiatement, et les points gagnants terminent la table',()=>{
  let s=started();s.players[0].deck=[];s=act(s,'draw');assert.equal(s.winner,1);assert.deepEqual(Table.getActions(s,Catalog),[]);
  s=started();s.players[0].score=5;s=act(s,'score-up',{choiceId:'0'});assert.equal(s.winner,0);
});
test('sauvegarde JSON conservant la même suite d’actions et aucun texte adverse caché dans ces actions',()=>{
  const s=started(),copy=JSON.parse(JSON.stringify(s));assert.deepEqual(Table.getActions(s,Catalog),Table.getActions(copy,Catalog));
  const hiddenNames=s.players[1].hand.map(c=>Table.getCard(Catalog,c.cardId).name);
  const labels=Table.getActions(s,Catalog).filter(a=>a.sourceId&&s.players[1].hand.some(c=>c.uid===a.sourceId)).map(a=>a.label);assert.deepEqual(labels,[]);
  assert.deepEqual(act(s,'pass'),act(copy,'pass'));assert.ok(hiddenNames.length===5);
});
