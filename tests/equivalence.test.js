// Every example must print exactly the same in three ways:
// native C (clang), our interpreter, and our Python translation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { ROOT } from './helpers.js';
import { parseFile } from '../js/parse.js';
import { analyze } from '../js/semantic.js';
import { run } from '../js/interpreter.js';
import { toPython } from '../js/translator.js';

const examples = readdirSync(ROOT + 'examples').filter(f => f.endsWith('.c')).sort();
mkdirSync(ROOT + 'build', { recursive: true });

test('there are at least 8 examples', () => assert.ok(examples.length >= 8, examples.join(', ')));

for (const file of examples) {
  test(file, () => {
    const name = file.replace(/\.c$/, '');
    const source = ROOT + 'examples/' + file;

    const exe = `${ROOT}build/eq_${name}`;
    execFileSync('clang', ['-w', '-o', exe, source]);
    const native = execFileSync(exe, { encoding: 'utf8' });

    const ast = analyze(parseFile(source));
    const interpreted = run(ast).output;

    const pyFile = `${ROOT}build/eq_${name}.py`;
    writeFileSync(pyFile, toPython(ast));
    const python = execFileSync('python3', [pyFile], { encoding: 'utf8' });

    assert.ok(native.length > 0, 'example prints something');
    assert.equal(interpreted, native, 'interpreter vs clang');
    assert.equal(python, native, 'python vs clang');
  });
}
