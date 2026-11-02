/* Aides de présentation du deck builder : aucune modification des règles du jeu. */
(function (root, factory) {
  'use strict';
  const deckTools = typeof module === 'object' && module.exports ? require('./deck-tools.js') : root.MHDeckTools;
  const api = factory(deckTools);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MHBuilderTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deckTools) {
  'use strict';

  const normalize = deckTools?.normalize || (value => String(value ?? '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase()
    .replace(/[’‘ʼ'`´\u2010-\u2015\u2212\u00ad_\-]/g, ' ').replace(/[^\p{L}\p{N}\s+]/gu, ' ')
    .replace(/\s+/g, ' ').trim());
  const cardsOf = catalog => Array.isArray(catalog) ? catalog : Array.isArray(catalog?.cards) ? catalog.cards : [];
  const textArray = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
  const cardIds = deck => Array.isArray(deck?.cards) ? deck.cards : [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const mainTypes = ['large', 'small', 'hunter', 'item', 'technique'];
  const colorNames = {Vert:'Green', Jaune:'Yellow', Orange:'Orange', Rouge:'Red', Violet:'Purple', Bleu:'Blue', Marron:'Brown'};
  const colorAliases = new Map(Object.entries(colorNames).flatMap(([fr,en]) => [[normalize(fr), normalize(fr)], [normalize(en), normalize(fr)]]));
  const canonicalColor = value => colorAliases.get(normalize(value)) || normalize(value);
  const collators = {fr:new Intl.Collator('fr', {sensitivity:'base', numeric:true}), en:new Intl.Collator('en', {sensitivity:'base', numeric:true})};

  function extensionOf(card) {
    const explicit = card.extensionId || (typeof card.extension === 'string' ? card.extension : card.extension?.id);
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
    return String(card.sourceImage || card.id || '').match(/^([A-Za-z][A-Za-z0-9]*)[_-]\d+/)?.[1] || '';
  }

  function getChiefChoices(catalog, {query='', color='', extension='', language='fr'} = {}) {
    const words = normalize(query).split(' ').filter(Boolean);
    const selectedColor = canonicalColor(color), selectedExtension = normalize(extension);
    const locale = language === 'en' ? 'en' : 'fr', collator = collators[locale];
    return cardsOf(catalog).filter(card => {
      if (card?.type !== 'chief') return false;
      const colors = textArray(card.colors), extensionId = extensionOf(card);
      if (selectedColor && selectedColor !== 'all' && !colors.some(value => canonicalColor(value) === selectedColor)) return false;
      if (selectedExtension && selectedExtension !== 'all' && normalize(extensionId) !== selectedExtension) return false;
      const searchable = [card.id, card.name, card.nameEn, card.text, card.textEn, card.typeLabel,
        'chef de chasse', 'hunting chief', 'hunt chief', extensionId,
        ...colors, ...colors.map(value => colorNames[value] || value), ...textArray(card.subtypes), ...textArray(card.subtypesEn)]
        .map(normalize).join(' ');
      const compact = searchable.replace(/\s/g, '');
      return words.every(word => searchable.includes(word) || compact.includes(word));
    }).sort((a,b) => collator.compare(locale === 'en' ? a.nameEn || a.name || '' : a.name || '', locale === 'en' ? b.nameEn || b.name || '' : b.name || '')
      || collator.compare(String(a.id || ''), String(b.id || '')));
  }

  function getChiefChangeImpact(deck, newChiefId, catalog) {
    const lookup = new Map(cardsOf(catalog).map(card => [card.id, card]));
    const chief = lookup.get(newChiefId), ids = cardIds(deck);
    const result = {valid:chief?.type === 'chief', chiefId:newChiefId, incompatibleIds:[], incompatibleCards:[], removedCount:0, keptCount:ids.length};
    if (!result.valid) return result;
    // Les couleurs restent canoniques. Aucun nom ou texte traduit n'intervient.
    const allowed = new Set(textArray(chief.colors).map(normalize)), counts = new Map();
    for (const id of ids) {
      const card = lookup.get(id);
      if (card && mainTypes.includes(card.type) && textArray(card.colors).every(value => allowed.has(normalize(value)))) continue;
      result.incompatibleIds.push(id);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    result.incompatibleCards = [...counts].map(([id,count]) => {
      const card = lookup.get(id);
      return {id, count, name:card?.name || String(id), nameEn:card?.nameEn || card?.name || String(id)};
    });
    result.removedCount = result.incompatibleIds.length;
    result.keptCount = ids.length - result.removedCount;
    return result;
  }

  function changeChief(deck, newChiefId, catalog, {removeIncompatible=false} = {}) {
    const impact = getChiefChangeImpact(deck, newChiefId, catalog);
    if (!impact.valid) throw new Error('Choisis un Chef de chasse valide.');
    const next = clone(deck || {});
    next.chiefId = newChiefId;
    next.cards = [...cardIds(deck)];
    if (removeIncompatible) {
      const incompatible = new Set(impact.incompatibleIds);
      next.cards = next.cards.filter(id => !incompatible.has(id));
    }
    return next;
  }

  function getDeckSummary(deck, catalog) {
    const ids = cardIds(deck), lookup = new Map(cardsOf(catalog).map(card => [card.id, card]));
    const typeCounts = Object.fromEntries(mainTypes.map(type => [type, 0]));
    const curve = Array.from({length:8}, (_,cost) => ({cost, label:cost === 7 ? '7+' : String(cost), count:0}));
    let totalCost = 0, costedCards = 0;
    for (const id of ids) {
      const card = lookup.get(id);
      if (!card || !mainTypes.includes(card.type)) continue;
      typeCounts[card.type]++;
      if (Number.isFinite(card.cost) && card.cost >= 0) {
        totalCost += card.cost; costedCards++;
        curve[Math.min(7, Math.floor(card.cost))].count++;
      }
    }
    return {count:ids.length, uniqueCount:new Set(ids).size, remaining:Math.max(0, 50 - ids.length), averageCost:costedCards ? totalCost / costedCards : 0, typeCounts, curve};
  }

  function createHistory({limit=30} = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('La limite d’historique doit être un entier positif.');
    const past = [], future = [];
    const copyRecord = snapshot => ({json:JSON.stringify(snapshot), value:clone(snapshot)});
    function record(snapshot) {
      const item = copyRecord(snapshot);
      if (!past.length || past[past.length - 1].json !== item.json) past.push(item);
      if (past.length > limit) past.splice(0, past.length - limit);
      future.length = 0;
    }
    function undo(current) {
      if (!past.length) return null;
      future.push(copyRecord(current));
      return clone(past.pop().value);
    }
    function redo(current) {
      if (!future.length) return null;
      past.push(copyRecord(current));
      if (past.length > limit) past.splice(0, past.length - limit);
      return clone(future.pop().value);
    }
    return Object.freeze({record, undo, redo, canUndo:()=>past.length > 0, canRedo:()=>future.length > 0, clear:()=>{past.length=0;future.length=0;}});
  }

  return Object.freeze({getChiefChoices, getChiefChangeImpact, changeChief, getDeckSummary, createHistory});
});
