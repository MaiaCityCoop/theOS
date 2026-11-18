// The GPU shared between runs (intent 0038: several tasks on one machine, some of them timing their frames). With
// GATE_LOCK=<dir>, each part of a gate run that draws (a page coming, a view or a tile, a pass of a path) takes the lock
// by making that directory (the one whose making succeeds holds it), writes who and since when into its `owner`, and
// removes it after; meanwhile the gate holds its pages on its clock (tools/gate/clock.js), so they draw nothing.
import { mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';

export const LOCK = process.env.GATE_LOCK || null;
let holding = false;
/** The GPU shared with other runs (GATE_LOCK: a directory, taken by making it, the one whose making succeeds holding it;
    its `owner` file says who and since when): fn() run holding it, and let go after, so that between the parts of a long
    run (a page made, a path, a pass of the truth) another's timed run can come in. Without GATE_LOCK, fn() at once. A
    lock older than an hour is not broken but said: the person decides. */
export async function locked(what, fn) {
  if (!LOCK || holding) return fn();
  for (let told = false; ;) {
    try { mkdirSync(LOCK); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let who = '', age = 0; try { who = readFileSync(`${LOCK}/owner`, 'utf8').trim(); age = Date.now() - statSync(`${LOCK}/owner`).mtimeMs; } catch {}
      if (age > 3600e3) throw new Error(`the GPU lock ${LOCK} has been held for ${Math.round(age / 60e3)} min (${who}): is it stale? Not broken here; ask`);
      if (!told) { console.log(`  (waiting for the GPU lock: ${who || 'being taken'})`); told = true; }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  holding = true;
  writeFileSync(`${LOCK}/owner`, `${process.env.GATE_WHO || 'tools/gate.js'} ${new Date().toISOString()} ${what} (pid ${process.pid})\n`);
  try { return await fn(); } finally { holding = false; rmSync(LOCK, { recursive: true, force: true }); }
}
/** The lock let go at once, if this run holds it (a run stopped by a signal). */
export function unlock() { if (holding) { holding = false; rmSync(LOCK, { recursive: true, force: true }); } }
