// Shared test helpers: run the C front end binary.
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Tests run from dist/tests/, so the project root is two levels up.
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CPARSER = ROOT + 'build/cparser';

export function runCparser(args: string[], input = ''): SpawnSyncReturns<string> {
  return spawnSync(CPARSER, args, { input, encoding: 'utf8' });
}

/**
 * Parses C source with the binary and returns the raw JSON.
 * Typed as `any` on purpose: tests walk deep into the tree to check its exact shape.
 */
export function parse(src: string): any {
  const r = runCparser([], src);
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}
