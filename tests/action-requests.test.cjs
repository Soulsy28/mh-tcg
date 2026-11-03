'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ActionRequests}=require('../dist/match.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('un accusé identique confirme une seule action et nettoie son attente',async()=>{
  const requests=new ActionRequests({timeoutMs:40});let id,settled=false;
  const promise=requests.send(value=>{id=value;});promise.then(()=>settled=true);
  assert.equal(id,1);assert(requests.pending);
  assert.equal(requests.ack(99),false);assert.equal(requests.ack('1'),false);assert.equal(requests.ack(undefined),false);
  await tick();assert.equal(settled,false);assert(requests.pending);
  assert.equal(requests.ack(id),true);assert.deepEqual(await promise,{requestId:1});assert.equal(requests.pending,false);
  assert.equal(requests.ack(id),false);assert.equal(requests.cancel(),false);
});

test('une deuxième demande ne part pas avant la confirmation et les identifiants ne sont pas réutilisés',async()=>{
  const requests=new ActionRequests();let count=0;
  const first=requests.send(()=>count++);
  await assert.rejects(requests.send(()=>count++),/déjà/);assert.equal(count,1);
  requests.ack(1);await first;
  const second=requests.send(id=>{assert.equal(id,2);count++;});
  assert.equal(requests.ack(1),false);assert(requests.pending);
  requests.ack(2);await second;assert.equal(count,2);assert.equal(requests.pending,false);
});

test('un refus est associé à sa demande et une déconnexion annule l’attente',async()=>{
  const requests=new ActionRequests();const first=requests.send(()=>{});
  assert.equal(requests.fail(2,Error('mauvaise action')),false);assert(requests.pending);
  assert.equal(requests.fail(1,Error('Refus exact')),true);await assert.rejects(first,/Refus exact/);assert.equal(requests.pending,false);
  const second=requests.send(()=>{});assert.equal(requests.cancel(Error('Déconnexion')),true);await assert.rejects(second,/Déconnexion/);
  assert.equal(requests.pending,false);assert.equal(requests.ack(2),false);
});

test('la demande expire sans accusé, libère l’interface et ne confirme pas une demande suivante',async()=>{
  const requests=new ActionRequests({timeoutMs:12});
  await assert.rejects(requests.send(()=>{}),/pas confirmé/);assert.equal(requests.pending,false);
  const second=requests.send(id=>assert.equal(id,2));assert.equal(requests.ack(1),false);
  requests.ack(2);await second;assert.equal(requests.pending,false);
});

test('une erreur d’envoi synchrone ou asynchrone et un callback invalide libèrent la demande',async()=>{
  const requests=new ActionRequests();
  await assert.rejects(requests.send(null),/rappel/);assert.equal(requests.pending,false);
  await assert.rejects(requests.send(()=>{throw Error('Envoi cassé');}),/Envoi cassé/);assert.equal(requests.pending,false);
  await assert.rejects(requests.send(()=>Promise.reject(Error('Envoi async cassé'))),/Envoi async/);assert.equal(requests.pending,false);
  await assert.rejects(requests.send(()=>{throw null;}),/null/);assert.equal(requests.pending,false);
  let last;const retry=requests.send(id=>{last=id;});assert.equal(last,4);requests.ack(last);await retry;
});

test('un accusé synchrone pendant l’envoi est accepté et ne laisse aucun timeout actif',async()=>{
  const requests=new ActionRequests({timeoutMs:10});
  await requests.send(id=>requests.ack(id));assert.equal(requests.pending,false);
  await new Promise(resolve=>setTimeout(resolve,18));assert.equal(requests.pending,false);
});
