// What the page must know of a plant before any of its meshes is made (assets/kit/tree.js: OUTLINES: its size, each
// shape's height, trunk and feet): a few numbers a plant, each under what it is (its recipe's uid and seed) at its
// recipe's version (registry.json: the hash of its file and its kit). They are measured on a plant's nearest meshes, a
// third of a second and more of the page's one thread for a tree, and the land asks them as its files are read (the
// stands' colours: src/terrain/layers.js): 0.8 s of a first start (2026-11-19). So the build measures them, by the same
// code (outlines.json: tools/outlines.js), and the page and the recipes' workers read them as this file is read; what is
// reckoned of them later (each shape's rooms, its far end's chunks) is kept in the browser between starts
// (localStorage: no waiting). A recipe changed since the build has another version: it is measured anew, here, and kept.
// The page and the workers must cut a plant's levels by the same numbers: the workers reckon its rooms by its bands
// (assets/kit/plant.js bandsOf) and build its levels by the bands the page hands them, and a level cut by other numbers
// than its room was may be larger than its place (src/scatter/recipes.worker.js: it is not drawn). So what is kept here
// is taken only where its numbers are the ones the workers take: the build's, for a version the build measured; else
// numbers measured in this browser, never the build's of a version it no longer ships.
// Until 2026-11-14 the meshes themselves were kept here (20 MB, src/core/meshes.js): they are made in the recipes'
// workers now and live on the GPU (src/scatter/trees.js).
import { manifest } from './registry.js';
import { OUTLINES } from '../../assets/kit/tree.js';

const KEY = 'maia-outlines-1';
const keyOf = (id) => { const v = manifest[id.split(':')[0]]?.version; return v ? `${id}@${v}` : null; };   // null for what is no recipe's (a tree grown again from another seed)
const idOf = (k) => k.slice(0, k.lastIndexOf('@'));
// (what the build measured: none where it has not, a tool's run, the dev server before it has)
const [SHIPPED = {}] = Object.values(import.meta.glob('../../outlines.json', { eager: true, import: 'default' }));
/** Whether outline o holds the numbers the build measured of k: those the workers take. */
const asShipped = (k, o) => !!SHIPPED[k] && Object.keys(SHIPPED[k]).every((n) => JSON.stringify(o[n]) === JSON.stringify(SHIPPED[k][n]));

// The kit is handed what the build measured, and what was kept, of this version of each recipe as this file is read: it
// must be read before anything that asks a plant's size (the land's material does, as its own file is read), so the
// game's start names it first, and so does each of the recipes' workers (which keep nothing)
for (const [k, o] of Object.entries(SHIPPED)) if (keyOf(idOf(k)) === k) OUTLINES.kept.set(idOf(k), o);
try {
  const all = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const [k, o] of Object.entries(all)) if (keyOf(idOf(k)) === k && (SHIPPED[k] ? asShipped(k, o) : !o.shipped)) OUTLINES.kept.set(idOf(k), o);
} catch { /* nothing kept, or nowhere to keep */ }
/** How many plants' outlines were read back at this start (the build's, and what was kept). */
export const outlinesKept = OUTLINES.kept.size;
/** Keep what was measured or reckoned anew this time, and drop what is kept of versions that are no more. Returns how
    many it kept. */
export function keepOutlines() {
  if (!OUTLINES.made.size) return 0;
  try {
    const all = {}; let n = 0;
    // (each shape's far data stays on the page: its far end keeps it with its pictures, src/scatter/trees.js farOf; here
    // only its chunks: a few numbers a plant. What the build ships, with nothing reckoned of it, is not kept again)
    const keep = (id, o) => {
      const k = keyOf(id), shipped = !!k && asShipped(k, o);
      if (k && (o.rooms || !shipped)) all[k] = { ...o, ...(o.far ? { far: o.far.map(({ chunks }) => ({ chunks })) } : {}), ...(shipped ? { shipped } : {}) };
      return !!k;
    };
    for (const [id, o] of OUTLINES.kept) keep(id, o);
    for (const [id, o] of OUTLINES.made) if (keep(id, o)) n++;
    OUTLINES.made.clear(); localStorage.setItem(KEY, JSON.stringify(all));
    return n;
  } catch { return 0; }
}
