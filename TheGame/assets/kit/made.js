// A made thing as the heap holds it (intent 0029): an asset that stands at a spot of its own (the tent, the fire pit;
// later the city's buildings), its levels of detail made of faces (assets/index.js says a face), drawn by the one drawer
// (src/scatter/drawer.js) through the list placer (src/scatter/placed.js). Plain JS, no three: the recipes' worker
// packs it and the page reads it (assets/zoo/made.js brings it to the zoo).
//
// A vertex is one element of the heap, four numbers of 32 bits (src/scatter/madevert.js unpacks it on the GPU, bit for
// bit the other way):
//   x   where it is across and up: two 16-bit shares of its box (the box of all its levels: madeBox)
//   y   where it is along, a share of its box; the material its face wears (`part`: its place in the asset's
//       `materials`, 0 where it names none), 8 bits; 8 bits spare
//   z   its colour (the face's, or its corner's), each channel in 8 bits as the square root of half of it (pack.js: c8);
//       8 bits spare
//   w   its normal, two 16-bit numbers of its octahedral map (assets/kit/pack.js: oct, as every make's)
// A corner is a vertex of its own: a face's three corners are three vertices (most faces are flat, their corners'
// normals their own).

import { q16, c8, sn, oct, OCT } from './pack.js';
import { spanOf, kindOf } from '../kinds.js';
import { chain, E_PX } from './reduce.js';
import { LADDER } from './ladder.js';
import { LOD } from './crowd.js';   // (`?lod=new`: its levels made from its finest faces alone, intent 0033)

/** Whether an asset is a made thing the list placer draws: it stands at a spot of its own (`placement.at: 'places'`),
    is not a fire (a light: src/world/fire.js), and every level of it is faces. */
export const isMade = (a) => !!(a?.uid && a.type === 'asset' && a.placement?.at === 'places' && !a.fire && a.detail?.levels?.length && a.detail.levels.every((l) => Array.isArray(l.faces) && l.faces.length));

/** The made things among a list of assets, in the order of their uids (the same on every page and in every worker). */
export const madeKinds = (assets) => assets.filter(isMade).sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

const BOX = new Map();
/** The box of all of an asset's levels, its own frame (metres): { min: [x, y, z], ext: [x, y, z] } (ext none under a millimetre). */
export function madeBox(a) {
  let B = BOX.get(a); if (B) return B;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const l of LOD.on ? a.detail.levels.slice(0, 1) : a.detail.levels) for (const f of l.faces) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) { const v = f[c][k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  if (LOD.on) for (let k = 0; k < 3; k++) { const m = (max[k] - min[k]) * 0.04 + 1e-3; min[k] -= m; max[k] += m; }   // (`?lod=new`: its first level's, a little larger: a coarser level's corners are moved to the mean of what they stand for)
  BOX.set(a, (B = { min, ext: max.map((v, k) => Math.max(1e-3, v - min[k])) }));
  return B;
}

const oct16 = (x, y, z) => { oct(x, y, z); return (sn(OCT[0], 65535) | (sn(OCT[1], 65535) << 16)) >>> 0; };

/** How many vertices and triangles level l of a made asset has (its room in the heap). */
export const madeRoom = (a, l) => { if (LOD.on) { const n = derivedFaces(a, l).length; return { verts: n * 3, tris: n }; } return { verts: a.detail.levels[l].faces.length * 3, tris: a.detail.levels[l].faces.length }; };

/** Level l of a made asset, packed for the heap: { index (its corners, 0 … n - 1), verts (an element a vertex), count }. */
export function madeMesh(a, l) {
  if (LOD.on) return derivedMesh(a, l);
  const faces = a.detail.levels[l].faces, n = faces.length * 3, { min, ext } = madeBox(a), parts = a.materials ? Object.keys(a.materials) : null;
  const verts = new Uint32Array(n * 4), index = new Uint32Array(n);
  let at = 0;
  for (const [p0, p1, p2, c, m, ns] of faces) {
    let fn = null;
    if (!ns) {   // a flat face: its own normal at every corner (as assets/index.js: geometryOf)
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const x = e1[1] * e2[2] - e1[2] * e2[1], y = e1[2] * e2[0] - e1[0] * e2[2], z = e1[0] * e2[1] - e1[1] * e2[0], s = Math.hypot(x, y, z) || 1;
      fn = [x / s, y / s, z / s];
    }
    const part = parts ? Math.max(0, parts.indexOf(m ?? parts[0])) : 0;
    [p0, p1, p2].forEach((p, k) => {
      const col = Array.isArray(c[0]) ? c[k] : c, nn = ns ? ns[k] : fn, o = at * 4;
      verts[o] = (q16(p[0], min[0], ext[0]) | (q16(p[1], min[1], ext[1]) << 16)) >>> 0;
      verts[o + 1] = (q16(p[2], min[2], ext[2]) | (part << 16)) >>> 0;
      verts[o + 2] = (c8(col[0]) | (c8(col[1]) << 8) | (c8(col[2]) << 16)) >>> 0;
      verts[o + 3] = oct16(nn[0], nn[1], nn[2]);
      index[at] = at; at++;
    });
  }
  return { index, verts, count: n };
}


/** Its look, as the drawer takes a kind's (assets/zoo/index.js: lookOf), for its dot: its mean colour (its faces' by
    their area, at its finest level) or, where it is mostly of one of the world's materials, that material and the mean
    tint its faces give it (the dot then reads the material's own mean: src/scatter/drawer.js); and its dot's outline
    (`dot`: [how wide it is, how high its middle stands], of its size): one triangle that covers what its coarsest level
    covers, seen from the side, on the mean. */
export function madeLook(a) {
  const faces = a.detail.levels[0].faces, parts = a.materials ? Object.keys(a.materials) : null, sum = [0, 0, 0], byPart = new Map(); let area = 0;
  for (const [p0, p1, p2, c, m] of faces) {
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const A = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2, col = Array.isArray(c[0]) ? [0, 1, 2].map((k) => (c[0][k] + c[1][k] + c[2][k]) / 3) : c;
    for (let k = 0; k < 3; k++) sum[k] += col[k] * A; area += A;
    if (parts) { const key = m ?? parts[0], P = byPart.get(key) ?? { area: 0, sum: [0, 0, 0] }; P.area += A; for (let k = 0; k < 3; k++) P.sum[k] += col[k] * A; byPart.set(key, P); }
  }
  const mean = sum.map((v) => v / (area || 1));
  let material, tint = mean;
  if (parts) { let best = null; for (const [key, P] of byPart) if (!best || P.area > best.P.area) best = { key, P }; material = a.materials[best.key]; tint = best.P.sum.map((v) => v / (best.P.area || 1)); }
  return { model: 'matte', mean: tint, c2: tint, material, relief: 0, scale: 1, gloss: 0, sway: 0, snow: kindOf(a, 'snow').clumps, glow: 0, through: 0, size: spanOf(a), leaf: 0, dot: dotOf(a) };   // (its snow as its kind holds it: assets/kinds.js, the same its faces are drawn with)
}

/** Its dot's outline (madeLook): its coarsest level seen from four sides, each laid on a grid; the mean of what it
    covers and the height of that cover's middle. A triangle (src/scatter/drawer.js: dot) of r is 1.8 r² large, its
    middle a tenth of r over the point it is drawn round. */
function dotOf(a) {
  const faces = a.detail.levels.at(-1).faces, S = spanOf(a), N = 48, cell = S / N;
  let cover = 0, mid = 0;
  for (let d = 0; d < 4; d++) {
    const th = (d * Math.PI) / 4, ux = Math.cos(th), uz = Math.sin(th), grid = new Uint8Array(N * N);
    for (const f of faces) {
      const P = f.slice(0, 3).map((p) => [(p[0] * ux + p[2] * uz) / cell + N / 2, p[1] / cell]);
      const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      const side = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5, cy = y + 0.5, s0 = side(P[0], P[1], cx, cy), s1 = side(P[1], P[2], cx, cy), s2 = side(P[2], P[0], cx, cy);
        if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) grid[y * N + x] = 1;
      }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (grid[y * N + x]) { cover++; mid += (y + 0.5) * cell; }
  }
  const A = (cover / 4) * cell * cell, h = cover ? mid / cover : S * 0.35, r = Math.sqrt(A / 1.8);
  return [r / S, Math.max(0, h - 0.1 * r) / S];
}

// ---- `?lod=new` (intent 0033): a made thing's levels made from its finest faces alone ----
// The asset's first level is all it is; the engine takes it from there. Its corners are welded where faces meet, into
// one surface (a corner where two of its materials meet stays where it is: a seam), folded coarser by the one reduction
// (reduce.js) to the ladder's sizes on screen (assets/kit/ladder.js: the same for every made thing), every corner
// knowing its place, normal and colour on the next coarser level. A piece of it (faces that share corners) knows how
// wide it is (the middle of its three extents: a rope, a pole or a peg is thin, a sheet is not): a thin piece fades by its
// width on screen and is left out of a level where it is gone over the whole of it. Its last level thins away.

/** Its levels' sizes on screen: the ladder's, its full mesh and every level that is a mesh. */
export const MADE_PX = LADDER.filter((l) => l.n !== -2).map((l) => l.px);
/** Under what width on screen (pixels) a thin piece is gone; from WIDE it is whole. */
export const THIN = 0.3, WIDE = 1;
const MADE = new Map();
/** A made asset's derived levels: { levels: [{ faces: [[source face, a, b, c] …] (a, b, c: its corners as level l's
    vertices), verts: { pos, nor, col } }], to: per level, each of its vertices' place on the next, width: each face's
    piece's width, metres }. Level 0 is the asset's faces as they are. */
export function madeLevels(a) {
  let D = MADE.get(a); if (D) return D;
  const faces = a.detail.levels[0].faces, F = faces.length, parts = a.materials ? Object.keys(a.materials) : null;
  // weld: corners at the same place (to a tenth of a millimetre) of the same colour and material are one vertex; where
  // corners of other colours or materials stand at the same place (a seam, a sheet's two sides) each keeps its own, and
  // all of them stay where they are: what lies either side of a seam is folded alike, and no colour runs into another
  const key = new Map(), at = new Map(), corner = new Int32Array(F * 3), P = [], parts0 = a.materials ? Object.keys(a.materials) : null;
  faces.forEach((f, t) => {
    const c = f[3], m = parts0 ? Math.max(0, parts0.indexOf(f[4] ?? parts0[0])) : 0;
    for (let k = 0; k < 3; k++) {
      const p = f[k], cc = Array.isArray(c[0]) ? c[k] : c, place = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`, q = `${place}|${m}|${Math.round(cc[0] * 64)},${Math.round(cc[1] * 64)},${Math.round(cc[2] * 64)}`;
      let v = key.get(q); if (v === undefined) { v = P.length / 3; key.set(q, v); P.push(p[0], p[1], p[2]); if (!at.has(place)) at.set(place, []); at.get(place).push(v); }
      corner[t * 3 + k] = v;
    }
  });
  const V = P.length / 3, pos = Float32Array.from(P), nor = new Float32Array(V * 3), col = new Float64Array(V * 4), partOf = new Int16Array(V).fill(-1), lock = new Uint8Array(V), fn = [];
  for (const vs of at.values()) if (vs.length > 1) for (const v of vs) lock[v] = 1;
  faces.forEach((f, t) => {
    const [p0, p1, p2, c, m, ns] = f, e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const x = e1[1] * e2[2] - e1[2] * e2[1], y = e1[2] * e2[0] - e1[0] * e2[2], z = e1[0] * e2[1] - e1[1] * e2[0], A = Math.hypot(x, y, z) / 2, part = parts ? Math.max(0, parts.indexOf(m ?? parts[0])) : 0;
    fn.push([x / (2 * A || 1), y / (2 * A || 1), z / (2 * A || 1)]);
    for (let k = 0; k < 3; k++) {
      const v = corner[t * 3 + k], n = ns ? ns[k] : fn[t], cc = Array.isArray(c[0]) ? c[k] : c;
      for (let i = 0; i < 3; i++) { nor[v * 3 + i] += n[i] * A; col[v * 4 + i] += cc[i] * A; } col[v * 4 + 3] += A;
      if (partOf[v] < 0) partOf[v] = part; else if (partOf[v] !== part) lock[v] = 1;   // (where two materials meet: a seam, kept)
    }
  });
  for (let v = 0; v < V; v++) { const l = Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]) || 1; for (let i = 0; i < 3; i++) nor[v * 3 + i] /= l; }
  // its pieces and how wide each is (the middle of its extents along its own three axes)
  const up = Int32Array.from({ length: V }, (_, i) => i), root = (x) => { while (up[x] !== x) x = up[x] = up[up[x]]; return x; };
  for (let t = 0; t < F; t++) { up[root(corner[t * 3])] = root(corner[t * 3 + 1]); up[root(corner[t * 3 + 1])] = root(corner[t * 3 + 2]); }
  const wideOf = new Map(), members = new Map();
  for (let v = 0; v < V; v++) { const r = root(v); if (!members.has(r)) members.set(r, []); members.get(r).push(v); }
  for (const [r, vs] of members) wideOf.set(r, widthOf(pos, vs));
  const width = Float32Array.from({ length: F }, (_, t) => wideOf.get(root(corner[t * 3])));
  const shade = new Float32Array(V).fill(1), colour = new Float32Array(V * 3);
  for (let v = 0; v < V; v++) for (let i = 0; i < 3; i++) colour[v * 3 + i] = col[v * 4 + i] / (col[v * 4 + 3] || 1);
  // the levels: each as coarse as half a pixel of error at the top of its band (E_PX), of the thing's largest side
  const span = spanOf(a), rooms = MADE_PX.slice(1).map((_, i) => ({ tris: Infinity, verts: Infinity, err: (E_PX / MADE_PX[i]) * span }));
  const C = chain({ V, pos, nor, shade, index: corner, lock, extra: colour, k: 3 }, rooms);
  D = { C, faces, corner, width, span, levels: MADE_PX.length };
  MADE.set(a, D);
  return D;
}
// the middle of a piece's three extents along its own axes (its spread's, by power iteration on its covariance)
function widthOf(pos, vs) {
  const m = [0, 0, 0]; for (const v of vs) for (let i = 0; i < 3; i++) m[i] += pos[v * 3 + i] / vs.length;
  const C = [0, 0, 0, 0, 0, 0]; for (const v of vs) { const x = pos[v * 3] - m[0], y = pos[v * 3 + 1] - m[1], z = pos[v * 3 + 2] - m[2]; C[0] += x * x; C[1] += x * y; C[2] += x * z; C[3] += y * y; C[4] += y * z; C[5] += z * z; }
  const mul = (a) => [C[0] * a[0] + C[1] * a[1] + C[2] * a[2], C[1] * a[0] + C[3] * a[1] + C[4] * a[2], C[2] * a[0] + C[4] * a[1] + C[5] * a[2]];
  const axes = []; for (let k = 0; k < 3; k++) {
    let a = [[1, 0.3, 0.2], [0.2, 1, 0.3], [0.3, 0.2, 1]][k];
    for (let it = 0; it < 40; it++) { a = mul(a); for (const b of axes) { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; for (let i = 0; i < 3; i++) a[i] -= d * b[i]; } const l = Math.hypot(...a) || 1; a = a.map((x) => x / l); }
    axes.push(a);
  }
  const ext = axes.map((a) => { let lo = Infinity, hi = -Infinity; for (const v of vs) { const d = pos[v * 3] * a[0] + pos[v * 3 + 1] * a[1] + pos[v * 3 + 2] * a[2]; if (d < lo) lo = d; if (d > hi) hi = d; } return hi - lo; }).sort((x, y) => x - y);
  return ext[1];
}

const DF = new Map();
/** Level l's faces (`?lod=new`): [face of the asset's first level, a, b, c (its corners as level l's vertices)], the
    thin pieces gone over the whole of the level left out. */
function derivedFaces(a, l) {
  const key = `${a.uid}:${l}`; let out = DF.get(key); if (out) return out;
  const D = madeLevels(a), m = D.C.meshAt(l), top = l ? MADE_PX[l - 1] : Infinity; out = [];
  for (let t = 0; t < m.face.length; t++) { const f = m.face[t]; if ((D.width[f] / D.span) * top < THIN) continue; out.push([f, m.index[t * 3], m.index[t * 3 + 1], m.index[t * 3 + 2]]); }
  if (DF.size > 64) DF.clear();
  DF.set(key, out); return out;
}
/** How a thin piece's width is packed (8 bits, 0: not thin; else 2^((code - 1) / 12 - 10) metres) and read back. */
export const widthCode = (w) => (w >= 4 ? 0 : Math.max(1, Math.min(255, 1 + Math.round((Math.log2(Math.max(w, 1e-3)) + 10) * 12))));
const oct8 = (x, y, z) => { oct(x, y, z); return (sn(OCT[0], 255) | (sn(OCT[1], 255) << 8)) >>> 0; };
/** Level l of a made asset under `?lod=new`: two elements a vertex, its corners its own (flat, as madeMesh's):
    the first as madeMesh packs it, its piece's width (widthCode) in the y word's last 8 bits; the second its place,
    normal and colour on the next coarser level: x (16 | 16) and y's low 16 its place in the box, y's high 16 its normal
    (8 | 8, octahedral), z its colour (c8 each). Level 0 is the asset's faces as they are. */
function derivedMesh(a, l) {
  const D = madeLevels(a), { min, ext } = madeBox(a), parts = a.materials ? Object.keys(a.materials) : null, m = D.C.meshAt(l), list = derivedFaces(a, l), n = list.length * 3;
  const verts = new Uint32Array(n * 8), index = new Uint32Array(n);
  let at = 0;
  for (const [f, i0, i1, i2] of list) {
    const [p0, p1, p2, c, mat, ns] = D.faces[f], part = parts ? Math.max(0, parts.indexOf(mat ?? parts[0])) : 0, wc = widthCode(D.width[f]);
    let fn = null;
    if (!l && !ns) { const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]], x = e1[1] * e2[2] - e1[2] * e2[1], y = e1[2] * e2[0] - e1[0] * e2[2], z = e1[0] * e2[1] - e1[1] * e2[0], s = Math.hypot(x, y, z) || 1; fn = [x / s, y / s, z / s]; }
    [i0, i1, i2].forEach((vi, k) => {
      // (level 0: the face's own corner as the asset drew it; its vertex in the welded surface is the corner's)
      const v = l ? vi : D.corner[f * 3 + k], P = l ? [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]] : [p0, p1, p2][k];
      const N = l ? [m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]] : ns ? ns[k] : fn, C = l ? [m.extra[v * 3], m.extra[v * 3 + 1], m.extra[v * 3 + 2]] : Array.isArray(c[0]) ? c[k] : c;
      const TP = m.to.pos, TN = m.to.nor, TX = m.to.extra, o = at * 8;
      verts[o] = (q16(P[0], min[0], ext[0]) | (q16(P[1], min[1], ext[1]) << 16)) >>> 0;
      verts[o + 1] = (q16(P[2], min[2], ext[2]) | (part << 16) | (wc << 24)) >>> 0;
      verts[o + 2] = (c8(C[0]) | (c8(C[1]) << 8) | (c8(C[2]) << 16)) >>> 0;
      verts[o + 3] = oct16(N[0], N[1], N[2]);
      verts[o + 4] = (q16(TP[v * 3], min[0], ext[0]) | (q16(TP[v * 3 + 1], min[1], ext[1]) << 16)) >>> 0;
      verts[o + 5] = (q16(TP[v * 3 + 2], min[2], ext[2]) | (oct8(TN[v * 3], TN[v * 3 + 1], TN[v * 3 + 2]) << 16)) >>> 0;
      verts[o + 6] = (c8(TX[v * 3]) | (c8(TX[v * 3 + 1]) << 8) | (c8(TX[v * 3 + 2]) << 16)) >>> 0;
      index[at] = at; at++;
    });
  }
  return { index, verts, count: n };
}
