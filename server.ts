// Local web server: serves the page and turns C source into an AST via build/cparser.
//   npm start   ->  http://127.0.0.1:3000

import { readdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_PORT, MAX_BODY_BYTES, MIME_TYPES, STATIC_DIRS } from './src/constants.js';
import { ParseError, parseSource } from './src/parse.js';

// This file runs from dist/, so the project root is one level up.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json'): void {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : (body as string | Buffer));
}

/** Reads the request body as text; resolves null when it is larger than MAX_BODY_BYTES. */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size <= MAX_BODY_BYTES) chunks.push(c);
    });
    req.on('end', () => {
      resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

/** Maps /web/x, /js/x, /src/x, /examples/x to a file in that folder; null if outside. */
function staticPath(urlPath: string): string | null {
  const [, prefix, ...rest] = urlPath.split('/');
  const folder = STATIC_DIRS[prefix];
  if (!folder) return null;

  const dir = path.join(ROOT, folder);
  const file = path.resolve(dir, rest.join('/'));
  return file.startsWith(dir + path.sep) ? file : null;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let urlPath: string;
  try {
    urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    return send(res, 404, 'not found', 'text/plain');
  }

  if (req.method === 'POST' && urlPath === '/api/parse') {
    const src = await readBody(req);
    if (src === null) {
      return send(res, 413, { ok: false, error: 'source is larger than 100 KB' });
    }
    try {
      // limitation: sync parse blocks the server <= 2 s; fine for one local user
      return send(res, 200, { ok: true, ast: parseSource(src) });
    } catch (e) {
      const error = e instanceof ParseError ? e.message : `parser failed: ${(e as Error).message}`;
      return send(res, 200, { ok: false, error });
    }
  }

  if (req.method === 'GET' && urlPath === '/api/examples') {
    const files = (await readdir(path.join(ROOT, 'examples'))).filter(f => f.endsWith('.c')).sort();
    return send(res, 200, files);
  }

  if (req.method === 'GET') {
    const file = urlPath === '/' ? path.join(ROOT, 'web/index.html') : staticPath(urlPath);
    if (file) {
      try {
        const type = MIME_TYPES[path.extname(file)] ?? 'application/octet-stream';
        return send(res, 200, await readFile(file), type);
      } catch {
        // fall through to 404
      }
    }
  }

  send(res, 404, 'not found', 'text/plain');
}

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    handle(req, res).catch((e: Error) => send(res, 500, { ok: false, error: e.message }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  createServer().listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));
}
