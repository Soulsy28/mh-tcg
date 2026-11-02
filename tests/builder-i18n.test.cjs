'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../dist/i18n.js');
const D = require('../dist/deck-tools.js');
const C = require('../dist/catalog.js');

function language() {
  const i = I.create({storage:null,document:null});
  i.setLanguage('en');
  return i;
}

test('les nouveaux états du builder, notifications et libellés de gestion existent en anglais',()=>{
  const i = language();
  const expected = new Map([
    ['Choisis un Chef pour créer ton deck','Choose a Chief to create your deck'],
    ['Chef modifié. Les cartes incompatibles ont été retirées.','Chief changed. Incompatible cards have been removed.'],
    ['Chef de chasse sélectionné.','Hunting Chief selected.'],
    ['Modification annulée.','Change undone.'],
    ['Modification rétablie.','Change redone.'],
    ['Mes decks','My decks'],
    ['Rechercher un deck','Search decks'],
    ['Rechercher dans mes decks','Search my decks'],
    ['Nom du deck ou du Chef','Deck or Chief name'],
    ['Nom du deck ou du Chef…','Deck or Chief name…']
  ]);
  for(const [fr,en] of expected)assert.equal(i.t(fr),en);
  i.setLanguage('fr');
  for(const [fr] of expected)assert.equal(i.t(fr),fr);
});

test('une sauvegarde refusée traduit sa cause connue et conserve une cause personnelle inconnue',()=>{
  const i=language();
  assert.equal(i.t('Sauvegarde impossible : Le deck est invalide.'),'Unable to save: The deck is invalid.');
  assert.equal(i.t('Sauvegarde impossible : message du navigateur inconnu'),'Unable to save: message du navigateur inconnu');
  assert.equal(i.t('  Sauvegarde impossible : Le deck est invalide.  '),'  Unable to save: The deck is invalid.  ');
});

test('les erreurs de validation sont compréhensibles en anglais et conservent les quantités et identifiants',()=>{
  const i=language();
  assert.equal(i.t('Le deck principal doit contenir exactement 50 cartes (17 actuellement).'),'The main deck must contain exactly 50 cards (17 currently).');
  assert.equal(i.t('Maximum 3 exemplaires de Accueil (4 actuellement).'),'Up to 3 copies of Accueil (4 currently).');
  assert.equal(i.t('Carte inconnue : MhFG-999.'),'Unknown card: MhFG-999.');
  assert.equal(i.t('Rathian ne correspond pas aux couleurs du Chef de chasse.'),"Rathian does not match the Hunting Chief's colors.");
  assert.equal(i.t('Accueil est un Chef : il ne va pas dans le deck principal.'),'Accueil is a Chief and cannot go in the main deck.');
  assert.equal(i.t('Accueil est un jeton : il ne va pas dans le deck principal.'),'Accueil is a token and cannot go in the main deck.');
});

test('les erreurs réelles du validateur ne sont plus laissées entièrement en français',()=>{
  const i=language();
  const deck={chiefId:'inconnu',cards:['inconnue','202','token-fiole']};
  const errors=D.validateDeck(deck,C).errors;
  assert(errors.length>=5);
  for(const error of errors){
    const translated=i.t(error);
    assert.notEqual(translated,error,error);
  }
  i.setLanguage('fr');
  for(const error of errors)assert.equal(i.t(error),error);
});
