/* Profils locaux MH TCG. Aucun identifiant n'est transmis sur le réseau. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MHProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const STORAGE_KEY = 'mh-tcg-local-profiles-v1';
  const SESSION_KEY = 'mh-tcg-local-session-v1';
  const ITERATIONS = 310000;
  const MAX_PROFILES = 50;
  const MAX_DECKS = 200;
  const MAX_CARDS = 100;
  const MAX_GAME_LENGTH = 3 * 1024 * 1024;
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function storageError(error) {
    const full = error?.name === 'QuotaExceededError' || error?.code === 22;
    return new Error(full
      ? 'Le stockage de ce navigateur est plein. Exporte tes decks avant de libérer de la place.'
      : 'Le stockage local est indisponible. Vérifie que ce navigateur autorise les données du site.');
  }

  function usernameParts(value) {
    if (typeof value !== 'string') throw new Error('Saisis un pseudo de 3 à 24 caractères.');
    const username = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    if ([...username].length < 3 || [...username].length > 24 || !/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u.test(username)) {
      throw new Error('Le pseudo doit contenir 3 à 24 caractères : lettres, chiffres, espaces, tirets, points ou traits de soulignement.');
    }
    // La double conversion couvre notamment les variantes sigma et ß/SS.
    const canonical = username.toUpperCase().toLowerCase().normalize('NFKC');
    return { username, canonical };
  }

  function passwordValue(value) {
    if (typeof value !== 'string' || [...value].length < 8 || value.length > 1024) {
      throw new Error('Choisis un mot de passe de 8 caractères minimum, avec au maximum 1 024 caractères.');
    }
    return value;
  }

  function toBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function fromBase64(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('invalid-base64');
    return Uint8Array.from(atob(value), letter => letter.charCodeAt(0));
  }

  function sameBytes(left, right) {
    let difference = left.length ^ right.length;
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index++) difference |= (left[index] || 0) ^ (right[index] || 0);
    return difference === 0;
  }

  function jsonValue(value, maxLength, label) {
    if (!isRecord(value)) throw new Error(`${label} doit être un objet valide.`);
    let json;
    try {
      json = JSON.stringify(value, (key, item) => {
        if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint' || (typeof item === 'number' && !Number.isFinite(item))) {
          throw new Error('unsupported-value');
        }
        return item;
      });
    } catch {
      throw new Error(`${label} ne peut pas être enregistré : son contenu est invalide.`);
    }
    if (json.length > maxLength) throw new Error(`${label} est trop volumineux pour cette sauvegarde locale.`);
    return JSON.parse(json);
  }

  function normalizedDeck(value) {
    if (!isRecord(value)) throw new Error('Le deck est invalide.');
    if (typeof value.name !== 'string' || !value.name.trim() || [...value.name.trim()].length > 80) {
      throw new Error('Donne un nom au deck, avec 80 caractères maximum.');
    }
    if (typeof value.chiefId !== 'string' || !/^\d{3}$/.test(value.chiefId)) {
      throw new Error('Choisis un Chef de chasse valide pour ce deck.');
    }
    if (!Array.isArray(value.cards) || value.cards.length > MAX_CARDS || value.cards.some(card => typeof card !== 'string' || !/^\d{3}$/.test(card))) {
      throw new Error(`Un deck local doit contenir une liste de ${MAX_CARDS} identifiants de carte maximum.`);
    }
    if (own(value, 'id') && value.id != null && (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.id))) {
      throw new Error('L’identifiant du deck est invalide.');
    }
    return { name: value.name.trim(), chiefId: value.chiefId, cards: value.cards.slice() };
  }

  function createStore(options = {}) {
    let storage, session, cryptography;
    try {
      storage = own(options, 'storage') ? options.storage : globalThis.localStorage;
      session = own(options, 'sessionStorage') ? options.sessionStorage : globalThis.sessionStorage;
      cryptography = own(options, 'crypto') ? options.crypto : globalThis.crypto;
    } catch (error) { throw storageError(error); }
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || !session || typeof session.getItem !== 'function' || typeof session.setItem !== 'function' || typeof session.removeItem !== 'function') {
      throw new Error('Ce navigateur ne fournit pas le stockage local nécessaire aux profils.');
    }
    if (!cryptography?.subtle || typeof cryptography.getRandomValues !== 'function') {
      throw new Error('Les profils nécessitent un navigateur récent, sur une adresse HTTPS ou locale.');
    }

    function now() { return new Date().toISOString(); }
    function randomId(prefix) {
      return prefix + Array.from(cryptography.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    function publicProfile(profile) { return { id: profile.id, username: profile.username, createdAt: profile.createdAt }; }
    function readDatabase() {
      let raw;
      try { raw = storage.getItem(STORAGE_KEY); } catch (error) { throw storageError(error); }
      if (raw == null) return { version: VERSION, profiles: [] };
      let database;
      try { database = JSON.parse(raw); } catch {
        throw new Error('Les données locales des profils sont illisibles. Elles ont été conservées sans modification.');
      }
      if (!isRecord(database) || database.version !== VERSION || !Array.isArray(database.profiles) || database.profiles.length > MAX_PROFILES) {
        throw new Error('Le format des profils locaux est incompatible. Les données ont été conservées sans modification.');
      }
      const ids = new Set(), names = new Set();
      for (const profile of database.profiles) {
        if (!isRecord(profile) || typeof profile.id !== 'string' || typeof profile.username !== 'string' || typeof profile.canonical !== 'string' || typeof profile.createdAt !== 'string' || !isRecord(profile.credentials) || !Array.isArray(profile.decks) || profile.decks.length > MAX_DECKS || ids.has(profile.id) || names.has(profile.canonical)) {
          throw new Error('Un profil local est endommagé. Les données ont été conservées sans modification.');
        }
        const credential = profile.credentials;
        if (credential.algorithm !== 'PBKDF2' || credential.hash !== 'SHA-256' || !Number.isInteger(credential.iterations) || credential.iterations < ITERATIONS || credential.iterations > 1000000 || typeof credential.salt !== 'string' || typeof credential.verifier !== 'string') {
          throw new Error('Les données de connexion d’un profil local sont invalides.');
        }
        ids.add(profile.id); names.add(profile.canonical);
      }
      return database;
    }
    function writeDatabase(database) {
      let raw;
      try { raw = JSON.stringify(database); } catch { throw new Error('Les données locales ne peuvent pas être enregistrées.'); }
      // Une seule écriture remplace la version entière, sans effacer les autres profils.
      try { storage.setItem(STORAGE_KEY, raw); } catch (error) { throw storageError(error); }
    }
    function sessionId() {
      try { return session.getItem(SESSION_KEY); } catch (error) { throw storageError(error); }
    }
    function setSession(id) {
      try { session.setItem(SESSION_KEY, id); } catch (error) { throw storageError(error); }
    }
    function authenticated(database) {
      const id = sessionId();
      const profile = id && database.profiles.find(candidate => candidate.id === id);
      if (!profile) throw new Error('Connecte-toi à un profil local pour utiliser tes decks.');
      return profile;
    }
    async function derive(password, salt, iterations = ITERATIONS) {
      const key = await cryptography.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await cryptography.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
      return new Uint8Array(bits);
    }

    async function register(username, password) {
      const identity = usernameParts(username); passwordValue(password);
      let database = readDatabase();
      if (database.profiles.some(profile => profile.canonical === identity.canonical)) throw new Error('Ce pseudo existe déjà dans ce navigateur.');
      if (database.profiles.length >= MAX_PROFILES) throw new Error('Ce navigateur contient déjà le nombre maximum de profils locaux.');
      const salt = cryptography.getRandomValues(new Uint8Array(16));
      const verifier = await derive(password, salt);
      // La dérivation est asynchrone : relire les données avant de les modifier.
      database = readDatabase();
      if (database.profiles.some(profile => profile.canonical === identity.canonical)) throw new Error('Ce pseudo existe déjà dans ce navigateur.');
      if (database.profiles.length >= MAX_PROFILES) throw new Error('Ce navigateur contient déjà le nombre maximum de profils locaux.');
      const profile = {
        id: randomId('profile-'), username: identity.username, canonical: identity.canonical, createdAt: now(),
        credentials: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toBase64(salt), verifier: toBase64(verifier) },
        decks: [], game: null
      };
      database.profiles.push(profile);
      writeDatabase(database);
      try { setSession(profile.id); } catch {
        throw new Error('Le profil est créé, mais le navigateur refuse la session locale. Autorise le stockage du site, puis connecte-toi.');
      }
      return publicProfile(profile);
    }

    async function login(username, password) {
      let identity;
      try { identity = usernameParts(username); } catch { throw new Error('Pseudo ou mot de passe incorrect.'); }
      if (typeof password !== 'string' || password.length > 1024) throw new Error('Pseudo ou mot de passe incorrect.');
      const database = readDatabase();
      const profile = database.profiles.find(candidate => candidate.canonical === identity.canonical);
      if (!profile) throw new Error('Pseudo ou mot de passe incorrect.');
      let salt, verifier;
      try {
        salt = fromBase64(profile.credentials.salt); verifier = fromBase64(profile.credentials.verifier);
        if (salt.length !== 16 || verifier.length !== 32) throw new Error('invalid-credential');
      } catch { throw new Error('Les données de connexion de ce profil local sont invalides.'); }
      const candidate = await derive(password, salt, profile.credentials.iterations);
      if (!sameBytes(candidate, verifier)) throw new Error('Pseudo ou mot de passe incorrect.');
      // La session ne dépend jamais du pseudo saisi seul.
      setSession(profile.id);
      return publicProfile(profile);
    }

    function current() {
      const id = sessionId();
      if (!id) return null;
      const profile = readDatabase().profiles.find(candidate => candidate.id === id);
      return profile ? publicProfile(profile) : null;
    }
    function logout() {
      try { session.removeItem(SESSION_KEY); } catch (error) { throw storageError(error); }
    }
    function listDecks() { return clone(authenticated(readDatabase()).decks); }
    function saveDeck(value) {
      const clean = normalizedDeck(value);
      const database = readDatabase(), profile = authenticated(database);
      const existing = value.id && profile.decks.find(deck => deck.id === value.id);
      if (!existing && profile.decks.length >= MAX_DECKS) throw new Error(`Ce profil contient déjà ${MAX_DECKS} decks. Exporte ou retire un deck avant d’en créer un autre.`);
      const timestamp = now();
      const deck = { id: existing?.id || value.id || randomId('deck-'), ...clean, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp };
      if (existing) profile.decks[profile.decks.findIndex(candidate => candidate.id === existing.id)] = deck;
      else profile.decks.push(deck);
      writeDatabase(database);
      return clone(deck);
    }
    function deleteDeck(id) {
      if (typeof id !== 'string') throw new Error('L’identifiant du deck est invalide.');
      const database = readDatabase(), profile = authenticated(database);
      const previousLength = profile.decks.length;
      profile.decks = profile.decks.filter(deck => deck.id !== id);
      if (profile.decks.length === previousLength) return false;
      writeDatabase(database); return true;
    }
    function getGame() { return clone(authenticated(readDatabase()).game ?? null); }
    function saveGame(value) {
      const clean = jsonValue(value, MAX_GAME_LENGTH, 'La partie');
      const database = readDatabase(), profile = authenticated(database);
      profile.game = clean; writeDatabase(database); return clone(clean);
    }
    function clearGame() {
      const database = readDatabase(), profile = authenticated(database);
      profile.game = null; writeDatabase(database);
    }
    function exportProfile() {
      const profile = authenticated(readDatabase());
      return { format: 'mh-tcg-profile-decks', version: VERSION, username: profile.username, exportedAt: now(), decks: clone(profile.decks) };
    }
    function importDecks(values) {
      if (!Array.isArray(values) || values.length > MAX_DECKS) throw new Error(`Le fichier doit contenir une liste de ${MAX_DECKS} decks maximum.`);
      const clean = values.map(normalizedDeck);
      const database = readDatabase(), profile = authenticated(database);
      if (profile.decks.length + clean.length > MAX_DECKS) throw new Error(`L’import dépasserait la limite de ${MAX_DECKS} decks de ce profil.`);
      const timestamp = now();
      const imported = clean.map(deck => ({ id: randomId('deck-'), ...deck, createdAt: timestamp, updatedAt: timestamp }));
      profile.decks.push(...imported); writeDatabase(database); return clone(imported);
    }

    return Object.freeze({ register, login, logout, current, listDecks, saveDeck, deleteDeck, getGame, saveGame, clearGame, exportProfile, importDecks });
  }

  return Object.freeze({ createStore, version: '1.0.0' });
});
