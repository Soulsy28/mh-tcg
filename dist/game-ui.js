/* Plateau partagé : affichage et décisions uniquement. Le parent applique les règles. */
(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clone = value => JSON.parse(JSON.stringify(value));
  function create(options = {}) {
    const container = typeof options.container === 'string' ? document.querySelector(options.container) : options.container;
    if (!container || !options.catalog?.cards) throw Error('Le plateau demande un conteneur et un catalogue.');
    const catalog = options.catalog, engine = options.engine;
    const byId = new Map(catalog.cards.map(card => [card.id, card]));
    const localPlayer = options.localPlayer === 0 || options.localPlayer === 1 ? options.localPlayer : null;
    const manual = options.mode === 'manual';
    let state = null, actions = [], selected = null, perspective = null, handHidden = false, destroyed = false, busy = false;
    let modalAction = null, targetSelection = [];
    const content = document.createElement('div'); content.className = 'mh-game-content';
    const dialog = document.createElement('dialog'); dialog.className = 'mh-game-dialog'; dialog.setAttribute('aria-labelledby', 'mh-game-dialog-title');
    const preview = document.createElement('div'); preview.className = 'card-preview'; preview.hidden = true;
    const shell = document.createElement('section'); shell.className = 'mh-game'; shell.append(content, dialog, preview); container.appendChild(shell);
    const call = (name, ...args) => { try { return options[name]?.(...args); } catch (error) { if (name !== 'onError') options.onError?.(error); } };
    function allInstances() {
      if (!state) return [];
      return [...(state.hunting || []), ...state.players.flatMap(p => [p.chief, ...(p.hand || []), ...(p.camp || []), ...(p.items || []), ...(p.discard || [])]), ...(state.stack || []).map(e => e.card)].filter(Boolean);
    }
    const find = uid => allInstances().find(card => card.uid === uid);
    const definition = instance => byId.get(instance?.cardId);
    const actor = () => state.priorityPlayer ?? state.activePlayer ?? 0;
    const phaseName = () => ({mulligan:'Main de départ',main:'Phase principale',combat:'Combat',response:'Réponses',ended:'Partie terminée',gameover:'Partie terminée',start:'Début du tour',manual:'Table libre'})[state.phase] || state.phase || 'Partie';
    function cardStats(instance) {
      if (instance.computedStats) return instance.computedStats;
      if (engine?.stats) { try { const stats = engine.stats(state, instance.uid, catalog); if (stats) return stats; } catch {} }
      const card = definition(instance), force = card?.force, hp = card?.hp;
      return {force, hp, remainingHp: hp == null ? null : Math.max(0, hp - (instance.damage || 0)), armor: 0};
    }
    function cardHtml(instance, showOwner = false) {
      if (instance?.hidden || !instance?.cardId) return '<div class="game-card card-hidden" aria-label="Carte cachée"><div style="width:100%;aspect-ratio:744/1039;display:grid;place-items:center;background:repeating-linear-gradient(45deg,#264d39,#264d39 5px,#315c42 5px,#315c42 8px);border:2px solid #a9a574;border-radius:4px;color:#d9cc8c;font-size:25px">✦</div></div>';
      const card = definition(instance); if (!card) return '';
      const stats = cardStats(instance), creature = ['large','small','hunter'].includes(card.type);
      const available = actions.some(action => action.sourceId === instance.uid && !['choose','skip'].includes(action.type));
      const markers = Object.entries(instance.counters || {}).filter(([, value]) => value > 0).map(([key,value]) => `<span>${escape(key)} ${value}</span>`).join('');
      return `<button class="game-card ${instance.tapped?'tapped':''} ${selected===instance.uid?'selected':''} ${available?'available':''}" data-game-uid="${escape(instance.uid)}" data-game-preview="${card.id}" aria-label="${escape(card.name)}${instance.tapped?', engagé':''}${creature?`, ${stats.remainingHp ?? card.hp} PV restants`:''}"><img src="${card.image}" alt="${escape(card.name)}" draggable="false">${instance.tapped?'<span class="card-tap-label">ENGAGÉ</span>':''}${creature?`<span class="card-stats"><b>⚔ ${stats.force ?? card.force}</b><b class="${instance.damage?'hurt':''}">♥ ${stats.remainingHp ?? card.hp}</b></span>`:''}${markers?`<span class="card-counters">${markers}</span>`:''}${showOwner?`<span class="owner-pip">Camp ${(instance.controller ?? instance.owner ?? 0)+1}</span>`:''}</button>`;
    }
    function rationsHtml(player) {
      const r = player.rations || {}, ready = Math.min(12, r.ready || 0), tapped = Math.min(12, r.tapped || 0), reserve = Math.min(12, r.deck || 0);
      return `<div class="rations"><span>RATIONS</span><span class="ration-dots" aria-label="${ready} disponibles, ${tapped} engagées, ${reserve} en réserve">${Array.from({length:Math.max(0,ready)},()=>'<i class="ration-dot"></i>').join('')}${Array.from({length:Math.max(0,tapped)},()=>'<i class="ration-dot spent"></i>').join('')}${Array.from({length:Math.max(0,reserve)},()=>'<i class="ration-dot reserve"></i>').join('')}</span><span class="ration-stat"><b>${ready}</b> disponibles · ${reserve} en réserve</span>${player.pool?`<span class="pool-chip">+${typeof player.pool==='number'?player.pool:0} ressource</span>`:''}</div>`;
    }
    function zoneHtml(index) {
      const p = state.players[index], camp = p.camp || [], items = p.items || [];
      return `<section class="player-zone ${state.activePlayer===index?'active-zone':''}" aria-label="Camp de ${escape(p.name)}"><div class="player-heading"><div class="player-name"><span class="avatar">${index+1}</span><strong>${escape(p.name)}</strong>${state.activePlayer===index?'<em>Joueur actif</em>':''}</div><div class="score">${p.score || 0}<span>/ 6 points</span></div></div><div class="player-body"><div class="chief-slot"><p class="zone-caption">Chef de chasse</p>${p.chief?cardHtml(p.chief):''}</div><div class="camp-area"><p class="zone-caption">Camp · ${camp.length} / 5 chasseurs</p><div class="camp-slots">${camp.map(card=>cardHtml(card)).join('')}${Array.from({length:Math.max(0,5-camp.length)},()=>'<span class="empty-slot" aria-hidden="true">✧</span>').join('')}</div>${items.length?`<div class="item-row" aria-label="Objets persistants">${items.map(card=>cardHtml(card)).join('')}</div>`:''}</div><div class="small-stacks"><button class="stack-button" data-game-zone="deck" data-game-player="${index}" title="${p.deck?.length || 0} cartes dans le deck"><div class="card-back">✦</div><span>DECK · ${p.deck?.length || 0}</span></button><button class="stack-button" data-game-zone="discard" data-game-player="${index}"><div class="card-back discard-stack">${p.discard?.length || 0}</div><span>DÉFAUSSE</span></button></div></div>${rationsHtml(p)}</section>`;
    }
    function actionHtml(action, index) {
      return `<button class="action-button ${['keep','pass','endturn','endTurn','finish','continue'].includes(action.type)?'primary':''}" data-game-action="${index}" ${busy?'disabled':''}>${escape(action.label || action.type)}</button>`;
    }
    function render() {
      if (destroyed) return;
      if (!state?.players?.length) { content.innerHTML = '<p class="empty-note">Le plateau se prépare…</p>'; return; }
      const current = actor(), me = localPlayer ?? 0, handPlayer = localPlayer ?? perspective ?? current;
      const hand = state.players[handPlayer]?.hand || [], selectedInstance = find(selected), selectedCard = definition(selectedInstance);
      const globals = actions.map((a,index)=>({a,index})).filter(({a})=>!a.sourceId || ['choose','skip','keep','mulligan'].includes(a.type));
      const specific = actions.map((a,index)=>({a,index})).filter(({a})=>selectedInstance && a.sourceId===selectedInstance.uid && !globals.some(g=>g.a===a));
      const waiting = localPlayer !== null && current !== localPlayer && !actions.length;
      const help = state.winner!=null?'La chasse est terminée. Tu peux consulter les cartes ou revenir au salon.':state.pending?.label || (waiting?'L’adversaire prépare son action. Sa main et l’ordre des decks restent cachés.':state.phase==='mulligan'?'Conserve cette main ou remplace-la une fois.':state.stack?.length?'Réponds à l’effet en attente ou passe pour poursuivre la résolution.':state.combat?'Le combat progresse par étapes. Joue un Réflexe disponible ou passe.':state.phase==='response'?'La fin du tour est annoncée. Tu peux jouer un Réflexe ou passer pour continuer.':manual?'Sélectionne une carte pour agir. Applique les effets particuliers avec les commandes de la table.':'Sélectionne une carte de ta main pour la jouer, ou une carte du terrain pour agir.');
      const title = manual?'Table libre':localPlayer===null?'Test automatisé':'Partie directe';
      content.innerHTML = `<div class="topline"><div><div class="eyebrow">Monster Hunter TCG</div><h1>${title}</h1><p>${manual?'Les effets particuliers des cartes sont à résoudre manuellement.':localPlayer===null?'Entraînement solo · Tu contrôles les décisions des deux camps.':'Connexion directe · Seule ta main est affichée.'}</p></div><div class="toolbar"><button class="button quiet" data-game-command="exit">← Retour</button>${options.onSave?'<button class="button" data-game-command="save">Enregistrer</button>':''}${options.onExport?'<button class="button" data-game-command="export">Exporter</button>':''}</div></div><div class="game-layout"><div class="board">${state.winner!=null?`<div class="winner-banner">✦ ${escape(state.players[state.winner]?.name || 'Partie terminée')} remporte la chasse</div>`:''}<div class="board-meta"><span class="turn-mark"><i></i><strong>TOUR ${state.turn || 1}</strong><span>· ${escape(phaseName())}</span></span><span>OBJECTIF · 6 POINTS</span></div><div class="board-scroll">${zoneHtml(1-me)}<section class="arena" aria-label="Zone de chasse partagée"><div class="arena-heading">✧ Zone de chasse partagée ${state.hunting?.length?`· ${state.hunting.length}`:''}</div><div class="arena-cards">${state.hunting?.length?state.hunting.map(card=>cardHtml(card,true)).join(''):'<div class="arena-empty"><span class="arena-symbol">✧</span>La chasse commence ici<small>Joue des Monstres, puis chasse-les pour marquer des points.</small></div>'}</div></section>${zoneHtml(me)}</div><section class="hand-panel" aria-label="Main"><div class="hand-heading"><span>MAIN DE ${localPlayer===null?`<select data-game-hand-player aria-label="Main affichée"><option value="auto" ${perspective===null?'selected':''}>${escape(state.players[current]?.name)} · automatique</option><option value="0" ${perspective===0?'selected':''}>${escape(state.players[0]?.name)}</option><option value="1" ${perspective===1?'selected':''}>${escape(state.players[1]?.name)}</option></select>`:`<strong>${escape(state.players[localPlayer]?.name)}</strong>`} · ${hand.length} cartes</span><button class="tiny-button" data-game-command="hand">${handHidden?'Afficher':'Masquer'} la main</button></div><div class="hand-cards">${handHidden?'<p class="hand-empty">Main masquée. Clique sur « Afficher la main » pour consulter tes cartes.</p>':hand.length?hand.map(card=>cardHtml(card)).join(''):'<p class="hand-empty">Aucune carte en main.</p>'}</div></section></div><aside class="side-column"><section class="side-panel"><div class="panel-title">${waiting?'L’adversaire joue':'À vous de jouer'} <span class="phase-pill">Camp ${current+1}</span></div><p class="actor-label">${escape(state.players[current]?.name)}</p><p class="action-description">${escape(help)}</p><div class="action-list">${globals.map(({a,index})=>actionHtml(a,index)).join('')}</div>${selectedCard?`<div class="selection-title"><img src="${selectedCard.image}" alt=""><span>${escape(selectedCard.name)}</span><button class="icon-button" data-game-command="unselect" aria-label="Désélectionner">×</button></div><div class="action-list">${specific.map(({a,index})=>actionHtml(a,index)).join('') || '<p class="empty-note">Aucune action disponible pour cette carte à cet instant.</p>'}</div><button class="button quiet full" style="margin-top:8px" data-game-detail="${selectedCard.id}">Lire la carte</button>`:''}</section><section class="side-panel"><div class="panel-title">Pile des effets <small>${state.stack?.length || 0} en attente</small></div>${state.stack?.length?`<ol class="stack-list">${state.stack.map((entry,index)=>`<li class="stack-entry"><strong>${escape(entry.label || entry.name || byId.get(entry.cardId)?.name || entry.kind || 'Capacité')}</strong><small>${index===state.stack.length-1?'Prochain effet à résoudre':'En attente'}${entry.player!=null?` · Camp ${entry.player+1}`:''}</small></li>`).join('')}</ol>`:'<p class="empty-note">Aucun effet en attente.</p>'}</section><section class="side-panel"><div class="panel-title">Carnet de chasse <small>${state.log?.length || 0} événements</small></div><div class="history">${(state.log || []).slice(-22).reverse().map((event,index)=>`<div class="history-entry"><span>${((state.log?.length || 0)-index).toString().padStart(2,'0')}</span><p>${escape(typeof event==='string'?event:event.text || event.message)}</p></div>`).join('') || '<p class="empty-note">Les événements publics de la partie apparaîtront ici.</p>'}</div></section><p class="tips"><strong>${manual?'Table libre':'À savoir'}</strong>${manual?'Les mouvements, compteurs et points sont partagés ; les joueurs appliquent les capacités particulières en lisant les cartes.':localPlayer===null?'Tu contrôles les deux camps. Le panneau indique qui doit agir. Survole une carte pour la lire et clique dessus pour ses actions.':'Les décisions autorisées apparaissent quand c’est à toi de jouer. Une déconnexion suspend les échanges.'}</p></aside></div>`;
      preview.hidden = true;
    }
    function showDialog(title, body, footer = '') {
      dialog.innerHTML = `<div class="modal-heading"><h2 id="mh-game-dialog-title">${title}</h2><button class="icon-button" data-game-close aria-label="Fermer">×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}`;
      if (!dialog.open) dialog.showModal(); preview.hidden = true;
    }
    function closeDialog() { if (dialog.open) dialog.close(); modalAction = null; targetSelection = []; }
    function detail(id) {
      const card = byId.get(id); if (!card) return;
      showDialog('À la loupe',`<div class="detail-layout"><img class="detail-image" src="${card.image}" alt="${escape(card.name)}"><div><p class="detail-id">MHFG · ${escape(card.id)}</p><h3>${escape(card.name)}</h3><p class="detail-meta">${escape(card.typeLabel)}${card.subtypes?.length?' / '+card.subtypes.map(escape).join(' / '):''}<br>${(card.colors || []).map(escape).join(' / ')}${card.cost!=null?' · Coût '+card.cost:''}${card.force!=null?' · Force '+card.force:''}${card.hp!=null?' · PV '+card.hp:''}</p><p class="effect-text">${escape(card.text)}</p></div></div>`);
    }
    async function runAction(action) {
      if (busy || destroyed) return;
      busy = true; closeDialog(); render();
      try { await options.onAction?.(clone(action)); selected = null; }
      catch (error) { call('onError', error); }
      finally { if (!destroyed) { busy = false; render(); } }
    }
    function chooseAction(action) {
      if (action.choices?.length && action.choiceId == null) {
        modalAction = action;
        showDialog(escape(action.label || 'Choisir un effet'),`<p>${escape(action.description || state.pending?.label || 'Choisis une option pour poursuivre.')}</p><div class="choice-list">${action.choices.map((choice,index)=>`<button data-game-choice="${index}">${escape(typeof choice==='string'?choice:choice.label || choice.name || choice.id)}</button>`).join('')}</div>`); return;
      }
      if (action.targets?.length && !action.targetIds && (action.targetCount ?? 1)>0) { modalAction = action; targetSelection = []; renderTargets(); return; }
      runAction(action);
    }
    function renderTargets() {
      const action = modalAction, max = action.targetCount ?? 1, min = action.targetMin ?? max;
      showDialog('Choisir les cibles',`<p>${escape(action.label)}<br>${min===max?`Choisis ${max} cible${max>1?'s':''}.`:`Choisis de ${min} à ${max} cibles.`} <b>${targetSelection.length} / ${max}</b></p><div class="targets-grid">${action.targets.map((target,index)=>{const instance=find(target.id),card=definition(instance) || byId.get(target.cardId || target.id);return `<button class="target-card ${targetSelection.includes(target.id)?'chosen':''}" data-game-target="${index}">${card?`<img src="${card.image}" alt="">`:''}<span>${escape(target.label || card?.name || target.id)}</span>${targetSelection.includes(target.id)?'<span class="target-check">✓</span>':''}</button>`;}).join('')}</div>`,`<button class="button" data-game-close>Annuler</button><button class="button primary" data-game-confirm-targets ${targetSelection.length<min || targetSelection.length>max?'disabled':''}>Confirmer la sélection</button>`);
    }
    function onClick(event) {
      const target = event.target.closest('button'); if (!target || !shell.contains(target)) return;
      const data = target.dataset;
      if (target.hasAttribute('data-game-close')) return closeDialog();
      if (data.gameCommand) {
        switch (data.gameCommand) {
          case 'exit': call('onExit'); return;
          case 'save': call('onSave', state); return;
          case 'export': call('onExport', state); return;
          case 'hand': handHidden=!handHidden; render(); return;
          case 'unselect': selected=null; render(); return;
        }
      }
      if (data.gameUid) { selected = selected===data.gameUid?null:data.gameUid; render(); return; }
      if (data.gameDetail) return detail(data.gameDetail);
      if (data.gameAction != null) { const action=actions[Number(data.gameAction)]; if(action && !busy)chooseAction({...action}); return; }
      if (data.gameChoice != null && modalAction) { const choice=modalAction.choices?.[Number(data.gameChoice)]; if(choice==null)return; chooseAction({...modalAction,choiceId:typeof choice==='string'?choice:choice.id ?? choice.value ?? Number(data.gameChoice)}); return; }
      if (data.gameTarget != null && modalAction) {
        const targetChoice=modalAction.targets?.[Number(data.gameTarget)]; if(!targetChoice)return;
        const index=targetSelection.indexOf(targetChoice.id),max=modalAction.targetCount ?? 1;
        if(index>=0)targetSelection.splice(index,1);else if(targetSelection.length<max)targetSelection.push(targetChoice.id);else if(max===1)targetSelection=[targetChoice.id];
        renderTargets(); return;
      }
      if (target.hasAttribute('data-game-confirm-targets') && modalAction) { const action={...modalAction,targetIds:[...targetSelection]}; return runAction(action); }
      if (data.gameZone) {
        const player=state.players[Number(data.gamePlayer)]; if(!player)return;
        if(data.gameZone==='deck') { showDialog('Deck principal',`<p>Le deck de ${escape(player.name)} contient ${player.deck?.length || 0} cartes. Son ordre reste caché.</p>`);return; }
        showDialog(`Défausse · ${escape(player.name)}`,player.discard?.length?`<div class="targets-grid">${player.discard.map(instance=>{const card=definition(instance);return card?`<button class="target-card" data-game-detail="${card.id}"><img src="${card.image}" alt=""><span>${escape(card.name)}</span></button>`:'';}).join('')}</div>`:'<p>La défausse est vide.</p>');
      }
    }
    function onChange(event) { if (localPlayer===null && event.target.hasAttribute('data-game-hand-player')) { perspective=event.target.value==='auto'?null:Number(event.target.value);render(); } }
    function onOver(event) {
      const target=event.target.closest('[data-game-preview]'); if(!target || dialog.open)return;
      const card=byId.get(target.dataset.gamePreview);if(!card)return;
      preview.innerHTML=`<img src="${card.image}" alt="${escape(card.name)}">`;preview.hidden=false;
    }
    function onOut(event) { if(event.target.closest('[data-game-preview]'))preview.hidden=true; }
    function onCancel() { modalAction=null;targetSelection=[]; }
    shell.addEventListener('click',onClick);shell.addEventListener('change',onChange);shell.addEventListener('pointerover',onOver);shell.addEventListener('pointerout',onOut);dialog.addEventListener('cancel',onCancel);
    render();
    return {
      update(nextState, nextActions = []) {
        if(destroyed)return;
        state=nextState;actions=Array.isArray(nextActions)?nextActions:[];
        if(selected && !find(selected))selected=null;
        // Une action distante peut rendre une sélection ouverte périmée.
        if(dialog.open && modalAction && !actions.some(action=>action.id===modalAction.id))closeDialog();
        render();
      },
      destroy() {
        if(destroyed)return;destroyed=true;closeDialog();
        shell.removeEventListener('click',onClick);shell.removeEventListener('change',onChange);shell.removeEventListener('pointerover',onOver);shell.removeEventListener('pointerout',onOut);dialog.removeEventListener('cancel',onCancel);shell.remove();
        state=null;actions=[];
      }
    };
  }
  root.MHGameUI = {create};
})(typeof globalThis!=='undefined'?globalThis:this);
