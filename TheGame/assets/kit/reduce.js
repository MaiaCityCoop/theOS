// A surface made coarser by itself (intent 0033, stage 2): the one way every solid's levels are made from its full mesh,
// whatever it is. Nothing of the asset is told: its triangles, each corner's normal and shade, and which corners must
// stay where they are (a seam, a border). Plain JS, no three: it runs in the recipes' worker.
//
// How: edges are folded one at a time, the cheapest first (Garland and Heckbert's quadric error: how far the surface
// would move), each fold moving a corner onto a neighbour that stays (a half-edge collapse), so every coarser mesh's
// corners are some of the finer one's and every corner knows which it was folded into: its place on the coarser mesh is
// exact. A fold is not made where it would turn a triangle over, tear the surface or move a border off itself.
//
//   chain(M, rooms) -> { meshAt(l), err: [the error each level has, of the thing's own size 1] }
//     M: { V, pos (3 a corner), nor (3), shade (1), index (3 a triangle), lock? (Uint8Array: 1 where a corner must not
//        move), extra?, k? (k numbers more a corner, its colour: carried as its shade is) }, of the thing's own size 1
//     rooms: [{ tris, verts, err }] the coarser levels, finest first: each as coarse as its error allows (err, of size 1),
//        and at least as coarse as its room
//     meshAt(l) -> { V, pos, nor, shade, index, to: { pos, nor } (each corner's place and normal on level l + 1's mesh,
//        its own where there is none), src (which of M's corners each is) }; level 0 is M itself
//
// A coarser level's corners are where they were, moved along their normal to the mean of all they stand for (so a few
// corners on a round thing do not cut into it: what took a swelling written by hand before, assets/kit/blob.js SWELL),
// with that mean's normal and shade. Level l at its coarser end is level l + 1 exactly, corner for corner: a level that
// turns into the next one has nothing to hand over.
import { LADDER, DOTN, trisOf, vertsOf } from './ladder.js';
import { packSolid, dotMesh } from './solid.js';

/** How much a fold's travel weighs against the surface's move (squared lengths alike). */
const TRAVEL = 0.004;
/** The levels of M, made coarser by itself, room by room. */
export function chain(M, rooms) {
  const { V, pos, index } = M, T = index.length / 3, lock = M.lock ?? new Uint8Array(V);
  const tv = Int32Array.from(index), alive = new Uint8Array(T).fill(1); let vt = Array.from({ length: V }, () => []);
  for (let t = 0; t < T; t++) for (let j = 0; j < 3; j++) vt[tv[t * 3 + j]].push(t);
  // each corner's quadric (10 numbers of a symmetric 4 × 4) and the area it stands for
  const Q = new Float64Array(V * 10), area = new Float64Array(V), fn = new Float64Array(T * 3);
  const addPlane = (v, a, b, c, d, w) => { const q = v * 10; Q[q] += w * a * a; Q[q + 1] += w * a * b; Q[q + 2] += w * a * c; Q[q + 3] += w * a * d; Q[q + 4] += w * b * b; Q[q + 5] += w * b * c; Q[q + 6] += w * b * d; Q[q + 7] += w * c * c; Q[q + 8] += w * c * d; Q[q + 9] += w * d * d; };
  const nrm = (t, out) => {
    const a = tv[t * 3] * 3, b = tv[t * 3 + 1] * 3, c = tv[t * 3 + 2] * 3, ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
    out[0] = uy * wz - uz * wy; out[1] = uz * wx - ux * wz; out[2] = ux * wy - uy * wx; return out;
  };
  const n3 = [0, 0, 0];
  for (let t = 0; t < T; t++) {
    nrm(t, n3); const l = Math.hypot(n3[0], n3[1], n3[2]); if (l < 1e-20) continue;
    const a = n3[0] / l, b = n3[1] / l, c = n3[2] / l, p = tv[t * 3] * 3, d = -(a * pos[p] + b * pos[p + 1] + c * pos[p + 2]), w = l / 2;
    fn[t * 3] = a; fn[t * 3 + 1] = b; fn[t * 3 + 2] = c;
    for (let j = 0; j < 3; j++) { addPlane(tv[t * 3 + j], a, b, c, d, w); area[tv[t * 3 + j]] += w / 3; }
  }
  // a border (an edge of one triangle) is kept: a plane through it, upright to its triangle, weighs on its corners
  const border = new Uint8Array(V), ek = (a, b) => (a < b ? a * V + b : b * V + a), edges = new Map();
  for (let t = 0; t < T; t++) for (let j = 0; j < 3; j++) { const k = ek(tv[t * 3 + j], tv[t * 3 + (j + 1) % 3]); edges.set(k, (edges.get(k) ?? 0) + 1); }
  for (let t = 0; t < T; t++) for (let j = 0; j < 3; j++) {
    const a = tv[t * 3 + j], b = tv[t * 3 + (j + 1) % 3]; if (edges.get(ek(a, b)) !== 1) continue;
    border[a] = border[b] = 1;
    const ex = pos[b * 3] - pos[a * 3], ey = pos[b * 3 + 1] - pos[a * 3 + 1], ez = pos[b * 3 + 2] - pos[a * 3 + 2], el = Math.hypot(ex, ey, ez) || 1;
    let px = ey * fn[t * 3 + 2] - ez * fn[t * 3 + 1], py = ez * fn[t * 3] - ex * fn[t * 3 + 2], pz = ex * fn[t * 3 + 1] - ey * fn[t * 3]; const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    const d = -(px * pos[a * 3] + py * pos[a * 3 + 1] + pz * pos[a * 3 + 2]), w = el * el * 4;
    addPlane(a, px, py, pz, d, w); addPlane(b, px, py, pz, d, w);
  }
  edges.clear();
  const qAt = (u, v, x, y, z) => { const a = u * 10, b = v * 10; const q = (i) => Q[a + i] + Q[b + i]; return q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9); };
  // the corners round u (from its live triangles), and how many live triangles hold both u and v
  const ring = (u, out) => { out.length = 0; for (const t of vt[u]) if (alive[t]) for (let j = 0; j < 3; j++) { const w = tv[t * 3 + j]; if (w !== u && !out.includes(w)) out.push(w); } return out; };
  const RU = [], RV = []; let QE = 0;   // (QE: the last fold's own error, its cost without its travel)
  // what folding u onto v costs (Infinity: it may not be folded)
  const cost = (u, v, ru = ring(u, RU)) => {
    if (lock[u] || (border[u] && !border[v])) return Infinity;
    let shared = 0; for (const t of vt[u]) if (alive[t] && (tv[t * 3] === v || tv[t * 3 + 1] === v || tv[t * 3 + 2] === v)) shared++;
    if (border[u] && shared !== 1) return Infinity;   // (a border corner moves along its border only)
    ring(v, RV); let common = 0; for (const w of ru) if (RV.includes(w)) common++;
    if (common !== shared) return Infinity;   // (the surface would be torn: more than the edge's own triangles meet the two)
    const vx = pos[v * 3], vy = pos[v * 3 + 1], vz = pos[v * 3 + 2];
    for (const t of vt[u]) {
      if (!alive[t]) continue; const a = tv[t * 3], b = tv[t * 3 + 1], c = tv[t * 3 + 2]; if (a === v || b === v || c === v) continue;
      // the triangle with u at v: not turned over, not to nothing
      const P = (w) => (w === u ? v : w), A = P(a) * 3, B = P(b) * 3, C = P(c) * 3;
      const ux = pos[B] - pos[A], uy = pos[B + 1] - pos[A + 1], uz = pos[B + 2] - pos[A + 2], wx = pos[C] - pos[A], wy = pos[C + 1] - pos[A + 1], wz = pos[C + 2] - pos[A + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-14) return Infinity;
      nrm(t, n3); const ol = Math.hypot(n3[0], n3[1], n3[2]) || 1;
      if ((nx * n3[0] + ny * n3[1] + nz * n3[2]) / (nl * ol) < 0.25) return Infinity;
    }
    // (what it costs: how far the surface moves, and a little for how far the corner travels, so that of folds alike the
    // short ones come first: a corner then has a short way to its place on the coarser level, packed finely)
    QE = Math.max(0, qAt(u, v, vx, vy, vz)) / Math.max(1e-12, area[u] + area[v]);
    const ex = pos[u * 3] - vx, ey = pos[u * 3 + 1] - vy, ez = pos[u * 3 + 2] - vz;
    return QE + TRAVEL * (ex * ex + ey * ey + ez * ez);
  };
  // a queue of the cheapest fold of each corner (stale entries skipped by their version)
  let hk = new Float64Array(1024), hu = new Int32Array(1024), hv = new Int32Array(1024), hn = 0;
  const ver = new Int32Array(V), best = new Int32Array(V).fill(-1), bestK = new Float64Array(V).fill(Infinity), RW = [];
  const push = (k, u, vv) => {
    if (hn === hk.length) { const g = (A, C) => { const B = new C(A.length * 2); B.set(A); return B; }; hk = g(hk, Float64Array); hu = g(hu, Int32Array); hv = g(hv, Int32Array); }
    let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hu[i] = hu[p]; hv[i] = hv[p]; i = p; }
    hk[i] = k; hu[i] = u; hv[i] = vv;
  };
  const pop = () => {
    const k = hk[0], u = hu[0], vv = hv[0], lk = hk[--hn], lu = hu[hn], lv = hv[hn]; let i = 0;
    for (;;) { let c = i * 2 + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= lk) break; hk[i] = hk[c]; hu[i] = hu[c]; hv[i] = hv[c]; i = c; }
    hk[i] = lk; hu[i] = lu; hv[i] = lv; return [k, u, vv];
  };
  const R0 = [];
  const judge = (u) => {
    ver[u]++; let bk = Infinity, bv = -1;
    if (lock[u]) { best[u] = -1; bestK[u] = Infinity; return; }
    ring(u, R0); for (let i = 0; i < R0.length; i++) { const k = cost(u, R0[i], R0); if (k < bk) { bk = k; bv = R0[i]; } }
    best[u] = bv; bestK[u] = bk; if (bv >= 0) push(bk, u, ver[u]);
  };
  for (let u = 0; u < V; u++) judge(u);
  // fold until nothing more may be: each corner's step, and onto which
  const dieAt = new Int32Array(V).fill(0x7fffffff), parent = new Int32Array(V).fill(-1), errAt = [0], trisAt = [T], vertsAt = [V];
  let tris = T, verts = V, step = 0, worst = 0;
  const last = rooms[rooms.length - 1];
  while (hn && (tris > last.tris || verts > last.verts || worst <= last.err)) {   // (to the last room, and on while the last level's error allows)
    const [k, u, vv] = pop(); if (vv !== ver[u] || dieAt[u] !== 0x7fffffff) continue;
    const v = best[u]; if (v < 0 || dieAt[v] !== 0x7fffffff) { judge(u); continue; }
    const kk = cost(u, v), qe = QE; if (kk === Infinity || kk > k * 1.0001 + 1e-15) { judge(u); continue; }   // (barred, or dearer, since it was queued: its best again)
    if (tris <= last.tris && verts <= last.verts && Math.sqrt(qe) > last.err) break;   // (within its room, and the next fold would cost the last level more than it may lose)
    // fold u onto v
    step++; dieAt[u] = step; parent[u] = v;
    for (const t of vt[u]) {
      if (!alive[t]) continue;
      if (tv[t * 3] === v || tv[t * 3 + 1] === v || tv[t * 3 + 2] === v) { alive[t] = 0; tris--; continue; }
      for (let j = 0; j < 3; j++) if (tv[t * 3 + j] === u) tv[t * 3 + j] = v;
      vt[v].push(t);
    }
    for (let i = 0; i < 10; i++) Q[v * 10 + i] += Q[u * 10 + i];
    area[v] += area[u]; verts--; vt[u] = [];
    vt[v] = vt[v].filter((t) => alive[t]);
    worst = Math.max(worst, Math.sqrt(qe)); errAt.push(worst); trisAt.push(tris); vertsAt.push(verts);
    // (v is judged anew; a corner round it only where its best was u or v, or folding it onto v is now cheaper:
    // any other fold of it that has grown dearer or been barred is found so when it comes up, and judged then)
    judge(v);
    for (const w of ring(v, RW)) { if (best[w] === u || best[w] === v || best[w] < 0) { judge(w); continue; } const k2 = cost(w, v); if (k2 < bestK[w]) { ver[w]++; best[w] = v; bestK[w] = k2; push(k2, w, ver[w]); } }
  }
  vt = null; hk = hu = hv = null;   // (what the folding worked with: not kept with the levels)
  // each level's step: as coarse as its error allows, and at least as coarse as its room
  const steps = [0]; let at = 0;
  for (const r of rooms) {
    let s = at; while (s < step && (trisAt[s] > r.tris || vertsAt[s] > r.verts)) s++;
    while (s < step && errAt[s + 1] <= r.err) s++;
    if (trisAt[s] > r.tris || vertsAt[s] > r.verts) throw new Error(`reduce: no coarser than ${trisAt[s]} triangles, ${vertsAt[s]} corners (room: ${r.tris}, ${r.verts})`);   // (rooms of Infinity: by its error alone)
    steps.push((at = s));
  }
  const anc = (u, s) => { while (dieAt[u] <= s) u = parent[u]; return u; };
  // a level's corners (what they stand for, measured on M), cached
  const LV = [];
  const levelAt = (l) => {
    if (LV[l]) return LV[l];
    const s = steps[l], to = new Int32Array(V), local = new Int32Array(V).fill(-1), src = [];
    for (let u = 0; u < V; u++) { to[u] = anc(u, s); if (to[u] === u) { local[u] = src.length; src.push(u); } }
    const n = src.length, P = new Float32Array(n * 3), N = new Float32Array(n * 3), S = new Float32Array(n), W = new Float64Array(n), sn = new Float64Array(n * 3), off = new Float64Array(n), K = M.k ?? 0, X = new Float32Array(n * K), sx = new Float64Array(n * K);
    const MN = M.nor, MX = M.extra;
    for (let u = 0; u < V; u++) { const i = local[to[u]], a = area[u] || 1e-9; sn[i * 3] += MN[u * 3] * a; sn[i * 3 + 1] += MN[u * 3 + 1] * a; sn[i * 3 + 2] += MN[u * 3 + 2] * a; S[i] += M.shade[u] * a; W[i] += a; for (let k = 0; k < K; k++) sx[i * K + k] += MX[u * K + k] * a; }
    for (let i = 0; i < n; i++) { const l = Math.hypot(sn[i * 3], sn[i * 3 + 1], sn[i * 3 + 2]) || 1; N[i * 3] = sn[i * 3] / l; N[i * 3 + 1] = sn[i * 3 + 1] / l; N[i * 3 + 2] = sn[i * 3 + 2] / l; S[i] /= W[i]; for (let k = 0; k < K; k++) X[i * K + k] = sx[i * K + k] / W[i]; }
    if (l) for (let u = 0; u < V; u++) { const i = local[to[u]], o = to[u] * 3; off[i] += ((pos[u * 3] - pos[o]) * N[i * 3] + (pos[u * 3 + 1] - pos[o + 1]) * N[i * 3 + 1] + (pos[u * 3 + 2] - pos[o + 2]) * N[i * 3 + 2]) * (area[u] || 1e-9); }
    for (let i = 0; i < n; i++) { const u = src[i], k = l && !lock[u] && !border[u] ? off[i] / W[i] : 0; for (let a = 0; a < 3; a++) P[i * 3 + a] = pos[u * 3 + a] + N[i * 3 + a] * k; }
    if (!l) { P.set(pos); N.set(MN); S.set(M.shade); if (K) X.set(MX); }
    const idx = [], face = [];   // (face: which of M's triangles each of its own is)
    for (let t = 0; t < T; t++) { const a = local[to[index[t * 3]]], b = local[to[index[t * 3 + 1]]], c = local[to[index[t * 3 + 2]]]; if (a !== b && b !== c && a !== c) { idx.push(a, b, c); face.push(t); } }
    return (LV[l] = { V: n, pos: P, nor: N, shade: S, extra: X, index: Uint32Array.from(idx), face: Int32Array.from(face), src: Int32Array.from(src), to, local });
  };
  return {
    err: steps.map((s) => errAt[s]), tris: steps.map((s) => trisAt[s]), levels: steps.length,
    meshAt(l) {
      const A = levelAt(l), B = l + 1 < steps.length ? levelAt(l + 1) : A, K = M.k ?? 0, tp = new Float32Array(A.V * 3), tn = new Float32Array(A.V * 3), ts = new Float32Array(A.V), tx = new Float32Array(A.V * K);
      for (let i = 0; i < A.V; i++) { const j = B === A ? i : B.local[B.to[A.src[i]]]; for (let a = 0; a < 3; a++) { tp[i * 3 + a] = B.pos[j * 3 + a]; tn[i * 3 + a] = B.nor[j * 3 + a]; } ts[i] = B.shade[j]; for (let k = 0; k < K; k++) tx[i * K + k] = B.extra[j * K + k]; }
      return { V: A.V, pos: A.pos, nor: A.nor, shade: A.shade, extra: A.extra, index: A.index, face: A.face, src: A.src, local: A.local, to: { pos: tp, nor: tn, shade: ts, extra: tx } };
    },
  };
}

// ---- the ladder's levels (assets/kit/ladder.js) of any solid, from its full mesh alone ----

/** How far a level's corner may lie from its place on the next coarser level (of the thing's size 1), where its levels
    are made by chain(): the range its way there is packed in (solid.js), 10 bits over it. Measured over the rocks'
    24 shapes, with a little to spare (their farthest: 0.07, 0.13, 0.23, 0.33, 0.41, 0.53): the finest level's way is
    packed to a six-thousandth of the thing, under a tenth of a pixel where it gives way to the next. A corner that would
    go further stops short (solid.js counts it: cut). */
export const DELTA = [0.08, 0.16, 0.26, 0.38, 0.48, 0.62, 0, 0];
/** The error a level may have where it is first drawn (the top of its band), in the game's pixels: half of one, so a
    screen of two pixels to each of the game's (4K) sees at most one. Its room (the ladder's) caps it. */
export const E_PX = 0.5;
const ROOMS = LADDER.slice(1).filter((l) => l.n > 0).map((l, i) => ({ tris: trisOf(l.n), verts: vertsOf(l.n), err: E_PX / LADDER[i].px }));

/** The ladder's levels of a solid made from its full mesh (M as chain() takes it): chain()'s, a level each mesh rung. */
export const ladderOf = (M) => chain(M, ROOMS);
/** Level l of the ladder of C (ladderOf's), packed as the heap takes a solid (solid.js): each corner with its place and
    normal on the next coarser level. bones(i, out): the bones that move M's corner i, [a, b, w] (none: it stands). */
export function ladderMesh(C, l, bones = null) {
  if (LADDER[l].n === DOTN) return dotMesh();
  const m = C.meshAt(l), D = l + 1 < C.levels ? DELTA[l] : 0, verts = new Uint32Array(m.V * 4), P = m.pos, N = m.nor, TP = m.to.pos, TN = m.to.nor, TS = m.to.shade, B = [0, 0, 0];
  for (let i = 0; i < m.V; i++) {
    const o = i * 3; if (bones) bones(m.src[i], B);
    // (on no skeleton: its coarse normal and shade as fine as the coarser level's own, solid.js `still`)
    packSolid(verts, i * 4, P[o], P[o + 1], P[o + 2], N[o], N[o + 1], N[o + 2], m.shade[i], TP[o], TP[o + 1], TP[o + 2], TN[o], TN[o + 1], TN[o + 2], D, B[0], B[1], B[2], bones ? null : TS[i]);
  }
  return { index: m.index, verts };
}
