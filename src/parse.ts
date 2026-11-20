// Node-only bridge to the C front end: runs build/cparser and returns the AST object.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PARSER_TIMEOUT_MS } from './constants.js';
import type { Program } from './types.js';

// This file runs from dist/src/, so the project root is two levels up.
export const PARSER_PATH = fileURLToPath(new URL('../../build/cparser', import.meta.url));

export class ParseError extends Error {
  name = 'ParseError';
}

/** Runs cparser with the given arguments and stdin; returns stdout. */
export function runParser(args: string[], input = ''): string {
  try {
    return execFileSync(PARSER_PATH, args, {
      input,
      timeout: PARSER_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (e) {
    // Exit code 1 = lexical/syntax error; the message is on stderr.
    const err = e as { status?: number; stderr?: string };
    if (err.status === 1) {
      throw new ParseError(String(err.stderr).trim());
    }
    throw e;
  }
}

export function parseSource(src: string): Program {
  return JSON.parse(runParser([], src)) as Program;
}

export function parseFile(path: string): Program {
  return parseSource(readFileSync(path, 'utf8'));
}
