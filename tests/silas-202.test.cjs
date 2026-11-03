'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../dist/engine.js');
const Catalog = require('../dist/catalog.js');

function base() {
  const state = Engine.createGame(Catalog, { seed: 202 });
  Object.assign(state, { turn: 5, phase: 'main', flow: 'main', activePlayer: 0, priorityPlayer: 0, mulliganDone: [true, true] });
  for (const player of state.players) {
    player.deck.push(...player.hand);
    player.hand = [];
    player.rations = { ready: 12, tapped: 0, deck: 0 };
  }
  return state;
}

function add(state, cardId, player, zone, extra = {}) {
  const card = { uid: 'silas-test-' + (++state.seq), cardId, owner: player, controller: player, incarnation: 0, tapped: false, damage: 0, counters: {}, mods: [], used: {}, overexerted: false, ...extra };
  if (zone === 'hunting') state.hunting.push(card);
  else state.players[player][zone].push(card);
  return card;
}

function act(state, type, sourceId, targetIds = []) {
  const action = Engine.getActions(state, Catalog).find(candidate => candidate.type === type && (!sourceId || candidate.sourceId === sourceId));
  assert.ok(action, 'Action proposée : ' + type + (sourceId ? ' pour ' + sourceId : ''));
  return Engine.dispatch(state, { ...action, targetIds }, Catalog);
}

const passTwice = state => act(act(state, 'pass'), 'pass');
const chooseTarget = (state, uid) => act(state, 'choose', null, [uid]);

function resolveAll(state) {
  for (let i = 0; i < 30 && state.phase !== 'main'; i++) {
    assert.equal(state.pending, null, 'Les cibles ont déjà été choisies');
    state = act(state, 'pass');
  }
  assert.equal(state.phase, 'main');
  return state;
}

test('Silas 202 : Manger déclenche un soin ciblé de Chasseur ou Monstre allié, au-dessus de la carte payée', () => {
  let state = base();
  const hunter = add(state, '014', 0, 'camp', { damage: 2 });
  const small = add(state, '010', 0, 'hunting', { damage: 2 });
  const large = add(state, '031', 0, 'hunting', { damage: 1 });
  const enemyHunter = add(state, '043', 1, 'camp', { damage: 1 });
  const enemyMonster = add(state, '031', 1, 'hunting', { damage: 1 });
  const item = add(state, '130', 0, 'items');
  const lao = add(state, '001', 0, 'hand');
  const before = JSON.stringify(state);
  const next = act(state, 'play', lao.uid);
  assert.equal(JSON.stringify(state), before, 'L’annonce conserve l’état précédent');
  state = next;
  assert.equal(state.pending.kind, 'triggerTarget');
  assert.equal(state.pending.entry.kind, 'silas');
  assert.equal(state.pending.player, 0);
  assert.deepEqual(state.pending.targets.map(target => target.id).sort(), [hunter.uid, small.uid, large.uid].sort());
  for (const forbidden of [enemyHunter.uid, enemyMonster.uid, item.uid, lao.uid, state.players[0].chief.uid]) {
    assert.ok(!state.pending.targets.some(target => target.id === forbidden));
    assert.throws(() => chooseTarget(state, forbidden), /cible/);
  }
  assert.deepEqual(state.players[0].rations, { ready: 2, tapped: 7, deck: 3 });
  state = chooseTarget(state, small.uid);
  assert.deepEqual(state.stack.map(entry => entry.kind), ['cast', 'silas']);
  assert.equal(state.stack.at(-1).sourceCardId, '202');
  state = act(state, 'pass');
  assert.equal(state.hunting.find(card => card.uid === small.uid).damage, 2);
  state = act(state, 'pass');
  assert.equal(state.hunting.find(card => card.uid === small.uid).damage, 1);
  assert.equal(state.players[0].camp.find(card => card.uid === hunter.uid).damage, 2);
  assert.equal(state.stack.length, 1, 'Le Monstre payé attend encore sa propre résolution');
});

test('Silas 202 : dégager un Chasseur blessé ne soigne plus et ne consomme pas son déclenchement', () => {
  let state = base();
  const hunter = add(state, '014', 0, 'camp', { tapped: true, damage: 2 });
  const leap = add(state, '023', 0, 'hand');
  state = passTwice(act(state, 'play', leap.uid, [hunter.uid]));
  const finalHunter = state.players[0].camp.find(card => card.uid === hunter.uid);
  assert.equal(finalHunter.tapped, false);
  assert.equal(finalHunter.damage, 2);
  assert.equal(state.pending, null);
  assert.equal(state.stack.length, 0);
  assert.ok(!state.players[0].chief.used.heal);
  assert.ok(!state.log.some(entry => /Silas/.test(entry.text)));
});

test('Silas 202 : le retour en main comme coût déclenche le Chef du joueur responsable, même avec un autre propriétaire', () => {
  let state = base();
  state.players[1].chief.cardId = '202';
  const eva = add(state, '124', 0, 'camp', { owner: 1 });
  const ally = add(state, '031', 0, 'hunting', { damage: 2 });
  add(state, '014', 1, 'camp', { damage: 2 });
  state = act(state, 'ability', eva.uid);
  assert.ok(state.players[1].hand.some(card => card.uid === eva.uid));
  assert.ok(!state.players[0].camp.some(card => card.uid === eva.uid));
  assert.equal(state.pending.player, 0);
  assert.deepEqual(state.pending.targets.map(target => target.id), [ally.uid]);
  assert.ok(state.players[0].chief.used.heal);
  assert.ok(!state.players[1].chief.used.heal);
  state = chooseTarget(state, ally.uid);
  assert.deepEqual(state.stack.map(entry => entry.kind), ['ability', 'silas']);
  state = passTwice(state);
  assert.equal(state.hunting.find(card => card.uid === ally.uid).damage, 1);
  assert.equal(state.stack[0].sourceCardId, '124', 'Le retour comme coût ne supprime pas la capacité d’Eva');
});

test('Silas 202 : Manger et renvoyer partagent une seule utilisation par tour', async t => {
  for (const first of ['eat', 'return']) await t.test(first, () => {
    let state = base();
    const hunter = add(state, '014', 0, 'camp', { damage: 3 });
    const eva = add(state, '124', 0, 'camp');
    const lao = add(state, '001', 0, 'hand');
    const announce = (current, event) => event === 'eat' ? act(current, 'play', lao.uid) : act(current, 'ability', eva.uid);
    state = announce(state, first);
    state = resolveAll(chooseTarget(state, hunter.uid));
    assert.equal(state.players[0].camp.find(card => card.uid === hunter.uid).damage, 2);
    state = announce(state, first === 'eat' ? 'return' : 'eat');
    assert.equal(state.pending, null);
    assert.ok(!state.stack.some(entry => entry.kind === 'silas'));
    state = resolveAll(state);
    assert.equal(state.players[0].camp.find(card => card.uid === hunter.uid).damage, 2);
  });
});

test('Silas 202 : chaque nouveau tour réinitialise la capacité, séparément pour les deux camps', () => {
  let state = base();
  state.players[1].chief.cardId = '202';
  const eva0 = add(state, '124', 0, 'camp');
  const secondEva0 = add(state, '124', 0, 'camp');
  const eva1 = add(state, '124', 1, 'camp');
  const hunter0 = add(state, '014', 0, 'camp', { damage: 2 });
  const hunter1 = add(state, '043', 1, 'camp', { damage: 2 });
  state = resolveAll(chooseTarget(act(state, 'ability', eva0.uid), hunter0.uid));
  assert.ok(state.players[0].chief.used.heal);
  state = resolveAll(act(state, 'endturn'));
  assert.equal(state.activePlayer, 1);
  assert.ok(!state.players[0].chief.used.heal, 'La limite de Silas se réinitialise aussi au tour adverse');
  state = resolveAll(chooseTarget(act(state, 'ability', eva1.uid), hunter1.uid));
  assert.ok(state.players[1].chief.used.heal);
  assert.ok(!state.players[0].chief.used.heal, 'Le retour adverse ne déclenche pas notre Chef');
  state = resolveAll(act(state, 'endturn'));
  state = resolveAll(chooseTarget(act(state, 'ability', secondEva0.uid), hunter0.uid));
  assert.equal(state.players[0].camp.find(card => card.uid === hunter0.uid).damage, 0);
  assert.equal(state.players[1].camp.find(card => card.uid === hunter1.uid).damage, 1);
});

test('Silas 202 : le soin revérifie le contrôle et l’incarnation de sa cible à la résolution', async t => {
  for (const change of ['control', 'incarnation']) await t.test(change, () => {
    let state = base();
    const eva = add(state, '124', 0, 'camp');
    const monster = add(state, '031', 0, 'hunting', { damage: 2 });
    state = chooseTarget(act(state, 'ability', eva.uid), monster.uid);
    const target = state.hunting.find(card => card.uid === monster.uid);
    if (change === 'control') target.controller = 1;
    else target.incarnation++;
    state = passTwice(state);
    assert.equal(state.hunting.find(card => card.uid === monster.uid).damage, 2);
    assert.ok(!state.stack.some(entry => entry.kind === 'silas'));
  });
});

test('Silas 202 : une carte revenue en main ne peut pas devenir la cible du soin et ne bloque pas la partie', () => {
  let state = base();
  const eva = add(state, '124', 0, 'camp', { damage: 1 });
  state = act(state, 'ability', eva.uid);
  assert.equal(state.pending, null, 'Il ne reste aucun Chasseur ou Monstre allié sur le terrain');
  assert.deepEqual(state.stack.map(entry => entry.kind), ['ability']);
  state = passTwice(state);
  assert.equal(state.phase, 'main');
});

test('Silas 202 : récupérer une carte depuis la défausse ne compte pas comme un retour depuis le terrain', () => {
  let state = base();
  const hunter = add(state, '014', 0, 'camp', { damage: 2 });
  const discarded = add(state, '015', 0, 'discard');
  const recovery = add(state, '020', 0, 'hand');
  state = passTwice(act(state, 'play', recovery.uid, [discarded.uid]));
  assert.ok(state.players[0].hand.some(card => card.uid === discarded.uid));
  assert.equal(state.players[0].camp.find(card => card.uid === hunter.uid).damage, 2);
  assert.ok(!state.players[0].chief.used.heal);
  assert.equal(state.pending, null);
  assert.equal(state.stack.length, 0);
});
