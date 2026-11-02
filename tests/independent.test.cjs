'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../dist/engine.js');
const Catalog = require('../dist/catalog.js');

function emptyBoard(activePlayer = 0) {
  const state = Engine.createGame(Catalog, { seed: 4173 });
  state.phase = 'main';
  state.flow = 'main';
  state.turn = 5;
  state.activePlayer = activePlayer;
  state.priorityPlayer = activePlayer;
  state.mulliganDone = [true, true];
  for (const player of state.players) {
    player.deck.push(...player.hand);
    player.hand = [];
    player.rations = { ready: 12, tapped: 0, deck: 0 };
  }
  return state;
}

function place(state, cardId, player, zone) {
  const deck = state.players[player].deck;
  const index = deck.findIndex(card => card.cardId === cardId);
  assert.notEqual(index, -1, `${cardId} doit appartenir au deck de référence`);
  const card = deck.splice(index, 1)[0];
  if (zone === 'hunting') state.hunting.push(card);
  else state.players[player][zone].push(card);
  return card;
}

function act(state, type, sourceId, targetIds = []) {
  const action = Engine.getActions(state, Catalog).find(candidate => candidate.type === type && (!sourceId || candidate.sourceId === sourceId));
  assert.ok(action, `L'action ${type} doit être proposée`);
  return Engine.dispatch(state, { ...action, targetIds }, Catalog);
}

function passTwice(state) {
  return act(act(state, 'pass'), 'pass');
}

test('Une créature est jouable sans les cibles de sa capacité activée ou de son arrivée', async t => {
  for (const [id, player] of [['011', 0], ['015', 0], ['032', 1], ['037', 1], ['043', 1], ['045', 1], ['114', 0]]) {
    await t.test(`${id} ${Engine.getCard(Catalog, id).name}`, () => {
      let state = emptyBoard(player);
      const card = place(state, id, player, 'hand');
      const action = Engine.getActions(state, Catalog).find(candidate => candidate.type === 'play' && candidate.sourceId === card.uid);
      assert.ok(action, 'Les cibles de la capacité ne doivent pas empêcher de jouer la créature');
      assert.equal(action.targetCount, 0, 'Aucune cible à annoncer pour jouer cette créature');
      state = Engine.dispatch(state, { ...action, targetIds: [] }, Catalog);
      state = passTwice(state);
      const arrived = [...state.hunting, ...state.players[player].camp].find(instance => instance.uid === card.uid);
      assert.ok(arrived, 'La créature arrive bien sur le terrain');
      assert.equal(arrived.tapped, true, 'La créature arrive engagée');
      assert.equal(state.pending, null, 'Une capacité sans cible disponible ne bloque pas son arrivée');
    });
  }
});

test('Bombe Flash empêche la riposte du Monstre et conserve les blessures infligées par le Chasseur', () => {
  let state = emptyBoard(0);
  const hunter = place(state, '014', 0, 'camp');
  const monster = place(state, '031', 1, 'hunting');
  const flash = place(state, '132', 0, 'hand');
  state = act(state, 'attack', hunter.uid, [monster.uid]);
  state = passTwice(state); // Fin de la fenêtre d'Interposition.
  state = passTwice(state); // Résolution de la capacité défensive de Velocidrome.
  assert.equal(state.combat.stage, 'damage');
  state = act(state, 'play', flash.uid, [monster.uid]);
  state = passTwice(state); // Résolution de Bombe Flash.
  state = passTwice(state); // Attribution simultanée des blessures.
  const finalHunter = state.players[0].camp.find(card => card.uid === hunter.uid);
  const finalMonster = state.hunting.find(card => card.uid === monster.uid);
  assert.equal(finalMonster.damage, 3, 'Le Chasseur inflige normalement sa Force au Monstre');
  assert.equal(finalHunter.damage, 0, 'Le Monstre ne doit infliger aucune blessure de combat');
});
