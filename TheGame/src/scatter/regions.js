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
// region in the band holds what may be of its tier's level a while: for a band of sizes on screen (the plants' levels,
// the rocks), the level's band widened by one FADE on a log scale either way (the hand-over's own half width:
// src/detail/error.js), so the camera may move a share of the region's distance, and the measure change (the window,
// the governor's ratio, the dial) by as much, before what it holds is not all there (MARGIN, a tier's found() widens by
// it); for a band of metres (the meadow's rings), the band widened by its pad, as far as the region's nearest edge or a
// FADE of its distance, whichever is more, and its edges' moves use that up as the camera's way does. One wholly outside
// the band holds nothing of it now, and is packed when the camera has come near enough for some of it to be in. A
// region is no wider than its distance (a block at least), and one across an edge of the band no wider than a quarter
// of its pad (EDGE), so few of the cells it visits lie outside. A packing visits only the regions new or run out (one
// now too wide for its distance, split; four where their parent would do, joined); what has left the band is let go.
// Each node over regions keeps its slack: how far the camera may move from where it was last looked at before any region
// under it runs out or one outside the band can come in, so a packing looks only where something can change
// (everywhere, the first time after the measure changed).
const G = Math.log(BAND) / 2, GROW = Math.exp(G) - 1, EDGE = 4, TOP = 24, H = 2 ** 23;   // (TOP: the highest node counted, 2^24 blocks a side: farther than anything is drawn; H: blocks either side of the origin a key holds)
/** How much wider (a factor) a band of sizes on screen is held than drawn, either way: one FADE on a log scale. */
export const MARGIN = Math.exp(G);
const keyOf = (k, bi, bj) => (k * 2 ** 24 + bi + H) * 2 ** 24 + bj + H;
const keyOn = (r) => [Math.floor(r / 2 ** 48), Math.floor(r / 2 ** 24) % 2 ** 24 - H, (r % 2 ** 24) - H];
const QUAD = [[0, 0], [1, 0], [0, 1], [1, 1]];

export class Resident {
  /** cell: metres a cell; fixed: its band is metres, not sizes on screen; room: the most regions it may hold (one that
      would split past it is taken whole: more cells, nothing lost). */
  constructor({ cell, fixed = false, room = Infinity }) {
    this.cell = cell; this.fixed = fixed; this.side = BLOCK * cell; this.room = room;
    this.leaves = new Map();   // key -> { key, k, bi, bj, w (cells a side), at: [x, z, dy], dn, measure, band, pad }: where, how near and at which measure it was packed
    this.under = new Map();    // key -> how many leaves lie under that node (itself not counted)
    this.nodes = new Map();    // key of a node over leaves -> { at, slack }: where it was last looked at, and its slack from there
    this.roots = new Set(); this.K = -1; this.was = null;
  }
  /** Let every leaf go (what its cells read has changed: everything is packed again). */
  reset() { const out = [...this.leaves.values()]; this.leaves.clear(); this.under.clear(); this.nodes.clear(); this.roots.clear(); this.K = -1; this.was = null; return out; }
  /** The camera now (cx, cz; dy, its height over the ground: distances are the eye's), the band [near, far] (metres, as
      the lens sees them), the measure (dial pixels a metre covers at a metre: src/detail/measure.js dialK) and the
      stand's bounds: { pack: the leaves to visit (new, or run out), free: the leaves let go, kept: how many keep what
      they hold }. */
  update({ cx, cz, dy, near, far, measure = 1, bounds = null }) {
    const pack = [], free = [], { side, leaves, under, nodes } = this, out = { pack, free, kept: 0, looked: 0 };
    const same = !!this.was && this.was[0] === measure && this.was[1] === near && this.was[2] === far;
    this.was = [measure, near, far];
    const moved = (at) => Math.hypot(cx - at[0], cz - at[1], dy - at[2]);
    // (how far the camera may still move before a leaf runs out: what is left of its margin, the measure's change since
    // taken off; under nought, it has)
    const left = (L) => {
      const m = moved(L.at);
      return this.fixed ? L.pad - m - Math.max(Math.abs(near - L.band[0]), Math.abs(far - L.band[1])) : L.dn * (Math.exp(G - Math.abs(Math.log(measure / L.measure))) - 1) - m;
    };
    const add = (k, bi, bj, d) => { for (let a = k + 1; a <= TOP; a++) { const key = keyOf(a, Math.floor(bi / 2 ** a) * 2 ** a, Math.floor(bj / 2 ** a) * 2 ** a), n = (under.get(key) || 0) + d; if (n > 0) under.set(key, n); else under.delete(key); } };
    const letGo = (L) => { leaves.delete(L.key); add(L.k, L.bi, L.bj, -1); free.push(L); };
    const below = (k, bi, bj) => {   // (the node's leaf, or every leaf under it, let go)
      const key = keyOf(k, bi, bj), L = leaves.get(key); if (L) { letGo(L); return; }
      if (!(under.get(key) > 0)) return;
      nodes.delete(key);
      const h = 2 ** (k - 1); for (const [a, b] of QUAD) below(k - 1, bi + a * h, bj + b * h);
    };
    const kidsAreLeaves = (k, bi, bj) => { const h = 2 ** (k - 1); return QUAD.every(([a, b]) => { const c = keyOf(k - 1, bi + a * h, bj + b * h); return leaves.has(c) || !(under.get(c) > 0); }); };
    const leaf = (k, bi, bj, dn, pad, L = null) => {
      if (!L) { L = { key: keyOf(k, bi, bj), k, bi, bj, w: BLOCK * 2 ** k }; leaves.set(L.key, L); add(k, bi, bj, 1); }
      Object.assign(L, { at: [cx, cz, dy], dn, pad, measure, band: [near, far] }); pack.push(L);
      return left(L);
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
        const l = left(L);
        if (l >= 0) { out.kept++; return l; }
        if (fits) return leaf(k, bi, bj, dn, pad, L);
        letGo(L);
      } else if (under.get(key) > 0) {
        const N = nodes.get(key), m = N && same ? moved(N.at) : Infinity;
        if (m <= N?.slack) { out.kept += under.get(key); return N.slack - m; }   // (nothing under it can have changed)
        if (fits && under.get(key) <= 4 && kidsAreLeaves(k, bi, bj)) { below(k, bi, bj); return leaf(k, bi, bj, dn, pad); }   // (four leaves where one would do, one run out: packed again as one)
      } else if (fits) return leaf(k, bi, bj, dn, pad);
      const h = 2 ** (k - 1); let slack = Infinity;
      for (const [a, b] of QUAD) slack = Math.min(slack, visit(k - 1, bi + a * h, bj + b * h));
      if (under.get(key) > 0) nodes.set(key, { at: [cx, cz, dy], slack }); else nodes.delete(key);
      return slack;
    };
    const R2 = far * far - dy * dy, roots = new Set();
    let K = this.K;
    if (R2 > 0) {
      const R = Math.sqrt(R2); K = 0; while (side * 2 ** K < R) K++;
      const S0 = side * 2 ** K;
      for (let j = Math.floor((cz - R) / S0); j <= Math.floor((cz + R) / S0); j++) for (let i = Math.floor((cx - R) / S0); i <= Math.floor((cx + R) / S0); i++) roots.add(keyOf(K, i * 2 ** K, j * 2 ** K));
      if (K !== this.K) for (const L of [...leaves.values()]) { const s = 2 ** K; if (L.k > K || !roots.has(keyOf(K, Math.floor(L.bi / s) * s, Math.floor(L.bj / s) * s))) letGo(L); }   // (the roots another size: what lies under none of them, or is larger than they are, let go)
      for (const r of roots) visit(...keyOn(r));
    } else for (const L of [...leaves.values()]) letGo(L);
    // (a root the camera has left: all under it let go)
    if (K === this.K) for (const r of this.roots) if (!roots.has(r)) below(...keyOn(r));
    this.roots = roots; this.K = K;
    return out;
  }
}
