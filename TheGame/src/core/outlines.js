// What the page must know of a plant before any of its meshes is made (assets/kit/tree.js: OUTLINES: its size, each
// shape's height and trunk), kept in the browser between starts: a few numbers a plant, each under what it is (its
// recipe's uid and seed) at its recipe's version (registry.json: the hash of its file and its kit). They are measured
// on a plant's nearest meshes, a third of a second and more of the page's one thread for a tree: once, then read back
// at once (localStorage: no waiting). A recipe that has changed has another version: it is measured anew. Where
// nothing can be kept (a private window) every start measures.
// Until 2026-11-14 the meshes themselves were kept here (20 MB, src/core/meshes.js): they are made in the recipes'
// workers now and live on the GPU (src/scatter/trees.js).
import { manifest } from './registry.js';
import { OUTLINES } from '../../assets/kit/tree.js';

const KEY = 'maia-outlines-1';
const keyOf = (id) => { const v = manifest[id.split(':')[0]]?.version; return v ? `${id}@${v}` : null; };   // null for what is no recipe's (a tree grown again from another seed)

// The kit is handed what was kept of this version of each recipe as this file is read: it must be read before anything
// that asks a plant's size (the land's material does, as its own file is read), so the game's start names it first.
try {
  const all = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const [k, o] of Object.entries(all)) { const id = k.slice(0, k.lastIndexOf('@')); if (keyOf(id) === k) OUTLINES.kept.set(id, o); }
} catch { /* nothing kept, or nowhere to keep */ }
/** How many plants' outlines were read back at this start. */
export const outlinesKept = OUTLINES.kept.size;
/** Keep what was measured anew this time, and drop what is kept of versions that are no more. Returns how many it kept. */
export function keepOutlines() {
  if (!OUTLINES.made.size) return 0;
  try {
    const all = {}; let n = 0;
    for (const [id, o] of OUTLINES.kept) { const k = keyOf(id); if (k) all[k] = o; }
    for (const [id, o] of OUTLINES.made) { const k = keyOf(id); if (k) { all[k] = o; n++; } }
    OUTLINES.made.clear(); localStorage.setItem(KEY, JSON.stringify(all));
    return n;
  } catch { return 0; }
}
