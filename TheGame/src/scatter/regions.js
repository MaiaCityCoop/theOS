// The region tree (intent 0038, #82 v2): what a tier's packing looks at, chosen before one of its cells is visited
// (the cluster cut of stage 8, one level up: src/scatter/cut.js, assets/kit/clusters.js). A tier's cells are a grid;
// over it lies an implicit quadtree of square regions, a block of BLOCK × BLOCK cells the finest (one workgroup of the
// packing, src/scatter/tier.js), each larger region four of the next. Of every region, its bounds and the largest error
// it can show are known without visiting a cell: where it lies (its square, and the land under it, which is gentle),
// and so how near and how far its things stand from the eye; and its things' sizes on screen there, which say whether
// any of them can be of the tier's level (its band of distances: src/detail/handover.js bandOf, from the dial and the
// live pixel: src/detail/error.js). A region is
//   rejected   where none of its cells can hold a thing of the level (outside the band, outside the view, outside the
//              stand's bounds): none of its cells is visited;
//   accepted   whole, where all of it lies inside: every cell of it is visited, each tested on its own as before;
//   split      into its four, where it lies across an edge, down to a block, which is taken as it is.
// What the eye sees is the view's frustum widened by the margin its cells' own test has (src/scatter/view.js viewBox,
// MARGIN), each region a box: its square grown by its things' reach and the camera's step, from as low to as high as
// the land under it can lie (gentle: as the patches had it) and its things stand. So a tier is packed again only when
// the camera has turned by about a third of that margin, or moved by its step (tier.js run). Nothing is ever left out: a
// tree that would hold more regions than its room takes the rest whole and coarser, and visits more cells for it.
//
// The leaves go to the GPU as entries (i0, j0, w, first): w × w cells from cell (i0, j0), the dispatch's invocations
// from `first` (a multiple of the workgroup) on. Nearest first: what is drawn first stands in front.
export const WG = 64, BLOCK = 8;   // the packing's workgroup, and the finest region: a workgroup's cells, BLOCK × BLOCK

/** The CPU's twin of the view's test on the GPU (src/scatter/view.js inView), for a disc of radius `rad` round (x, z):
    0 none of it can be in view, 2 all of it is, 1 some. M: the eye's view (matrixWorldInverse.elements), K: uViewK's
    three numbers, y0: the ground under the camera; r and high as inView's (a thing's reach, how tall it may stand). The
    test is |v.x| k + v.z < ((far 0.32 + 6 + high) kY + r) kZ at the disc's middle; over the disc its left side changes by
    at most rad kZ and its right by rad 0.32 kY kZ, so the disc is out (or in) by that much less (or more). */
export function coneOf(M, K, y0) {
  const [k, kY, kZ] = K;
  return (x, z, rad, r, high, cx, cz) => {
    const vx = M[0] * x + M[4] * y0 + M[8] * z + M[12], vz = M[2] * x + M[6] * y0 + M[10] * z + M[14];
    const far = Math.hypot(x - cx, z - cz), f = Math.abs(vx) * k + vz - ((far * 0.32 + 6 + high) * kY + r) * kZ, e = rad * kZ * (1 + 0.32 * kY);
    return f - e >= 0 ? 0 : f + e < 0 ? 2 : 1;
  };
}

/** The leaves of a tier's region tree, nearest first, into `out` (4 numbers a leaf: i0, j0, w, first); at most `cap` of
    them. cell: metres a cell; cx, cz: the camera; h0: the ground under it; dy: its height over the ground (distances
    are the eye's: their square less dy's, along the ground); near, far: the band (metres, as the lens sees them);
    bounds: [x0, z0, x1, z1] or null; view: view.js viewBox's test, or null (every region in view); r: how far a
    region's things and the camera's step reach past its square; high: how tall its things stand; land: [lowest,
    highest] the land can lie (src/world/land.js HMIN, HMAX: what the terrain culls by too).
    -> { n: leaves, count: invocations } */
export function regionsOf(out, cap, { cell, cx, cz, dy, near, far, bounds = null, view = null, r = 0, high = 0, land = [-Infinity, Infinity] }) {
  const far2 = far * far - dy * dy, near2 = near * near - dy * dy, side = BLOCK * cell;
  if (!(far2 > 0)) return { n: 0, count: 0 };
  const R = Math.sqrt(far2);
  let K = 0; while (side * 2 ** K < R) K++;   // (the roots as large as the reach: at most three a side)
  const S0 = side * 2 ** K, stack = [], push = (bi, bj, k, nd) => stack.push(bi, bj, k, nd);
  // a region's nearest and farthest square distance along the ground
  const nearOf = (x0, z0, x1, z1) => { const nx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0, nz = cz < z0 ? z0 - cz : cz > z1 ? cz - z1 : 0; return nx * nx + nz * nz; };
  const roots = [];
  for (let j = Math.floor((cz - R) / S0); j <= Math.floor((cz + R) / S0); j++) for (let i = Math.floor((cx - R) / S0); i <= Math.floor((cx + R) / S0); i++) roots.push([i * 2 ** K, j * 2 ** K, nearOf(i * S0, j * S0, (i + 1) * S0, (j + 1) * S0)]);
  roots.sort((a, b) => b[2] - a[2]); for (const [bi, bj, nd] of roots) push(bi, bj, K, nd);   // (the farthest pushed first: the nearest is taken first)
  let n = 0, at = 0;
  const leaf = (bi, bj, k) => { const w = BLOCK * 2 ** k; out[n * 4] = bi * BLOCK; out[n * 4 + 1] = bj * BLOCK; out[n * 4 + 2] = w; out[n * 4 + 3] = at; at += Math.ceil((w * w) / WG) * WG; n++; };
  while (stack.length) {
    const nd = stack.pop(), k = stack.pop(), bj = stack.pop(), bi = stack.pop(), S = side * 2 ** k, x0 = bi * side, z0 = bj * side, x1 = x0 + S, z1 = z0 + S;
    if (nd > far2) continue;   // (all of it farther than the band)
    const fx = Math.max(cx - x0, x1 - cx), fz = Math.max(cz - z0, z1 - cz), fd = fx * fx + fz * fz;
    if (near2 > 0 && fd < near2) continue;   // (all of it nearer)
    let whole = fd <= far2 && nd >= near2;
    if (bounds) { if (x1 <= bounds[0] || x0 >= bounds[2] || z1 <= bounds[1] || z0 >= bounds[3]) continue; whole &&= x0 >= bounds[0] && x1 <= bounds[2] && z0 >= bounds[1] && z1 <= bounds[3]; }
    if (view) { const v = view(x0 - r, x1 + r, land[0] - r, land[1] + high + r, z0 - r, z1 + r); if (!v) continue; whole &&= v === 2; }
    // whole, a block, or no room left to split it (every node still waiting is at least a leaf): taken as it is
    if (whole || !k || n + stack.length / 4 + 4 > cap) { leaf(bi, bj, k); continue; }
    const h = 2 ** (k - 1), kids = [[bi, bj], [bi + h, bj], [bi, bj + h], [bi + h, bj + h]].map(([i, j]) => [i, j, nearOf(i * side, j * side, (i + h) * side, (j + h) * side)]);
    kids.sort((a, b) => b[2] - a[2]); for (const [i, j, d] of kids) push(i, j, k - 1, d);
  }
  return { n, count: at };
}

/** The most leaves a tier's tree can take a frame, from what it may need: the edges of its band and of the view, a block
    wide, at the most pixels the screen can draw (far: the band's reach then); along an edge a block and its three
    siblings at the finest level, and as many again on each side a level up, sixteen a block of edge (measured at the
    bench's six views, with nothing to stop it: at most three times the four of its own), and the interior's leaves,
    two a level of the tree. A tree past it takes what is left whole: more cells, nothing lost. */
export const leavesFor = (cell, far, near = 0) => {
  const side = BLOCK * cell, edge = (2 * Math.PI * (far + near) + 2 * far) / side, levels = Math.max(1, Math.ceil(Math.log2(Math.max(1, (2 * far) / side))));
  return Math.ceil(16 * edge + 8 * levels) + 9;
};
