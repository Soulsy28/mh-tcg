/* MH TCG — moteur local déterministe. Les données viennent du catalogue Drive actuel. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MHEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const DECK_A = ['001','008','010','011','013','014','015','018','020','021','023','114','124','126','130','132','140'];
  const DECK_B = ['031','032','036','037','038','042','043','044','045','047','048','051','053','055','065','069','078'];
  const SUPPORTED_IDS = [...DECK_A, ...DECK_B, '118', '202', '203'];
  const STARTER_DECKS = [
    {name:'Canopée et bourrasques', chiefId:'202', cards:DECK_A.flatMap((id,i)=>Array(i===16?2:3).fill(id))},
    {name:'La meute des dunes', chiefId:'203', cards:DECK_B.flatMap((id,i)=>Array(i===16?2:3).fill(id))}
  ];
  const TYPES = {large:'Grand Monstre',small:'Petit Monstre',hunter:'Chasseur',item:'Objet',technique:'Technique',chief:'Chef'};
  const REFLEX = new Set(['028','051','055','132','140']);
  const PERSISTENT = new Set(['130']);
  const clone = x=>JSON.parse(JSON.stringify(x));
  const supports = id=>SUPPORTED_IDS.includes(String(id).replace(/^MhFG-/, '').padStart(3,'0'));
  function getCard(catalog,id) {
    const cards = Array.isArray(catalog) ? catalog : catalog.cards;
    return cards.find(c=>c.id===String(id).replace(/^MhFG-/, '').padStart(3,'0'));
  }
  // Public history must never include the identity of a card drawn from a hidden zone.
  function log(s,text) { s.log.push({text,turn:s.turn,public:true}); if(s.log.length>250)s.log.shift(); }
  function next(s) { s.seq++; return s.seq; }
  function rng(s) { s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0; return s.seed/4294967296; }
  function shuffle(s,arr) { const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng(s)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; }
  function makeInstance(s,id,p) { return {uid:'c'+next(s),cardId:id,owner:p,controller:p,incarnation:0,tapped:false,damage:0,counters:{},mods:[],used:{},overexerted:false}; }
  function board(s) { return [...s.hunting,...s.players.flatMap(p=>[p.chief,...p.camp,...p.items])]; }
  function creatures(s) { return [...s.hunting,...s.players.flatMap(p=>p.camp)]; }
  function instances(s) { return [...board(s),...s.players.flatMap(p=>[...p.hand,...p.deck,...p.discard]),...s.stack.filter(e=>e.card).map(e=>e.card)]; }
  function find(s,uid) { return instances(s).find(c=>c.uid===uid); }
  function onBoard(s,uid) { return board(s).find(c=>c.uid===uid); }
  function def(s,c,catalog) { return c && getCard(catalog,c.cardId); }
  function stats(s,uid,catalog) {
    const c=typeof uid==='object'?uid:find(s,uid); if(!c)return null;
    const d=getCard(catalog,c.cardId); if(!d)return null;
    const mods=c.mods||[];
    const fixed=mods.filter(m=>m.kind==='setForce').slice(-1)[0];
    let force=d.force==null?null:(fixed?fixed.value:d.force)+mods.filter(m=>m.kind==='force').reduce((a,m)=>a+m.value,0);
    if(c.cardId==='014'&&c.counters.Spirituel)force++;
    if(force!=null)force=Math.max(0,force);
    const armor=mods.filter(m=>m.kind==='armor').reduce((a,m)=>a+m.value,0);
    const keywords=[];
    if(c.cardId==='010')keywords.push('Interposition');
    if(c.cardId==='118')keywords.push('Provocation');
    if(armor)keywords.push('Cuirasse '+armor);
    return {force,hp:d.hp==null?null:d.hp,remainingHp:d.hp==null?null:Math.max(0,d.hp-c.damage),armor,keywords};
  }
  function validateDeck(deck,catalog) {
    const errors=[]; const chief=getCard(catalog,deck&&deck.chiefId);
    if(!chief||chief.type!=='chief')errors.push('Choisissez un Chef de chasse.');
    else if(!supports(chief.id))errors.push('Ce Chef ne fait pas encore partie des cartes automatisées.');
    const ids=deck&&Array.isArray(deck.cards)?deck.cards:[];
    if(ids.length!==50)errors.push('Le deck principal doit contenir exactement 50 cartes.');
    const counts={};
    for(const id of ids){
      const d=getCard(catalog,id); counts[id]=(counts[id]||0)+1;
      if(!d)errors.push('Carte inconnue : '+id);
      else if(!supports(id))errors.push(d.name+' : effet pas encore automatisé.');
      else if(d.type==='chief'||d.type==='token')errors.push(d.name+' ne va pas dans le deck principal.');
      else if(chief&&!d.colors.every(c=>chief.colors.includes(c)))errors.push(d.name+' ne correspond pas aux couleurs du Chef.');
    }
    for(const [id,n] of Object.entries(counts))if(n>3)errors.push('Maximum 3 exemplaires de '+(getCard(catalog,id)?.name||id)+'.');
    return {valid:errors.length===0,errors:[...new Set(errors)],count:ids.length};
  }
  function createGame(catalog,options={}) {
    const decks=options.decks||STARTER_DECKS;
    if(decks.length!==2)throw Error('Une partie nécessite deux decks.');
    decks.forEach(d=>{const v=validateDeck(d,catalog);if(!v.valid)throw Error(v.errors.join(' '));});
    const s={version:1,catalogVersion:catalog.version||'2026-11-01',seq:0,seed:((options.seed??Date.now())>>>0)||1,players:[],hunting:[],turn:0,activePlayer:options.firstPlayer===1?1:0,priorityPlayer:0,phase:'mulligan',stack:[],combat:null,pending:null,winner:null,log:[],flow:'setup',passCount:0,triggers:[],decisions:[],turnFlags:{smallDied:false},mulliganDone:[false,false]};
    decks.forEach((d,p)=>{
      const player={name:(options.names||[])[p]||'Joueur '+(p+1),chief:makeInstance(s,d.chiefId,p),hand:[],deck:[],discard:[],camp:[],items:[],rations:{ready:0,tapped:0,deck:12},pool:0,score:0,mulliganUsed:false};
      s.players.push(player); player.deck=shuffle(s,d.cards.map(id=>makeInstance(s,id,p)));
      log(s,player.name+' mélange son deck.');draw(s,p,5,catalog);
    });
    s.priorityPlayer=s.activePlayer;
    log(s,'Partie créée. Chaque joueur choisit de garder sa main ou de faire un mulligan.');
    return s;
  }
  function newEntry(s,kind,p,source,extra={}) {
    return {uid:'e'+next(s),kind,player:p,sourceId:source?.uid||null,sourceCardId:source?.cardId||null,sourceSnapshot:source?clone(source):null,label:extra.label||kind,targetIds:[],...extra};
  }
  function trigger(s,kind,source,extra={}) { s.triggers.push(newEntry(s,kind,source.controller,source,extra)); }
  function addMod(s,c,kind,value,duration='turn',extra={}) { if(c)c.mods.push({kind,value,duration,turn:s.turn,combatId:s.combat?.id||null,...extra}); }
  function heal(s,c,n,catalog) { if(c&&onBoard(s,c.uid)&&getCard(catalog,c.cardId)?.type==='hunter')c.damage=Math.max(0,c.damage-n); }
  function tap(s,c,catalog) { if(!c||c.tapped)return;c.tapped=true;if(c.cardId==='015')trigger(s,'ellie',c,{label:'Ellie : +1 de Force'}); }
  function untap(s,c,catalog,atStart=false) {
    if(!c||!c.tapped)return;c.tapped=false;
    if(!atStart&&getCard(catalog,c.cardId)?.type==='hunter'&&c.damage>0){
      const chief=s.players[c.controller].chief;
      if(chief.cardId==='202'&&!chief.used.heal){chief.used.heal=true;trigger(s,'silas',chief,{targetIds:[c.uid],label:'Silas : soin après dégagement'});}
    }
  }
  function resources(s,p) { const x=s.players[p];return x.rations.ready+x.pool; }
  function pay(s,p,n) { const x=s.players[p],cost=n;if(resources(s,p)<n)throw Error('Vous ne disposez pas d’assez de rations disponibles.');const fromPool=Math.min(x.pool,n);x.pool-=fromPool;n-=fromPool;x.rations.ready-=n;x.rations.tapped+=n;if(cost)log(s,x.name+' paie ['+cost+'] : '+n+' ration(s) engagée(s), ['+fromPool+'] ressource(s) temporaire(s).'); }
  function eat(s,p,n) { const r=s.players[p].rations;if(r.ready+r.tapped<n)throw Error('Pas assez de rations sur le terrain pour Manger '+n+'.');const tapped=Math.min(n,r.tapped);r.tapped-=tapped;r.ready-=n-tapped;r.deck+=n;log(s,s.players[p].name+' Mange '+n+' ration'+(n>1?'s':'')+' (retour dans la réserve).'); }
  function addRation(s,p,n=1,tapped=false) { const x=s.players[p],r=x.rations;const actual=Math.min(n,r.deck);r.deck-=actual;r[tapped?'tapped':'ready']+=actual;if(actual)log(s,x.name+' ajoute '+actual+' ration'+(actual>1?'s':'')+' '+(tapped?'engagée':'dégagée')+(actual>1?'s':'')+' depuis sa réserve.');if(actual<n)log(s,x.name+' ne peut pas ajouter '+(n-actual)+' ration'+(n-actual>1?'s':'')+' : sa réserve est vide.');return actual; }
  function draw(s,p,n,catalog) {
    const x=s.players[p];let actual=0;
    for(let i=0;i<n&&s.winner===null;i++){
      if(!x.deck.length){if(actual)log(s,x.name+' pioche '+actual+' carte'+(actual>1?'s':'')+'.');s.winner=1-p;log(s,x.name+' ne peut plus piocher et perd la partie.');return actual;}
      const c=x.deck.shift();resetInstance(c);x.hand.push(c);actual++;
    }
    if(actual)log(s,x.name+' pioche '+actual+' carte'+(actual>1?'s':'')+'.');return actual;
  }
  function resetInstance(c) { c.incarnation=(c.incarnation||0)+1;c.tapped=false;c.damage=0;c.counters={};c.mods=[];c.used={};c.overexerted=false;c.skipNextUntap=false;delete c.lastDamage; }
  function removeBoard(s,c) {
    const zones=[s.hunting,...s.players.flatMap(p=>[p.camp,p.items])];
    for(const zone of zones){const i=zone.findIndex(x=>x.uid===c.uid);if(i>=0){zone.splice(i,1);return true;}}return false;
  }
  function moveOff(s,c,destination,catalog,reason='move') {
    if(!c||!removeBoard(s,c))return;
    const old=clone(c);resetInstance(c);c.controller=c.owner;
    if(destination==='hand')s.players[c.owner].hand.push(c);else s.players[c.owner].discard.push(c);
    if(s.combat&&(s.combat.attackerId===c.uid||s.combat.targetId===c.uid)){
      s.combat.interrupted=true;log(s,'Le combat est interrompu : un participant a quitté le terrain.');
    }
    return old;
  }
  function damage(s,target,amount,source,player,catalog,combat=false) {
    if(!target||!onBoard(s,target.uid)||getCard(catalog,target.cardId)?.type==='chief')return 0;
    let n=Math.max(0,amount);
    if(combat){
      const reduced=target.mods.filter(m=>m.kind==='reduceCombat'&&(m.combatId===s.combat?.id||m.duration==='turn')).reduce((a,m)=>a+m.value,0);
      n=Math.max(0,n-reduced);
      if(n>0)n=Math.max(1,n-stats(s,target,catalog).armor);
      if(source?.mods?.some(m=>m.kind==='noCombatDamage'&&m.combatId===s.combat?.id))n=0;
    }
    if(!n)return 0;
    target.damage+=n;target.lastDamage={player,sourceId:source?.uid||null,sourceCardId:source?.cardId||null,sourceSnapshot:source?clone(source):null,combat};
    log(s,(getCard(catalog,target.cardId)?.name||target.cardId)+' subit '+n+' blessure'+(n>1?'s':'')+(combat?' de combat.':" d’effet."));
    if(target.cardId==='036'&&source&&getCard(catalog,source.cardId)?.type==='hunter')trigger(s,'kelbi',target,{targetIds:[source.uid],label:'Kelbi : soin du Chasseur'});
    return n;
  }
  function checkDeaths(s,catalog) {
    const dead=creatures(s).filter(c=>c.damage>=(getCard(catalog,c.cardId)?.hp??Infinity));
    for(const c of dead){
      const old=clone(c),d=getCard(catalog,c.cardId),last=c.lastDamage;
      moveOff(s,c,'discard',catalog,'death');log(s,d.name+' meurt.');
      if(d.type==='large'&&last){s.players[last.player].score++;log(s,s.players[last.player].name+' gagne 1 point ('+s.players[last.player].score+'/6).');}
      if(c.cardId==='008')trigger(s,'poogie',old,{label:'Poogie Cultivateur : ration'});
      if(c.cardId==='038'&&last) s.triggers.push(newEntry(s,'draw',last.player,old,{label:'Aptonoth : pioche du tueur'}));
      if(d.type==='large'&&last&&last.sourceCardId==='014')s.triggers.push(newEntry(s,'zora',last.player,last.sourceSnapshot,{label:'Zora : marqueur Spirituel'}));
      if(d.type==='small'){
        s.turnFlags.smallDied=true;
        for(const m of s.hunting.filter(x=>x.cardId==='032'&&x.controller===old.controller&&!x.used.smallUntap)){m.used.smallUntap=true;trigger(s,'yianUntap',m,{label:'Yian Kut-ku se dégage'});}
        const chief=s.players[old.controller].chief;
        if(chief.cardId==='203'&&!chief.tapped)trigger(s,'kokoto',chief,{label:'Chef Kokoto : affaiblissement',optional:true});
      }
    }
    for(let p=0;p<2;p++)if(s.players[p].score>=6&&s.winner===null){s.winner=p;log(s,s.players[p].name+' remporte la partie avec 6 points !');}
  }
  function cardName(s,uid,catalog) { const c=find(s,uid);return c?getCard(catalog,c.cardId)?.name||c.cardId:uid; }
  function candidates(s,kind,p,catalog,entry={}) {
    let xs=[];
    if(kind==='allyHunter')xs=s.players[p].camp;
    if(kind==='allyLance')xs=s.players[p].camp.filter(c=>getCard(catalog,c.cardId).subtypes.some(t=>/^Lance$/i.test(t)));
    if(kind==='enemyHunter')xs=s.players[1-p].camp;
    if(kind==='monster')xs=s.hunting;
    if(kind==='enemyMonster')xs=s.hunting.filter(c=>c.controller!==p);
    if(kind==='recoverHunter')xs=s.players[p].discard.filter(c=>getCard(catalog,c.cardId).type==='hunter');
    if(kind==='recoverSmall')xs=s.players[p].discard.filter(c=>getCard(catalog,c.cardId).type==='small');
    if(kind==='recoverTechnique')xs=s.players[p].discard.filter(c=>getCard(catalog,c.cardId).type==='technique'&&getCard(catalog,c.cardId).cost<=2);
    if(kind==='hand')xs=s.players[p].hand;
    if(kind==='combatAlly')xs=s.combat?[s.combat.attackerId,s.combat.targetId].map(uid=>onBoard(s,uid)).filter(c=>c&&c.controller===p):[];
    if(kind==='attackedMonster')xs=s.combat?[onBoard(s,s.combat.targetId)].filter(Boolean):[];
    if(kind==='cheapTechnique')return s.stack.filter(e=>e.kind==='cast'&&e.player!==p&&getCard(catalog,e.cardId).type==='technique'&&getCard(catalog,e.cardId).cost<=2).map(e=>({id:e.uid,label:e.label}));
    if(kind==='combatHunter')xs=s.combat?[onBoard(s,s.combat.attackerId)].filter(c=>c&&c.controller===p):[];
    return xs.map(c=>({id:c.uid,label:getCard(catalog,c.cardId)?.name||c.cardId}));
  }
  function targetKind(id) { return ({'011':'allyHunter','015':'allyHunter','018':'allyHunter','020':'recoverHunter','023':'allyHunter','043':'allyLance','045':'monster','048':'allyHunter','051':'combatAlly','053':'recoverSmall','055':'allyLance','078':'allyHunter','114':'recoverTechnique','132':'attackedMonster','140':'cheapTechnique','032':'enemyHunter','037':'enemyHunter','028':'combatHunter'})[id]||null; }
  function spellTargets(s,id,p,catalog) { const k=targetKind(id);return k?candidates(s,k,p,catalog):[]; }
  function queueDecision(s,entry,kind,label,targetSpec,optional=false,choices=null,extra={}) {
    const opts=targetSpec?candidates(s,targetSpec,entry.player,catalogFor(s),entry):[];
    s.decisions.push({id:'d'+next(s),kind,entry:clone(entry),player:entry.player,label,targets:opts,targetCount:1,targetMin:1,optional,choices,...extra});
  }
  // Le catalogue reste un argument des fonctions publiques ; il n'entre jamais dans la sauvegarde.
  let workingCatalog=null;
  const catalogFor=()=>workingCatalog;
  function prepareTrigger(s,e,catalog) {
    const specs={ellie:'allyHunter',kokoto:'enemyMonster',kirin:'recoverTechnique'};
    if(specs[e.kind]){
      const opts=candidates(s,specs[e.kind],e.player,catalog,e);
      if(!opts.length)return false;
      e.needsTarget=specs[e.kind];e.targetOptions=opts;
    }
    return true;
  }
  function flushTriggers(s,catalog) {
    if(s.pending||!s.triggers.length)return;
    const batch=s.triggers.splice(0).filter(e=>prepareTrigger(s,e,catalog));
    const ordered=[...batch.filter(e=>e.player===s.activePlayer),...batch.filter(e=>e.player!==s.activePlayer)];
    s.triggerBuild=ordered;
    continueTriggerBuild(s,catalog);
  }
  function continueTriggerBuild(s,catalog) {
    while(s.triggerBuild?.length){
      const player=s.triggerBuild[0].player;
      const group=s.triggerBuild.filter(e=>e.player===player);
      if(group.length>1){
        s.pending={id:'d'+next(s),kind:'triggerOrder',player,label:'Choisissez la prochaine capacité à placer dans la pile (la dernière placée se résoudra d’abord).',choices:group.map(e=>({id:e.uid,label:e.label})),targetCount:0,targetMin:0};return;
      }
      const e=s.triggerBuild.shift();
      if(e.needsTarget){
        s.pending={id:'d'+next(s),kind:'triggerTarget',entry:e,player:e.player,label:e.label,targets:e.targetOptions,targetCount:1,targetMin:1,optional:!!e.optional};return;
      }
      s.stack.push(e);
    }
    delete s.triggerBuild;
  }
  function openResponses(s) { s.phase=s.combat?'combat':'response';s.priorityPlayer=s.activePlayer;s.passCount=0; }
  function beginTurn(s,catalog) {
    s.turn++;s.flow='start';s.phase='response';s.priorityPlayer=s.activePlayer;s.passCount=0;s.turnFlags={smallDied:false};
    for(const c of board(s)){c.used={};c.mods=c.mods.filter(m=>!(m.duration==='nextStart'&&m.player===s.activePlayer));}
    const p=s.players[s.activePlayer];
    log(s,'Tour '+s.turn+' — '+p.name+'.');
    const refreshed=p.rations.tapped;p.rations.ready+=p.rations.tapped;p.rations.tapped=0;
    if(refreshed)log(s,p.name+' dégage '+refreshed+' ration'+(refreshed>1?'s':'')+' au début du tour.');
    for(const c of board(s).filter(c=>c.controller===s.activePlayer)){
      if(c.overexerted){c.overexerted=false;continue;}
      if(c.skipNextUntap){c.skipNextUntap=false;continue;}
      untap(s,c,catalog,true);
      if(c.cardId==='001')trigger(s,'quest',c,{label:'Lao-Shan Lung : marqueur Quête'});
    }
    settle(s,catalog);
  }
  function finishCombat(s,catalog) {
    if(!s.combat)return;
    const cb=s.combat;
    for(const c of board(s))c.mods=c.mods.filter(m=>!(m.duration==='combat'&&m.combatId===cb.id));
    s.combat=null;s.flow='main';s.phase=s.stack.length?'response':'main';s.priorityPlayer=s.activePlayer;s.passCount=0;
    log(s,'Fin du combat.');
  }
  function combatTriggers(s,catalog) {
    const cb=s.combat,a=onBoard(s,cb.attackerId),m=onBoard(s,cb.targetId);
    if(!a||!m){cb.interrupted=true;return;}
    if(a.cardId==='044')trigger(s,'vivienHeat',a,{label:'Vivien : marqueur Chaleur'});
    if(a.cardId==='069'&&a.counters.Charge)trigger(s,'orikCharge',a,{optional:true,label:'Orik : dépenser la Charge'});
    if(a.cardId==='126')trigger(s,'maelys',a,{optional:true,label:'Maëlys : Surmener pour prévenir la riposte'});
    if(a.cardId==='042'&&getCard(catalog,m.cardId).type==='large')trigger(s,'vashGuard',a,{label:'Vash : réduction de blessures'});
    if(m.cardId==='031'&&m.controller!==a.controller)trigger(s,'velocidrome',m,{label:'Velocidrome : force de la meute'});
    cb.stage='damage';s.flow='combat';
  }
  function combatDamage(s,catalog) {
    const cb=s.combat,a=onBoard(s,cb.attackerId),m=onBoard(s,cb.targetId);
    if(!a||!m||cb.interrupted){finishCombat(s,catalog);return;}
    const af=stats(s,a,catalog).force,mf=stats(s,m,catalog).force;
    const monsterTaken=damage(s,m,af,a,a.controller,catalog,true);
    const hunterTaken=damage(s,a,mf,m,m.controller,catalog,true);
    cb.damageDone=true;cb.hunterDamage=hunterTaken;cb.monsterDamage=monsterTaken;
    checkDeaths(s,catalog);
    if(s.winner!==null)return;
    const survivor=onBoard(s,cb.attackerId);
    if(survivor?.cardId==='042'&&hunterTaken<=1&&!survivor.used.survive){survivor.used.survive=true;trigger(s,'vashUntap',survivor,{label:'Vash : se dégager après survie'});}
    const monsterSurvivor=onBoard(s,cb.targetId);
    if(monsterSurvivor?.cardId==='118'&&survivor&&survivor.controller!==monsterSurvivor.controller)trigger(s,'fatalis',monsterSurvivor,{targetIds:[survivor.uid],label:'Fatalis : empêcher le prochain dégagement'});
    cb.stage='end';
  }
  function settle(s,catalog) {
    if(s.winner!==null){s.pending=null;s.phase='ended';return;}
    if(s.pending)return;
    if(s.decisions.length){s.pending=s.decisions.shift();return;}
    if(s.triggerBuild?.length){continueTriggerBuild(s,catalog);if(s.pending)return;}
    flushTriggers(s,catalog);if(s.pending)return;
    if(s.stack.length){openResponses(s);return;}
    if(s.combat?.stage==='interpose'){s.phase='combat';return;}
    if(s.combat?.interrupted&&!s.combat.damageDone){finishCombat(s,catalog);return;}
    if(s.flow==='start'){
      addRation(s,s.activePlayer);draw(s,s.activePlayer,1,catalog);
      if(s.winner!==null){s.phase='ended';return;}s.flow='main';s.phase='main';s.priorityPlayer=s.activePlayer;return;
    }
    if(s.flow==='combat'){
      if(s.combat.stage==='end'){finishCombat(s,catalog);return;}
      s.phase='combat';s.priorityPlayer=s.activePlayer;s.passCount=0;return;
    }
    if(s.flow==='end'){
      for(const c of board(s))c.mods=c.mods.filter(m=>m.duration!=='turn');
      for(const p of s.players)p.pool=0;
      s.activePlayer=1-s.activePlayer;beginTurn(s,catalog);return;
    }
    s.phase='main';s.priorityPlayer=s.activePlayer;s.passCount=0;
  }
  function enter(s,c,catalog,entry) {
    const d=getCard(catalog,c.cardId);resetInstance(c);c.tapped=d.type==='item'?false:true;
    if(d.type==='hunter')s.players[c.controller].camp.push(c);
    else if(d.type==='large'||d.type==='small')s.hunting.push(c);
    else s.players[c.controller].items.push(c);
    log(s,d.name+' arrive '+(c.tapped?'engagé':'dégagé')+'.');
    if(c.cardId==='001'){c.counters.Quête=3;}
    if(c.cardId==='008')trigger(s,'poogie',c,{label:'Poogie Cultivateur : ration'});
    if(c.cardId==='114')trigger(s,'kirin',c,{label:'Kirin : récupérer une Technique'});
  }
  function resolveEntry(s,e,catalog) {
    let src=onBoard(s,e.sourceId),target=onBoard(s,e.targetIds?.[0]);
    if(src&&(src.incarnation||0)!==(e.sourceSnapshot?.incarnation||0))src=null;
    if(target&&e.targetVersions&&e.targetVersions[target.uid]!==undefined&&e.targetVersions[target.uid]!==target.incarnation)target=null;
    if(e.kind==='cast'){
      const c=e.card,d=getCard(catalog,e.cardId);
      if(['large','small','hunter'].includes(d.type)||PERSISTENT.has(d.id)){
        if(d.type==='hunter'&&s.players[e.player].camp.length>=5){
          s.pending={id:'d'+next(s),kind:'replace',entry:e,player:e.player,label:'Votre Camp est plein : choisissez le Chasseur à remplacer (ce n’est pas une mort).',targets:s.players[e.player].camp.map(x=>({id:x.uid,label:getCard(catalog,x.cardId).name})),targetCount:1,targetMin:1};return;
        }
        enter(s,c,catalog,e);return;
      }
      resolveSpell(s,e,catalog);resetInstance(c);s.players[c.owner].discard.push(c);return;
    }
    if(e.kind==='heal'){heal(s,target,e.amount,catalog);return;}
    if(e.kind==='ellie'){if(target)addMod(s,target,'force',1);return;}
    if(e.kind==='silas'){heal(s,target,1,catalog);return;}
    if(e.kind==='poogie'){addRation(s,e.player,1,true);return;}
    if(e.kind==='draw'){draw(s,e.player,1,catalog);return;}
    if(e.kind==='kelbi'){heal(s,target,1,catalog);return;}
    if(e.kind==='yianUntap'){if(src)untap(s,src,catalog);return;}
    if(e.kind==='zora'){if(src&&!src.counters.Spirituel){src.counters.Spirituel=1;heal(s,src,999,catalog);}return;}
    if(e.kind==='kirin'){
      const p=s.players[e.player],i=p.discard.findIndex(c=>c.uid===e.targetIds[0]);
      if(i>=0&&getCard(catalog,p.discard[i].cardId).type==='technique'&&getCard(catalog,p.discard[i].cardId).cost<=2&&(!e.targetVersions||e.targetVersions[p.discard[i].uid]===p.discard[i].incarnation)){const c=p.discard.splice(i,1)[0];resetInstance(c);p.hand.push(c);}return;
    }
    if(e.kind==='quest'){
      if(src&&src.counters.Quête>0){src.counters.Quête--;log(s,'Lao-Shan Lung : '+src.counters.Quête+' marqueur(s) Quête restant(s).');if(src.counters.Quête===0){s.winner=e.player;log(s,s.players[e.player].name+' remporte la partie grâce à Lao-Shan Lung !');}}return;
    }
    if(e.kind==='zero'){if(src)heal(s,src,2,catalog);addRation(s,e.player,1,true);return;}
    if(e.kind==='kokoto'){
      if(src&&!src.tapped&&target&&target.controller!==e.player){tap(s,src,catalog);addMod(s,target,'force',-2);}return;
    }
    if(e.kind==='velocidrome'){
      if(src&&s.combat){const ms=s.hunting.filter(x=>x.controller===e.player);const n=ms.filter(x=>getCard(catalog,x.cardId).type==='small').length+ms.filter(x=>getCard(catalog,x.cardId).subtypes.some(t=>/Velociprey/i.test(t))).length;addMod(s,src,'force',n,'combat');}return;
    }
    if(e.kind==='vivienHeat'){if(src)src.counters.Chaleur=(src.counters.Chaleur||0)+1;return;}
    if(e.kind==='orikCharge'){
      if(src&&src.counters.Charge){s.pending={id:'d'+next(s),kind:'optionalEffect',entry:e,player:e.player,label:e.label,optional:true,choices:[{id:'yes',label:'Retirer 1 Charge : +2 de Force pour ce combat'}]};}return;
    }
    if(e.kind==='maelys'){
      if(src){s.pending={id:'d'+next(s),kind:'optionalEffect',entry:e,player:e.player,label:e.label,optional:true,choices:[{id:'yes',label:'Surmener Maëlys pour empêcher la riposte'}]};}return;
    }
    if(e.kind==='vashGuard'){if(src)addMod(s,src,'reduceCombat',1,'combat');return;}
    if(e.kind==='vashUntap'){if(src)untap(s,src,catalog);return;}
    if(e.kind==='fatalis'){if(target)target.skipNextUntap=true;return;}
    if(e.kind==='ability'){
      switch(e.sourceCardId){
        case '011':heal(s,target,1,catalog);break;
        case '032':damage(s,target,1,e.sourceSnapshot,e.player,catalog);break;
        case '037':damage(s,target,1,e.sourceSnapshot,e.player,catalog);damage(s,src,1,e.sourceSnapshot,e.player,catalog);break;
        case '043':if(target)addMod(s,target,'armor',1,'nextStart',{player:e.player});break;
        case '044':if(src)addMod(s,src,'force',2);break;
        case '045':{
          const wasSmall=target&&getCard(catalog,target.cardId).type==='small';damage(s,target,1,e.sourceSnapshot,e.player,catalog);if(wasSmall){draw(s,e.player,1,catalog);discardDecision(s,e.player,e);}break;
        }
        case '065':if(s.players[1-e.player].camp.some(x=>stats(s,x,catalog).force===0))draw(s,e.player,1,catalog);break;
        case '069':if(src)src.counters.Charge=1;break;
        case '124':draw(s,e.player,1,catalog);break;
        case '130':if(s.combat){for(const uid of [s.combat.attackerId,s.combat.targetId]){const c=onBoard(s,uid);if(c)addMod(s,c,'noCombatDamage',1,'combat');}}break;
      }
    }
  }
  function discardDecision(s,p,entry) {
    if(!s.players[p].hand.length||s.winner!==null)return;
    s.decisions.push({id:'d'+next(s),kind:'discard',entry,player:p,label:'Choisissez une carte à défausser.',targets:s.players[p].hand.map(c=>({id:c.uid,label:getCard(workingCatalog,c.cardId).name})),targetCount:1,targetMin:1,optional:false});
  }
  function recover(s,p,ids,catalog,type,versions) {
    const player=s.players[p];for(const uid of ids){const i=player.discard.findIndex(c=>c.uid===uid&&getCard(catalog,c.cardId).type===type&&(!versions||versions[uid]===c.incarnation));if(i>=0){const c=player.discard.splice(i,1)[0];resetInstance(c);player.hand.push(c);}}
  }
  function resolveSpell(s,e,catalog) {
    let target=onBoard(s,e.targetIds[0]);
    if(target&&e.targetVersions&&e.targetVersions[target.uid]!==undefined&&e.targetVersions[target.uid]!==target.incarnation)target=null;
    switch(e.cardId){
      case '018':heal(s,target,2,catalog);break;
      case '020':recover(s,e.player,e.targetIds,catalog,'hunter',e.targetVersions);break;
      case '021':addRation(s,e.player,1,true);draw(s,e.player,1,catalog);break;
      case '023':if(target){untap(s,target,catalog);addMod(s,target,'force',1);}break;
      case '047':draw(s,e.player,2,catalog);discardDecision(s,e.player,e);break;
      case '048':heal(s,target,1+s.hunting.filter(c=>c.controller===e.player&&getCard(catalog,c.cardId).type==='small').length,catalog);break;
      case '051':if(target&&s.combat&&[s.combat.attackerId,s.combat.targetId].includes(target.uid))addMod(s,target,'armor',s.hunting.some(c=>c.controller===e.player&&getCard(catalog,c.cardId).type==='small')?2:1,'combat');break;
      case '053':recover(s,e.player,e.targetIds,catalog,'small',e.targetVersions);break;
      case '055':if(target)addMod(s,target,'armor',2);break;
      case '078':if(target)addMod(s,target,'force',2);break;
      case '132':if(target&&s.combat&&s.combat.targetId===target.uid)addMod(s,target,'noCombatDamage',1,'combat');break;
      case '140':{
        const index=s.stack.findIndex(x=>x.uid===e.targetIds[0]);
        if(index>=0){const other=s.stack[index],d=getCard(catalog,other.cardId);if(other.kind==='cast'&&other.player!==e.player&&d.type==='technique'&&d.cost<=2){s.stack.splice(index,1);if(other.card){resetInstance(other.card);s.players[other.card.owner].discard.push(other.card);}log(s,other.label+' est contrée.');}}
        break;
      }
    }
  }
  function legalAttackTargets(s,a,catalog) {
    const enemy=s.hunting.filter(m=>m.controller!==a.controller);
    const provocations=enemy.filter(m=>stats(s,m,catalog).keywords.includes('Provocation'));
    return s.hunting.filter(m=>m.controller===a.controller||!provocations.length||provocations.some(x=>x.uid===m.uid)).map(c=>({id:c.uid,label:getCard(catalog,c.cardId).name}));
  }
  function template(id,type,label,p,sourceId,extra={}) { return {id,type,label,player:p,...(sourceId?{sourceId}:{}),...extra}; }
  function getActions(s,catalog) {
    if(s.winner!==null)return [];
    workingCatalog=catalog;
    if(s.pending){const d=s.pending;
      const out=[template('choose:'+d.id,'choose',d.label,d.player,null,{targets:d.targets||[],targetCount:d.targetCount??0,targetMin:d.targetMin??0,choices:d.choices||[],pendingId:d.id})];
      if(d.optional)out.push(template('skip:'+d.id,'skip','Ne pas utiliser cet effet',d.player,null,{pendingId:d.id}));return out;
    }
    if(s.phase==='mulligan'){
      const p=s.priorityPlayer;const out=[template('keep','keep','Garder cette main',p)];
      if(!s.players[p].mulliganUsed)out.push(template('mulligan','mulligan','Changer toute la main (une seule fois)',p));return out;
    }
    const p=s.priorityPlayer;const out=[];
    if(s.combat?.stage==='interpose'){
      if(!s.combat.interpositionUsed)for(const c of s.hunting.filter(c=>c.controller===p&&!c.tapped&&c.cardId==='010'&&c.uid!==s.combat.targetId))out.push(template('interpose:'+c.uid,'interpose','Interposer '+getCard(catalog,c.cardId).name,p,c.uid));
      out.push(template('pass','pass','Passer l’Interposition',p));return out;
    }
    const normal=s.phase==='main'&&!s.stack.length&&!s.combat&&p===s.activePlayer;
    for(const c of s.players[p].hand){
      const d=getCard(catalog,c.cardId);if(!supports(c.cardId)||d.cost>resources(s,p))continue;
      if(!normal&&!REFLEX.has(d.id)&&d.id!=='114')continue;
      if(d.id==='001'&&s.players[p].rations.ready+s.players[p].rations.tapped<3)continue;
      const k=['item','technique'].includes(d.type)?targetKind(d.id):null,targets=k?spellTargets(s,d.id,p,catalog):[];
      if(k&&!targets.length&&d.id!=='053')continue;
      out.push(template('play:'+c.uid,'play','Jouer '+d.name,p,c.uid,{cost:d.cost,targets,targetCount:k?(d.id==='053'?2:1):0,targetMin:d.id==='053'?0:(k?1:0)}));
    }
    for(const c of board(s).filter(c=>c.controller===p)){
      const id=c.cardId;let allowed=false,cost=0;
      if(normal&&!c.tapped&&['011','032','037','043','045','065','069','124'].includes(id))allowed=true;
      if(id==='065'&&!s.players[1-p].camp.some(x=>stats(s,x,catalog).force===0))allowed=false;
      if(id==='069'&&c.counters.Charge)allowed=false;
      if(id==='044'&&s.combat&&s.combat.attackerId===c.uid&&(c.counters.Chaleur||0)>=2)allowed=true;
      if(id==='130'&&s.combat&&p===s.activePlayer&&!c.tapped)allowed=true;
      if(!allowed)continue;
      const k=targetKind(id),targets=k?candidates(s,k,p,catalog):[];
      if(k&&!targets.length)continue;
      out.push(template('ability:'+c.uid,'ability','Activer '+getCard(catalog,id).name,p,c.uid,{cost,targets,targetCount:k?1:0,targetMin:k?1:0}));
    }
    if(normal){
      for(const c of s.players[p].camp.filter(c=>!c.tapped)){
        const targets=legalAttackTargets(s,c,catalog);if(targets.length)out.push(template('attack:'+c.uid,'attack','Attaquer avec '+getCard(catalog,c.cardId).name,p,c.uid,{targets,targetCount:1,targetMin:1}));
      }
      out.push(template('endturn','endturn','Terminer le tour',p));
    }else out.push(template('pass','pass',s.stack.length?'Passer — laisser résoudre':s.flow==='end'?'Passer — terminer le tour':'Passer — poursuivre le combat',p));
    return out;
  }
  function validateSelection(action,template) {
    const ids=action.targetIds||[];const min=template.targetMin??template.targetCount??0,max=template.targetCount??0;
    if(ids.length<min||ids.length>max||new Set(ids).size!==ids.length)throw Error('Choisissez '+(min===max?min:'entre '+min+' et '+max)+' cible(s).');
    for(const id of ids)if(!(template.targets||[]).some(t=>t.id===id))throw Error('Cette cible n’est pas légale.');
    if(template.choices?.length&&!template.choices.some(c=>c.id===action.choiceId))throw Error('Choisissez l’une des options proposées.');
  }
  function decide(s,action,catalog,skip=false) {
    const d=s.pending;s.pending=null;const e=d.entry;
    if(skip){continueTriggerBuild(s,catalog);settle(s,catalog);return;}
    const ids=action.targetIds||[];
    if(d.kind==='triggerOrder'){
      const index=s.triggerBuild.findIndex(x=>x.uid===action.choiceId),chosen=s.triggerBuild.splice(index,1)[0];
      if(chosen.needsTarget)s.pending={id:'d'+next(s),kind:'triggerTarget',entry:chosen,player:chosen.player,label:chosen.label,targets:chosen.targetOptions,targetCount:1,targetMin:1,optional:!!chosen.optional};
      else {s.stack.push(chosen);continueTriggerBuild(s,catalog);}
      settle(s,catalog);return;
    }
    if(d.kind==='triggerTarget'){
      e.targetIds=ids;e.targetVersions=Object.fromEntries(ids.map(uid=>[uid,find(s,uid)?.incarnation||0]));s.stack.push(e);continueTriggerBuild(s,catalog);settle(s,catalog);return;
    }
    if(d.kind==='discard'){
      const p=s.players[d.player],i=p.hand.findIndex(c=>c.uid===ids[0]);if(i>=0){const c=p.hand.splice(i,1)[0];resetInstance(c);p.discard.push(c);log(s,p.name+' défausse '+getCard(catalog,c.cardId).name+'.');}
    }
    if(d.kind==='replace'){
      const old=onBoard(s,ids[0]);if(old)moveOff(s,old,'discard',catalog,'replace');enter(s,e.card,catalog,e);
    }
    if(d.kind==='optionalEffect'){
      const src=onBoard(s,e.sourceId);
      if(e.kind==='orikCharge'&&src&&src.counters.Charge){src.counters.Charge--;addMod(s,src,'force',2,'combat');}
      if(e.kind==='maelys'&&src&&s.combat){src.overexerted=true;const m=onBoard(s,s.combat.targetId);if(m)addMod(s,m,'noCombatDamage',1,'combat');}
    }
    checkDeaths(s,catalog);settle(s,catalog);
  }
  function dispatch(state,action,catalog) {
    workingCatalog=catalog;
    const allowed=getActions(state,catalog).find(a=>a.id===action.id&&(!action.type||a.type===action.type));
    if(!allowed)throw Error('Cette action n’est pas disponible à ce moment.');
    validateSelection(action,allowed);
    const s=clone(state),p=allowed.player;
    action={...allowed,...action,player:p,sourceId:allowed.sourceId};
    if(action.type==='choose'||action.type==='skip'){decide(s,action,catalog,action.type==='skip');return s;}
    if(action.type==='mulligan'||action.type==='keep'){
      const player=s.players[p];
      if(action.type==='mulligan'){
        player.hand.forEach(resetInstance);player.deck.push(...player.hand);player.hand=[];log(s,player.name+' remet sa main dans son deck pour un mulligan.');draw(s,p,5,catalog);player.deck=shuffle(s,player.deck);player.mulliganUsed=true;log(s,player.name+' mélange son deck après le mulligan.');
      }else log(s,player.name+' garde sa main.');
      s.mulliganDone[p]=true;const other=1-p;
      if(!s.mulliganDone[other])s.priorityPlayer=other;else beginTurn(s,catalog);
      return s;
    }
    if(action.type==='play'){
      const player=s.players[p],i=player.hand.findIndex(c=>c.uid===action.sourceId),c=player.hand[i],d=getCard(catalog,c.cardId);
      pay(s,p,d.cost);if(c.cardId==='001')eat(s,p,3);player.hand.splice(i,1);resetInstance(c);
      const targetIds=action.targetIds||[];
      const e=newEntry(s,'cast',p,c,{card:c,cardId:c.cardId,label:d.name,targetIds,targetVersions:Object.fromEntries(targetIds.map(uid=>[uid,find(s,uid)?.incarnation||0]))});s.stack.push(e);log(s,player.name+' joue '+d.name+'.');
      if(d.type==='item')for(const hunter of player.camp.filter(x=>x.cardId==='013'&&!x.used.item)){hunter.used.item=true;trigger(s,'zero',hunter,{label:'Zero : soin et ration'});}
      flushTriggers(s,catalog);openResponses(s);return s;
    }
    if(action.type==='ability'){
      const c=onBoard(s,action.sourceId),snap=clone(c);
      if(c.cardId==='044')c.counters.Chaleur-=2;else tap(s,c,catalog);
      if(c.cardId==='124')moveOff(s,c,'hand',catalog);
      if(c.cardId==='130')moveOff(s,c,'discard',catalog,'sacrifice');
      const targetIds=action.targetIds||[];
      s.stack.push(newEntry(s,'ability',p,snap,{label:'Capacité : '+getCard(catalog,snap.cardId).name,targetIds,targetVersions:Object.fromEntries(targetIds.map(uid=>[uid,find(s,uid)?.incarnation||0]))}));
      log(s,s.players[p].name+' active '+getCard(catalog,snap.cardId).name+'.');flushTriggers(s,catalog);openResponses(s);return s;
    }
    if(action.type==='attack'){
      const a=onBoard(s,action.sourceId);tap(s,a,catalog);s.combat={id:'fight'+next(s),attackerId:a.uid,targetId:action.targetIds[0],stage:'interpose',interpositionUsed:false,interrupted:false,damageDone:false};
      s.flow='combat';s.phase='combat';s.priorityPlayer=s.activePlayer;s.passCount=0;log(s,getCard(catalog,a.cardId).name+' attaque '+cardName(s,action.targetIds[0],catalog)+'.');return s;
    }
    if(action.type==='interpose'){
      const c=onBoard(s,action.sourceId);tap(s,c,catalog);s.combat.targetId=c.uid;s.combat.interpositionUsed=true;log(s,getCard(catalog,c.cardId).name+' s’interpose.');combatTriggers(s,catalog);settle(s,catalog);return s;
    }
    if(action.type==='endturn'){
      s.flow='end';s.phase='response';s.priorityPlayer=s.activePlayer;s.passCount=0;log(s,'Fin de tour annoncée : les deux joueurs peuvent répondre.');return s;
    }
    if(action.type==='pass'){
      s.passCount++;
      if(s.passCount<2){s.priorityPlayer=1-s.priorityPlayer;return s;}
      s.passCount=0;s.priorityPlayer=s.activePlayer;
      if(s.combat?.stage==='interpose'){combatTriggers(s,catalog);settle(s,catalog);return s;}
      if(s.stack.length){const e=s.stack.pop();log(s,'Résolution : '+e.label+'.');resolveEntry(s,e,catalog);checkDeaths(s,catalog);settle(s,catalog);return s;}
      if(s.combat?.stage==='damage'){combatDamage(s,catalog);settle(s,catalog);return s;}
      settle(s,catalog);return s;
    }
    throw Error('Action non reconnue.');
  }
  function createScenario(catalog,options={}) {
    const s=createGame(catalog,{seed:options.seed||42});
    s.mulliganDone=[true,true];s.phase='main';s.flow='main';s.turn=5;s.activePlayer=0;s.priorityPlayer=0;
    for(const p of s.players){p.hand=[];p.camp=[];p.items=[];p.discard=[];p.rations={ready:8,tapped:0,deck:4};}
    s.hunting=[];
    const add=(id,p,zone,tapped=false,damageN=0)=>{const c=makeInstance(s,id,p);c.tapped=tapped;c.damage=damageN;if(zone==='hunting')s.hunting.push(c);else s.players[p][zone].push(c);return c;};
    add('014',0,'camp');add('011',0,'hunting');add('010',0,'hunting');
    add('031',1,'hunting',false,2);add('036',1,'hunting');add('042',1,'camp');
    ['023','132','140','018','008'].forEach(id=>add(id,0,'hand'));
    ['051','055','078','037','047'].forEach(id=>add(id,1,'hand'));
    s.log=[];log(s,'Scénario d’entraînement : testez une attaque, l’Interposition, les Réflexes et les soins.');return s;
  }
  return {version:'0.1.0',SUPPORTED_IDS,STARTER_DECKS,supports,getCard,validateDeck,createGame,createScenario,getActions,dispatch,stats};
});
