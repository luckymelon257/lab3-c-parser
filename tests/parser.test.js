import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { ROOT, runCparser, parse } from './helpers.js';

// Statement number i of the first function body.
const firstStmt = (src, i = 0) => parse(src).decls[0].body.body[i];
// Value of the first `return` in the first function.
const exprOf = src => firstStmt(src).value;
const exampleFiles = () => readdirSync(ROOT + 'examples').filter(f => f.endsWith('.c')).map(f => ROOT + 'examples/' + f);

test('precedence: 1 + 2 * 3', () => {
  const e = exprOf('int main(){ return 1 + 2 * 3; }');
  assert.equal(e.op, '+');
  assert.equal(e.right.op, '*');
});

test('left assoc: 8 - 4 - 2', () => {
  const e = exprOf('int main(){ return 8 - 4 - 2; }');
  assert.equal(e.left.op, '-');
});

test('right assoc: a = b = 1', () => {
  const s = firstStmt('int main(){ int a, b; a = b = 1; }', 1);
  assert.equal(s.expr.value.type, 'Assign');
});

test('dangling else binds to nearest if', () => {
  const s = firstStmt('int main(){ if (1) if (0) x=1; else x=2; }');
  assert.equal(s.else, null);
  assert.equal(s.then.else.type, 'ExprStmt');
});

test('for with declaration, arrays, array param', () => {
  const p = parse('void f(int a[], int n){ for (int i = 0; i < n; i++) a[i] = 0; }');
  assert.equal(p.decls[0].params[0].isArray, true);
  assert.equal(p.decls[0].body.body[0].init.type, 'DeclStmt');
});

test('multiple declarators and globals', () => {
  const p = parse('int a = 1, b[5];');
  assert.equal(p.decls[0].decls[1].size.value, 5);
});

test('node shapes: literals, unary, calls, index, line numbers', () => {
  const f = parse("int main(){\n  printf(\"%c\\n\", -'a');\n  return a[2]++;\n}").decls[0];
  const call = f.body.body[0].expr;
  assert.deepEqual([call.type, call.name, call.line], ['Call', 'printf', 2]);
  assert.equal(call.args[0].value, '%c\n');
  assert.deepEqual([call.args[1].type, call.args[1].op, call.args[1].operand.text], ['Unary', '-', "'a'"]);
  const ret = f.body.body[1].value;
  assert.deepEqual([ret.type, ret.target.type, ret.target.name], ['PostIncDec', 'Index', 'a']);
});

test('syntax error reports line:col and exits 1', () => {
  const r = runCparser([], 'int main() {\n  return 1\n}');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^3:1: syntax error, unexpected '}'/);
});

test('all examples parse', () => {
  const files = exampleFiles();
  assert.ok(files.length >= 2);
  for (const f of files) assert.equal(runCparser([f]).status, 0, f);
});
