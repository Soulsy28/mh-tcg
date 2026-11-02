'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const I=require('../dist/i18n.js');
const catalog=require('../dist/catalog.js');

test('le carnet traduit les quantités piochées, les rations et les paiements détaillés',()=>{
  const language=I.create({storage:null,document:null});language.setLanguage('en');
  assert.equal(language.t('Alice pioche 1 carte.'),'Alice draws 1 card.');
  assert.equal(language.t('Alice pioche 5 cartes.'),'Alice draws 5 cards.');
  assert.equal(language.t('Alice ajoute 2 rations engagées depuis sa réserve.'),'Alice adds 2 tapped rations from their reserve.');
  assert.equal(language.t('Alice dégage 3 rations au début du tour.'),'Alice untaps 3 rations at the start of the turn.');
  assert.equal(language.t('Alice paie [3] : 2 ration(s) engagée(s), [1] ressource(s) temporaire(s).'),'Alice pays [3]: 2 rations tapped, [1] temporary resource.');
  assert.equal(language.t('Alice ne peut pas ajouter de ration : sa réserve est vide.'),'Alice cannot add a ration: their reserve is empty.');
  assert.equal(language.t('Alice ne peut pas ajouter 2 rations : sa réserve est vide.'),'Alice cannot add 2 rations: their reserve is empty.');
  assert.equal(language.t('Alice Mange 1 ration (retour dans la réserve).'),'Alice Eats 1 ration (returned to the reserve).');
  assert.equal(language.t('Alice termine son tour.'),'Alice ends their turn.');
});

test('un texte ressemblant à une propriété JavaScript reste un texte',()=>{
  const language=I.create({storage:null,document:null});
  language.setLanguage('en');
  for(const value of ['constructor','toString','__proto__'])assert.equal(language.t(value),value);
});

function memory(initial={}) {
  const values=new Map(Object.entries(initial));
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
}
function element(tag,attrs={},...children) {
  const values=new Map(Object.entries(attrs));
  const node={nodeType:1,localName:tag,childNodes:children,parentElement:null,
    hasAttribute:name=>values.has(name),getAttribute:name=>values.get(name)??null,
    setAttribute:(name,value)=>values.set(name,String(value)),value:attrs.value??''};
  for(const child of children)child.parentElement=node;
  return node;
}
const text=value=>({nodeType:3,nodeValue:value,parentElement:null});

test('la langue est locale au navigateur et relue lors d’une nouvelle session',()=>{
  const storage=memory(),doc={documentElement:{lang:''}};
  const first=I.create({storage,document:doc});
  assert.equal(first.getLanguage(),'fr');
  assert.equal(doc.documentElement.lang,'fr');
  first.setLanguage('en');
  assert.equal(storage.values.get('mh-tcg.language'),'en');
  assert.equal(doc.documentElement.lang,'en');
  assert.equal(I.create({storage,document:null}).getLanguage(),'en');
  first.setLanguage('fr');
  assert.equal(I.create({storage,document:null}).getLanguage(),'fr');
  assert.deepEqual([...storage.values.keys()],['mh-tcg.language']);
});

test('stockage indisponible ou corrompu : le bouton fonctionne sans perdre la langue en mémoire',()=>{
  const unavailable={getItem(){throw new Error('blocked');},setItem(){throw new Error('quota');}};
  const i=I.create({storage:unavailable,document:null});
  assert.equal(i.getLanguage(),'fr');
  assert.doesNotThrow(()=>i.setLanguage('en'));
  assert.equal(i.getLanguage(),'en');
  assert.equal(i.t('Accueil'),'Home');
  assert.equal(I.create({storage:memory({'mh-tcg.language':'unexpected'}),document:null}).getLanguage(),'fr');
  assert.throws(()=>i.setLanguage('de'),RangeError);
  assert.equal(i.getLanguage(),'en');
});

test('notifications : un changement de langue et un désabonnement sont respectés',()=>{
  const i=I.create({storage:memory(),document:null}),calls=[];
  const unsubscribe=i.subscribe(language=>calls.push(language));
  i.setLanguage('en');i.setLanguage('en');unsubscribe();i.setLanguage('fr');
  assert.deepEqual(calls,['en']);
});

test('les 205 cartes restent canoniques après présentation anglaise puis française',()=>{
  const i=I.create({storage:memory(),document:null});
  const before=JSON.stringify(catalog);
  i.setLanguage('en');
  for(const card of catalog.cards) {
    const view=i.cardView(card);
    assert.equal(view.id,card.id);
    assert.equal(view.name,card.nameEn||card.name);
    assert.equal(view.text,card.textEn||card.text);
    assert.equal(view.image,card.image.replace('assets/cards/','assets/cards/en/'));
    assert.deepEqual(view.colors,card.colors);
    assert.notEqual(view.colors,card.colors);
  }
  assert.equal(JSON.stringify(catalog),before);
  i.setLanguage('fr');
  assert.equal(i.cardView(catalog.cards[0]).name,catalog.cards[0].name);
  assert.equal(i.cardView(catalog.cards[0]).image,catalog.cards[0].image);
  assert.equal(JSON.stringify(catalog),before);
});

test('traductions des filtres, sous-types et nombres sans altérer du texte inconnu',()=>{
  const i=I.create({storage:memory(),document:null});i.setLanguage('en');
  assert.equal(i.t('  Bibliothèque  '),'  Card library  ');
  assert.equal(i.t('2 résultats'),'2 results');
  assert.equal(i.t('1 résultat'),'1 result');
  assert.equal(i.t('Camp · 4 / 5 chasseurs'),'Camp · 4 / 5 hunters');
  assert.equal(i.t('Une phrase personnelle'),'Une phrase personnelle');
  assert.equal(i.t('Vert / Jaune · Coût 1 · Force 2 · PV 3'),'Green / Yellow · Cost 1 · Strength 2 · HP 3');
  assert.equal(i.t('· Coût 1 · Force 2 · PV 3'),'· Cost 1 · Strength 2 · HP 3');
  assert.equal(i.t('Alice joue Rathian.'),'Alice plays Rathian.');
  assert.equal(i.cardView({name:'Carte',text:'Texte',colors:['Vert'],subtypes:['Dragon Ancien','Lance-canon'],typeLabel:'Grand monstre'}).typeLabel,'Large Monster');
  assert.deepEqual(i.cardView({colors:['Vert'],subtypes:['Dragon Ancien','Lance-canon']}).subtypes,['Elder Dragon','Gunlance']);
  i.setLanguage('fr');
  assert.equal(i.cardView(catalog.cards[0],'en').name,catalog.cards[0].nameEn);
  assert.equal(i.getLanguage(),'fr');
});

test('DOM : retour FR/EN réversible, champs saisis et noms protégés conservés',()=>{
  const i=I.create({storage:memory(),document:null});
  const heading=text('Accueil'),personal=text('Accueil'),label=text('Pseudo');
  const input=element('input',{value:'Bibliothèque',placeholder:'Ton nom de chasseur','aria-label':'Pseudo'});
  const option=element('option',{value:'fr'},text('Table libre'));
  const protectedName=element('span',{'data-no-i18n':''},personal);
  const script=element('script',{},text('Accueil'));
  const root=element('div',{},heading,label,input,option,protectedName,script);
  i.setLanguage('en');i.apply(root);
  assert.equal(heading.nodeValue,'Home');
  assert.equal(label.nodeValue,'Username');
  assert.equal(input.value,'Bibliothèque');
  assert.equal(input.getAttribute('value'),'Bibliothèque');
  assert.equal(input.getAttribute('placeholder'),'Your hunter name');
  assert.equal(option.getAttribute('value'),'fr');
  assert.equal(option.childNodes[0].nodeValue,'Free table');
  assert.equal(personal.nodeValue,'Accueil');
  assert.equal(script.childNodes[0].nodeValue,'Accueil');
  i.apply(root);assert.equal(heading.nodeValue,'Home');
  i.setLanguage('fr');i.apply(root);
  assert.equal(heading.nodeValue,'Accueil');
  assert.equal(input.getAttribute('placeholder'),'Ton nom de chasseur');
  assert.equal(option.childNodes[0].nodeValue,'Table libre');
  i.setLanguage('en');i.apply(personal);
  assert.equal(personal.nodeValue,'Accueil');
});

test('DOM : une zone réutilisée avec un nouveau message est traduite puis restaurée correctement',()=>{
  const i=I.create({storage:memory(),document:null}),message=text('Accueil');
  i.setLanguage('en');i.apply(message);assert.equal(message.nodeValue,'Home');
  message.nodeValue='Se connecter';i.apply(message);assert.equal(message.nodeValue,'Sign in');
  i.setLanguage('fr');i.apply(message);assert.equal(message.nodeValue,'Se connecter');
});
