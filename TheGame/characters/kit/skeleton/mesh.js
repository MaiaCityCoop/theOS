// The skeleton's bones drawn out as surfaces (intent 0033): each bone out of its own field, with the way its surface
// faces (the field's slope), what it is made of, and how open each point is to the sky (from the field of all the
// bones round it: the shade of hollows and of joints). Plain JS, no three: run in a worker (./grow.worker.js) or
// under node.
//
//   prepare(bones)                     each bone's field and box, once
//   meshOfBone(bones, i, { h, shade }) -> { pos, nor: Float32Array, tri: Uint32Array, open, part: Uint8Array }
//                                      h: the cell's size (a small bone is drawn finer); shade: 0 none, 1 along the
//                                      surface's own way out, 2 round it too
import { fieldOf, meshOf, slope } from '../field.js';

/** How the surfaces are drawn out, as a number: changed with the rules below, so a surface kept from other rules is
 *  grown again (./grow.worker.js: the digest). */
export const DRAWN = 2;

// The thinnest blade among a bone's solids (a plate's thickness in its middle, m): a sheet thinner than the cells it
// is drawn with comes out full of holes.
const thinOf = (ops) => { let t = Infinity; for (const o of ops) { if (o.op !== 'add') continue; if (o.s.t === 9) t = Math.min(t, 2 * o.s.tc); else if (o.s.t === 6) t = Math.min(t, thinOf(o.s.ops)); } return t; };

/** Each bone's field (F), its box (lo, hi), its thinnest blade (thin), its far lists (for the shade). */
export function prepare(bones) {
  for (const b of bones) {
    if (b.F) continue;
    b.F = fieldOf(b.ops); b.lo = [1e9, 1e9, 1e9]; b.hi = [-1e9, -1e9, -1e9]; b.far = new Map(); b.thin = thinOf(b.ops);
    for (const o of b.ops) if (o.op === 'add') for (let i = 0; i < 3; i++) { b.lo[i] = Math.min(b.lo[i], o.s.lo[i] - o.k * 0.3 - 0.002); b.hi[i] = Math.max(b.hi[i], o.s.hi[i] + o.k * 0.3 + 0.002); }
  }
  return bones;
}

/** The field of all the bones at a point (the nearest bone's), true as far as `reach` metres from a surface. */
export function unionOf(bones, reach = 0.05) {
  const G = 0.05, grid = new Map(), key = (i, j, k) => i + 4096 * (j + 4096 * k);
  bones.forEach((b, n) => {
    const a = b.lo.map((v) => Math.floor((v - reach) / G)), c = b.hi.map((v) => Math.floor((v + reach) / G));
    for (let i = a[0]; i <= c[0]; i++) for (let j = a[1]; j <= c[1]; j++) for (let k = a[2]; k <= c[2]; k++) { const q = key(i, j, k); let l = grid.get(q); if (!l) grid.set(q, l = []); l.push(n); }
  });
  const FG = 0.04;
  const farList = (b, x, y, z) => { const i = Math.floor(x / FG), j = Math.floor(y / FG), k = Math.floor(z / FG), q = key(i, j, k); let l = b.far.get(q); if (!l) { l = b.F.cull(b.F.all, [i * FG, j * FG, k * FG], [(i + 1) * FG, (j + 1) * FG, (k + 1) * FG], reach); b.far.set(q, l); } return l; };
  return (x, y, z) => {
    const l = grid.get(key(Math.floor(x / G), Math.floor(y / G), Math.floor(z / G))); if (!l) return reach;
    let f = reach;
    for (const n of l) { const b = bones[n]; if (x < b.lo[0] - reach || x > b.hi[0] + reach || y < b.lo[1] - reach || y > b.hi[1] + reach || z < b.lo[2] - reach || z > b.hi[2] + reach) continue; const fl = farList(b, x, y, z); if (!fl.length) continue; const v = b.F.ev(fl, x, y, z); if (v < f) f = v; }
    return f;
  };
}

/** How fine a bone is drawn for a cell of h: a small bone finer, down to 0.45 h; a bone with a thin blade (the
 *  shoulder blade, the hip bone's wing) with cells smaller than the blade is thick, whatever h is. */
export const cellOf = (b, h) => { const d = b.hi.map((v, i) => v - b.lo[i]).sort((x, y) => x - y); return Math.min(h, Math.max(h * 0.45, d[0] / 40), Math.max(0.0012, (b.thin ?? Infinity) * 0.7)); };

/** One bone's surface. union: the field of all the bones (unionOf), for the shade; box: only what lies in it. */
export function meshOfBone(bones, i, { h = 0.003, shade = 1, union = null, box = null } = {}) {
  const b = bones[i]; let lo = b.lo, hi = b.hi;
  if (box) { lo = lo.map((v, a) => Math.max(v, box.lo[a])); hi = hi.map((v, a) => Math.min(v, box.hi[a])); if (lo.some((v, a) => v >= hi[a])) return null; }
  const hb = cellOf(b, h), m = meshOf(b.F, { lo, hi, h: hb }); if (!m.tri.length) return null;
  const n = m.pos.length / 3, pos = Float32Array.from(m.pos), nor = new Float32Array(n * 3), open = new Uint8Array(n).fill(255), part = new Uint8Array(n);
  const mixed = new Set(b.ops.map((o) => o.part)).size > 1, U = shade ? union : null;
  const D = [0.0015, 0.004, 0.009, 0.018, 0.034], W = [0.26, 0.24, 0.2, 0.17, 0.13];
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], list = b.F.nearPoint(x, y, z), g = slope(b.F, list, x, y, z, hb * 0.35), l = Math.hypot(g[0], g[1], g[2]) || 1, N = [g[0] / l, g[1] / l, g[2] / l];
    nor[v * 3] = N[0]; nor[v * 3 + 1] = N[1]; nor[v * 3 + 2] = N[2];
    let p = b.part;
    if (mixed) { let best = 1e9; for (const j of list) { const o = b.ops[j]; if (o.op !== 'add') continue; const d = b.F.d(j, x, y, z); if (d < best) { best = d; p = o.part; } } }
    part[v] = p;
    if (U) {
      // how open the point is: the field a few steps out along its normal (and round it), against how far out they are
      let occ = 0, ws = 0;
      for (let q = 0; q < 5; q++) { const d = D[q], f = U(x + N[0] * d, y + N[1] * d, z + N[2] * d); occ += W[q] * Math.max(0, 1 - f / d); ws += W[q]; }
      if (shade > 1) {
        const t = Math.abs(N[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], T = [N[1] * t[2] - N[2] * t[1], N[2] * t[0] - N[0] * t[2], N[0] * t[1] - N[1] * t[0]], tl = Math.hypot(T[0], T[1], T[2]), T1 = [T[0] / tl, T[1] / tl, T[2] / tl], T2 = [N[1] * T1[2] - N[2] * T1[1], N[2] * T1[0] - N[0] * T1[2], N[0] * T1[1] - N[1] * T1[0]];
        for (let q = 0; q < 6; q++) { const a = (q / 6) * 2 * Math.PI + v * 0.7, c = Math.cos(a) * 0.75, s = Math.sin(a) * 0.75, dx = N[0] * 0.66 + T1[0] * c + T2[0] * s, dy = N[1] * 0.66 + T1[1] * c + T2[1] * s, dz = N[2] * 0.66 + T1[2] * c + T2[2] * s;
          for (const d of [0.006, 0.02]) { const f = U(x + dx * d, y + dy * d, z + dz * d); occ += 0.09 * Math.max(0, 1 - f / (d * 0.66)); ws += 0.09; } }
      }
      open[v] = Math.round(255 * Math.max(0, 1 - (1.15 * occ) / ws));
    }
  }
  return { id: b.id, rig: b.rig, pos, nor, tri: Uint32Array.from(m.tri), open, part };
}
