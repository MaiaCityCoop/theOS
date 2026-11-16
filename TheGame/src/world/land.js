import { CLEARINGS, PLACES } from '../../world/places.js';
import OUTLINES from '../../world/outlines.js';
import { rnd } from '../core/hash.js';
import { sstep } from '../../assets/kit/math.js';
// The land, as one function of (x, z): the same integer-hash noise in JS (the walker's feet; its hash: src/core/hash.js)
// and as node code (land.nodes.js, the GPU's ground). Every constant the two share is written once, here.

export const OCT_LAM = [700, 300, 140, 65, 30, 14, 6, 2.5];
export const OCT_AMP = [22, 12, 5.5, 2.4, 1.0, 0.42, 0.16, 0.05];
export const HMIN = -60, HMAX = 70;
export const WATER_DROP = 0.2;


let gx = 0, gy = 0; // noised's gradient
function noised(px, py, s) {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1), duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const a = rnd(ix, iy, s), b = rnd(ix + 1, iy, s), c = rnd(ix, iy + 1, s), d = rnd(ix + 1, iy + 1, s);
  const k = a - b - c + d;
  gx = dux * (b - a + k * uy); gy = duy * (c - a + k * ux);
  return a + (b - a) * ux + (c - a) * uy + k * ux * uy;
}
function vnoise(px, py, s) {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = rnd(ix, iy, s), b = rnd(ix + 1, iy, s), c = rnd(ix, iy + 1, s), d = rnd(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** The river's field at (x, z): r (0 on the stream's line), its gradient, the distance d and half-width w. */
export const river = { r: 0, gx: 0, gz: 0, d: 0, w: 0 };
// The library's sandbox: round (x, z) the land is one biome; with `river`, a river of its own meanders through
// its middle in place of the world's (the same on the GPU: riverRaw in land.nodes.js). Set by the ground (scatter/ground.js).
export const SAND = { on: false, x: 0, z: 0, river: false };
export const MEANDER = { turn: 0.6, swing: 26, wave: 150 };   // the sandbox river: its heading, how far it swings either side, the length of a bend
function sandRiver(x, z) {
  const dx = x - SAND.x, dz = z - SAND.z, s = 1 - sstep(220, 340, Math.hypot(dx, dz));
  if (s <= 0) return;
  const c = Math.cos(MEANDER.turn), sn = Math.sin(MEANDER.turn), u = dx * c + dz * sn, v = -dx * sn + dz * c, k = (2 * Math.PI) / MEANDER.wave;
  const g = v - MEANDER.swing * Math.sin(k * u), gu = -MEANDER.swing * k * Math.cos(k * u);
  const gx = (gu * c - sn) / 1600, gz = (gu * sn + c) / 1600, gl = Math.hypot(gx, gz);   // in the world river's own measure
  river.r = Math.sign(g || 1) * (Math.abs(g) / 1600 + (1 - s) * 2 * gl * 1600); river.gx = gx; river.gz = gz;   // it ends where the sandbox does
  river.d = Math.abs(river.r) / Math.max(gl, 2e-4);
}
// the river's raw field: r (0 on the stream's line) and its gradient, the world's or the sandbox's
export function riverRaw(x, z) {
  const n1 = noised(x / 1600, z / 1600, 40), g1x = gx, g1y = gy;
  const n2 = noised(x / 330 + 17.3, z / 330 + 17.3, 41);
  river.r = (n1 - 0.5) + 0.28 * (n2 - 0.5);
  river.gx = g1x / 1600 + 0.28 * gx / 330;
  river.gz = g1y / 1600 + 0.28 * gy / 330;
  if (SAND.on && SAND.river) sandRiver(x, z);
  return [river.r, river.gx, river.gz];
}
// A river shaped by its bends (intent 0004): how much it turns here (from its course 20 m either way), and from that its
// width (wider through bends, where bars grow, and varying along it), its middle shifted to the bend's outside, and
// which bank this point is on: b > 0 the outside (a steep cut bank), b < 0 the inside (a gentle bar). Same on the GPU (land.nodes.js).
export const BEND = 80;   // a bend of this radius (m) or tighter counts fully
export function riverAt(x, z) {
  const [r, rx, rz] = riverRaw(x, z), gl = Math.max(Math.hypot(rx, rz), 2e-4), tx = -rz / gl, tz = rx / gl;
  const A = riverRaw(x + tx * 20, z + tz * 20), B = riverRaw(x - tx * 20, z - tz * 20);
  let dt = Math.atan2(A[2], A[1]) - Math.atan2(B[2], B[1]); dt = Math.atan2(Math.sin(dt), Math.cos(dt));
  const bend = Math.max(-1, Math.min(1, (dt / 40) * BEND));
  const w = (4.5 + 3.5 * sstep(0.25, 0.75, vnoise(x / 90, z / 90, 42)) + 7 * Math.abs(bend)) * (0.86 + 0.28 * vnoise(x / 14, z / 14, 43));   // half-width, 4 to 17 m; ragged every few metres
  const sd = r / gl - 0.25 * w * bend;   // signed distance from the channel's middle, shifted to the bend's outside
  river.r = sd * gl; river.gx = rx; river.gz = rz; river.d = Math.abs(sd); river.w = w; river.b = bend * (sd >= 0 ? 1 : -1);
  if (LAKES.length && lakeIn(x, z, r)) { river.r = 0; river.d = 0; river.b = 0; }   // (inside a ring: the lake's water, as deep as the channel's middle)
  return river;
}

// ---- the lakes: the river's line closes round on itself here and there (a ring of river round a patch of land: what a
// field of noise does wherever it has a small hill or dip near its zero). No river runs in a ring: what it rings round is
// water, a lake, its shore the ring's outer bank. Found round the camera, in a worker (src/world/lakes.worker.js: every
// patch of the field's one sign that the other sign closes round, smaller than LAKE_MOST), the nearest LAKE_MAX kept;
// each { x, z, r, s }: its middle, how far it reaches, the sign of the river's field inside it. The same on the GPU
// (land.nodes.js: inLake). A lake's floor is the channel's middle all over, its water the river's: flat, as the valley's floor is.
export const LAKE_MAX = 32, LAKE_STEP = 40, LAKE_HALF = 8000, LAKE_MOST = 2500;   // LAKE_MOST: cells of LAKE_STEP, the largest a lake may be (4 km²)
export const LAKES = [];
/** whether (x, z), where the river's raw field is r, lies inside a lake */
export function lakeIn(x, z, r) {
  for (const L of LAKES) { const dx = x - L.x, dz = z - L.z; if (dx * dx + dz * dz < L.r * L.r && (r >= 0 ? 1 : -1) === L.s) return true; }
  return false;
}
/** The lakes round (cx, cz): every patch of the river field's one sign that the other sign closes round within the
    square looked at, LAKE_STEP metres a cell, nearest first. */
export function findLakes(cx, cz) {
  const N = Math.round((2 * LAKE_HALF) / LAKE_STEP), S = new Int8Array(N * N), at = (i) => (i - N / 2) * LAKE_STEP;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) S[j * N + i] = riverRaw(cx + at(i), cz + at(j))[0] >= 0 ? 1 : -1;
  const lab = new Int32Array(N * N).fill(-1), q = new Int32Array(N * N), out = [];
  for (let s = 0; s < N * N; s++) {
    if (lab[s] >= 0) continue;
    let h = 0, t = 0, n = 0, sx = 0, sz = 0, edge = false; const first = t; q[t++] = s; lab[s] = s;
    while (h < t) {
      const c = q[h++], i = c % N, j = (c / N) | 0; n++; sx += i; sz += j;
      if (i === 0 || j === 0 || i === N - 1 || j === N - 1) edge = true;
      if (i > 0 && lab[c - 1] < 0 && S[c - 1] === S[s]) { lab[c - 1] = s; q[t++] = c - 1; }
      if (i < N - 1 && lab[c + 1] < 0 && S[c + 1] === S[s]) { lab[c + 1] = s; q[t++] = c + 1; }
      if (j > 0 && lab[c - N] < 0 && S[c - N] === S[s]) { lab[c - N] = s; q[t++] = c - N; }
      if (j < N - 1 && lab[c + N] < 0 && S[c + N] === S[s]) { lab[c + N] = s; q[t++] = c + N; }
    }
    if (edge || n > LAKE_MOST) continue;
    const mx = sx / n, mz = sz / n; let far = 0;
    for (let k = first; k < t; k++) { const c = q[k], dx = (c % N) - mx, dz = ((c / N) | 0) - mz; far = Math.max(far, dx * dx + dz * dz); }
    out.push({ x: cx + at(mx), z: cz + at(mz), r: (Math.sqrt(far) + 1.5) * LAKE_STEP, s: S[s] });
  }
  return out.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)).slice(0, LAKE_MAX);
}
/** How deep the river cuts at d from its middle (narrow is deeper; a cut bank drops sharply, a bar slopes gently). */
export function riverCarve(d, w, b) {
  const cut = Math.max(b, 0), bar = Math.max(-b, 0), D = 1.2 * Math.max(0.75, Math.min(1.7, 9 / w));
  return D * (1 - sstep(w * (0.55 + 0.4 * cut - 0.35 * bar), w * (1.1 - 0.06 * cut + 0.25 * bar), d));
}
/** How the bank rises from the water: a low lift, a cliff of earth on a bend's outside, a long slope on its inside. */
export function riverBank(d, w, b) {
  const cut = Math.max(b, 0), bar = Math.max(-b, 0);
  return 0.3 * sstep(w, w + 5 + 8 * bar, d) + 1.3 * cut * sstep(w, w + 1.2, d) * (1 - 0.6 * sstep(w + 6, w + 30, d));
}
export function baseB(x, z) {
  return 40 * (vnoise(x / 2600, z / 2600, 11) - 0.5) + 14 * (vnoise(x / 900 + 3.7, z / 900 + 3.7, 12) - 0.5);
}
/** The land's own height under (x, z), before anything is stood on it. */
export function naturalAt(x, z) {
  const { d, w, b } = riverAt(x, z);
  const m = sstep(w, w + 80, d), mm = 0.35 + 0.65 * m;
  let h = 0, qx = x, qy = z;
  for (let i = 0; i < 8; i++) {
    const t = 0.8 * qx - 0.6 * qy; qy = 0.6 * qx + 0.8 * qy; qx = t;
    const lam = OCT_LAM[i], o = i * 7.31;
    h += OCT_AMP[i] * (vnoise(qx / lam + o, qy / lam + o, 20 + i) - 0.5) * (i >= 6 ? mm : m);
  }
  const bank = riverBank(d, w, b);
  const carve = riverCarve(d, w, b);
  return baseB(x, z) + h + m * 3 + bank - carve;
}

// Pads: the ground levels itself under what is stood on it (world/places.js): within a thing's `clear` metres the
// land is flat at the height under its middle, and it meets the land again over PAD_FALL metres. The GPU's land is
// written with the same pads (land.nodes.js), so the walker's ground is the drawn ground.
export const PAD_FALL = 3;
export const PADS = CLEARINGS.map((p) => ({ x: p.x, z: p.z, r: p.clear, h: naturalAt(p.x, p.z) }));
/** The ground's height under (x, z), at full detail (what the GPU draws under the camera): the land, levelled under what stands. */
export function heightAt(x, z) {
  let h = naturalAt(x, z);
  for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + PAD_FALL) h = p.h + (h - p.h) * sstep(p.r, p.r + PAD_FALL, d); }
  return h;
}

// ---- the biomes' outlines (world/outlines.js), in JS as src/world/noise.nodes.js has them on the GPU, constant for constant ----
const OL = OUTLINES, HOME = PLACES[OL.home];
const push = (x, z) => [(vnoise(x / OL.bend.size, z / OL.bend.size, 97) - 0.5) * 2 * OL.bend.by, (vnoise(x / OL.bend.size, z / OL.bend.size, 98) - 0.5) * 2 * OL.bend.by];
/** the push at home: taken off every place's, so home itself is not moved */
export const BENT0 = push(HOME.x, HOME.z);
/** a place as the biomes' rules read it: [x, z] */
export const bentAt = (x, z) => { const w = push(x, z); return [x + w[0] - BENT0[0], z + w[1] - BENT0[1]]; };
const turnAt = (x, z, k = 1) => { const a = OL.turn[k - 1], cs = Math.cos(a), sn = Math.sin(a), dx = x - HOME.x, dz = z - HOME.z; return [HOME.x + dx * cs - dz * sn, HOME.z + dx * sn + dz * cs]; };
const secondAt = (x, z) => OL.second * sstep(OL.keep[0], OL.keep[1], Math.hypot(x - HOME.x, z - HOME.z));
/** how dry the land is at (x, z), 0..1: the dry land's rule (biomes/dryland.js) */
export function aridAt(x, z) {
  const [bx, bz] = bentAt(x, z), [tx, tz] = turnAt(bx, bz), [ux, uz] = turnAt(bx, bz, 2);
  return sstep(0.50, 0.66, vnoise(bx / 700, bz / 700, 50) + secondAt(x, z) * (vnoise(ux / 330, uz / 330, 54) - 0.5) + 0.3 * (vnoise(tx / 150, tz / 150, 51) - 0.5));
}
/** how much pine forest stands at (x, z), 0..1: the pine forest's rule (biomes/pineforest.js) without the river's part */
export function woodAt(x, z) {
  const [bx, bz] = bentAt(x, z), [tx, tz] = turnAt(bx, bz), [ux, uz] = turnAt(bx, bz, 2);
  return sstep(0.6, 0.72, vnoise(bx / 1100, bz / 1100, 80) + secondAt(x, z) * (vnoise(ux / 520, uz / 520, 84) - 0.5) + 0.3 * (vnoise(tx / 240, tz / 240, 81) - 0.5));
}

// what the rocks' shader hashes, for those who must know where a boulder stands
// the land's value noise itself, for those who read a biome's rule in JS (the city's plots, src/city/plan.js)
export const noiseAt = vnoise;
export function outcropAt(x, z) { return sstep(0.60, 0.72, vnoise(x / 230, z / 230, 74)); }
