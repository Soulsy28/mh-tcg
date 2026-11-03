/* Table libre MH TCG. Les capacités écrites sur les cartes sont résolues par les joueurs. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MHTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NOTICE = 'Table libre : effets des cartes, mots-clés conditionnels et coûts supplémentaires à résoudre manuellement.';
  const clone = value => JSON.parse(JSON.stringify(value));
  function canonical(id) {
    const value = String(id ?? '').replace(/^MhFG[-_]/i, '');
    return /^\d{1,3}$/.test(value) ? value.padStart(3, '0') : value;
  }
  function getCard(catalog, id) { return (Array.isArray(catalog) ? catalog : catalog.cards).find(c => c.id === canonical(id)); }
  function validateDeck(deck, catalog) {
    const errors = [], chief = getCard(catalog, deck?.chiefId);
    const ids = Array.isArray(deck?.cards) ? deck.cards : [];
    if (!chief || chief.type !== 'chief') errors.push('Choisissez un Chef de chasse du catalogue.');
    if (ids.length !== 50) errors.push('Le deck principal doit contenir exactement 50 cartes.');
    const counts = new Map();
    for (const raw of ids) {
      const id = canonical(raw), card = getCard(catalog, id);
      counts.set(id, (counts.get(id) || 0) + 1);
      if (!card) errors.push('Carte inconnue : ' + id + '.');
      else if (card.type === 'chief' || card.type === 'token') errors.push(card.name + ' ne va pas dans le deck principal.');
      else if (chief && !card.colors.every(color => chief.colors.includes(color))) errors.push(card.name + ' ne correspond pas aux couleurs du Chef.');
    }
    for (const [id, amount] of counts) if (amount > 3) errors.push('Maximum 3 exemplaires de ' + (getCard(catalog, id)?.name || id) + '.');
    return { valid: errors.length === 0, errors: [...new Set(errors)], count: ids.length };
  }
  // Only public information belongs here: never the identity of a card drawn from a hidden zone.
  function log(s, text) { s.log.push({ text, turn: s.turn, public: true }); if (s.log.length > 250) s.log.shift(); }
  function random(s) { s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0; return s.seed / 4294967296; }
  function shuffle(s, cards) {
    const result = cards.slice();
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random(s) * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function instance(s, cardId, p) { return { uid: 'm' + (++s.seq), cardId: canonical(cardId), owner: p, controller: p, tapped: false, damage: 0, counters: {}, mods: [], used: {}, overexerted: false, incarnation: 0 }; }
  function board(s) { return [...s.hunting, ...s.players.flatMap(p => [p.chief, ...p.camp, ...p.items])]; }
  function all(s) { return [...board(s), ...s.players.flatMap(p => [...p.hand, ...p.deck, ...p.discard]), ...(s.stack || []).map(e => e.card).filter(Boolean)]; }
  function find(s, uid) { return all(s).find(c => c.uid === uid); }
  function onBoard(s, uid) { return board(s).find(c => c.uid === uid); }
  function creatures(s, catalog) { return board(s).filter(c => ['hunter', 'large', 'small'].includes(getCard(catalog, c.cardId)?.type)); }
  function stats(s, uid, catalog) {
    const c = typeof uid === 'object' ? uid : find(s, uid), d = c && getCard(catalog, c.cardId);
    if (!d) return null;
    const force = d.force == null ? null : Math.max(0, d.force + (c.mods || []).filter(m => m.kind === 'force').reduce((a, m) => a + m.value, 0));
    const armor = Math.max(0, (c.mods || []).filter(m => m.kind === 'armor').reduce((a, m) => a + m.value, 0));
    return { force, hp: d.hp, remainingHp: d.hp == null ? null : Math.max(0, d.hp - c.damage), armor, keywords: [] };
  }
  function createGame(catalog, options = {}) {
    let decks = options.decks;
    if (!decks) {
      const make = chiefId => { const chief = getCard(catalog, chiefId); const choices = catalog.cards.filter(c => !['chief', 'token'].includes(c.type) && c.colors.every(color => chief.colors.includes(color))).slice(0, 17); return { chiefId, cards: choices.flatMap((c, i) => Array(i === 16 ? 2 : 3).fill(c.id)) }; };
      decks = [make('202'), make('203')];
    }
    if (!Array.isArray(decks) || decks.length !== 2) throw Error('Une partie nécessite deux decks.');
    decks.forEach(d => { const result = validateDeck(d, catalog); if (!result.valid) throw Error(result.errors.join(' ')); });
    const first = options.firstPlayer === 1 ? 1 : 0;
    const s = { version: 1, engine: 'MHTable', mode: 'manual', notice: NOTICE, catalogVersion: catalog.version || '2026-11-01', seq: 0, seed: ((options.seed ?? Date.now()) >>> 0) || 1, players: [], hunting: [], turn: 0, activePlayer: first, priorityPlayer: first, phase: 'mulligan', stack: [], combat: null, pending: null, winner: null, log: [], mulliganDone: [false, false], passCount: 0 };
    decks.forEach((d, p) => {
      const player = { name: String(options.names?.[p] || 'Joueur ' + (p + 1)).slice(0, 45), chief: instance(s, d.chiefId, p), hand: [], deck: [], discard: [], camp: [], items: [], rations: { ready: 0, tapped: 0, deck: 12 }, pool: 0, score: 0, mulliganUsed: false };
      s.players.push(player); player.deck = shuffle(s, d.cards.map(id => instance(s, id, p)));
      log(s, player.name + ' mélange son deck.'); draw(s, p, 5);
    });
    log(s, NOTICE); log(s, 'Chaque joueur peut garder sa main ou effectuer un mulligan.'); return s;
  }
  function resetCard(c) { c.tapped = false; c.damage = 0; c.counters = {}; c.mods = []; c.used = {}; c.overexerted = false; c.incarnation = (c.incarnation || 0) + 1; c.controller = c.owner; }
  function remove(s, uid) {
    for (const zone of [s.hunting, ...s.players.flatMap(p => [p.camp, p.items, p.hand, p.deck, p.discard])]) {
      const index = zone.findIndex(c => c.uid === uid); if (index >= 0) return zone.splice(index, 1)[0];
    }
    return null;
  }
  function move(s, c, destination, catalog) {
    if (!remove(s, c.uid)) return;
    if (s.combat && [s.combat.attackerId, s.combat.targetId].includes(c.uid)) { s.combat = null; s.flow='main';s.phase=s.pending?.kind==='manual-resolution'?'resolving':s.stack.length?'response':'main';if(!s.pending)s.priorityPlayer = s.activePlayer; s.passCount = 0; log(s, 'Le combat est interrompu : un participant quitte le terrain.'); }
    const token = getCard(catalog, c.cardId)?.type === 'token'; resetCard(c);
    if (token) { log(s, 'Le jeton quitte le terrain et cesse d’exister.'); return; }
    if (destination === 'top') s.players[c.owner].deck.unshift(c);
    else s.players[c.owner][destination].push(c);
  }
  function win(s) { if (s.winner != null) return; const p = s.players.findIndex(x => x.score >= 6); if (p >= 0) { s.winner = p; s.phase = 'ended'; log(s, s.players[p].name + ' atteint 6 points et gagne la partie.'); } }
  function draw(s, p, amount) {
    let actual = 0;
    for (let i = 0; i < amount && s.winner == null; i++) {
      if (!s.players[p].deck.length) {
        if (actual) log(s, s.players[p].name + ' pioche ' + actual + ' carte' + (actual > 1 ? 's' : '') + '.');
        s.winner = 1 - p; s.phase = 'ended'; log(s, s.players[p].name + ' ne peut plus piocher et perd la partie.'); return actual;
      }
      s.players[p].hand.push(s.players[p].deck.shift()); actual++;
    }
    if (actual) log(s, s.players[p].name + ' pioche ' + actual + ' carte' + (actual > 1 ? 's' : '') + '.');
    return actual;
  }
  function addRation(s, p, tapped = false) {
    const player = s.players[p], r = player.rations;
    if (r.deck > 0) { r.deck--; r[tapped ? 'tapped' : 'ready']++; log(s, player.name + ' ajoute 1 ration ' + (tapped ? 'engagée' : 'dégagée') + ' depuis sa réserve.'); return 1; }
    log(s, player.name + ' ne peut pas ajouter de ration : sa réserve est vide.'); return 0;
  }
  function completeStart(s) {
    // The turn stamp survives JSON saves and prevents duplicate automatic resources.
    if (s.startResourcesTurn !== s.turn) { s.startResourcesTurn = s.turn; addRation(s, s.activePlayer); draw(s, s.activePlayer, 1); }
    if (s.winner == null) { s.phase = 'main'; s.flow = 'main'; }
    s.priorityPlayer = s.activePlayer;
  }
  function hasManualStartEffects(s, catalog) {
    return board(s).some(c => c.controller === s.activePlayer && /(?:^|[.!?]\s+)(?:Au d[ée]but|[ÀA] chaque d[ée]but) (?:de (?:votre|chaque|son)|du) tour/im.test(getCard(catalog, c.cardId)?.text || ''));
  }
  function beginTurn(s, catalog) {
    s.turn++; s.priorityPlayer = s.activePlayer; s.phase = 'start'; s.flow = 'start'; s.combat = null; s.passCount = 0;
    for (const c of board(s)) { c.used = {}; if (c.controller === s.activePlayer) { if (c.overexerted) c.overexerted = false; else c.tapped = false; } }
    const player = s.players[s.activePlayer], r = player.rations, refreshed = r.tapped; r.ready += r.tapped; r.tapped = 0;
    log(s, 'Tour ' + s.turn + ' — ' + s.players[s.activePlayer].name + '.');
    if (refreshed) log(s, player.name + ' dégage ' + refreshed + ' ration' + (refreshed > 1 ? 's' : '') + ' au début du tour.');
    if (hasManualStartEffects(s, catalog)) log(s, 'Résolvez les capacités de début de tour manuellement, puis continuez pour ajouter une ration et piocher.');
    else completeStart(s);
  }
  function finishTurn(s, catalog) { for (const c of board(s)) c.mods = (c.mods || []).filter(m => m.duration !== 'turn'); s.players.forEach(p => p.pool = 0); log(s, s.players[s.activePlayer].name + ' termine son tour.'); s.activePlayer = 1 - s.activePlayer; beginTurn(s, catalog); }
  function pay(s, p, amount) { const player = s.players[p], pool = Math.min(player.pool, amount); player.pool -= pool; const rations = amount - pool; player.rations.ready -= rations; player.rations.tapped += rations; if (amount) log(s, player.name + ' paie [' + amount + '] : ' + rations + ' ration(s) engagée(s), [' + pool + '] ressource(s) temporaire(s).'); }
  function kill(s, c, beneficiary, catalog) {
    const d = getCard(catalog, c.cardId), name = d.name; move(s, c, 'discard', catalog);
    log(s, name + ' meurt. Résolvez ses capacités de mort manuellement.');
    if (d.type === 'large' && (beneficiary === 0 || beneficiary === 1)) { s.players[beneficiary].score++; log(s, s.players[beneficiary].name + ' gagne 1 point.'); }
  }
  function checkDeaths(s, catalog, beneficiary) { for (const c of creatures(s, catalog).filter(c => c.damage >= getCard(catalog, c.cardId).hp)) kill(s, c, beneficiary, catalog); win(s); }
  function targets(cards, catalog) { return cards.map(c => ({ id: c.uid, label: getCard(catalog, c.cardId)?.name || c.cardId })); }
  function responseWindow(s) {
    s.priorityPlayer = s.activePlayer; s.passCount = 0;
    if (s.winner == null) s.phase = s.combat ? 'combat' : s.flow === 'start' ? 'start' : s.stack.length || s.flow === 'end' ? 'response' : 'main';
  }
  function stackEntry(s, kind, p, c, extra = {}) {
    return { uid: 'me' + (++s.seq), kind, player: p, sourceId: c.uid, sourceCardId: c.cardId, cardId: c.cardId, sourceSnapshot: clone(c), label: getCard(extra.catalog, c.cardId)?.name || c.cardId, targetIds: [], ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'catalog')) };
  }
  function cleanText(text) {
    let result = String(text || '');
    for (let i = 0; i < 4; i++) result = result.replace(/\([^()]*\)/g, '');
    return result;
  }
  function clauses(card) {
    return cleanText(card.text).split(/\n\s*\n/).map((text, index) => {
      text = text.trim();
      const stripped = text.replace(/^(?:\[(?:Réflexe|Reflexe|Une fois par tour)\]\s*)+/i, ''), colon = stripped.indexOf(':');
      const prefix = colon < 0 ? '' : stripped.slice(0, colon).trim();
      const trigger = /^(?:Quand|Lorsqu|Au début|[ÀA] la fin|[ÀA] chaque début)/i.test(stripped) || /^Enragé \d+\s*:\s*(?:quand|lorsqu|[àa] la fin|au début)/i.test(stripped);
      const activated = !trigger && colon >= 0 && /^(?:\[(?:\d+|X)\]|Engagez|Mange[rz]|Sacrifiez|Retirez|Tant que je suis en combat)/i.test(prefix);
      return { index, text, prefix, effect: activated ? stripped.slice(colon + 1).trim() : stripped, kind: activated ? 'ability' : trigger ? 'trigger' : null, reflex: /^(?:\[(?:Réflexe|Reflexe|Une fois par tour)\]\s*)*\[R[ée]flexe\]/i.test(text), once: /\[Une fois par tour\]/i.test(text) };
    }).filter(c => c.kind);
  }
  function abilityTargetInfo(s, c, clause, catalog) {
    const p = c.controller, d = getCard(catalog, c.cardId), text = clause.effect;
    const hunters = board(s).filter(x => getCard(catalog, x.cardId)?.type === 'hunter');
    const monsters = s.hunting.filter(x => ['large','small'].includes(getCard(catalog, x.cardId)?.type));
    const enemyHunters = hunters.filter(x => x.controller !== p), friendlyHunters = hunters.filter(x => x.controller === p);
    const groups = [];
    const add = (cards, label) => groups.push({ cards, label });
    if (clause.kind === 'card' && (/Contrez /i.test(text) || d.id === '135')) {
      let entries=s.stack.filter(e=>e.player!==p);
      if (['140','163','168'].includes(d.id)) {
        const maximum=d.id==='140'?2:d.id==='163'?Math.min(3,board(s).filter(x=>x.controller===p&&['item','token'].includes(getCard(catalog,x.cardId).type)&&/Persistant\s*-/i.test(getCard(catalog,x.cardId).text)).length):Infinity;
        entries=entries.filter(e=>e.kind==='cast'&&getCard(catalog,e.cardId)?.type==='technique'&&(getCard(catalog,e.cardId).cost||0)<=maximum);
      } else if (d.id==='161') entries=entries.filter(e=>e.kind==='ability'&&['small','large'].includes(getCard(catalog,e.sourceCardId||e.cardId)?.type));
      else if (d.id==='166') entries=entries.filter(e=>e.kind==='trigger');
      else if (d.id==='135') entries=entries.filter(e=>e.targetIds?.length===1);
      return {targets:entries.map(e=>({id:e.uid,label:e.label})),targetCount:1,targetMin:1};
    }
    if (d.id === '127' && clause.kind === 'ability') {
      const entries = s.stack.filter(e => e.targetIds?.length && e.targetIds.every(id => id === c.uid));
      return { targets: entries.map(e => ({id:e.uid,label:e.label})), targetCount:1, targetMin:1 };
    }
    if (!/cibl[ée]/i.test(text)) return { targets:[], targetCount:0, targetMin:0 };
    if (/depuis votre d[ée]fausse/i.test(text)) {
      const cards=s.players[p].discard.filter(x=>!/carte Objet cibl[ée]/i.test(text)||getCard(catalog,x.cardId)?.type==='item');
      return {targets:targets(cards,catalog),targetCount:1,targetMin:1};
    }
    if (clause.kind === 'ability') {
      if (['006','057','058','060','063','086','142'].includes(d.id)) add(enemyHunters.filter(x => x.tapped),'Chasseur ennemi engagé');
      else if (['029','032','037','116'].includes(d.id)) add(enemyHunters,'Chasseur ennemi');
      else if (d.id === '062') add(enemyHunters.filter(x => stats(s,x,catalog).force <= 2),'Chasseur ennemi de Force 2 ou moins');
      else if (d.id === '043') add(friendlyHunters.filter(x => getCard(catalog,x.cardId).subtypes.includes('Lance')),'Chasseur Lance allié');
      else if (d.id === '011') add(friendlyHunters,'Chasseur allié');
      else if (d.id === '090' || d.id === '144') {
        add(enemyHunters.filter(x => x.tapped),'Chasseur ennemi engagé');
        add(monsters.filter(x => x.controller === p && (d.id === '090' ? getCard(catalog,x.cardId).type === 'small' : x.uid !== c.uid && getCard(catalog,x.cardId).subtypes.some(t => /Cephalos|Cephadrome/i.test(t)))),'Monstre allié');
      } else if (['171','175'].includes(d.id)) add(enemyHunters.filter(x => x.uid === s.combat?.attackerId),'Chasseur ennemi attaquant');
      else if (d.id === '122') add(monsters.filter(x => x.controller === p && x.uid !== c.uid && getCard(catalog,x.cardId).type === 'small'),'Autre Petit Monstre allié');
      else if (d.id === '151') add(board(s).filter(x => x.controller === p && ['item','token'].includes(getCard(catalog,x.cardId).type) && /Persistant\s*-/i.test(getCard(catalog,x.cardId).text)),'Objet persistant allié');
      else if (d.id === '200') add([...enemyHunters,...monsters.filter(x=>x.controller!==p)],'Chasseur ou Monstre ennemi');
      else if (d.id === 'token-fiole') add(hunters,'Chasseur');
    }
    if (!groups.length) {
      if (d.id==='112') { add(monsters.filter(x=>x.controller===p),'Monstre allié');add(enemyHunters.filter(x=>x.tapped),'Chasseur ennemi engagé'); }
      else {
      const both = /Chasseur ou (?:un )?Monstre|Monstre ou (?:un )?Chasseur/i.test(text);
      let candidates = both ? [...hunters,...monsters] : /Monstre[^.!?]*cibl[ée]/i.test(text) ? monsters : /Chasseurs?[^.!?]*cibl[ée]/i.test(text) ? hunters : /Objet Persistant[^.!?]*cibl[ée]/i.test(text) ? board(s).filter(x=>['item','token'].includes(getCard(catalog,x.cardId).type)&&/Persistant\s*-/i.test(getCard(catalog,x.cardId).text)) : board(s).filter(x=>getCard(catalog,x.cardId).type!=='chief');
      if (/alli[ée]s?[^.!?]*cibl[ée]|cibl[ée][^.!?]*que vous contr[ôo]lez/i.test(text)) candidates = candidates.filter(x=>x.controller===p);
      if (/ennemis?[^.!?]*cibl[ée]/i.test(text)) candidates = candidates.filter(x=>x.controller!==p);
      if (/engag[ée] cibl[ée]/i.test(text)) candidates=candidates.filter(x=>x.tapped);
      if (/participant [àa] un combat/i.test(text)) candidates=candidates.filter(x=>[s.combat?.attackerId,s.combat?.targetId].includes(x.uid));
      if (/attaquant cibl[ée]/i.test(text)) candidates=candidates.filter(x=>s.combat?.attackerId===x.uid);
      if (/attaqu[ée] cibl[ée]/i.test(text)) candidates=candidates.filter(x=>s.combat?.targetId===x.uid);
      const maximum=text.match(/(?:ayant )?(\d+) de Force ou moins/i)?.[1];
      if(maximum)candidates=candidates.filter(x=>stats(s,x,catalog).force<=Number(maximum));
      if (/Chasseur Lance/i.test(text)) candidates=candidates.filter(x=>getCard(catalog,x.cardId).subtypes.includes('Lance'));
      if(d.type==='item')candidates=candidates.filter(x=>!/^Volant[.\s]/i.test(getCard(catalog,x.cardId).text.trim()));
      add(candidates,'Cible à vérifier manuellement');
      }
    }
    const optional = d.id!=='106' && /jusqu[’']à \d+ (?:autre )?(?:Chasseur|Monstre|Objet)/i.test(text), maximumTargets = Number(text.match(/jusqu[’']à (\d+) (?:autre )?(?:Chasseur|Monstre|Objet)/i)?.[1]||0);
    const extraMunitionTarget=d.id==='106'&&friendlyHunters.some(x=>getCard(catalog,x.cardId).subtypes.some(t=>/Fusarbalète (?:légère|lourde)/i.test(t)));
    const targetCount=d.id==='106'?(extraMunitionTarget?2:1):Math.max(groups.length,maximumTargets);
    const combined = new Map();
    for (const group of groups) for (const target of targets(group.cards,catalog)) combined.set(target.id,{...target,label:group.label+' : '+target.label});
    return { targets:[...combined.values()], targetCount, targetMin:optional?0:d.id==='106'?1:targetCount, targetGroups:groups.map(g=>g.cards.map(x=>x.uid)) };
  }
  function abilityCostOptions(s, c, clause, catalog) {
    if (clause.kind === 'trigger') return [{ id:'confirm', label:'Confirmer que ce déclenchement a eu lieu et que ses conditions sont remplies', cost:0, eat:0 }];
    const prefix = clause.prefix, p = c.controller, me = s.players[p];
    const cost = Number(prefix.match(/\[(\d+)\]/)?.[1] || 0), eat = Number(prefix.match(/Manger (\d+)/i)?.[1] || 0);
    const tapSelf = /engagez[- ]moi/i.test(prefix), sacrificeSelf = /sacrifiez[- ]moi/i.test(prefix), returnSelf = /renvoyez[- ]moi/i.test(prefix);
    if (tapSelf && c.tapped || me.rations.ready+me.rations.tapped < eat) return [];
    let costs = /\[X\]/.test(prefix) ? [1,2,3] : [cost];
    if (c.cardId === '091' && stats(s,c,catalog).remainingHp <= 4) costs = costs.map(n=>Math.max(0,n-1));
    costs = costs.filter(n=>n<=me.rations.ready+me.pool);
    const markerMatch = prefix.match(/retire[rz] (jusqu[’']à )?(\d+) marqueurs? ([\p{L}]+)/iu);
    const marker = markerMatch?.[3], maxMarker = Number(markerMatch?.[2] || 0), availableMarkers = c.counters[marker] || 0;
    if (marker && !markerMatch[1] && availableMarkers < maxMarker) return [];
    const markerAmounts = markerMatch?.[1] ? Array.from({length:Math.min(maxMarker,availableMarkers)+1},(_,i)=>i) : [maxMarker];
    let otherCosts = [{kind:null,card:null}];
    if (/d[ée]faussez 1 carte/i.test(prefix)) otherCosts = me.hand.map(card=>({kind:'discard',card}));
    else if (/engagez un Chasseur alli[ée] d[ée]gag[ée]/i.test(prefix)) otherCosts = me.camp.filter(card=>!card.tapped).map(card=>({kind:'tap',card}));
    else if (/sacrifiez (?:un|une) /i.test(prefix)) {
      let candidates = board(s).filter(x=>x.controller===p && x.uid!==c.uid && getCard(catalog,x.cardId).type!=='chief');
      if (/un Objet ou un Petit Monstre/i.test(prefix)) candidates=candidates.filter(x=>['item','token','small'].includes(getCard(catalog,x.cardId).type));
      else if (/Petit Monstre/i.test(prefix)) candidates=candidates.filter(x=>getCard(catalog,x.cardId).type==='small');
      else if (/Fiole/i.test(prefix)) candidates=candidates.filter(x=>getCard(catalog,x.cardId).subtypes.includes('Fiole'));
      else candidates=candidates.filter(x=>['item','token'].includes(getCard(catalog,x.cardId).type));
      if (/Minerai/i.test(prefix)) candidates=candidates.filter(x=>getCard(catalog,x.cardId).subtypes.includes('Minerai'));
      if (/d[ée]gag[ée]/i.test(prefix)) candidates=candidates.filter(x=>!x.tapped);
      otherCosts=candidates.map(card=>({kind:'sacrifice',card}));
    }
    const result=[];
    for(const n of costs)for(const markerAmount of markerAmounts)for(const other of otherCosts){
      const id='confirm:'+n+':'+markerAmount+':'+(other.card?.uid||'none');
      result.push({id,label:'Confirmer : '+(n?'['+n+'], ':'')+(eat?'Manger '+eat+', ':'')+(tapSelf?'engager cette carte, ':'')+(sacrificeSelf?'sacrifier cette carte, ':'')+(returnSelf?'renvoyer cette carte en main, ':'')+(marker? 'retirer '+markerAmount+' '+marker+', ':'')+(other.card?(other.kind==='tap'?'engager ':other.kind==='discard'?'défausser ':'sacrifier ')+getCard(catalog,other.card.cardId).name+', ':'')+'conditions vérifiées',cost:n,eat,tapSelf,sacrificeSelf,returnSelf,marker,markerAmount,otherKind:other.kind,otherId:other.card?.uid||null});
    }
    return result;
  }
  function abilityAvailable(s,c,clause,catalog) {
    if (clause.once && c.used?.['manual:'+clause.index] === s.turn) return false;
    if (clause.kind === 'trigger') return true;
    if (c.cardId === '044' && ![s.combat?.attackerId,s.combat?.targetId].includes(c.uid)) return false;
    if (c.cardId === '057' && stats(s,c,catalog).remainingHp > 4) return false;
    if (c.cardId === '065' && !s.players[1-c.controller].camp.some(x=>stats(s,x,catalog).force===0)) return false;
    if (c.cardId === '069' && c.counters.Charge) return false;
    if (c.cardId === '190' && s.players[c.controller].rations.ready+s.players[c.controller].rations.tapped<5) return false;
    if (c.cardId === '130' && (!s.combat || c.controller!==s.activePlayer)) return false;
    if (c.cardId === '175' && (!s.combat || onBoard(s,s.combat.targetId)?.controller!==c.controller || s.combat.targetId===c.uid)) return false;
    return true;
  }
  function putPermanent(s, entry, catalog) {
    const c=entry.card,d=getCard(catalog,c.cardId),me=s.players[entry.player];
    if(d.type==='hunter'){
      if(me.camp.length>=5){
        const replaced=me.camp.find(x=>x.uid===entry.replacementId);
        if(!replaced){s.pending={kind:'replace',player:entry.player,entry:clone(entry),label:'Choisissez le Chasseur à remplacer avant cette arrivée.'};s.priorityPlayer=entry.player;return;}
        move(s,replaced,'discard',catalog);log(s,getCard(catalog,replaced.cardId).name+' est remplacé sans mourir.');
      }
    }
    resetCard(c);c.controller=entry.player;
    if(d.type==='hunter'){c.tapped=!/^Préparé[.\s]/i.test(d.text.trim());me.camp.push(c);}
    else if(['large','small'].includes(d.type)){c.tapped=!/^Préparé[.\s]/i.test(d.text.trim());s.hunting.push(c);}
    else if(/Persistant\s*-\s*Zone de chasse/i.test(d.text))s.hunting.push(c);
    else me.items.push(c);
    log(s,d.name+' arrive '+(c.tapped?'engagé':'dégagé')+'. Déclarez ses déclenchements éventuels manuellement.');
  }
  function isPermanent(card) { return ['hunter','large','small'].includes(card.type) || card.type==='item'&&/Persistant\s*-/i.test(card.text); }
  function resolveTop(s,catalog) {
    const e=s.stack.at(-1);if(!e)return;
    log(s,'Résolution : '+e.label+'.');
    if(e.kind==='cast'&&isPermanent(getCard(catalog,e.cardId))){
      s.stack.pop();putPermanent(s,e,catalog);if(s.pending)s.stack.push(e);else responseWindow(s);
    }else{
      s.pending={kind:'manual-resolution',player:e.player,entry:clone(e),label:'Résolvez cet effet manuellement avec les outils, puis terminez sa résolution.'};s.priorityPlayer=e.player;s.passCount=0;s.phase='resolving';
    }
  }
  function getActions(s, catalog) {
    if (!s || s.mode !== 'manual' || !Array.isArray(s.players) || s.players.length !== 2) throw Error('État de table libre invalide.');
    if (s.winner != null) return [];
    const p = s.priorityPlayer, me = s.players[p], out = [];
    const add = a => out.push({ player: p, ...a });
    if (s.phase === 'mulligan') { add({ id: 'keep', type: 'keep', label: 'Garder cette main' }); if (!me.mulliganUsed) add({ id: 'mulligan', type: 'mulligan', label: 'Changer toute la main (une seule fois)' }); return out; }
    if (s.pending?.kind==='replace') return [{id:'replace:'+s.pending.entry.uid,type:'replace',player:s.pending.player,label:'Choisir le Chasseur à remplacer',targetCount:1,targets:targets(s.players[s.pending.player].camp,catalog)}];
    const resolving=s.pending?.kind==='manual-resolution';
    const normal=s.phase==='main'&&!s.combat&&!s.stack.length&&!s.pending&&p===s.activePlayer;
    const canRespond=!s.pending&&s.combat?.stage!=='interpose';
    if (s.phase === 'start' && p === s.activePlayer && !s.stack.length && !s.pending) add({ id: 'continue', type: 'continue', label: 'Continuer : ration et pioche automatiques', description: 'Après avoir résolu les capacités de début de tour manuellement.' });
    if (resolving) {
      add({id:'finish-resolution:'+s.pending.entry.uid,type:'finish-resolution',label:'Terminer la résolution manuelle',description:s.pending.label});
      for(const e of s.stack.filter(e=>e.uid!==s.pending.entry.uid))add({id:'counter:'+e.uid,type:'counter',label:'Contrer : '+e.label+' (effet manuel)',entryUid:e.uid,description:'Seulement si le texte en cours de résolution permet de contrer cet élément.'});
    }
    const free = 'Mise sur le terrain par un effet : les coûts et capacités sont résolus manuellement.';
    for (const c of me.hand) {
      const d = getCard(catalog, c.cardId), count = d.type === 'hunter' && me.camp.length >= 5 ? 1 : 0;
      const placement = {sourceId:c.uid,targetCount:count,targets:count?targets(me.camp,catalog):[]};
      const targetInfo=isPermanent(d)?{targetCount:count,targetMin:count,targets:placement.targets}:abilityTargetInfo(s,c,{kind:'card',effect:cleanText(d.text)},catalog);
      const options = {sourceId:c.uid,...targetInfo,description:count?'Choisissez le Chasseur à remplacer. Il ne meurt pas de ce remplacement.':'La carte va dans la pile. Coût imprimé seulement ; vérifiez manuellement ses conditions et coûts supplémentaires.'};
      const fast=/^(?:\[R[ée]flexe\]|\[Intrusion\]|Intrusion\b)/i.test(d.text.trim());
      if (canRespond && s.stack.length<64 && (normal||fast) && targetInfo.targets.length>=(targetInfo.targetMin||0) && (d.cost || 0) <= me.rations.ready + me.pool) add({ ...options, id: 'play:' + c.uid, type: 'play', label: 'Jouer ' + d.name + (count ? ' (remplacer un Chasseur)' : '') });
      if(normal||resolving)add({ ...placement, id: 'place:' + c.uid, type: 'place', label: 'Mettre en jeu ' + d.name + ' par un effet', description: free });
      add({ id: 'discard:' + c.uid, type: 'discard', label: 'Défausser ' + d.name, sourceId: c.uid });
      add({ id: 'top:' + c.uid, type: 'top', label: 'Mettre cette carte sur le deck', sourceId: c.uid });
    }
    for (const c of board(s)) {
      const d = getCard(catalog, c.cardId), creature = ['hunter', 'large', 'small'].includes(d.type);
      if(canRespond && s.stack.length<64 && c.controller===p)for(const clause of clauses(d)){
        if(clause.kind==='ability'&&!normal&&!clause.reflex || !abilityAvailable(s,c,clause,catalog))continue;
        const costOptions=abilityCostOptions(s,c,clause,catalog),targetInfo=abilityTargetInfo(s,c,clause,catalog);
        if(!costOptions.length || targetInfo.targets.length<(targetInfo.targetMin||0) || targetInfo.targetGroups?.some(g=>!g.length)&&(targetInfo.targetMin||0)>0)continue;
        add({id:(clause.kind==='ability'?'ability:':'trigger:')+c.uid+':'+clause.index,type:clause.kind==='ability'?'ability':'manual-trigger',sourceId:c.uid,label:(clause.kind==='ability'?'Activer : ':'Déclarer le déclenchement : ')+d.name+' ('+(clause.index+1)+')',...targetInfo,choices:costOptions.map(o=>({id:o.id,label:o.label})),costOptions,clauseIndex:clause.index,description:clause.text+'\nTable libre : vérifiez manuellement les conditions, les cibles et les éventuels coûts complémentaires. L’effet sera résolu manuellement après les réponses.'});
      }
      add({ id: 'tap:' + c.uid, type: 'tap', label: c.tapped ? 'Dégager ' + d.name : 'Engager ' + d.name, sourceId: c.uid });
      if (d.type !== 'chief') add({ id: 'return:' + c.uid, type: 'return', label: 'Renvoyer dans la main du propriétaire', sourceId: c.uid });
      if (c.controller === p && d.type !== 'chief') add({ id: 'sacrifice:' + c.uid, type: 'sacrifice', label: 'Sacrifier (aucun point automatique)', sourceId: c.uid });
      if (creature) {
        add({ id: 'force-up:' + c.uid, type: 'force-up', label: '+1 Force jusqu’à la fin du tour', sourceId: c.uid });
        add({ id: 'force-down:' + c.uid, type: 'force-down', label: '−1 Force jusqu’à la fin du tour', sourceId: c.uid });
        add({ id: 'armor-up:' + c.uid, type: 'armor-up', label: '+1 Cuirasse jusqu’à la fin du tour', sourceId: c.uid });
        add({ id: 'surmenage:' + c.uid, type: 'surmenage', label: c.overexerted ? 'Retirer Surmenage' : 'Marquer Surmenage', sourceId: c.uid });
        add({ id: 'damage-up:' + c.uid, type: 'damage-up', label: 'Infliger 1 blessure d’effet', sourceId: c.uid });
        if (c.damage > 0) add({ id: 'damage-down:' + c.uid, type: 'damage-down', label: 'Soigner 1 blessure', sourceId: c.uid });
        add({ id: 'kill:' + c.uid, type: 'kill', label: 'Éliminer : choisir le bénéficiaire', sourceId: c.uid, choices: [{ id: '0', label: 'Camp 1 reçoit le point si Grand Monstre' }, { id: '1', label: 'Camp 2 reçoit le point si Grand Monstre' }, { id: 'none', label: 'Aucun point (ex. sacrifice)' }] });
      }
      add({ id: 'marker-up:' + c.uid, type: 'marker-up', label: 'Ajouter 1 marqueur manuel', sourceId: c.uid });
      if (c.counters?.Manuel > 0) add({ id: 'marker-down:' + c.uid, type: 'marker-down', label: 'Retirer 1 marqueur manuel', sourceId: c.uid });
      const namedMarkers=[...new Set(Array.from(d.text.matchAll(/marqueurs? ([\p{L}]+)/gu),m=>m[1]).filter(name=>/^(?:Chaleur|Spirituel|Charge|Quête)$/.test(name)))];
      for(const marker of namedMarkers){
        add({id:'marker-add:'+c.uid+':'+marker,type:'marker-add',sourceId:c.uid,marker,label:'Ajouter 1 marqueur '+marker});
        if(c.counters[marker]>0)add({id:'marker-remove:'+c.uid+':'+marker,type:'marker-remove',sourceId:c.uid,marker,label:'Retirer 1 marqueur '+marker});
      }
    }
    for (const c of me.discard) { add({ id: 'recover:' + c.uid, type: 'recover', label: 'Récupérer ' + getCard(catalog, c.cardId).name + ' en main', sourceId: c.uid }); add({ id: 'top:' + c.uid, type: 'top', label: 'Placer au-dessus du deck', sourceId: c.uid }); }
    if (normal) {
      const monsters = s.hunting.filter(c => ['large', 'small'].includes(getCard(catalog, c.cardId)?.type));
      if (monsters.length) for (const c of me.camp.filter(c => !c.tapped)) add({ id: 'attack:' + c.uid, type: 'attack', label: 'Attaquer avec ' + getCard(catalog, c.cardId).name, sourceId: c.uid, targetCount: 1, targets: targets(monsters, catalog), description: 'Combat de base : appliquez les capacités et mots-clés manuellement avant les blessures.' });
      add({ id: 'endturn', type: 'endturn', label: 'Terminer le tour', description: 'Résolvez d’abord les capacités de fin de tour manuellement.' });
    }
    if (!s.pending&&s.combat?.stage === 'interpose' && !s.combat.interpositionUsed) for (const c of s.hunting.filter(c => c.controller === p && !c.tapped && c.uid !== s.combat.targetId && /Interposition/i.test(getCard(catalog, c.cardId)?.text || ''))) add({ id: 'interpose:' + c.uid, type: 'interpose', label: 'Interposer ' + getCard(catalog, c.cardId).name, sourceId: c.uid, description: 'Vérifiez manuellement les éventuelles conditions de cette capacité.' });
    if(!s.pending)add({ id: 'pass', type: 'pass', label:s.stack.length?'Passer — laisser résoudre':s.flow==='end'?'Passer — terminer le tour':s.combat?'Passer cette fenêtre de combat':'Donner la main à l’autre joueur' });
    add({ id: 'draw', type: 'draw', label: 'Piocher 1 carte (effet manuel)' });
    add({ id: 'shuffle', type: 'shuffle', label: 'Mélanger mon deck' });
    if (me.rations.deck > 0) add({ id: 'ration-add', type: 'ration-add', label: 'Ajouter 1 ration depuis la réserve', choices: [{ id: 'ready', label: 'Dégagée' }, { id: 'tapped', label: 'Engagée' }] });
    if (me.rations.ready > 0) add({ id: 'ration-tap', type: 'ration-tap', label: 'Engager 1 ration' });
    if (me.rations.tapped > 0) add({ id: 'ration-untap', type: 'ration-untap', label: 'Dégager 1 ration' });
    if (me.rations.ready + me.rations.tapped > 0) add({ id: 'eat', type: 'eat', label: 'Manger 1 ration', choices: [{ id: 'ready', label: 'Une ration dégagée' }, { id: 'tapped', label: 'Une ration engagée' }].filter(c => me.rations[c.id] > 0) });
    add({ id: 'pool-up', type: 'pool-up', label: 'Gagner [1] (ressource du tour)' });
    if (me.pool > 0) add({ id: 'pool-down', type: 'pool-down', label: 'Dépenser [1] ressource du tour' });
    add({ id: 'score-up', type: 'score-up', label: 'Ajouter 1 point au camp', choices: s.players.map((x, i) => ({ id: String(i), label: x.name })) });
    if (s.players.some(x => x.score > 0)) add({ id: 'score-down', type: 'score-down', label: 'Retirer 1 point au camp', choices: s.players.map((x, i) => ({ id: String(i), label: x.name })).filter((_, i) => s.players[i].score > 0) });
    add({ id: 'token', type: 'token', label: 'Créer un jeton Objet', choices: [{ id: 'token-fiole', label: 'Fiole de puissance (dégagée)' }, { id: 'token-minerai', label: 'Minerai (dégagé)' }] });
    add({ id: 'victory', type: 'victory', label: 'Déclarer une victoire par capacité', choices: s.players.map((x, i) => ({ id: String(i), label: x.name })), description: 'Ex. Lao-Shan Lung : les joueurs vérifient que la capacité permet de gagner.' });
    return out;
  }
  function dispatch(previous, action, catalog) {
    if (!action || typeof action.id !== 'string') throw Error('Action invalide.');
    const allowed = getActions(previous, catalog).find(a => a.id === action.id);
    if (!allowed || action.type !== allowed.type || action.player !== allowed.player || (action.sourceId ?? null) !== (allowed.sourceId ?? null)) throw Error('Cette action n’est pas autorisée pour ce joueur ou cette carte.');
    const selected = action.targetIds || [], count = allowed.targetCount || 0, min = allowed.targetMin ?? count;
    if (!Array.isArray(selected) || selected.length < min || selected.length > count || new Set(selected).size !== selected.length || selected.some(id => !allowed.targets?.some(t => t.id === id))) throw Error('Choisissez les cibles légales demandées.');
    if(min>0&&allowed.targetGroups?.some(group=>!selected.some(id=>group.includes(id))))throw Error('Choisissez une cible légale pour chaque groupe demandé.');
    if (allowed.choices && !allowed.choices.some(c => c.id === action.choiceId)) throw Error('Choisissez une option proposée.');
    const s = clone(previous), p = allowed.player, me = s.players[p], c = allowed.sourceId ? find(s, allowed.sourceId) : null, d = c && getCard(catalog, c.cardId);
    const type = allowed.type, choice = action.choiceId;
    if (type === 'keep' || type === 'mulligan') {
      if (type === 'mulligan') { const hand = me.hand; me.hand = []; me.deck.push(...hand); log(s, me.name + ' remet sa main dans son deck pour un mulligan.'); draw(s, p, 5); me.deck = shuffle(s, me.deck); me.mulliganUsed = true; log(s, me.name + ' mélange son deck après le mulligan.'); } else log(s, me.name + ' garde sa main.');
      s.mulliganDone[p] = true; if (s.mulliganDone.every(Boolean)) beginTurn(s, catalog); else s.priorityPlayer = 1 - p; return s;
    }
    if (type === 'continue') { completeStart(s); return s; }
    if(type==='replace'){
      const entry=s.pending.entry,replaced=onBoard(s,selected[0]);move(s,replaced,'discard',catalog);log(s,getCard(catalog,replaced.cardId).name+' est remplacé sans mourir.');
      s.pending=null;s.stack=s.stack.filter(e=>e.uid!==entry.uid);putPermanent(s,entry,catalog);responseWindow(s);return s;
    }
    if(type==='finish-resolution'){
      const entry=s.stack.find(e=>e.uid===s.pending.entry.uid);
      s.stack=s.stack.filter(e=>e.uid!==s.pending.entry.uid);s.pending=null;
      if(entry?.kind==='cast'){resetCard(entry.card);s.players[entry.player].discard.push(entry.card);log(s,getCard(catalog,entry.cardId).name+' rejoint la défausse après sa résolution.');}
      else if(entry)log(s,'Résolution manuelle terminée : '+entry.label+'.');
      checkDeaths(s,catalog,p);responseWindow(s);return s;
    }
    if(type==='counter'){
      const index=s.stack.findIndex(e=>e.uid===allowed.entryUid),entry=s.stack.splice(index,1)[0];
      if(entry.kind==='cast'){resetCard(entry.card);s.players[entry.player].discard.push(entry.card);}
      log(s,entry.label+' est contrée. Les coûts payés ne sont pas remboursés.');return s;
    }
    if(type==='ability'||type==='manual-trigger'){
      const clause=clauses(d).find(x=>x.index===allowed.clauseIndex),cost=allowed.costOptions.find(x=>x.id===choice),snapshot=clone(c);
      pay(s,p,cost.cost);
      if(cost.eat){const r=me.rations,fromTapped=Math.min(r.tapped,cost.eat);r.tapped-=fromTapped;r.ready-=cost.eat-fromTapped;r.deck+=cost.eat;log(s,me.name+' Mange '+cost.eat+' ration'+(cost.eat>1?'s':'')+' (retour dans la réserve).');}
      if(cost.tapSelf)c.tapped=true;
      if(cost.marker)c.counters[cost.marker]-=cost.markerAmount;
      if(cost.otherId){const other=find(s,cost.otherId);if(cost.otherKind==='tap')other.tapped=true;else move(s,other,'discard',catalog);log(s,me.name+' paie le coût : '+(cost.otherKind==='tap'?'engage ':cost.otherKind==='discard'?'défausse ':'sacrifie ')+getCard(catalog,other.cardId).name+'.');}
      if(clause.once)c.used['manual:'+clause.index]=s.turn;
      if(cost.sacrificeSelf)move(s,c,'discard',catalog);else if(cost.returnSelf)move(s,c,'hand',catalog);
      if(!s.flow)s.flow=s.phase==='start'?'start':s.combat?'combat':'main';
      s.stack.push(stackEntry(s,clause.kind,p,snapshot,{catalog,label:(clause.kind==='trigger'?'Déclenchement : ':'Capacité : ')+d.name,effectText:clause.text,manual:true,targetIds:selected,targetVersions:Object.fromEntries(selected.map(id=>[id,find(s,id)?.incarnation||0]))}));
      log(s,me.name+(clause.kind==='trigger'?' déclare un déclenchement de ':' active ')+d.name+'. L’effet est ajouté à la pile.');responseWindow(s);return s;
    }
    if (type === 'play' || type === 'place') {
      if(type==='play'){
        pay(s,p,d.cost||0);remove(s,c.uid);resetCard(c);c.controller=p;
        if(!s.flow)s.flow=s.phase==='start'?'start':s.combat?'combat':'main';
        s.stack.push(stackEntry(s,'cast',p,c,{catalog,card:c,label:d.name,manual:true,targetIds:selected,replacementId:d.type==='hunter'?selected[0]||null:null,targetVersions:Object.fromEntries(selected.map(id=>[id,find(s,id)?.incarnation||0]))}));
        log(s,me.name+' joue '+d.name+'. La carte est ajoutée à la pile.');responseWindow(s);return s;
      }
      if (selected.length) { const replaced = find(s, selected[0]); move(s, replaced, 'discard', catalog); log(s, getCard(catalog, replaced.cardId).name + ' est remplacé sans mourir.'); }
      remove(s, c.uid); resetCard(c); c.controller = p;
      if (d.type === 'hunter') { c.tapped = !/^Préparé[.\s]/i.test(d.text.trim()); me.camp.push(c); }
      else if (d.type === 'large' || d.type === 'small') { c.tapped = !/^Préparé[.\s]/i.test(d.text.trim()); s.hunting.push(c); }
      else if (d.type === 'item' && /Persistant\s*-/i.test(d.text)) { if (/Persistant\s*-\s*Zone de chasse/i.test(d.text)) s.hunting.push(c); else me.items.push(c); }
      else me.discard.push(c);
      log(s, me.name + (type === 'play' ? ' joue ' : ' met en jeu par un effet ') + d.name + '. Résolvez le texte manuellement.'); return s;
    }
    if (type === 'discard') { move(s, c, 'discard', catalog); log(s, me.name + ' défausse ' + d.name + '.'); }
    else if (type === 'top') { move(s, c, 'top', catalog); log(s, me.name + ' place 1 carte au-dessus de son deck.'); }
    else if (type === 'recover') { move(s, c, 'hand', catalog); log(s, me.name + ' récupère ' + d.name + ' en main.'); }
    else if (type === 'return') { move(s, c, 'hand', catalog); log(s, d.name + ' retourne dans la main de son propriétaire.'); }
    else if (type === 'sacrifice') { move(s, c, 'discard', catalog); log(s, d.name + ' est sacrifié. Résolvez les capacités liées manuellement.'); }
    else if (type === 'tap') { c.tapped = !c.tapped; log(s, d.name + (c.tapped ? ' est engagé.' : ' est dégagé.')); }
    else if (type === 'force-up' || type === 'force-down' || type === 'armor-up') { c.mods.push({ kind: type === 'armor-up' ? 'armor' : 'force', value: type === 'force-down' ? -1 : 1, duration: 'turn' }); log(s, d.name + ' : ajustement de ' + (type === 'armor-up' ? 'Cuirasse' : 'Force') + ' pour ce tour.'); }
    else if (type === 'surmenage') { c.overexerted = !c.overexerted; log(s, d.name + ' : Surmenage ' + (c.overexerted ? 'ajouté.' : 'retiré.')); }
    else if (type === 'marker-up' || type === 'marker-down') { c.counters.Manuel = Math.max(0, (c.counters.Manuel || 0) + (type === 'marker-up' ? 1 : -1)); log(s, d.name + ' : ' + c.counters.Manuel + ' marqueur(s) manuel(s).'); }
    else if (type === 'marker-add' || type === 'marker-remove') { c.counters[allowed.marker]=Math.max(0,(c.counters[allowed.marker]||0)+(type==='marker-add'?1:-1));log(s,d.name+' : '+c.counters[allowed.marker]+' marqueur(s) '+allowed.marker+'.'); }
    else if (type === 'damage-up') { c.damage++; log(s, d.name + ' subit 1 blessure d’effet.'); checkDeaths(s, catalog, p); }
    else if (type === 'damage-down') { c.damage = Math.max(0, c.damage - 1); log(s, d.name + ' est soigné de 1 blessure.'); }
    else if (type === 'kill') { kill(s, c, choice === 'none' ? null : Number(choice), catalog); win(s); }
    else if (type === 'attack') { c.tapped = true; s.combat = { id: 'manual-fight-' + (++s.seq), attackerId: c.uid, targetId: selected[0], stage: 'interpose', interpositionUsed: false }; s.phase = 'combat'; s.flow='combat'; s.priorityPlayer = s.activePlayer; s.passCount = 0; log(s, d.name + ' attaque ' + getCard(catalog, find(s, selected[0]).cardId).name + '. Résolvez les capacités manuellement.'); }
    else if (type === 'interpose') { c.tapped = true; s.combat.targetId = c.uid; s.combat.interpositionUsed = true; s.combat.stage = 'damage'; s.priorityPlayer = s.activePlayer; s.passCount = 0; log(s, d.name + ' s’interpose. Aucune autre Interposition n’est autorisée.'); }
    else if (type === 'pass') {
      s.passCount++;
      if(s.passCount>=2&&s.stack.length){s.passCount=0;resolveTop(s,catalog);}
      else if(s.passCount>=2&&s.flow==='end'){finishTurn(s,catalog);}
      else if (s.combat && s.passCount >= 2) {
        s.passCount = 0; s.priorityPlayer = s.activePlayer;
        if (s.combat.stage === 'interpose') { s.combat.stage = 'damage'; log(s, 'Interposition terminée. Appliquez les capacités et ajustements avant les blessures de base.'); }
        else {
          const attacker = onBoard(s, s.combat.attackerId), target = onBoard(s, s.combat.targetId);
          if (attacker && target) {
            const a = stats(s, attacker, catalog), t = stats(s, target, catalog);
            const hit = (amount, armor) => amount <= 0 ? 0 : Math.max(1, amount - armor);
            target.damage += hit(a.force, t.armor); attacker.damage += hit(t.force, a.armor);
            log(s, 'Blessures de combat simultanées : ' + hit(a.force, t.armor) + ' au Monstre, ' + hit(t.force, a.armor) + ' au Chasseur.');
            const targetDead = target.damage >= t.hp, attackerDead = attacker.damage >= a.hp;
            s.combat = null; s.phase = 'main'; s.flow='main';
            if (targetDead) kill(s, target, attacker.controller, catalog);
            if (attackerDead) kill(s, attacker, target.controller, catalog);
            win(s); log(s, 'Combat terminé. Résolvez les capacités de fin de combat manuellement.');
          } else { s.combat = null; s.phase = 'main'; s.flow='main'; }
        }
      } else { s.priorityPlayer = 1 - p; if (s.passCount >= 2) s.passCount = 0; }
    }
    else if (type === 'endturn') { s.flow='end';s.phase='response';s.priorityPlayer=s.activePlayer;s.passCount=0;log(s,'Fin de tour annoncée : les deux joueurs peuvent répondre.'); }
    else if (type === 'draw') draw(s, p, 1);
    else if (type === 'shuffle') { me.deck = shuffle(s, me.deck); log(s, me.name + ' mélange son deck.'); }
    else if (type === 'ration-add') addRation(s, p, choice === 'tapped');
    else if (type === 'ration-tap') { me.rations.ready--; me.rations.tapped++; log(s, me.name + ' engage 1 ration.'); }
    else if (type === 'ration-untap') { me.rations.tapped--; me.rations.ready++; log(s, me.name + ' dégage 1 ration.'); }
    else if (type === 'eat') { me.rations[choice]--; me.rations.deck++; log(s, me.name + ' Mange 1 ration.'); }
    else if (type === 'pool-up' || type === 'pool-down') { me.pool += type === 'pool-up' ? 1 : -1; log(s, me.name + ' ajuste ses ressources temporaires à [' + me.pool + '].'); }
    else if (type === 'score-up' || type === 'score-down') { s.players[Number(choice)].score += type === 'score-up' ? 1 : -1; log(s, s.players[Number(choice)].name + ' : score ajusté manuellement à ' + s.players[Number(choice)].score + '.'); win(s); }
    else if (type === 'token') { const token = instance(s, choice, p); me.items.push(token); log(s, me.name + ' crée un jeton ' + getCard(catalog, choice).name + ' dégagé.'); }
    else if (type === 'victory') { s.winner = Number(choice); s.phase = 'ended'; log(s, s.players[s.winner].name + ' déclare une victoire par capacité, validée manuellement par les joueurs.'); }
    else throw Error('Action de table libre inconnue.');
    if (type !== 'pass') s.passCount = 0;
    return s;
  }
  return { version: '0.1.0-manual', NOTICE, getCard, validateDeck, createGame, getActions, dispatch, stats };
});
