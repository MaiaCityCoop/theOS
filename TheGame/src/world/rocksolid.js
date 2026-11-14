// The scattered rocks as bodies (intent 0003): the graphics card places them by a hash of their cell (src/scatter/
// rocks.js); this works the same hash out again on the CPU for the few cells round a point, so the walker and the camera
// are stopped by the rocks they see, with no list of thousands kept. The stone chance a stone's cell is drawn with comes
// from the ground pass itself, read back to the CPU (src/scatter/ground.js: at): every biome's stones, the paths, the
// tent's clear floor, exactly as drawn. The boulders (outcrops) need only the land's own functions. How far a rock
// reaches and how high it stands is its shape's (assets/kit/rock.js: rockBody), as it is drawn.
import { cellRnd as rnd, riverAt, outcropAt, sstep } from './land.js';
import { recipes } from '../core/registry.js';
import { onWay, waysVersion } from './ways.js';
import { rockBody } from '../../assets/kit/rock.js';

const STEP_OVER = 0.3;   // a rock whose top is lower than this is stepped over
let ground = null;
/** The ground pass to read the stones' chance from (src/main.js gives it). */
export const useGround = (g) => (ground = g);
const KINDS = recipes('asset').filter((a) => a.placement?.engine === 'rocks').map((a) => ({ asset: a, uid: a.uid, cell: a.placement.cell, big: !!a.placement.outcrops, lo: a.size.length[0], hi: a.size.length[1], shapes: a.placement.shapes ?? 1 }));
const kept = new Map(); let ways = 0, drawn = null;
/** Which rock assets are drawn (their uids: src/scatter/rocks.js says): only what is seen is a body. */
export const rocksDrawn = (uids) => { drawn = new Set(uids); kept.clear(); };

function rockIn(k, ki, i, j) {
  const key = `${ki}:${i}:${j}`; if (kept.has(key)) return kept.get(key);
  const x = (i + 0.15 + 0.7 * rnd(i, j, 202)) * k.cell, z = (j + 0.15 + 0.7 * rnd(i, j, 203)) * k.cell, G = k.big ? null : ground?.at(x, z);
  if (!k.big && !G) return null;   // the ground here not read yet: no body, and nothing kept, so it is asked again
  if (kept.size > 20000) kept.clear();
  const R = riverAt(x, z), oc = outcropAt(x, z); let rock = null;
  const keep = k.big ? rnd(i, j, 200) <= (0.012 + 0.6 * oc) * sstep(R.w + 2, R.w + 9, R.d) && !onWay(x, z, 3) : rnd(i, j, 200) <= G.stone * 0.7;   // as the card keeps them (src/scatter/rocks.js)
  if (keep) {
    // its size, and which of its asset's shapes it is (the same two hashes as the card's); that shape's reach and height
    const r1 = rnd(i, j, 204), s = k.lo + (k.hi - k.lo) * (r1 * r1 * r1 + (k.big ? oc * 0.25 * r1 : 0)), v = Math.min(k.shapes - 1, Math.floor(rnd(i, j, 201) * k.shapes)), B = rockBody(k.asset, v);
    rock = { x, z, s, v, uid: k.uid, side: s * B.span, r: s * B.rad * 0.7, solid: s * B.top > STEP_OVER };   // (r: a little inside its outline: it is half buried, and stops you where you see it)
  }
  kept.set(key, rock); return rock;
}
const each = (x, z, reach, fn) => {
  if (ways !== waysVersion()) { ways = waysVersion(); kept.clear(); }   // (the ways are others than they were: what lay on one is asked again)
  KINDS.forEach((k, ki) => {
    if (drawn && !drawn.has(k.uid)) return;
    const R = reach + k.hi * 1.3, i0 = Math.floor((x - R) / k.cell), i1 = Math.floor((x + R) / k.cell), j0 = Math.floor((z - R) / k.cell), j1 = Math.floor((z + R) / k.cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const r = rockIn(k, ki, i, j); if (r) fn(r); }
  });
};
/** Every rock about (x, z), whatever its size: fn({ x, z, s (its size), v (which of its asset's shapes), uid (its
    asset), side (its largest side, metres) }) for each within reach metres, and a few beyond. */
export const rocksAround = (x, z, reach, fn) => each(x, z, reach, (r) => { if (Math.hypot(r.x - x, r.z - z) < reach + r.side) fn(r); });

/** The rocks within reach metres of (x, z) that a walker cannot step over: rounds { x, z, r }. */
export function rocksNear(x, z, reach = 3) {
  const out = [];
  each(x, z, reach, (r) => { if (r.solid && Math.hypot(r.x - x, r.z - z) < reach + r.r) out.push(r); });
  return out;
}
