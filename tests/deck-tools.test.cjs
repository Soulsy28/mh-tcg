'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../dist/catalog.js');
const E = require('../dist/engine.js');
const D = require('../dist/deck-tools.js');
const copy = value => JSON.parse(JSON.stringify(value));
const ids = cards => cards.map(card => card.id);

test('le catalogue actuel possède 203 cartes uniques et une seule extension connue MhFG', () => {
  const cards=D.filterCards(C);
  assert.equal(cards.length,203);
  assert.equal(new Set(ids(cards)).size,203);
  assert.equal(cards.find(card=>card.id==='003').name,'Rathian d’or, reine indomptable');
  assert.deepEqual(D.getExtensions(C),[{id:'MhFG',name:'MhFG',count:203}]);
  assert.equal(D.filterCards(C,{extension:'mhfg'}).length,203);
  assert.equal(D.filterCards(C,{extension:'extension-inventee'}).length,0);
});

test('normalisation : accents, ligatures, casse, apostrophes et traits d’union', () => {
  assert.equal(D.normalize('  ÉPÉE — longue d’OR  '),'epee longue d or');
  assert.equal(D.normalize('Cœur de l\'Ancien'),'coeur de l ancien');
  assert.equal(D.normalize('Lao-Shan_Lung'),'lao shan lung');
  assert.deepEqual(ids(D.filterCards(C,{search:'zora apaise foret'})),['014']);
  assert.deepEqual(ids(D.filterCards(C,{search:'ZORA APAISÉ FORÊT'})),['014']);
});

test('recherche par nom, type et sous-type ; plusieurs termes combinés', () => {
  const rathian=D.filterCards(C,{search:'RATHIAN'});
  assert(rathian.length>2);
  assert(rathian.some(card=>card.id==='003'));
  assert(rathian.every(card=>D.normalize([card.name,card.nameEn,card.typeLabel,...card.subtypes].join(' ')).includes('rathian')));
  const wyvernes=D.filterCards(C,{search:'wyverne volante'});
  assert(wyvernes.length>10);
  assert(wyvernes.every(card=>card.subtypes.some(type=>D.normalize(type)==='wyverne volante')));
  const dragons=D.filterCards(C,{search:'dragon ancien'});
  assert(dragons.length>=2);
  assert(dragons.every(card=>card.subtypes.some(type=>D.normalize(type)==='dragon ancien')));
  const lances=D.filterCards(C,{search:'lance'});
  assert(lances.some(card=>card.id==='042'));
  assert(lances.some(card=>card.id==='044'));
  assert(lances.some(card=>card.id==='179'));
  assert.deepEqual(ids(D.filterCards(C,{search:'petitmonstre'})),ids(D.filterCards(C,{type:'small'})));
  assert.deepEqual(ids(D.filterCards(C,{search:'Petit Monstre Vert'})),['008','009','010','011']);
});

test('recherche bilingue et identifiant complet ; hyphens et espaces équivalents', () => {
  assert.deepEqual(ids(D.filterCards(C,{search:'Sleeping Dragon'})),['001']);
  assert.deepEqual(ids(D.filterCards(C,{search:'MhFG-003'})),['003']);
  assert.deepEqual(ids(D.filterCards(C,{search:'lao shan lung'})),['001','174']);
  assert.deepEqual(ids(D.filterCards(C,{search:'lao-shan-lung'})),['001','174']);
});

test('filtres combinés couleur, type, coût, compatibilité et jetons', () => {
  const filtered=D.filterCards(C,{extension:'MhFG',color:'vert',type:'Chasseur',cost:{min:3,max:5}});
  assert(filtered.length>0);
  assert(filtered.every(card=>card.type==='hunter'&&card.colors.includes('Vert')&&card.cost>=3&&card.cost<=5));
  assert.equal(D.filterCards(C,{color:'Vert',type:'PetitMonstre'}).length,4);
  assert.equal(D.filterCards(C,{type:'Monstre'}).length,72);
  assert.equal(D.filterCards(C,{type:'chief'}).length,7);
  assert(D.filterCards(C,{compatibleColors:['Vert','Violet']}).every(card=>card.colors.every(color=>['Vert','Violet'].includes(color))));
  assert.equal(D.filterCards(C,{compatibleColors:[]}).length,0);
  assert.equal(D.filterCards(C,{includeTokens:true}).length,205);
  assert.equal(D.filterCards(C,{type:'token'}).length,0);
  assert.equal(D.filterCards(C,{type:'token',includeTokens:true}).length,2);
  assert(D.filterCards(C,{cost:'7+'}).every(card=>card.cost>=7));
  assert(D.filterCards(C,{cost:'3'}).every(card=>card.cost===3));
});

test('tri sans mutation ; coûts non applicables après les autres valeurs', () => {
  const initial=ids(C.cards),before=JSON.stringify(C);
  const asc=D.filterCards(C,{sort:'cost'}),desc=D.filterCards(C,{sort:'cost-desc'});
  const costs=asc.filter(card=>card.cost!==null).map(card=>card.cost);
  assert.deepEqual(costs,[...costs].sort((a,b)=>a-b));
  assert.equal(asc.at(-1).type,'chief');
  assert.equal(desc[0].cost,12);
  assert.equal(desc.at(-1).type,'chief');
  assert.equal(D.filterCards(C,{sort:'id-desc'})[0].id,'203');
  assert.deepEqual(ids(C.cards),initial);
  assert.equal(JSON.stringify(C),before);
});

test('construction : 50 cartes, maximum 3, couleurs du Chef et exclusion des jetons/Chefs', () => {
  for(const starter of E.STARTER_DECKS) {
    const result=D.validateDeck(starter,C,{supportedIds:E.SUPPORTED_IDS});
    assert.equal(result.valid,true,result.errors.join(' '));
    assert.equal(result.count,50);
    assert.equal(result.automated,true);
    assert.equal(Object.values(result.counts).reduce((a,b)=>a+b,0),50);
  }
  const base=copy(E.STARTER_DECKS[0]);
  assert.equal(D.validateDeck({...base,cards:base.cards.slice(0,49)},C).valid,false);
  assert.equal(D.validateDeck({...base,cards:[...base.cards,'001']},C).valid,false);
  const four=copy(base);four.cards[4]='001';
  assert(D.validateDeck(four,C).errors.some(error=>error.includes('Maximum 3')));
  const offColor=copy(base);offColor.cards[0]='169';
  assert(D.validateDeck(offColor,C).errors.some(error=>error.includes('couleurs')));
  for(const id of ['202','token-fiole','missing','1','MhFG-001']) {
    const invalid=copy(base);invalid.cards[0]=id;
    assert.equal(D.validateDeck(invalid,C).valid,false,id);
  }
});

test('les sept Chefs et cartes non automatisées restent permis dans le builder', () => {
  for(const chief of C.cards.filter(card=>card.type==='chief')) {
    const compatible=C.cards.filter(card=>card.type!=='chief'&&card.type!=='token'&&card.colors.every(color=>chief.colors.includes(color)));
    const cards=compatible.slice(0,17).flatMap((card,index)=>Array(index===16?2:3).fill(card.id));
    const value={chiefId:chief.id,cards};
    const result=D.validateDeck(value,C,{supportedIds:[]});
    assert.equal(result.valid,true,result.errors.join(' '));
    assert.equal(result.automated,false);
    assert.equal(D.validateDeck(value,C,{automatedOnly:true,supportedIds:[]}).valid,false);
  }
});

test('courbe et comptage conservent les identifiants et ignorent les éléments non jouables', () => {
  assert.deepEqual(D.groupCounts(['035','035','001']),{'035':2,'001':1});
  const counts=D.groupCounts(['__proto__']);
  assert.equal(Object.prototype.hasOwnProperty.call(counts,'__proto__'),true);
  assert.equal(counts.__proto__,1);
  const curve=D.getCurve({cards:['001','001','018','021','202','token-fiole','inconnue']},C);
  assert.equal(curve.length,8);
  assert.equal(curve[7].label,'7+');
  assert.equal(curve[7].count,2);
  assert.equal(curve[2].count,1);
  assert.equal(curve[3].count,1);
  assert.equal(curve.reduce((sum,bar)=>sum+bar.count,0),4);
  assert.deepEqual(D.getCurve({cards:[]},C).map(bar=>bar.count),Array(8).fill(0));
});
