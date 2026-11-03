'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const APP_ID = 'mh-tcg-simulator';
const VERSION = '0.6.1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};
const PRIVATE_DIRS = new Set(['sources', 'runtime', 'tests', 'scripts', 'node_modules']);

function createServer({ root = path.join(__dirname, 'dist') } = {}) {
  const publicRoot = fs.realpathSync(root);
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const finish = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : message);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      finish(405, 'Cette méthode n’est pas disponible.');
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/\\/g, '/');
    } catch {
      finish(400, 'Adresse invalide.');
      return;
    }
    if (pathname === '/__health') {
      const body = JSON.stringify({ app: APP_ID, version: VERSION });
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    const segments = pathname.split('/').filter(Boolean);
    if (!pathname.startsWith('/') || pathname.includes('\0') || segments.some(part => part === '..' || part.startsWith('.') || PRIVATE_DIRS.has(part.toLowerCase()))) {
      finish(403, 'Ce fichier n’est pas accessible.');
      return;
    }
    const filePath = path.resolve(publicRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relativePath = path.relative(publicRoot, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      finish(403, 'Ce fichier n’est pas accessible.');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    if (!MIME[extension]) {
      finish(404, 'Fichier introuvable.');
      return;
    }
    try {
      const realPath = await fs.promises.realpath(filePath);
      const realRelative = path.relative(publicRoot, realPath);
      const realSegments = realRelative.split(path.sep);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative) || realSegments.some(part => part.startsWith('.') || PRIVATE_DIRS.has(part.toLowerCase()))) {
        finish(403, 'Ce fichier n’est pas accessible.');
        return;
      }
      const stat = await fs.promises.stat(realPath);
      if (!stat.isFile()) {
        finish(404, 'Fichier introuvable.');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[extension],
        'Content-Length': stat.size,
        'Cache-Control': ['.html', '.js', '.css', '.json'].includes(extension) ? 'no-store' : 'private, max-age=3600'
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = fs.createReadStream(realPath);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      finish(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, 'Fichier indisponible.');
    }
  });
}

function startServer({ port = 4180, root = path.join(__dirname, 'dist') } = {}) {
  const server = createServer({ root });
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    process.stdout.write(`Simulateur MH TCG : http://127.0.0.1:${address.port}\n`);
  });
  return server;
}

if (require.main === module) {
  const index = process.argv.indexOf('--port');
  const input = index >= 0 ? process.argv[index + 1] : process.env.PORT || '4180';
  const port = Number(input);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write('Le port doit être un nombre compris entre 1 et 65535.\n');
    process.exitCode = 1;
  } else {
    const server = startServer({ port });
    server.on('error', error => {
      process.stderr.write(error.code === 'EADDRINUSE' ? `Le port ${port} est déjà utilisé.\n` : `Le simulateur ne peut pas démarrer : ${error.message}\n`);
      process.exitCode = 1;
    });
  }
}

module.exports = { createServer, startServer, APP_ID, VERSION };
