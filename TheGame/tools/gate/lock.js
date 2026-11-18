// The GPU shared between runs (intent 0038: several tasks on one machine, some of them timing their frames). With
// GATE_LOCK=<dir>, each part of a gate run that draws (a page coming, a view or a tile, a pass of a path) takes the lock
// by making that directory (the one whose making succeeds holds it), writes who and since when into its `owner`, and
// removes it after; meanwhile the gate holds its pages on its clock (tools/gate/clock.js), so they draw nothing.
//
// The next turn: while a file `.gate-next` stands beside the lock (GATE_NEXT names another) and does not name this run
// (GATE_WHO), the lock is not taken, so that one who needs the next turn (a merge's review) is never starved: it writes
// the file, waits for the lock, and removes the file once it holds it.
import { mkdirSync, readFileSync, writeFileSync, statSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const LOCK = process.env.GATE_LOCK || null;
const NEXT = process.env.GATE_NEXT || (LOCK ? join(dirname(LOCK.replace(/\/+$/, '')), '.gate-next') : null), WHO = process.env.GATE_WHO || 'tools/gate.js';
let holding = false;
/** Who has the next turn, where another has it (the `.gate-next` file's words, which do not name this run), or null. */
function another() {
  if (!NEXT || !existsSync(NEXT)) return null;
  let says = ''; try { says = readFileSync(NEXT, 'utf8').trim(); } catch { return null; }
  return says.includes(WHO) ? null : says || '(unnamed)';
}
/** The GPU shared with other runs (GATE_LOCK: a directory, taken by making it, the one whose making succeeds holding it;
    its `owner` file says who and since when): fn() run holding it, and let go after, so that between the parts of a long
    run (a page made, a path, a pass of the truth) another's timed run can come in. Not taken while another has the next
    turn. Without GATE_LOCK, fn() at once. A lock older than an hour is not broken but said: the person decides. */
export async function locked(what, fn) {
  if (!LOCK || holding) return fn();
  for (let told = '', said = ''; ;) {
    const next = another();
    if (next) { if (said !== next) { console.log(`  (waiting: the next turn is ${next})`); said = next; } await new Promise((r) => setTimeout(r, 5000)); continue; }
    try { mkdirSync(LOCK); if (another()) { rmSync(LOCK, { recursive: true, force: true }); continue; } break; } catch (e) {   // (taken just as another asked for the next turn: given back)
      if (e.code !== 'EEXIST') throw e;
      let who = '', age = 0; try { who = readFileSync(`${LOCK}/owner`, 'utf8').trim(); age = Date.now() - statSync(`${LOCK}/owner`).mtimeMs; } catch {}
      if (age > 3600e3) throw new Error(`the GPU lock ${LOCK} has been held for ${Math.round(age / 60e3)} min (${who}): is it stale? Not broken here; ask`);
      if (told !== who) { console.log(`  (waiting for the GPU lock: ${who || 'being taken'})`); told = who; }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  holding = true;
  writeFileSync(`${LOCK}/owner`, `${WHO} ${new Date().toISOString()} ${what} (pid ${process.pid})\n`);
  try { return await fn(); } finally { holding = false; rmSync(LOCK, { recursive: true, force: true }); }
}
/** The lock let go at once, if this run holds it (a run stopped by a signal). */
export function unlock() { if (holding) { holding = false; rmSync(LOCK, { recursive: true, force: true }); } }
process.on('exit', unlock);   // (however the run ends, short of being killed outright: the lock is never left held)
