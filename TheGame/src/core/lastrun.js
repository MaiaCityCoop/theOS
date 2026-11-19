// What the last start reached (intent 0038). An iPhone that closes the game's tab leaves no log a Mac can read: WebKit
// kills a tab that holds too much and loads it again. So from the moment the world is ready the page keeps a small note
// of where it stands, about once a second, on the device and nowhere else (localStorage): the seconds since it was
// ready, what the GPU holds (the ledger's total and its largest class, the HUD's own figures: src/core/gpu.js), the
// device's class as its adapter said it (adapterOf: who made it, its largest buffer), the budget the game holds itself
// to on it (wholeBudget, MB), the build it runs (its short id, as the page shows it: vite.config.js version), the
// frames drawn since, how many makes wait for memory (src/core/compile.js), and the last error the page met. And from
// the first step of the start on, its journal (src/core/journal.js): the last three things it began that may take memory,
// each written the moment it begins, so a page killed in the middle of one names it. A run that ends as a page ends
// (pagehide, or put away: visibilitychange) clears it; one that is killed leaves it, and the next start says it once, on
// the veil under its line and in the console, then lets it go.
import { ledger, adapterOf, wholeBudget } from './gpu.js';
import { waitingOnMemory } from './compile.js';
import { journalTo, journal } from './journal.js';

const KEY = 'maia-last-run';
let error = null;   // (the last error the page met, a line of it)
addEventListener('error', (e) => { error = String(e.message || e.error || 'an error').slice(0, 120); });
addEventListener('unhandledrejection', (e) => { error = String(e.reason?.message ?? e.reason ?? 'a promise refused').slice(0, 120); });
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = (note) => { try { if (note) localStorage.setItem(KEY, JSON.stringify(note)); else localStorage.removeItem(KEY); } catch { /* no storage here: nothing kept */ } };
// (the build: its short id, as the page shows it at its top right: vite.config.js version; the dev server's "dev")
const buildOf = () => globalThis.document?.getElementById('os-build')?.textContent.trim().split(/\s/)[0] || null;

// (the journal, written into the note as each step begins: beside what keepRun says from Ready on, or before it the
// build and, once the adapter is known, the budget; never while the page is away, put away or ended)
let NOTE = null, away = false;
journalTo((last) => { if (!away) write({ ...(NOTE ?? { s: null, budget: adapterOf() ? Math.round(wholeBudget()) : null, build: buildOf() }), journal: last }); });
addEventListener('pagehide', () => { away = true; write(null); });
globalThis.document?.addEventListener('visibilitychange', () => { away = document.visibilityState === 'hidden'; if (away) write(null); });

/** The last run's note, where it ended other than as a page ends: said once, as a line for the veil (and the console),
    then let go. Null where there is none. */
export function lastRunLine() {
  const n = read(); write(null);
  if (!n) return null;
  const line = `Last start closed ${n.s == null ? 'before it was ready' : `${n.s.toFixed(1)} s after it was ready`}${said(n)}.`;
  console.warn(`[the last start] ${line}`, n);
  return line;
}
// (what a note says, in the line's order: what the GPU held, the device, its budget, the build, the frames drawn, the
// makes waiting on memory; then what it was about to do, the last last, and its last error)
function said(n) {
  const gb = (mb) => (mb / 1024).toFixed(2), gib = (b) => (b / 2 ** 30).toFixed(2), A = n.adapter;
  return [
    n.gpu != null ? `, holding ${gb(n.gpu)} GB${n.top ? ` (${n.top[0]} ${gb(n.top[1])})` : ''}` : '',
    A ? `, on ${A.vendor ? `${/^[aeiou]/i.test(A.vendor) ? 'an' : 'a'} ${A.vendor}` : 'a'} GPU of ${gib(A.buffer)} GiB` : '',
    n.budget ? `, budget ${n.budget} MB` : '',
    n.build ? `, build ${n.build}` : '',
    n.frames != null ? `, ${n.frames} frames drawn` : '',
    n.waiting ? `, ${n.waiting} make${n.waiting > 1 ? 's' : ''} waiting on memory` : '',
    n.journal?.length ? `; about to: ${n.journal.join(' → ')}` : '',
    n.error ? `; its last error: ${n.error}` : '',
  ].join('');
}
/** From the moment the world is ready (at: performance.now() then): the note kept about once a second, and let go as
    the page ends (kept again if it is shown again). frames(): how many frames it has drawn since. */
export function keepRun(at, frames) {
  const build = buildOf();
  const note = () => {
    const L = ledger(), top = Object.entries(L.classes).sort((x, y) => y[1].gpu - x[1].gpu)[0], A = adapterOf();
    NOTE = { s: (performance.now() - at) / 1000, gpu: L.gpu, top: top?.[1].gpu > 0 ? [top[0], top[1].gpu] : null, adapter: A && { vendor: A.vendor, architecture: A.architecture, buffer: A.maxBufferSize }, budget: Math.round(wholeBudget()), build, frames: frames(), waiting: waitingOnMemory(), error };
    if (!away) write({ ...NOTE, journal: journal() });
  };
  let timer = 0;
  const go = () => { note(); timer ||= setInterval(note, 1000); }, end = () => { clearInterval(timer); timer = 0; write(null); };
  addEventListener('pagehide', end);
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? end() : go()));
  go();
}
