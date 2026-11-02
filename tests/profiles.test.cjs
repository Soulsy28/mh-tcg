'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { createStore } = require('../dist/profiles.js');

function memoryStorage() {
  const values = new Map();
  return { getItem:key => values.has(key) ? values.get(key) : null, setItem:(key,value) => values.set(key,String(value)), removeItem:key => values.delete(key), values };
}
function setup() {
  const storage = memoryStorage(), sessionStorage = memoryStorage();
  return { storage, sessionStorage, store:createStore({storage,sessionStorage,crypto:webcrypto}) };
}
const deck = (name='Test local') => ({name,chiefId:'202',cards:['001','008','010']});

test('inscription, connexion et déconnexion ; aucun mot de passe en clair', async () => {
  const {store,storage} = setup();
  const profile = await store.register('  Chasseur Étoilé  ','ma-phrase-secrète');
  assert.deepEqual(Object.keys(profile).sort(), ['createdAt','id','username']);
  assert.equal(profile.username,'Chasseur Étoilé');
  assert.equal(store.current().id,profile.id);
  const raw = [...storage.values.values()][0];
  assert.equal(raw.includes('ma-phrase-secrète'),false);
  const credentials = JSON.parse(raw).profiles[0].credentials;
  assert.equal(credentials.iterations,310000);
  assert.equal(Buffer.from(credentials.salt,'base64').length,16);
  assert.equal(Buffer.from(credentials.verifier,'base64').length,32);
  store.logout();
  assert.equal(store.current(),null);
  await assert.rejects(store.login('Chasseur Étoilé','mauvais-mot-de-passe'),/incorrect/);
  assert.equal(store.current(),null);
  assert.equal((await store.login('CHASSEUR ÉTOILÉ','ma-phrase-secrète')).id,profile.id);
});

test('pseudo normalisé et doublons Unicode refusés avant et après dérivation', async () => {
  const {store} = setup();
  await store.register('Straße','mot-de-passe');
  await assert.rejects(store.register('STRASSE','mot-de-passe'),/existe déjà/);
  await store.register('Ａｌｅｘ','mot-de-passe');
  await assert.rejects(store.register('alex','mot-de-passe'),/existe déjà/);
  const result = await Promise.allSettled([store.register('Druart','autre-secret'),store.register('DRUART','autre-secret')]);
  assert.equal(result.filter(value=>value.status==='fulfilled').length,1);
});

test('la validation refuse les identifiants ou mots de passe invalides', async () => {
  const {store} = setup();
  await assert.rejects(store.register('ab','mot-de-passe'),/3 à 24/);
  await assert.rejects(store.register('<script>','mot-de-passe'),/3 à 24/);
  await assert.rejects(store.register('correct','court'),/8 caractères/);
  await assert.rejects(store.register('correct','x'.repeat(1025)),/1 024/);
  assert.equal(store.current(),null);
});

test('decks et sauvegardes sont isolés par profil ; les références retournées sont copiées', async () => {
  const {store,storage} = setup();
  const alice = await store.register('Alice','secret-alice');
  const saved = store.saveDeck(deck('Deck Alice'));
  saved.cards.push('999');
  assert.equal(store.listDecks()[0].cards.length,3);
  const state={turn:3,players:[{name:'Alice'},{name:'Autre'}],nested:{value:5}};
  store.saveGame(state);state.nested.value=99;
  assert.equal(store.getGame().nested.value,5);
  store.logout();
  assert.throws(()=>store.listDecks(),/Connecte-toi/);
  const bob = await store.register('Béatrice','secret-beatrice');
  assert.notEqual(alice.id,bob.id);
  assert.deepEqual(store.listDecks(),[]);
  assert.equal(store.getGame(),null);
  store.saveDeck(deck('Deck Béatrice'));
  store.saveGame({turn:9});
  store.logout();
  await store.login('Alice','secret-alice');
  assert.equal(store.listDecks()[0].name,'Deck Alice');
  assert.equal(store.getGame().turn,3);
  const all=JSON.parse([...storage.values.values()][0]);
  assert.notEqual(all.profiles[0].credentials.salt,all.profiles[1].credentials.salt);
});

test('session par onglet et conservation des decks dans un nouveau magasin', async () => {
  const {store,storage,sessionStorage} = setup();
  const profile=await store.register('Canopée','secret-canopee');
  const saved=store.saveDeck(deck());
  const sameSession=createStore({storage,sessionStorage,crypto:webcrypto});
  assert.equal(sameSession.current().id,profile.id);
  assert.equal(sameSession.listDecks()[0].id,saved.id);
  const newSession=createStore({storage,sessionStorage:memoryStorage(),crypto:webcrypto});
  assert.equal(newSession.current(),null);
  await newSession.login('Canopée','secret-canopee');
  assert.equal(newSession.listDecks()[0].id,saved.id);
});

test('mettre à jour et supprimer un deck conserve les autres decks', async () => {
  const {store}=setup();
  await store.register('Decks','secret-decks');
  const a=store.saveDeck(deck('Premier')),b=store.saveDeck(deck('Second'));
  const updated=store.saveDeck({...a,name:'Renommé',cards:['035','001']});
  assert.equal(updated.id,a.id);
  assert.equal(updated.createdAt,a.createdAt);
  assert.equal(store.listDecks().length,2);
  assert.equal(store.listDecks()[0].cards[0],'035');
  assert.equal(store.deleteDeck(a.id),true);
  assert.equal(store.deleteDeck(a.id),false);
  assert.deepEqual(store.listDecks().map(d=>d.id),[b.id]);
});

test('export des decks sans secrets ; import atomique sans écrasement', async () => {
  const {store}=setup();
  await store.register('Exporter','secret-exporter');
  store.saveDeck(deck());store.saveGame({turn:4});
  const exported=store.exportProfile(),json=JSON.stringify(exported);
  for(const forbidden of ['credentials','verifier','salt','secret-exporter','session','"game"']) assert.equal(json.includes(forbidden),false);
  const imported=store.importDecks(exported.decks);
  assert.equal(store.listDecks().length,2);
  assert.notEqual(imported[0].id,exported.decks[0].id);
  assert.throws(()=>store.importDecks([deck('Valide'),{name:'Cassé',chiefId:'202',cards:['<script>']}]),/identifiants/);
  assert.equal(store.listDecks().length,2);
});

test('brouillons permis, tailles bornées et valeurs invalides refusées', async () => {
  const {store}=setup();await store.register('Valider','secret-valider');
  assert.equal(store.saveDeck({...deck(),cards:[]}).cards.length,0);
  assert.throws(()=>store.saveDeck({...deck(),cards:Array(101).fill('001')}),/100/);
  assert.throws(()=>store.saveDeck({...deck(),id:'<bad>'}),/identifiant/);
  assert.throws(()=>store.saveDeck({...deck(),chiefId:'not-a-chief'}),/Chef/);
  assert.throws(()=>store.saveGame({callback:()=>1}),/invalide/);
  assert.throws(()=>store.saveGame({number:Infinity}),/invalide/);
  const cycle={};cycle.ref=cycle;
  assert.throws(()=>store.saveGame(cycle),/invalide/);
  assert.throws(()=>store.saveGame({large:'x'.repeat(3*1024*1024)}),/volumineux/);
  store.saveGame({turn:1});store.clearGame();assert.equal(store.getGame(),null);
});

test('données JSON corrompues conservées ; échec de stockage sans perte de données', async () => {
  const {store,storage,sessionStorage}=setup();await store.register('Intégrité','secret-integrite');
  store.saveDeck(deck());
  const key=[...storage.values.keys()][0],old=storage.getItem(key);
  storage.setItem(key,'{corrompu');
  assert.throws(()=>store.listDecks(),/illisibles/);
  assert.equal(storage.getItem(key),'{corrompu');
  storage.setItem(key,old);
  const quota={getItem:storage.getItem,removeItem:storage.removeItem,setItem(){const error=new Error('full');error.name='QuotaExceededError';throw error;}};
  const blocked=createStore({storage:quota,sessionStorage,crypto:webcrypto});
  assert.throws(()=>blocked.saveDeck(deck('Autre')),/plein/);
  assert.equal(storage.getItem(key),old);
  assert.equal(store.listDecks().length,1);
});
