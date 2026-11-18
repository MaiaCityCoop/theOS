// The regions of a tier's grid (intent 0038, #82 v2): what its packing looks at, chosen before one of its cells is
// visited (the cluster cut of stage 8, one level up: src/scatter/cut.js, assets/kit/clusters.js). A tier's cells are a
// grid; over it lies an implicit quadtree of square regions, a block of BLOCK × BLOCK cells the finest (one workgroup of
// the packing, src/scatter/tier.js), each larger region four of the next. The resident regions (below) are kept from one
// packing to the next. They go to the GPU as entries (i0, j0, w, first): w × w cells from cell (i0, j0), the dispatch's
// invocations from `first` (a multiple of the workgroup) on.
import { BAND } from '../detail/error.js';

export const WG = 64, BLOCK = 8;   // the packing's workgroup, and the finest region: a workgroup's cells, BLOCK × BLOCK

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
  /** cell: metres a cell; fixed: its band is metres, not sizes on screen; room: the most regions it may hold (one that
      would split past it is taken whole: more cells, nothing lost). */
  constructor({ cell, fixed = false, room = Infinity }) {
    this.cell = cell; this.fixed = fixed; this.side = BLOCK * cell; this.room = room;
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
      const fits = !k || S <= Math.max(side, inside < 0 ? pad / EDGE : dn) || leaves.size + 4 > this.room, L = leaves.get(key);
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
