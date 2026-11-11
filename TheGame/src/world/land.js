import { PLACES } from './places.js';
// The land, as one function of (x, z): the same integer-hash noise in JS (the walker's feet)
// and in GLSL (the GPU's ground). Every constant the two share is written once, here.

export const OCT_LAM = [700, 300, 140, 65, 30, 14, 6, 2.5];
export const OCT_AMP = [22, 12, 5.5, 2.4, 1.0, 0.42, 0.16, 0.05];
export const HMIN = -60, HMAX = 70;
export const WATER_DROP = 0.2;

function hashI(x, y, s) {
  let h = Math.imul(x, 0x9E3779B1) ^ Math.imul(y, 0x85EBCA77) ^ Math.imul(s, 0xC2B2AE3D);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D);
  h ^= h >>> 12; h = Math.imul(h, 0x297A2D39);
  h ^= h >>> 15;
  return h >>> 0;
}
const rnd = (x, y, s) => (hashI(x, y, s) >>> 8) / 16777216;
const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

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
// its middle in place of the world's (the same in GLSL: sandRiver in land.glsl.js). Set by the ground (scatter/ground.js).
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
export function riverAt(x, z) {
  const n1 = noised(x / 1600, z / 1600, 40), g1x = gx, g1y = gy;
  const n2 = noised(x / 330 + 17.3, z / 330 + 17.3, 41);
  river.r = (n1 - 0.5) + 0.28 * (n2 - 0.5);
  river.gx = g1x / 1600 + 0.28 * gx / 330;
  river.gz = g1y / 1600 + 0.28 * gy / 330;
  river.d = Math.abs(river.r) / Math.max(Math.hypot(river.gx, river.gz), 2e-4);
  river.w = 6.75 + 4.5 * sstep(0.3, 0.7, vnoise(x / 170, z / 170, 42)); // half-width: 3 to 5 times the first stream's
  if (SAND.on && SAND.river) sandRiver(x, z);
  return river;
}
export function baseB(x, z) {
  return 40 * (vnoise(x / 2600, z / 2600, 11) - 0.5) + 14 * (vnoise(x / 900 + 3.7, z / 900 + 3.7, 12) - 0.5);
}
/** The land's own height under (x, z), before anything is stood on it. */
export function naturalAt(x, z) {
  const { d, w } = riverAt(x, z);
  const m = sstep(w, w + 80, d), mm = 0.35 + 0.65 * m;
  let h = 0, qx = x, qy = z;
  for (let i = 0; i < 8; i++) {
    const t = 0.8 * qx - 0.6 * qy; qy = 0.6 * qx + 0.8 * qy; qx = t;
    const lam = OCT_LAM[i], o = i * 7.31;
    h += OCT_AMP[i] * (vnoise(qx / lam + o, qy / lam + o, 20 + i) - 0.5) * (i >= 6 ? mm : m);
  }
  const bank = 0.3 * sstep(w, w + 5, d);
  const carve = 1.2 * (1 - sstep(w * 0.55, w * 1.1, d));
  return baseB(x, z) + h + m * 3 + bank - carve;
}

// Pads: the ground levels itself under what is stood on it (src/world/places.js): within a thing's `clear` metres the
// land is flat at the height under its middle, and it meets the land again over PAD_FALL metres. The GPU's land is
// written with the same pads (WORLD_GLSL), so the walker's ground is the drawn ground.
export const PAD_FALL = 3;
export const PADS = Object.values(PLACES).map((p) => ({ x: p.x, z: p.z, r: p.clear || 3, h: naturalAt(p.x, p.z) }));
/** The ground's height under (x, z), at full detail (what the GPU draws under the camera): the land, levelled under what stands. */
export function heightAt(x, z) {
  let h = naturalAt(x, z);
  for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + PAD_FALL) h = p.h + (h - p.h) * sstep(p.r, p.r + PAD_FALL, d); }
  return h;
}

export function aridAt(x, z) {
  return sstep(0.50, 0.66, vnoise(x / 700, z / 700, 50) + 0.3 * (vnoise(x / 150, z / 150, 51) - 0.5));
}

// what the rocks' shader hashes, for those who must know where a boulder stands
export const cellRnd = rnd;
export function outcropAt(x, z) { return sstep(0.60, 0.72, vnoise(x / 230, z / 230, 74)); }
