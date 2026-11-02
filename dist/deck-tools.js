/* Recherche et règles de construction des decks, depuis le catalogue Drive actuel. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MHDeckTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLORS = ['Vert', 'Jaune', 'Orange', 'Rouge', 'Violet', 'Bleu', 'Marron'];
  const TYPE_NAMES = {
    large: ['grand monstre', 'large monster'], small: ['petit monstre', 'small monster'],
    hunter: ['chasseur', 'hunter'], item: ['objet', 'item'], technique: ['technique'],
    chief: ['chef de chasse', 'hunt chief'], token: ['jeton', 'token']
  };
  const TYPE_ORDER = ['chief', 'large', 'small', 'hunter', 'item', 'technique', 'token'];
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
      .toLowerCase()
      .replace(/[’‘ʼ'`´\u2010-\u2015\u2212\u00ad_\-]/g, ' ')
      .replace(/[^\p{L}\p{N}\s+]/gu, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  const compact = value => normalize(value).replace(/\s/g, '');
  function cardsOf(catalog) { return Array.isArray(catalog) ? catalog : Array.isArray(catalog?.cards) ? catalog.cards : []; }
  function textArray(value) { return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []; }
  function extensionOf(card) {
    const explicit = card.extensionId || (typeof card.extension === 'string' ? card.extension : card.extension?.id);
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
    const source = String(card.sourceImage || card.id || '');
    const match = source.match(/^([A-Za-z][A-Za-z0-9]*)[_-]\d+/);
    return match ? match[1] : null;
  }
  function getExtensions(catalog) {
    const counts = new Map();
    for (const card of cardsOf(catalog)) {
      if (card.type === 'token') continue;
      const id = extensionOf(card);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return [...counts].sort(([a], [b]) => collator.compare(a, b)).map(([id, count]) => ({ id, name: id, count }));
  }
  function searchFields(card) {
    const extension = extensionOf(card);
    return [card.id, card.name, card.nameEn, card.type, card.typeLabel,
      ...(TYPE_NAMES[card.type] || []), ...textArray(card.subtypes), ...textArray(card.subtypesEn), ...textArray(card.colors), ...textArray(card.colorsEn),
      extension, extension ? `${extension}-${card.id}` : '']
      .filter(value => value !== null && value !== undefined).map(normalize);
  }
  function matchesSearch(card, search) {
    const query = normalize(search);
    if (!query) return true;
    const fields = searchFields(card);
    const full = fields.join(' ');
    const condensed = fields.map(field => field.replace(/\s/g, '')).join(' ');
    return query.split(' ').every(word => full.includes(word) || condensed.includes(word));
  }
  function matchesType(card, type) {
    if (!type || type === 'all') return true;
    const query = compact(type);
    if (query === 'monstre' || query === 'monster') return card.type === 'large' || card.type === 'small';
    const exactType = Object.keys(TYPE_NAMES).find(key => compact(key) === query || TYPE_NAMES[key].some(alias => compact(alias) === query));
    if (exactType) return card.type === exactType;
    return [card.typeLabel, ...textArray(card.subtypes)].map(normalize).some(field => field.includes(normalize(type)) || compact(field).includes(query));
  }
  function matchesCost(card, cost) {
    if (cost === undefined || cost === null || cost === '' || cost === 'all') return true;
    if (!Number.isFinite(card.cost)) return false;
    if (typeof cost === 'number') return Number.isFinite(cost) && card.cost === cost;
    if (typeof cost === 'string') {
      const query = cost.trim();
      if (/^\d+\+$/.test(query)) return card.cost >= Number(query.slice(0, -1));
      return /^\d+$/.test(query) && card.cost === Number(query);
    }
    if (cost && typeof cost === 'object' && !Array.isArray(cost)) {
      const min = cost.min === undefined ? -Infinity : Number(cost.min);
      const max = cost.max === undefined ? Infinity : Number(cost.max);
      return !Number.isNaN(min) && !Number.isNaN(max) && card.cost >= min && card.cost <= max;
    }
    return false;
  }
  function numericCompare(a, b, key, descending) {
    const av = Number.isFinite(a[key]) ? a[key] : null, bv = Number.isFinite(b[key]) ? b[key] : null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return descending ? bv - av : av - bv;
  }
  function comparator(sort) {
    const key = typeof sort === 'string' ? sort.toLowerCase() : 'id';
    return (a, b) => {
      let order = 0;
      if (key === 'name' || key === 'name-asc') order = collator.compare(a.name || '', b.name || '');
      else if (key === 'name-desc') order = collator.compare(b.name || '', a.name || '');
      else if (['cost', 'cost-asc', 'cost-desc', 'force', 'force-desc', 'hp', 'hp-desc'].includes(key)) {
        order = numericCompare(a, b, key.split('-')[0], key.endsWith('-desc'));
      } else if (key === 'type') {
        order = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
        if (!order) order = collator.compare(a.name || '', b.name || '');
      } else if (key === 'color') {
        order = COLORS.indexOf(textArray(a.colors)[0]) - COLORS.indexOf(textArray(b.colors)[0]);
        if (!order) order = collator.compare(a.name || '', b.name || '');
      } else if (key === 'id-desc') order = collator.compare(b.id || '', a.id || '');
      return order || collator.compare(a.id || '', b.id || '');
    };
  }
  function filterCards(catalog, options = {}) {
    const compatible = Array.isArray(options.compatibleColors) ? new Set(options.compatibleColors.map(normalize)) : null;
    const color = normalize(options.color);
    const extension = normalize(options.extension);
    return cardsOf(catalog).filter(card =>
      (options.includeTokens || card.type !== 'token') &&
      (!extension || extension === 'all' || normalize(extensionOf(card)) === extension) &&
      (!color || color === 'all' || textArray(card.colors).some(value => normalize(value) === color)) &&
      (!compatible || textArray(card.colors).every(value => compatible.has(normalize(value)))) &&
      matchesType(card, options.type) && matchesCost(card, options.cost) && matchesSearch(card, options.search)
    ).sort(comparator(options.sort));
  }
  function groupCounts(cardIds) {
    const counts = new Map();
    for (const id of Array.isArray(cardIds) ? cardIds : []) {
      const key = String(id);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Object.fromEntries(counts);
  }
  function validateDeck(deck, catalog, options = {}) {
    const cards = cardsOf(catalog), lookup = new Map(cards.map(card => [card.id, card]));
    const errors = [];
    const ids = Array.isArray(deck?.cards) ? deck.cards : [];
    const chief = typeof deck?.chiefId === 'string' ? lookup.get(deck.chiefId) : null;
    const counts = groupCounts(ids);
    const deckColors = new Set();
    const support = options.supportedIds instanceof Set ? options.supportedIds : new Set(Array.isArray(options.supportedIds) ? options.supportedIds : []);
    let automated = !!chief && support.has(chief.id);
    if (!chief || chief.type !== 'chief') errors.push('Choisis un Chef de chasse valide, séparé des 50 cartes du deck.');
    if (!Array.isArray(deck?.cards)) errors.push('La liste de cartes du deck est invalide.');
    if (ids.length !== 50) errors.push(`Le deck principal doit contenir exactement 50 cartes (${ids.length} actuellement).`);
    const allowedColors = new Set(textArray(chief?.colors).map(normalize));
    for (const id of ids) {
      const card = typeof id === 'string' ? lookup.get(id) : null;
      if (!card) { errors.push(`Carte inconnue : ${String(id)}.`); automated = false; continue; }
      if (!support.has(card.id)) automated = false;
      if (card.type === 'chief') { errors.push(`${card.name} est un Chef : il ne va pas dans le deck principal.`); continue; }
      if (card.type === 'token') { errors.push(`${card.name} est un jeton : il ne va pas dans le deck principal.`); continue; }
      for (const color of textArray(card.colors)) deckColors.add(color);
      if (chief?.type === 'chief' && !textArray(card.colors).every(color => allowedColors.has(normalize(color)))) {
        errors.push(`${card.name} ne correspond pas aux couleurs du Chef de chasse.`);
      }
    }
    for (const [id, count] of Object.entries(counts)) {
      if (count > 3) errors.push(`Maximum 3 exemplaires de ${lookup.get(id)?.name || id} (${count} actuellement).`);
    }
    if (options.automatedOnly && !automated) errors.push('Ce deck contient un Chef ou des cartes dont les effets ne sont pas encore automatisés. Il reste utilisable en mode manuel.');
    const colors = [...deckColors].sort((a, b) => {
      const ai = COLORS.indexOf(a), bi = COLORS.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || collator.compare(a, b);
    });
    return { valid: errors.length === 0, errors: [...new Set(errors)], count: ids.length, counts, colors, automated };
  }
  function getCurve(deck, catalog) {
    const lookup = new Map(cardsOf(catalog).map(card => [card.id, card]));
    const curve = Array.from({ length: 8 }, (_, cost) => ({ cost, label: cost === 7 ? '7+' : String(cost), count: 0 }));
    for (const id of Array.isArray(deck?.cards) ? deck.cards : []) {
      const card = lookup.get(id);
      if (!card || card.type === 'chief' || card.type === 'token' || !Number.isFinite(card.cost) || card.cost < 0) continue;
      curve[Math.min(7, Math.floor(card.cost))].count++;
    }
    return curve;
  }

  return Object.freeze({ normalize, filterCards, getExtensions, validateDeck, groupCounts, getCurve });
});
