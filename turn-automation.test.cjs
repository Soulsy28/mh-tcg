'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Table = require('../dist/table.js');
const Engine = require('../dist/engine.js');
const Catalog = require('../dist/catalog.js');

function act(api, s, id, extra = {}) {
  const action = api.getActions(s, Catalog).find(a => a.id === id);
  assert.ok(action, 'Action disponible : ' + id);
  return api.dispatch(s, { ...action, ...extra }, Catalog);
}
function start(api, options = {}) {
  let s = api.createGame(Catalog, { seed: 221, decks: Engine.STARTER_DECKS, names: ['Alice', 'Benoît'], ...options });
  return act(api, act(api, s, 'keep'), 'keep');
}
function add(s, id, player, zone, extra = {}) {
  const card = { uid: 'turn-test-' + (++s.seq), cardId: id, owner: player, controller: player, incarnation: 0, tapped: false, damage: 0, counters: {}, mods: [], used: {}, overexerted: false, ...extra };
  if (zone === 'hunting') s.hunting.push(card); else s.players[player][zone].push(card);
  return card;
}
function conserved(s) {
  for (const p of s.players) {
    assert.equal(p.rations.ready + p.rations.tapped + p.rations.deck, 12);
    assert.ok(Object.values(p.rations).every(n => Number.isInteger(n) && n >= 0));
  }
}

test('table libre : ration et pioche automatiques une seule fois au premier tour et aux tours suivants', () => {
  let s = start(Table);
  assert.equal(s.phase, 'main');
  assert.deepEqual(s.players.map(p => p.hand.length), [6, 5]);
  assert.deepEqual(s.players[0].rations, { ready: 1, tapped: 0, deck: 11 });
  assert.ok(!Table.getActions(s, Catalog).some(a => a.type === 'continue'));
  const saved = JSON.stringify(s);
  Table.getActions(s, Catalog); Table.getActions(s, Catalog);
  assert.equal(JSON.stringify(s), saved, 'La consultation des actions ne modifie jamais une sauvegarde.');
  s = act(Table, s, 'ration-tap');
  s = act(Table, s, 'endturn');
  assert.equal(s.activePlayer, 1); assert.equal(s.phase, 'main');
  assert.deepEqual(s.players.map(p => p.hand.length), [6, 6]);
  s = act(Table, s, 'endturn');
  assert.deepEqual(s.players.map(p => p.hand.length), [7, 6]);
  assert.deepEqual(s.players[0].rations, { ready: 2, tapped: 0, deck: 10 });
  assert.equal(s.log.filter(e => e.text === 'Alice pioche 1 carte.').length, 2);
  conserved(s);
});

test('table libre : une ancienne sauvegarde en début de tour reprend via une action canonique sans double pioche', () => {
  let legacy = Table.createGame(Catalog, { seed: 37, decks: Engine.STARTER_DECKS });
  legacy.turn = 1; legacy.phase = 'start'; legacy.mulliganDone = [true, true];
  delete legacy.startResourcesTurn;
  const serialized = JSON.stringify(legacy);
  const action = Table.getActions(legacy, Catalog).find(a => a.type === 'continue');
  assert.ok(action); assert.equal(JSON.stringify(legacy), serialized);
  let s = Table.dispatch(JSON.parse(serialized), action, Catalog);
  assert.equal(s.phase, 'main'); assert.equal(s.players[0].hand.length, 6);
  assert.deepEqual(s.players[0].rations, { ready: 1, tapped: 0, deck: 11 });
  assert.deepEqual(s, Table.dispatch(legacy, action, Catalog));
  assert.throws(() => Table.dispatch(s, action, Catalog), /pas autorisée/);
  // Even a persisted start window carrying its completed turn stamp cannot draw twice.
  s.phase = 'start';
  s = act(Table, JSON.parse(JSON.stringify(s)), 'continue');
  assert.equal(s.players[0].hand.length, 6); assert.equal(s.players[0].rations.ready, 1);
  conserved(s);
});

test('table libre : les vrais effets de début de tour passent avant ration/pioche et peuvent gagner sans piocher', () => {
  let s = start(Table);
  add(s, '001', 1, 'hunting', { counters: { Quête: 1 } });
  s.players[1].deck = [];
  s = act(Table, s, 'endturn');
  assert.equal(s.phase, 'start'); assert.equal(s.winner, null);
  assert.equal(s.players[1].rations.ready, 0); assert.equal(s.players[1].hand.length, 5);
  s = act(Table, s, 'victory', { choiceId: '1' });
  assert.equal(s.winner, 1); assert.equal(s.players[1].rations.ready, 0);
  assert.ok(!s.log.some(e => e.text.includes('ne peut plus piocher')));
});

test('table libre : une capacité manuelle peut précéder les automatismes sans les répéter', () => {
  let s = start(Table);
  add(s, '002', 1, 'hunting');
  s = act(Table, s, 'endturn'); assert.equal(s.phase, 'start');
  s = act(Table, s, 'ration-add', { choiceId: 'tapped' });
  s = act(Table, s, 'eat', { choiceId: 'tapped' });
  s = act(Table, s, 'continue');
  assert.equal(s.phase, 'main'); assert.equal(s.players[1].hand.length, 6);
  assert.deepEqual(s.players[1].rations, { ready: 1, tapped: 0, deck: 11 });
  conserved(s);
});

test('table libre : une durée « jusqu’au début » ne provoque pas de pause manuelle', () => {
  let s = start(Table);
  add(s, '043', 1, 'camp');
  s = act(Table, s, 'endturn');
  assert.equal(s.phase, 'main'); assert.equal(s.players[1].hand.length, 6);
});

test('pioche par le deck : action canonique de table libre réservée à la priorité, sans pioche libre en automatisé', () => {
  let s = start(Table);
  const draw = Table.getActions(s, Catalog).find(a => a.id === 'draw');
  assert.equal(draw.player, 0);
  assert.throws(() => Table.dispatch(s, { ...draw, player: 1 }, Catalog), /pas autorisée/);
  s = Table.dispatch(s, { ...draw, amount: 100 }, Catalog);
  assert.deepEqual(s.players.map(p => p.hand.length), [7, 5], 'Un champ ajouté ne permet pas de piocher davantage.');
  s = act(Table, s, 'pass');
  assert.equal(Table.getActions(s, Catalog).find(a => a.id === 'draw').player, 1);
  const auto = start(Engine);
  assert.ok(!Engine.getActions(auto, Catalog).some(a => a.type === 'draw'));
  assert.throws(() => Engine.dispatch(auto, { id: 'draw', type: 'draw', player: 0 }, Catalog), /pas disponible/);
});

test('table libre : réserve vide ne crée pas de ration et n’empêche pas la pioche normale', () => {
  let s = start(Table);
  s.players[1].rations = { ready: 4, tapped: 8, deck: 0 };
  const before = s.log.length;
  s = act(Table, s, 'endturn');
  assert.deepEqual(s.players[1].rations, { ready: 12, tapped: 0, deck: 0 });
  assert.equal(s.players[1].hand.length, 6);
  const logs = s.log.slice(before).map(e => e.text);
  assert.ok(logs.includes('Benoît ne peut pas ajouter de ration : sa réserve est vide.'));
  assert.ok(!logs.some(t => t.startsWith('Benoît ajoute'))); conserved(s);
});

test('table libre : jouer une carte paie automatiquement le coût partagé entre réserve et ressources temporaires', () => {
  let s = start(Table);
  const poogie = add(s, '008', 0, 'hand');
  const cost = Table.getCard(Catalog, poogie.cardId).cost;
  s.players[0].pool = cost - 1;
  s = act(Table, s, 'play:' + poogie.uid);
  assert.deepEqual(s.players[0].rations, { ready: 0, tapped: 1, deck: 11 });
  assert.equal(s.players[0].pool, 0);
  assert.ok(s.log.some(e => e.text === 'Alice paie [' + cost + '] : 1 ration(s) engagée(s), [' + (cost - 1) + '] ressource(s) temporaire(s).'));
  conserved(s);
});

test('moteur strict : les effets de début de tour et les réponses restent avant les automatismes', () => {
  let s = start(Engine);
  add(s, '001', 1, 'hunting', { counters: { Quête: 1 } });
  s.players[1].deck = [];
  s = act(Engine, s, 'endturn');
  assert.equal(s.priorityPlayer, 0); s = act(Engine, s, 'pass');
  assert.equal(s.priorityPlayer, 1); s = act(Engine, s, 'pass');
  assert.equal(s.activePlayer, 1); assert.equal(s.stack.at(-1).kind, 'quest');
  assert.equal(s.priorityPlayer, 1); assert.equal(s.players[1].rations.ready, 0);
  s = act(Engine, act(Engine, s, 'pass'), 'pass');
  assert.equal(s.winner, 1); assert.equal(s.phase, 'ended');
  assert.ok(!s.log.some(e => e.text.includes('ne peut plus piocher'))); conserved(s);
});

test('moteur strict : journal public de la pioche effective, du paiement et des rations, sans identité cachée', () => {
  let s = start(Engine);
  s.players[0].rations = { ready: 10, tapped: 0, deck: 2 };
  const technique = add(s, '047', 0, 'hand');
  const hidden = s.players[0].deck[0];
  s.players[0].deck = [hidden];
  const before = s.log.length;
  s = act(Engine, s, 'play:' + technique.uid);
  const cost = Engine.getCard(Catalog, '047').cost;
  assert.equal(s.players[0].rations.tapped, cost);
  s = act(Engine, act(Engine, s, 'pass'), 'pass');
  assert.equal(s.winner, 1);
  const logs = s.log.slice(before);
  assert.ok(logs.some(e => e.text === 'Alice pioche 1 carte.'));
  assert.ok(!logs.some(e => e.text === 'Alice pioche 2 cartes.'));
  assert.ok(logs.some(e => e.text.startsWith('Alice paie [' + cost + ']')));
  assert.ok(logs.every(e => e.public === true));
  const drawLog = logs.find(e => e.text.startsWith('Alice pioche'));
  assert.ok(!drawLog.text.includes(hidden.uid));
  assert.ok(!drawLog.text.includes(Engine.getCard(Catalog, hidden.cardId).name)); conserved(s);
});

test('moteur strict : ration ajoutée par un effet est journalisée une fois et reste physique', () => {
  let s = start(Engine);
  s.players[0].rations = { ready: 10, tapped: 0, deck: 2 };
  const poogie = add(s, '008', 0, 'hand');
  s = act(Engine, s, 'play:' + poogie.uid);
  s = act(Engine, act(Engine, s, 'pass'), 'pass');
  const before = s.log.length;
  s = act(Engine, act(Engine, s, 'pass'), 'pass');
  assert.equal(s.log.slice(before).filter(e => e.text === 'Alice ajoute 1 ration engagée depuis sa réserve.').length, 1);
  assert.equal(s.players[0].rations.deck, 1); conserved(s);
});
