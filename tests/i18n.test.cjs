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

test('la pile traduit les annonces, résolutions, réponses et coûts sans changer les noms protégés',()=>{
  const i=I.create({storage:null,document:null});i.setLanguage('en');
  // Le plateau protège les pseudos par ces marqueurs avant d’appeler t().
  const name='\uE0000\uE001';
  assert.equal(i.t(`${name} joue Potion. La carte est ajoutée à la pile.`),`${name} plays Potion. The card is added to the stack.`);
  assert.equal(i.t(`${name} active Jumelles de terrain. L’effet est ajouté à la pile.`),`${name} activates Jumelles de terrain. The effect is added to the stack.`);
  assert.equal(i.t(`${name} déclare un déclenchement de Ellie. L’effet est ajouté à la pile.`),`${name} declares a trigger from Ellie. The effect is added to the stack.`);
  assert.equal(i.t('Résolution : Capacité : Jumelles de terrain.'),'Resolving: Ability: Jumelles de terrain.');
  assert.equal(i.t('Résolution manuelle terminée : Déclenchement : Ellie.'),'Manual resolution finished: Trigger: Ellie.');
  assert.equal(i.t('Capacité : Rathian est contrée. Les coûts payés ne sont pas remboursés.'),'Ability: Rathian is countered. Paid costs are not refunded.');
  assert.equal(i.t('Contrer : Capacité : Rathian (effet manuel)'),'Counter: Ability: Rathian (manual effect)');
  assert.equal(i.t('Passer — laisser résoudre'),'Pass — allow resolution');
  assert.equal(i.t('Terminer la résolution manuelle'),'Finish manual resolution');
  assert.equal(i.t('Chasseur ennemi engagé : Ellie, aiguiseuse d’arme'),'Tapped enemy Hunter: Ellie, aiguiseuse d’arme');
  assert.equal(i.t('Ajouter 1 marqueur Spirituel'),'Add 1 Spirit counter');
  assert.equal(i.t('Retirer 1 marqueur Quête'),'Remove 1 Quest counter');
  assert.equal(i.t('Confirmer : [2], Manger 1, engager cette carte, retirer 2 Chaleur, sacrifier Vivian, Le gourmand, conditions vérifiées'),'Confirm: [2], Eat 1, tap this card, remove 2 Heat counters, sacrifice Vivian, Le gourmand, conditions checked');
  assert.equal(i.t('Confirmer : renvoyer cette carte en main, conditions vérifiées'),'Confirm: return this card to hand, conditions checked');
  assert.equal(i.t('Confirmer : conditions vérifiées'),'Confirm: conditions checked');
  assert.equal(i.t(`${name} paie le coût : défausse Potion.`),`${name} pays the cost: discards Potion.`);
  assert.equal(i.t(`${name} : score ajusté manuellement à 5.`),`${name}: score manually adjusted to 5.`);
  assert.equal(i.t('Jumelles de terrain rejoint la défausse après sa résolution.'),'Jumelles de terrain goes to the discard pile after resolving.');
  assert.equal(i.t('Ellie arrive engagé. Déclarez ses déclenchements éventuels manuellement.'),'Ellie enters tapped. Declare any triggers manually.');
});

test('les confirmations de la table et les erreurs de flèche ou de réseau sont lisibles en anglais et réversibles',()=>{
  const i=I.create({storage:null,document:null});
  const source='Résolvez cet effet manuellement avec les outils, puis terminez sa résolution.';
  i.setLanguage('en');
  assert.equal(i.t(source),'Resolve this effect manually using the tools, then finish its resolution.');
  assert.equal(i.t('Texte canonique conservé\nTable libre : vérifiez manuellement les conditions, les cibles et les éventuels coûts complémentaires. L’effet sera résolu manuellement après les réponses.'),'Texte canonique conservé\nFree table: manually check conditions, targets and any additional costs. Resolve the effect manually after responses.');
  assert.equal(i.t('Confirmer que ce déclenchement a eu lieu et que ses conditions sont remplies'),'Confirm that this trigger occurred and its conditions are met');
  assert.equal(i.t('Efface tes flèches avant d’en ajouter : six flèches maximum par joueur.'),'Clear your arrows before adding more: up to six arrows per player.');
  assert.equal(i.t('L’hôte n’a pas confirmé cette action. Vérifie la connexion avant de réessayer.'),'The host did not confirm this action. Check the connection before trying again.');
  assert.equal(i.t('constructor'), 'constructor');
  assert.equal(i.t('<img src=x onerror=alert(1)> active Potion. L’effet est ajouté à la pile.'),'<img src=x onerror=alert(1)> activates Potion. The effect is added to the stack.','la traduction conserve les données et ne les interprète jamais comme du HTML');
  i.setLanguage('fr');assert.equal(i.t(source),source);
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
