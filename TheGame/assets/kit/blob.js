// A test asset by its number (the stress stand: src/scatter/stress.js): a shape nobody drew, grown from a seed: a ball
// pulled into lobes, spikes and folds, stretched, tapered and twisted, with a look and a texture of its own. Each kind
// is its own mesh of 50 000 to 200 000 triangles, and that same shape again at every coarser level of the ladder
// (ladder.js), down to a cube and a dot: what a kind brings to be drawn by the heap (src/scatter/heap.js; the contract:
// assets/zoo/index.js). Plain JS, no three: it runs in a worker (src/scatter/recipes.worker.js).
//
// A kit: the families that bring its kinds to the heap are assets/zoo/*.js.
//
//   blobMesh(k, l) -> { index: Uint32Array (3 a triangle), verts: Uint32Array (4 a vertex: solid.js) }
//     level l of the ladder, each vertex with where it lies on level l + 1's mesh (that mesh's normal there too): drawn
//     part way between the two, a level turns into the next with nothing to see when the one takes over from the other
//   ball(n, at, own), onBall(C, …), faceOf(dir): a ball cut as a cube's faces, for any surface (a creature's hull too)
import { LADDER, FULLN, DOTN, trisOf, vertsOf, underOf } from './ladder.js';
import { packSolid, dotMesh } from './solid.js';

export const SEED = 9001;
/** squares along an edge of kind k's full mesh: 65 … 129, so 50 700 … 199 692 triangles */
export const fullOf = (k) => 65 + Math.floor(rnd(k, 1) * 65);

export function hash3(x, y, z, s) {
  let h = Math.imul(x, 0x9E3779B1) ^ Math.imul(y, 0x85EBCA77) ^ Math.imul(z, 0xC2B2AE3D) ^ Math.imul(s, 0x27D4EB2F);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return (h >>> 8) / 16777216;
}
const rnd = (k, i) => hash3(k, i, 0, SEED);
export function noise3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz, s), b = hash3(ix + 1, iy, iz, s), c = hash3(ix, iy + 1, iz, s), d = hash3(ix + 1, iy + 1, iz, s);
  const e = hash3(ix, iy, iz + 1, s), f = hash3(ix + 1, iy, iz + 1, s), g = hash3(ix, iy + 1, iz + 1, s), h = hash3(ix + 1, iy + 1, iz + 1, s);
  const l0 = a + (b - a) * fx, l1 = c + (d - c) * fx, l2 = e + (f - e) * fx, l3 = g + (h - g) * fx, m0 = l0 + (l1 - l0) * fy, m1 = l2 + (l3 - l2) * fy;
  return m0 + (m1 - m0) * fz;
}
const hsv = (h, s, v) => { const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; };

// what a kind is: its numbers, from its seed
const KIND = new Map();
function kindOf(k) {
  let K = KIND.get(k); if (K) return K;
  const r = (i) => rnd(k, i), h1 = r(20), h2 = (h1 + 0.12 + 0.5 * r(21)) % 1;
  K = {
    k, s: SEED + k * 13,
    a1: 0.25 + 0.5 * r(6), f1: 1 + 1.6 * r(7), a2: 0.05 + 0.2 * r(8), f2: 2.5 + 3 * r(9), a3: 0.02 + 0.05 * r(10), f3: 10 + 14 * r(11),
    sp: r(12) > 0.6 ? 0.3 + 0.6 * r(13) : 0, fs: 1.5 + 2 * r(14),
    sx: 0.7 + 0.6 * r(4), sy: 0.45 + 2 * r(3) ** 1.5, sz: 0.7 + 0.6 * r(5),
    tw: r(16) > 0.5 ? (r(15) - 0.5) * 3 : 0, tp: (r(17) - 0.5) * 1.2,
    c1: hsv(h1, 0.45 + 0.5 * r(23), 0.5 + 0.45 * r(24)), c2: hsv(h2, 0.4 + 0.55 * r(25), 0.35 + 0.6 * r(26)),
    box: null,
  };
  KIND.set(k, K);
  return K;
}
// how much of a ripple of frequency f a mesh of n squares an edge can carry: all of it, or none (a coarse level is the
// same shape, smoother: no ripple it cannot draw)
const carry = (n, f) => Math.min(1, Math.max(0, (n / (3.14 * f) - 0.5) * 2));

// a point of kind K's surface, its direction (x, y, z) a unit vector, at level n: out[o … o+2] its place (not yet in its
// own frame), returns how far out it lies (1: the ball's own surface)
function surface(K, n, x, y, z, out, o) {
  const s = K.s;
  let r = 1 + K.a1 * 2 * (noise3(x * K.f1 + 9, y * K.f1, z * K.f1, s) - 0.5) * carry(n, K.f1);
  const w2 = carry(n, K.f2), w3 = carry(n, K.f3), ws = K.sp ? carry(n, K.fs) : 0;
  if (w2) r += K.a2 * 2 * (noise3(x * K.f2, y * K.f2 + 5, z * K.f2, s + 1) - 0.5) * w2;
  if (w3) r += K.a3 * 2 * (noise3(x * K.f3, y * K.f3, z * K.f3 + 3, s + 2) - 0.5) * w3;
  if (ws) r += K.sp * noise3(x * K.fs + 2, y * K.fs + 7, z * K.fs, s + 3) ** 4 * ws;
  const px = x * r * K.sx, py = y * r * K.sy, pz = z * r * K.sz, t = py / K.sy, tap = 1 + K.tp * t * 0.5, a = K.tw * t, c = Math.cos(a), sn = Math.sin(a);
  out[o] = (px * c - pz * sn) * tap; out[o + 1] = py; out[o + 2] = (px * sn + pz * c) * tap;
  return r;
}
// its own frame: its foot at 0, its middle over 0, its largest side 1 (measured on a mesh of 8 squares an edge: every
// level of it lies in the same frame)
function boxOf(K) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], p = [0, 0, 0], n = 8;
  for (let f = 0; f < 6; f++) for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const d = dirOf(f, i, j, n); surface(K, n, d[0], d[1], d[2], p, 0);
    for (let a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; }
  }
  return { x: (lo[0] + hi[0]) / 2, y: lo[1], z: (lo[2] + hi[2]) / 2, k: 1 / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) };
}
/** a coarse body drawn through a round thing's surface looks smaller than it: swollen to cover as much of the screen */
export const SWELL = { 1: 1.24, 2: 1.07, 4: 1.02 };
// kind K's surface at level n, in its own frame: what ball() asks (out: the point; returns its shade, darker in its folds)
const blobAt = (K, n) => {
  const B = (K.box ||= boxOf(K)), sw = SWELL[n] ?? 1, cy = 0.5 / B.k;   // (its frame measured when its first mesh is made, not when it is only looked up)
  return (x, y, z, out, o) => {
    const r = surface(K, n, x, y, z, out, o);
    out[o] = (out[o] - B.x) * sw * B.k; out[o + 1] = ((out[o + 1] - B.y - cy) * sw + cy) * B.k; out[o + 2] = (out[o + 2] - B.z) * sw * B.k;
    return Math.min(1, Math.max(0.5, 0.8 + 0.6 * (r - 1)));
  };
};

// ---- a ball cut as a cube's faces: n squares along an edge, its corners shared between faces ----
// the direction of a cube's lattice point (face f, i and j of n along it), its squares evened out over the ball
const D = [0, 0, 0], Q = 0.7853981634;
function dirOf(f, i, j, n) {
  const u = Math.tan(((2 * i) / n - 1) * Q), v = Math.tan(((2 * j) / n - 1) * Q), a = f >> 1, sg = f & 1 ? -1 : 1;
  D[a] = sg; D[(a + 1) % 3] = u; D[(a + 2) % 3] = v;
  const l = Math.hypot(D[0], D[1], D[2]); D[0] /= l; D[1] /= l; D[2] /= l;
  return D;
}
/** Where on the cube a direction points: [face, i, j] (i, j: 0 … 1 along the face). */
export function faceOf(x, y, z) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z), a = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2, d = [x, y, z], m = Math.abs(d[a]) || 1e-9;
  return [a * 2 + (d[a] < 0 ? 1 : 0), (Math.atan(d[(a + 1) % 3] / m) / Q + 1) / 2, (Math.atan(d[(a + 2) % 3] / m) / Q + 1) / 2];
}
let LATTICE = null;   // (which vertex a cube's lattice point is, kept between meshes)
/** A ball of n squares an edge whose surface is `at(x, y, z, out, o)` (a unit direction to a point, written to out[o … ];
    returns its shade there): { V, pos, nor, shade, index, where (each vertex's face, i, j), at, key }. own: a lattice of
    its own (a mesh another is measured against, kept while that one is made). */
export function ball(n, at, own = false) {
  const V = vertsOf(n), T = trisOf(n), N1 = n + 1, size = N1 * N1 * N1;
  const pos = new Float32Array(V * 3), dir = new Float32Array(V * 3), shade = new Float32Array(V), index = new Uint32Array(T * 3), where = new Uint16Array(V * 3);
  if (!own && (!LATTICE || LATTICE.length < size)) LATTICE = new Int32Array(size);
  const lat = own ? new Int32Array(size) : LATTICE, L = [0, 0, 0];
  const key = (f, i, j) => { const a = f >> 1; L[a] = f & 1 ? 0 : n; L[(a + 1) % 3] = i; L[(a + 2) % 3] = j; return L[0] + N1 * (L[1] + N1 * L[2]); };
  let nv = 0, ni = 0;
  for (let f = 0; f < 6; f++) for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) lat[key(f, i, j)] = -1;   // a face's corners, shared with its neighbours
  const id = (f, i, j) => {
    const q = key(f, i, j); if (lat[q] >= 0) return lat[q];
    const d = dirOf(f, i, j, n); dir[nv * 3] = d[0]; dir[nv * 3 + 1] = d[1]; dir[nv * 3 + 2] = d[2]; shade[nv] = at(d[0], d[1], d[2], pos, nv * 3);
    where[nv * 3] = f; where[nv * 3 + 1] = i; where[nv * 3 + 2] = j;
    return (lat[q] = nv++);
  };
  // wound to face outwards: told on the ball it was pulled from (its three directions), not on the shape: stretching,
  // tapering and twisting keep a face's side, but along a sharp fold the shape's own faces no longer look outwards from
  // its middle, and a triangle told by that was turned the wrong way (a hole to look through)
  const tri = (a, b, c) => {
    const ax = dir[a * 3], ay = dir[a * 3 + 1], az = dir[a * 3 + 2], ux = dir[b * 3] - ax, uy = dir[b * 3 + 1] - ay, uz = dir[b * 3 + 2] - az, vx = dir[c * 3] - ax, vy = dir[c * 3 + 1] - ay, vz = dir[c * 3 + 2] - az;
    const out = (uy * vz - uz * vy) * ax + (uz * vx - ux * vz) * ay + (ux * vy - uy * vx) * az >= 0;
    index[ni++] = a; index[ni++] = out ? b : c; index[ni++] = out ? c : b;
  };
  for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = id(f, i, j), b = id(f, i + 1, j), c = id(f, i + 1, j + 1), d = id(f, i, j + 1);
    tri(a, b, c); tri(a, c, d);
  }
  return { n, V, pos, nor: normalsOf(pos, index, V), shade, index, where, at: lat, key };
}
/** The corners of a ball of n squares an edge (three a triangle, the numbers of its vertices): the same for every ball
    of that n whatever its surface, a triangle's side being told on the ball and not on the shape (above). The level's
    own shape: what has it can be drawn by one list of corners for all (src/scatter/heap.js). */
export const ballCorners = (n) => ball(n, (x, y, z, out, o) => { out[o] = x; out[o + 1] = y; out[o + 2] = z; return 1; }, true).index;
/** Each corner's normal: the mean of its faces'. */
export function normalsOf(pos, index, V) {
  const nor = new Float32Array(V * 3);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    nor[a] += x; nor[a + 1] += y; nor[a + 2] += z; nor[b] += x; nor[b + 1] += y; nor[b + 2] += z; nor[c] += x; nor[c + 1] += y; nor[c + 2] += z;
  }
  for (let o = 0; o < V * 3; o += 3) { const l = Math.hypot(nor[o], nor[o + 1], nor[o + 2]) || 1; nor[o] /= l; nor[o + 1] /= l; nor[o + 2] /= l; }
  return nor;
}
/** The point of ball C's mesh at face f, i and j along it (0 … 1 each): out = [x, y, z, nx, ny, nz, shade]. In which of
    its squares, and of the square's two triangles (cut a to c). */
export function onBall(C, f, fi, fj, out) {
  const m = C.n, u = fi * m, w = fj * m, ci = Math.min(m - 1, Math.max(0, Math.floor(u))), cj = Math.min(m - 1, Math.max(0, Math.floor(w))), s = Math.min(1, Math.max(0, u - ci)), t = Math.min(1, Math.max(0, w - cj));
  const a = C.at[C.key(f, ci, cj)], c = C.at[C.key(f, ci + 1, cj + 1)], e = s >= t ? C.at[C.key(f, ci + 1, cj)] : C.at[C.key(f, ci, cj + 1)];
  const wa = 1 - Math.max(s, t), wc = Math.min(s, t), we = 1 - wa - wc;
  for (let i = 0; i < 3; i++) { out[i] = C.pos[a * 3 + i] * wa + C.pos[c * 3 + i] * wc + C.pos[e * 3 + i] * we; out[3 + i] = C.nor[a * 3 + i] * wa + C.nor[c * 3 + i] * wc + C.nor[e * 3 + i] * we; }
  out[6] = C.shade[a] * wa + C.shade[c] * wc + C.shade[e] * we;
  return out;
}
/** A ball of n squares an edge, packed (solid.js), each vertex with its place on the ball of m squares (m: 0, none):
    `at(n)` the surface at a level. D: the level's delta. */
export function ballMesh(at, n, m, D) {
  const C = m ? ball(m, at(m), true) : null, F = ball(n, at(n)), verts = new Uint32Array(F.V * 4), P = F.pos, N = F.nor, T = [0, 0, 0, 0, 0, 0, 0];
  for (let v = 0; v < F.V; v++) {
    const o = v * 3;
    if (C) onBall(C, F.where[o], F.where[o + 1] / n, F.where[o + 2] / n, T); else { T[0] = P[o]; T[1] = P[o + 1]; T[2] = P[o + 2]; T[3] = N[o]; T[4] = N[o + 1]; T[5] = N[o + 2]; }
    packSolid(verts, v * 4, P[o], P[o + 1], P[o + 2], N[o], N[o + 1], N[o + 2], F.shade[v], T[0], T[1], T[2], T[3], T[4], T[5], C ? D : 0);
  }
  return { index: F.index, verts };
}
/** Kind k's mesh at level l of the ladder. */
export function blobMesh(k, l) {
  const K = kindOf(k), n = LADDER[l].n;
  if (n === DOTN) return dotMesh();
  return ballMesh((q) => blobAt(K, q), n === FULLN ? fullOf(k) : n, underOf(l), LADDER[l].delta);
}

/** What kind k looks like: which shading model (a number 0 … 1: any of those there are, src/shading), its two tints and the mean colour of its own texture (blobSkin: painted
    to that mean, so a thing far off wears it before the texture has come), which of the world's textures it takes its
    relief from (0 … 1: the stand picks from those it has) and how large its textures lie on it (metres a tile), how it
    shines, how far it sways in the wind (0: it stands stiff), how uneven its snow lies (metres), how it glows, how much
    light passes through it. */
export function blobLook(k) {
  const K = kindOf(k), r = (i) => rnd(k, i);
  return { model: r(30), c1: K.c1, c2: K.c2, mean: K.c1.map((c, i) => (c * c + K.c2[i] * K.c2[i]) / 2), relief: r(31), scale: 0.6 + 1.8 * r(33), gloss: r(34), sway: r(35) < 0.4 ? 0 : 0.02 + 0.1 * r(36), snow: 0.02 + 0.1 * r(37), glow: 0.4 + 1.2 * r(38), through: 0.3 + 0.6 * r(39) };
}

// ---- a kind's own texture: a tile nobody painted, of its two tints and a third, one of six patterns; it repeats without
// a seam (its noise is laid on a ring) ----
function tileNoise(x, y, per, s) {   // value noise that repeats every `per` cells
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const w = (v) => ((v % per) + per) % per, a = hash3(w(ix), w(iy), 7, s), b = hash3(w(ix + 1), w(iy), 7, s), c = hash3(w(ix), w(iy + 1), 7, s), d = hash3(w(ix + 1), w(iy + 1), 7, s);
  return a + (b - a) * fx + (c + (d - c) * fx - a - (b - a) * fx) * fy;
}
const fbm = (u, v, per, s) => 0.55 * tileNoise(u * per, v * per, per, s) + 0.3 * tileNoise(u * per * 2, v * per * 2, per * 2, s + 1) + 0.15 * tileNoise(u * per * 4, v * per * 4, per * 4, s + 2);
/** Kind k's own texture, `size` pixels a side: { levels: [Uint8Array (r, g, b, height; colours as their square roots, as
    the world's textures keep them), … down to one pixel], mean: its mean colour [r, g, b] }. */
export function blobSkin(k, size = 128) {
  const K = kindOf(k), r = (i) => rnd(k, i), kind = Math.floor(r(40) * 6), per = 3 + Math.floor(r(41) * 4), s = K.s + 50, c3 = hsv((r(42) + 0.33) % 1, 0.5 + 0.4 * r(43), 0.3 + 0.6 * r(44)), turn = r(45) * 6.2831853, cells = 3 + Math.floor(r(46) * 5);
  const out = new Uint8Array(size * size * 4), mean = [0, 0, 0];
  for (let y = 0, o = 0; y < size; y++) for (let x = 0; x < size; x++, o += 4) {
    const u = x / size, v = y / size, n = fbm(u, v, per, s), m = fbm(u + 0.37, v + 0.61, per, s + 9); let t, acc = 0, h;
    if (kind === 0) { t = 0.5 + 0.5 * Math.sin((n * 3 + u * Math.round(Math.cos(turn) * 3) + v * Math.round(Math.sin(turn) * 3)) * 6.2831853); h = t; }   // marble: bands bent by the noise
    else if (kind === 1) {   // cells: each its own shade, dark seams between
      let d1 = 9, d2 = 9, id = 0; const gx = u * cells, gy = v * cells, cx = Math.floor(gx), cy = Math.floor(gy);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const qx = ((cx + i) % cells + cells) % cells, qy = ((cy + j) % cells + cells) % cells, px = cx + i + hash3(qx, qy, 1, s), py = cy + j + hash3(qx, qy, 2, s), d = Math.hypot(gx - px, gy - py); if (d < d1) { d2 = d1; d1 = d; id = hash3(qx, qy, 3, s); } else if (d < d2) d2 = d; }
      t = id; acc = d2 - d1 < 0.06 ? 1 : 0; h = Math.min(1, (d2 - d1) * 3);
    } else if (kind === 2) { t = Math.abs(((u * cells + n * 0.8) % 1) - 0.5) * 2 > 0.5 ? 1 : 0; h = 0.3 + 0.5 * t + 0.2 * m; }   // stripes, wavering
    else if (kind === 3) { t = n > 0.55 ? 1 : 0; acc = m > 0.68 ? 1 : 0; h = n; }   // spots, and a few of the third colour
    else if (kind === 4) { const gy = v * cells * 2, row = Math.floor(gy), gx = u * cells + (row % 2) * 0.5, fx = gx - Math.floor(gx), fy = gy - row, d = Math.hypot(fx - 0.5, fy - 1); t = hash3(Math.floor(gx) % cells, row % (cells * 2), 4, s); acc = d > 0.62 && fy < 0.5 ? 1 : 0; h = 1 - fy * 0.6; }   // scales in rows
    else { t = Math.min(1, Math.max(0, (n - 0.3) * 2.5)); acc = m > 0.72 ? 0.6 : 0; h = n; }   // clouded
    const g = 0.82 + 0.36 * (m - 0.5);
    for (let c = 0; c < 3; c++) { const col = Math.min(1, Math.max(0, ((K.c1[c] + (K.c2[c] - K.c1[c]) * t) * (1 - acc) + c3[c] * (kind === 1 ? 0.25 : 1) * acc) * g)); out[o + c] = Math.round(col * 255); mean[c] += col * col; }   // (kept as its square root: K's tints are that already)
    out[o + 3] = Math.round(Math.min(1, Math.max(0, h)) * 255);
  }
  // its mean made the one its look says (blobLook: known before it is painted): a thing far off wears that mean, and
  // must not change colour when its texture comes
  for (let c = 0; c < 3; c++) { const want = (K.c1[c] * K.c1[c] + K.c2[c] * K.c2[c]) / 2, g = Math.sqrt(want / Math.max(1e-6, mean[c] / (size * size))); for (let o = c; o < out.length; o += 4) out[o] = Math.min(255, Math.round(out[o] * g)); }
  const levels = [out];
  for (let n = size >> 1; n >= 1; n >>= 1) {   // its smaller copies: four pixels to one
    const a = levels.at(-1), b = new Uint8Array(n * n * 4), w = n * 2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let c = 0; c < 4; c++) b[(y * n + x) * 4 + c] = (a[(y * 2 * w + x * 2) * 4 + c] + a[(y * 2 * w + x * 2 + 1) * 4 + c] + a[((y * 2 + 1) * w + x * 2) * 4 + c] + a[((y * 2 + 1) * w + x * 2 + 1) * 4 + c] + 2) >> 2;
    levels.push(b);
  }
  return { levels };
}
