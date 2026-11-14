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
//   3   ao (8) | part (2) | hand (2) | – | card u (8) | v (8)     the light that reaches it; 0 wood, 1 a sprig's
//                                        card, 2 a crown as one body; how it hands over (from, kept); its card's plane
//   4   root x (16) | y (16)             what it grows from and shrinks to as two levels hand over
//   5   root z (16)
//   6, 7   free
//
//   packPlant(mesh) -> { index: its corners, verts: Uint32Array, count: how many vertices }   what a family hands on
//   plantFamily(id, asset)   a plant asset's shapes as a family of the zoo (assets/zoo/index.js)
export const GRID = { xz: 40, y0: -2, y1: 78 }, UVK = 1024, UV0 = 16;   // x and z over -40 … 40 m, y over -2 … 78 m, 16 bits each (1.2 mm); uv in 1024ths, from -16
const g16 = (v, lo, hi) => Math.max(0, Math.min(65535, Math.round(((v - lo) / (hi - lo)) * 65535)));
let OU = 0, OV = 0;
const oct8 = (x, y, z) => {   // a direction as two numbers of 8 bits (octahedral)
  const l = Math.hypot(x, y, z) || 1, m = (Math.abs(x) + Math.abs(y) + Math.abs(z)) / l || 1; let u = x / l / m, v = y / l / m;
  if (z < 0) { const u0 = u; u = (1 - Math.abs(v)) * (u0 >= 0 ? 1 : -1); v = (1 - Math.abs(u0)) * (v >= 0 ? 1 : -1); }
  OU = Math.max(0, Math.min(255, Math.round((u * 0.5 + 0.5) * 255))); OV = Math.max(0, Math.min(255, Math.round((v * 0.5 + 0.5) * 255)));
};

/** A mesh of the tree kit (as its builder left it, or as typed arrays) as the heap takes it: every vertex packed,
    its triangles' corners as they are. */
export function packPlant(m) {
  const P = m.position, N = m.normal, UV = m.uv, CN = m.cn, RT = m.root, HD = m.hand, n = m.part.length, out = new Uint32Array(n * 8);
  for (let v = 0; v < n; v++) {
    const o = v * 8, p = v * 3;
    out[o] = (g16(P[p], -GRID.xz, GRID.xz) | (g16(P[p + 1], GRID.y0, GRID.y1) << 16)) >>> 0;
    oct8(N[p], N[p + 1], N[p + 2]);
    out[o + 1] = (g16(P[p + 2], -GRID.xz, GRID.xz) | (OU << 16) | (OV << 24)) >>> 0;
    out[o + 2] = (Math.max(0, Math.min(65535, Math.round((UV[v * 2] + UV0) * UVK))) | (Math.max(0, Math.min(65535, Math.round((UV[v * 2 + 1] + UV0) * UVK))) << 16)) >>> 0;
    oct8(CN[p], CN[p + 1], CN[p + 2]);
    out[o + 3] = (Math.max(0, Math.min(255, Math.round(m.ao[v] * 255))) | ((m.part[v] & 3) << 8) | ((HD[v * 2] > 0.5 ? 1 : 0) << 10) | ((HD[v * 2 + 1] > 0.5 ? 1 : 0) << 11) | (OU << 16) | (OV << 24)) >>> 0;
    out[o + 4] = (g16(RT[p], -GRID.xz, GRID.xz) | (g16(RT[p + 1], GRID.y0, GRID.y1) << 16)) >>> 0;
    out[o + 5] = g16(RT[p + 2], -GRID.xz, GRID.xz);
  }
  return { index: Uint32Array.from(m.index), verts: out, count: n };   // (count: its vertices)
}
/** The same read back in JS (for tests): vertex i of packed `verts`: { p, n, uv, ao, part, hand, cn, root }. */
export function unpackPlant(verts, i) {
  const o = i * 8, f = (q, lo, hi) => lo + (q / 65535) * (hi - lo), un = (a, b) => { const u = (a / 255) * 2 - 1, w = (b / 255) * 2 - 1, z = 1 - Math.abs(u) - Math.abs(w), k = Math.max(-z, 0), x = u + (u >= 0 ? -k : k), y = w + (w >= 0 ? -k : k), l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  return {
    p: [f(verts[o] & 65535, -GRID.xz, GRID.xz), f(verts[o] >>> 16, GRID.y0, GRID.y1), f(verts[o + 1] & 65535, -GRID.xz, GRID.xz)], n: un((verts[o + 1] >>> 16) & 255, verts[o + 1] >>> 24),
    uv: [(verts[o + 2] & 65535) / UVK - UV0, (verts[o + 2] >>> 16) / UVK - UV0], ao: (verts[o + 3] & 255) / 255, part: (verts[o + 3] >>> 8) & 3, hand: [(verts[o + 3] >>> 10) & 1, (verts[o + 3] >>> 11) & 1], cn: un((verts[o + 3] >>> 16) & 255, verts[o + 3] >>> 24),
    root: [f(verts[o + 4] & 65535, -GRID.xz, GRID.xz), f(verts[o + 4] >>> 16, GRID.y0, GRID.y1), f(verts[o + 5] & 65535, -GRID.xz, GRID.xz)],
  };
}

/** A plant asset's shapes (assets/*.js made by the tree kit's tree()) as a family of the zoo (assets/zoo/index.js):
    `id` its name there. Its kinds are its shapes; its levels the asset's (its file's, then the kit's farthest), and
    after them, where it has one, its shade (what the shadow map is drawn from). The engine that places plants
    (src/scatter/trees.js) finds it by the asset's uid. */
export const plantFamily = (id, asset) => ({
  id, placed: 'trees', asset: asset.uid, count: asset.shapeCount, levels: asset.levelCount + (asset.shadeRaw ? 1 : 0),
  meshOf: (i, l) => packPlant(l < asset.levelCount ? asset.rawAt(l, i) : asset.shadeRaw(i)),
});
