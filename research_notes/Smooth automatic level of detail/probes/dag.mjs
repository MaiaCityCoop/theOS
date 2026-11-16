// A probe, not part of the game: build a cluster hierarchy (clusters of triangles, grouped, each group simplified with
// its border locked, cut into clusters again, and so on up: the structure of Nanite, Batched Multi-Triangulation) for a
// mesh of the game, with the meshoptimizer package's WebAssembly as a browser worker would call it. Then:
//   - time the build;
//   - check the rule "draw a cluster when its own error is small enough and its parent's is not" gives a closed
//     surface (no cracks) from any distance;
//   - count the triangles that rule draws, by size on screen, beside the ladder's eight fixed levels.
//
//   node dag.mjs <meshoptimizer package dir> <TheGame dir> [boulder | tent | ball:<squares an edge>] [group size] [json out]
//
// boulder: shape 0 of assets/boulder.js at its full mesh, beside the ladder's levels; tent: assets/belltent.js's finest
// faces, welded, beside its hand-made levels; ball:n: a ball of 12 n² triangles displaced by seven octaves of noise
// (ball:289 a million triangles, ball:913 ten million).
// Switches (environment): TILE=n cluster the full mesh n triangles at a time; MEASURED=1 a group's error is also
// measured (how far its vertices lie from what is left), not only the simplifier's word; SHOWGROUPS=1 print every
// group's simplification; WORST=n print the n vertices farthest from each cut measured; DEBUG=1 each level drawn
// whole: is it closed; NOTRUTH=1 skip the distance measurements.
// Moving vertices inside the hierarchy: MORPH=1 every vertex a group loses keeps where it lies on what the group is
// simplified to (TO=surface, the nearest point of it; TO=vertex, the nearest kept vertex along the mesh: tried, worse);
// GROW=k a group's error is at least k times its children's; BAND=m a cluster moves while its parent's error is
// between tau and m tau (default: GROW's); FLIGHT=1 walks up to the thing (STEP=1.01: a hundredth larger each step)
// and measures the most that what is drawn changes in one step, with and without the moving.
// The package: `npm install meshoptimizer` into a folder of its own (1.3.0 when this was run).
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

const [, , MESHOPT, GAME, SOURCE = 'boulder', GS_ARG = '8', OUT = ''] = process.argv;
const imp = (p) => import(pathToFileURL(p).href);
const { MeshoptSimplifier: S, MeshoptClusterizer: C } = await imp(`${MESHOPT}/index.js`);
await S.ready; await C.ready;
const { rockMesh } = await imp(`${GAME}/assets/kit/rock.js`);
const { unpackSolid } = await imp(`${GAME}/assets/kit/solid.js`);
const { LADDER, trisOf, FULLN, DOTN } = await imp(`${GAME}/assets/kit/ladder.js`);
const { noise3 } = await imp(`${GAME}/assets/kit/blob.js`);
const boulder = (await imp(`${GAME}/assets/boulder.js`)).default;

const MAXV = 192, MINT = 44, MAXT = 128;      // a cluster: at most 128 triangles (Nanite's size), 192 vertices
const GS = +GS_ARG, RATIO = 0.5, STUCK = 0.85; // clusters a group; triangles kept by a simplification; above this share of them left: stuck
const now = () => performance.now();
const T = { mesh: 0, base: 0, group: 0, simplify: 0, split: 0, bounds: 0, measure: 0, morph: 0 };
let QX = 0, QY = 0, QZ = 0;   // the nearest point closest() found last
const MEASURED = !!process.env.MEASURED;
// MORPH: every vertex a group loses keeps where it lies on what the group is simplified to (the nearest point of it), so a
// cluster can be drawn part way there (TheGame's own way between two levels: src/scatter/drawer.js). GROW: a group's
// error is at least this many times its children's, so a cluster has finished moving before its parent's begin
const MORPH = !!process.env.MORPH, GROW = +(process.env.GROW || 1), BAND = +(process.env.BAND || (GROW > 1 ? GROW : 1.25));
const TO = process.env.TO || 'surface';   // where a lost vertex goes: the nearest point of the simplified surface, or (vertex) the nearest kept vertex along the mesh
const fit = { most: 0, mostOfErr: 0, n: 0, sum: 0 };   // how far a group, moved all the way, still lies from what it is simplified to (its triangles' middles)
function movedOf(lidx, lpos, l2g, out, err) {
  const used = new Uint8Array(l2g.length), M = new Map(), T = new Float32Array(l2g.length * 3); T.set(lpos);
  for (let k = 0; k < out.length; k++) used[out[k]] = 1;
  if (TO === 'vertex') {
    // each lost vertex goes to a vertex that is kept: the nearest along the group's own edges (the kept vertices spread
    // over the group's mesh at once, by the length walked). Moved all the way, the group is then a mesh of kept vertices
    // only, as the simplified one is: the two can differ only in which way a four-cornered patch is cut
    const nb = Array.from({ length: l2g.length }, () => []), dist = new Float64Array(l2g.length).fill(Infinity), to = new Int32Array(l2g.length).fill(-1);
    for (let t = 0; t < lidx.length; t += 3) for (let e = 0; e < 3; e++) { const a = lidx[t + e], c = lidx[t + ((e + 1) % 3)]; nb[a].push(c); nb[c].push(a); }
    const heap = []; const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (let l = 0; l < l2g.length; l++) if (used[l]) { dist[l] = 0; to[l] = l; push(0, l); }
    while (heap.length) { const [d, v] = pop(); if (d > dist[v]) continue; for (const w of nb[v]) { const nd = d + Math.hypot(lpos[v * 3] - lpos[w * 3], lpos[v * 3 + 1] - lpos[w * 3 + 1], lpos[v * 3 + 2] - lpos[w * 3 + 2]); if (nd < dist[w]) { dist[w] = nd; to[w] = to[v]; push(nd, w); } } }
    for (let l = 0; l < l2g.length; l++) { if (used[l] || to[l] < 0) continue; const k = to[l] * 3; M.set(l2g[l], [lpos[k], lpos[k + 1], lpos[k + 2]]); T[l * 3] = lpos[k]; T[l * 3 + 1] = lpos[k + 1]; T[l * 3 + 2] = lpos[k + 2]; }
  } else for (let l = 0; l < l2g.length; l++) {
    if (used[l]) continue; let best = Infinity, bx = 0, by = 0, bz = 0; const x = lpos[l * 3], y = lpos[l * 3 + 1], z = lpos[l * 3 + 2];
    for (let k = 0; k < out.length; k += 3) { const d = closest(x, y, z, lpos, out[k], out[k + 1], out[k + 2]); if (d < best) { best = d; bx = QX; by = QY; bz = QZ; } }
    M.set(l2g[l], [bx, by, bz]); T[l * 3] = bx; T[l * 3 + 1] = by; T[l * 3 + 2] = bz;
  }
  for (let t = 0; t < lidx.length; t += 3) {   // each of its triangles, moved all the way: how far is its middle from the simplified surface
    const a = lidx[t] * 3, b = lidx[t + 1] * 3, c = lidx[t + 2] * 3, x = (T[a] + T[b] + T[c]) / 3, y = (T[a + 1] + T[b + 1] + T[c + 1]) / 3, z = (T[a + 2] + T[b + 2] + T[c + 2]) / 3; let best = Infinity;
    for (let k = 0; k < out.length; k += 3) { const d = closest(x, y, z, lpos, out[k], out[k + 1], out[k + 2]); if (d < best) best = d; }
    const d = Math.sqrt(best); if (d > fit.most) fit.most = d; if (err > 0 && d / err > fit.mostOfErr) fit.mostOfErr = d / err; if (err > 0) fit.sum += d / err; fit.n++;
  }
  return M;
}   // a group's error: also measured, not only the simplifier's word

// ---- the mesh ----
let pos, index, ladderInfo = null, hand = null, OPEN = false;   // hand: the levels written by hand today ({ px: drawn down to, tris, P, index }); OPEN: a surface with edges of its own (a tent's door): an edge used once is no crack
{
  const t0 = now();
  if (SOURCE === 'boulder') {
    const M = rockMesh(boulder, 0, 0), V = M.verts.length / 4;
    pos = new Float32Array(V * 3); index = M.index;
    for (let v = 0; v < V; v++) pos.set(unpackSolid(M.verts, v * 4, LADDER[0].delta).p, v * 3);
    // the ladder as it is: each level's triangles, and how far its vertices move to reach the next coarser mesh
    ladderInfo = LADDER.map((L, l) => {
      if (L.n === DOTN) return { l, n: 'dot', px: L.px, tris: 1, moveMax: 0, moveRms: 0 };
      const m = rockMesh(boulder, 0, l), n = m.verts.length / 4; let mx = 0, sq = 0;
      if (L.delta > 0) for (let v = 0; v < n; v++) { const u = unpackSolid(m.verts, v * 4, L.delta), d = Math.hypot(u.t[0] - u.p[0], u.t[1] - u.p[1], u.t[2] - u.p[2]); if (d > mx) mx = d; sq += d * d; }
      return { l, n: L.n === FULLN ? 'full' : L.n, px: L.px, tris: m.index.length / 3, moveMax: mx, moveRms: Math.sqrt(sq / n) };
    });
    hand = LADDER.slice(0, 6).map((L, l) => { const m = rockMesh(boulder, 0, l), n = m.verts.length / 4, P = new Float32Array(n * 3); for (let v = 0; v < n; v++) P.set(unpackSolid(m.verts, v * 4, L.delta).p, v * 3); return { px: L.px, tris: m.index.length / 3, P, index: m.index }; });
  } else if (SOURCE === 'tent') {
    const tent = (await imp(`${GAME}/assets/belltent.js`)).default, span = Math.max(tent.size.length, tent.size.width, tent.size.height);
    const meshOf = (faces) => {
      const P = new Float32Array(faces.length * 9); faces.forEach((f, i) => { for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) P[i * 9 + c * 3 + k] = f[c][k] / span; });
      const idx = S.generatePositionRemap(P, 3), [remap, n] = S.compactMesh(idx), Q = new Float32Array(n * 3);   // (compactMesh renumbers idx in place; remap: a corner's old number to its new one, where it is kept)
      for (let i = 0; i < remap.length; i++) { const v = remap[i]; if (v !== 0xffffffff) { Q[v * 3] = P[i * 3]; Q[v * 3 + 1] = P[i * 3 + 1]; Q[v * 3 + 2] = P[i * 3 + 2]; } }
      // (faces with no area, and faces a welding folded flat, are not triangles)
      const keep = []; for (let t = 0; t < idx.length; t += 3) if (idx[t] !== idx[t + 1] && idx[t + 1] !== idx[t + 2] && idx[t] !== idx[t + 2]) keep.push(idx[t], idx[t + 1], idx[t + 2]);
      return { P: Q, index: Uint32Array.from(keep), corners: faces.length * 3 };
    };
    const L = tent.detail.levels.map((l) => meshOf(l.faces)), PX = [170, 45, 15, 5];   // (its kind's pixels, shelter: assets/kinds.js)
    pos = L[0].P; index = L[0].index; OPEN = true;
    hand = L.map((m, l) => ({ px: PX[l], tris: m.index.length / 3, P: m.P, index: m.index }));
    console.log(`the tent: ${tent.detail.levels[0].faces.length} faces, ${L[0].corners} corners of their own, welded to ${pos.length / 3} vertices; its largest side ${span.toFixed(2)} m`);
  } else {
    // a ball of n squares an edge (12 n² triangles), displaced by seven octaves of the game's own noise: detail at every scale
    const n = +SOURCE.split(':')[1], V = 6 * n * n + 2, N1 = n + 1, Q = Math.PI / 4;
    pos = new Float32Array(V * 3); index = new Uint32Array(12 * n * n * 3);
    const edge = new Map(); let nv = 0;
    const OCT = [[1.4, 0.25], [3.3, 0.11], [8, 0.04], [19, 0.015], [44, 0.006], [100, 0.0025], [220, 0.001]];
    const put = (f, i, j) => {
      const u = Math.tan(((2 * i) / n - 1) * Q), w = Math.tan(((2 * j) / n - 1) * Q), a = f >> 1, sg = f & 1 ? -1 : 1, d = [0, 0, 0];
      d[a] = sg; d[(a + 1) % 3] = u; d[(a + 2) % 3] = w; const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
      let r = 1; for (let k = 0; k < OCT.length; k++) { const [fq, am] = OCT[k]; r += am * 2 * (noise3(d[0] * fq + k, d[1] * fq + 2 * k, d[2] * fq, 77 + k) - 0.5); }
      pos[nv * 3] = d[0] * r * 0.35; pos[nv * 3 + 1] = d[1] * r * 0.35 + 0.5; pos[nv * 3 + 2] = d[2] * r * 0.35;   // about a unit across, its foot near 0
      return nv++;
    };
    const inner = new Int32Array(6 * (n - 1) * (n - 1)).fill(-1);
    const id = (f, i, j) => {
      if (i > 0 && i < n && j > 0 && j < n) { const q = f * (n - 1) * (n - 1) + (j - 1) * (n - 1) + (i - 1); return inner[q] >= 0 ? inner[q] : (inner[q] = put(f, i, j)); }
      const a = f >> 1, L = [0, 0, 0]; L[a] = f & 1 ? 0 : n; L[(a + 1) % 3] = i; L[(a + 2) % 3] = j;
      const key = L[0] + N1 * (L[1] + N1 * L[2]); let v = edge.get(key); if (v === undefined) edge.set(key, (v = put(f, i, j))); return v;
    };
    let ni = 0;
    for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = id(f, i, j), b = id(f, i + 1, j), c = id(f, i + 1, j + 1), d = id(f, i, j + 1), flip = (f & 1) === 1;   // wound alike on every face (the probe counts edges, it does not shade)
      if (flip) { index[ni++] = a; index[ni++] = c; index[ni++] = b; index[ni++] = a; index[ni++] = d; index[ni++] = c; }
      else { index[ni++] = a; index[ni++] = b; index[ni++] = c; index[ni++] = a; index[ni++] = c; index[ni++] = d; }
    }
    if (nv !== V) throw new Error(`ball: ${nv} vertices, expected ${V}`);
  }
  T.mesh = now() - t0;
}
const V = pos.length / 3, TRIS = index.length / 3;

// ---- helpers ----
const clustersOf = (buf, l2g) => {
  const out = [];
  for (let i = 0; i < buf.meshletCount; i++) {
    const vo = buf.meshlets[i * 4], to = buf.meshlets[i * 4 + 1], tc = buf.meshlets[i * 4 + 3], idx = new Uint32Array(tc * 3);
    for (let k = 0; k < tc * 3; k++) { const v = buf.vertices[vo + buf.triangles[to + k]]; idx[k] = l2g ? l2g[v] : v; }
    out.push(idx);
  }
  return out;
};
const sphereOf = (spheres) => {
  if (spheres.length === 1) return spheres[0];
  const c = new Float32Array(spheres.length * 3), r = new Float32Array(spheres.length);
  spheres.forEach((s, i) => { c[i * 3] = s.c[0]; c[i * 3 + 1] = s.c[1]; c[i * 3 + 2] = s.c[2]; r[i] = s.r; });
  const b = C.computeSphereBounds(c, 3, r, 1);
  return { c: [b.centerX, b.centerY, b.centerZ], r: b.radius };
};

// a sphere round a cluster's corners: their mean, and the farthest of them from it (worked out here: handing the whole
// mesh's vertices to the WebAssembly for every cluster copies them every time)
const ballOf = (idx) => {
  let x = 0, y = 0, z = 0; for (let k = 0; k < idx.length; k++) { const v = idx[k] * 3; x += pos[v]; y += pos[v + 1]; z += pos[v + 2]; }
  x /= idx.length; y /= idx.length; z /= idx.length; let r = 0;
  for (let k = 0; k < idx.length; k++) { const v = idx[k] * 3, d = Math.hypot(pos[v] - x, pos[v + 1] - y, pos[v + 2] - z); if (d > r) r = d; }
  return { c: [x, y, z], r };
};
// ---- the base clusters ----
let t0 = now();
const clusters = [];   // { idx (corners, vertices of the whole mesh), self: { err, c, r } (the group it was made from), parent: the group it is simplified in, level }
{
  // the whole mesh at once, or (TILE: so many triangles a piece, in the order the recipe made them: a worker would
  // cluster a mesh piece by piece as it is made, and several workers at once) piece by piece, each of its own vertices
  const TILE = +(process.env.TILE || 0), base = [];
  if (!TILE) base.push(...clustersOf(C.buildMeshletsFlex(index, pos, 3, MAXV, MINT, MAXT, 0, 2.0), null));
  else for (let t = 0; t < index.length; t += TILE * 3) {
    const part = index.subarray(t, Math.min(index.length, t + TILE * 3)), g2l = new Map(), l2g = [], lidx = new Uint32Array(part.length);
    for (let k = 0; k < part.length; k++) { const v = part[k]; let l = g2l.get(v); if (l === undefined) { l = l2g.length; g2l.set(v, l); l2g.push(v); } lidx[k] = l; }
    const lpos = new Float32Array(l2g.length * 3); for (let l = 0; l < l2g.length; l++) { const v = l2g[l]; lpos[l * 3] = pos[v * 3]; lpos[l * 3 + 1] = pos[v * 3 + 1]; lpos[l * 3 + 2] = pos[v * 3 + 2]; }
    base.push(...clustersOf(C.buildMeshletsFlex(lidx, lpos, 3, MAXV, MINT, MAXT, 0, 2.0), l2g));
  }
  for (const idx of base) clusters.push({ idx, self: { err: 0, ...ballOf(idx) }, parent: null, level: 0 });
}
T.base = now() - t0;

// ---- up the hierarchy ----
const levels = [{ level: 0, clusters: clusters.length, tris: TRIS, err: 0, stuck: 0 }];
let gone = 0;   // triangles of loose parts that ended (simplified to nothing)
let pending = clusters.map((_, i) => i), level = 0;
const vg = new Int32Array(V), lock = new Uint8Array(V), seen = new Int32Array(V).fill(-1);
while (pending.length > 1) {
  level++;
  // which clusters touch: by the vertices they share
  t0 = now();
  const users = new Map();   // vertex -> clusters of this level that use it (only kept where more than one does)
  { const first = new Int32Array(V).fill(-1);
    for (const ci of pending) { const idx = clusters[ci].idx; for (let k = 0; k < idx.length; k++) { const v = idx[k]; if (seen[v] === ci) continue; seen[v] = ci; if (first[v] < 0) first[v] = ci; else { let u = users.get(v); if (!u) users.set(v, (u = [first[v]])); u.push(ci); } } }
    seen.fill(-1); }
  const adj = new Map(); const link = (a, b) => { let m = adj.get(a); if (!m) adj.set(a, (m = new Map())); m.set(b, (m.get(b) ?? 0) + 1); };
  for (const u of users.values()) for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) { link(u[i], u[j]); link(u[j], u[i]); }
  // groups: grown from a seed by the neighbour that shares most with the group so far
  const groupOf = new Map(), groups = [];
  for (const seed of pending) {
    if (groupOf.has(seed)) continue;
    const g = [seed], gi = groups.length, score = new Map(); groupOf.set(seed, gi);
    const add = (c) => { for (const [n, w] of adj.get(c) ?? []) if (!groupOf.has(n)) score.set(n, (score.get(n) ?? 0) + w); };
    add(seed);
    while (g.length < GS && score.size) { let best = -1, bw = -1; for (const [n, w] of score) if (w > bw) { bw = w; best = n; } score.delete(best); if (groupOf.has(best)) continue; groupOf.set(best, gi); g.push(best); add(best); }
    groups.push(g);
  }
  // a group left small joins the neighbour group it shares most with
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]; if (!g.length || g.length >= GS / 2 || groups.length === 1) continue;
    const w = new Map(); for (const c of g) for (const [n, x] of adj.get(c) ?? []) { const o = groupOf.get(n); if (o !== gi) w.set(o, (w.get(o) ?? 0) + x); }
    let best = -1, bw = -1; for (const [o, x] of w) if (x > bw && groups[o].length + g.length <= GS * 2) { bw = x; best = o; }
    if (best >= 0) { for (const c of g) { groupOf.set(c, best); groups[best].push(c); } groups[gi] = []; }
  }
  const live = groups.filter((g) => g.length);
  // a vertex used by two groups is locked: neither group may move it, so their borders stay the same lines
  vg.fill(-1); lock.fill(0);
  live.forEach((g, gi) => { for (const ci of g) { const idx = clusters[ci].idx; for (let k = 0; k < idx.length; k++) { const v = idx[k]; if (vg[v] < 0) vg[v] = gi; else if (vg[v] !== gi) lock[v] = 1; } } });
  T.group += now() - t0;

  const next = []; let made = 0, stuck = 0, tris = 0, errMax = 0;
  for (const g of live) {
    // the group as one mesh of its own vertices
    let n = 0; for (const ci of g) n += clusters[ci].idx.length;
    const lidx = new Uint32Array(n), g2l = new Map(), l2g = []; let o = 0;
    for (const ci of g) { const idx = clusters[ci].idx; for (let k = 0; k < idx.length; k++) { const v = idx[k]; let l = g2l.get(v); if (l === undefined) { l = l2g.length; g2l.set(v, l); l2g.push(v); } lidx[o++] = l; } }
    const lpos = new Float32Array(l2g.length * 3), llock = new Uint8Array(l2g.length);
    for (let l = 0; l < l2g.length; l++) { const v = l2g[l]; lpos[l * 3] = pos[v * 3]; lpos[l * 3 + 1] = pos[v * 3 + 1]; lpos[l * 3 + 2] = pos[v * 3 + 2]; llock[l] = lock[v]; }
    t0 = now();
    const target = Math.floor((n / 3) * RATIO) * 3;
    const [out, err] = S.simplifyWithAttributes(lidx, lpos, 3, new Float32Array(0), 0, [], llock, target, 1e30, ['ErrorAbsolute']);
    T.simplify += now() - t0;
    if (out.length > n * STUCK) { stuck++; for (const ci of g) next.push(ci); tris += n / 3; continue; }   // it would not simplify: its clusters wait for another grouping
    let seenErr = err;
    if (MEASURED) {   // from every vertex the group had to the nearest triangle it has left (nothing left: to the group's middle, its whole reach)
      t0 = now(); let most = 0;
      const used = new Uint8Array(l2g.length); for (let k = 0; k < out.length; k++) used[out[k]] = 1;
      if (!out.length) { let cx = 0, cy = 0, cz = 0; for (let l = 0; l < l2g.length; l++) { cx += lpos[l * 3]; cy += lpos[l * 3 + 1]; cz += lpos[l * 3 + 2]; } cx /= l2g.length; cy /= l2g.length; cz /= l2g.length; for (let l = 0; l < l2g.length; l++) most = Math.max(most, (lpos[l * 3] - cx) ** 2 + (lpos[l * 3 + 1] - cy) ** 2 + (lpos[l * 3 + 2] - cz) ** 2); }
      else for (let l = 0; l < l2g.length; l++) { if (used[l]) continue; let best = Infinity; const x = lpos[l * 3], y = lpos[l * 3 + 1], z = lpos[l * 3 + 2]; for (let k = 0; k < out.length; k += 3) { const d = closest(x, y, z, lpos, out[k], out[k + 1], out[k + 2]); if (d < best) best = d; } if (best > most) most = best; }
      seenErr = Math.max(err, Math.sqrt(most)); T.measure += now() - t0;
    }
    t0 = now();
    if (process.env.SHOWGROUPS) console.log(`  level ${level} group of ${g.length}: ${n / 3} -> ${out.length / 3} triangles, the simplifier's error ${err.toExponential(2)}, measured ${seenErr.toExponential(2)}, locked ${llock.reduce((t, x) => t + x, 0)} of ${l2g.length} vertices`);
    const G = { err: Math.max(seenErr, ...g.map((ci) => clusters[ci].self.err * GROW)), ...sphereOf(g.map((ci) => clusters[ci].self)), level };
    if (MORPH && out.length) { const tm = now(); G.moved = movedOf(lidx, lpos, l2g, out, G.err); T.morph += now() - tm; }
    T.bounds += now() - t0;
    for (const ci of g) clusters[ci].parent = G;
    if (!out.length) { made++; gone += n / 3; continue; }   // a loose part so small that nothing is left of it (a peg, a rope): it ends here, drawn until its error shows no more
    t0 = now();
    const buf = out.length / 3 <= MAXT ? null : C.buildMeshletsFlex(out, lpos, 3, MAXV, MINT, MAXT, 0, 2.0);
    const parts = buf ? clustersOf(buf, l2g) : [out.map((l) => l2g[l])];
    T.split += now() - t0;
    for (const idx of parts) { clusters.push({ idx, self: G, parent: null, level }); next.push(clusters.length - 1); }
    made++; tris += out.length / 3; if (G.err > errMax) errMax = G.err;
  }
  levels.push({ level, clusters: next.length, tris, err: errMax, stuck });
  if (!made || level > 64) break;   // nothing would simplify any more
  pending = next;
}
// ---- the tail: one cluster is left. It is halved again and again, each time a group of one with nothing locked, down
// to a handful of triangles: what a thing a few pixels across is drawn with ----
const tail = [];
if (pending.length === 1) for (;;) {
  const ci = pending[0], c = clusters[ci], n = c.idx.length; if (n / 3 <= 8) break;
  const g2l = new Map(), l2g = [], lidx = new Uint32Array(n);
  for (let k = 0; k < n; k++) { const v = c.idx[k]; let l = g2l.get(v); if (l === undefined) { l = l2g.length; g2l.set(v, l); l2g.push(v); } lidx[k] = l; }
  const lpos = new Float32Array(l2g.length * 3); for (let l = 0; l < l2g.length; l++) { const v = l2g[l]; lpos[l * 3] = pos[v * 3]; lpos[l * 3 + 1] = pos[v * 3 + 1]; lpos[l * 3 + 2] = pos[v * 3 + 2]; }
  t0 = now();
  const target = Math.max(4, Math.floor((n / 3) * RATIO)) * 3;
  const [out, err] = S.simplifyWithAttributes(lidx, lpos, 3, new Float32Array(0), 0, [], null, target, 1e30, ['ErrorAbsolute']);
  T.simplify += now() - t0;
  if (out.length > n * STUCK || out.length < 12) break;
  level++;
  const G = { err: Math.max(err, c.self.err * GROW), c: c.self.c, r: c.self.r, level };
  if (MORPH) { const tm = now(); G.moved = movedOf(lidx, lpos, l2g, out, G.err); T.morph += now() - tm; }
  c.parent = G; clusters.push({ idx: out.map((l) => l2g[l]), self: G, parent: null, level }); pending = [clusters.length - 1];
  levels.push({ level, clusters: 1, tris: out.length / 3, err: G.err, stuck: 0 }); tail.push(out.length / 3);
}
const built = T.base + T.group + T.simplify + T.split + T.bounds + T.measure;

// ---- is it sound? every parent's error and sphere hold its children's ----
let unsound = 0;
for (const c of clusters) if (c.parent) { const P = c.parent, s = c.self; if (P.err < s.err - 1e-9 || Math.hypot(P.c[0] - s.c[0], P.c[1] - s.c[1], P.c[2] - s.c[2]) + s.r > P.r * 1.0005 + 1e-6) unsound++; }

// ---- the cut: what is drawn from a camera, at an error of tau pixels ----
const H = 779, W = 1440, K = H / (2 * Math.tan((68 / 2) * Math.PI / 180)), NEAR = 1e-3;   // the screen the game's own measurements were read on, the walker's lens
const pxOf = (G, cam) => (G.err * K) / Math.max(Math.hypot(G.c[0] - cam[0], G.c[1] - cam[1], G.c[2] - cam[2]) - G.r, NEAR);
const tanV = Math.tan((68 / 2) * Math.PI / 180), tanH = tanV * (W / H);
function cut(cam, tau, check = false) {
  // the camera looks along +z at the thing's middle (0, 0.5, 0)
  const fwd = [0 - cam[0], 0.5 - cam[1], 0 - cam[2]], fl = Math.hypot(...fwd); fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
  const right = [fwd[2], 0, -fwd[0]], rl = Math.hypot(...right) || 1; right[0] /= rl; right[2] /= rl;
  const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]].map((x) => -x);
  const inView = (c, r) => { const d = [c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]], z = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2], x = d[0] * right[0] + d[2] * right[2], y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2]; if (z < -r) return false; const kh = Math.hypot(1, tanH), kv = Math.hypot(1, tanV); return Math.abs(x) - z * tanH <= r * kh && Math.abs(y) - z * tanV <= r * kv; };
  let tris = 0, seenTris = 0, n = 0; const edges = check ? new Map() : null;
  for (const c of clusters) {
    if (c.self.err > 0 && pxOf(c.self, cam) > tau) continue;      // its own error still shows: something finer is drawn
    if (c.parent && pxOf(c.parent, cam) <= tau) continue;         // its parent's does not: the parent is drawn
    n++; tris += c.idx.length / 3;
    const b = c.own || (c.own = ballOf(c.idx));
    if (inView(b.c, b.r)) seenTris += c.idx.length / 3;
    if (check) for (let k = 0; k < c.idx.length; k += 3) for (let e = 0; e < 3; e++) { const a = c.idx[k + e], d = c.idx[k + ((e + 1) % 3)], key = a < d ? a * V + d : d * V + a, was = edges.get(key); edges.set(key, was === undefined ? 1 + c.level * 16 : (was & 15) < 15 ? was + 1 : was); }   // (how many triangles, and the level of the first cluster that had it)
  }
  let open = 0, pinched = 0; if (check) for (const [key, v] of edges) { const k = v & 15; if (k === 1) { if (!rimOf(v >> 4).has(key)) open++; } else if (k > 2) pinched++; }   // (an open surface's own rim: an edge the full mesh, too, has once; a rim is locked nowhere, so a cut's rim edge may be a new one: counted then, and said)   // open: an edge with one triangle (a crack); pinched: with more than two (two sheets the simplifier let touch)
  return { clusters: n, tris, seenTris, open, pinched };
}
// ---- how far a set of triangles really lies from the full mesh: from every vertex of the full mesh to the nearest
// point of the nearest triangle (of the thing's size): { rms, most } ----
function closest(px, py, pz, P, a, b, c) {   // squared distance from a point to triangle a b c (Ericson)
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
  const qx = apx - abx * u - acx * v, qy = apy - aby * u - acy * v, qz = apz - abz * u - acz * v;
  QX = px - qx; QY = py - qy; QZ = pz - qz;   // (the nearest point itself, for who wants it)
  return qx * qx + qy * qy + qz * qz;
}
const WORST = +(process.env.WORST || 0), far = [];
function deviation(P, lists, stride = 1, keep = null) {   // P: the triangles' own vertices; lists: their corners (several lists); stride: every n-th vertex of the full mesh; keep: each one's distance, written here
  let nT = 0; for (const l of lists) nT += l.length / 3;
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { if (pos[i + a] < lo[a]) lo[a] = pos[i + a]; if (pos[i + a] > hi[a]) hi[a] = pos[i + a]; }
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 1.5, N = Math.max(4, Math.min(96, Math.round(Math.sqrt(nT / 2)))), h = span / N, o = lo.map((x, a) => x - (span - (hi[a] - lo[a])) / 2);
  const cells = new Map(), cl = (x) => Math.max(0, Math.min(N - 1, Math.floor(x / h)));
  for (const l of lists) for (let k = 0; k < l.length; k += 3) {
    const a = l[k], b = l[k + 1], c = l[k + 2], mn = [0, 0, 0], mx = [0, 0, 0];
    for (let q = 0; q < 3; q++) { mn[q] = cl((Math.min(P[a * 3 + q], P[b * 3 + q], P[c * 3 + q]) - o[q])); mx[q] = cl((Math.max(P[a * 3 + q], P[b * 3 + q], P[c * 3 + q]) - o[q])); }
    for (let z = mn[2]; z <= mx[2]; z++) for (let y = mn[1]; y <= mx[1]; y++) for (let x = mn[0]; x <= mx[0]; x++) { const key = x + N * (y + N * z); let L = cells.get(key); if (!L) cells.set(key, (L = [])); L.push(a, b, c); }
  }
  let sq = 0, most = 0, n = 0;
  for (let i = 0; i < pos.length; i += 3 * stride) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2], cx = cl(x - o[0]), cy = cl(y - o[1]), cz = cl(z - o[2]); let best = Infinity;
    for (let R = 1; R <= N; R++) {   // rings of cells, until what was found is nearer than what a further ring could hold
      for (let dz = -R; dz <= R; dz++) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== R && R > 1) continue;
        const X = cx + dx, Y = cy + dy, Z = cz + dz; if (X < 0 || Y < 0 || Z < 0 || X >= N || Y >= N || Z >= N) continue;
        const L = cells.get(X + N * (Y + N * Z)); if (!L) continue;
        for (let k = 0; k < L.length; k += 3) { const d = closest(x, y, z, P, L[k], L[k + 1], L[k + 2]); if (d < best) best = d; }
      }
      if (best <= (R * h) * (R * h)) break;
    }
    if (keep) keep[n] = Math.sqrt(best);
    sq += best; if (best > most) most = best; n++; if (WORST) far.push([Math.sqrt(best), i / 3]);
  }
  if (WORST) { far.sort((x, y) => y[0] - x[0]); console.log(`  the ${WORST} vertices of the full mesh farthest from what is drawn (${nT} triangles): how far, then where (all of its size)`); for (const [d, v] of far.slice(0, WORST)) console.log(`    ${d.toFixed(4)}  at ${pos[v * 3].toFixed(3)} ${pos[v * 3 + 1].toFixed(3)} ${pos[v * 3 + 2].toFixed(3)}`); const over = [0.005, 0.02, 0.05].map((t) => far.filter((x) => x[0] > t).length); console.log(`    farther than 0.005: ${over[0]}, than 0.02: ${over[1]}, than 0.05: ${over[2]} of ${far.length}`); far.length = 0; }
  return { rms: Math.sqrt(sq / n), most: Math.sqrt(most), tris: nT };
}
const cutLists = (cam, tau) => clusters.filter((c) => !(c.self.err > 0 && pxOf(c.self, cam) > tau) && !(c.parent && pxOf(c.parent, cam) <= tau)).map((c) => c.idx);
// an open surface has edges of its own (a tent's door, a rope's sides): at each level, the edges with one triangle when
// the whole surface is drawn at that level alone. An edge with one triangle in a mixed cut is a crack unless it is such a rim
const RIMS = new Map();
const rimOf = (L) => {
  let R = RIMS.get(L); if (R) return R;
  const e = new Map();
  for (const c of clusters) { if (c.level > L || (c.parent && c.parent.level <= L)) continue; for (let k = 0; k < c.idx.length; k += 3) for (let q = 0; q < 3; q++) { const a = c.idx[k + q], d = c.idx[k + ((q + 1) % 3)], key = a < d ? a * V + d : d * V + a; e.set(key, (e.get(key) ?? 0) + 1); } }
  R = new Set(); for (const [key, v] of e) if (v === 1) R.add(key);
  RIMS.set(L, R); return R;
};
const ladderTris = (px) => { const H = ladderInfo || hand; if (!H) return null; for (const L of H) if (px > L.px) return L.tris; return 0; };
const SIZES = [4000, 2000, 1200, 800, 500, 400, 300, 200, 128, 90, 64, 32, 16, 8, 4, 2, 1];
const rows = SIZES.map((px) => {
  const D = K / px, cam = [0, 0.5, -D];   // a thing a unit across is px pixels across from D units away
  const r = { px, ladder: ladderTris(px) };
  for (const tau of [1, 2, 4]) { const c = cut(cam, tau, TRIS <= 2e6); r[`t${tau}`] = c.tris; r[`v${tau}`] = c.seenTris; r[`open${tau}`] = c.open; r[`pinched${tau}`] = c.pinched; }
  return r;
});
// EXPORT=file: what is drawn at 400 px and at 128 px across (the ladder's level, the cut at one and at two pixels), for a picture
if (process.env.EXPORT && hand) {
  const r5 = (a) => Array.from(a, (x) => Math.round(x * 1e5) / 1e5);
  const views = [400, 128].map((px) => {
    const cam = [0, 0.5, -K / px]; let l = 0; while (l < hand.length - 1 && !(px > hand[l].px)) l++;
    const cutOf = (tau) => { const corners = [], cl = [], lv = []; clusters.forEach((c, ci) => { if (c.self.err > 0 && pxOf(c.self, cam) > tau) return; if (c.parent && pxOf(c.parent, cam) <= tau) return; for (let k = 0; k < c.idx.length; k++) corners.push(c.idx[k]); for (let k = 0; k < c.idx.length / 3; k++) { cl.push(ci); lv.push(c.level); } }); return { tau, corners, cluster: cl, level: lv }; };
    return { px, ladder: { level: l, tris: hand[l].tris, P: r5(hand[l].P), index: Array.from(hand[l].index) }, cuts: [1, 2].map(cutOf) };
  });
  writeFileSync(process.env.EXPORT, JSON.stringify({ K, pos: r5(pos), full: Array.from(index), views }));
}
// the same from all round and from above, for cracks only
let openAll = 0, pinchedAll = 0, cutsChecked = 0;
if (TRIS <= 2e6) for (const px of [3000, 900, 350, 120, 40, 12, 3]) for (let a = 0; a < 6; a++) for (const y of [0.1, 0.5, 1.6]) { const D = K / px, th = (a / 6) * 2 * Math.PI + 0.3; const c = cut([Math.sin(th) * D, y, Math.cos(th) * D], 1 + (a % 3), true); openAll += c.open; pinchedAll += c.pinched; cutsChecked++; }


if (process.env.DEBUG) {
  for (let L = 0; L <= level; L++) { const e = new Map(); let n = 0; for (const c of clusters) if (c.level === L) { n++; for (let k = 0; k < c.idx.length; k += 3) for (let q = 0; q < 3; q++) { const a = c.idx[k + q], d = c.idx[k + ((q + 1) % 3)], key = a < d ? a * V + d : d * V + a; e.set(key, (e.get(key) ?? 0) + 1); } } let one = 0, many = 0; for (const v of e.values()) { if (v === 1) one++; else if (v > 2) many++; } console.log(`level ${L} whole: ${n} clusters, edges used once ${one}, more than twice ${many}`); }
  for (const r of rows) for (const t of [1, 2, 4]) if (r[`open${t}`]) console.log(`open at ${r.px} px, tau ${t}: ${r[`open${t}`]}`);
}
// ---- moving vertices inside the hierarchy (MORPH): a cluster is drawn part way to what its group is simplified to,
// all the way when its parent's error has come down to tau, not at all while that is BAND times tau or more ----
function drawn(cam, tau, morph) {
  const lists = [], P = morph ? Float32Array.from(pos) : pos, by = morph ? new Int32Array(V).fill(-1) : null; let clash = 0;
  clusters.forEach((c, ci) => {
    if (c.self.err > 0 && pxOf(c.self, cam) > tau) return; if (c.parent && pxOf(c.parent, cam) <= tau) return;
    lists.push(c.idx); if (!morph || !c.parent || !c.parent.moved) return;
    const w = Math.min(1, Math.max(0, (BAND * tau - pxOf(c.parent, cam)) / ((BAND - 1) * tau))), M = c.parent.moved;
    for (let k = 0; k < c.idx.length; k++) {
      const v = c.idx[k], t = M.get(v), x = t ? pos[v * 3] + (t[0] - pos[v * 3]) * w : pos[v * 3], y = t ? pos[v * 3 + 1] + (t[1] - pos[v * 3 + 1]) * w : pos[v * 3 + 1], z = t ? pos[v * 3 + 2] + (t[2] - pos[v * 3 + 2]) * w : pos[v * 3 + 2];
      if (by[v] >= 0 && by[v] !== ci) { const d = Math.hypot(P[v * 3] - x, P[v * 3 + 1] - y, P[v * 3 + 2] - z); if (d > clash) clash = d; }   // two clusters draw this vertex: at the same place?
      by[v] = ci; P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    }
  });
  // (a vertex a cluster does not move must not have been moved by another: where two groups meet nothing moves)
  if (morph) clusters.forEach((c, ci) => { if (c.self.err > 0 && pxOf(c.self, cam) > tau) return; if (c.parent && pxOf(c.parent, cam) <= tau) return; if (c.parent && c.parent.moved) return; for (let k = 0; k < c.idx.length; k++) { const v = c.idx[k], d = Math.hypot(P[v * 3] - pos[v * 3], P[v * 3 + 1] - pos[v * 3 + 1], P[v * 3 + 2] - pos[v * 3 + 2]); if (d > clash) clash = d; } });
  return { lists, P, clash };
}
let flight = null;
if (process.env.FLIGHT) {
  // a walk up to the thing: its size on screen from 20 px to 1200 px, a hundredth larger each step. At each step, how far
  // every 16th vertex of the full mesh lies from what is drawn; between two steps, the most that distance changed, in
  // pixels: what jumps in one step
  const STEP = +(process.env.STEP || 1.01), sizes = []; for (let px = 20; px <= 1200; px *= STEP) sizes.push(px);
  const nS = Math.ceil(V / 16); flight = [];
  let growMin = Infinity; for (const c of clusters) if (c.parent && c.self.err > 0) growMin = Math.min(growMin, c.parent.err / c.self.err);
  for (const tau of [1, 2, 4]) for (const morph of MORPH ? [false, true] : [false]) {
    let prev = null, jump = 0, at = 0, clash = 0, over = 0, sum = 0, worst = 0; const cur = new Float32Array(nS), jumps = [];
    for (const px of sizes) {
      const D = drawn([0, 0.5, -K / px], tau, morph), d = deviation(D.P, D.lists, 16, cur); if (D.clash > clash) clash = D.clash; if (d.most * px > worst) worst = d.most * px;
      if (prev) { let m = 0; for (let i = 0; i < nS; i++) { const x = Math.abs(cur[i] - prev[i]) * px; if (x > m) m = x; } jumps.push(m); sum += m; if (m > jump) { jump = m; at = px; } if (m > 0.5) over++; }
      prev = Float32Array.from(cur);
    }
    jumps.sort((x, y) => x - y);
    flight.push({ tau, morph, steps: sizes.length, largestJumpPx: jump, atPx: at, meanStepPx: sum / jumps.length, p95: jumps[Math.floor(jumps.length * 0.95)], stepsOverHalfAPixel: over, mostOffPx: worst, clash });
  }
  flight.growMin = growMin;
}
const truth = [];
if (hand && !process.env.NOTRUTH) {
  for (let l = 1; l < hand.length; l++) {   // level l takes over at the px where level l - 1 ends: its largest on screen
    const at = hand[l - 1].px, d = deviation(hand[l].P, [hand[l].index]), row = { px: at, ladder: { tris: d.tris, rmsPx: d.rms * at, mostPx: d.most * at } };
    for (const tau of [1, 2, 4]) { const c = deviation(pos, cutLists([0, 0.5, -K / at], tau)); row[`cut${tau}`] = { tris: c.tris, rmsPx: c.rms * at, mostPx: c.most * at }; }
    truth.push(row);
  }
}
const all = clusters.reduce((t, c) => t + c.idx.length / 3, 0);
let ownVerts = 0; { const mark = new Int32Array(V).fill(-1); clusters.forEach((c, ci) => { for (let k = 0; k < c.idx.length; k++) { const v = c.idx[k]; if (mark[v] !== ci) { mark[v] = ci; ownVerts++; } } }); }
const bytes = { at16: ownVerts * 16 + all * 3, mesh16: V * 16 + TRIS * 12 };   // a vertex of 16 bytes (the solids' make), a corner a byte inside a cluster; the full mesh as the heap keeps it today: 16 bytes a vertex, 4 a corner
const report = {
  source: SOURCE, vertices: V, triangles: TRIS, groupSize: GS,
  ms: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)])), builtMs: Math.round(built), trisPerSecond: Math.round(TRIS / (built / 1000)),
  clusters: clusters.length, trianglesInAllLevels: all, verticesClusterByCluster: ownVerts, bytes, timesTheMesh: +(all / TRIS).toFixed(3), levels, unsound,
  roots: clusters.filter((c) => !c.parent).length, rootTris: clusters.filter((c) => !c.parent).reduce((t, c) => t + c.idx.length / 3, 0),
  ladder: ladderInfo, rows, tail, truth, flight, fit, cracks: { openEdgesInRows: rows.reduce((t, r) => t + (r.open1 || 0) + (r.open2 || 0) + (r.open4 || 0), 0), pinchedEdgesInRows: rows.reduce((t, r) => t + (r.pinched1 || 0) + (r.pinched2 || 0) + (r.pinched4 || 0), 0), cutsAllRound: cutsChecked, openEdgesAllRound: openAll, pinchedEdgesAllRound: pinchedAll },
};
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(`${SOURCE}: ${V} vertices, ${TRIS} triangles; groups of ${GS}`);
console.log(`built in ${report.builtMs} ms (${report.trisPerSecond} triangles a second): base clusters ${report.ms.base}, grouping (JS) ${report.ms.group}, simplifying ${report.ms.simplify}, splitting ${report.ms.split}, bounds ${report.ms.bounds}; the mesh itself took ${report.ms.mesh}`);
console.log(`${clusters.length} clusters in ${levels.length} levels, ${all} triangles in all (${report.timesTheMesh} times the mesh); ${report.roots} at the top with ${report.rootTris} triangles; unsound parents: ${unsound}`);
if (gone) console.log(`loose parts that ended on the way (simplified to nothing): ${gone} triangles`);
console.log(`its vertices cluster by cluster: ${ownVerts} (${(ownVerts / clusters.length).toFixed(0)} a cluster, ${(ownVerts / V).toFixed(2)} times the mesh's); at 16 bytes a vertex and a byte a corner: ${(bytes.at16 / 1e6).toFixed(2)} MB, the full mesh alone as the heap keeps it ${(bytes.mesh16 / 1e6).toFixed(2)} MB`);
console.log('level  clusters  triangles  largest error (of its size)  stuck groups');
for (const L of levels) console.log(`${String(L.level).padStart(5)}  ${String(L.clusters).padStart(8)}  ${String(L.tris).padStart(9)}  ${L.err.toExponential(2).padStart(12)}  ${L.stuck}`);
if (ladderInfo) { console.log('the ladder today: level, squares an edge, drawn down to px, triangles, how far its vertices move to the next mesh (most, rms; of its size), that in pixels at the change'); for (const L of ladderInfo) console.log(`  ${L.l}  ${String(L.n).padStart(4)}  ${String(L.px).padStart(6)}  ${String(L.tris).padStart(7)}  ${L.moveMax.toFixed(4)}  ${L.moveRms.toFixed(4)}  ${(L.moveMax * L.px).toFixed(1)} px most, ${(L.moveRms * L.px).toFixed(1)} px rms`); }
console.log('size on screen (px)  ladder  | cut at 1 px (in view)  | at 2 px (in view)  | at 4 px (in view)');
for (const r of rows) console.log(`${String(r.px).padStart(8)}  ${String(r.ladder ?? '-').padStart(8)}  | ${String(r.t1).padStart(8)} (${String(r.v1).padStart(8)})  | ${String(r.t2).padStart(8)} (${String(r.v2).padStart(8)})  | ${String(r.t4).padStart(8)} (${String(r.v4).padStart(8)})`);
if (truth.length) { console.log('how far from the full mesh, in pixels (rms / most), and with how many triangles: the ladder\'s level where it takes over, and the cut at the same size'); for (const r of truth) console.log(`  at ${String(r.px).padStart(4)} px  ladder ${String(r.ladder.tris).padStart(6)} tris ${r.ladder.rmsPx.toFixed(2)} / ${r.ladder.mostPx.toFixed(2)}` + [1, 2, 4].map((t) => `  | cut ${t} px: ${String(r[`cut${t}`].tris).padStart(6)} tris ${r[`cut${t}`].rmsPx.toFixed(2)} / ${r[`cut${t}`].mostPx.toFixed(2)}`).join('')); }
if (tail.length) console.log(`the tail under one cluster: ${tail.join(', ')} triangles`);
if (MORPH) console.log(`moving vertices: where each lost vertex lies on its group's simplified surface found in ${Math.round(T.morph)} ms; a group moved all the way lies at most ${fit.most.toExponential(2)} of the thing's size from that surface (${fit.mostOfErr.toFixed(2)} of the group's own error at worst, ${(fit.sum / fit.n).toFixed(3)} of it on average), of ${fit.n} triangles; a lost vertex goes to ${TO === 'vertex' ? 'the nearest kept vertex along the mesh' : 'the nearest point of the simplified surface'}; a group's error at least ${GROW} times its children's; moving over the last ${BAND} times tau`);
if (flight) { console.log(`a walk up to it, ${flight[0].steps} steps from 20 px to 1200 px; the smallest growth of error from a group to its parent: ${flight.growMin.toFixed(3)} times`); console.log('  error (px)  vertices moved  | the largest change in one step (px), at size  | a step\'s largest change: mean, 95th of a hundred  | steps with a change over half a pixel  | the most any vertex is off (px)  | two clusters disagreeing on a vertex'); for (const f of flight) console.log(`  ${String(f.tau).padStart(6)}      ${f.morph ? 'yes' : 'no '}           | ${f.largestJumpPx.toFixed(3).padStart(7)} at ${String(Math.round(f.atPx)).padStart(5)} px          | ${f.meanStepPx.toFixed(3)}, ${f.p95.toFixed(3)}                    | ${String(f.stepsOverHalfAPixel).padStart(4)} of ${f.steps - 1}                      | ${f.mostOffPx.toFixed(2).padStart(6)}                  | ${f.clash.toExponential(1)}`); }
console.log(TRIS <= 2e6 ? `cracks: ${report.cracks.openEdgesInRows} open edges in the ${rows.length * 3} cuts above (${report.cracks.pinchedEdgesInRows} pinched), ${openAll} open in ${cutsChecked} more cuts from all round (${pinchedAll} pinched)` : 'cracks: not counted for a mesh this large');
