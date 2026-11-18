// A surface's level as the heap holds it (stage 8, intent 0038): the clusters of its hierarchy (clusters.js) that level
// needs (src/detail/error.js surfaceBand), each with its numbers, then their vertices. Plain JS: the recipes' workers pack it,
// src/scatter/cut.js and the drawer read it on the GPU.
//
// A level's elements (four numbers of 32 bits each, src/scatter/heap.js):
//   0                    [how many clusters it has, the least and the most error a cut of it may be run at]
//   1 + 3c … 3 + 3c      cluster c: [its first corner << 8 | its triangles - 1, D (how far its vertices move to their
//                        parent's surface, at most: the range their way there is packed in), its own error, its
//                        parent's error], [its own sphere: middle, radius], [its parent's sphere] (numbers as floats;
//                        errors and spheres of the thing's largest side, its own frame)
//   then its vertices, `per` elements each (a rock's: assets/kit/solid.js `still`; a made thing's: made.js)
// Its corners: where the vertex's first element lies, among the level's elements. At level 0 that is all a corner says
// (the cut draws cluster by cluster: it knows which); at every other the cluster's number is in its top 16 bits
// (`wide` off: a level of fewer than 65536 elements).
import { surfaceBand } from '../../src/detail/error.js';

export const HEAD = 1, REC = 3;
/** How many levels were cut down to their room (packLevel), since the start: a kind that needs more than its drawer
    holds shows here, never as a hole. */
export const trimmed = { n: 0 };
// The builder is the recipes' workers' alone (it brings meshoptimizer's WebAssembly): the page never makes a level.
let BUILD = null;
/** Who builds hierarchies here (src/scatter/recipes.worker.js, tools): assets/kit/clusters.js build. */
export const useBuilder = (b) => { BUILD = b; };
/** The hierarchy of mesh M (clusters.js build). */
export const hierarchyOf = (M) => { if (!BUILD) throw new Error('surface: hierarchies are built in the recipes\' workers (useBuilder)'); return BUILD(M); };

/** Level l of hierarchy D (clusters.js build's): { index, verts, count, box, clusters } for the heap. write(out, at, c,
    j, Dm): vertex j of cluster c packed into out from number `at` on, its way to its parent within ±Dm. room: { tris,
    elems }, the most the level may hold: a level that would hold more is cut down, its fine end coarser (from level 1
    on: the clusters it begins with stand for every finer size it is asked for) or its coarse end finer (level 0: it
    keeps its full detail, and is drawn finer than it need be where it would be coarser), counted in `trimmed`. */
export function packLevel(D, l, per, write, room = null) {
  let [lo, hi] = surfaceBand(l), cs = D.clusters.filter((c) => c.self.err <= hi && c.parent.err > lo);
  const size = (list) => { let t = 0, v = 0; for (const c of list) { t += c.n; v += c.verts.length; } return { t, e: HEAD + list.length * REC + v * per }; }, fits = (list) => { const s = size(list); return !room || (s.t <= room.tris && s.e <= room.elems); };
  let floor = null;   // (the clusters a cut-down level begins with: drawn whatever their own error)
  if (!fits(cs)) {
    trimmed.n++;
    const errs = [...new Set(cs.map((c) => (l ? c.parent.err : c.self.err)))].filter(Number.isFinite).sort((a, b) => (l ? a - b : b - a));
    for (const e of errs) {
      const next = l ? cs.filter((c) => c.parent.err > e) : cs.filter((c) => c.self.err < e);
      if (fits(next)) { if (l) { lo = e; floor = new Set(next.filter((c) => c.self.err <= e)); } else hi = e; cs = next; break; }
    }
  }
  const P = D.M.pos, K = 6 + D.k;
  let nv = 0, nt = 0; for (const c of cs) { nv += c.verts.length; nt += c.n; }
  const E = HEAD + cs.length * REC + nv * per, wide = l === 0;
  if (!wide && E > 65535) throw new Error(`surface: level ${l} has ${E} elements, more than its corners can name`);
  const verts = new Uint32Array(E * 4), f = new Float32Array(verts.buffer), index = new Uint32Array(nt * 3), box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  verts[0] = cs.length; f[1] = lo; f[2] = Math.min(hi, 3e38);   // (what it holds: the cut is run within its errors)
  let at = HEAD + cs.length * REC, corner = 0;
  cs.forEach((c, ci) => {
    let Dm = 0;
    for (let j = 0; j < c.verts.length; j++) {
      const v = c.verts[j];
      for (let a = 0; a < 3; a++) {
        const p = P[v * 3 + a], t = c.to[j * K + a]; Dm = Math.max(Dm, Math.abs(t - p));
        box[a] = Math.min(box[a], p, t); box[a + 3] = Math.max(box[a + 3], p, t);
      }
    }
    Dm = Dm ? Dm * 1.0001 + 1e-7 : 0;
    const r = (HEAD + ci * REC) * 4;
    verts[r] = ((corner << 8) | (c.n - 1)) >>> 0; f[r + 1] = Dm; f[r + 2] = floor?.has(c) ? 0 : c.self.err; f[r + 3] = Math.min(c.parent.err, 3e38);
    f[r + 4] = c.self.c[0]; f[r + 5] = c.self.c[1]; f[r + 6] = c.self.c[2]; f[r + 7] = c.self.r;
    f[r + 8] = c.parent.c[0]; f[r + 9] = c.parent.c[1]; f[r + 10] = c.parent.c[2]; f[r + 11] = c.parent.r;
    for (let j = 0; j < c.verts.length; j++) write(verts, (at + j * per) * 4, c, j, Dm);
    for (let i = 0; i < c.tris.length; i++) { const e = at + c.tris[i] * per; index[corner + i] = wide ? e : ((ci << 16) | e) >>> 0; }
    corner += c.tris.length; at += c.verts.length * per;
  });
  return { index, verts, count: index.length, box: Float32Array.from(cs.length ? box : [0, 0, 0, 0, 0, 0]), clusters: cs.length };
}
