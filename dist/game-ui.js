/* Plateau partagé : affichage et décisions uniquement. Le parent applique les règles. */
(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clone = value => JSON.parse(JSON.stringify(value));
  let boardNumber = 0;
  function create(options = {}) {
    const container = typeof options.container === 'string' ? document.querySelector(options.container) : options.container;
    if (!container || !options.catalog?.cards) throw Error('Le plateau demande un conteneur et un catalogue.');
    const catalog = options.catalog, engine = options.engine, i18n = root.MHI18n;
    const byId = new Map(catalog.cards.map(card => [card.id, card]));
    const namedCards = [...byId.values()].sort((a,b) => b.name.length-a.name.length);
    const cardView = card => card ? (i18n?.cardView(card) || card) : card;
    const translated = value => i18n?.t(String(value ?? '')) ?? String(value ?? '');
    const tr = (fr, en) => i18n?.getLanguage() === 'en' ? en : fr;
    // Seul le libellé affiché change ; le moteur reçoit toujours son action d'origine.
    function label(value) {
      let text = String(value ?? '');
      const protectedNames = [];
      // Les pseudos peuvent eux-mêmes correspondre à un mot de l'interface.
      for (const name of [...new Set((state?.players || []).map(player => player.name).filter(Boolean))].sort((a,b) => b.length-a.length)) {
        const pattern = new RegExp('(^|[^\\p{L}\\p{N}_])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\p{L}\\p{N}_])', 'gu');
        text = text.replace(pattern, (_, prefix) => {
          const marker = '\uE000' + protectedNames.length + '\uE001';
          protectedNames.push(name); return prefix + marker;
        });
      }
      text = translated(text);
      if (i18n?.getLanguage() === 'en') {
        for (const card of namedCards) {
          if (card.nameEn && card.nameEn !== card.name) text = text.split(card.name).join(card.nameEn);
        }
      }
      return text.replace(/\uE000(\d+)\uE001/g, (_, index) => protectedNames[Number(index)]);
    }
    const localPlayer = options.localPlayer === 0 || options.localPlayer === 1 ? options.localPlayer : null;
    const manual = options.mode === 'manual';
    let state = null, actions = [], selected = null, perspective = null, handHidden = false, destroyed = false, busy = false;
    let modalAction = null, targetSelection = [], modalView = null, inspectedUid = null;
    let dragUid = null, touchDrag = null, dragGhost = null, suppressClickUntil = 0;
    let dragScrollFrame = null, dragScrollTime = 0;
    let effectKey = false, arrowMode = false, arrowOrigin = null, arrowFrame = null;
    const arrowMarker = 'mh-game-arrow-' + (++boardNumber);
    const content = document.createElement('div'); content.className = 'mh-game-content';
    const dialog = document.createElement('dialog'); dialog.className = 'mh-game-dialog'; dialog.setAttribute('aria-labelledby', 'mh-game-dialog-title');
    const shell = document.createElement('section'); shell.className = 'mh-game'; shell.append(content, dialog); container.appendChild(shell);
    const arrowOverlay = document.createElementNS ? document.createElementNS('http://www.w3.org/2000/svg','svg') : document.createElement('svg');
    arrowOverlay.setAttribute('class','game-arrows'); arrowOverlay.setAttribute('aria-hidden','true'); arrowOverlay.setAttribute('focusable','false'); shell.appendChild(arrowOverlay);
    const call = (name, ...args) => { try { return options[name]?.(...args); } catch (error) { if (name !== 'onError') options.onError?.(error); } };
    function allInstances() {
      if (!state) return [];
      return [...(state.hunting || []), ...state.players.flatMap(p => [p.chief, ...(p.hand || []), ...(p.camp || []), ...(p.items || []), ...(p.discard || [])]), ...(state.stack || []).map(e => e.card), ...stackInstances()].filter(Boolean);
    }
    const stackKey = entry => String(entry?.uid || entry?.id || '');
    function stackInstance(entry) {
      const cardId=entry.cardId || entry.sourceCardId || entry.card?.cardId || entry.sourceCard?.cardId || entry.sourceSnapshot?.cardId;
      if (!stackKey(entry) || !byId.has(cardId)) return null;
      // Une entrée de pile est publique. Son aperçu ne reprend aucune donnée cachée du snapshot.
      return {uid:'stack-preview:'+stackKey(entry),cardId,owner:entry.player,controller:entry.player};
    }
    function stackInstances() { return (state?.stack || []).map(stackInstance).filter(Boolean); }
    function publicArrowNodes() {
      if (!state) return new Set();
      const cards=[...(state.hunting || []),...state.players.flatMap(p=>[p.chief,...(p.camp || []),...(p.items || [])])];
      return new Set([...cards.filter(c=>c&&!c.hidden&&c.cardId&&c.uid).map(c=>'card:'+c.uid),...(state.stack || []).filter(e=>stackKey(e)).map(e=>'stack:'+stackKey(e))]);
    }
    const find = uid => allInstances().find(card => card.uid === uid);
    const definition = instance => cardView(byId.get(instance?.cardId));
    const actor = () => state.priorityPlayer ?? state.activePlayer ?? 0;
    const handPlayer = () => localPlayer ?? perspective ?? actor();
    const phaseName = () => state.phase === 'response' ? state.flow === 'start' ? 'Début du tour · Réponses' : state.flow === 'end' ? 'Fin du tour · Réponses' : 'Réponses' : ({mulligan:'Main de départ',main:'Phase principale',combat:'Combat',ended:'Partie terminée',gameover:'Partie terminée',start:'Début du tour',manual:'Table libre',resolving:tr('Résolution d’un effet','Resolving an effect')})[state.phase] || state.phase || 'Partie';
    function visibleInstances() {
      if (!state) return [];
      const hand = handHidden ? [] : state.players[handPlayer()]?.hand || [];
      const discard = dialog.open && modalView?.type === 'zone' && modalView.zone === 'discard' ? state.players[modalView.index]?.discard || [] : [];
      return [...(state.hunting || []), ...state.players.flatMap(p => [p.chief, ...(p.camp || []), ...(p.items || [])]), ...hand, ...discard, ...stackInstances()]
        .filter(card => card && !card.hidden && card.cardId);
    }
    function inspectable(uid) { return visibleInstances().find(card => card.uid === uid); }
    function effectActions(uid) {
      if (!state || busy || dialog.open || state.winner != null || state.phase==='mulligan' || !inspectable(uid)) return [];
      if (localPlayer!==null && localPlayer!==actor()) return [];
      return actions.filter(action=>action.sourceId===uid && action.player===actor() && ['ability','activate','manual-ability','manual-trigger'].includes(action.type));
    }
    function activateEffect(uid) {
      if (!inspectable(uid) || busy) return;
      inspect(uid); selected=uid;
      const available=effectActions(uid);
      if (available.length===1) return chooseAction({...available[0]});
      if (available.length>1) return showEffectChoices(uid,available);
      showDialog(tr('Activer un effet','Activate an effect'),`<p data-no-i18n>${tr('Aucune capacité activable n’est disponible pour cette carte à cet instant. Vérifie le joueur qui a la priorité, les coûts et les conditions de la carte.','No activated ability is available for this card right now. Check priority, costs and the card’s conditions.')}</p>`);
    }
    function showEffectChoices(uid, available) {
      showDialog(tr('Choisir la capacité','Choose an ability'),`<p data-no-i18n>${tr('Choisis la capacité à mettre dans la pile. Ses coûts et cibles restent à confirmer.','Choose the ability to put on the stack. Its costs and targets still apply.')}</p><div class="choice-list">${available.map(action=>`<button data-no-i18n data-game-candidate="${escape(action.id)}">${escape(label(action.label || action.type))}</button>`).join('')}</div>`,'',{type:'effect-actions',uid});
    }
    function showPlayChoices(uid, available) {
      showDialog(tr('Comment jouer cette carte ?','How do you want to play this card?'),`<div class="choice-list">${available.map(action=>`<button data-no-i18n data-game-candidate="${escape(action.id)}">${escape(label(action.label || action.type))}</button>`).join('')}</div>`,'',{type:'play-actions',uid});
    }
    function legalPlayActions(uid) {
      if (!state || busy || state.winner != null || state.phase === 'mulligan' || handHidden) return [];
      const player = handPlayer();
      if (player !== actor() || (localPlayer !== null && player !== localPlayer)) return [];
      const instance = state.players[player]?.hand?.find(card => card.uid === uid && !card.hidden && card.cardId);
      if (!instance || (instance.owner != null && instance.owner !== player)) return [];
      return actions.filter(action => action.sourceId === uid && ['play', 'cast'].includes(action.type) && action.player === player);
    }
    function dropKind(uid) {
      const card = byId.get(inspectable(uid)?.cardId);
      if (!card) return null;
      if (['large', 'small'].includes(card.type)) return 'hunting';
      if (card.type === 'hunter') return 'camp';
      // Le texte canonique est français ; la présentation anglaise ne change pas les règles.
      if (card.type === 'item' && /Persistant\s*-/i.test(card.text || '')) return /Persistant\s*-\s*Zone de chasse/i.test(card.text) ? 'hunting' : 'camp';
      return ['item', 'technique'].includes(card.type) ? 'effect' : null;
    }
    function validDrop(target, uid = dragUid) {
      if (!target || !shell.contains(target) || !uid || !legalPlayActions(uid).length || target.dataset.gameDrop !== dropKind(uid)) return false;
      return target.dataset.gameDrop !== 'camp' || Number(target.dataset.gamePlayer) === handPlayer();
    }
    function phaseTrackHtml() {
      const phases = [['mulligan',tr('Main de départ','Opening hand')],['start',tr('Début du tour','Turn begins')],['main',tr('Principale','Main')],['combat',tr('Combat','Combat')],['end',tr('Fin du tour','Turn ends')]];
      const current = state.phase === 'mulligan' ? 'mulligan' : state.phase === 'start' || state.flow === 'start' ? 'start' : state.flow === 'end' || ['ended','gameover'].includes(state.phase) ? 'end' : state.combat || state.flow === 'combat' || state.phase === 'combat' ? 'combat' : 'main';
      const currentIndex = phases.findIndex(([key]) => key === current);
      return `<nav class="phase-track" aria-label="${tr('Étapes du tour','Turn steps')}" data-no-i18n>${phases.map(([key,text],index) => `<span class="phase-step ${key===current?'current':''} ${index<currentIndex?'completed':''}" ${key===current?'aria-current="step"':''}><b>${index+1}</b><span>${escape(text)}</span></span>`).join('')}</nav>`;
    }
    function inspectorHtml() {
      const instance = inspectable(inspectedUid), card = definition(instance);
      if (!card) return `<div class="panel-title" data-no-i18n>${tr('À la loupe','Card inspector')}</div><div class="inspector-placeholder" data-no-i18n><span aria-hidden="true">✧</span><strong>${tr('Une carte en grand','Read every card')}</strong><p>${tr('Survole une carte ou sélectionne-la pour lire son effet ici.','Hover over or select a card to read its effect here.')}</p></div>`;
      return `<div class="panel-title" data-no-i18n>${tr('À la loupe','Card inspector')}<small>${escape(card.id)}</small></div><img class="inspector-image" src="${escape(card.image)}" alt="${escape(card.name)}" draggable="false"><h2 class="inspector-name" data-no-i18n>${escape(card.name)}</h2><p class="inspector-meta" data-no-i18n>${escape([card.typeLabel,...(card.subtypes || [])].filter(Boolean).join(' · '))}${card.cost!=null?`<br>${tr('Coût','Cost')} ${card.cost}`:''}${card.force!=null?` · ${tr('Force','Strength')} ${card.force}`:''}${card.hp!=null?` · ${tr('PV','HP')} ${card.hp}`:''}</p><p class="inspector-effect" data-no-i18n>${escape(card.text || tr('Cette carte n’a pas de texte d’effet.','This card has no effect text.'))}</p>`;
    }
    function inspect(uid) {
      if (!inspectable(uid) || inspectedUid === uid) return;
      inspectedUid = uid;
      const panel = content.querySelector('.inspector-panel');
      if (panel) panel.innerHTML = inspectorHtml();
    }
    function scoreboardHtml() {
      return `<section class="scoreboard" aria-label="${tr('Points de chasse','Hunt points')}" data-no-i18n>${state.players.map((player,index)=>`<div class="scoreboard-player ${state.activePlayer===index?'active':''}" data-score-player="${index}" aria-label="${escape(player.name)} · ${player.score || 0} ${tr('points sur 6','points out of 6')}"><strong class="scoreboard-name">${escape(player.name)}</strong><span class="scoreboard-value">${player.score || 0}<small> / 6</small></span><span class="scoreboard-goal">${tr('POINTS DE CHASSE','HUNT POINTS')}${state.activePlayer===index?` · ${tr('TOUR ACTIF','ACTIVE TURN')}`:''}</span></div>`).join('')}</section>`;
    }
    function boardToolsHtml() {
      const player=localPlayer ?? actor(), own=(state.arrows || []).some(arrow=>arrow.player===player);
      return `<div class="board-tools" data-no-i18n><div class="arrow-controls"><button class="button arrow-tool ${arrowMode?'active':''}" data-game-command="arrow" aria-pressed="${arrowMode}" ${busy?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path d="M4 20C4 11 12 6 20 4M12 4h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${tr('Flèche','Arrow')}</button><button class="tiny-button arrow-clear" data-game-command="clear-arrows" ${!own||busy?'disabled':''}>${tr('Effacer mes flèches','Clear my arrows')}</button></div><p class="arrow-help" role="status">${arrowMode?(arrowOrigin?tr('Choisis la carte d’arrivée. Échap annule.','Choose the destination card. Escape cancels.'):tr('Choisis une carte de départ, puis une carte d’arrivée.','Choose a source card, then a destination card.')):effectKey?tr('F maintenu : clique sur une carte pour activer sa capacité.','F held: click a card to activate its ability.'):tr('F + clic : activer une capacité · Flèche : relier deux cartes publiques','F + click: activate an ability · Arrow: connect two public cards')}</p></div>`;
    }
    function stackHtml() {
      const entries=state.stack || [];
      const resolving=state.pending?.kind==='manual-resolution';
      return `<section class="stack-zone" aria-label="${tr('Pile des cartes et effets','Card and effect stack')}" data-no-i18n><div class="stack-heading"><h2>${tr('Pile','Stack')} <small>${entries.length}</small></h2><p>${resolving?tr('Résolution manuelle en cours · termine l’effet avant de reprendre les réponses','Manual resolution in progress · finish the effect before responses resume'):tr('Dernier ajouté, premier résolu · chaque joueur peut répondre','Last added, first resolved · each player may respond')}</p></div>${entries.length?`<ol class="stack-cards">${[...entries].reverse().map((entry,index)=>{
        const instance=stackInstance(entry),card=definition(instance),key=stackKey(entry),node='stack:'+key,ability=entry.kind!=='cast';
        return `<li class="stack-item ${index===0?'next':''} ${index===0&&resolving?'resolving':''}"><button class="stack-card ${ability?'ability-copy':''} ${index===0?'next':''} ${arrowMode?'arrow-pickable':''} ${arrowOrigin===node?'arrow-origin':''}" data-game-stack="${escape(key)}" data-game-arrow-node="${escape(node)}" ${instance?`data-game-preview-uid="${escape(instance.uid)}"`:''} aria-label="${escape((ability?tr('Effet de ','Effect of '):tr('Carte : ','Card: '))+(card?.name || label(entry.label || entry.kind)))}" draggable="false">${card?`<img src="${escape(card.image)}" alt="${escape(card.name)}" draggable="false">`:'<span class="stack-card-placeholder">✧</span>'}<span class="stack-card-kind">${ability?tr('EFFET','EFFECT'):tr('CARTE JOUÉE','PLAYED CARD')}</span></button><div class="stack-card-meta"><strong>${escape(label(entry.label || card?.name || tr('Capacité','Ability')))}</strong><small>${escape(state.players[entry.player]?.name || '')}</small><span>${index===0?resolving?tr('Résolution en cours','Resolving now'):tr('Prochain à résoudre','Resolves next'):tr('En attente','Waiting')}</span></div></li>`;
      }).join('')}</ol>`:`<div class="stack-empty"><span aria-hidden="true">✧</span><p>${tr('La pile est vide','The stack is empty')}</p><small>${tr('Les cartes jouées et les capacités activées apparaissent ici avant leur résolution.','Played cards and activated abilities appear here before they resolve.')}</small></div>`}</section>`;
    }
    function rectOf(node, endpoint = false) {
      const bounds=node?.getBoundingClientRect?.();
      if (!bounds) return null;
      const left=bounds.left??bounds.x,top=bounds.top??bounds.y;
      let rect={left,top,right:bounds.right??left+bounds.width,bottom:bounds.bottom??top+bounds.height};
      if (!Object.values(rect).every(Number.isFinite) || rect.right<=rect.left || rect.bottom<=rect.top) return null;
      // Une carte cachée par le défilement interne ne doit pas créer de flèche fantôme.
      const clip=node.closest?.('.board-scroll,.stack-cards,.hand-cards,.inspector-panel');
      const viewport=clip?.getBoundingClientRect?.();
      if (viewport) {
        const x=viewport.left??viewport.x,y=viewport.top??viewport.y;
        const visible={left:Math.max(rect.left,x),top:Math.max(rect.top,y),right:Math.min(rect.right,viewport.right??x+viewport.width),bottom:Math.min(rect.bottom,viewport.bottom??y+viewport.height)};
        if (endpoint && (visible.left>rect.left+.5 || visible.top>rect.top+.5 || visible.right<rect.right-.5 || visible.bottom<rect.bottom-.5)) return null;
        rect=visible;
      }
      return rect.right>rect.left&&rect.bottom>rect.top?rect:null;
    }
    function arrowRoute(from, to, obstacles, frame) {
      const ports=rect=>{
        const x=(rect.left+rect.right)/2,y=(rect.top+rect.bottom)/2;
        return [{x:rect.left-8,y,dx:-1,dy:0},{x:rect.right+8,y,dx:1,dy:0},{x,y:rect.top-8,dx:0,dy:-1},{x,y:rect.bottom+8,dx:0,dy:1}];
      };
      const lines=(axis,mid)=>{
        const low=axis==='x'?frame.left+6:frame.top+6,high=axis==='x'?frame.right-6:frame.bottom-6;
        const values=[mid,...obstacles.flatMap(rect=>axis==='x'?[rect.left-20,rect.right+20]:[rect.top-20,rect.bottom+20])].map(value=>Math.max(low,Math.min(high,value)));
        const unique=[...new Set(values)].sort((a,b)=>Math.abs(a-mid)-Math.abs(b-mid)).slice(0,6);
        return [...new Set([...unique,low,high])];
      };
      const xs=lines('x',(from.left+from.right+to.left+to.right)/4),ys=lines('y',(from.top+from.bottom+to.top+to.bottom)/4);
      let best=null,bestCost=Infinity;
      function consider(points) {
        points=points.filter((point,index)=>!index || point.x!==points[index-1].x || point.y!==points[index-1].y);
        let length=0,hits=0;
        for(let index=1;index<points.length;index++) {
          const a=points[index-1],b=points[index];length+=Math.abs(b.x-a.x)+Math.abs(b.y-a.y);
          for(const rect of obstacles) {
            if (Math.abs(a.y-b.y)<.1) {
              if(a.y>rect.top-2&&a.y<rect.bottom+2&&Math.max(a.x,b.x)>rect.left-2&&Math.min(a.x,b.x)<rect.right+2)hits++;
            } else if(a.x>rect.left-2&&a.x<rect.right+2&&Math.max(a.y,b.y)>rect.top-2&&Math.min(a.y,b.y)<rect.bottom+2)hits++;
          }
        }
        const outside=points.some(point=>point.x<frame.left||point.x>frame.right||point.y<frame.top||point.y>frame.bottom);
        const cost=hits*100000+(outside?1000000:0)+length+(points.length-2)*20;
        if(cost<bestCost){best=points;bestCost=cost;}
      }
      for(const start of ports(from))for(const end of ports(to)) {
        const a={x:start.x+start.dx*18,y:start.y+start.dy*18},b={x:end.x+end.dx*18,y:end.y+end.dy*18};
        consider([start,a,{x:b.x,y:a.y},b,end]);consider([start,a,{x:a.x,y:b.y},b,end]);
        for(const x of xs)consider([start,a,{x,y:a.y},{x,y:b.y},b,end]);
        for(const y of ys)consider([start,a,{x:a.x,y},{x:b.x,y},b,end]);
      }
      return best;
    }
    function roundedArrow(points, origin) {
      const number=value=>Number(value.toFixed(2)), point=p=>number(p.x-origin.left)+' '+number(p.y-origin.top);
      let d='M '+point(points[0]);
      for(let index=1;index<points.length-1;index++) {
        const a=points[index-1],b=points[index],c=points[index+1];
        const before=Math.hypot(b.x-a.x,b.y-a.y),after=Math.hypot(c.x-b.x,c.y-b.y),radius=Math.min(12,before/2,after/2);
        if(!radius)continue;
        const enter={x:b.x-(b.x-a.x)*radius/before,y:b.y-(b.y-a.y)*radius/before},leave={x:b.x+(c.x-b.x)*radius/after,y:b.y+(c.y-b.y)*radius/after};
        d+=' L '+point(enter)+' Q '+point(b)+' '+point(leave);
      }
      return d+' L '+point(points[points.length-1]);
    }
    function drawArrows() {
      arrowFrame=null;
      if(destroyed||!state)return;
      const origin=rectOf(shell);if(!origin){arrowOverlay.innerHTML='';return;}
      arrowOverlay.setAttribute('viewBox',`0 0 ${origin.right-origin.left} ${origin.bottom-origin.top}`);
      const publicNodes=publicArrowNodes(),nodes=new Map();
      for(const element of content.querySelectorAll('[data-game-arrow-node]')) {
        if(publicNodes.has(element.dataset.gameArrowNode)){const rect=rectOf(element,true);if(rect)nodes.set(element.dataset.gameArrowNode,rect);}
      }
      const obstacles=[...new Set([...content.querySelectorAll('.game-card,.stack-card,.inspector-image'),...content.querySelectorAll('[data-game-arrow-node]')])].map(element=>rectOf(element)).filter(Boolean);
      const defs=`<defs>${[0,1].map(player=>`<marker id="${arrowMarker}-${player}" class="game-arrow-marker" data-arrow-player="${player}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse"><path class="game-arrow-head" d="M 1 1 L 11 6 L 1 11 L 4 6 Z"/></marker>`).join('')}</defs>`;
      arrowOverlay.innerHTML=defs+(state.arrows || []).slice(-12).map(arrow=>{
        if(![0,1].includes(arrow.player)||arrow.from===arrow.to||!publicNodes.has(arrow.from)||!publicNodes.has(arrow.to))return '';
        const from=nodes.get(arrow.from),to=nodes.get(arrow.to);if(!from||!to)return '';
        const points=arrowRoute(from,to,obstacles,origin);if(!points?.length)return '';
        const d=roundedArrow(points,origin),x=points[0].x-origin.left,y=points[0].y-origin.top;
        return `<g data-arrow-player="${arrow.player}" data-arrow-id="${escape(arrow.id)}"><path class="game-arrow-halo" d="${d}"/><path class="game-arrow-line" d="${d}" marker-end="url(#${arrowMarker}-${arrow.player})"/><circle class="game-arrow-start" cx="${x}" cy="${y}" r="3"/></g>`;
      }).join('');
    }
    function queueArrows() {
      if(destroyed)return;
      if(!state?.arrows?.length){if(arrowFrame!=null)root.cancelAnimationFrame?.(arrowFrame);arrowFrame=null;arrowOverlay.innerHTML='';return;}
      if(arrowFrame==null){if(root.requestAnimationFrame)arrowFrame=root.requestAnimationFrame(drawArrows);else drawArrows();}
    }
    function chooseArrow(node) {
      if(busy||!state||!publicArrowNodes().has(node))return;
      if(!arrowOrigin){arrowOrigin=node;render();return;}
      if(arrowOrigin===node){arrowOrigin=null;render();return;}
      const source=arrowOrigin;arrowOrigin=null;
      runAction({id:'arrow:add',type:'annotation',player:localPlayer ?? actor(),sourceId:source,targetIds:[node]});
    }
    function cardStats(instance) {
      if (instance.computedStats) return instance.computedStats;
      if (engine?.stats) { try { const stats = engine.stats(state, instance.uid, catalog); if (stats) return stats; } catch {} }
      const card = definition(instance), force = card?.force, hp = card?.hp;
      return {force, hp, remainingHp: hp == null ? null : Math.max(0, hp - (instance.damage || 0)), armor: 0};
    }
    function cardHtml(instance, showOwner = false, inHand = false) {
      if (instance?.hidden || !instance?.cardId) return '<div class="game-card card-hidden" aria-label="Carte cachée"><div style="width:100%;aspect-ratio:744/1039;display:grid;place-items:center;background:repeating-linear-gradient(45deg,#264d39,#264d39 5px,#315c42 5px,#315c42 8px);border:2px solid #a9a574;border-radius:4px;color:#d9cc8c;font-size:25px">✦</div></div>';
      const card = definition(instance); if (!card) return '';
      const stats = cardStats(instance), creature = ['large','small','hunter'].includes(card.type);
      const available = actions.some(action => action.sourceId === instance.uid && !['choose','skip'].includes(action.type));
      const draggable = inHand && legalPlayActions(instance.uid).length > 0 && dropKind(instance.uid);
      const arrowNode=!inHand&&publicArrowNodes().has('card:'+instance.uid)?'card:'+instance.uid:null;
      const markers = Object.entries(instance.counters || {}).filter(([, value]) => value > 0).map(([key,value]) => `<span>${escape(key)} ${value}</span>`).join('');
      return `<button class="game-card ${instance.tapped?'tapped':''} ${selected===instance.uid?'selected':''} ${available?'available':''} ${draggable?'playable-card':''} ${arrowMode&&arrowNode?'arrow-pickable':''} ${arrowOrigin===arrowNode&&arrowNode?'arrow-origin':''}" data-game-uid="${escape(instance.uid)}" data-game-preview-uid="${escape(instance.uid)}" ${arrowNode?`data-game-arrow-node="${escape(arrowNode)}"`:''} draggable="false" ${draggable?'data-game-draggable="true"':''} aria-label="${escape(card.name)}${instance.tapped?', '+tr('engagé','exhausted'):''}${creature?`, ${stats.remainingHp ?? card.hp} ${tr('PV restants','HP remaining')}`:''}" ${draggable?`title="${tr('Glisse cette carte vers sa zone de jeu, ou clique pour choisir une action.','Drag this card to its play area, or click to choose an action.')}"`:''}><img src="${escape(card.image)}" alt="${escape(card.name)}" draggable="false">${instance.tapped?`<span class="card-tap-label">${tr('ENGAGÉ','EXHAUSTED')}</span>`:''}${creature?`<span class="card-stats"><b>⚔ ${stats.force ?? card.force}</b><b class="${instance.damage?'hurt':''}">♥ ${stats.remainingHp ?? card.hp}</b></span>`:''}${markers?`<span class="card-counters">${markers}</span>`:''}${showOwner?`<span class="owner-pip">${tr('Camp','Side')} ${(instance.controller ?? instance.owner ?? 0)+1}</span>`:''}</button>`;
    }
    function rationsHtml(player) {
      const r = player.rations || {}, ready = Math.max(0,Math.min(12, r.ready || 0)), tapped = Math.max(0,Math.min(12, r.tapped || 0)), reserve = Math.max(0,Math.min(12, r.deck || 0));
      const ration = (spent, index) => `<div class="ration-card ${spent?'spent':''}" role="img" aria-label="${escape(tr('Ration','Ration')+' '+(index+1)+' · '+(spent?tr('engagée','exhausted'):tr('disponible','ready')))}"><img src="assets/game/ration.webp" alt="" draggable="false"></div>`;
      return `<section class="ration-zone" aria-label="Rations" data-no-i18n><div class="ration-heading"><strong>RATIONS</strong><span><b>${ready}</b> ${tr('disponibles','ready')} · <b>${tapped}</b> ${tr('engagées','exhausted')}</span>${player.pool?`<span class="pool-chip">+${typeof player.pool==='number'?player.pool:0} ${tr('ressource du tour','turn resource')}</span>`:''}</div><div class="ration-layout"><div class="ration-reserve ${reserve?'':'empty'}" role="img" aria-label="${reserve} ${tr('rations en réserve','rations in reserve')}">${reserve?'<img src="assets/game/ration.webp" alt="" draggable="false">':'<span aria-hidden="true">∅</span>'}<b>${reserve}</b><small>${tr('Réserve','Reserve')}</small></div><div class="ration-cards">${Array.from({length:Math.max(0,ready)},(_,index)=>ration(false,index)).join('')}${Array.from({length:Math.max(0,Math.min(tapped,12-ready))},(_,index)=>ration(true,ready+index)).join('')}${!ready&&!tapped?`<p class="empty-note">${tr('Une ration est ajoutée automatiquement au début du tour.','A ration is added automatically at the beginning of the turn.')}</p>`:''}</div></div></section>`;
    }
    function zoneHtml(index) {
      const p = state.players[index], camp = p.camp || [], items = p.items || [];
      const canDraw = drawAction(index);
      return `<section class="player-zone ${state.activePlayer===index?'active-zone':''}" aria-label="${escape(tr('Camp de ','Camp of ')+p.name)}"><div class="player-heading"><div class="player-name"><span class="avatar">${index+1}</span><strong data-no-i18n>${escape(p.name)}</strong>${state.activePlayer===index?'<em>Joueur actif</em>':''}</div><div class="score">${p.score || 0}<span>/ 6 points</span></div></div><div class="player-body"><div class="chief-slot"><p class="zone-caption">Chef de chasse</p>${p.chief?cardHtml(p.chief):''}</div><div class="camp-area" data-game-drop="camp" data-game-player="${index}"><p class="zone-caption">Camp · ${camp.length} / 5 chasseurs</p><div class="camp-slots">${camp.map(card=>cardHtml(card)).join('')}${Array.from({length:Math.max(0,5-camp.length)},()=>'<span class="empty-slot" aria-hidden="true">✧</span>').join('')}</div>${items.length?`<div class="item-row" aria-label="Objets persistants">${items.map(card=>cardHtml(card)).join('')}</div>`:''}<span class="drop-hint" data-no-i18n>${tr('Dépose un Chasseur ou un Objet persistant ici','Drop a Hunter or a persistent Item here')}</span></div><div class="small-stacks"><div class="deck-controls"><button class="stack-button ${canDraw?'draw-available':''}" data-game-draw="${index}" data-no-i18n aria-label="${escape(canDraw?tr('Piocher une carte pour ','Draw a card for ')+p.name:tr('Deck de ','Deck of ')+p.name)}" title="${escape(canDraw?tr('Cliquer pour piocher 1 carte (effet manuel)','Click to draw 1 card (manual effect)'):tr('Informations du deck','Deck information'))}"><div class="card-back">✦</div><span>DECK · ${p.deck?.length || 0}</span>${canDraw?`<small>${tr('Cliquer pour piocher','Click to draw')}</small>`:''}</button><button class="tiny-button deck-info-button" data-game-zone="deck" data-game-player="${index}" data-no-i18n>${tr('Infos du deck','Deck info')}</button></div><button class="stack-button" data-game-zone="discard" data-game-player="${index}"><div class="card-back discard-stack">${p.discard?.length || 0}</div><span>DÉFAUSSE</span></button></div></div>${rationsHtml(p)}</section>`;
    }
    function drawAction(player) {
      if (!state || busy || state.winner != null || player !== actor() || (localPlayer !== null && player !== localPlayer)) return null;
      return actions.find(action => action.type === 'draw' && action.player === player && !action.sourceId) || null;
    }
    function actionHtml(action, index) {
      return `<button class="action-button ${['keep','pass','endturn','endTurn','finish','continue','finish-resolution'].includes(action.type)?'primary':''}" data-no-i18n data-game-action="${index}" ${busy?'disabled':''}>${escape(label(action.label || action.type))}</button>`;
    }
    function render() {
      if (destroyed) return;
      shell.classList.toggle('effect-key-held',effectKey);
      if (!state?.players?.length) { content.innerHTML = '<p class="empty-note">Le plateau se prépare…</p>'; i18n?.apply(content); return; }
      const focusedCard = document.activeElement?.closest?.('[data-game-uid]');
      const focusedUid = focusedCard && shell.contains(focusedCard) ? focusedCard.dataset.gameUid : null;
      const current = actor(), me = localPlayer ?? 0, shownHand = handPlayer();
      const hand = state.players[shownHand]?.hand || [], selectedInstance = inspectable(selected), selectedCard = definition(selectedInstance);
      if (inspectedUid && !inspectable(inspectedUid)) inspectedUid = null;
      const globals = actions.map((a,index)=>({a,index})).filter(({a})=>!a.sourceId || ['choose','skip','keep','mulligan'].includes(a.type));
      const primaryTypes = ['keep','mulligan','choose','skip','pass','endturn','endTurn','finish','continue','finish-resolution'];
      const primary = globals.filter(({a}) => primaryTypes.includes(a.type)), tools = globals.filter(({a}) => !primaryTypes.includes(a.type));
      const specific = actions.map((a,index)=>({a,index})).filter(({a})=>selectedInstance && a.sourceId===selectedInstance.uid && !globals.some(g=>g.a===a));
      const waiting = localPlayer !== null && current !== localPlayer && !actions.length;
      const help = state.winner!=null?'La chasse est terminée. Tu peux consulter les cartes ou revenir au salon.':state.pending?.label || (waiting?'L’adversaire prépare son action. Sa main et l’ordre des decks restent cachés.':state.phase==='mulligan'?'Conserve cette main ou remplace-la une fois.':state.stack?.length?'Réponds à l’effet en attente ou passe pour poursuivre la résolution.':state.combat?'Le combat progresse par étapes. Joue un Réflexe disponible ou passe.':state.phase==='response'?state.flow==='start'?'Résous les effets de début du tour. Tu peux jouer un Réflexe ou passer pour continuer.':state.flow==='end'?'La fin du tour est annoncée. Tu peux jouer un Réflexe ou passer pour continuer.':'Une fenêtre de réponse est ouverte. Tu peux jouer un Réflexe ou passer pour continuer.':manual?'Sélectionne une carte pour agir. Applique les effets particuliers avec les commandes de la table.':'Sélectionne une carte de ta main pour la jouer, ou une carte du terrain pour agir.');
      const title = manual?'Table libre':localPlayer===null?'Test automatisé':'Partie directe';
      content.innerHTML = `
        <div class="topline"><div><div class="eyebrow">Monster Hunter TCG</div><h1>${title}</h1><p>${manual?'Les effets particuliers des cartes sont à résoudre manuellement.':localPlayer===null?'Entraînement solo · Tu contrôles les décisions des deux camps.':'Connexion directe · Seule ta main est affichée.'}</p></div><div class="toolbar"><button class="button quiet" data-game-command="exit">← Retour</button>${options.onSave?'<button class="button" data-game-command="save">Enregistrer</button>':''}${options.onExport?'<button class="button" data-game-command="export">Exporter</button>':''}</div></div>
        <div class="game-layout"><div class="board">
          ${state.winner!=null?`<div class="winner-banner">✦ <span data-no-i18n>${escape(state.players[state.winner]?.name || 'Partie terminée')}</span> remporte la chasse</div>`:''}
          ${scoreboardHtml()}
          <div class="board-meta"><span class="turn-mark"><i></i><strong>TOUR ${state.turn || 1}</strong><span>· ${escape(phaseName())}</span></span><span>OBJECTIF · 6 POINTS</span></div>
          ${phaseTrackHtml()}
          ${boardToolsHtml()}
          ${stackHtml()}
          <div class="board-scroll">${zoneHtml(1-me)}
            <section class="arena" data-game-drop="hunting" aria-label="Zone de chasse partagée">
              <div class="arena-heading">✧ Zone de chasse partagée ${state.hunting?.length?`· ${state.hunting.length}`:''}</div>
              <div class="arena-cards">${state.hunting?.length?state.hunting.map(card=>cardHtml(card,true)).join(''):'<div class="arena-empty"><span class="arena-symbol">✧</span>La chasse commence ici<small>Joue des Monstres, puis chasse-les pour marquer des points.</small></div>'}</div>
              <span class="drop-hint" data-no-i18n>${tr('Dépose un Monstre ici pour le jouer','Drop a Monster here to play it')}</span>
            </section>${zoneHtml(me)}
          </div>
          <section class="hand-panel" aria-label="Main"><div class="hand-heading"><span>MAIN DE ${localPlayer===null?`<select data-game-hand-player aria-label="Main affichée"><option data-no-i18n value="auto" ${perspective===null?'selected':''}>${escape(state.players[current]?.name)} · ${escape(translated('automatique'))}</option><option data-no-i18n value="0" ${perspective===0?'selected':''}>${escape(state.players[0]?.name)}</option><option data-no-i18n value="1" ${perspective===1?'selected':''}>${escape(state.players[1]?.name)}</option></select>`:`<strong data-no-i18n>${escape(state.players[localPlayer]?.name)}</strong>`} · ${hand.length} cartes</span><button class="tiny-button" data-game-command="hand">${handHidden?'Afficher':'Masquer'} la main</button></div>
            <p class="hand-drag-hint" data-no-i18n>${tr('Glisse une carte jouable vers sa zone, ou clique dessus pour afficher ses actions.','Drag a playable card to its area, or click it to see its actions.')}</p>
            <div class="hand-cards">${handHidden?'<p class="hand-empty">Main masquée. Clique sur « Afficher la main » pour consulter tes cartes.</p>':hand.length?hand.map(card=>cardHtml(card,false,true)).join(''):'<p class="hand-empty">Aucune carte en main.</p>'}</div>
          </section>
          <div class="play-dropzone" data-game-drop="effect" data-no-i18n><strong>${tr('Techniques et objets instantanés','Techniques and instant items')}</strong><span>${tr('Dépose la carte ici · les cibles seront proposées si nécessaire','Drop a card here · choose targets when required')}</span></div>
        </div><aside class="side-column">
          <section class="side-panel inspector-panel" tabindex="0" aria-label="${tr('Aperçu de la carte','Card preview')}" data-no-i18n>${inspectorHtml()}</section>
          <div class="game-command-column" tabindex="0" role="region" aria-label="${tr('Actions et historique','Actions and history')}">
          <section class="side-panel actions-panel"><div class="panel-title">${waiting?'L’adversaire joue':'À vous de jouer'} <span class="phase-pill">Camp ${current+1}</span></div><p class="actor-label" data-no-i18n>${escape(state.players[current]?.name)}</p><p class="action-description" data-no-i18n>${escape(label(help))}</p><div class="action-list">${primary.map(({a,index})=>actionHtml(a,index)).join('')}</div>
            ${selectedCard?`<div class="selection-title"><img src="${escape(selectedCard.image)}" alt=""><span data-no-i18n>${escape(selectedCard.name)}</span><button class="icon-button" data-game-command="unselect" aria-label="Désélectionner">×</button></div><div class="action-list">${specific.map(({a,index})=>actionHtml(a,index)).join('') || '<p class="empty-note">Aucune action disponible pour cette carte à cet instant.</p>'}</div><button class="button quiet full" data-game-detail="${selectedCard.id}">Lire la carte</button>`:''}
            ${tools.length?`<details class="table-tools"><summary data-no-i18n>${tr('Commandes de la table','Table commands')} <small>${tools.length}</small></summary><div class="action-list">${tools.map(({a,index})=>actionHtml(a,index)).join('')}</div></details>`:''}
          </section>
          <section class="side-panel history-panel"><div class="panel-title">Carnet de chasse <small>${state.log?.length || 0} événements</small></div><div class="history" aria-label="${tr('Historique public de la partie','Public game history')}">${(state.log || []).slice(-250).reverse().map((event,index)=>`<div class="history-entry"><span>${((state.log?.length || 0)-index).toString().padStart(2,'0')}</span><p data-no-i18n>${escape(label(typeof event==='string'?event:event.text || event.message))}</p></div>`).join('') || '<p class="empty-note">Les événements publics de la partie apparaîtront ici.</p>'}</div></section>
          <p class="tips"><strong>${manual?'Table libre':'À savoir'}</strong>${manual?'Les mouvements, compteurs et points sont partagés ; les joueurs appliquent les capacités particulières en lisant les cartes.':localPlayer===null?'Tu contrôles les deux camps. Le panneau indique qui doit agir. Survole une carte pour la lire et clique dessus pour ses actions.':'Les décisions autorisées apparaissent quand c’est à toi de jouer. Une déconnexion suspend les échanges.'}</p>
          </div>
        </aside></div>`;
      i18n?.apply(content);
      if (focusedUid) [...content.querySelectorAll('[data-game-uid]')].find(card=>card.dataset.gameUid===focusedUid)?.focus?.({preventScroll:true});
      queueArrows();
    }
    function showDialog(title, body, footer = '', view = null) {
      modalView = view;
      dialog.innerHTML = `<div class="modal-heading"><h2 id="mh-game-dialog-title">${title}</h2><button class="icon-button" data-game-close aria-label="Fermer">×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}`;
      i18n?.apply(dialog);
      if (!dialog.open) dialog.showModal();
    }
    function closeDialog() { if (dialog.open) dialog.close(); modalAction = null; targetSelection = []; modalView = null; }
    function detail(id) {
      const card = cardView(byId.get(id)); if (!card) return;
      showDialog('À la loupe',`<div class="detail-layout"><img class="detail-image" src="${card.image}" alt="${escape(card.name)}"><div><p class="detail-id">MHFG · ${escape(card.id)}</p><h3>${escape(card.name)}</h3><p class="detail-meta">${escape(card.typeLabel)}${card.subtypes?.length?' / '+card.subtypes.map(escape).join(' / '):''}<br>${(card.colors || []).map(escape).join(' / ')}${card.cost!=null?' · Coût '+card.cost:''}${card.force!=null?' · Force '+card.force:''}${card.hp!=null?' · PV '+card.hp:''}</p><p class="effect-text">${escape(card.text)}</p></div></div>`, '', {type:'detail',id});
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
        showDialog(escape(label(action.label || 'Choisir un effet')),`<p data-no-i18n>${escape(label(action.description || state.pending?.label || 'Choisis une option pour poursuivre.'))}</p><div class="choice-list">${action.choices.map((choice,index)=>`<button data-no-i18n data-game-choice="${index}">${escape(label(typeof choice==='string'?choice:choice.label || choice.name || choice.id))}</button>`).join('')}</div>`, '', {type:'choices'}); return;
      }
      if (action.targets?.length && !action.targetIds && (action.targetCount ?? 1)>0) { modalAction = action; targetSelection = []; renderTargets(); return; }
      runAction(action);
    }
    function renderTargets() {
      const action = modalAction, max = action.targetCount ?? 1, min = action.targetMin ?? max;
      showDialog('Choisir les cibles',`<p>${escape(label(action.label))}<br>${min===max?`Choisis ${max} cible${max>1?'s':''}.`:`Choisis de ${min} à ${max} cibles.`} <b>${targetSelection.length} / ${max}</b></p><div class="targets-grid">${action.targets.map((target,index)=>{const instance=find(target.id),card=definition(instance) || cardView(byId.get(target.cardId || target.id));return `<button class="target-card ${targetSelection.includes(target.id)?'chosen':''}" data-game-target="${index}">${card?`<img src="${card.image}" alt="">`:''}<span data-no-i18n>${escape(label(target.label || card?.name || target.id))}</span>${targetSelection.includes(target.id)?'<span class="target-check">✓</span>':''}</button>`;}).join('')}</div>`,`<button class="button" data-game-close>Annuler</button><button class="button primary" data-game-confirm-targets ${targetSelection.length<min || targetSelection.length>max?'disabled':''}>Confirmer la sélection</button>`, {type:'targets'});
    }
    function onClick(event) {
      const target = event.target.closest('button'); if (!target || !shell.contains(target)) return;
      const data = target.dataset;
      if (data.gameUid && Date.now() < suppressClickUntil) { event.preventDefault(); return; }
      if (target.hasAttribute('data-game-close')) return closeDialog();
      if (data.gameCommand) {
        switch (data.gameCommand) {
          case 'exit': call('onExit'); return;
          case 'save': call('onSave', state); return;
          case 'export': call('onExport', state); return;
          case 'hand': handHidden=!handHidden; render(); return;
          case 'unselect': selected=null; render(); return;
          case 'arrow': if(busy)return; clearDrag(); effectKey=false; arrowMode=!arrowMode; arrowOrigin=null; render(); return;
          case 'clear-arrows': if(busy)return; arrowOrigin=null; return runAction({id:'arrow:clear',type:'annotation',player:localPlayer ?? actor()});
        }
      }
      if (arrowMode && (data.gameArrowNode || data.gameUid || data.gameStack)) { event.preventDefault(); if(data.gameArrowNode)chooseArrow(data.gameArrowNode); return; }
      if (data.gameUid && effectKey && !dialog.open && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault();activateEffect(data.gameUid);return; }
      if (data.gameStack) { if(data.gamePreviewUid)inspect(data.gamePreviewUid); return; }
      if (data.gameUid) { if (!inspectable(data.gameUid)) return; inspect(data.gameUid); selected = selected===data.gameUid?null:data.gameUid; render(); return; }
      if (data.gameDraw != null) {
        const player = Number(data.gameDraw), action = drawAction(player);
        if (action) return chooseAction({...action});
        return showZone(player, 'deck', true);
      }
      if (data.gameDetail) return detail(data.gameDetail);
      if (data.gameCandidate != null) { const action=actions.find(candidate=>candidate.id===data.gameCandidate);if(action&&!busy)chooseAction({...action});else closeDialog();return; }
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
        showZone(Number(data.gamePlayer),data.gameZone);
      }
    }
    function showZone(index, zone, drawAttempt = false) {
      const player=state.players[index]; if(!player)return;
      if(zone==='deck') {
        showDialog('Deck principal',`<p>Le deck de <span data-no-i18n>${escape(player.name)}</span> contient ${player.deck?.length || 0} cartes. Son ordre reste caché.</p>${drawAttempt?`<p data-no-i18n>${tr(manual?'La pioche manuelle est disponible uniquement pour le joueur qui a la priorité.':'La pioche de début de tour est automatique. Une autre pioche doit être autorisée par un effet. Le deck ne permet pas de piocher librement.',manual?'Only the player with priority can draw manually.':'The turn-start draw is automatic. An additional draw must be allowed by an effect. The deck does not allow unrestricted draws.')}</p>`:''}`, '', {type:'zone',index,zone,drawAttempt}); return;
      }
      showDialog(`Défausse · <span data-no-i18n>${escape(player.name)}</span>`, player.discard?.length ? `<div class="targets-grid">${player.discard.map(instance=>{const card=definition(instance);return card?`<button class="target-card" data-game-detail="${card.id}"><img src="${card.image}" alt=""><span data-no-i18n>${escape(card.name)}</span></button>`:'';}).join('')}</div>` : '<p>La défausse est vide.</p>', '', {type:'zone',index,zone});
    }
    function onLanguageChange() {
      if(destroyed)return;
      clearDrag();
      const open=dialog.open, view=modalView;
      render();
      if(!open || !view)return;
      if(view.type==='detail')detail(view.id);
      else if(view.type==='zone')showZone(view.index,view.zone,view.drawAttempt);
      else if(view.type==='targets' && modalAction)renderTargets();
      else if(view.type==='choices' && modalAction)chooseAction(modalAction);
      else if(view.type==='effect-actions') {
        const available=actions.filter(action=>action.sourceId===view.uid&&action.player===actor()&&['ability','activate','manual-ability','manual-trigger'].includes(action.type));
        if(available.length)showEffectChoices(view.uid,available);else closeDialog();
      }
      else if(view.type==='play-actions') {
        const available=legalPlayActions(view.uid);if(available.length)showPlayChoices(view.uid,available);else closeDialog();
      }
    }
    function onChange(event) { if (localPlayer===null && event.target.hasAttribute('data-game-hand-player')) { perspective=event.target.value==='auto'?null:Number(event.target.value);render(); } }
    function onOver(event) {
      const target=event.target.closest('[data-game-preview-uid]');
      if(target && !dialog.open) inspect(target.dataset.gamePreviewUid);
    }
    function markDrop(target) {
      for (const zone of content.querySelectorAll('[data-game-drop]')) zone.classList.toggle('drop-active', zone === target && validDrop(zone));
    }
    function startDrag(uid) {
      if (!legalPlayActions(uid).length || !dropKind(uid)) return false;
      dragUid = uid;
      for (const card of content.querySelectorAll('[data-game-uid]')) card.classList.toggle('dragging', card.dataset.gameUid === uid);
      for (const zone of content.querySelectorAll('[data-game-drop]')) zone.classList.toggle('drop-ready', validDrop(zone, uid));
      inspect(uid); return true;
    }
    function stopDragScroll() {
      if (dragScrollFrame != null) root.cancelAnimationFrame?.(dragScrollFrame);
      dragScrollFrame = null; dragScrollTime = 0;
    }
    function scrollAxis(node, property, amount) {
      if (!node || !amount) return false;
      const max = property === 'scrollTop' ? node.scrollHeight-node.clientHeight : node.scrollWidth-node.clientWidth;
      if (!(max > 0)) return false;
      const before = node[property] || 0;
      node[property] = Math.max(0,Math.min(max,before+amount));
      return Math.abs(node[property]-before) > .1;
    }
    function edgeSpeed(position, start, end) {
      const edge = Math.min(80,(end-start)/3);
      if (!(edge > 0)) return 0;
      if (position < start+edge) return -18*Math.min(1,(start+edge-position)/edge);
      if (position > end-edge) return 18*Math.min(1,(position-end+edge)/edge);
      return 0;
    }
    function queueDragScroll() {
      if (dragScrollFrame == null && touchDrag?.active && root.requestAnimationFrame) dragScrollFrame = root.requestAnimationFrame(scrollDuringDrag);
    }
    function scrollDuringDrag(time) {
      dragScrollFrame = null;
      if (destroyed || !touchDrag?.active) return;
      const x=touchDrag.pointerX,y=touchDrag.pointerY;
      const height=root.innerHeight || document.documentElement?.clientHeight || 0;
      const width=root.innerWidth || document.documentElement?.clientWidth || 0;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x<0 || x>width || y<0 || y>height) return;
      const elapsed=dragScrollTime?Math.min(2,Math.max(.5,(time-dragScrollTime)/16.67)):1;
      dragScrollTime=time;
      let moved=false;
      const board=content.querySelector('.board-scroll'),bounds=board?.getBoundingClientRect?.();
      if (bounds && x>=Math.max(0,bounds.left) && x<=Math.min(width,bounds.right) && y>=Math.max(0,bounds.top) && y<=Math.min(height,bounds.bottom)) {
        moved=scrollAxis(board,'scrollLeft',edgeSpeed(x,Math.max(0,bounds.left),Math.min(width,bounds.right))*elapsed)||moved;
        moved=scrollAxis(board,'scrollTop',edgeSpeed(y,Math.max(0,bounds.top),Math.min(height,bounds.bottom))*elapsed)||moved;
      }
      moved=scrollAxis(document.scrollingElement || document.documentElement,'scrollTop',edgeSpeed(y,0,height)*elapsed)||moved;
      if (moved) {
        // Le terrain passe sous le pointeur immobile ; sa cible doit suivre.
        markDrop(document.elementFromPoint(x,y)?.closest('[data-game-drop]'));
        queueDragScroll();
      } else dragScrollTime=0;
    }
    function clearDrag() {
      stopDragScroll();
      // La capture est relâchée aussi lors d'Échap ou d'une mise à jour distante.
      if (touchDrag) { try { touchDrag.source.releasePointerCapture?.(touchDrag.id); } catch {} }
      dragUid = null;
      for (const node of content.querySelectorAll('.dragging, .drop-ready, .drop-active')) node.classList.remove('dragging','drop-ready','drop-active');
      dragGhost?.remove(); dragGhost = null; touchDrag = null;
    }
    function playFromDrop(uid, target) {
      if (!validDrop(target, uid)) return false;
      const available = legalPlayActions(uid);
      selected = uid; inspectedUid = uid;
      if (available.length === 1) chooseAction({...available[0]});
      else {
        render();
        showPlayChoices(uid,available);
      }
      return true;
    }
    function onDragStart(event) {
      // Même geste pour souris, stylet et tactile : aucun glisser natif parallèle.
      event.preventDefault();
    }
    function onPointerDown(event) {
      const target = event.target.closest('[data-game-preview-uid]');
      if (target && !dialog.open) inspect(target.dataset.gamePreviewUid);
      if (effectKey || arrowMode || dialog.open || event.isPrimary === false || event.button > 0 || !target?.hasAttribute('data-game-draggable')) return;
      if (touchDrag && touchDrag.id !== event.pointerId) return;
      if (!legalPlayActions(target.dataset.gameUid).length) return;
      target.focus?.({preventScroll:true});
      touchDrag = {uid:target.dataset.gameUid,id:event.pointerId,x:event.clientX,y:event.clientY,source:target,active:false};
    }
    function onPointerMove(event) {
      if (!touchDrag || touchDrag.id !== event.pointerId) return;
      if (!touchDrag.active) {
        if (Math.hypot(event.clientX-touchDrag.x,event.clientY-touchDrag.y)<9) return;
        if (!startDrag(touchDrag.uid)) return clearDrag();
        touchDrag.active = true;
        touchDrag.source.setPointerCapture?.(event.pointerId);
        dragGhost = document.createElement('img'); dragGhost.className = 'card-drag-ghost';
        dragGhost.src = definition(inspectable(touchDrag.uid))?.image || '';
        dragGhost.alt = ''; dragGhost.setAttribute('aria-hidden','true');
        Object.assign(dragGhost.style,{position:'fixed',width:'105px',pointerEvents:'none',zIndex:'10000',opacity:'.85',borderRadius:'8px',transform:'translate(-50%, -65%)'});
        shell.appendChild(dragGhost);
      }
      event.preventDefault();
      touchDrag.pointerX=event.clientX;touchDrag.pointerY=event.clientY;
      dragGhost.style.left=event.clientX+'px';dragGhost.style.top=event.clientY+'px';
      markDrop(document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-game-drop]'));
      queueDragScroll();
    }
    function onPointerUp(event) {
      if (!touchDrag || touchDrag.id !== event.pointerId) return;
      const uid=touchDrag.uid,active=touchDrag.active,target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-game-drop]');
      clearDrag();
      if (active) { event.preventDefault();suppressClickUntil=Date.now()+400;playFromDrop(uid,target); }
    }
    function onPointerCancel(event) {
      if (touchDrag && touchDrag.id === event.pointerId) clearDrag();
    }
    function editing(target) {
      return Boolean(target?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(String(target?.tagName || target?.localName || '').toUpperCase()) || target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'));
    }
    function onKeyDown(event) {
      if(event.key==='Escape') {
        if(dialog.open){effectKey=false;arrowOrigin=null;clearDrag();render();return;}
        if(touchDrag){event.preventDefault();clearDrag();suppressClickUntil=Date.now()+400;}
        if(effectKey||arrowMode||arrowOrigin){event.preventDefault();effectKey=false;arrowMode=false;arrowOrigin=null;render();}
        return;
      }
      if(String(event.key || '').toLowerCase()!=='f' || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || editing(event.target) || dialog.open || busy || effectKey)return;
      event.preventDefault();clearDrag();effectKey=true;arrowMode=false;arrowOrigin=null;render();
    }
    function onKeyUp(event) {
      if(String(event.key || '').toLowerCase()==='f'&&effectKey){effectKey=false;render();}
    }
    function onWindowBlur() {
      const active=effectKey||arrowMode||arrowOrigin||touchDrag;
      effectKey=false;arrowMode=false;arrowOrigin=null;clearDrag();
      if(active)render();
    }
    function onCancel() { modalAction=null;targetSelection=[];modalView=null; }
    const listeners = {click:onClick,change:onChange,pointerover:onOver,focusin:onOver,dragstart:onDragStart,pointerdown:onPointerDown,pointermove:onPointerMove,pointerup:onPointerUp,pointercancel:onPointerCancel,keydown:onKeyDown,keyup:onKeyUp};
    for (const [name, handler] of Object.entries(listeners)) shell.addEventListener(name,handler,name==='pointermove'?{passive:false}:false);
    dialog.addEventListener('cancel',onCancel);
    shell.addEventListener('load',queueArrows,true);
    document.addEventListener?.('keydown',onKeyDown);
    document.addEventListener?.('keyup',onKeyUp);
    root.addEventListener?.('blur',onWindowBlur);
    root.addEventListener?.('resize',queueArrows);
    root.addEventListener?.('scroll',queueArrows,true);
    const unsubscribeLanguage = i18n?.subscribe(onLanguageChange);
    render();
    return {
      update(nextState, nextActions = []) {
        if(destroyed)return;
        clearDrag();
        arrowOrigin=null;
        state=nextState;actions=Array.isArray(nextActions)?nextActions:[];
        if(selected && !find(selected))selected=null;
        // Une action distante peut rendre une sélection ouverte périmée.
        if(dialog.open && modalAction && !actions.some(action=>action.id===modalAction.id))closeDialog();
        render();
      },
      destroy() {
        if(destroyed)return;destroyed=true;closeDialog();unsubscribeLanguage?.();
        clearDrag();if(arrowFrame!=null)root.cancelAnimationFrame?.(arrowFrame);arrowFrame=null;effectKey=false;arrowMode=false;arrowOrigin=null;
        for (const [name, handler] of Object.entries(listeners)) shell.removeEventListener(name,handler);dialog.removeEventListener('cancel',onCancel);shell.removeEventListener('load',queueArrows,true);
        document.removeEventListener?.('keydown',onKeyDown);document.removeEventListener?.('keyup',onKeyUp);root.removeEventListener?.('blur',onWindowBlur);root.removeEventListener?.('resize',queueArrows);root.removeEventListener?.('scroll',queueArrows,true);shell.remove();
        state=null;actions=[];
      }
    };
  }
  root.MHGameUI = {create};
})(typeof globalThis!=='undefined'?globalThis:this);
