import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.js';
import { parseSource, parseFile, ParseError } from '../src/parse.js';
import type { FuncDef } from '../src/types.js';

test('parseSource returns Program', () => {
  assert.equal(parseSource('int main(){return 0;}').type, 'Program');
});

test('parseFile reads a file', () => {
  const first = parseFile(ROOT + 'examples/factorial.c').decls[0] as FuncDef;
  assert.equal(first.name, 'factorial');
});

test('parseSource throws ParseError with location', () => {
  assert.throws(
    () => parseSource('int main( {'),
    e => e instanceof ParseError && /^1:\d+: syntax error/.test(e.message),
  );
});

const cli = (...args: string[]) =>
  spawnSync('node', [ROOT + 'dist/cli.js', ...args], { encoding: 'utf8' });

test('cli ast prints JSON', () => {
  const r = cli('ast', ROOT + 'examples/factorial.c');
  assert.equal(JSON.parse(r.stdout).type, 'Program');
});

test('cli tokens prints token stream', () => {
  assert.match(cli('tokens', ROOT + 'examples/factorial.c').stdout, /^4\tINT\tint$/m);
});

test('cli unknown command exits 2', () => {
  assert.equal(cli('nope', 'x.c').status, 2);
});

test('cli missing file: message, exit 2, no stack trace', () => {
  for (const cmd of ['tokens', 'ast']) {
    const r = cli(cmd, 'no_such_file.c');
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /^no_such_file\.c: No such file/, cmd);
  }
});

test('cli tokens lexical error: message, exit 1', () => {
  const r = spawnSync('node', [ROOT + 'dist/cli.js', 'tokens', '/dev/stdin'], {
    input: 'int @',
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), "1:5: unexpected character '@'");
});
