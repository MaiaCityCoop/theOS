// A solid's vertex as the heap keeps it (src/scatter/heap.js): four numbers of 32 bits, 16 bytes, all it needs to be
// drawn at its level, to turn into the next coarser one, and to be moved by two bones. Packed here (plain JS: in the
// recipes' worker), unpacked on the GPU by src/scatter/solid.js, bit for bit the other way.
//
//   word 0   x (16) | y (16)                     its place in the thing's own frame (its foot at 0, its largest side 1),
//   word 1   z (16) | normal u (9) | v low (7)   16 bits over -1 … 1; its normal, octahedral, 9 bits each way
//   word 2   v high (2) | shade (6) | dx (10) | dy (10) | dz low (4)     how dark it is in its folds; d: the way from it
//   word 3   dz high (6) | coarse normal u (7) | v (7) | bone a (4) | bone b (4) | weight of b (4)
//            to where it lies on the next coarser level's mesh, 10 bits over ± the level's `delta` (ladder.js), and
//            that mesh's normal there; the two bones that move it (of its kind's sixteen) and how much the second does.
//            What stands on no skeleton may keep something else in those twelve bits (a leaf card: where on the card
//            the vertex is: assets/kit/frond.js)
//   still    (a solid that stands on no skeleton, its levels a cluster hierarchy, assets/kit/surface.js: a rock) word 3 is
//            dz high (6) | coarse normal u (9) | v (9) | coarse shade (6) | 2 spare: its normal and its shade on the next
//            coarser level as finely as that level's own, so where the one level gives way to the next they are its, bit for bit
import { held, sn, sc, oct, OCT, unoct } from './pack.js';

/** How many bones a kind's skeleton may have (a vertex names its two in four bits each). */
export const BONES = 16;
/** How many of the vertices packed since the last reset() lay further from their coarser place than their level's
    `delta` holds (their way there was cut short: the ladder's delta is too small for that kind). */
export const cut = { n: 0, most: 0, reset() { this.n = 0; this.most = 0; } };

/** Pack one vertex into out[o … o + 3]: its place, its normal, its shade (0 … 1); its place and normal on the coarser
    mesh (its own again where it has none), D the level's delta; its bones a and b (0 … 15) and b's weight (0 … 1). */
export function packSolid(out, o, x, y, z, nx, ny, nz, shade, tx, ty, tz, tnx, tny, tnz, D, a = 0, b = 0, w = 0, still = null) {
  oct(nx, ny, nz); const NU = sc(OCT[0], 255), NV = sc(OCT[1], 255);
  oct(tnx, tny, tnz); const TU = sc(OCT[0], still ? 255 : 63), TV = sc(OCT[1], still ? 255 : 63);   // (still: its coarse shade, 0 … 1)
  let dx = 511, dy = 511, dz = 511;
  if (D > 0) {
    const ex = (tx - x) / D, ey = (ty - y) / D, ez = (tz - z) / D, far = Math.max(Math.abs(ex), Math.abs(ey), Math.abs(ez));
    if (far > 1.001) { cut.n++; if (far > cut.most) cut.most = far; }
    dx = sc(ex, 511); dy = sc(ey, 511); dz = sc(ez, 511);
  }
  const SH = held(shade * 63, 63), W = held(w * 15, 15);
  out[o] = (sn(x, 65535) | (sn(y, 65535) << 16)) >>> 0;
  out[o + 1] = (sn(z, 65535) | (NU << 16) | ((NV & 0x7f) << 25)) >>> 0;
  out[o + 2] = ((NV >> 7) | (SH << 2) | (dx << 8) | (dy << 18) | ((dz & 0xf) << 28)) >>> 0;
  out[o + 3] = (still != null ? (dz >> 4) | (TU << 6) | (TV << 15) | (held(still * 63, 63) << 24) : (dz >> 4) | (TU << 6) | (TV << 13) | (a << 20) | (b << 24) | (W << 28)) >>> 0;
}

/** A dot: three corners at a thing's middle (what draws it turns it to the eye and takes its colour from its look). */
export function dotMesh() { const verts = new Uint32Array(12); for (let i = 0; i < 3; i++) packSolid(verts, i * 4, 0, 0.4, 0, 0, 1, 0, 0.85, 0, 0.4, 0, 0, 1, 0, 0); return { index: new Uint32Array([0, 1, 2]), verts }; }

/** The same read back in JS (for tests): { p, n, shade, t (its place on the coarser mesh), tn, a, b, w }. */
export function unpackSolid(v, o, D) {
  const un = unoct;
  const p = [(v[o] & 65535) / 65535 * 2 - 1, (v[o] >>> 16) / 65535 * 2 - 1, (v[o + 1] & 65535) / 65535 * 2 - 1];
  const nu = ((v[o + 1] >>> 16) & 511) - 255, nv = (((v[o + 1] >>> 25) | ((v[o + 2] & 3) << 7))) - 255;
  const d = [((v[o + 2] >>> 8) & 1023) - 511, ((v[o + 2] >>> 18) & 1023) - 511, ((v[o + 2] >>> 28) | ((v[o + 3] & 63) << 4)) - 511].map((q) => (q / 511) * D);
  return { p, n: un(nu / 255, nv / 255), shade: ((v[o + 2] >>> 2) & 63) / 63, t: p.map((x, i) => x + d[i]), tn: un((((v[o + 3] >>> 6) & 127) - 63) / 63, (((v[o + 3] >>> 13) & 127) - 63) / 63), a: (v[o + 3] >>> 20) & 15, b: (v[o + 3] >>> 24) & 15, w: (v[o + 3] >>> 28) / 15 };
}
