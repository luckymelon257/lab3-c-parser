import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.js';
import { parseSource } from '../src/parse.js';
import { analyze } from '../src/semantic.js';
import { toPython, TranslateError } from '../src/translator.js';

const py = (src: string): string => toPython(analyze(parseSource(src)));
function runPy(code: string): string {
  const r = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + '\n' + code);
  return r.stdout;
}
const rejects = (src: string, re: RegExp) =>
  assert.throws(
    () => py(src),
    e => e instanceof TranslateError && re.test(e.message),
  );

test('program shape: helpers, functions, main guard', () => {
  const code = py('int main(){ return 0; }');
  assert.match(code, /^# Translated from C by cparser\n/);
  assert.match(code, /^def _div\(a, b\):$/m);
  assert.match(code, /^def main\(\):\n {4}return 0$/m);
  assert.match(code, /\nif __name__ == "__main__":\n {4}main\(\)\n$/);
});

test('int division uses _div', () => {
  assert.match(py('int main(){ int a = 7; printf("%d", a / 2); return 0; }'), /_div\(a, 2\)/);
});

test('double division uses /', () => {
  assert.equal(runPy(py('int main(){ double d = 7; printf("%.1f", d / 2); return 0; }')), '3.5');
});

test('negative division matches C', () => {
  assert.equal(runPy(py('int main(){ printf("%d %d", -7 / 2, -7 % 2); return 0; }')), '-3 -1');
});

test('int target truncates double value', () => {
  assert.equal(runPy(py('int main(){ int x = 7.9; x += 0.5; printf("%d", x); return 0; }')), '7');
});

test('for continue runs update', () => {
  assert.equal(
    runPy(
      py(
        'int main(){ for (int i = 0; i < 5; i++) { if (i == 2) continue; printf("%d", i); } return 0; }',
      ),
    ),
    '0134',
  );
});

test('nested loops: continue of inner while does not run outer for update', () => {
  const src =
    'int main(){ for (int i = 0; i < 2; i++) { int j = 0; while (j < 3) { j++; if (j == 2) continue; printf("%d%d ", i, j); } } return 0; }';
  assert.equal(runPy(py(src)), '01 03 11 13 ');
});

test('for without condition and break', () => {
  assert.equal(
    runPy(
      py(
        'int main(){ int i; for (i = 0; ; i++) { if (i == 3) break; } printf("%d", i); return 0; }',
      ),
    ),
    '3',
  );
});

test('do-while', () => {
  assert.equal(
    runPy(py('int main(){ int i = 0; do { printf("%d", i); i++; } while (i < 3); return 0; }')),
    '012',
  );
});

test('char and %c', () => {
  assert.equal(runPy(py('int main(){ char c = \'a\'; printf("%c", c + 1); return 0; }')), 'b');
});

test('logic operators and comparisons as values', () => {
  assert.equal(
    runPy(
      py('int main(){ int a = 3 > 2; int b = 0 || 5; printf("%d %d %d", a, b, !a); return 0; }'),
    ),
    '1 1 0',
  );
});

test('global assignment', () => {
  const code = py('int g; int main(){ g = 1; printf("%d", g); return 0; }');
  assert.match(code, /^ {4}global g$/m);
  assert.equal(runPy(code), '1');
});

test('array param mutation', () => {
  assert.equal(
    runPy(
      py(
        'void z(int a[]){ a[0] = 9; } int main(){ int a[2]; z(a); printf("%d", a[0]); return 0; }',
      ),
    ),
    '9',
  );
});

test('assignment as value uses walrus', () => {
  assert.equal(
    runPy(py('int main(){ int a; int b = (a = 4) + 1; printf("%d %d", a, b); return 0; }')),
    '4 5',
  );
});

test('empty bodies become pass', () => {
  assert.match(py('void f(){ } int main(){ while (0) ; f(); return 0; }'), /^ {4}pass$/m);
});

test('%% with no args', () => {
  assert.equal(runPy(py('int main(){ printf("100%%\\n"); return 0; }')), '100%\n');
});

test('++ in expression rejected', () => {
  rejects(
    'int main(){ int i = 0; int a[2]; a[i++] = 1; return 0; }',
    /'\+\+' inside an expression is not supported/,
  );
});

test('array element assignment inside expression rejected', () => {
  rejects(
    'int main(){ int a[2]; int b = (a[0] = 1); return 0; }',
    /assignment to an array element inside an expression/,
  );
});

test('continue in do-while rejected', () => {
  rejects('int main(){ do { continue; } while (0); return 0; }', /'continue' inside do-while/);
});

test('shadowing rejected', () => {
  rejects(
    'int main(){ int x = 1; { int x = 2; } return 0; }',
    /^line 1: 'x' shadows an outer variable; rename it$/,
  );
});

test('cli py prints python', () => {
  const r = spawnSync('node', [ROOT + 'dist/cli.js', 'py', ROOT + 'examples/factorial.c'], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^def factorial\(n\):$/m);
});

test('python reserved names rejected', () => {
  rejects('int main(){ int print = 1; return 0; }', /'print' is reserved in Python; rename it/);
  rejects(
    'int lambda(int x){ return x; } int main(){ return lambda(1); }',
    /'lambda' is reserved in Python/,
  );
});

test('argument converted to parameter type', () => {
  assert.equal(
    runPy(py('int half(int x){ return x / 2; } int main(){ printf("%d", half(7.9)); return 0; }')),
    '3',
  );
});

test('else if becomes elif', () => {
  const code = py(
    'int main(){ int x = 2; if (x == 1) x = 0; else if (x == 2) x = 5; else x = 9; printf("%d", x); return 0; }',
  );
  assert.match(code, /^ {4}elif x == 2:$/m);
  assert.equal(runPy(code), '5');
});
