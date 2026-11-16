// Local web server: serves the page and turns C source into an AST via build/cparser.
//   node server.js   ->  http://127.0.0.1:3000
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource, ParseError } from './js/parse.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIRS = { web: 'web', js: 'js', examples: 'examples' };   // URL prefix -> folder
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.c': 'text/plain; charset=utf-8', '.json': 'application/json',
};
const MAX_BODY = 100 * 1024;

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

// Reads the request body as text; resolves null when it is larger than MAX_BODY.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size <= MAX_BODY) chunks.push(c); });
    req.on('end', () => resolve(size > MAX_BODY ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Maps /web/x, /js/x, /examples/x to a file inside that folder; null if outside or unknown.
function staticPath(urlPath) {
  const [, prefix, ...rest] = urlPath.split('/');
  if (!STATIC_DIRS[prefix]) return null;
  const dir = path.join(ROOT, STATIC_DIRS[prefix]);
  const file = path.resolve(dir, rest.join('/'));
  return file.startsWith(dir + path.sep) ? file : null;
}

async function handle(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { return send(res, 404, 'not found', 'text/plain'); }

  if (req.method === 'POST' && urlPath === '/api/parse') {
    const src = await readBody(req);
    if (src === null) return send(res, 413, { ok: false, error: 'source is larger than 100 KB' });
    try {
      return send(res, 200, { ok: true, ast: parseSource(src) });   // limitation: sync parse blocks the server <= 2 s; fine for one local user
    } catch (e) {
      return send(res, 200, { ok: false, error: e instanceof ParseError ? e.message : `parser failed: ${e.message}` });
    }
  }
  if (req.method === 'GET' && urlPath === '/api/examples') {
    const files = (await readdir(path.join(ROOT, 'examples'))).filter(f => f.endsWith('.c')).sort();
    return send(res, 200, files);
  }
  if (req.method === 'GET') {
    const file = urlPath === '/' ? path.join(ROOT, 'web/index.html') : staticPath(urlPath);
    if (file) {
      try { return send(res, 200, await readFile(file), TYPES[path.extname(file)] || 'application/octet-stream'); }
      catch { /* fall through to 404 */ }
    }
  }
  send(res, 404, 'not found', 'text/plain');
}

export function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch(e => send(res, 500, { ok: false, error: e.message }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));
}
