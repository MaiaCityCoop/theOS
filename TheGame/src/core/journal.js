// The journal (intent 0038): what the page is about to do that may take memory, written into the last start's note
// (src/core/lastrun.js) as it begins, so a page killed in the middle of it says so at the next start. Samuel's iPhone
// died about a second past Ready with the GPU's ledger a third lower (2026-11-19, the master): what spikes is outside
// the ledger, and only the page itself can say what it began last. Each step that may take memory says so here first:
// a make or an upload of JOURNAL_MB or more (src/core/gpu.js), a worker made or set a job (src/core/workers.js), a far
// end's bake (src/detail/impostor.js), a family's store laid out again (src/scatter/tier.js), a layer of the world's
// textures kept (src/materials/bake.js), a step of the start (src/ui/loading.js, src/boot.js). The last three are kept.
import { JOURNAL_MB } from './budget.js';
import { MiB } from './physics.js';

const LAST = [];
let writer = null;
/** About to do `what` (mb: the memory it takes, MB, where it is known): kept at once, the last three, and written
    where the journal is written (journalTo), synchronously; whatever fails there, the step goes on. */
export function aboutTo(what, mb = null) {
  LAST.push(mb == null ? what : `${what} (${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB)`);
  if (LAST.length > 3) LAST.shift();
  try { writer?.([...LAST]); } catch { /* nothing kept: the step goes on */ }
}
/** The same, for a step that takes `bytes`, where they are JOURNAL_MB or more (a make, an upload): what(), what it is,
    asked only then (the smaller ones, every frame's, cost nothing more). */
export const aboutToTake = (bytes, what) => { if (bytes >= JOURNAL_MB * MiB) aboutTo(what(), bytes / MiB); };
/** Where the journal is written, as each step begins: fn(the last three, the last last) (src/core/lastrun.js). */
export const journalTo = (fn) => { writer = fn; };
/** The last three begun, the last last. */
export const journal = () => [...LAST];
