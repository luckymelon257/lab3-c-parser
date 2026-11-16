// Node-only bridge to the C front end: runs build/cparser and returns the AST object.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PARSER_PATH = fileURLToPath(new URL('../build/cparser', import.meta.url));

export class ParseError extends Error {
  name = 'ParseError';
}

// Runs cparser with the given arguments and stdin; returns stdout.
export function runParser(args, input = '') {
  try {
    return execFileSync(PARSER_PATH, args, { input, timeout: 2000, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    // Exit code 1 = lexical/syntax error; the message is on stderr.
    if (e.status === 1) throw new ParseError(e.stderr.trim());
    throw e;
  }
}

export function parseSource(src) {
  return JSON.parse(runParser([], src));
}

export function parseFile(path) {
  return parseSource(readFileSync(path, 'utf8'));
}
