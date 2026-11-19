// What the last start reached (intent 0038). An iPhone that closes the game's tab leaves no log a Mac can read: WebKit
// kills a tab that holds too much and loads it again. So from the moment the world is ready the page keeps a small note
// of where it stands, about once a second, on the device and nowhere else (localStorage): the seconds since it was
// ready, what the GPU holds (the ledger's total and its largest class, the HUD's own figures: src/core/gpu.js), the
// device's class as its adapter said it (adapterOf: who made it, its largest buffer), the frames drawn since, and the
// last error the page met. A run that ends as a page ends (pagehide, or put away: visibilitychange) clears it; one that
// is killed leaves it, and the next start says it once, on the veil under its line and in the console, then lets it go.
import { ledger, adapterOf } from './gpu.js';

const KEY = 'maia-last-run';
let error = null;   // (the last error the page met, a line of it)
addEventListener('error', (e) => { error = String(e.message || e.error || 'an error').slice(0, 120); });
addEventListener('unhandledrejection', (e) => { error = String(e.reason?.message ?? e.reason ?? 'a promise refused').slice(0, 120); });
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = (note) => { try { if (note) localStorage.setItem(KEY, JSON.stringify(note)); else localStorage.removeItem(KEY); } catch { /* no storage here: nothing kept */ } };

/** The last run's note, where it ended other than as a page ends: said once, as a line for the veil (and the console),
    then let go. Null where there is none. */
export function lastRunLine() {
  const n = read(); write(null);
  if (!n) return null;
  const gb = (mb) => (mb / 1024).toFixed(2), gib = (b) => (b / 2 ** 30).toFixed(2), A = n.adapter;
  const on = A ? `, on ${A.vendor ? `${/^[aeiou]/i.test(A.vendor) ? 'an' : 'a'} ${A.vendor}` : 'a'} GPU of ${gib(A.buffer)} GiB` : '';
  const line = `Last start closed ${n.s.toFixed(1)} s after it was ready, holding ${gb(n.gpu)} GB${n.top ? ` (${n.top[0]} ${gb(n.top[1])})` : ''}${on}, ${n.frames} frames drawn${n.error ? `; its last error: ${n.error}` : ''}.`;
  console.warn(`[the last start] ${line}`, n);
  return line;
}
/** From the moment the world is ready (at: performance.now() then): the note kept about once a second, and let go as
    the page ends (kept again if it is shown again). frames(): how many frames it has drawn since. */
export function keepRun(at, frames) {
  const note = () => {
    const L = ledger(), top = Object.entries(L.classes).sort((x, y) => y[1].gpu - x[1].gpu)[0], A = adapterOf();
    write({ s: (performance.now() - at) / 1000, gpu: L.gpu, top: top?.[1].gpu > 0 ? [top[0], top[1].gpu] : null, adapter: A && { vendor: A.vendor, architecture: A.architecture, buffer: A.maxBufferSize }, frames: frames(), error });
  };
  let timer = 0;
  const go = () => { note(); timer ||= setInterval(note, 1000); }, end = () => { clearInterval(timer); timer = 0; write(null); };
  addEventListener('pagehide', end);
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? end() : go()));
  go();
}
