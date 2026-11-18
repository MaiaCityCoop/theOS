// A surface made coarser by itself (intent 0038, stage 8): from a thing's full mesh alone, a hierarchy of clusters
// (Nanite's, Batched Multi-Triangulation's), built with meshoptimizer (MIT) as its clusterlod.h does. Nothing of the
// asset is told: its triangles, each corner's normal and what it is coloured by, and nothing else. Plain JS, no three:
// it runs in the recipes' workers (src/scatter/recipes.worker.js) and in node (tools).
//
//   build(M) -> { clusters, V, roots }    M: { V, pos (3 a vertex, the thing's own frame, its largest side 1), nor (3),
//                                          attr (k a vertex: a rock's shade, a made thing's colour), k, aw (each attr's
//                                          weight in the error), index (3 a triangle), seam? (Uint8Array: 1 where a vertex
//                                          must keep its attributes apart from its neighbours': a material's edge) }
//   a cluster: { tris (its corners, numbers of its own vertices), verts (M's vertex each of its own is), to (each of its
//                vertices on its parent's surface: place 3, normal 3, attr k), self: { err, c, r }, parent: { err, c, r } }
//
// How (clusterlod.h's loop): the full mesh is cut into clusters of at most 128 triangles. Then, level by level until
// one is left: neighbouring clusters are gathered into groups of about eight (afresh at every level, so a border locked
// at one level lies inside a group at the next), each group is simplified to half its triangles with every vertex it
// shares with another group locked (so the groups' borders stay the same lines, and neighbours at different levels
// still meet), and cut into clusters again. A group that will not halve waits for another grouping; the last cluster
// is halved on, nothing locked, down to a handful of triangles.
//   - Its error: the simplifier's (how far the surface moved, the normals' and colours' change weighed in), and never
//     less than BAND times its children's: errors only grow towards the coarse end, so along any chain from fine to
//     coarse exactly one cluster passes the cut's rule (src/scatter/clusters.js).
//   - Its sphere holds its children's.
//   - Each vertex a group loses keeps where it lies on what the group is made into (the nearest point of it, with the
//     normal and colour there): a cluster turns into its parent before it gives way to it (the cut's morph), so
//     nothing jumps. A vertex the group keeps stays where it is.
//   - Thin and small loose parts (a guy rope, a peg, a lantern): an edge's contraction may not shorten them. A part of
//     few triangles, or one much thinner than it is long, stays as it is, its vertices locked, until the error the
//     group is allowed reaches the part's own reach (how far its farthest point lies from its middle: what is lost with
//     it); then it goes whole, shrinking to its middle. Folded as the simplifier would, a rope went in one step at a
//     tenth of a pixel of error while its far end lay 37 px from anything drawn (reports/Smooth automatic level of detail.md).
//   - What moves on bones (stage 8b): a vertex keeps its own bones (the simplifier never makes a vertex, it only keeps
//     some), so `attr` may carry the weights of its bones, weighed in the error, and the spheres and errors are those of
//     the rest pose; grown by how far the bones reach is what the cut must add.
import { MeshoptSimplifier as S, MeshoptClusterizer as C } from 'meshoptimizer';
import { BAND } from '../../src/detail/error.js';

await Promise.all([S.ready, C.ready]);
export { BAND };
const MAXT = 128, MAXV = 192, MINT = 32, GS = 8, STUCK = 0.85, TAIL = 8;   // a cluster's most triangles and vertices; a group's clusters; a group left with more than STUCK of its triangles is stuck; the tail ends at TAIL triangles
/** A part is kept whole until its reach is allowed: one of at most FEW triangles, or THIN times longer than it is wide. */
const FEW = 12, THIN = 8;

/** The cluster hierarchy of M (above). */
export function build(M) {
  const { V, pos, nor, index } = M, k = M.k ?? 0, attr = M.attr ?? new Float32Array(0), T = index.length / 3;
  // the simplifier's view of a vertex: its normal and attributes, weighed
  const AK = 3 + k, A = new Float32Array(V * AK), W = [M.nw ?? 0.02, M.nw ?? 0.02, M.nw ?? 0.02, ...(M.aw ?? [])];
  for (let v = 0; v < V; v++) { A.set(nor.subarray(v * 3, v * 3 + 3), v * AK); for (let j = 0; j < k; j++) A[v * AK + 3 + j] = attr[v * k + j]; }
  // where corners stand at one place (a seam: a sheet's two sides, a hard edge, a colour's edge): one place, for what
  // touches what and what is locked
  const place = S.generatePositionRemap(pos, 3);
  // the loose parts (what shares no place with the rest), and which of them are kept whole
  const up = Int32Array.from({ length: V }, (_, i) => i), root = (x) => { while (up[x] !== x) x = up[x] = up[up[x]]; return x; };
  for (let t = 0; t < T; t++) { const a = root(place[index[t * 3]]), b = root(place[index[t * 3 + 1]]), c = root(place[index[t * 3 + 2]]); up[a] = b; up[root(c)] = root(b); }
  const partOf = new Int32Array(V), parts = new Map();
  for (let v = 0; v < V; v++) { const r = root(place[v]); let P = parts.get(r); if (!P) parts.set(r, (P = { id: parts.size, tris: 0, verts: [] })); P.verts.push(v); partOf[v] = P.id; }
  for (let t = 0; t < T; t++) parts.get(root(place[index[t * 3]])).tris++;
  const whole = [];   // per part: null (it is folded as any surface), or { reach, c } (kept whole until its reach is allowed)
  for (const P of parts.values()) {
    const ext = extentsOf(pos, P.verts), c = [0, 0, 0]; for (const v of P.verts) for (let a = 0; a < 3; a++) c[a] += pos[v * 3 + a] / P.verts.length;
    let reach = 0; for (const v of P.verts) reach = Math.max(reach, Math.hypot(pos[v * 3] - c[0], pos[v * 3 + 1] - c[1], pos[v * 3 + 2] - c[2]));
    whole[P.id] = P.tris <= FEW || ext[1] * THIN < ext[2] ? { reach, c } : null;
  }
  const held = new Uint8Array(V), sizeOf = new Int32Array(parts.size); for (let v = 0; v < V; v++) if (whole[partOf[v]]) held[v] = 1;
  for (let t = 0; t < T; t++) sizeOf[partOf[index[t * 3]]]++;   // (a part's triangles: one that lies in a group whole may go with it)

  const clusters = [];
  const sphere = (idx) => { let x = 0, y = 0, z = 0; for (let i = 0; i < idx.length; i++) { const o = idx[i] * 3; x += pos[o]; y += pos[o + 1]; z += pos[o + 2]; } x /= idx.length; y /= idx.length; z /= idx.length; let r = 0; for (let i = 0; i < idx.length; i++) { const o = idx[i] * 3; r = Math.max(r, Math.hypot(pos[o] - x, pos[o + 1] - y, pos[o + 2] - z)); } return { c: [x, y, z], r }; };
  const merged = (ss) => {
    if (ss.length === 1) return { c: ss[0].c, r: ss[0].r };
    const c = new Float32Array(ss.length * 3), r = new Float32Array(ss.length); ss.forEach((s, i) => { c.set(s.c, i * 3); r[i] = s.r; });
    const b = C.computeSphereBounds(c, 3, r, 1), o = [b.centerX, b.centerY, b.centerZ];
    return { c: o, r: Math.max(b.radius, ...ss.map((s) => Math.hypot(s.c[0] - o[0], s.c[1] - o[1], s.c[2] - o[2]) + s.r)) };   // (it holds every one of them, exactly)
  };
  const make = (idx, self) => { clusters.push({ idx, self, parent: null }); return clusters.length - 1; };
  // (a list of corners of the whole mesh cut into clusters: meshoptimizer's, its vertices numbered locally)
  const cut = (idx, l2g) => {
    if (idx.length / 3 <= MAXT) return [l2g ? Uint32Array.from(idx, (l) => l2g[l]) : idx];
    const lp = l2g ? localPos(pos, l2g) : pos, b = C.buildMeshletsFlex(idx, lp, 3, MAXV, MINT, MAXT, 0, 2.0), out = [];
    for (let i = 0; i < b.meshletCount; i++) { const vo = b.meshlets[i * 4], to = b.meshlets[i * 4 + 1], tc = b.meshlets[i * 4 + 3], c = new Uint32Array(tc * 3); for (let j = 0; j < tc * 3; j++) { const v = b.vertices[vo + b.triangles[to + j]]; c[j] = l2g ? l2g[v] : v; } out.push(c); }
    return out;
  };
  let pending = cut(index, null).map((idx) => make(idx, { err: 0, ...sphere(idx) }));
  const stats = { levels: 0, stuck: 0, gone: 0 };
  const groupOfV = new Int32Array(V), lock = new Uint8Array(V), seen = new Int32Array(V).fill(-1);
  for (let level = 1; pending.length > 1 && level < 64; level++) {
    // which clusters touch: by the places they share
    const users = new Map(), first = new Int32Array(V).fill(-1);
    for (const ci of pending) { const idx = clusters[ci].idx; for (let i = 0; i < idx.length; i++) { const p = place[idx[i]]; if (seen[p] === ci) continue; seen[p] = ci; if (first[p] < 0) first[p] = ci; else { let u = users.get(p); if (!u) users.set(p, (u = [first[p]])); u.push(ci); } } }
    seen.fill(-1);
    const adj = new Map(), link = (a, b) => { let m = adj.get(a); if (!m) adj.set(a, (m = new Map())); m.set(b, (m.get(b) ?? 0) + 1); };
    for (const u of users.values()) for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) { link(u[i], u[j]); link(u[j], u[i]); }
    // groups: grown from a seed by the neighbour that shares most with the group so far; a group left small joins the
    // neighbour it shares most with. Seeded in space order, so groups are compact
    const order = [...pending].sort((a, b) => clusters[a].self.c[0] - clusters[b].self.c[0] || clusters[a].self.c[2] - clusters[b].self.c[2]);
    const groupOf = new Map(), groups = [];
    for (const seed of order) {
      if (groupOf.has(seed)) continue;
      const g = [seed], gi = groups.length, score = new Map(); groupOf.set(seed, gi);
      const add = (c) => { for (const [n, w] of adj.get(c) ?? []) if (!groupOf.has(n)) score.set(n, (score.get(n) ?? 0) + w); };
      add(seed);
      while (g.length < GS && score.size) { let best = -1, bw = -1; for (const [n, w] of score) if (w > bw) { bw = w; best = n; } score.delete(best); if (groupOf.has(best)) continue; groupOf.set(best, gi); g.push(best); add(best); }
      groups.push(g);
    }
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi]; if (!g.length || g.length >= GS / 2 || groups.length === 1) continue;
      const w = new Map(); for (const c of g) for (const [n, x] of adj.get(c) ?? []) { const o = groupOf.get(n); if (o !== gi) w.set(o, (w.get(o) ?? 0) + x); }
      let best = -1, bw = -1; for (const [o, x] of w) if (x > bw && groups[o].length + g.length <= GS * 2) { bw = x; best = o; }
      if (best >= 0) { for (const c of g) { groupOf.set(c, best); groups[best].push(c); } groups[gi] = []; }
    }
    const live = groups.filter((g) => g.length);
    // a place used by two groups is locked: neither may move it, so their borders stay the same lines
    groupOfV.fill(-1); lock.fill(0);
    live.forEach((g, gi) => { for (const ci of g) { const idx = clusters[ci].idx; for (let i = 0; i < idx.length; i++) { const p = place[idx[i]]; if (groupOfV[p] < 0) groupOfV[p] = gi; else if (groupOfV[p] !== gi) lock[p] = 1; } } });
    const next = []; let made = 0;
    for (const g of live) {
      // the group as a mesh of its own vertices
      let n = 0; for (const ci of g) n += clusters[ci].idx.length;
      const lidx = new Uint32Array(n), g2l = new Map(), l2g = []; let o = 0;
      for (const ci of g) { const idx = clusters[ci].idx; for (let i = 0; i < idx.length; i++) { const v = idx[i]; let l = g2l.get(v); if (l === undefined) { l = l2g.length; g2l.set(v, l); l2g.push(v); } lidx[o++] = l; } }
      const lp = localPos(pos, l2g), la = new Float32Array(l2g.length * AK), ll = new Uint8Array(l2g.length);
      l2g.forEach((v, l) => { la.set(A.subarray(v * AK, v * AK + AK), l * AK); ll[l] = lock[place[v]] || held[v] ? 1 : M.seam?.[v] ? 2 : 0; });
      const childErr = Math.max(...g.map((ci) => clusters[ci].self.err));
      let [out, err] = S.simplifyWithAttributes(lidx, lp, 3, la, AK, W, ll, Math.floor(n / 6) * 3, Infinity, ['ErrorAbsolute', 'Permissive']);
      // the parts kept whole that this group may now let go: wholly in it, and no further than the error it is allowed
      let E = Math.max(err, childErr * BAND), gone = null;
      const mine = new Map(); for (let i = 0; i < lidx.length; i += 3) { const p = partOf[l2g[lidx[i]]]; if (whole[p]) mine.set(p, (mine.get(p) ?? 0) + 1); }
      for (const [p, cnt] of mine) {
        const W0 = whole[p]; if (W0.reach > E || cnt < sizeOf[p]) continue;
        (gone ||= new Set()).add(p); E = Math.max(E, W0.reach);
      }
      if (gone) out = dropParts(out, l2g, partOf, gone);
      if (out.length > n * STUCK && !gone) { stats.stuck++; next.push(...g); continue; }   // it would not halve: its clusters wait for another grouping
      // (its error is also measured: how far the farthest vertex it lost lies from what it is made into. The
      // simplifier's word misses a small piece it folded away whole)
      const far = morphs(g.map((ci) => clusters[ci]), out, l2g, g2l, lp, M, k, gone ? (v) => gone.has(partOf[v]) && whole[partOf[v]].c : null);
      const G = { err: Math.max(E, far), ...merged(g.map((ci) => clusters[ci].self)) };
      for (const ci of g) clusters[ci].parent = G;
      made++;
      if (!out.length) { stats.gone += n / 3; continue; }   // (a group of parts that all went: drawn until their error shows no more)
      for (const idx of cut(out, l2g)) next.push(make(idx, G));
    }
    stats.levels = level;
    if (!made) break;
    pending = next;
  }
  // the tail: the last cluster halved again and again, nothing locked, down to a handful of triangles
  while (pending.length === 1) {
    const c = clusters[pending[0]], n = c.idx.length; if (n / 3 <= TAIL) break;
    const g2l = new Map(), l2g = [], lidx = new Uint32Array(n);
    for (let i = 0; i < n; i++) { const v = c.idx[i]; let l = g2l.get(v); if (l === undefined) { l = l2g.length; g2l.set(v, l); l2g.push(v); } lidx[i] = l; }
    const lp = localPos(pos, l2g), la = new Float32Array(l2g.length * AK); l2g.forEach((v, l) => la.set(A.subarray(v * AK, v * AK + AK), l * AK));
    const [out, err] = S.simplifyWithAttributes(lidx, lp, 3, la, AK, W, null, Math.max(TAIL, Math.floor(n / 6)) * 3, Infinity, ['ErrorAbsolute', 'Permissive']);
    if (out.length > n * STUCK || out.length < 6) break;
    const far = morphs([c], out, l2g, g2l, lp, M, k, null), G = { err: Math.max(err, c.self.err * BAND, far), c: c.self.c, r: c.self.r };
    c.parent = G; pending = [make(Uint32Array.from(out, (l) => l2g[l]), G)]; stats.levels++;
  }
  // what nothing replaces: its parent's error never shows
  for (const c of clusters) if (!c.parent) { c.parent = { err: Infinity, c: c.self.c, r: c.self.r }; morphs([c], null, null, null, null, M, k, null); }
  return { clusters: clusters.map(({ idx, self, parent, tris, verts, to }) => ({ tris, verts, to, self, parent, n: idx.length / 3 })), V, k, M, stats };
}

/** The clusters of a DAG (build's) any cut between errors lo and hi draws: whose own error is at most hi and whose
    parent's is over lo. */
export const bandOf = (D, lo, hi) => D.clusters.filter((c) => c.self.err <= hi && c.parent.err > lo);

// ---- what the build works with ----
const localPos = (pos, l2g) => { const p = new Float32Array(l2g.length * 3); for (let l = 0; l < l2g.length; l++) { const v = l2g[l] * 3; p[l * 3] = pos[v]; p[l * 3 + 1] = pos[v + 1]; p[l * 3 + 2] = pos[v + 2]; } return p; };
const dropParts = (out, l2g, partOf, gone) => { const keep = []; for (let i = 0; i < out.length; i += 3) if (!gone.has(partOf[l2g[out[i]]])) keep.push(out[i], out[i + 1], out[i + 2]); return Uint32Array.from(keep); };
/** A part's extents along its own three axes, smallest first (its spread's, by power iteration). */
function extentsOf(pos, vs) {
  const m = [0, 0, 0]; for (const v of vs) for (let i = 0; i < 3; i++) m[i] += pos[v * 3 + i] / vs.length;
  const Cv = [0, 0, 0, 0, 0, 0]; for (const v of vs) { const x = pos[v * 3] - m[0], y = pos[v * 3 + 1] - m[1], z = pos[v * 3 + 2] - m[2]; Cv[0] += x * x; Cv[1] += x * y; Cv[2] += x * z; Cv[3] += y * y; Cv[4] += y * z; Cv[5] += z * z; }
  const mul = (a) => [Cv[0] * a[0] + Cv[1] * a[1] + Cv[2] * a[2], Cv[1] * a[0] + Cv[3] * a[1] + Cv[4] * a[2], Cv[2] * a[0] + Cv[4] * a[1] + Cv[5] * a[2]], axes = [];
  for (let j = 0; j < 3; j++) {
    let a = [[1, 0.3, 0.2], [0.2, 1, 0.3], [0.3, 0.2, 1]][j];
    for (let it = 0; it < 24; it++) { a = mul(a); for (const b of axes) { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; for (let i = 0; i < 3; i++) a[i] -= d * b[i]; } const l = Math.hypot(...a) || 1; a = a.map((x) => x / l); }
    axes.push(a);
  }
  return axes.map((a) => { let lo = Infinity, hi = -Infinity; for (const v of vs) { const d = pos[v * 3] * a[0] + pos[v * 3 + 1] * a[1] + pos[v * 3 + 2] * a[2]; if (d < lo) lo = d; if (d > hi) hi = d; } return hi - lo; }).sort((x, y) => x - y);
}

/** Each of the clusters' own vertices, and where it lies on what their group was made into (out: corners of the
    group's own vertices; none: nothing replaces them, each stays where it is): its place, normal and attributes there.
    shrinks(v): where a vertex of a part that went shrinks to (its middle), or nothing. */
function morphs(cs, out, l2g, g2l, lp, M, k, shrinks) {
  const { pos, nor } = M, attr = M.attr, kept = new Uint8Array(l2g ? l2g.length : 0);
  if (out) for (let i = 0; i < out.length; i++) kept[out[i]] = 1;
  const grid = out && out.length ? gridOf(out, lp) : null, R = new Float64Array(4); let far = 0;
  for (const c of cs) {
    // its own vertices: M's, in the order its corners first name them
    const loc = new Map(), verts = [], tris = new Uint32Array(c.idx.length);
    for (let i = 0; i < c.idx.length; i++) { const v = c.idx[i]; let j = loc.get(v); if (j === undefined) { j = verts.length; loc.set(v, j); verts.push(v); } tris[i] = j; }
    const to = new Float32Array(verts.length * (6 + k));
    verts.forEach((v, j) => {
      const o = j * (6 + k), l = g2l ? g2l.get(v) : -1, s = shrinks?.(v);
      if (s) { to.set(s, o); to.set(nor.subarray(v * 3, v * 3 + 3), o + 3); for (let a = 0; a < k; a++) to[o + 6 + a] = attr[v * k + a]; far = Math.max(far, Math.hypot(s[0] - pos[v * 3], s[1] - pos[v * 3 + 1], s[2] - pos[v * 3 + 2])); return; }
      if (!grid || kept[l]) { to.set(pos.subarray(v * 3, v * 3 + 3), o); to.set(nor.subarray(v * 3, v * 3 + 3), o + 3); for (let a = 0; a < k; a++) to[o + 6 + a] = attr[v * k + a]; return; }
      // the nearest point of what the group was made into, and its normal and attributes there (by where it lies on
      // that triangle)
      const t = nearest(grid, lp, out, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], R), a = l2g[out[t * 3]], b = l2g[out[t * 3 + 1]], cc = l2g[out[t * 3 + 2]], wa = R[1], wb = R[2], wc = R[3];
      for (let i = 0; i < 3; i++) to[o + i] = pos[a * 3 + i] * wa + pos[b * 3 + i] * wb + pos[cc * 3 + i] * wc;
      far = Math.max(far, Math.sqrt(R[0]));
      let nx = nor[a * 3] * wa + nor[b * 3] * wb + nor[cc * 3] * wc, ny = nor[a * 3 + 1] * wa + nor[b * 3 + 1] * wb + nor[cc * 3 + 1] * wc, nz = nor[a * 3 + 2] * wa + nor[b * 3 + 2] * wb + nor[cc * 3 + 2] * wc; const nl = Math.hypot(nx, ny, nz) || 1;
      to[o + 3] = nx / nl; to[o + 4] = ny / nl; to[o + 5] = nz / nl;
      for (let i = 0; i < k; i++) to[o + 6 + i] = attr[a * k + i] * wa + attr[b * k + i] * wb + attr[cc * k + i] * wc;
    });
    c.verts = Int32Array.from(verts); c.tris = tris; c.to = to;
  }
  return far;
}
// a grid over a group's triangles, for the nearest of them to a point
function gridOf(out, lp) {
  const T = out.length / 3, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < out.length; i++) for (let a = 0; a < 3; a++) { const x = lp[out[i] * 3 + a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; }
  const n = Math.max(1, Math.min(24, Math.round(Math.cbrt(T) * 1.5))), sz = [0, 1, 2].map((a) => Math.max(1e-9, (hi[a] - lo[a]) / n)), cells = new Map();
  const at = (x, a) => Math.max(0, Math.min(n - 1, Math.floor((x - lo[a]) / sz[a])));
  for (let t = 0; t < T; t++) {
    const b0 = [0, 1, 2].map((a) => at(Math.min(lp[out[t * 3] * 3 + a], lp[out[t * 3 + 1] * 3 + a], lp[out[t * 3 + 2] * 3 + a]), a)), b1 = [0, 1, 2].map((a) => at(Math.max(lp[out[t * 3] * 3 + a], lp[out[t * 3 + 1] * 3 + a], lp[out[t * 3 + 2] * 3 + a]), a));
    for (let x = b0[0]; x <= b1[0]; x++) for (let y = b0[1]; y <= b1[1]; y++) for (let z = b0[2]; z <= b1[2]; z++) { const key = (x * n + y) * n + z; let L = cells.get(key); if (!L) cells.set(key, (L = [])); L.push(t); }
  }
  return { lo, sz, n, cells, at, T };
}
// the nearest triangle to (x, y, z): its number, R = [its distance², and where the point lies on it: the weights of its
// three corners]; the cells round the point's, ring by ring, until no nearer one can be left
function nearest(G, lp, out, x, y, z, R) {
  const c = [G.at(x, 0), G.at(y, 1), G.at(z, 2)], smin = Math.min(...G.sz); let best = -1, bd = Infinity; const B = [0, 0, 0];
  for (let r = 0; r <= G.n; r++) {
    for (let i = c[0] - r; i <= c[0] + r; i++) for (let j = c[1] - r; j <= c[1] + r; j++) for (let l = c[2] - r; l <= c[2] + r; l++) {
      if (Math.max(Math.abs(i - c[0]), Math.abs(j - c[1]), Math.abs(l - c[2])) !== r || i < 0 || j < 0 || l < 0 || i >= G.n || j >= G.n || l >= G.n) continue;
      const L = G.cells.get((i * G.n + j) * G.n + l); if (!L) continue;
      for (const t of L) { const d = toTriangle(x, y, z, lp, out[t * 3], out[t * 3 + 1], out[t * 3 + 2], B); if (d < bd) { bd = d; best = t; R[1] = B[0]; R[2] = B[1]; R[3] = B[2]; } }
    }
    if (best >= 0 && Math.sqrt(bd) <= r * smin) break;   // (every cell further out is at least r cells off)
  }
  if (best < 0) for (let t = 0; t < G.T; t++) { const d = toTriangle(x, y, z, lp, out[t * 3], out[t * 3 + 1], out[t * 3 + 2], B); if (d < bd) { bd = d; best = t; R[1] = B[0]; R[2] = B[1]; R[3] = B[2]; } }
  R[0] = bd; return best;
}
/** The squared distance from a point to triangle a b c (Ericson), and where the nearest point lies on it: B, the
    weights of a, b, c. */
function toTriangle(px, py, pz, P, a, b, c, B) {
  const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], abx = P[b * 3] - ax, aby = P[b * 3 + 1] - ay, abz = P[b * 3 + 2] - az, acx = P[c * 3] - ax, acy = P[c * 3 + 1] - ay, acz = P[c * 3 + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az, d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let u, v;
  if (d1 <= 0 && d2 <= 0) { u = 0; v = 0; } else {
    const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { u = 1; v = 0; } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { u = d1 / (d1 - d3); v = 0; } else {
        const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { u = 0; v = 1; } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { u = 0; v = d2 / (d2 - d6); } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { v = (d4 - d3) / (d4 - d3 + (d5 - d6)); u = 1 - v; } else { const den = 1 / (va + vb + vc); u = vb * den; v = vc * den; }
          }
        }
      }
    }
  }
  B[0] = 1 - u - v; B[1] = u; B[2] = v;
  const qx = apx - abx * u - acx * v, qy = apy - aby * u - acy * v, qz = apz - abz * u - acz * v;
  return qx * qx + qy * qy + qz * qz;
}
