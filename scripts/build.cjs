'use strict';

// Le site est déjà écrit en HTML/CSS/JS. La préparation vérifie le dossier
// statique et y ajoute uniquement les métadonnées publiques de la version.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

const catalog = require(path.join(dist, 'catalog.js'));
const engine = require(path.join(dist, 'engine.js'));
if (!Array.isArray(catalog.cards)) throw new Error('Le catalogue du site est invalide.');
const numbered = catalog.cards.filter(card => card.type !== 'token');
const tokens = catalog.cards.filter(card => card.type === 'token');
const chiefs = catalog.cards.filter(card => card.type === 'chief');
if (numbered.length !== 203 || tokens.length !== 2 || chiefs.length !== 7) {
  throw new Error('Le catalogue attendu doit contenir 203 cartes, 7 Chefs et 2 types de jetons supplémentaires.');
}
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
if (images.size !== 205 || imageFiles.length !== 205) throw new Error('Les 205 images françaises finales doivent être présentes.');

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
  counts: { cards: numbered.length, chiefs: chiefs.length, tokens: tokens.length, images: images.size, automated: engine.SUPPORTED_IDS.length }
};
const versionPath = path.join(dist, 'version.json');
fs.writeFileSync(versionPath + '.tmp', JSON.stringify(metadata, null, 2) + '\n', 'utf8');
fs.renameSync(versionPath + '.tmp', versionPath);
process.stdout.write(`Site MH TCG ${packageJson.version} prêt : ${scripts.length} scripts vérifiés, 203 cartes, 7 Chefs et 205 images françaises.\n`);

