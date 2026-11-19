// A plant as the heap keeps it (src/scatter/heap.js): what the tree kit builds (assets/kit/tree.js: wood as tubes,
// sprigs as crossed cards, a far crown as one body), every vertex packed into two elements of the heap, a third of
// what the kit's own arrays take. Its triangles' corners stay a list of its own: the heap keeps a plant's vertices,
// what draws it keeps its corners as the draw's own index (src/scatter/trees.js), so a vertex shared by several
// triangles is worked out once. Plain JS, no three: packed in the recipes' worker, unpacked on the GPU by
// src/scatter/plantvert.js, bit for bit the other way.
//
// A vertex is two elements of the heap, eight numbers of 32 bits, 32 bytes (the kit's own is 92):
//   0   x (16) | y (16)                  its place, metres in the plant's own frame (its foot at 0), on a fixed grid
//   1   z (16) | normal u (8) | v (8)    (GRID: the same at every level, so a sprig's foot is the same number in
//                                        both of two levels that hand over); the normal it is lit with, octahedral
//   2   u (16) | v (16)                  where on its bark or its sprig's painting, in 1024ths, from -16 to 48 tiles
//   3   ao (8) | part (2) | hand (2) | twig (1) | – | card u (8) | v (8)     the light that reaches it; 0 wood, 1 a
//                                        sprig's card, 2 a crown as one body; how it hands over (from, kept); whether
//                                        its card wears the painting of one twig (its finest level); its card's plane
//   4   root x (16) | y (16)             what it grows from and shrinks to as two levels hand over
//   5   root z (16)
//   6, 7   free
//
//   packPlant(mesh) -> { index: its corners, verts: Uint32Array, count: how many vertices }   what a family hands on
//   plantFamily(id, asset)   a plant asset's shapes as a family of the zoo (assets/zoo/index.js)
import { kindRule, shapesOf, most } from '../kinds.js';
import { held, sn, q16, oct, OCT } from './pack.js';

export const GRID = { xz: 40, y0: -2, y1: 78 }, UVK = 1024, UV0 = 16;   // x and z over -40 … 40 m, y over -2 … 78 m, 16 bits each (1.2 mm); uv in 1024ths, from -16
const gx = (v) => q16(v, -GRID.xz, 2 * GRID.xz), gy = (v) => q16(v, GRID.y0, GRID.y1 - GRID.y0);   // (a place in the grid, 16 bits)
let OU = 0, OV = 0;
const oct8 = (x, y, z) => { oct(x, y, z); OU = sn(OCT[0], 255); OV = sn(OCT[1], 255); };   // (a direction as two numbers of 8 bits)

/** A mesh of the tree kit (as its builder left it, or as typed arrays) as the heap takes it: every vertex packed,
    its triangles' corners as they are. */
export function packPlant(m) {
  const P = m.position, N = m.normal, UV = m.uv, CN = m.cn, RT = m.root, HD = m.hand, n = m.part.length, out = new Uint32Array(n * 8);
  for (let v = 0; v < n; v++) {
    const o = v * 8, p = v * 3;
    out[o] = (gx(P[p]) | (gy(P[p + 1]) << 16)) >>> 0;
    oct8(N[p], N[p + 1], N[p + 2]);
    out[o + 1] = (gx(P[p + 2]) | (OU << 16) | (OV << 24)) >>> 0;
    out[o + 2] = (held((UV[v * 2] + UV0) * UVK, 65535) | (held((UV[v * 2 + 1] + UV0) * UVK, 65535) << 16)) >>> 0;
    oct8(CN[p], CN[p + 1], CN[p + 2]);
    out[o + 3] = (held(m.ao[v] * 255, 255) | ((m.part[v] & 3) << 8) | ((HD[v * 2] > 0.5 ? 1 : 0) << 10) | ((HD[v * 2 + 1] > 0.5 ? 1 : 0) << 11) | ((m.twig?.[v] > 0.5 ? 1 : 0) << 12) | (OU << 16) | (OV << 24)) >>> 0;
    out[o + 4] = (gx(RT[p]) | (gy(RT[p + 1]) << 16)) >>> 0;
    out[o + 5] = gx(RT[p + 2]);
  }
  return { index: Uint32Array.from(m.index), verts: out, count: n };   // (count: its vertices)
}

/** A plant asset's shapes (assets/*.js made by the tree kit's tree()) as a family of the zoo (assets/zoo/index.js):
    `id` its name there. Its kinds are its shapes; its levels the asset's (its file's, then the kit's farthest), and
    after them, where it has one, its shade (what the shadow map is drawn from). The engine that places plants
    (src/scatter/trees.js) finds it by the asset's uid. */
export const plantFamily = (id, asset) => ({
  id, placed: 'trees', asset: asset.uid, count: asset.shapeCount, levels: asset.levelCount + (asset.shadeRaw ? 1 : 0),
  meshOf: (i, l) => packPlant(l < asset.levelCount ? asset.rawAt(l, i) : asset.shadeRaw(i)),
  // what of a shape is solid, and its box (src/world/bodies.js), in metres of its own frame at scale 1: its kind's rule
  // (assets/kinds.js: a tree its trunk, a shrub its leaves) made from what the tree kit measured of it (its height, its
  // trunk where a walker meets it) and its asset's footprint at that height
  boundsOf: (i) => { const d = dimsOf(asset, i), x = Math.max(d.length, d.width) / 2; return { min: [-x, 0, -x], max: [x, d.height, x] }; },
  collidersOf: (i) => shapesOf(kindRule(asset, 'solid'), dimsOf(asset, i)),
});
const dimsOf = (asset, i) => { const H = most(asset.size.height), h = asset.heights?.[i] ?? H, k = h / H; return { height: h, length: most(asset.size.length) * k, width: most(asset.size.width ?? asset.size.length) * k, trunk: asset.trunk?.[i] ?? null }; };
