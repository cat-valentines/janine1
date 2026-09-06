/**
 * Checks the chess rules, the bots and the live-move protocol.
 *
 *   npm run check:chess
 *
 * The headline test is "perft": it counts every legal sequence of moves from
 * known positions and compares against the numbers the chess world publishes.
 * If castling, en passant, promotion or pins were wrong by even one move the
 * counts would not match — so this is what proves the rules are really right.
 *
 * It uses the esbuild that already comes with Vite, so it adds no dependency
 * and needs no test framework.
 */
import { build } from 'esbuild';
import { readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const CHECK_DIR = 'scripts/chess-checks';
const OUT_DIR = 'node_modules/.chess-checks';

const files = (await readdir(CHECK_DIR)).filter((name) => name.endsWith('.check.ts')).sort();
await build({
  entryPoints: files.map((name) => path.join(CHECK_DIR, name)),
  outdir: OUT_DIR,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'error',
});

// Each check file reports its own result with an exit code, so run each one in
// its own process — importing them here would let the first file's exit(0) stop
// the whole run before the others had a chance.
let failed = 0;
for (const file of files) {
  console.log(`\n--- ${file.replace('.check.ts', '')} ---`);
  const built = path.resolve(OUT_DIR, file.replace(/\.ts$/, '.js'));
  const run = spawnSync(process.execPath, [built], { stdio: 'inherit' });
  if (run.status !== 0) failed += 1;
}
await rm(OUT_DIR, { recursive: true, force: true });
console.log(failed ? '\nSome chess checks failed.' : '\nAll chess checks passed.');
process.exit(failed ? 1 : 0);
