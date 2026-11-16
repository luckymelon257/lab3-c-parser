import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHierarchy } from '../web/tree.js';
import { parseSource } from '../js/parse.js';

test('If children in schema order with field labels, null else skipped', () => {
  const h = toHierarchy({ type: 'If', line: 1, cond: { type: 'Ident', line: 1, name: 'x' }, then: { type: 'Break', line: 1 }, else: null });
  assert.equal(h.label, 'If');
  assert.equal(h.category, 'stmt');
  assert.deepEqual(h.children.map(c => [c.field, c.label]), [['cond', 'Ident x'], ['then', 'Break']]);
});

test('array fields become several children', () => {
  const h = toHierarchy({ type: 'Block', line: 1, body: [{ type: 'Break', line: 1 }, { type: 'Continue', line: 2 }] });
  assert.deepEqual(h.children.map(c => c.field), ['body', 'body']);
});

test('labels and categories of a real program', () => {
  const h = toHierarchy(parseSource("int a[10];\nint main(){ return a[1] + 2.5 * 'c'; }"));
  const labels = [];
  const walk = n => { labels.push(`${n.category}:${n.label}`); (n.children || []).forEach(walk); };
  walk(h);
  assert.deepEqual(labels, [
    'decl:Program', 'decl:DeclStmt', 'decl:VarDecl int a[10]', 'literal:IntLit 10',
    'decl:FuncDef main', 'stmt:Block', 'stmt:Return', 'expr:Binary +', 'expr:Index a', 'literal:IntLit 1',
    'expr:Binary *', 'literal:FloatLit 2.5', "literal:CharLit 'c'",
  ]);
});

test('leaf has no children array', () => {
  assert.equal(toHierarchy({ type: 'Break', line: 3 }).children, undefined);
});
