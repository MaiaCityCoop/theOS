// The browsers the tools drive (intent 0038): every tool that opens WebKit takes it from here, so all of them run
// the same engine.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';

/** Where WebKit lies, as launch options: the newest Playwright has installed (its pw_run.sh), one this version of
    Playwright did not bring taken where it lies; nothing (Playwright's own) where none is installed. */
export function webkitAt() {
  const cache = `${homedir()}/Library/Caches/ms-playwright`;
  const run = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('webkit-')).sort().map((d) => `${cache}/${d}/pw_run.sh`).filter(existsSync).pop() : null;
  return run ? { executablePath: run } : {};
}
