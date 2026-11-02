/* Autorité de partie exécutée chez l'hôte. Les clients transmettent des intentions. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./peer.js') : root.MHP2P);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MHMatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (peer) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const validPlayer = player => player === 0 || player === 1;
  const bounded = (value, max) => typeof value === 'string' && value.length <= max;
  function checkState(state) {
    if (!object(state) || !Array.isArray(state.players) || state.players.length !== 2) throw Error('L’état initial de la partie est invalide.');
    for (const player of state.players) {
      if (!object(player) || !['hand','deck','camp','items','discard'].every(zone => Array.isArray(player[zone]))) throw Error('Les zones de la partie sont invalides.');
    }
    return state;
  }
  function hiddenIds(state, player) {
    return new Set([
      ...state.players[1-player].hand,
      ...state.players.flatMap(p => p.deck)
    ].map(card=>card?.uid).filter(id=>typeof id==='string'));
  }
  function sanitizeAction(action, forbidden) {
    if (!object(action) || !bounded(action.id,200) || !action.id || !bounded(action.type,60) || !validPlayer(action.player)) return null;
    if (action.sourceId != null && (!bounded(action.sourceId,100) || forbidden.has(action.sourceId))) return null;
    // Les IDs d'actions sont normalement préfixe:uid. Ne pas révéler un uid caché par ce chemin.
    if (action.id.split(':').some(part=>forbidden.has(part))) return null;
    const out = {id:action.id,type:action.type,label:String(action.label || action.type).slice(0,500),player:action.player};
    if (action.sourceId != null) out.sourceId=action.sourceId;
    for (const key of ['targetCount','targetMin']) if (Number.isSafeInteger(action[key]) && action[key]>=0 && action[key]<=20) out[key]=action[key];
    if (action.description != null) out.description=String(action.description).slice(0,1000);
    if (Array.isArray(action.targets)) {
      // Une capacité de regard privé devra explicitement révéler ses cartes à ce joueur
      // dans le moteur avant d'être proposée sur la liaison réseau.
      if (action.targets.some(target=>forbidden.has(target?.id))) return null;
      out.targets=action.targets.slice(0,500).filter(target=>object(target)&&bounded(target.id,100)).map(target=>({id:target.id,label:String(target.label || target.id).slice(0,500)}));
    }
    if (Array.isArray(action.choices)) {
      if (action.choices.some(choice=>forbidden.has(choice?.id))) return null;
      out.choices=action.choices.slice(0,200).filter(choice=>object(choice)&&(bounded(choice.id,200)||Number.isSafeInteger(choice.id))).map(choice=>({id:choice.id,label:String(choice.label || choice.id).slice(0,500)}));
    }
    return out;
  }
  class HostMatch {
    #state;
    #revision = 0;
    #catalog;
    #engine;
    #mode;
    constructor({catalog,engine,initialState,engineMode} = {}) {
      if (!catalog?.cards || typeof engine?.getActions!=='function' || typeof engine?.dispatch!=='function' || typeof peer?.redactState!=='function') throw Error('Le moteur et le catalogue de la partie sont requis.');
      if (!object(initialState)) throw Error('L’état initial de la partie est invalide.');
      this.#catalog=catalog;this.#engine=engine;this.#state=checkState(clone(initialState));
      this.#mode=engineMode==='manual' || this.#state.mode==='manual' || /manual/i.test(engine.version || '')?'manual':'auto';
      // Un état qui ne peut pas produire ses actions n'est pas utilisable comme autorité.
      this.#actions();
    }
    get state() { return clone(this.#state); }
    get revision() { return this.#revision; }
    get engineMode() { return this.#mode; }
    #actions() {
      const actions=this.#engine.getActions(clone(this.#state),this.#catalog);
      if (!Array.isArray(actions)) throw Error('Le moteur n’a pas fourni d’actions valides.');
      return actions;
    }
    viewFor(player) {
      if (!validPlayer(player)) throw Error('Le joueur demandé est invalide.');
      const state=clone(this.#state);
      const publicCards=[...(state.hunting || []),...state.players.flatMap((p,index)=>[p.chief,...p.camp,...p.items,...p.discard,...(index===player?p.hand:[])]),...(state.stack || []).filter(e=>e.kind==='cast'&&e.card).map(e=>e.card)].filter(Boolean);
      if (typeof this.#engine.stats==='function') for (const card of publicCards) {
        if (!card.uid || card.hidden) continue;
        try {
          const stats=this.#engine.stats(state,card.uid,this.#catalog);
          if (object(stats)) card.computedStats=Object.fromEntries(['force','hp','remainingHp','armor'].filter(key=>stats[key]===null||Number.isFinite(stats[key])).map(key=>[key,stats[key]]));
        } catch { /* Les cartes non combattantes peuvent ne pas avoir de statistiques. */ }
      }
      // Seuls les événements explicitement publics du moteur traversent la liaison.
      // Les anciens journaux sans classification restent cachés par redactState.
      const forbidden=hiddenIds(this.#state,player);
      const actions=this.#actions().filter(action=>action.player===player).map(action=>sanitizeAction(action,forbidden)).filter(Boolean);
      return {type:'state',revision:this.#revision,engineMode:this.#mode,state:peer.redactState(state,player,this.#catalog),actions};
    }
    apply(player,intent,expectedRevision) {
      if (!validPlayer(player)) throw Error('Le joueur qui agit est invalide.');
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision<0 || expectedRevision!==this.#revision) throw Error('Cette action utilise une ancienne version de la partie. Attends la mise à jour du plateau.');
      if (!object(intent) || !bounded(intent.id,200) || !intent.id) throw Error('L’intention de jeu est invalide.');
      const allowed=this.#actions().find(action=>action.id===intent.id && action.player===player);
      if (!allowed) throw Error('Cette action n’est pas autorisée pour ce joueur à cet instant.');
      if (intent.type!=null && intent.type!==allowed.type) throw Error('Le type de cette action ne correspond pas à l’action autorisée.');
      if (intent.sourceId!=null && intent.sourceId!==allowed.sourceId) throw Error('La carte source de cette action ne correspond pas à l’action autorisée.');
      // Si une action n'est pas exposable à la vue autorisée, elle n'est pas jouable par un client.
      if (!sanitizeAction(allowed,hiddenIds(this.#state,player))) throw Error('Cette action demande une information qui n’est pas visible pour ce joueur.');
      const selected=intent.targetIds==null?[]:intent.targetIds;
      if (!Array.isArray(selected) || selected.length>20 || selected.some(id=>!bounded(id,100)||!id)) throw Error('La liste des cibles est invalide.');
      const max=allowed.targetCount ?? 0,min=allowed.targetMin ?? max;
      if (!Number.isSafeInteger(max)||!Number.isSafeInteger(min)||selected.length<min||selected.length>max || selected.some(id=>!(allowed.targets || []).some(target=>target.id===id))) throw Error('Choisis les cibles autorisées par cette action.');
      const canonical={...clone(allowed),targetIds:selected.slice()};
      if (Array.isArray(allowed.choices)&&allowed.choices.length) {
        if (!(bounded(intent.choiceId,200)||Number.isSafeInteger(intent.choiceId)) || !allowed.choices.some(choice=>choice.id===intent.choiceId)) throw Error('Choisis l’une des options proposées.');
        canonical.choiceId=intent.choiceId;
      }
      // Aucun coût, joueur, effet ou objet source fourni par le client n'est recopié.
      const candidate=this.#engine.dispatch(clone(this.#state),canonical,this.#catalog);
      const nextState=checkState(clone(candidate));
      this.#state=nextState;this.#revision++;
      return {revision:this.#revision};
    }
  }
  return {HostMatch};
});
