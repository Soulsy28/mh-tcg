'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Table=require('../dist/table.js');
const Catalog=require('../dist/catalog.js');
const Auto=require('../dist/engine.js');
const actions=s=>Table.getActions(s,Catalog);
function act(s,id,extra={}){const a=actions(s).find(a=>a.id===id);assert.ok(a,'Action absente : '+id);return Table.dispatch(s,{...a,...extra},Catalog);}
function started(){let s=Table.createGame(Catalog,{seed:72,decks:Auto.STARTER_DECKS,names:['Alice','Bastien']});s=act(s,'keep');return act(s,'keep');}
function put(s,id,player,zone,tapped=false){const c={uid:'fixture-'+(++s.seq),cardId:id,owner:player,controller:player,tapped,damage:0,counters:{},mods:[],used:{},incarnation:0};if(zone==='hunting')s.hunting.push(c);else s.players[player][zone].push(c);return c;}
function ability(s,c,extra={}){const a=actions(s).find(a=>a.sourceId===c.uid&&a.type==='ability');assert.ok(a,'Capacité absente : '+c.cardId);return Table.dispatch(s,{...a,choiceId:a.choices[0].id,...extra},Catalog);}
const passes=s=>act(act(s,'pass'),'pass');
const finish=s=>act(s,'finish-resolution:'+s.pending.entry.uid);

test('pile : la carte annoncée reste hors terrain jusqu’à deux passes successives',()=>{
  let s=started();const c=put(s,'003',0,'hand');s.players[0].pool=10;
  const original=structuredClone(s);s=act(s,'play:'+c.uid);
  assert.deepEqual(original.players[0].hand.at(-1),c);assert.equal(original.stack.length,0);
  assert.equal(s.players[0].hand.some(x=>x.uid===c.uid),false);assert.equal(s.hunting.some(x=>x.uid===c.uid),false);
  assert.equal(s.stack.at(-1).kind,'cast');assert.equal(s.stack.at(-1).sourceCardId,'003');assert.equal(s.priorityPlayer,0);
  s=act(s,'pass');assert.equal(s.stack.length,1);assert.equal(s.priorityPlayer,1);
  s=act(s,'pass');assert.equal(s.stack.length,0);assert.ok(s.hunting.some(x=>x.uid===c.uid));assert.equal(s.priorityPlayer,0);
});

test('pile LIFO : l’actif peut passer et l’autre joueur répondre, puis nouvelle fenêtre après chaque effet',()=>{
  let s=started();const monster=put(s,'003',0,'hand'),target=put(s,'003',0,'hunting'),response=put(s,'104',1,'hand');
  s.players.forEach(p=>p.pool=10);s=act(s,'play:'+monster.uid);const bottom=s.stack[0].uid;
  s=act(s,'pass');assert.equal(s.priorityPlayer,1);assert.ok(actions(s).some(a=>a.id==='play:'+response.uid));
  s=act(s,'play:'+response.uid,{targetIds:[target.uid]});const top=s.stack.at(-1).uid;
  assert.equal(s.priorityPlayer,0);assert.equal(s.passCount,0);assert.deepEqual(s.stack.map(e=>e.uid),[bottom,top]);
  s=passes(s);assert.equal(s.pending.kind,'manual-resolution');assert.equal(s.pending.entry.uid,top);assert.equal(s.stack.length,2);
  assert.ok(!actions(s).some(a=>['pass','play','ability','endturn'].includes(a.type)));
  s=finish(s);assert.deepEqual(s.stack.map(e=>e.uid),[bottom]);assert.equal(s.priorityPlayer,0);assert.equal(s.passCount,0);
  s=act(s,'pass');assert.equal(s.stack.length,1);s=act(s,'pass');assert.equal(s.stack.length,0);assert.ok(s.hunting.some(c=>c.uid===monster.uid));
  assert.ok(s.players[1].discard.some(c=>c.uid===response.uid));
});

test('une capacité activée ordinaire attend son tour, la phase principale et une pile vide',()=>{
  let s=started();const source=put(s,'011',0,'hunting'),hunter=put(s,'014',0,'camp'),spell=put(s,'003',0,'hand');s.players[0].pool=10;
  assert.ok(actions(s).some(a=>a.sourceId===source.uid&&a.type==='ability'));
  s=act(s,'play:'+spell.uid);assert.ok(!actions(s).some(a=>a.sourceId===source.uid&&a.type==='ability'));
  assert.throws(()=>Table.dispatch(s,{id:'ability:'+source.uid+':0',type:'ability',player:0,sourceId:source.uid,targetIds:[hunter.uid]},Catalog),/pas autorisée/);
  s=passes(s);s=act(s,'pass');assert.equal(s.priorityPlayer,1);assert.ok(!actions(s).some(a=>a.sourceId===source.uid&&a.type==='ability'));
});

test('F prépare une vraie capacité avec cible légale et coût d’engagement non contournable',()=>{
  let s=started();const source=put(s,'011',0,'hunting'),hunter=put(s,'014',0,'camp'),enemy=put(s,'014',1,'camp');
  const a=actions(s).find(a=>a.sourceId===source.uid&&a.type==='ability');
  assert.deepEqual(a.targets.map(t=>t.id),[hunter.uid]);
  assert.throws(()=>Table.dispatch(s,{...a,choiceId:a.choices[0].id,targetIds:[enemy.uid]},Catalog),/cibles légales/);
  assert.throws(()=>Table.dispatch(s,{...a,choiceId:'inventé',targetIds:[hunter.uid]},Catalog),/option proposée/);
  s=ability(s,source,{targetIds:[hunter.uid]});assert.equal(s.hunting.find(c=>c.uid===source.uid).tapped,true);
  assert.equal(s.stack.at(-1).kind,'ability');assert.equal(s.stack.at(-1).sourceSnapshot.tapped,false);
  s=finish(passes(s));assert.ok(!actions(s).some(a=>a.sourceId===source.uid&&a.type==='ability'));
});

test('les capacités restent dans la pile si la source revient en main en payant son coût',()=>{
  let s=started();const source=put(s,'124',0,'camp');source.mods=[{kind:'force',value:3,duration:'turn'}];source.counters.Charge=2;
  s=ability(s,source);const e=s.stack.at(-1);
  assert.ok(s.players[0].hand.some(c=>c.uid===source.uid));assert.ok(!s.players[0].camp.some(c=>c.uid===source.uid));
  assert.equal(e.sourceSnapshot.counters.Charge,2);assert.equal(e.sourceSnapshot.mods[0].value,3);
  assert.deepEqual(s.players[0].hand.find(c=>c.uid===source.uid).counters,{});
  s=passes(s);assert.equal(s.pending.entry.uid,e.uid);s=finish(s);assert.equal(s.stack.length,0);
});

test('payer Manger, [1] et engager est atomique et conserve les douze rations physiques',()=>{
  let s=started();const source=put(s,'006',0,'hunting'),target=put(s,'014',1,'camp',true);
  s=ability(s,source,{targetIds:[target.uid]});assert.deepEqual(s.players[0].rations,{ready:0,tapped:0,deck:12});assert.equal(s.hunting.find(c=>c.uid===source.uid).tapped,true);
  s=finish(passes(s));s=act(s,'tap:'+source.uid);assert.ok(!actions(s).some(a=>a.sourceId===source.uid&&a.type==='ability'));
});

test('marqueurs imprimés ajoutables puis consommés au coût d’une capacité Réflexe',()=>{
  let s=started();const source=put(s,'098',0,'camp'),target=put(s,'003',1,'hunting');
  assert.ok(!actions(s).some(a=>a.sourceId===source.uid&&a.type==='ability'&&a.clauseIndex===1));
  for(let i=0;i<2;i++)s=act(s,'marker-add:'+source.uid+':Chaleur');
  const a=actions(s).find(a=>a.sourceId===source.uid&&a.type==='ability'&&a.clauseIndex===1);
  s=Table.dispatch(s,{...a,choiceId:a.choices[0].id,targetIds:[target.uid]},Catalog);assert.equal(s.players[0].camp.find(c=>c.uid===source.uid).counters.Chaleur,0);
  s=finish(passes(s));assert.ok(!actions(s).some(a=>a.sourceId===source.uid&&a.type==='ability'&&a.clauseIndex===1));
  assert.ok(!actions(s).some(a=>a.id==='marker-remove:'+source.uid+':Chaleur'));
});

test('coût [X] Réflexe : seules les valeurs payables entre 1 et 3 sont offertes',()=>{
  let s=started();const source=put(s,'171',1,'hunting'),hunter=put(s,'014',0,'camp'),target=put(s,'003',1,'hunting');
  s.players[1].pool=2;s=act(s,'attack:'+hunter.uid,{targetIds:[target.uid]});s=passes(s);s=act(s,'pass');
  const a=actions(s).find(a=>a.type==='ability'&&a.sourceId===source.uid);assert.ok(a);
  assert.deepEqual(a.costOptions.map(c=>c.cost),[1,2]);assert.deepEqual(a.targets.map(t=>t.id),[hunter.uid]);
  s=Table.dispatch(s,{...a,choiceId:a.choices[1].id,targetIds:[hunter.uid]},Catalog);assert.equal(s.players[1].pool,0);assert.equal(s.hunting.find(c=>c.uid===source.uid).tapped,true);
});

test('sacrifice et défausse de coût sont payés avant les réponses et conservés dans l’historique',()=>{
  let s=started();const source=put(s,'095',0,'hunting'),item=put(s,'188',0,'items'),target=put(s,'003',1,'hunting');
  s=ability(s,source,{targetIds:[target.uid]});assert.ok(s.players[0].discard.some(c=>c.uid===item.uid));assert.equal(s.players[0].items.length,0);assert.equal(s.stack.length,1);
  s=finish(passes(s));const discardSource=put(s,'067',0,'hunting');s.players[0].pool=1;const handId=s.players[0].hand[0].uid;
  const a=actions(s).find(a=>a.sourceId===discardSource.uid&&a.type==='ability');const choice=a.costOptions.find(c=>c.otherId===handId);
  s=Table.dispatch(s,{...a,choiceId:choice.id},Catalog);assert.ok(s.players[0].discard.some(c=>c.uid===handId));assert.equal(s.players[0].pool,0);
  assert.ok(s.log.some(e=>e.text.includes('paie le coût : défausse')));
});

test('un contre manuel retire l’élément plus ancien sans le résoudre ni rembourser ses coûts',()=>{
  let s=started();const target=put(s,'014',0,'camp'),spell=put(s,'110',0,'hand'),counter=put(s,'140',1,'hand');
  s.players.forEach(p=>p.pool=10);s=act(s,'play:'+spell.uid,{targetIds:[target.uid]});const bottom=s.stack.at(-1).uid,paid=s.players[0].pool;
  s=act(s,'pass');s=act(s,'play:'+counter.uid,{targetIds:[bottom]});const top=s.stack.at(-1).uid;s=passes(s);
  s=act(s,'counter:'+bottom);assert.deepEqual(s.stack.map(e=>e.uid),[top]);assert.ok(s.players[0].discard.some(c=>c.uid===spell.uid));assert.equal(s.players[0].pool,paid);
  s=finish(s);assert.equal(s.stack.length,0);assert.equal(s.players[0].camp.find(c=>c.uid===target.uid).damage,0);
});

test('les contres de Techniques excluent capacités, cartes alliées et coûts trop élevés',()=>{
  let s=started();const source=put(s,'011',0,'hunting'),hunter=put(s,'014',0,'camp'),counter=put(s,'140',1,'hand');s.players[1].pool=10;
  s=ability(s,source,{targetIds:[hunter.uid]});s=act(s,'pass');assert.ok(!actions(s).some(a=>a.id==='play:'+counter.uid));
  s=finish(act(s,'pass'));const expensive=put(s,'054',0,'hand'),enemy=put(s,'014',1,'camp');s.players[0].pool=10;
  s=act(s,'play:'+expensive.uid,{targetIds:[enemy.uid]});s=act(s,'pass');assert.ok(!actions(s).some(a=>a.id==='play:'+counter.uid));
});

test('déclenchements manuels distincts des capacités : confirmation obligatoire sans activation d’un texte statique',()=>{
  let s=started();const source=put(s,'010',0,'hunting'),trigger=put(s,'032',0,'hunting');
  assert.ok(!actions(s).some(a=>a.sourceId===source.uid&&['ability','manual-trigger'].includes(a.type)));
  const a=actions(s).find(a=>a.sourceId===trigger.uid&&a.type==='manual-trigger');assert.ok(a);assert.equal(a.choices[0].id,'confirm');
  assert.throws(()=>Table.dispatch(s,a,Catalog),/option proposée/);
  s=Table.dispatch(s,{...a,choiceId:'confirm'},Catalog);assert.equal(s.stack.at(-1).kind,'trigger');assert.equal(s.stack.at(-1).sourceCardId,'032');
});

test('ciblage de défausse et cibles facultatives multiples restent utilisables depuis F',()=>{
  let s=started();const source=put(s,'157',0,'items'),discard=put(s,'003',0,'discard'),flute=put(s,'019',0,'items'),a=put(s,'014',0,'camp'),b=put(s,'015',0,'camp');s.players[0].pool=10;
  const cargo=actions(s).find(x=>x.sourceId===source.uid&&x.type==='ability');assert.deepEqual(cargo.targets.map(t=>t.id),[discard.uid]);
  const song=actions(s).find(x=>x.sourceId===flute.uid&&x.type==='ability');assert.equal(song.targetMin,0);assert.equal(song.targetCount,2);
  s=Table.dispatch(s,{...song,choiceId:song.choices[0].id,targetIds:[a.uid,b.uid]},Catalog);assert.equal(s.players[0].items.find(c=>c.uid===flute.uid).tapped,true);assert.equal(s.players[0].camp.find(c=>c.uid===a.uid).tapped,true);
});

test('interrompre le combat pendant un effet adverse ne change pas son résolveur',()=>{
  let s=started();const hunter=put(s,'014',0,'camp'),monster=put(s,'003',1,'hunting'),response=put(s,'104',1,'hand');s.players[1].pool=10;
  s=act(s,'attack:'+hunter.uid,{targetIds:[monster.uid]});s=passes(s);s=act(s,'pass');s=act(s,'play:'+response.uid,{targetIds:[monster.uid]});s=passes(s);assert.equal(s.priorityPlayer,1);
  s=act(s,'return:'+monster.uid);assert.equal(s.combat,null);assert.equal(s.pending.kind,'manual-resolution');assert.equal(s.priorityPlayer,1);assert.equal(s.phase,'resolving');
  s=finish(s);assert.equal(s.pending,null);assert.equal(s.priorityPlayer,0);assert.equal(s.phase,'main');
});

test('sauvegarder une pile ou un effet en cours conserve exactement les options et résultats',()=>{
  let s=started();const source=put(s,'124',0,'camp');s=ability(s,source);
  const copy=JSON.parse(JSON.stringify(s));assert.deepEqual(actions(copy),actions(s));assert.deepEqual(passes(copy),passes(s));
  s=passes(s);const pendingCopy=JSON.parse(JSON.stringify(s));assert.deepEqual(actions(pendingCopy),actions(s));assert.deepEqual(finish(pendingCopy),finish(s));
});
