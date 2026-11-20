import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.js';
import { parseSource } from '../src/parse.js';
import { analyze } from '../src/semantic.js';
import { run, formatPrintf, RuntimeError } from '../src/interpreter.js';

const R = (src: string): string => run(analyze(parseSource(src))).output;
// Checks the error message itself (assert.throws with a regex sees "Name: message").
const throwsMsg = (fn: () => unknown, re: RegExp) =>
  assert.throws(fn, e => e instanceof RuntimeError && re.test(e.message));

test('formatPrintf exact', () => {
  assert.equal(
    formatPrintf('%d|%i|%.2f|%f|%c|%s|%%', [7, -3, 2.5, 1, 97, 'x']),
    '7|-3|2.50|1.000000|a|x|%',
  );
});

test('formatPrintf %d truncates a double', () => {
  assert.equal(formatPrintf('%d', [2.9]), '2');
});

test('formatPrintf unknown spec', () => {
  assert.throws(() => formatPrintf('%x', [1]), /unsupported format '%x'/);
});

test('hello world', () => {
  assert.equal(R('int main(){ printf("Hello, %d!\\n", 6 * 7); return 0; }'), 'Hello, 42!\n');
});

test('negative int division and modulo', () => {
  assert.equal(R('int main(){ printf("%d %d", -7 / 2, -7 % 2); return 0; }'), '-3 -1');
});

test('double division', () => {
  assert.equal(R('int main(){ double d = 7; printf("%.1f", d / 2); return 0; }'), '3.5');
});

test('assign double to int truncates', () => {
  assert.equal(R('int main(){ int x = 7.9; x += 0.5; printf("%d", x); return 0; }'), '7');
});

test('int overflow wraps to 32 bits', () => {
  assert.equal(
    R('int main(){ int x = 2147483647; x = x + 1; printf("%d %d", x, 65536 * 65536); return 0; }'),
    '-2147483648 0',
  );
});

test('char arithmetic', () => {
  assert.equal(R("int main(){ char c = 'a'; c++; printf(\"%c%d\", c, c - 'a'); return 0; }"), 'b1');
});

test('logic: short circuit and 0/1 values', () => {
  assert.equal(
    R(
      'int f(){ printf("called"); return 1; } int main(){ int a = 0 && f(); int b = 5 || f(); printf("%d %d %d", a, b, !7); return 0; }',
    ),
    '0 1 0',
  );
});

test('pre and post increment values', () => {
  assert.equal(
    R('int main(){ int i = 5; int a = i++; int b = ++i; printf("%d %d %d", a, b, i); return 0; }'),
    '5 7 7',
  );
});

test('compound assignment', () => {
  assert.equal(
    R('int main(){ int x = 10; x -= 3; x *= 2; x /= 4; x %= 2; printf("%d", x); return 0; }'),
    '1',
  );
});

test('recursion', () => {
  assert.equal(
    R(
      'int f(int n){ if (n < 2) return 1; return n * f(n - 1); } int main(){ printf("%d", f(5)); return 0; }',
    ),
    '120',
  );
});

test('break and continue', () => {
  assert.equal(
    R(
      'int main(){ for (int i = 0; i < 10; i++) { if (i == 2) continue; if (i == 5) break; printf("%d", i); } return 0; }',
    ),
    '0134',
  );
});

test('while and do-while', () => {
  assert.equal(
    R(
      'int main(){ int i = 0; while (i < 3) i++; do { printf("%d", i); i--; } while (i > 0); return 0; }',
    ),
    '321',
  );
});

test('arrays by reference', () => {
  assert.equal(
    R('void z(int a[]){ a[0] = 9; } int main(){ int a[2]; z(a); printf("%d", a[0]); return 0; }'),
    '9',
  );
});

test('globals', () => {
  assert.equal(
    R(
      'int count; void inc(){ count++; } int main(){ inc(); inc(); printf("%d", count); return 0; }',
    ),
    '2',
  );
});

test('block scope shadowing', () => {
  assert.equal(R('int main(){ int x = 1; { int x = 2; } printf("%d", x); return 0; }'), '1');
});

test('uninitialized variables are 0', () => {
  assert.equal(
    R('int main(){ int x; double d; int a[2]; printf("%d %.1f %d", x, d, a[1]); return 0; }'),
    '0 0.0 0',
  );
});

test('stops infinite loop', () => {
  throwsMsg(() => R('int main(){ while (1) {} }'), /^line 1: step limit exceeded$/);
});

test('division by zero', () => {
  throwsMsg(() => R('int main(){ int z = 0; return 1 / z; }'), /^line 1: division by zero$/);
  throwsMsg(() => R('int main(){ int z = 0; return 1 % z; }'), /division by zero/);
});

test('out of bounds', () => {
  throwsMsg(
    () => R('int main(){ int a[3]; a[3] = 1; return 0; }'),
    /index 3 out of bounds for 'a' \(size 3\)/,
  );
});

test('deep recursion stops', () => {
  throwsMsg(
    () => R('int f(int n){ return f(n + 1); } int main(){ return f(0); }'),
    /recursion depth limit exceeded/,
  );
});

test('exit code', () => {
  assert.equal(run(analyze(parseSource('int main(){ return 3; }'))).exitCode, 3);
});

test('cli run prints output and exits with main result', () => {
  const r = spawnSync('node', [ROOT + 'dist/cli.js', 'run', ROOT + 'examples/factorial.c'], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^10! = 3628800$/m);
});

test('JS stack overflow becomes a RuntimeError', () => {
  const src =
    'int f(int n) { if (n > 0) { { while (1) { if (n > 0) { return 1 + f(n - 1); } } } } return 0; }\n' +
    'int main() { return f(999); }';
  throwsMsg(() => R(src), /^line 1: recursion depth limit exceeded$/);
});
