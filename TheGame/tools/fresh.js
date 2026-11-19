// What the build makes that git keeps, held to what its maker makes of this commit (intent 0038, 2026-11-19: building
// main made rooms.json anew, its builder's hash moved, and main carried the stale one). Each of tools/registry.js
// MEASURES whose file git keeps is made again here as the build makes it (vite.config.js: the registry, then the maker
// in a process of its own), and git is asked whether it differs; one that does fails, named with its maker and how to
// make it. A file git does not keep (made by every build, ignored) cannot go stale, and is not made here.
//
//   bun tools/fresh.js      CI, after the install: a line a stale file, exit 1 if any
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildRegistry, MEASURES } from './registry.js';

const ROOT = resolve(import.meta.dirname, '..'), git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }), stale = [];
buildRegistry(ROOT);
for (const { maker, makes } of MEASURES.filter((m) => git('ls-files', '--error-unmatch', m.makes).status === 0)) {
  const made = spawnSync(process.execPath, [resolve(ROOT, maker)], { cwd: ROOT, stdio: 'inherit' });
  if (made.status !== 0) { stale.push(`${maker} failed (exit ${made.status}): ${makes} was not made`); continue; }
  const d = git('diff', '--stat', '--exit-code', '--', makes);
  if (d.status) stale.push(`${makes} is not what ${maker} makes of this commit (${d.stdout.trim().split('\n').at(-1).trim()}): run \`bun ${maker}\` in TheGame and commit it`);
}
for (const s of stale) console.error(`fresh: ${s}`);
console.log(`fresh: ${stale.length ? `${stale.length} stale` : 'every file the build makes and git keeps is as its maker makes it'}`);
process.exitCode = stale.length ? 1 : 0;
