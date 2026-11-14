// The scattered rocks as bodies (intent 0003): the graphics card places them by a hash of their cell (src/scatter/
// rocks.js); this works the same hash out again on the CPU for the few cells round a point, so the walker and the camera
// are stopped by the rocks they see, with no list of thousands kept. The stone chance a stone's cell is drawn with comes
// from the ground pass itself, read back to the CPU (src/scatter/ground.js: at): every biome's stones, the paths, the
// tent's clear floor, exactly as drawn. The boulders (outcrops) need only the land's own functions.
import { cellRnd as rnd, riverAt, outcropAt, sstep } from './land.js';
import { recipes } from '../core/registry.js';
import { onWay, waysVersion } from './ways.js';

const STEP_OVER = 0.3;   // a rock whose top is lower than this is stepped over
let ground = null;
/** The ground pass to read the stones' chance from (src/main.js gives it). */
export const useGround = (g) => (ground = g);
const KINDS = recipes('asset').filter((a) => a.placement?.engine === 'rocks').map((a) => ({ cell: a.placement.cell, big: !!a.placement.outcrops, lo: a.size.length[0], hi: a.size.length[1] }));
const kept = new Map(); let ways = 0;

function rockIn(k, ki, i, j) {
  const key = `${ki}:${i}:${j}`; if (kept.has(key)) return kept.get(key);
  const x = (i + 0.15 + 0.7 * rnd(i, j, 202)) * k.cell, z = (j + 0.15 + 0.7 * rnd(i, j, 203)) * k.cell, G = k.big ? null : ground?.at(x, z);
  if (!k.big && !G) return null;   // the ground here not read yet: no body, and nothing kept, so it is asked again
  if (kept.size > 20000) kept.clear();
  const R = riverAt(x, z), oc = outcropAt(x, z); let rock = null;
  const keep = k.big ? rnd(i, j, 200) <= (0.012 + 0.6 * oc) * sstep(R.w + 2, R.w + 9, R.d) && !onWay(x, z, 3) : rnd(i, j, 200) <= G.stone * 0.7;   // as the card keeps them (src/scatter/rocks.js)
  if (keep) {
    const r1 = rnd(i, j, 204), r2 = rnd(i, j, 205), r3 = rnd(i, j, 206), r4 = rnd(i, j, 207);
    const s = k.lo + (k.hi - k.lo) * (r1 * r1 * r1 + (k.big ? oc * 0.25 * r1 : 0));
    const top = s * (0.55 + 0.4 * r3) - 0.22 * s;
    if (top > STEP_OVER) rock = { x, z, r: s * (0.8 + 0.5 * Math.max(r2, r4)) * 0.7 };   // a little inside its outline: it is half buried, and stops you where you see it
  }
  kept.set(key, rock); return rock;
}

/** The rocks within reach metres of (x, z) that a walker cannot step over: rounds { x, z, r }. */
export function rocksNear(x, z, reach = 3) {
  const out = [];
  if (ways !== waysVersion()) { ways = waysVersion(); kept.clear(); }   // (the ways are others than they were: what lay on one is asked again)
  KINDS.forEach((k, ki) => {
    const R = reach + k.hi * 1.3, i0 = Math.floor((x - R) / k.cell), i1 = Math.floor((x + R) / k.cell), j0 = Math.floor((z - R) / k.cell), j1 = Math.floor((z + R) / k.cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const r = rockIn(k, ki, i, j); if (r && Math.hypot(r.x - x, r.z - z) < reach + r.r) out.push(r); }
  });
  return out;
}
