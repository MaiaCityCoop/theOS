// The scattered rocks as bodies (intent 0003): the graphics card places them by a hash of their cell (src/scatter/
// rocks.js); this works the same hash out again on the CPU for the few cells round a point, so the walker and the camera
// are stopped by the rocks they see, with no list of thousands kept. What the card reads from the ground's texture
// (the stone chance) is worked out here from the land's own functions; paths, which only the card knows, count as none,
// so now and then a rock stops you that the card left out of a path.
import { cellRnd as rnd, riverAt, aridAt, outcropAt } from './land.js';
import { PLACES } from './places.js';
import { BIOME } from '../../biomes/index.js';
import stone from '../../assets/stone.js';
import boulder from '../../assets/boulder.js';

const STEP_OVER = 0.3;   // a rock whose top is lower than this is stepped over
const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const LAND = BIOME.meadow.stones, ARID = BIOME.dryland.stones - LAND, BANK = BIOME.riverbank.stones - LAND;
const T = PLACES.tent, TR = T?.clear || 2.7;
const KINDS = [stone, boulder].map((a) => ({ cell: a.placement.cell, big: !!a.placement.outcrops, lo: a.size.length[0], hi: a.size.length[1] }));
const kept = new Map();

function rockIn(k, ki, i, j) {
  const key = `${ki}:${i}:${j}`; if (kept.has(key)) return kept.get(key);
  if (kept.size > 20000) kept.clear();
  const x = (i + 0.15 + 0.7 * rnd(i, j, 202)) * k.cell, z = (j + 0.15 + 0.7 * rnd(i, j, 203)) * k.cell;
  const R = riverAt(x, z), oc = outcropAt(x, z); let rock = null, keep;
  if (k.big) keep = rnd(i, j, 200) <= (0.012 + 0.6 * oc) * sstep(R.w + 2, R.w + 9, R.d);
  else {
    const arid = aridAt(x, z), bank = 1 - sstep(R.w * 0.6, R.w + 4, R.d), clearT = T ? sstep(TR - 0.4, TR + 0.3, Math.hypot(x - T.x, z - T.z)) : 1;
    keep = rnd(i, j, 200) <= clearT * (LAND + ARID * arid + BANK * bank + 0.5 * oc) * 0.7;
  }
  if (keep) {
    const r1 = rnd(i, j, 204), r2 = rnd(i, j, 205), r3 = rnd(i, j, 206), r4 = rnd(i, j, 207);
    const s = k.lo + (k.hi - k.lo) * (r1 * r1 * r1 + (k.big ? oc * 0.25 * r1 : 0));
    const top = s * (0.55 + 0.4 * r3) - 0.22 * s;
    if (top > STEP_OVER) rock = { x, z, r: s * (0.8 + 0.5 * Math.max(r2, r4)) * 0.9 };
  }
  kept.set(key, rock); return rock;
}

/** The rocks within reach metres of (x, z) that a walker cannot step over: rounds { x, z, r }. */
export function rocksNear(x, z, reach = 3) {
  const out = [];
  KINDS.forEach((k, ki) => {
    const R = reach + k.hi * 1.3, i0 = Math.floor((x - R) / k.cell), i1 = Math.floor((x + R) / k.cell), j0 = Math.floor((z - R) / k.cell), j1 = Math.floor((z + R) / k.cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const r = rockIn(k, ki, i, j); if (r && Math.hypot(r.x - x, r.z - z) < reach + r.r) out.push(r); }
  });
  return out;
}
