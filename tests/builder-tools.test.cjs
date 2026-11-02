'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const B = require('../dist/builder-tools.js');
const D = require('../dist/deck-tools.js');
const C = require('../dist/catalog.js');
const E = require('../dist/engine.js');
const copy = value => JSON.parse(JSON.stringify(value));
const ids = cards => cards.map(card => card.id);

function catalogFixture() {
  return {cards:[
    {id:'chief-a',type:'chief',name:'Éva, cheffe des marées',nameEn:'Eva, Tide Chief',text:'Quand vous piochez, ajoutez une ration.',textEn:'Whenever you draw, add a ration.',colors:['Bleu','Vert'],extensionId:'Alpha'},
    {id:'chief-b',type:'chief',name:'Alice des braises',nameEn:'Zed of Embers',text:'Sacrifiez un Minerai.',textEn:'Sacrifice an Ore.',colors:['Rouge','Vert'],sourceImage:'Beta_002_fr.png'},
    {id:'chief-c',type:'chief',name:'Zora des cimes',nameEn:'Aaron of the Peaks',colors:['Vert'],extension:{id:'Beta'}},
    {id:'a',type:'hunter',name:'Chasseur bleu',nameEn:'Blue Hunter',colors:['Bleu'],cost:2},
    {id:'b',type:'item',name:'Objet rouge',nameEn:'Red Item',colors:['Rouge'],cost:3},
    {id:'c',type:'technique',name:'Double couleur',nameEn:'Two Colors',colors:['Bleu','Vert'],cost:8},
    {id:'d',type:'small',name:'Incolore',nameEn:'Colorless',colors:[],cost:0},
    {id:'token',type:'token',name:'Jeton',colors:['Bleu'],cost:0}
  ]};
}

test('les Chefs sont recherchables en FR/EN par nom, effet, couleur et extension',()=>{
  const catalog=catalogFixture(), before=JSON.stringify(catalog);
  assert.deepEqual(ids(B.getChiefChoices(catalog,{query:'EVA marees'})),['chief-a']);
  assert.deepEqual(ids(B.getChiefChoices(catalog,{query:'TIDE draw green'})),['chief-a']);
  assert.deepEqual(ids(B.getChiefChoices(catalog,{query:'ration alpha'})),['chief-a']);
  assert.deepEqual(ids(B.getChiefChoices(catalog,{query:'Sacrifice Ore'})),['chief-b']);
  assert.deepEqual(ids(B.getChiefChoices(catalog,{color:'BLUE'})),['chief-a']);
  assert.deepEqual(ids(B.getChiefChoices(catalog,{color:'rouge',extension:'BETA'})),['chief-b']);
  assert.deepEqual(ids(B.getChiefChoices(catalog,{extension:'Alpha',query:'piochez'})),['chief-a']);
  assert.equal(B.getChiefChoices(catalog,{query:'introuvable'}).length,0);
  assert.equal(B.getChiefChoices(catalog,{color:'Rouge',extension:'Alpha'}).length,0);
  assert.equal(JSON.stringify(catalog),before);
});

test('le tri suit le nom affiché et garde les Chefs non automatisés disponibles',()=>{
  const catalog=catalogFixture();
  assert.deepEqual(ids(B.getChiefChoices(catalog,{language:'fr'})),['chief-b','chief-a','chief-c']);
  assert.deepEqual(ids(B.getChiefChoices(catalog,{language:'en'})),['chief-c','chief-a','chief-b']);
  assert.equal(B.getChiefChoices(C).length,C.cards.filter(card=>card.type==='chief').length);
  assert(B.getChiefChoices(C).some(card=>!E.SUPPORTED_IDS.includes(card.id)));
});

test('un catalogue futur de 1000 Chefs reste entièrement disponible et filtrable',()=>{
  const chiefs=Array.from({length:1000},(_,index)=>({id:'future-'+index,type:'chief',name:'Chef '+index,nameEn:'Chief '+index,text:index%2?'Soin':'Pioche',textEn:index%2?'Heal':'Draw',colors:index%2?['Rouge']:['Bleu'],extensionId:index<500?'A':'B'}));
  const catalog={cards:[...chiefs,{id:'not-chief',type:'hunter',name:'Chef Chasseur',colors:['Bleu']}]};
  const before=JSON.stringify(catalog);
  assert.equal(B.getChiefChoices(catalog).length,1000);
  const result=B.getChiefChoices(catalog,{color:'blue',extension:'B',query:'draw'});
  assert.equal(result.length,250);
  assert(result.every(card=>card.type==='chief'&&card.id.startsWith('future-')));
  assert.equal(JSON.stringify(catalog),before);
});

test('le changement de Chef compte les exemplaires incompatibles sans toucher le deck',()=>{
  const catalog=catalogFixture(),deck={id:'deck-1',chiefId:'chief-a',name:'Deck personnel',cards:['a','a','a','c','d'],nested:{note:'préservée'}};
  const before=JSON.stringify(deck);
  const impact=B.getChiefChangeImpact(deck,'chief-b',catalog);
  assert.deepEqual(impact,{valid:true,chiefId:'chief-b',incompatibleIds:['a','a','a','c'],incompatibleCards:[{id:'a',count:3,name:'Chasseur bleu',nameEn:'Blue Hunter'},{id:'c',count:1,name:'Double couleur',nameEn:'Two Colors'}],removedCount:4,keptCount:1});
  assert.equal(JSON.stringify(deck),before);
  assert.deepEqual(B.getChiefChangeImpact(deck,'chief-a',catalog).incompatibleIds,[]);
});

test('le Chef choisi est validé et les cartes inconnues ou hors deck restent signalées',()=>{
  const catalog=catalogFixture(), deck={chiefId:'chief-a',cards:['a','missing','token','chief-c']};
  assert.equal(B.getChiefChangeImpact(deck,'missing',catalog).valid,false);
  assert.equal(B.getChiefChangeImpact(deck,'a',catalog).valid,false);
  assert.throws(()=>B.changeChief(deck,'missing',catalog),/Chef/);
  assert.throws(()=>B.changeChief(deck,'a',catalog),/Chef/);
  const impact=B.getChiefChangeImpact(deck,'chief-a',catalog);
  assert.deepEqual(impact.incompatibleIds,['missing','token','chief-c']);
  assert.equal(impact.removedCount,3);
});

test('aucune carte n’est retirée implicitement ; le nettoyage explicite conserve l’ordre et les données',()=>{
  const catalog=catalogFixture(),deck={id:'deck-1',chiefId:'chief-a',name:'Accueil',cards:['a','d','a','c','d'],nested:{note:'personnelle'}};
  const before=JSON.stringify(deck);
  const kept=B.changeChief(deck,'chief-b',catalog);
  assert.equal(kept.chiefId,'chief-b');
  assert.deepEqual(kept.cards,deck.cards);
  const cleaned=B.changeChief(deck,'chief-b',catalog,{removeIncompatible:true});
  assert.deepEqual(cleaned.cards,['d','d']);
  assert.equal(cleaned.name,'Accueil');
  assert.equal(cleaned.id,'deck-1');
  kept.nested.note='modifiée';cleaned.cards.push('b');
  assert.equal(JSON.stringify(deck),before);
});

test('résumé descriptif : vrais coûts, exemplaires, types et courbe sans recommandation de ratios',()=>{
  const catalog=catalogFixture(),deck={cards:['a','a','b','c','d']},before=JSON.stringify(deck);
  const summary=B.getDeckSummary(deck,catalog);
  assert.deepEqual(summary,{count:5,uniqueCount:4,remaining:45,averageCost:3,typeCounts:{large:0,small:1,hunter:2,item:1,technique:1},curve:[{cost:0,label:'0',count:1},{cost:1,label:'1',count:0},{cost:2,label:'2',count:2},{cost:3,label:'3',count:1},{cost:4,label:'4',count:0},{cost:5,label:'5',count:0},{cost:6,label:'6',count:0},{cost:7,label:'7+',count:1}]});
  assert.deepEqual(summary.curve,D.getCurve(deck,catalog));
  assert.equal(JSON.stringify(deck),before);
  const invalid=B.getDeckSummary({cards:['chief-a','token','missing']},catalog);
  assert.equal(invalid.count,3);
  assert.equal(invalid.averageCost,0);
  assert.equal(invalid.curve.reduce((sum,bar)=>sum+bar.count,0),0);
  assert.equal(B.getDeckSummary({},catalog).remaining,50);
  assert.equal(B.getDeckSummary({cards:Array(52).fill('a')},catalog).remaining,0);
});

test('annuler et rétablir rendent des copies ; une nouvelle modification invalide le rétablissement',()=>{
  const history=B.createHistory(),first={chiefId:'a',cards:[],nested:{n:1}},second={chiefId:'b',cards:['x'],nested:{n:2}},third={chiefId:'c',cards:['x','y'],nested:{n:3}};
  assert.equal(history.undo(first),null);assert.equal(history.redo(first),null);
  history.record(first);history.record(second);
  first.nested.n=99;
  assert.equal(history.canUndo(),true);assert.equal(history.canRedo(),false);
  const undo=history.undo(third);
  assert.deepEqual(undo,second);
  undo.nested.n=77;
  assert.deepEqual(history.redo(undo),third);
  assert.deepEqual(history.undo(third),undo);
  const earliest=history.undo(second);
  assert.equal(earliest.nested.n,1);
  history.record(earliest);
  assert.equal(history.canRedo(),false);
  assert.equal(history.redo(earliest),null);
});

test('historique borné, dédoublonné et isolé entre decks',()=>{
  const a=B.createHistory({limit:2}),b=B.createHistory();
  a.record({n:0});a.record({n:0});a.record({n:1});a.record({n:2});
  assert.deepEqual(a.undo({n:3}),{n:2});
  assert.deepEqual(a.undo({n:2}),{n:1});
  assert.equal(a.undo({n:1}),null);
  assert.equal(b.canUndo(),false);assert.equal(b.canRedo(),false);
  assert.deepEqual(a.redo({n:1}),{n:2});
  assert.deepEqual(a.redo({n:2}),{n:3});
  a.clear();assert.equal(a.canUndo(),false);assert.equal(a.canRedo(),false);
  for(const limit of [0,-1,1.5,Infinity,NaN])assert.throws(()=>B.createHistory({limit}),RangeError);
});

test('le module navigateur reste utilisable sans dépendance facultative',()=>{
  const context={};vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/builder-tools.js'),'utf8'),context);
  assert.equal(context.MHBuilderTools.getChiefChoices(catalogFixture(),{query:'EVA MAREES'}).length,1);
  assert.equal(context.MHBuilderTools.getDeckSummary({cards:['a']},catalogFixture()).count,1);
});
