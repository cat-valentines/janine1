/**
 * Checks the rules and balance of the games that have them written down:
 * chess (rules, bots, live moves, the beginner's guide) and Fishing Frenzy.
 *
 *   npm run check:games
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

const CHECK_DIR = 'scripts/game-checks';
const OUT_DIR = 'node_modules/.game-checks';

const files = (await readdir(CHECK_DIR)).filter((name) => name.endsWith('.check.ts')).sort();
await build({
  entryPoints: files.map((name) => path.join(CHECK_DIR, name)),
  outdir: OUT_DIR,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'error',
  // Vite fills `import.meta.env` in for the browser; Node has no such thing, so
  // a check that touches any module importing the Supabase client would crash
  // on load. Stand-in values let those modules be imported and their pure parts
  // checked — nothing here ever reaches the network.
  define: {
    'import.meta.env': JSON.stringify({
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'checks-only',
      DEV: false,
      MODE: 'test',
    }),
  },
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
console.log(failed ? '\nSome game checks failed.' : '\nAll game checks passed.');
process.exit(failed ? 1 : 0);
