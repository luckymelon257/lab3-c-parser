import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSource } from '../js/parse.js';
import { analyze, SemanticError } from '../js/semantic.js';

const A = src => analyze(parseSource(src));
// Value of the `return` statement in main.
const retExpr = p => p.decls.find(d => d.name === 'main').body.body.find(s => s.type === 'Return').value;

test('int/double types', () => {
  const e = retExpr(A('int main(){ int a = 1; double d = 2; return a / 2 + d; }'));
  assert.equal(e.ctype, 'double');
  assert.equal(e.left.ctype, 'int');
});

test('char is int', () => {
  assert.equal(retExpr(A("int main(){ char c = 'a'; return c + 1; }")).ctype, 'int');
});

test('comparisons and logic are int', () => {
  assert.equal(retExpr(A('int main(){ double d = 1.5; return d < 2 && !d; }')).ctype, 'int');
});

test('identifiers carry varType and isArray', () => {
  const e = retExpr(A('int main(){ char s[4]; return s[0]; }'));
  assert.deepEqual([e.varType, e.isArray, e.ctype], ['char', true, 'int']);
});

test('call to function declared later', () => {
  assert.equal(retExpr(A('int main(){ return half(3.0) > 1; } double half(double x){ return x / 2; }')).left.ctype, 'double');
});

test('undeclared variable', () => {
  assert.throws(() => A('int main(){ return y; }'), e => e instanceof SemanticError && e.message === "line 1: undeclared variable 'y'");
});

test('undeclared function', () => {
  assert.throws(() => A('int main(){ return g(); }'), /line 1: undeclared function 'g'$/);
});

test('redeclared in same scope', () => {
  assert.throws(() => A('int main(){ int x; int x; }'), /'x' is already declared in this scope/);
});

test('shadowing in inner block allowed and marked', () => {
  const p = A('int main(){ int x; { int x; } return 0; }');
  assert.equal(p.decls[0].body.body[0].decls[0].shadows, false);
  assert.equal(p.decls[0].body.body[1].body[0].decls[0].shadows, true);
});

test('local hiding a global is marked', () => {
  assert.equal(A('int x; int main(){ int x; return 0; }').decls[1].body.body[0].decls[0].shadows, true);
});

test('sibling loops do not shadow', () => {
  const p = A('int main(){ for (int i = 0; i < 1; i++); for (int i = 0; i < 1; i++); return 0; }');
  assert.equal(p.decls[0].body.body[1].init.decls[0].shadows, false);
});

test('arity', () => {
  assert.throws(() => A('int f(int a){return a;} int main(){ return f(); }'), /function 'f' expects 1 arguments, got 0/);
});

test('array rules', () => {
  assert.throws(() => A('int main(){ int a[3]; return a; }'), /'a' is an array/);
  assert.throws(() => A('int main(){ int x; return x[0]; }'), /'x' is not an array/);
  assert.throws(() => A('int f(int v){ return v; } int main(){ int a[3]; return f(a); }'), /'a' is an array/);
  assert.doesNotThrow(() => A('int f(int v[]){ return v[0]; } int main(){ int a[3]; return f(a); }'));
});

test('missing main', () => {
  assert.throws(() => A('int f(){return 0;}'), /missing function 'main'/);
});

test('break and continue outside loop', () => {
  assert.throws(() => A('int main(){ break; }'), /line 1: 'break' outside loop$/);
  assert.throws(() => A('int main(){ continue; }'), /'continue' outside loop/);
});

test('printf needs a string format', () => {
  assert.equal(retExpr(A('int main(){ return printf("%d", 1); }')).args[0].ctype, 'string');
  assert.throws(() => A('int main(){ printf(1); return 0; }'), /printf/);
});

test('assignedGlobals', () => {
  const p = A('int g; int h; int main(){ int g2; g = 1; h++; g2 = 2; return 0; }');
  assert.deepEqual(p.decls[2].assignedGlobals, ['g', 'h']);
});
