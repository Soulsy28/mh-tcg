'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../dist/engine.js');
const C=require('../dist/catalog.js');
function action(s,type,sourceId,extra={}) {
  const a=E.getActions(s,C).find(a=>a.type===type&&(!sourceId||a.sourceId===sourceId));
  assert.ok(a,`Action ${type} ${sourceId||''} disponible`);
  return E.dispatch(s,{...a,...extra},C);
}
function settle(s,max=200) {
  for(let i=0;i<max&&s.winner==null;i++) {
    if(s.phase==='main'&&!s.pending&&!s.stack.length&&!s.combat)return s;
    const actions=E.getActions(s,C), a=actions.find(a=>a.type==='skip')||actions.find(a=>a.type==='choose')||actions.find(a=>a.type==='pass');
    assert.ok(a,'Une continuation est disponible');
    s=E.dispatch(s,{...a,targetIds:(a.targets||[]).slice(0,a.targetMin||0).map(t=>t.id),choiceId:a.choices?.[0]?.id},C);
  }
  assert.ok(s.winner!=null||s.phase==='main','La résolution se termine');return s;
}
function base(){let s=E.createGame(C,{seed:71});s=action(s,'keep');s=action(s,'keep');s.hunting=[];s.stack=[];s.pending=null;s.triggers=[];s.decisions=[];s.combat=null;s.phase='main';s.flow='main';for(const p of s.players){p.hand=[];p.camp=[];p.items=[];p.discard=[];p.rations={ready:10,tapped:0,deck:2};}return s;}
function add(s,id,p,zone='hand',extra={}){const c={uid:'reg'+(++s.seq),cardId:id,owner:p,controller:p,incarnation:0,tapped:false,damage:0,counters:{},mods:[],used:{},overexerted:false,...extra};if(zone==='hunting')s.hunting.push(c);else s.players[p][zone].push(c);return c;}
test('Zero ajoute sa ration même lorsque sa source a quitté le terrain avant résolution',()=>{
  let s=base();const zero=add(s,'013',0,'camp',{damage:3}),steak=add(s,'021',0);
  s=action(s,'play',steak.uid);assert.equal(s.stack.at(-1).kind,'zero');
  // Fixture d'une source quittant le terrain après le déclenchement : la capacité
  // déjà dans la pile reste indépendante. La suite de l'effet est encore possible.
  const source=s.players[0].camp.splice(0,1)[0];source.incarnation++;source.damage=0;s.players[0].discard.push(source);
  const before=s.players[0].rations.deck;s=action(action(s,'pass'),'pass');
  assert.equal(s.players[0].rations.deck,before-1);
  assert.equal(s.players[0].rations.tapped,4); // 3 payées pour Steak, +1 ration engagée de Zero.
  assert.equal(s.players[0].discard.find(c=>c.uid===zero.uid).damage,0);
  assert.equal(s.stack.at(-1).cardId,'021');
});
test('changer de zone efface le prochain dégagement bloqué par Fatalis',()=>{
  let s=base();const eva=add(s,'124',0,'camp',{skipNextUntap:true});
  s=action(s,'ability',eva.uid);const returned=s.players[0].hand.find(c=>c.uid===eva.uid);
  assert.equal(returned.skipNextUntap,false);assert.equal(returned.tapped,false);
  s=settle(s);s=settle(action(s,'play',eva.uid));assert.ok(s.players[0].camp.find(c=>c.uid===eva.uid).tapped);
  s=settle(action(s,'endturn'));s=settle(action(s,'endturn'));
  assert.equal(s.activePlayer,0);assert.equal(s.players[0].camp.find(c=>c.uid===eva.uid).tapped,false);
});
for(const seed of [31,47,139,911]) test('partie automatisée complète avec cartes et attaques — graine '+seed,t=>{
  let s=E.createGame(C,{seed}),r=seed,casts=0,attacks=0,choices=0,steps=0;
  const random=()=>{r=(Math.imul(1664525,r)+1013904223)>>>0;return r/4294967296;};
  const choose=xs=>xs[Math.floor(random()*xs.length)];
  for(;steps<10000&&s.winner==null;steps++){
    const as=E.getActions(s,C);assert.ok(as.length,`Étape ${steps} possède des actions`);
    let a;
    if(s.phase==='mulligan')a=as.find(a=>a.type==='keep');
    else if(s.pending)a=as.find(a=>a.type==='choose')||as.find(a=>a.type==='skip');
    else if(s.phase==='main'&&!s.combat&&!s.stack.length){
      const attacksNow=as.filter(a=>a.type==='attack');
      const creatures=as.filter(a=>a.type==='play'&&['hunter','large','small'].includes(E.getCard(C,s.players[a.player].hand.find(c=>c.uid===a.sourceId)?.cardId)?.type));
      const plays=as.filter(a=>a.type==='play');const abilities=as.filter(a=>a.type==='ability');
      if(attacksNow.length&&random()<0.7)a=choose(attacksNow);
      else if(creatures.length)a=choose(creatures);
      else if(plays.length&&random()<0.75)a=choose(plays);
      else if(abilities.length&&random()<0.65)a=choose(abilities);
      else a=as.find(a=>a.type==='endturn')||choose(as);
    }else{
      const reflex=as.filter(a=>a.type==='play');const interposes=as.filter(a=>a.type==='interpose');
      if(interposes.length&&random()<0.4)a=choose(interposes);
      else if(reflex.length&&random()<0.12)a=choose(reflex);
      else a=as.find(a=>a.type==='pass')||as.find(a=>a.type==='skip')||choose(as);
    }
    const selected={...a};
    if(a.choices?.length)selected.choiceId=choose(a.choices).id;
    if(a.targets?.length){
      const min=a.targetMin??a.targetCount??0,max=Math.min(a.targetCount??0,a.targets.length);
      let opts=a.targets.slice();
      if(a.type==='attack')opts.sort((x,y)=>{
        const cx=s.hunting.find(c=>c.uid===x.id),cy=s.hunting.find(c=>c.uid===y.id);
        const dx=E.getCard(C,cx.cardId),dy=E.getCard(C,cy.cardId);
        return (dy.type==='large')-(dx.type==='large')||(dx.hp-cx.damage)-(dy.hp-cy.damage);
      });else opts=opts.sort(()=>random()-.5);
      selected.targetIds=opts.slice(0,Math.max(min,max)).map(x=>x.id);
    }
    if(a.type==='play')casts++;if(a.type==='attack')attacks++;if(a.type==='choose')choices++;
    s=E.dispatch(s,selected,C);
    for(const p of s.players){assert.equal(p.rations.ready+p.rations.tapped+p.rations.deck,12);assert.ok(p.rations.ready>=0&&p.rations.tapped>=0&&p.rations.deck>=0);assert.ok(p.camp.length<=5);}
  }
  assert.ok(s.winner===0||s.winner===1,'La partie se termine avant 10 000 actions');
  assert.ok(casts>0,'Des cartes ont réellement été jouées');assert.ok(attacks>0,'Des attaques ont réellement été déclarées');
  t.diagnostic(JSON.stringify({seed,steps,casts,attacks,choices,turn:s.turn,winner:s.winner,scores:s.players.map(p=>p.score)}));
});
