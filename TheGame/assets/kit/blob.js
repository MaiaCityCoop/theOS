// A test asset by its number (the stress stand: src/scatter/stress.js): a shape nobody drew, grown from a seed: a ball
// pulled into lobes, spikes and folds, stretched, tapered and twisted, in two colours of its own. Each kind is its own
// mesh of 50 000 to 200 000 triangles, and that same shape again at every coarser level of the ladder, down to a
// tetrahedron: what any asset must bring to be drawn by the heap (src/scatter/heap.js). Plain JS, no three: it runs in a
// worker (src/scatter/blob.worker.js).
//
//   blobMesh(k, n) -> { index: Uint32Array (3 a triangle), verts: Uint32Array (4 a vertex) }
//     n: the squares along a cube's edge the ball is cut into (12 n² triangles); 0: a tetrahedron
//        -2: its dot, one triangle in its mean colour (what draws it turns it to the eye: src/scatter/stress.js)
//     a vertex, packed: [x | y << 16], [z], [normal, octahedral: u | v << 16], [r | g << 8 | b << 16]; its place in its
//     own frame (its foot at 0, its largest side 1) as 16 bits over -1 … 1

export const SEED = 9001;
/** squares along an edge of kind k's full mesh: 65 … 129, so 50 700 … 199 692 triangles */
export const fullOf = (k) => 65 + Math.floor(rnd(k, 1) * 65);
/** triangles and vertices of a level */
export const trisOf = (n) => (n > 0 ? 12 * n * n : n ? 1 : 4), vertsOf = (n) => (n > 0 ? 6 * n * n + 2 : n ? 3 : 4);   // (n < 0: its dot, one triangle)

function hash3(x, y, z, s) {
  let h = Math.imul(x, 0x9E3779B1) ^ Math.imul(y, 0x85EBCA77) ^ Math.imul(z, 0xC2B2AE3D) ^ Math.imul(s, 0x27D4EB2F);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return (h >>> 8) / 16777216;
}
const rnd = (k, i) => hash3(k, i, 0, SEED);
function noise3(x, y, z, s) {
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
    c1: hsv(h1, 0.45 + 0.5 * r(23), 0.5 + 0.45 * r(24)), c2: hsv(h2, 0.4 + 0.55 * r(25), 0.35 + 0.6 * r(26)), fc: 1.5 + 6 * r(22), stripes: r(27) > 0.7 ? 4 + 10 * r(28) : 0,
    box: null,
  };
  KIND.set(k, K);
  K.box = boxOf(K);
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
// the direction of a cube's lattice point (face f, i and j of n along it), its squares evened out over the ball
const D = [0, 0, 0];
function dirOf(f, i, j, n) {
  const u = Math.tan(((2 * i) / n - 1) * 0.7853981634), v = Math.tan(((2 * j) / n - 1) * 0.7853981634), a = f >> 1, sg = f & 1 ? -1 : 1;
  D[a] = sg; D[(a + 1) % 3] = u; D[(a + 2) % 3] = v;
  const l = Math.hypot(D[0], D[1], D[2]); D[0] /= l; D[1] /= l; D[2] /= l;
  return D;
}
const TETRA = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((v) => v.map((x) => x / Math.sqrt(3)));
// a coarse body drawn through a round thing's surface looks smaller than it: swollen to cover as much of the screen
const SWELL = { 0: 1.6, 1: 1.24, 2: 1.07, 4: 1.02 };

let LATTICE = null;   // (which vertex a cube's lattice point is, kept between meshes)
/** Kind k's mesh at level n. */
export function blobMesh(k, n) {
  if (n < 0) {   // its dot: three corners in the mean of its two colours
    const K = kindOf(k), b8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255))), c = [0, 1, 2].map((i) => b8(((K.c1[i] + K.c2[i]) / 2) * 0.85)), verts = new Uint32Array(12);
    for (let i = 0; i < 3; i++) { verts[i * 4] = 32768 | (45875 << 16); verts[i * 4 + 1] = 32768; verts[i * 4 + 2] = 32768 | (65535 << 16); verts[i * 4 + 3] = c[0] | (c[1] << 8) | (c[2] << 16); }
    return { index: new Uint32Array([0, 1, 2]), verts };
  }
  const K = kindOf(k), V = vertsOf(n), T = trisOf(n), N1 = n + 1;
  const pos = new Float32Array(V * 3), dir = new Float32Array(V * 3), rad = new Float32Array(V), index = new Uint32Array(T * 3);
  let nv = 0, ni = 0;
  const add = (d) => { dir[nv * 3] = d[0]; dir[nv * 3 + 1] = d[1]; dir[nv * 3 + 2] = d[2]; rad[nv] = surface(K, n || 0.7, d[0], d[1], d[2], pos, nv * 3); return nv++; };
  const tri = (a, b, c) => {   // wound to face outwards
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2], ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az, vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const out = (uy * vz - uz * vy) * dir[a * 3] + (uz * vx - ux * vz) * dir[a * 3 + 1] + (ux * vy - uy * vx) * dir[a * 3 + 2] >= 0;
    index[ni++] = a; index[ni++] = out ? b : c; index[ni++] = out ? c : b;
  };
  if (!n) { for (const d of TETRA) add(d); tri(0, 1, 2); tri(0, 2, 3); tri(0, 3, 1); tri(1, 3, 2); }
  else {
    const size = N1 * N1 * N1; if (!LATTICE || LATTICE.length < size) LATTICE = new Int32Array(size);
    const at = LATTICE, L = [0, 0, 0];
    for (let f = 0; f < 6; f++) for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {   // a face's corners, shared with its neighbours
      const a = f >> 1; L[a] = f & 1 ? 0 : n; L[(a + 1) % 3] = i; L[(a + 2) % 3] = j;
      at[L[0] + N1 * (L[1] + N1 * L[2])] = -1;
    }
    const id = (f, i, j) => {
      const a = f >> 1; L[a] = f & 1 ? 0 : n; L[(a + 1) % 3] = i; L[(a + 2) % 3] = j;
      const key = L[0] + N1 * (L[1] + N1 * L[2]);
      return at[key] >= 0 ? at[key] : (at[key] = add(dirOf(f, i, j, n)));
    };
    for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = id(f, i, j), b = id(f, i + 1, j), c = id(f, i + 1, j + 1), d = id(f, i, j + 1);
      tri(a, b, c); tri(a, c, d);
    }
  }
  // into its own frame
  const B = K.box, sw = SWELL[n] ?? 1, cy = 0.5 / B.k;
  for (let i = 0; i < V; i++) {
    const o = i * 3;
    pos[o] = (pos[o] - B.x) * sw * B.k; pos[o + 1] = ((pos[o + 1] - B.y - cy) * sw + cy) * B.k; pos[o + 2] = (pos[o + 2] - B.z) * sw * B.k;
  }
  // its normals: each corner the mean of its faces'
  const nor = new Float32Array(V * 3);
  for (let t = 0; t < ni; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    nor[a] += x; nor[a + 1] += y; nor[a + 2] += z; nor[b] += x; nor[b + 1] += y; nor[b + 2] += z; nor[c] += x; nor[c + 1] += y; nor[c + 2] += z;
  }
  // packed
  const verts = new Uint32Array(V * 4), q = (v) => Math.max(0, Math.min(65535, Math.round((v * 0.5 + 0.5) * 65535))), wc = carry(n || 0.7, K.fc), b8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < V; i++) {
    const o = i * 3; let x = nor[o], y = nor[o + 1], z = nor[o + 2]; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
    const m = Math.abs(x) + Math.abs(y) + Math.abs(z); let u = x / m, v = y / m;   // octahedral
    if (z < 0) { const u0 = u; u = (1 - Math.abs(v)) * (u0 >= 0 ? 1 : -1); v = (1 - Math.abs(u0)) * (v >= 0 ? 1 : -1); }
    // its colour: its two, in patches (or bands up it), darker in its folds; a level too coarse for the patches wears their mean
    const dx = dir[o], dy = dir[o + 1], dz = dir[o + 2];
    let t = K.stripes ? 0.5 + 0.5 * Math.sin(dy * K.stripes + noise3(dx * 2, dy * 2, dz * 2, K.s + 5) * 3) : noise3(dx * K.fc, dy * K.fc + 1, dz * K.fc, K.s + 4);
    t = Math.min(1, Math.max(0, (t - 0.42) / 0.16)); t = 0.5 + (t * t * (3 - 2 * t) - 0.5) * (K.stripes ? carry(n || 0.7, K.stripes / 3) : wc);
    const sh = Math.min(1.1, Math.max(0.55, 0.8 + 0.6 * (rad[i] - 1)));
    const j = i * 4;
    verts[j] = q(pos[o]) | (q(pos[o + 1]) << 16); verts[j + 1] = q(pos[o + 2]); verts[j + 2] = q(u) | (q(v) << 16);
    verts[j + 3] = b8((K.c1[0] + (K.c2[0] - K.c1[0]) * t) * sh) | (b8((K.c1[1] + (K.c2[1] - K.c1[1]) * t) * sh) << 8) | (b8((K.c1[2] + (K.c2[2] - K.c1[2]) * t) * sh) << 16);
  }
  return { index, verts };
}
