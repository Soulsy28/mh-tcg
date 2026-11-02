/* Connexion directe WebRTC. Aucun service de comptes ou de signalisation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MHP2P = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROTOCOL = 'mh-tcg-p2p', VERSION = 1, PREFIX = 'MHTCG1.';
  const MAX_CODE = 131072, MAX_SDP = 96000, MAX_MESSAGE = 524288;
  const MAX_BUFFERED = 1048576, ICE_TIMEOUT = 12000, SIGNAL_TTL = 30 * 60 * 1000;
  const LABELS = {
    idle: 'Prêt à établir une connexion',
    'creating-offer': 'Préparation du code d’invitation…',
    'awaiting-answer': 'Code prêt : en attente du code de réponse',
    'awaiting-host': 'Code de réponse prêt : en attente de la finalisation par l’hôte',
    'creating-answer': 'Préparation du code de réponse…',
    connecting: 'Connexion directe en cours…',
    connected: 'Connexion directe établie',
    disconnected: 'Connexion interrompue : tentative de reprise…',
    failed: 'La connexion n’a pas pu être établie',
    closed: 'Connexion fermée'
  };
  const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const utf8 = text => new TextEncoder().encode(text);
  function base64url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromBase64url(text) {
    if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) throw Error('Le code de connexion est invalide.');
    try {
      const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4));
      return Uint8Array.from(binary, c => c.charCodeAt(0));
    } catch { throw Error('Le code de connexion est invalide.'); }
  }
  function freshId() {
    if (!globalThis.crypto?.getRandomValues) throw Error('Le navigateur doit être ouvert en HTTPS ou sur localhost.');
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  function validateSignal(data, expectedKind) {
    if (!isObject(data) || data.protocol !== PROTOCOL || data.version !== VERSION) throw Error('Ce code utilise une autre version du simulateur.');
    if (!['offer', 'answer'].includes(data.kind) || (expectedKind && data.kind !== expectedKind)) throw Error(expectedKind === 'offer' ? 'Colle un code d’invitation, pas un code de réponse.' : 'Colle le code de réponse de l’autre joueur.');
    if (typeof data.sessionId !== 'string' || !/^[a-f0-9]{32}$/.test(data.sessionId)) throw Error('L’identifiant de la connexion est invalide.');
    if (!Number.isSafeInteger(data.createdAt) || data.createdAt > Date.now() + 120000 || Date.now() - data.createdAt > SIGNAL_TTL) throw Error('Ce code a expiré. Crée une nouvelle invitation.');
    if (!isObject(data.description) || data.description.type !== data.kind || typeof data.description.sdp !== 'string' || data.description.sdp.length < 5 || utf8(data.description.sdp).length > MAX_SDP || !/^v=0(?:\r?\n|$)/.test(data.description.sdp)) throw Error('La description de connexion est invalide.');
    return {protocol: PROTOCOL, version: VERSION, kind: data.kind, sessionId: data.sessionId, createdAt: data.createdAt, description: {type: data.description.type, sdp: data.description.sdp}};
  }
  function encodeSignal(data) {
    const validated = validateSignal(data);
    const code = PREFIX + base64url(utf8(JSON.stringify(validated)));
    if (code.length > MAX_CODE) throw Error('Le code de connexion est trop volumineux.');
    return code;
  }
  function decodeSignal(code, expectedKind) {
    if (typeof code !== 'string' || code.length > MAX_CODE + 4096) throw Error('Le code de connexion est trop volumineux.');
    code = code.replace(/\s+/g, '');
    if (code.length > MAX_CODE || !code.startsWith(PREFIX)) throw Error('Ce texte n’est pas un code de connexion MH TCG.');
    let data;
    try { data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(fromBase64url(code.slice(PREFIX.length)))); }
    catch { throw Error('Le code est incomplet ou invalide. Copie-le entièrement.'); }
    return validateSignal(data, expectedKind);
  }
  function rtcConfiguration(options = {}) {
    if (!['internet', 'lan'].includes(options.mode || 'internet')) throw Error('Choisis une connexion Internet ou réseau local.');
    const iceServers = (options.mode || 'internet') === 'lan' ? [] : [{urls: 'stun:stun.l.google.com:19302'}];
    if (options.turn) {
      const urls = Array.isArray(options.turn.urls) ? options.turn.urls : [options.turn.urls];
      if (!urls.length || urls.length > 4 || urls.some(url => typeof url !== 'string' || url.length > 1024 || !/^turns?:[^\s]+$/i.test(url))) throw Error('L’adresse du relais TURN est invalide.');
      const username = options.turn.username, credential = options.turn.credential;
      if (typeof username !== 'string' || typeof credential !== 'string' || !username || !credential || username.length > 512 || credential.length > 2048) throw Error('Le relais TURN demande un identifiant et un mot de passe valides.');
      iceServers.push({urls: urls.slice(), username, credential});
    }
    return {iceServers, iceCandidatePoolSize: 0, bundlePolicy: 'max-bundle'};
  }
  function safePayload(payload) {
    if (!isObject(payload)) throw Error('Le message de partie doit être un objet.');
    const work = [{value: payload, depth: 0}]; let count = 0;
    while (work.length) {
      const {value, depth} = work.pop();
      if (++count > 20000 || depth > 30) throw Error('Le message de partie est trop complexe.');
      if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) {
          if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Le message de partie contient un champ interdit.');
          work.push({value: value[key], depth: depth + 1});
        }
      } else if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) throw Error('Le message contient une valeur non transmissible.');
      else if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Le message contient une valeur numérique invalide.');
    }
    return payload;
  }
  class PeerSession {
    constructor(options = {}) {
      this._callbacks = options;
      this._factory = options.rtcFactory || (configuration => new RTCPeerConnection(configuration));
      this._status = 'idle'; this._sessionId = null; this._isHost = false;
      this._pc = null; this._channel = null; this._generation = 0;
      this._sendSeq = 0; this._receiveSeq = 0; this._iceCancel = null;
      this._disconnectTimer = null; this._closeNotified = false;
      this._connectTimer = null;
      this._hostTimeout = Number.isFinite(options.hostConnectTimeoutMs) ? Math.max(10, Math.min(30000, options.hostConnectTimeoutMs)) : 30000;
      this._guestTimeout = Number.isFinite(options.guestConnectTimeoutMs) ? Math.max(10, Math.min(300000, options.guestConnectTimeoutMs)) : 180000;
    }
    get status() { return this._status; }
    get sessionId() { return this._sessionId; }
    get isHost() { return this._isHost; }
    get connected() { return this._status === 'connected' && this._channel?.readyState === 'open'; }
    _notify(name, ...args) { try { this._callbacks[name]?.(...args); } catch (error) { try { this._callbacks.onError?.(error); } catch {} } }
    _setStatus(status, label) { this._status = status; this._notify('onStatus', status, label || LABELS[status]); }
    _assert(generation) { if (generation !== this._generation || !this._pc) throw Error('Cette tentative de connexion a été annulée.'); }
    _dispose() {
      clearTimeout(this._disconnectTimer); this._disconnectTimer = null;
      clearTimeout(this._connectTimer); this._connectTimer = null;
      const cancel = this._iceCancel; this._iceCancel = null; cancel?.();
      const pc = this._pc, channel = this._channel;
      this._pc = null; this._channel = null;
      if (channel) { channel.onopen = channel.onclose = channel.onerror = channel.onmessage = null; try { channel.close(); } catch {} }
      if (pc) { pc.onconnectionstatechange = pc.oniceconnectionstatechange = pc.ondatachannel = null; try { pc.close(); } catch {} }
    }
    _closed(reason, failed = false) {
      this._generation++; this._dispose();
      this._setStatus(failed ? 'failed' : 'closed', reason || undefined);
      if (!this._closeNotified) { this._closeNotified = true; this._notify('onClose', reason || 'Connexion fermée.'); }
    }
    _fail(error) { const err = error instanceof Error ? error : Error(String(error)); this._closed(err.message, true); this._notify('onError', err); return err; }
    _start(isHost, sessionId, options) {
      this._generation++; this._dispose();
      this._closeNotified = false; this._isHost = isHost; this._sessionId = sessionId;
      this._sendSeq = 0; this._receiveSeq = 0;
      let pc;
      try { pc = this._factory(rtcConfiguration(options)); }
      catch { throw this._fail(Error('WebRTC n’est pas disponible. Utilise un navigateur récent en HTTPS ou sur localhost.')); }
      this._pc = pc; const generation = this._generation;
      pc.onconnectionstatechange = () => {
        if (generation !== this._generation) return;
        const status = pc.connectionState;
        if (status === 'failed') return this._fail(Error('La connexion directe a échoué. Essaie le mode réseau local ou un relais TURN sur un réseau restrictif.'));
        if (status === 'closed') return this._closed('L’autre joueur a fermé la connexion.');
        if (status === 'disconnected') {
          this._setStatus('disconnected'); clearTimeout(this._disconnectTimer);
          this._disconnectTimer = setTimeout(() => this._closed('La connexion a été perdue. Échangez de nouveaux codes pour reprendre.'), 15000);
          this._disconnectTimer.unref?.();
        } else if (status === 'connected') {
          clearTimeout(this._disconnectTimer); this._disconnectTimer = null;
          if (this._channel?.readyState === 'open') { clearTimeout(this._connectTimer); this._connectTimer = null; this._setStatus('connected'); }
        }
      };
      pc.ondatachannel = event => {
        if (generation !== this._generation) return;
        if (this._channel || event.channel?.label !== 'mh-tcg-data') { try { event.channel?.close(); } catch {} return; }
        this._bindChannel(event.channel, generation);
      };
      return generation;
    }
    _bindChannel(channel, generation) {
      this._channel = channel;
      channel.onopen = () => {
        if (generation !== this._generation) return;
        clearTimeout(this._connectTimer); this._connectTimer = null;
        this._setStatus('connected'); this._notify('onOpen');
      };
      channel.onclose = () => { if (generation === this._generation) this._closed('L’autre joueur a quitté la partie.'); };
      channel.onerror = () => { if (generation === this._generation) this._fail(Error('Le canal de partie a rencontré une erreur.')); };
      channel.onmessage = event => {
        if (generation !== this._generation) return;
        try {
          if (typeof event.data !== 'string' || utf8(event.data).length > MAX_MESSAGE) throw Error('Un message de partie est invalide ou trop volumineux.');
          const data = JSON.parse(event.data);
          if (!isObject(data) || data.protocol !== PROTOCOL || data.version !== VERSION) throw Error('Les deux joueurs doivent utiliser la même version du protocole.');
          if (data.sessionId !== this._sessionId) throw Error('Ce message appartient à une autre partie.');
          if (!Number.isSafeInteger(data.seq) || data.seq !== this._receiveSeq + 1) throw Error('Un message a été répété ou reçu dans un ordre incorrect. Reconnectez les deux joueurs.');
          safePayload(data.payload);
          this._receiveSeq = data.seq;
          this._notify('onMessage', data.payload);
        } catch (error) { this._fail(error instanceof SyntaxError ? Error('Un message de partie est illisible.') : error); }
      };
      if (channel.readyState === 'open') channel.onopen();
    }
    _waitForIce(generation) {
      this._assert(generation);
      const pc = this._pc;
      if (pc.iceGatheringState === 'complete') return Promise.resolve();
      return new Promise((resolve, reject) => {
        let ended = false;
        const finish = error => {
          if (ended) return; ended = true;
          clearTimeout(timer); pc.removeEventListener?.('icegatheringstatechange', changed);
          if (this._iceCancel === cancel) this._iceCancel = null;
          error ? reject(error) : resolve();
        };
        const changed = () => { if (pc.iceGatheringState === 'complete') finish(); };
        const cancel = () => finish(Error('Cette tentative de connexion a été annulée.'));
        const timer = setTimeout(() => finish(Error('La préparation du code prend trop de temps. Réessaie ou choisis le mode réseau local.')), ICE_TIMEOUT);
        pc.addEventListener?.('icegatheringstatechange', changed);
        this._iceCancel = cancel;
        changed();
      });
    }
    _localDescription(options) {
      const description = this._pc?.localDescription;
      if (!/(?:^|\r?\n)a=candidate:[^\r\n]+/.test(description?.sdp || '')) {
        throw Error((options.mode || 'internet') === 'lan'
          ? 'Le navigateur n’a trouvé aucune adresse de connexion. Essaie le mode Internet ou un relais TURN.'
          : 'Le navigateur n’a trouvé aucune adresse de connexion. Essaie un autre navigateur, un autre réseau ou un relais TURN.');
      }
      return description;
    }
    _armConnectionTimeout(generation) {
      clearTimeout(this._connectTimer);
      if (this.connected) { this._connectTimer = null; return; }
      const isHost = this._isHost;
      this._connectTimer = setTimeout(() => {
        if (generation !== this._generation || this.connected) return;
        this._fail(Error(isHost
          ? 'La connexion directe n’a pas abouti dans les 30 secondes suivant la réponse. Échangez de nouveaux codes ou essayez un relais TURN.'
          : 'L’hôte n’a pas finalisé la connexion dans le délai prévu. Échangez de nouveaux codes pour réessayer.'));
      }, isHost ? this._hostTimeout : this._guestTimeout);
      this._connectTimer.unref?.();
    }
    async createOffer(options = {}) {
      let generation;
      try {
        generation = this._start(true, freshId(), options); this._setStatus('creating-offer');
        this._bindChannel(this._pc.createDataChannel('mh-tcg-data', {ordered: true, protocol: 'mh-tcg/1'}), generation);
        const offer = await this._pc.createOffer(); this._assert(generation);
        await this._pc.setLocalDescription(offer); await this._waitForIce(generation); this._assert(generation);
        const code = encodeSignal({protocol: PROTOCOL, version: VERSION, kind: 'offer', sessionId: this._sessionId, createdAt: Date.now(), description: this._localDescription(options)});
        this._setStatus('awaiting-answer'); return code;
      } catch (error) { if (generation === undefined || generation === this._generation) throw this._fail(error); throw error; }
    }
    async acceptOffer(code, options = {}) {
      const signal = decodeSignal(code, 'offer'); let generation;
      try {
        generation = this._start(false, signal.sessionId, options); this._setStatus('creating-answer');
        await this._pc.setRemoteDescription(signal.description); this._assert(generation);
        const answer = await this._pc.createAnswer(); this._assert(generation);
        await this._pc.setLocalDescription(answer); await this._waitForIce(generation); this._assert(generation);
        const response = encodeSignal({protocol: PROTOCOL, version: VERSION, kind: 'answer', sessionId: this._sessionId, createdAt: Date.now(), description: this._localDescription(options)});
        if (!this.connected) { this._setStatus('awaiting-host'); this._armConnectionTimeout(generation); }
        return response;
      } catch (error) { if (generation === undefined || generation === this._generation) throw this._fail(error); throw error; }
    }
    async acceptAnswer(code) {
      if (!this._isHost || !this._pc || this._status !== 'awaiting-answer') throw Error('Crée d’abord une invitation, puis colle le code de réponse.');
      const signal = decodeSignal(code, 'answer');
      if (signal.sessionId !== this._sessionId) throw Error('Cette réponse correspond à une autre invitation.');
      const generation = this._generation; this._setStatus('connecting'); this._armConnectionTimeout(generation);
      try { await this._pc.setRemoteDescription(signal.description); this._assert(generation); }
      catch (error) { if (generation === this._generation) throw this._fail(error); throw error; }
    }
    send(payload) {
      if (!this.connected) throw Error('La connexion directe n’est pas encore ouverte.');
      safePayload(payload);
      const data = JSON.stringify({protocol: PROTOCOL, version: VERSION, sessionId: this._sessionId, seq: this._sendSeq + 1, payload});
      const negotiated = this._pc?.sctp?.maxMessageSize;
      const limit = Number.isFinite(negotiated) && negotiated > 0 ? Math.min(MAX_MESSAGE, negotiated) : MAX_MESSAGE;
      if (utf8(data).length > limit) throw Error('Le message est trop volumineux pour cette connexion.');
      if ((this._channel.bufferedAmount || 0) > MAX_BUFFERED) throw Error('La connexion est occupée. Attends un instant avant de rejouer.');
      try { this._channel.send(data); this._sendSeq++; }
      catch { throw Error('Le message n’a pas pu être envoyé. Vérifie la connexion.'); }
    }
    close() { if (this._status === 'closed' && !this._pc) return; this._closed('Connexion fermée.'); }
  }

  const str = (value, max = 300) => typeof value === 'string' ? value.slice(0, max) : '';
  const integer = (value, fallback = 0, max = 100000) => Number.isSafeInteger(value) && value >= 0 && value <= max ? value : fallback;
  function counters(value) {
    const out = {};
    if (isObject(value)) for (const [key, val] of Object.entries(value).slice(0, 30)) if (!['__proto__', 'prototype', 'constructor'].includes(key) && typeof val === 'number' && Number.isFinite(val)) out[str(key, 40)] = Math.max(0, Math.min(10000, val));
    return out;
  }
  function visibleCard(card) {
    if (!isObject(card) || !card.cardId) return null;
    return {
      uid: str(card.uid, 100), cardId: str(card.cardId, 40),
      owner: card.owner === 1 ? 1 : 0, controller: card.controller === 1 ? 1 : 0,
      incarnation: integer(card.incarnation), tapped: !!card.tapped,
      damage: integer(card.damage), counters: counters(card.counters),
      mods: (Array.isArray(card.mods) ? card.mods : []).slice(0, 100).map(m => ({kind: str(m.kind, 40), value: Number.isFinite(m.value) ? m.value : 0, duration: str(m.duration, 40), turn: integer(m.turn), combatId: m.combatId == null ? null : str(m.combatId, 100)})),
      used: Object.fromEntries(Object.entries(isObject(card.used) ? card.used : {}).filter(([key, value]) => !['__proto__', 'prototype', 'constructor'].includes(key) && (typeof value === 'boolean' || typeof value === 'number')).slice(0, 50)),
      overexerted: !!card.overexerted,
      ...(isObject(card.computedStats) ? {computedStats: Object.fromEntries(['force', 'hp', 'remainingHp', 'armor'].filter(key => card.computedStats[key] === null || Number.isFinite(card.computedStats[key])).map(key => [key, card.computedStats[key]]))} : {})
    };
  }
  function hiddenCards(cards) { return (Array.isArray(cards) ? cards : []).slice(0, 500).map(() => ({uid: null, hidden: true})); }
  function visibleCards(cards) { return (Array.isArray(cards) ? cards : []).slice(0, 500).map(visibleCard).filter(Boolean); }
  /** Vue d'affichage seulement : ne jamais lancer le moteur sur cette vue masquée. */
  function redactState(state, viewerIndex) {
    if (!isObject(state) || !Array.isArray(state.players) || state.players.length !== 2 || ![0, 1].includes(viewerIndex)) throw Error('La vue de partie demandée est invalide.');
    const combat = state.combat;
    const pending = state.pending;
    return {
      version: integer(state.version, 1), catalogVersion: str(state.catalogVersion, 100), viewerIndex,
      turn: integer(state.turn), activePlayer: state.activePlayer === 1 ? 1 : 0,
      priorityPlayer: state.priorityPlayer === 1 ? 1 : 0, phase: str(state.phase, 40),
      winner: state.winner === 0 || state.winner === 1 ? state.winner : null,
      players: state.players.map((p, index) => ({
        name: str(p.name, 60), chief: visibleCard(p.chief),
        hand: index === viewerIndex ? visibleCards(p.hand) : hiddenCards(p.hand),
        deck: hiddenCards(p.deck), discard: visibleCards(p.discard),
        camp: visibleCards(p.camp), items: visibleCards(p.items),
        rations: {ready: integer(p.rations?.ready, 0, 12), tapped: integer(p.rations?.tapped, 0, 12), deck: integer(p.rations?.deck, 0, 12)},
        pool: integer(p.pool), score: integer(p.score), mulliganUsed: !!p.mulliganUsed
      })),
      hunting: visibleCards(state.hunting),
      stack: (Array.isArray(state.stack) ? state.stack : []).slice(0, 100).map(e => ({
        uid: str(e.uid, 100), kind: str(e.kind, 40), player: e.player === 1 ? 1 : 0,
        label: str(e.label), cardId: e.cardId == null ? null : str(e.cardId, 40),
        sourceId: e.sourceId == null ? null : str(e.sourceId, 100),
        sourceCardId: e.sourceCardId == null ? null : str(e.sourceCardId, 40),
        targetIds: (Array.isArray(e.targetIds) ? e.targetIds : []).slice(0, 100).map(id => str(id, 100)),
        card: e.kind === 'cast' ? visibleCard(e.card) : null
      })),
      combat: !isObject(combat) ? null : {id: str(combat.id, 100), attackerId: str(combat.attackerId, 100), targetId: str(combat.targetId, 100), stage: str(combat.stage, 40), interpositionUsed: !!combat.interpositionUsed, interrupted: !!combat.interrupted, damageDone: !!combat.damageDone},
      pending: !isObject(pending) ? null : {player: pending.player === 1 ? 1 : 0, label: pending.player === viewerIndex ? str(pending.label) : 'L’adversaire effectue un choix.', private: pending.player !== viewerIndex},
      // Les anciens journaux n'ont pas de classification de confidentialité : ne pas les retransmettre.
      log: (Array.isArray(state.log) ? state.log : []).filter(l => isObject(l) && l.public === true).slice(-100).map(l => ({turn: integer(l.turn), text: str(l.text, 1000)}))
    };
  }
  return {PeerSession, encodeSignal, decodeSignal, rtcConfiguration, redactState, constants: {PROTOCOL, VERSION, MAX_CODE, MAX_MESSAGE, ICE_TIMEOUT, SIGNAL_TTL}};
});
