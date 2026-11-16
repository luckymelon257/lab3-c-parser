// Command line front: node cli.js <tokens|ast|run|py> file.c
import { existsSync, readFileSync } from 'node:fs';
import { parseFile, runParser } from './js/parse.js';
import { analyze } from './js/semantic.js';
import { run } from './js/interpreter.js';

const [command, file] = process.argv.slice(2);

const commands = {
  tokens: () => runParser(['--tokens'], readFileSync(file, 'utf8')),
  ast: () => JSON.stringify(parseFile(file), null, 2) + '\n',
  run: () => {
    const { output, exitCode } = run(analyze(parseFile(file)));
    process.exitCode = exitCode & 255;
    return output;
  },
};

// Errors that describe a problem in the user's C program (not a bug in this tool).
const USER_ERRORS = new Set(['ParseError', 'SemanticError', 'RuntimeError', 'TranslateError']);

if (!commands[command] || !file) {
  console.error('usage: node cli.js <tokens|ast|run|py> file.c');
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`${file}: No such file`);
  process.exit(2);
}
try {
  process.stdout.write(commands[command]());
} catch (e) {
  if (!USER_ERRORS.has(e.name)) throw e;
  console.error(e.message);
  process.exit(1);
}
