import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

let server, base;
before(async () => {
  server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = async (path, body) => (await fetch(base + path, { method: 'POST', body })).json();

test('POST /api/parse ok', async () => {
  const j = await post('/api/parse', 'int main(){return 0;}');
  assert.equal(j.ok, true);
  assert.equal(j.ast.type, 'Program');
});

test('POST /api/parse error', async () => {
  const j = await post('/api/parse', 'int main( {');
  assert.equal(j.ok, false);
  assert.match(j.error, /^1:\d+:/);
});

test('GET /api/examples lists files', async () => {
  assert.ok((await (await fetch(base + '/api/examples')).json()).includes('factorial.c'));
});

test('GET / serves the page, static files have types', async () => {
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match((await fetch(base + '/web/tree.js')).headers.get('content-type'), /javascript/);
  assert.equal((await fetch(base + '/examples/factorial.c')).status, 200);
});

test('path traversal blocked', async () => {
  assert.equal((await fetch(base + '/js/..%2fserver.js')).status, 404);
  assert.equal((await fetch(base + '/web/../server.js')).status, 404);
});

test('body over 100 KB rejected', async () => {
  const r = await fetch(base + '/api/parse', { method: 'POST', body: 'x'.repeat(100 * 1024 + 1) });
  assert.equal(r.status, 413);
});
