// Command line front: node dist/cli.js <tokens|ast|run|py> file.c

import { existsSync, readFileSync } from 'node:fs';

import { CLI_USAGE, USER_ERROR_NAMES } from './src/constants.js';
import { run } from './src/interpreter.js';
import { parseFile, runParser } from './src/parse.js';
import { analyze } from './src/semantic.js';
import { toPython } from './src/translator.js';

const [command, file] = process.argv.slice(2);

const commands: Record<string, () => string> = {
  tokens: () => runParser(['--tokens'], readFileSync(file, 'utf8')),

  ast: () => JSON.stringify(parseFile(file), null, 2) + '\n',

  run: () => {
    const { output, exitCode } = run(analyze(parseFile(file)));
    process.exitCode = exitCode & 255;
    return output;
  },

  py: () => toPython(analyze(parseFile(file))),
};

if (!commands[command] || !file) {
  console.error(CLI_USAGE);
  process.exit(2);
}

if (!existsSync(file)) {
  console.error(`${file}: No such file`);
  process.exit(2);
}

try {
  process.stdout.write(commands[command]());
} catch (e) {
  if (!(e instanceof Error) || !USER_ERROR_NAMES.has(e.name)) throw e;
  console.error(e.message);
  process.exit(1);
}
