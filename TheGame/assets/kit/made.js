// A made thing as the heap holds it (intent 0029): an asset that stands at a spot of its own (the tent, the fire pit;
// later the city's buildings), its full detail made of faces (`faces`: assets/index.js says a face), drawn by the one
// drawer (src/scatter/drawer.js) through the list placer (src/scatter/placed.js). Every coarser version of it is the
// builder's (intent 0038, stage 8): its faces welded into one surface, its cluster hierarchy built from that alone
// (clusters.js), its levels packed as surface.js lays them. Plain JS, no three: the recipes' worker builds and packs
// it, the page reads its box and look (assets/zoo/made.js brings it to the zoo).
//
// A vertex is two elements of the heap, four numbers of 32 bits each (src/scatter/madevert.js unpacks them on the GPU,
// bit for bit the other way):
//   x   where it is across and up: two 16-bit shares of its box (madeBox)
//   y   where it is along, a share of its box; the material its face wears (`part`: its place in the asset's
//       `materials`, 0 where it names none), 8 bits; 8 bits spare
//   z   its colour (the face's, or its corner's), each channel in 8 bits as the square root of half of it (pack.js: c8)
//   w   its normal, two 16-bit numbers of its octahedral map (assets/kit/pack.js: oct, as every make's)
// and its way to its parent's surface (clusters.js: the morph): x its way there, 10 bits each way over ± its cluster's
// range (surface.js: D, of the thing's largest side); y the normal there (oct, 16 | 16); z the colour there (c8).

import { q16, c8, sn, oct, OCT } from './pack.js';
import { spanOf, kindOf } from '../kinds.js';
import { hierarchyOf, packLevel } from './surface.js';

/** Whether an asset is a made thing the list placer draws: it stands at a spot of its own (`placement.at: 'places'`),
    is not a fire (a light: src/world/fire.js), and is made of faces. */
export const isMade = (a) => !!(a?.uid && a.type === 'asset' && a.placement?.at === 'places' && !a.fire && Array.isArray(a.faces) && a.faces.length);

/** The made things among a list of assets, in the order of their uids (the same on every page and in every worker). */
export const madeKinds = (assets) => assets.filter(isMade).sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

const BOX = new Map();
/** The box of its faces, its own frame (metres): { min: [x, y, z], ext: [x, y, z] } (ext none under a millimetre). Every
    version the builder makes of it lies within it. */
export function madeBox(a) {
  let B = BOX.get(a); if (B) return B;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const f of a.faces) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) { const v = f[c][k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  BOX.set(a, (B = { min, ext: max.map((v, k) => Math.max(1e-3, v - min[k])) }));
  return B;
}

const oct16 = (x, y, z) => { oct(x, y, z); return (sn(OCT[0], 65535) | (sn(OCT[1], 65535) << 16)) >>> 0; };
const flat = ([p0, p1, p2]) => { const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]], x = e1[1] * e2[2] - e1[2] * e2[1], y = e1[2] * e2[0] - e1[0] * e2[2], z = e1[0] * e2[1] - e1[1] * e2[0], s = Math.hypot(x, y, z) || 1; return [x / s, y / s, z / s]; };

/** How much a level of a made asset may hold (its room in the heap: triangles, and vertices of two elements each): its
    whole hierarchy (about twice its faces), its corners able to name every element (65536 at most). */
export const madeRoom = (a) => { const tris = Math.ceil(a.faces.length * 2.1); return { tris, verts: Math.min(32000, 3 * tris) }; };

// its faces welded into one surface: a vertex where a place, a normal, a colour and a material are alike; and its
// hierarchy (the last few kept: a worker asked for its levels one after another builds it once)
const DAGS = new Map();
function dagOf(a) {
  let D = DAGS.get(a); if (D) return D;
  if (DAGS.size >= 4) DAGS.delete(DAGS.keys().next().value);
  const span = spanOf(a), parts = a.materials ? Object.keys(a.materials) : null, key = new Map(), P = [], N = [], C = [], part = [], seam = [], at = new Map(), index = [];
  for (const f of a.faces) {
    const [p0, p1, p2, c, m, ns] = f, fn = ns ? null : flat(f), pt = parts ? Math.max(0, parts.indexOf(m ?? parts[0])) : 0;
    [p0, p1, p2].forEach((p, j) => {
      const n = ns ? ns[j] : fn, col = Array.isArray(c[0]) ? c[j] : c, place = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
      const k = `${place}|${Math.round(n[0] * 1e3)},${Math.round(n[1] * 1e3)},${Math.round(n[2] * 1e3)}|${c8(col[0])},${c8(col[1])},${c8(col[2])}|${pt}`;
      let v = key.get(k);
      if (v === undefined) { v = P.length / 3; key.set(k, v); P.push(p[0] / span, p[1] / span, p[2] / span); N.push(...n); C.push(...col); part.push(pt); (at.get(place) ?? at.set(place, []).get(place)).push(v); }
      index.push(v);
    });
  }
  // (where colours or materials meet at a place, the edge is kept: the simplifier may fold along it, not across it)
  const V = P.length / 3; for (let v = 0; v < V; v++) seam.push(0);
  for (const vs of at.values()) for (const v of vs) if (vs.some((w) => part[w] !== part[v] || c8(C[w * 3]) !== c8(C[v * 3]) || c8(C[w * 3 + 1]) !== c8(C[v * 3 + 1]) || c8(C[w * 3 + 2]) !== c8(C[v * 3 + 2]))) seam[v] = 1;
  D = hierarchyOf({ V, pos: Float32Array.from(P), nor: Float32Array.from(N), attr: Float32Array.from(C), k: 3, aw: [0.02, 0.02, 0.02], index: Uint32Array.from(index), seam: Uint8Array.from(seam) });
  D.part = part; D.span = span;
  DAGS.set(a, D); return D;
}

/** Level l of a made asset, packed for the heap (surface.js, two elements a vertex), no larger than room. */
export function madeMesh(a, l, room = null) {
  const D = dagOf(a), { min, ext } = madeBox(a), S = D.span, P = D.M.pos, N = D.M.nor, A = D.M.attr;
  return packLevel(D, l, 2, (out, o, c, j, Dm) => {
    const v = c.verts[j], t = c.to, k = j * 9, d = (i) => (Dm ? Math.max(0, Math.min(1023, Math.round(((t[k + i] - P[v * 3 + i]) / Dm) * 511.5 + 511.5))) : 511);
    out[o] = (q16(P[v * 3] * S, min[0], ext[0]) | (q16(P[v * 3 + 1] * S, min[1], ext[1]) << 16)) >>> 0;
    out[o + 1] = (q16(P[v * 3 + 2] * S, min[2], ext[2]) | (D.part[v] << 16)) >>> 0;
    out[o + 2] = (c8(A[v * 3]) | (c8(A[v * 3 + 1]) << 8) | (c8(A[v * 3 + 2]) << 16)) >>> 0;
    out[o + 3] = oct16(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
    out[o + 4] = (d(0) | (d(1) << 10) | (d(2) << 20)) >>> 0;
    out[o + 5] = oct16(t[k + 3], t[k + 4], t[k + 5]);
    out[o + 6] = (c8(t[k + 6]) | (c8(t[k + 7]) << 8) | (c8(t[k + 8]) << 16)) >>> 0;
    out[o + 7] = 0;
  }, room, false);   // (every level drawn in the vertex stage: src/scatter/placed.js)
}

/** Its look, as the drawer takes a kind's (assets/zoo/index.js: lookOf), for its dot: its mean colour (its faces' by
    their area) or, where it is mostly of one of the world's materials, that material and the mean
    tint its faces give it (the dot then reads the material's own mean: src/scatter/drawer.js); and its dot's outline
    (`dot`: [how wide it is, how high its middle stands], of its size): one triangle that covers what it covers, seen from
    the side, on the mean. */
export function madeLook(a) {
  const faces = a.faces, parts = a.materials ? Object.keys(a.materials) : null, sum = [0, 0, 0], byPart = new Map(); let area = 0;
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

/** Its dot's outline (madeLook): its faces seen from four sides, each laid on a grid; the mean of what it covers and
    the height of that cover's middle. A triangle (src/scatter/drawer.js: dot) of r is 1.8 r² large, its
    middle a tenth of r over the point it is drawn round. */
function dotOf(a) {
  const faces = a.faces, S = spanOf(a), N = 48, cell = S / N;
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
