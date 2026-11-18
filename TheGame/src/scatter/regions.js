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
import { BAND } from '../detail/error.js';

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

// ---- the resident regions (intent 0038, #82 v2): what a tier holds, kept from one packing to the next ----
// What a region holds is found once (its cells visited) and kept while it is still right, whatever the eye looks at:
// nothing here asks the view (the eye's culling does that, a thing at a time, every frame: src/core/occlusion.js). A
// region in the band holds what may be of its tier's level for any camera within its pad of where it was packed: the
// level's band widened by the pad (src/detail/handover.js bandOf, holds(dist, span) with that pad); one wholly outside
// holds nothing of it now, and is packed when the camera has come near enough for some of it to be in. The pad is how far the camera may
// move before that can change: one FADE of the region's distance on a log scale (the band widened by the hand-over's own
// half width: src/detail/error.js), and for a band of metres (not of sizes on screen: the meadow's rings) as far as its
// nearest edge, where that is more. A region is no wider than its distance (a block at least), and one across an edge of
// the band no wider than a quarter of its pad (EDGE), so few of the cells it visits lie outside. A packing visits only
// the regions that are new or whose pad the camera has passed (one that is now too wide for its distance, split; four
// where their parent would do, joined); what has left the band is let go. Each node over regions keeps its slack: how far the camera may move from where it was
// last looked at before any region under it runs out or one outside the band can come in, so a packing looks only where
// something can change.
const GROW = Math.sqrt(BAND) - 1, EDGE = 4, TOP = 24, H = 2 ** 23;   // (TOP: the highest node counted, 2^24 blocks a side: farther than anything is drawn; H: blocks either side of the origin a key holds)
const keyOf = (k, bi, bj) => (k * 2 ** 24 + bi + H) * 2 ** 24 + bj + H;

export class Resident {
  /** cell: metres a cell; fixed: its band is metres, not sizes on screen. */
  constructor({ cell, fixed = false }) {
    this.cell = cell; this.fixed = fixed; this.side = BLOCK * cell;
    this.leaves = new Map();   // key -> { key, k, bi, bj, w (cells a side), at: [x, z, dy] (where it was packed), pad }
    this.under = new Map();    // key -> how many leaves lie under that node (itself not counted)
    this.nodes = new Map();    // key of a node over leaves -> { at, slack }: where it was last looked at, and its slack from there
    this.roots = new Set(); this.K = -1;
  }
  /** Let every leaf go (the world's state, the measure or the lens has changed: everything is packed again). */
  reset() { const out = [...this.leaves.values()]; this.leaves.clear(); this.under.clear(); this.nodes.clear(); this.roots.clear(); this.K = -1; return out; }
  /** The camera now (cx, cz; dy, its height over the ground: distances are the eye's), the band [near, far] (metres, as
      the lens sees them) and the stand's bounds: { pack: the leaves to visit (new, or run out), free: the leaves let go,
      kept: how many keep what they hold }. */
  update({ cx, cz, dy, near, far, bounds = null }) {
    const pack = [], free = [], { side, leaves, under, nodes } = this, out = { pack, free, kept: 0, looked: 0 };
    const R2 = far * far - dy * dy;
    const moved = (at) => Math.hypot(cx - at[0], cz - at[1], dy - at[2]);
    const add = (k, bi, bj, d) => { for (let a = k + 1; a <= TOP; a++) { const key = keyOf(a, Math.floor(bi / 2 ** a) * 2 ** a, Math.floor(bj / 2 ** a) * 2 ** a), n = (under.get(key) || 0) + d; if (n > 0) under.set(key, n); else under.delete(key); } };
    const letGo = (L) => { leaves.delete(L.key); add(L.k, L.bi, L.bj, -1); free.push(L); };
    const below = (k, bi, bj) => {   // (the node's leaf, or every leaf under it, let go)
      const key = keyOf(k, bi, bj), L = leaves.get(key); if (L) { letGo(L); return; }
      if (!(under.get(key) > 0)) return;
      nodes.delete(key);
      const h = 2 ** (k - 1);
      below(k - 1, bi, bj); below(k - 1, bi + h, bj); below(k - 1, bi, bj + h); below(k - 1, bi + h, bj + h);
    };
    const kidsAreLeaves = (k, bi, bj) => { const h = 2 ** (k - 1); for (const [i, j] of [[bi, bj], [bi + h, bj], [bi, bj + h], [bi + h, bj + h]]) { const c = keyOf(k - 1, i, j); if (!leaves.has(c) && under.get(c) > 0) return false; } return true; };
    const leaf = (k, bi, bj, pad, L = null) => {
      if (!L) { L = { key: keyOf(k, bi, bj), k, bi, bj, w: BLOCK * 2 ** k }; leaves.set(L.key, L); add(k, bi, bj, 1); }
      L.at = [cx, cz, dy]; L.pad = pad; pack.push(L); return pad;
    };
    // a node: its slack (Infinity: nothing there can change)
    const visit = (k, bi, bj) => {
      out.looked++;
      const S = side * 2 ** k, x0 = bi * side, z0 = bj * side, x1 = x0 + S, z1 = z0 + S, key = keyOf(k, bi, bj);
      if (bounds && (x1 <= bounds[0] || x0 >= bounds[2] || z1 <= bounds[1] || z0 >= bounds[3])) { below(k, bi, bj); return Infinity; }   // (outside the stand: for good)
      const nx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0, nz = cz < z0 ? z0 - cz : cz > z1 ? cz - z1 : 0, fx = Math.max(cx - x0, x1 - cx), fz = Math.max(cz - z0, z1 - cz);
      const dn = Math.sqrt(nx * nx + nz * nz + dy * dy), df = Math.sqrt(fx * fx + fz * fz + dy * dy), inside = dn >= near && df <= far ? Math.min(dn - near, far - df) : -1;
      const pad = this.fixed && inside >= 0 ? Math.max(GROW * dn, inside) : GROW * dn;
      // (wholly outside the band: nothing of it can be in it now. Let go; its slack, how far the camera may move before
      // some of it can come in)
      if (dn > far) { below(k, bi, bj); return dn - far; }
      if (df < near) { below(k, bi, bj); return near - df; }
      const fits = !k || S <= Math.max(side, inside < 0 ? pad / EDGE : dn), L = leaves.get(key);
      if (L) {
        const m = moved(L.at);
        if (m <= L.pad) { out.kept++; return L.pad - m; }
        if (fits) return leaf(k, bi, bj, pad, L);
        letGo(L);
      } else if (under.get(key) > 0) {
        const N = nodes.get(key), m = N ? moved(N.at) : Infinity;
        if (m <= N?.slack) { out.kept += under.get(key); return N.slack - m; }   // (nothing under it can have changed)
        if (fits && under.get(key) <= 4 && kidsAreLeaves(k, bi, bj)) { below(k, bi, bj); return leaf(k, bi, bj, pad); }   // (four leaves where one would do, one run out: packed again as one)
      } else if (fits) return leaf(k, bi, bj, pad);
      const h = 2 ** (k - 1), slack = Math.min(visit(k - 1, bi, bj), visit(k - 1, bi + h, bj), visit(k - 1, bi, bj + h), visit(k - 1, bi + h, bj + h));
      if (under.get(key) > 0) nodes.set(key, { at: [cx, cz, dy], slack }); else nodes.delete(key);
      return slack;
    };
    const roots = new Set();
    if (R2 > 0) {
      const R = Math.sqrt(R2); let K = 0; while (side * 2 ** K < R) K++;
      if (K !== this.K) { for (const L of this.reset()) free.push(L); this.K = K; }   // (the roots another size: the measure moved a long way)
      const S0 = side * 2 ** K;
      for (let j = Math.floor((cz - R) / S0); j <= Math.floor((cz + R) / S0); j++) for (let i = Math.floor((cx - R) / S0); i <= Math.floor((cx + R) / S0); i++) { roots.add(keyOf(K, i * 2 ** K, j * 2 ** K)); visit(K, i * 2 ** K, j * 2 ** K); }
    }
    // (a root the camera has left: all under it let go)
    for (const r of this.roots) if (!roots.has(r)) { const k = Math.floor(r / 2 ** 48), bi = Math.floor(r / 2 ** 24) % 2 ** 24 - H, bj = (r % 2 ** 24) - H; below(k, bi, bj); }
    this.roots = roots;
    return out;
  }
}
