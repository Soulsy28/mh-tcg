'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../dist/builder-view.js');
const I=require('../dist/i18n.js');
const C=require('../dist/catalog.js');
const E=require('../dist/engine.js');
const chief=C.cards.find(card=>card.type==='chief');
test.afterEach(()=>I.setLanguage('fr'));

test('un nouveau deck commence par une galerie sans Chef imposé',()=>{
  const html=V.render({catalog:C,deck:null,ui:{builderTab:'chiefs',newDeckName:'Nouveau deck'}});
  assert(html.includes('Choisis un Chef pour créer ton deck'));
  assert(html.includes('id="builder-tab-chiefs"'));
  assert(!html.includes('id="chief-select"'));
  assert.equal((html.match(/data-choose-chief=/g)||[]).length,C.cards.filter(card=>card.type==='chief').length);
  assert(html.includes('data-builder-tab="cards" aria-controls="builder-panel-cards" aria-selected="false" tabindex="-1" disabled'));
});

test('la galerie reste bornée et paginée avec mille Chefs, sans modifier ses données',()=>{
  const catalog={cards:Array.from({length:1000},(_,index)=>({...chief,id:String(index+1),name:'Chef '+String(index+1).padStart(4,'0')}))};
  const before=JSON.stringify(catalog);
  const html=V.render({catalog,deck:null,ui:{builderTab:'chiefs',chiefPage:2}});
  assert.equal((html.match(/data-choose-chief=/g)||[]).length,12);
  assert(html.includes('Page 2 sur 84'));
  assert.equal(JSON.stringify(catalog),before);
});

test('le catalogue et les noms personnels sont préservés dans la vue anglaise',()=>{
  const deck={id:'example',name:'Accueil <img src=x onerror=alert(1)>',chiefId:chief.id,cards:[]};
  const before=JSON.stringify(deck);I.setLanguage('en');
  const html=V.render({catalog:C,deck,ui:{builderTab:'cards'},supportedIds:E.SUPPORTED_IDS});
  assert(html.includes('The deck workshop'));
  assert(html.includes('Accueil &lt;img src=x onerror=alert(1)&gt;'));
  assert(!html.includes('<img src=x'));
  assert.equal(JSON.stringify(deck),before);
});

test('la recherche des decks renvoie seulement des fiches, sans dupliquer le champ de recherche',()=>{
  const decks=[{id:'one',name:'Forêt',chiefId:chief.id,cards:[]},{id:'two',name:'Essai',chiefId:chief.id,cards:[]}];
  const html=V.renderManager({decks,catalog:C,query:'forêt',selectedId:'one'});
  assert.equal((html.match(/data-builder-deck=/g)||[]).length,1);
  assert(html.includes('data-builder-deck="one"'));
  assert(!html.includes('<input'));
  assert(!html.includes('class="deck-manager-list"'));
});

test('le changement de Chef annonce tous les exemplaires concernés et exige un choix explicite',()=>{
  const silas=C.cards.find(card=>card.name.startsWith('Silas,'));
  const corma=C.cards.find(card=>card.name.startsWith('Corma,'));
  const deck={chiefId:silas.id,cards:['001','001','001','008']};
  const before=JSON.stringify(deck),modal=V.chiefImpact(deck,corma.id,C);
  assert(modal.body.includes('4 exemplaires'));
  assert(modal.footer.includes('data-builder-do="chief-keep"'));
  assert(modal.footer.includes('data-builder-do="chief-remove"'));
  assert(modal.footer.includes('data-close'));
  assert.equal(JSON.stringify(deck),before);
});
