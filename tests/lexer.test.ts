import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCparser } from './helpers.js';

// Token stream as rows [line, name, text].
function tokens(src: string): string[][] {
  const r = runCparser(['--tokens'], src);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(l => l.split('\t'));
}

test('keywords, idents, operators', () => {
  const t = tokens('int x = a <= 10;');
  assert.deepEqual(
    t.map(r => r[1]),
    ['INT', 'IDENT', "'='", 'IDENT', 'LE', 'INT_LIT', "';'"],
  );
});

test('skips comments and # lines', () => {
  assert.deepEqual(
    tokens('#include <stdio.h>\n// c\n/* a\nb */ x').map(r => r.slice(0, 2)),
    [['4', 'IDENT']],
  );
});

test('literals', () => {
  assert.deepEqual(
    tokens('3.5 \'a\' "hi\\n"').map(r => r[1]),
    ['FLOAT_LIT', 'CHAR_LIT', 'STRING_LIT'],
  );
});

test('bad char', () => {
  const r = runCparser(['--tokens'], 'int @');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^1:5: unexpected character '@'/);
});
