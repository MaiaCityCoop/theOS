// A shape as a field: how far each point is from its surface (negative inside), made of simple solids blended into one
// another, and the surface drawn out of it as triangles. Plain JS, no three: the person is grown from it (./body.js),
// in the page or in a worker, and a tool can run it under node.
//
//   solid(kind, …)   a solid: ball, egg (an ellipsoid), rod (a cone with round ends), box (rounded), ring (a torus),
//                    plane, or a group of solids with its own blends (shell, cut, …)
//   fieldOf(ops)     the field: ops in order, each { op: 'add' | 'sub' | 'and', k, s } (k: how far it blends, metres);
//                    every op may carry what the caller wants back (bone, part, tag)
//   meshOf(field, region)  the surface in a box, as a grid of cells `h` metres a side (surface nets): one point a cell the
//                    surface crosses, set onto the surface along the field's slope; cut by the region's cuts
//   zip(a, b)        two regions cut by the same cut, joined: the two rims stitched into one surface
//
// The field is cheap where it matters: the box is walked in blocks, a block holds only the solids that reach it, and a
// block the surface cannot be in is never sampled.

// ── the solids ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Each { t, … , lo, hi } (its bounds, without any blend). R: rows of the turn from the world into the solid's own frame.
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const bounds = (c, e) => ({ lo: [c[0] - e, c[1] - e, c[2] - e], hi: [c[0] + e, c[1] + e, c[2] + e] });
export const ball = (c, r) => ({ t: 0, c, r, ...bounds(c, r) });
export const egg = (c, r, R = I3) => ({ t: 1, c, r, R, ...bounds(c, Math.max(...r)) });
export const rod = (a, b, ra, rb = ra) => {
  const lo = [0, 1, 2].map((i) => Math.min(a[i] - ra, b[i] - rb)), hi = [0, 1, 2].map((i) => Math.max(a[i] + ra, b[i] + rb));
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...ba) || 1e-9;
  return { t: 2, a, b, ra, rb, ba, l2: l * l, rr: ra - rb, aa: l * l - (ra - rb) * (ra - rb), il2: 1 / (l * l), lo, hi };
};
export const box = (c, h, rr = 0, R = I3) => ({ t: 3, c, h, rr, R, ...bounds(c, Math.hypot(...h) + rr) });
export const ring = (c, R0, r, R = I3) => ({ t: 4, c, R0, r, R, ...bounds(c, R0 + r) });   // round its own y
export const plane = (n, at) => ({ t: 5, n, d: -(n[0] * at[0] + n[1] * at[1] + n[2] * at[2]), lo: [-1e9, -1e9, -1e9], hi: [1e9, 1e9, 1e9] });
/** A group: its own ops, blended in order, standing as one solid (lo, hi: its bounds, given or from its adds). */
export const group = (ops, lo, hi) => {
  if (!lo) { lo = [1e9, 1e9, 1e9]; hi = [-1e9, -1e9, -1e9]; for (const o of ops) if (o.op === 'add') for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], o.s.lo[i] - o.k); hi[i] = Math.max(hi[i], o.s.hi[i] + o.k); } }
  return { t: 6, ops, lo, hi };
};

/** A turn as rows (world into the solid's frame) from its axes, each given in the world: x, y (z made). */
export function frame(x, y) {
  const n = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
  const X = n(x); let Y = n(y); const d = X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]; Y = n([Y[0] - X[0] * d, Y[1] - X[1] * d, Y[2] - X[2] * d]);
  const Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  return [...X, ...Y, ...Z];
}

const smin = (a, b, k) => { const m = a < b ? a : b; if (k <= 0) return m; const h = k - (a > b ? a - b : b - a); return h <= 0 ? m : m - (h * h) / (4 * k); };
const smax = (a, b, k) => -smin(-a, -b, k);

// ── the field, compiled ──────────────────────────────────────────────────────────────────────────────────────────────
// The ops are written into one Float64Array, a record of REC numbers each, and read back in a tight loop (no objects,
// no shapes to look up): [op, type, k, lo×3, hi×3, …the solid's own numbers]. A group's ops follow the top level's,
// and its record holds where they start and how many there are.
const REC = 28, OP = { add: 0, sub: 1, and: 2 };
function write(P, at, o) {
  const s = o.s; P[at] = OP[o.op]; P[at + 1] = s.t; P[at + 2] = o.k; P.set(s.lo, at + 3); P.set(s.hi, at + 6); const q = at + 9;
  switch (s.t) {
    case 0: P.set(s.c, q); P[q + 3] = s.r; break;
    case 1: P.set(s.c, q); P.set(s.r, q + 3); P.set(s.R, q + 6); break;
    case 2: P.set(s.a, q); P.set(s.ba, q + 3); P[q + 6] = s.ra; P[q + 7] = s.rb; P[q + 8] = s.l2; P[q + 9] = s.rr; P[q + 10] = s.aa; P[q + 11] = s.il2; break;
    case 3: P.set(s.c, q); P.set(s.h, q + 3); P[q + 6] = s.rr; P.set(s.R, q + 7); break;
    case 4: P.set(s.c, q); P[q + 3] = s.R0; P[q + 4] = s.r; P.set(s.R, q + 5); break;
    case 5: P.set(s.n, q); P[q + 3] = s.d; break;
  }
}
/** The ops as one program: top-level op i at record i; groups' ops after them. */
export function compile(ops) {
  const flat = [], q = ops.map((o) => ({ o }));
  for (const e of q) flat.push(e);
  for (let i = 0; i < flat.length; i++) { const s = flat[i].o.s; if (s.t === 6) { flat[i].start = flat.length; flat[i].count = s.ops.length; for (const c of s.ops) flat.push({ o: c }); } }
  const P = new Float64Array(flat.length * REC);
  flat.forEach((e, i) => { write(P, i * REC, e.o); if (e.o.s.t === 6) { P[i * REC + 9] = e.start; P[i * REC + 10] = e.count; } });
  return P;
}

/** How far (x, y, z) is from the solid of record r. */
function distR(P, r, x, y, z) {
  const q = r + 9;
  switch (P[r + 1]) {
    case 0: { const dx = x - P[q], dy = y - P[q + 1], dz = z - P[q + 2]; return Math.sqrt(dx * dx + dy * dy + dz * dz) - P[q + 3]; }
    case 1: {
      const dx = x - P[q], dy = y - P[q + 1], dz = z - P[q + 2];
      const u = (P[q + 6] * dx + P[q + 7] * dy + P[q + 8] * dz) / P[q + 3], v = (P[q + 9] * dx + P[q + 10] * dy + P[q + 11] * dz) / P[q + 4], w = (P[q + 12] * dx + P[q + 13] * dy + P[q + 14] * dz) / P[q + 5];
      const u2 = u / P[q + 3], v2 = v / P[q + 4], w2 = w / P[q + 5], k0 = Math.sqrt(u * u + v * v + w * w), k1 = Math.sqrt(u2 * u2 + v2 * v2 + w2 * w2);
      if (k1 < 1e-12) { const a = P[q + 3] < P[q + 4] ? P[q + 3] : P[q + 4]; return -(a < P[q + 5] ? a : P[q + 5]); }
      return (k0 * (k0 - 1)) / k1;
    }
    case 2: {
      const px = x - P[q], py = y - P[q + 1], pz = z - P[q + 2], bx = P[q + 3], by = P[q + 4], bz = P[q + 5], l2 = P[q + 8], rr = P[q + 9], aa = P[q + 10], il2 = P[q + 11];
      const yy = px * bx + py * by + pz * bz, qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = (yy - l2) * (yy - l2) * l2, k = (rr < 0 ? -1 : 1) * rr * rr * x2;
      if ((yy - l2 < 0 ? -1 : 1) * aa * z2 > k) return Math.sqrt(x2 + z2) * il2 - P[q + 7];
      if ((yy < 0 ? -1 : 1) * aa * y2 < k) return Math.sqrt(x2 + y2) * il2 - P[q + 6];
      return (Math.sqrt(x2 * aa * il2) + yy * rr) * il2 - P[q + 6];
    }
    case 3: {
      const dx = x - P[q], dy = y - P[q + 1], dz = z - P[q + 2];
      let ax = P[q + 7] * dx + P[q + 8] * dy + P[q + 9] * dz, ay = P[q + 10] * dx + P[q + 11] * dy + P[q + 12] * dz, az = P[q + 13] * dx + P[q + 14] * dy + P[q + 15] * dz;
      ax = (ax < 0 ? -ax : ax) - P[q + 3]; ay = (ay < 0 ? -ay : ay) - P[q + 4]; az = (az < 0 ? -az : az) - P[q + 5];
      const mq = ax > ay ? (ax > az ? ax : az) : (ay > az ? ay : az), ox = ax > 0 ? ax : 0, oy = ay > 0 ? ay : 0, oz = az > 0 ? az : 0;
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + (mq < 0 ? mq : 0) - P[q + 6];
    }
    case 4: {
      const dx = x - P[q], dy = y - P[q + 1], dz = z - P[q + 2];
      const u = P[q + 5] * dx + P[q + 6] * dy + P[q + 7] * dz, v = P[q + 8] * dx + P[q + 9] * dy + P[q + 10] * dz, w = P[q + 11] * dx + P[q + 12] * dy + P[q + 13] * dz;
      const t = Math.sqrt(u * u + w * w) - P[q + 3]; return Math.sqrt(t * t + v * v) - P[q + 4];
    }
    case 5: return P[q] * x + P[q + 1] * y + P[q + 2] * z + P[q + 3];
    case 6: { let f = 1e9; const a = P[q], n = P[q + 1]; for (let i = 0; i < n; i++) f = step(P, (a + i) * REC, f, x, y, z); return f; }
  }
  return 1e9;
}
// one op on the value so far (a solid whose box lies further than the op can reach is not measured)
function step(P, r, f, x, y, z) {
  const op = P[r], k = P[r + 2];
  if (op !== 2) {
    const dx = P[r + 3] - x > 0 ? P[r + 3] - x : x - P[r + 6] > 0 ? x - P[r + 6] : 0, dy = P[r + 4] - y > 0 ? P[r + 4] - y : y - P[r + 7] > 0 ? y - P[r + 7] : 0, dz = P[r + 5] - z > 0 ? P[r + 5] - z : z - P[r + 8] > 0 ? z - P[r + 8] : 0;
    const db2 = dx * dx + dy * dy + dz * dz, lim = op === 0 ? f + k : k - f;
    if (lim > 0 ? db2 >= lim * lim : db2 > 0) return f;
  }
  const d = distR(P, r, x, y, z);
  return op === 0 ? smin(f, d, k) : op === 1 ? smax(f, -d, k) : smax(f, d, k);
}
/** The field at a point from the top-level ops listed (their record indices). */
function evalList(P, list, x, y, z) { let f = 1e9; for (let i = 0; i < list.length; i++) f = step(P, list[i] * REC, f, x, y, z); return f; }

/** How far (x, y, z) is from solid s's surface (a solid not compiled: slower, for a few points). */
export function dist(s, x, y, z) { const P = new Float64Array(compile([{ op: 'add', k: 0, s }])); return distR(P, 0, x, y, z); }

// ── the field ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** The field of ops; f(x, y, z) and, for a block, only the ops that can reach it (as lists of their indices). */
export function fieldOf(ops) {
  const P = compile(ops), all = ops.map((_, i) => i);
  const reach = (i, lo, hi, band) => { const r = i * REC, e = P[r + 2] + band; for (let a = 0; a < 3; a++) if (P[r + 3 + a] - e > hi[a] || P[r + 6 + a] + e < lo[a]) return false; return true; };
  const cull = (list, lo, hi, band) => { const out = []; for (const i of list) { if (reach(i, lo, hi, band)) out.push(i); else if (P[i * REC] === 2) return []; } return out; };
  // the ops near each 3 cm cell of space, for the points of a surface (made when first asked)
  const G = 0.03, grid = new Map();
  const nearPoint = (x, y, z) => {
    const i = Math.floor(x / G), j = Math.floor(y / G), k = Math.floor(z / G), key = i + 1000 * (j + 1000 * k);
    let l = grid.get(key); if (!l) { l = cull(all, [i * G, j * G, k * G], [(i + 1) * G, (j + 1) * G, (k + 1) * G], 0.012); grid.set(key, l); }
    return l;
  };
  return {
    ops, P, all, cull, nearPoint,
    f: (x, y, z) => evalList(P, nearPoint(x, y, z), x, y, z),
    ev: (list, x, y, z) => evalList(P, list, x, y, z),
    /** op i's own distance at a point */
    d: (i, x, y, z) => distR(P, i * REC, x, y, z),
    /** the ops that matter in the box lo … hi for points within `band` of the surface */
    near: (lo, hi, band) => cull(all, lo, hi, band),
  };
}

/** The field's slope at a point (from four samples round it, e apart), over the listed ops. */
export function slope(field, list, x, y, z, e = 2e-4) { return slope4(field, list, x, y, z, e); }

// ── the surface (surface nets) ──────────────────────────────────────────────────────────────────────────────────────
/** The field's slope at a point from four samples round it (a tetrahedron, Quilez), e apart. */
export function slope4(field, list, x, y, z, e = 2e-4) {
  const P = field.P, a = evalList(P, list, x + e, y - e, z - e), b = evalList(P, list, x - e, y - e, z + e), c = evalList(P, list, x - e, y + e, z - e), d = evalList(P, list, x + e, y + e, z + e);
  return [(a - b - c + d) / (4 * e), (-a - b + c + d) / (4 * e), (-a + b - c + d) / (4 * e)];
}

/**
 * The surface of `field` inside the box `lo … hi`, a cell `h` metres a side.
 * cuts: [{ kind: 'plane', at, n, r } | { kind: 'ball', at, r, side }], what of the surface the region keeps: for a plane,
 *   the side its n points away from, within r of its point; for a ball, inside it (side: 1) or outside (side -1).
 * Returns { pos: number[], tri: number[], rims: [{ cut, loop: vertex indices }] } (pos 3 a point, tri 3 a triangle,
 * each wound outwards).
 *
 * The box is split into blocks (each with the ops that reach it) and each block halved again and again, a part kept only
 * where the surface can pass through it (the field at its middle no further than its half diagonal): only the cells
 * the surface crosses, and a few round them, are ever sampled.
 */
export function meshOf(field, { lo, hi, h, cuts = [], keep = null }) {
  const n = [0, 1, 2].map((i) => Math.max(1, Math.ceil((hi[i] - lo[i]) / h)));
  const NX = n[0] + 2, NY = n[1] + 2, gid = (i, j, k) => i + NX * (j + NY * k);
  const vals = new Map(), cells = [], SAFE = 1.6;
  const B = Math.max(4, Math.min(32, 2 ** Math.round(Math.log2(0.03 / h))));   // a block's cells along an edge (a power of two)
  const Pg = field.P, value = (ops, i, j, k) => { const id = gid(i, j, k); let v = vals.get(id); if (v === undefined) { v = evalList(Pg, ops, lo[0] + i * h, lo[1] + j * h, lo[2] + k * h); vals.set(id, v); } return v; };
  const visit = (ops, i, j, k, size) => {
    const c = [lo[0] + (i + size / 2) * h, lo[1] + (j + size / 2) * h, lo[2] + (k + size / 2) * h];
    const f = evalList(Pg, ops, c[0], c[1], c[2]);
    if (Math.abs(f) > (size * h * Math.sqrt(3)) / 2 * SAFE + h * 0.5) return;
    if (size === 1) { if (i < n[0] && j < n[1] && k < n[2]) cells.push(i, j, k, ops); return; }
    const s2 = size / 2;
    for (let q = 0; q < 8; q++) {
      const ci = i + (q & 1) * s2, cj = j + ((q >> 1) & 1) * s2, ck = k + ((q >> 2) & 1) * s2;
      let sub = ops;
      if (ops.length > 4) {   // the ops that reach this smaller part (a few cells' slack, for the slopes taken in it)
        const c0 = [lo[0] + ci * h, lo[1] + cj * h, lo[2] + ck * h], c1 = [c0[0] + s2 * h, c0[1] + s2 * h, c0[2] + s2 * h];
        sub = field.cull(ops, c0, c1, h * 2);
      }
      visit(sub, ci, cj, ck, s2);
    }
  };
  for (let bk = 0; bk < n[2]; bk += B) for (let bj = 0; bj < n[1]; bj += B) for (let bi = 0; bi < n[0]; bi += B) {
    const b0 = [lo[0] + bi * h, lo[1] + bj * h, lo[2] + bk * h], b1 = [b0[0] + B * h, b0[1] + B * h, b0[2] + B * h];
    const ops = field.near(b0, b1, h * 2);
    if (ops.length) visit(ops, bi, bj, bk, B);
  }
  // a point in every cell the surface crosses: where its edges cross, averaged, then set onto the surface
  const pos = [], tri = [], at = new Map();
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const c = new Float64Array(8);
  for (let q = 0; q < cells.length; q += 4) {
    const i = cells[q], j = cells[q + 1], k = cells[q + 2], ops = cells[q + 3];
    let inside = 0;
    for (let r = 0; r < 8; r++) { c[r] = value(ops, i + (r & 1), j + ((r >> 1) & 1), k + ((r >> 2) & 1)); if (c[r] < 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    let px = 0, py = 0, pz = 0, m = 0;
    for (const [a, b] of E) {
      if ((c[a] < 0) === (c[b] < 0)) continue;
      const t = c[a] / (c[a] - c[b]);
      px += (a & 1) + (((b & 1) - (a & 1)) * t); py += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t); pz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t); m++;
    }
    let x = lo[0] + (i + px / m) * h, y = lo[1] + (j + py / m) * h, z = lo[2] + (k + pz / m) * h;
    // onto the surface: one step along the slope, no further than half a cell
    const f = evalList(Pg, ops, x, y, z), g = slope4(field, ops, x, y, z, h * 0.2), gg = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    if (gg > 1e-8) { let s = f / gg; const step = Math.abs(s) * Math.sqrt(gg); if (step > h * 0.5) s *= (h * 0.5) / step; x -= g[0] * s; y -= g[1] * s; z -= g[2] * s; }
    if (keep && !keep(x, y, z)) continue;
    at.set(gid(i, j, k), pos.length / 3); pos.push(x, y, z);
  }
  // a quad round every grid edge the surface crosses, between the four cells that share it
  const P = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], d2 = (u, w) => (u[0] - w[0]) ** 2 + (u[1] - w[1]) ** 2 + (u[2] - w[2]) ** 2;
  const quad = (a, b, cc, d, flip) => {
    if (a === undefined || b === undefined || cc === undefined || d === undefined) return;
    if (d2(P(a), P(cc)) <= d2(P(b), P(d))) { if (flip) tri.push(a, cc, b, a, d, cc); else tri.push(a, b, cc, a, cc, d); }
    else { if (flip) tri.push(a, d, b, b, d, cc); else tri.push(a, b, d, b, cc, d); }
  };
  for (const [id] of at) {
    const i = id % NX, j = Math.floor(id / NX) % NY, k = Math.floor(id / (NX * NY));
    const v0 = vals.get(gid(i, j, k)); if (v0 === undefined) continue;
    const g = (a, b, cc) => at.get(gid(a, b, cc));
    const vx = vals.get(gid(i + 1, j, k)), vy = vals.get(gid(i, j + 1, k)), vz = vals.get(gid(i, j, k + 1));
    if (vx !== undefined && (v0 < 0) !== (vx < 0) && j > 0 && k > 0) quad(g(i, j, k), g(i, j - 1, k), g(i, j - 1, k - 1), g(i, j, k - 1), v0 < 0);
    if (vy !== undefined && (v0 < 0) !== (vy < 0) && i > 0 && k > 0) quad(g(i, j, k), g(i, j, k - 1), g(i - 1, j, k - 1), g(i - 1, j, k), v0 < 0);
    if (vz !== undefined && (v0 < 0) !== (vz < 0) && i > 0 && j > 0) quad(g(i, j, k), g(i - 1, j, k), g(i - 1, j - 1, k), g(i, j - 1, k), v0 < 0);
  }
  const out = { pos, tri, rims: [], samples: vals.size };
  for (const cut of cuts) clip(out, cut, field);
  return out;
}

// ── cuts: what of a surface a region keeps, and its rim where it was cut ─────────────────────────────────────────────
// side(p) > 0: kept. A plane keeps what lies against its normal (within r of its point); a ball keeps its inside
// (side 1) or outside (side -1).
const sideOf = (cut) => cut.kind === 'plane'
  ? (x, y, z) => { const dx = x - cut.at[0], dy = y - cut.at[1], dz = z - cut.at[2]; if (dx * dx + dy * dy + dz * dz > cut.r * cut.r) return 1; return -(dx * cut.n[0] + dy * cut.n[1] + dz * cut.n[2]); }
  : (x, y, z) => cut.side * (cut.r - Math.hypot(x - cut.at[0], y - cut.at[1], z - cut.at[2]));

function clip(m, cut, field) {
  const s = sideOf(cut), P = m.pos, T = m.tri, sv = [];
  for (let i = 0; i < P.length / 3; i++) { let v = s(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (Math.abs(v) < 1e-7) v = 1e-7; sv.push(v); }
  const cutAt = new Map(), rim = new Set();
  const mid = (a, b) => {   // the point on edge a-b where the cut crosses it, made once, set onto the surface and the cut
    const key = a < b ? a * 1e7 + b : b * 1e7 + a; if (cutAt.has(key)) return cutAt.get(key);
    const t = sv[a] / (sv[a] - sv[b]); let p = [0, 1, 2].map((i) => P[a * 3 + i] + (P[b * 3 + i] - P[a * 3 + i]) * t);
    p = onRim(field, cut, p);
    const id = P.length / 3; P.push(...p); sv.push(0); cutAt.set(key, id); rim.add(id); return id;
  };
  const out = [];
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t], T[t + 1], T[t + 2]], k = v.map((i) => sv[i] > 0);
    const nk = k.filter(Boolean).length;
    if (nk === 3) { out.push(...v); continue; }
    if (nk === 0) continue;
    // rotate so that the odd one out is first
    let r = 0; for (let q = 0; q < 3; q++) if ((nk === 1 && k[q]) || (nk === 2 && !k[q])) r = q;
    const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3], ab = mid(a, b), ac = mid(a, c);
    if (nk === 1) out.push(a, ab, ac);           // a kept: a small triangle
    else out.push(ab, b, c, ab, c, ac);          // a lost: the quad b c ac ab
  }
  m.tri = out;
  // the rim: its points in the order they run round (by the edges of the kept triangles that lie on the cut)
  const next = new Map();
  for (let t = 0; t < out.length; t += 3) for (let q = 0; q < 3; q++) { const a = out[t + q], b = out[t + (q + 1) % 3]; if (rim.has(a) && rim.has(b)) next.set(a, b); }
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = []; let v = start;
    while (v != null && !seen.has(v)) { seen.add(v); loop.push(v); v = next.get(v); }
    if (loop.length > 2) m.rims.push({ cut, loop });
  }
}

/** A point near the cut, set onto both the surface and the cut. */
function onRim(field, cut, p) {
  let [x, y, z] = p;
  for (let it = 0; it < 6; it++) {
    const list = field.nearPoint(x, y, z), f = field.ev(list, x, y, z), g = slope4(field, list, x, y, z);
    let n;   // the cut's normal here
    if (cut.kind === 'plane') n = cut.n; else { const d = [x - cut.at[0], y - cut.at[1], z - cut.at[2]], l = Math.hypot(...d) || 1; n = d.map((v) => v / l); }
    const gn = g[0] * n[0] + g[1] * n[1] + g[2] * n[2], t = [g[0] - n[0] * gn, g[1] - n[1] * gn, g[2] - n[2] * gn], tt = t[0] * t[0] + t[1] * t[1] + t[2] * t[2];
    if (tt < 1e-10) break;
    const s = f / tt; x -= t[0] * s; y -= t[1] * s; z -= t[2] * s;
    if (cut.kind === 'plane') { const e = (x - cut.at[0]) * n[0] + (y - cut.at[1]) * n[1] + (z - cut.at[2]) * n[2]; x -= n[0] * e; y -= n[1] * e; z -= n[2] * e; }
    else { const d = [x - cut.at[0], y - cut.at[1], z - cut.at[2]], l = Math.hypot(...d) || 1; x = cut.at[0] + (d[0] / l) * cut.r; y = cut.at[1] + (d[1] / l) * cut.r; z = cut.at[2] + (d[2] / l) * cut.r; }
    if (Math.abs(f) < 1e-6) break;
  }
  return [x, y, z];
}

// ── joining two regions along a cut they share ───────────────────────────────────────────────────────────────────────
/** Meshes a and b (as meshOf gives them) as one: b's points after a's, and where both were cut by the same cut, the two
    rims stitched with a strip of triangles. axis: for each cut, the way round which its rim runs (its normal for a
    plane, its middle to the region for a ball). Returns { pos, tri }. */
export function zip(a, b) {
  const off = a.pos.length / 3, pos = a.pos.concat(b.pos), tri = a.tri.concat(b.tri.map((v) => v + off));
  const rims = [...a.rims, ...b.rims.map((r) => ({ cut: r.cut, loop: r.loop.map((v) => v + off) }))];
  const done = new Set();
  for (let i = 0; i < rims.length; i++) for (let j = i + 1; j < rims.length; j++) {
    if (done.has(i) || done.has(j) || rims[i].cut.id !== rims[j].cut.id || rims[i].cut.id == null) continue;
    stitch(pos, tri, rims[i], rims[j]); done.add(i); done.add(j);
  }
  return { pos, tri, rims: rims.filter((_, i) => !done.has(i)) };
}

function stitch(pos, tri, A, B) {
  const cut = A.cut, c = cut.at, ax = cut.axis ?? cut.n;
  // a frame on the cut: u, v across the axis; each rim point's angle round it
  const n = ax.map((v) => v / Math.hypot(...ax)), t0 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const dn = t0[0] * n[0] + t0[1] * n[1] + t0[2] * n[2]; let u = [t0[0] - n[0] * dn, t0[1] - n[1] * dn, t0[2] - n[2] * dn]; const ul = Math.hypot(...u); u = u.map((x) => x / ul);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const ang = (i) => { const d = [pos[i * 3] - c[0], pos[i * 3 + 1] - c[1], pos[i * 3 + 2] - c[2]]; return Math.atan2(d[0] * v[0] + d[1] * v[1] + d[2] * v[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]); };
  // each rim as it runs round, rising in angle, starting from its lowest angle
  const order = (loop) => {
    const a = loop.map(ang); let rise = 0; for (let i = 0; i < a.length; i++) { let d = a[(i + 1) % a.length] - a[i]; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; rise += d; }
    let L = rise < 0 ? [...loop].reverse() : [...loop], A2 = L.map(ang); const s = A2.indexOf(Math.min(...A2)); L = L.slice(s).concat(L.slice(0, s));
    return { L, rev: rise < 0 };
  };
  const a = order(A.loop), b = order(B.loop), LA = a.L, base = ang(LA[0]);
  const rel = (i) => { let d = ang(i) - base; while (d < 0) d += 2 * Math.PI; while (d >= 2 * Math.PI) d -= 2 * Math.PI; return d; };
  // B's rim from its first point past A's start, both measured from A's start
  let LB = b.L; { const r = LB.map(rel), s = r.indexOf(Math.min(...r)); LB = LB.slice(s).concat(LB.slice(0, s)); }
  const ua = LA.map(rel).concat([2 * Math.PI]), ub = LB.map(rel).concat([2 * Math.PI]);
  const at = (L, k) => L[k % L.length];
  // A's rim ran round the same way as its own triangles' edges unless it was reversed; the strip's triangles turn the
  // other way round B's kept side, so they are wound as A's edge (A[i] -> A[i+1]) taken backwards
  let i = 0, j = 0; const strip = [];
  while (i < LA.length || j < LB.length) {
    if (j >= LB.length || (i < LA.length && ua[i + 1] <= ub[j + 1])) { strip.push([at(LA, i), at(LA, i + 1), at(LB, j)]); i++; }
    else { strip.push([at(LA, i), at(LB, j + 1), at(LB, j)]); j++; }
  }
  // wound so that A's rim edge in the strip runs against A's own triangles' edge (a's direction tells which)
  for (const [p, q, r] of strip) { if (a.rev) tri.push(p, q, r); else tri.push(p, r, q); }
}
