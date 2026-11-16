// Shared test helpers: run the C front end binary.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CPARSER = ROOT + 'build/cparser';

export function runCparser(args, input = '') {
  return spawnSync(CPARSER, args, { input, encoding: 'utf8' });
}

// Parse C source with the binary and return the AST object.
export function parse(src) {
  const r = runCparser([], src);
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}
