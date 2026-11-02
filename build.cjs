'use strict';

// Le site est déjà écrit en HTML/CSS/JS. La préparation vérifie le dossier
// statique et y ajoute uniquement les métadonnées publiques de la version.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const htmlPath = path.join(dist, 'index.html');
if (!fs.existsSync(htmlPath)) throw new Error('Le site ne contient pas encore dist/index.html.');
const html = fs.readFileSync(htmlPath, 'utf8');

function staticFile(relative, label) {
  if (typeof relative !== 'string' || !relative || /^(?:[A-Za-z]+:|\/\/|\/)/.test(relative)) {
    throw new Error(`${label} doit désigner un fichier local du site.`);
  }
  const clean = relative.split(/[?#]/)[0];
  const resolved = path.resolve(dist, clean);
  const inside = path.relative(dist, resolved);
  if (inside.startsWith('..') || path.isAbsolute(inside)) throw new Error(`${label} sort du dossier statique.`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile() || fs.statSync(resolved).size === 0) {
    throw new Error(`${label} est absent ou vide : ${relative}`);
  }
  return resolved;
}

const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
if (!scripts.length) throw new Error('Aucun script de site trouvé dans index.html.');
for (const source of scripts) {
  const filename = staticFile(source, 'Un script déclaré');
  new vm.Script(fs.readFileSync(filename, 'utf8'), { filename });
}
for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) staticFile(match[1], 'Une ressource déclarée');
// Les rations sont des éléments du plateau, séparés du catalogue des decks.
staticFile('assets/game/ration.webp', 'L’illustration des rations');
staticFile('assets/theme/cartography.svg', 'Le fond cartographique');
staticFile('assets/theme/grain.svg', 'La texture des panneaux');

const catalog = require(path.join(dist, 'catalog.js'));
const engine = require(path.join(dist, 'engine.js'));
if (!Array.isArray(catalog.cards)) throw new Error('Le catalogue du site est invalide.');
const numbered = catalog.cards.filter(card => card.type !== 'token');
const tokens = catalog.cards.filter(card => card.type === 'token');
const chiefs = catalog.cards.filter(card => card.type === 'chief');
if (!numbered.length || !chiefs.length) throw new Error('Le catalogue doit contenir des cartes et au moins un Chef de chasse.');
const identities = new Set(catalog.cards.map(card => card.id));
if (identities.size !== catalog.cards.length) throw new Error('Le catalogue contient des identifiants en double.');
const images = new Set();
for (const card of catalog.cards) {
  const image = staticFile(card.image, `L’image de ${card.id}`);
  if (images.has(image)) throw new Error(`Plusieurs cartes utilisent le même fichier image : ${card.id}.`);
  images.add(image);
}
const imageDirectory = path.join(dist, 'assets', 'cards');
const imageFiles = fs.readdirSync(imageDirectory).filter(name => /\.webp$/i.test(name));
if (images.size !== catalog.cards.length || imageFiles.length !== catalog.cards.length) throw new Error('Chaque carte et jeton du catalogue doit avoir une image française unique.');

const englishImages = new Set();
for (const card of catalog.cards) {
  if (!card.nameEn || !card.textEn) throw new Error(`La traduction anglaise de ${card.id} est absente.`);
  const englishImage = staticFile('assets/cards/en/' + path.basename(card.image), `L’image anglaise de ${card.id}`);
  englishImages.add(englishImage);
}
const englishImageFiles = fs.readdirSync(path.join(imageDirectory, 'en')).filter(name => /\.webp$/i.test(name));
if (englishImages.size !== catalog.cards.length || englishImageFiles.length !== catalog.cards.length) throw new Error('Chaque carte et jeton du catalogue doit avoir une image anglaise unique.');

// Une page récente doit charger ses propres scripts et styles, même si une
// ancienne version de ces fichiers est encore conservée par le navigateur.
const versionedHtml = html.replace(/(<(?:script|link)\b[^>]*\b(?:src|href)=["'])([^"']+)(["'])/gi, (match, before, relative, after) => {
  const file = staticFile(relative, 'Une ressource à versionner');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
  const [address, fragment] = relative.split('#', 2);
  const separator = address.indexOf('?');
  const basename = separator === -1 ? address : address.slice(0, separator);
  const query = new URLSearchParams(separator === -1 ? '' : address.slice(separator + 1));
  query.set('v', hash);
  return before + basename + '?' + query.toString() + (fragment === undefined ? '' : '#' + fragment) + after;
});
if (versionedHtml !== html) fs.writeFileSync(htmlPath, versionedHtml, 'utf8');

const hostingPath = path.join(root, '.openai', 'hosting.json');
if (fs.existsSync(hostingPath)) {
  const rawHosting = fs.readFileSync(hostingPath, 'utf8');
  const hosting = JSON.parse(rawHosting);
  const queue = [hosting];
  while (queue.length) {
    const value = queue.pop();
    if (!value || typeof value !== 'object') continue;
    for (const [key, item] of Object.entries(value)) {
      if (/token|secret|credential|password|authorization/i.test(key)) throw new Error('Une métadonnée d’hébergement contient un champ sensible : préparation refusée.');
      if (item && typeof item === 'object') queue.push(item);
    }
  }
  if (typeof hosting.project_id !== 'string' || !hosting.project_id || hosting.static?.directory !== 'dist') {
    throw new Error('Les métadonnées d’hébergement doivent désigner ce projet et le dossier statique dist.');
  }
  fs.mkdirSync(path.join(dist, '.openai'), { recursive: true });
  fs.copyFileSync(hostingPath, path.join(dist, '.openai', 'hosting.json'));
}

// Les liens et identifiants des documents privés ne sont pas publiés.
function publicSource(source) {
  return typeof source?.title === 'string' ? { title: source.title } : null;
}

const metadata = {
  app: 'mh-tcg-guilde',
  version: packageJson.version,
  builtAt: new Date().toISOString(),
  deployment: 'static',
  catalogVersion: catalog.version,
  sources: {
    cards: publicSource(catalog.sources?.cards),
    rules: publicSource(catalog.sources?.rules)
  },
  languages: ['fr', 'en'],
  counts: { cards: numbered.length, chiefs: chiefs.length, tokens: tokens.length, images: images.size + englishImages.size, imagesPerLanguage: { fr: images.size, en: englishImages.size }, automated: engine.SUPPORTED_IDS.length }
};
const versionPath = path.join(dist, 'version.json');
fs.writeFileSync(versionPath + '.tmp', JSON.stringify(metadata, null, 2) + '\n', 'utf8');
fs.renameSync(versionPath + '.tmp', versionPath);
process.stdout.write(`Site MH TCG ${packageJson.version} prêt : ${scripts.length} scripts vérifiés, ${numbered.length} cartes, ${chiefs.length} Chefs et ${images.size + englishImages.size} images françaises/anglaises.\n`);

