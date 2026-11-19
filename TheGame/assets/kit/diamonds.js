// A ball's cluster hierarchy by diamonds (intent 0038, stage 8b): the record assets/kit/clusters.js builds for any mesh
// by simplifying it, built here for a surface that is a grid already (a ball cut as a cube's faces, each point of the
// cube's lattice a direction pulled out to the surface: assets/kit/blob.js ball) by halving the grid, many times faster
// than the simplifier where the mesh is large; its coarse end, where halving a grid loses what the simplifier keeps (a
// crest, a tip), the simplifier's own (clusters.js tailFrom). The same record, so the one path from there on (surface.js
// packLevel, the cut: src/scatter/cut.js). Plain JS, no three: it runs in the recipes' workers and in node.
//
//   ballHierarchy(at, N) -> { clusters, V, k, M, stats }    clusters.js build's (k = 1: the shade)
//     at(n): the surface as drawn with n squares along a cube's edge (n need not be whole; fewer: the same shape,
//     smoother), as ball() takes it: (x, y, z, out, o) of a direction, the point there written to out[o …], its shade
//     returned. N: the squares along an edge of the full mesh, a power of two.
//
// How. The ball's triangles are a bintree (the 4-8 mesh): each face of the cube cut in two along a diagonal, then every
// triangle halved across its long side, level by level; triangle i's halves are 2i and 2i + 1 a level down, so what
// lies in a triangle d levels down is a run of 2^d. Two triangles that share their long side are a diamond.
//   - A level: the whole ball at a level L of the bintree, from the full mesh's (2 log2 N) on, its vertices on
//     at(2^(L/2)), save on the border of the group that made it: there each is what it was a level finer (a group's
//     border is locked, as clusters.js locks it, so neighbours drawn at different levels meet).
//   - A group: a diamond of level L - D, made of the four triangles of level L - D + 1 within it as drawn a level finer,
//     made into its own two at level L, each two clusters (DEPTH: D levels down a triangle is two runs of the most
//     triangles a cluster holds, surface.js MAXT). A diamond's sides are its triangles' short ones, each its parent's
//     long side's half or its middle, so inside a diamond a level coarser: every border is let go a level up, as
//     clusters.js's regrouping lets it go. And with D even a short side holds the same vertices a level finer (the
//     bintree adds the middles of long sides only, and those of a triangle's small ones D levels down lie inside it): a
//     group keeps its border with no triangle more.
//   - Where the grid's groups end: the faces' own diamonds, at level D (12 · 2^D triangles, 3072 with MAXT 128). Coarser,
//     the grid has no group but the whole ball, halved all alike, and the simplifier, choosing what to keep, needs a
//     half to a fifth of its triangles at the same error (measured on the zoo's kinds): from there clusters.js makes the
//     rest, as its own builds end (tailFrom), each level's error never less than BAND times what it was made of.
//   - Its error: measured against the full mesh at each of the full mesh's vertices, where that vertex lies on the level
//     (the same place of the cube: a level's triangles are made of the finer ones'), how far apart the two are and how
//     far the shading looks moved (clusters.js's measure: a normal δ off, or a shade, over the way r from the nearest
//     corner, where it is right: δ r NW), never less than BAND times its parts'. Both are flat over each triangle of the
//     full mesh, so the full mesh's vertices hold the most their places lie apart.
//   - Its sphere holds its parts' and its own vertices (and so the way its parts move: to a surface within it).
//   - Each vertex keeps where it lies on the level a step coarser (the cut's morph); one on that level's border stays.
import { BAND } from '../../src/detail/error.js';
import { RAMP } from './physics.js';
import { MAXT, tailOf } from './surface.js';

/** A quarter turn's half (π/4): what the cube's lattice is turned by (warp). */
export const Q = 0.7853981634;
/** Where a ball's point t of n along an edge of the cube looks, along that axis (-1 … 1): the cube's lattice warped so
    that its squares cover the ball evenly. */
export const warp = (t, n) => Math.tan(((2 * t) / n - 1) * Q);
// (clusters.js's weights of a normal's and a shade's error: what they look like moved, RAMP)
const NW = RAMP, CW = NW;
/** A group's depth (above): even, its triangles each two runs of no more than MAXT. */
const DEPTH = 2 * Math.floor((Math.log2(MAXT) + 1) / 2);

/** The cluster hierarchy of a ball whose surface is at(n), N squares along an edge at full detail (above). */
export function ballHierarchy(at, N) {
  const G = geometryOf(N), { LM } = G, vals = [], levels = [], off = [];
  let V = 0;
  for (let L = LM; L >= DEPTH; L--) { vals[L] = valuesAt(G, L, at(2 ** (L / 2)), vals[L + 1]); off[L] = V; V += G.ids[L].length; }
  const M = { V, k: 1, pos: new Float32Array(V * 3), nor: new Float32Array(V * 3), attr: new Float32Array(V) };
  for (let L = LM; L >= DEPTH; L--) { M.pos.set(vals[L].pos, off[L] * 3); M.nor.set(vals[L].nor, off[L] * 3); M.attr.set(vals[L].sh, off[L]); levels[L] = clustersAt(G, L, L > DEPTH ? placesOn(G, L, vals) : null, off[L]); }
  // the finest: each its own sphere, nothing lost; then level by level, its groups' numbers
  for (const c of levels[LM]) c.self = { err: 0, ...sphereOf(M.pos, c.verts) };
  for (let L = LM - 1; L >= DEPTH; L--) {
    const groups = groupsAt(G, L, levels, M.pos, errorsAt(G, L, vals));
    levels[L].forEach((c, i) => { c.self = groups[selfOf(G, L, i)]; });
    levels[L + 1].forEach((c, i) => { c.parent = groups[parentOf(G, L + 1, i)]; });
  }
  // the coarse end: the simplifier's, from the faces' diamonds' clusters (their records come back first, each with its
  // way to the first level it makes)
  const T = tailOf(M, levels[DEPTH].map((c) => ({ idx: Uint32Array.from(c.tris, (t) => c.verts[t]), self: c.self })));
  return { clusters: [...levels.slice(DEPTH + 1).reverse().flat(), ...T.clusters], V, k: 1, M, stats: { N, levels: LM - DEPTH + 1 + T.stats.levels } };
}

// ---- a ball of N squares an edge as a bintree, the same for every surface: kept by N ----
const GEOMETRY = new Map();
/** { LM (the full mesh's level), V (its vertices), xyz (each vertex's place on the cube's lattice, 0 … N an axis), dir
    (where it looks), tri[L] (each level's triangles: apex, long side), ids[L] (from level DEPTH: each level's vertices)
    and localOf[L] (a vertex's number among them, or -1), locked[L] (1 where a vertex lies on the border of level L's
    groups), diamond[L] (each triangle of level L - DEPTH: its group's number), canon (each vertex: a triangle of the
    full mesh it is a corner of) }. */
function geometryOf(N) {
  let G = GEOMETRY.get(N); if (G) return G;
  const S = N + 1, LM = Math.round(2 * Math.log2(N)), idOf = new Int32Array(S * S * S).fill(-1), xyz = [];
  if (2 ** (LM / 2) !== N || LM < DEPTH) throw new Error(`diamonds: ${N} squares an edge, not a power of two of ${2 ** (DEPTH / 2)} or more`);
  const id = (x, y, z) => { const k = x + S * (y + S * z); if (idOf[k] < 0) { idOf[k] = xyz.length / 3; xyz.push(x, y, z); } return idOf[k]; };
  const { tri, centre } = bintree(N, LM, id, xyz), V = xyz.length / 3, P = Int32Array.from(xyz);
  G = { N, LM, V, xyz: P, tri, dir: directions(P, N), ...levelsOf(tri, V), diamond: [], locked: [], canon: new Int32Array(V).fill(-1) };
  for (let p = 0; p + DEPTH < LM; p++) { G.diamond[p + DEPTH] = pairs(centre[p], V); G.locked[p + DEPTH] = legsOf(tri[p], P, (x, y, z) => idOf[x + S * (y + S * z)], V); }
  const T = tri[LM];
  for (let i = 0; i < T.length; i++) if (G.canon[T[i]] < 0) G.canon[T[i]] = (i / 3) | 0;
  GEOMETRY.set(N, G);
  return G;
}
/** The bintree's levels: tri[L] (apex, then its long side's ends, wound outwards: three a triangle), centre[L] (each
    triangle's long side's middle, a vertex of the next level). */
function bintree(N, LM, id, xyz) {
  const base = [];
  for (let a = 0; a < 3; a++) for (const s of [N, 0]) {   // (each face cut along its diagonal q00 - q11)
    const q = (i, j) => { const p = [0, 0, 0]; p[a] = s; p[(a + 1) % 3] = i * N; p[(a + 2) % 3] = j * N; return id(p[0], p[1], p[2]); };
    base.push(...outwards(xyz, N, q(1, 0), q(1, 1), q(0, 0)), ...outwards(xyz, N, q(0, 1), q(0, 0), q(1, 1)));
  }
  const tri = [Int32Array.from(base)], centre = [];
  for (let L = 0; L < LM; L++) {
    const T = tri[L], n = T.length / 3, C = new Int32Array(n), U = new Int32Array(n * 6);
    for (let t = 0; t < n; t++) {
      const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2], m = id((xyz[b * 3] + xyz[c * 3]) / 2, (xyz[b * 3 + 1] + xyz[c * 3 + 1]) / 2, (xyz[b * 3 + 2] + xyz[c * 3 + 2]) / 2);
      C[t] = m; U[t * 6] = m; U[t * 6 + 1] = c; U[t * 6 + 2] = a; U[t * 6 + 3] = m; U[t * 6 + 4] = a; U[t * 6 + 5] = b;   // (its halves: m c a, m a b)
    }
    centre.push(C); tri.push(U);
  }
  return { tri, centre };
}
// a triangle (apex a, long side b c) wound to face out of the cube
const outwards = (xyz, N, a, b, c) => {
  const P = (v, i) => xyz[v * 3 + i], u = [0, 1, 2].map((i) => P(b, i) - P(a, i)), w = [0, 1, 2].map((i) => P(c, i) - P(a, i)), m = [0, 1, 2].map((i) => (P(a, i) + P(b, i) + P(c, i)) / 3 - N / 2);
  const out = (u[1] * w[2] - u[2] * w[1]) * m[0] + (u[2] * w[0] - u[0] * w[2]) * m[1] + (u[0] * w[1] - u[1] * w[0]) * m[2] >= 0;
  return out ? [a, b, c] : [a, c, b];
};
// where each vertex looks: the cube's lattice warped (warp), ±1 on its faces
function directions(xyz, N) {
  const dir = new Float64Array(xyz.length), w = (t) => (t === 0 ? -1 : t === N ? 1 : warp(t, N));
  for (let v = 0; v < xyz.length; v += 3) {
    const x = w(xyz[v]), y = w(xyz[v + 1]), z = w(xyz[v + 2]), l = Math.sqrt(x * x + y * y + z * z);
    dir[v] = x / l; dir[v + 1] = y / l; dir[v + 2] = z / l;
  }
  return dir;
}
// each grid level's vertices (from DEPTH on), and each vertex's number among them
function levelsOf(tri, V) {
  const ids = [], localOf = [];
  for (let L = DEPTH; L < tri.length; L++) {
    const T = tri[L], loc = new Int32Array(V).fill(-1), list = [];
    for (let i = 0; i < T.length; i++) if (loc[T[i]] < 0) { loc[T[i]] = list.length; list.push(T[i]); }
    ids[L] = Int32Array.from(list); localOf[L] = loc;
  }
  return { ids, localOf };
}
// the diamonds of a level: each triangle's, numbered by the middle of the long side the two share
function pairs(C, V) {
  const no = new Int32Array(V).fill(-1), out = new Int32Array(C.length); let k = 0;
  for (let t = 0; t < C.length; t++) { if (no[C[t]] < 0) no[C[t]] = k++; out[t] = no[C[t]]; }
  if (k * 2 !== C.length) throw new Error('diamonds: a long side without its other half');
  return out;
}
// the vertices DEPTH levels down that lie on the short sides of a level's triangles (T): its diamonds' borders
function legsOf(T, xyz, idAt, V) {
  const lock = new Uint8Array(V), n = 2 ** (DEPTH / 2);
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t] * 3;
    for (const e of [T[t + 1] * 3, T[t + 2] * 3]) for (let s = 0; s <= n; s++) lock[idAt(xyz[a] + ((xyz[e] - xyz[a]) * s) / n, xyz[a + 1] + ((xyz[e + 1] - xyz[a + 1]) * s) / n, xyz[a + 2] + ((xyz[e + 2] - xyz[a + 2]) * s) / n)] = 1;
  }
  return lock;
}

// ---- a surface's levels ----
/** Level L's vertices (place 3, normal 3, shade): on f, save those its groups' borders hold, a level finer's. */
function valuesAt(G, L, f, finer) {
  const I = G.ids[L], n = I.length, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), sh = new Float32Array(n), free = new Uint8Array(n);
  const lock = G.locked[L], up = finer && G.localOf[L + 1], d = G.dir;
  for (let i = 0; i < n; i++) {
    const g = I[i];
    if (lock?.[g]) { const j = up[g]; for (let a = 0; a < 3; a++) { pos[i * 3 + a] = finer.pos[j * 3 + a]; nor[i * 3 + a] = finer.nor[j * 3 + a]; } sh[i] = finer.sh[j]; continue; }
    free[i] = 1; sh[i] = f(d[g * 3], d[g * 3 + 1], d[g * 3 + 2], pos, i * 3);
  }
  normalsOf(G.tri[L], G.localOf[L], pos, nor, free);
  return { pos, nor, sh };
}
// the normal of each vertex free: the mean of its faces' (as blob.js normalsOf)
function normalsOf(T, loc, pos, nor, free) {
  const add = (o, x, y, z) => { if (free[o / 3]) { nor[o] += x; nor[o + 1] += y; nor[o + 2] += z; } };
  for (let t = 0; t < T.length; t += 3) {
    const a = loc[T[t]] * 3, b = loc[T[t + 1]] * 3, c = loc[T[t + 2]] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    add(a, x, y, z); add(b, x, y, z); add(c, x, y, z);
  }
  for (let i = 0; i < free.length; i++) if (free[i]) { const o = i * 3, l = Math.sqrt(nor[o] * nor[o] + nor[o + 1] * nor[o + 1] + nor[o + 2] * nor[o + 2]) || 1; nor[o] /= l; nor[o + 1] /= l; nor[o + 2] /= l; }
}
/** Where vertex g of the cube's lattice lies on triangle (a, b, c) (apex a, its short sides alike and square), as
    its corners' weights, into w. */
function weightsOf(xyz, g, a, b, c, w) {
  const ax = xyz[a * 3], ay = xyz[a * 3 + 1], az = xyz[a * 3 + 2], ux = xyz[b * 3] - ax, uy = xyz[b * 3 + 1] - ay, uz = xyz[b * 3 + 2] - az;
  const vx = xyz[c * 3] - ax, vy = xyz[c * 3 + 1] - ay, vz = xyz[c * 3 + 2] - az, px = xyz[g * 3] - ax, py = xyz[g * 3 + 1] - ay, pz = xyz[g * 3 + 2] - az;
  const s = ux * ux + uy * uy + uz * uz;
  w[1] = (px * ux + py * uy + pz * uz) / s; w[2] = (px * vx + py * vy + pz * vz) / s; w[0] = 1 - w[1] - w[2];
}
/** Level L's surface at vertex g of the lattice (on its triangle t): place, normal (its length 1), shade, and how far
    the place lies from the triangle's nearest corner, into q. */
function surfaceAt(G, L, vals, g, t, q, w) {
  const T = G.tri[L], loc = G.localOf[L], { pos, nor, sh } = vals[L], a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
  weightsOf(G.xyz, g, a, b, c, w);
  const ka = loc[a], kb = loc[b], kc = loc[c], wa = w[0], wb = w[1], wc = w[2], oa = ka * 3, ob = kb * 3, oc = kc * 3;
  for (let i = 0; i < 3; i++) { q[i] = pos[oa + i] * wa + pos[ob + i] * wb + pos[oc + i] * wc; q[3 + i] = nor[oa + i] * wa + nor[ob + i] * wb + nor[oc + i] * wc; }
  q[6] = sh[ka] * wa + sh[kb] * wb + sh[kc] * wc;
  const l = Math.sqrt(q[3] * q[3] + q[4] * q[4] + q[5] * q[5]) || 1; q[3] /= l; q[4] /= l; q[5] /= l;
  const da = (q[0] - pos[oa]) ** 2 + (q[1] - pos[oa + 1]) ** 2 + (q[2] - pos[oa + 2]) ** 2, db = (q[0] - pos[ob]) ** 2 + (q[1] - pos[ob + 1]) ** 2 + (q[2] - pos[ob + 2]) ** 2;
  q[7] = Math.sqrt(Math.min(da, db, (q[0] - pos[oc]) ** 2 + (q[1] - pos[oc + 1]) ** 2 + (q[2] - pos[oc + 2]) ** 2));
}
/** How far level L's groups lie from the full mesh: the most at any of its vertices (above), by group. */
function errorsAt(G, L, vals) {
  const { LM, V, canon, localOf } = G, D = G.diamond[L], raw = new Float64Array(D.length / 2), F = vals[LM], fl = localOf[LM], q = new Float64Array(8), w = new Float64Array(3);
  for (let g = 0; g < V; g++) {
    const t = canon[g] >> (LM - L), f = fl[g] * 3;
    surfaceAt(G, L, vals, g, t, q, w);
    const px = q[0] - F.pos[f], py = q[1] - F.pos[f + 1], pz = q[2] - F.pos[f + 2], nx = q[3] - F.nor[f], ny = q[4] - F.nor[f + 1], nz = q[5] - F.nor[f + 2];
    const e = Math.max(Math.sqrt(px * px + py * py + pz * pz), Math.sqrt(nx * nx + ny * ny + nz * nz) * q[7] * NW, Math.abs(q[6] - F.sh[f / 3]) * q[7] * CW), i = D[t >> DEPTH];
    if (e > raw[i]) raw[i] = e;
  }
  return raw;
}
/** Each of level L's vertices where it lies on level L - 1 (the cut's morph): place 3, normal 3, shade. */
function placesOn(G, L, vals) {
  const I = G.ids[L], to = new Float32Array(I.length * 7), q = new Float64Array(8), w = new Float64Array(3), up = G.LM - L + 1;
  for (let i = 0; i < I.length; i++) { surfaceAt(G, L - 1, vals, I[i], G.canon[I[i]] >> up, q, w); for (let j = 0; j < 7; j++) to[i * 7 + j] = q[j]; }
  return to;
}

// ---- clusters and groups ----
/** Level L's clusters (runs of its triangles, each no more than MAXT, two to each triangle DEPTH levels up): their
    corners, vertices (numbers of M: off on) and each vertex's way to the level a step coarser (to; none: the
    simplifier's to say). */
function clustersAt(G, L, to, off) {
  const T = G.tri[L], n = T.length / 3, k = n / 2 ** (DEPTH - 1), loc = G.localOf[L], mine = new Int32Array(G.ids[L].length).fill(-1), out = [];
  for (let c = 0; c < k; c++) {
    const s = (c * n) / k, e = ((c + 1) * n) / k, tris = new Uint32Array((e - s) * 3), verts = [];
    for (let i = s * 3; i < e * 3; i++) { const v = loc[T[i]]; if (mine[v] < 0) { mine[v] = verts.length; verts.push(v); } tris[i - s * 3] = mine[v]; }
    const way = to && new Float32Array(verts.length * 7);
    verts.forEach((v, j) => { way?.set(to.subarray(v * 7, v * 7 + 7), j * 7); mine[v] = -1; });
    out.push({ tris, verts: Int32Array.from(verts, (v) => v + off), to: way, n: e - s, self: null, parent: null });
  }
  return out;
}
// the diamond that made cluster i of level L, and the one it is made into
const selfOf = (G, L, i) => G.diamond[L][i >> 1];
const parentOf = (G, L, i) => G.diamond[L - 1][i >> 2];
/** Level L's groups: { err (never less than BAND times its parts'), c, r (a sphere holding its parts' and its own
    vertices) }. raw: each one's error as measured. */
function groupsAt(G, L, levels, P, raw) {
  const groups = Array.from(raw, (err) => ({ err, c: null, r: 0, box: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity] }));
  const parts = levels[L + 1].map((c, i) => [groups[parentOf(G, L + 1, i)], c.self]), own = levels[L].map((c, i) => [groups[selfOf(G, L, i)], c.verts]);
  const grow = (g, x, y, z, r) => { const b = g.box; b[0] = Math.min(b[0], x - r); b[1] = Math.min(b[1], y - r); b[2] = Math.min(b[2], z - r); b[3] = Math.max(b[3], x + r); b[4] = Math.max(b[4], y + r); b[5] = Math.max(b[5], z + r); };
  for (const [g, s] of parts) { g.err = Math.max(g.err, s.err * BAND); grow(g, s.c[0], s.c[1], s.c[2], s.r); }
  for (const [g, vs] of own) for (const v of vs) grow(g, P[v * 3], P[v * 3 + 1], P[v * 3 + 2], 0);
  for (const g of groups) g.c = [(g.box[0] + g.box[3]) / 2, (g.box[1] + g.box[4]) / 2, (g.box[2] + g.box[5]) / 2];
  for (const [g, s] of parts) g.r = Math.max(g.r, Math.hypot(s.c[0] - g.c[0], s.c[1] - g.c[1], s.c[2] - g.c[2]) + s.r);
  for (const [g, vs] of own) for (const v of vs) g.r = Math.max(g.r, Math.hypot(P[v * 3] - g.c[0], P[v * 3 + 1] - g.c[1], P[v * 3 + 2] - g.c[2]));
  return groups.map(({ err, c, r }) => ({ err, c, r }));
}
/** The sphere of vertices vs of places P: { c, r }. */
function sphereOf(P, vs) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const v of vs) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[v * 3 + a]); hi[a] = Math.max(hi[a], P[v * 3 + a]); }
  const c = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2);
  let r = 0; for (const v of vs) r = Math.max(r, Math.hypot(P[v * 3] - c[0], P[v * 3 + 1] - c[1], P[v * 3 + 2] - c[2]));
  return { c, r };
}
