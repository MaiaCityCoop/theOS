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
//   z   its colour (the face's, or its corner's), each channel the square root of half of it in 8 bits (a tint over a
//       material may be over 1; dark colours keep their steps); 8 bits spare
//   w   its normal, two 16-bit numbers of its octahedral map
// A corner is a vertex of its own: a face's three corners are three vertices (most faces are flat, their corners'
// normals their own).

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
  for (const l of a.detail.levels) for (const f of l.faces) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) { const v = f[c][k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  BOX.set(a, (B = { min, ext: max.map((v, k) => Math.max(1e-3, v - min[k])) }));
  return B;
}

const q16 = (v, lo, ext) => Math.max(0, Math.min(65535, Math.round(((v - lo) / ext) * 65535)));
const c8 = (v) => Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, Math.min(2, v)) / 2) * 255)));
const oct16 = (x, y, z) => {
  const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1; let u = x / s, v = z / s;   // (the map's square is its x and z: y up is its middle)
  if (y < 0) { const pu = u, pv = v; u = (1 - Math.abs(pv)) * (pu >= 0 ? 1 : -1); v = (1 - Math.abs(pu)) * (pv >= 0 ? 1 : -1); }
  const e = (t) => Math.max(0, Math.min(65535, Math.round((t * 0.5 + 0.5) * 65535)));
  return (e(u) | (e(v) << 16)) >>> 0;
};

/** How many vertices and triangles level l of a made asset has (its room in the heap). */
export const madeRoom = (a, l) => ({ verts: a.detail.levels[l].faces.length * 3, tris: a.detail.levels[l].faces.length });

/** Level l of a made asset, packed for the heap: { index (its corners, 0 … n - 1), verts (an element a vertex), count }. */
export function madeMesh(a, l) {
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

/** The largest side of a made asset as it stands (its size: what its size on screen is measured by). */
const spanOf = (a) => { const m = (v) => (Array.isArray(v) ? v[1] : v); return Math.max(m(a.size.length), m(a.size.width ?? 0), m(a.size.height ?? 0)); };

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
  return { model: 'matte', mean: tint, c2: tint, material, relief: 0, scale: 1, gloss: 0, sway: 0, snow: a.snow?.clumps ?? 0.1, glow: 0, through: 0, size: 1, leaf: 0, dot: dotOf(a) };
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
