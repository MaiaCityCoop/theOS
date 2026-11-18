// A plant as the heap keeps it (src/scatter/heap.js): what the tree kit builds (assets/kit/tree.js: wood as tubes,
// sprigs as crossed cards, chunks of them as crossed planes), every vertex packed into two elements of the heap, a third of
// what the kit's own arrays take. Its triangles' corners stay a list of its own: the heap keeps a plant's vertices,
// what draws it keeps its corners as the draw's own index (src/scatter/trees.js), so a vertex shared by several
// triangles is worked out once. Plain JS, no three: packed in the recipes' worker, unpacked on the GPU by
// src/scatter/plantvert.js, bit for bit the other way.
//
// A vertex is two elements of the heap, eight numbers of 32 bits, 32 bytes (the kit's own is 92):
//   0   x (16) | y (16)                  its place, metres in the plant's own frame (its foot at 0), on a fixed grid
//   1   z (16) | normal u (8) | v (8)    (GRID: the same at every level, so a sprig's foot is the same number in
//                                        both of two levels that hand over); the normal it is lit with, octahedral
//   2   u (16) | v (16)                  where on its bark or its sprig's painting, in 1024ths, from -16 to 48 tiles
//   3   ao (8) | part (2) | – (2) | twig (1) | – | card u (8) | v (8)       the light that reaches it; 0 wood, 1 a
//                                        sprig's card, 2 a chunk's plane (a clump); whether
//                                        its card wears the painting of one twig (its finest level); its card's plane
//   4   root x (16) | y (16)             what it grows from and shrinks to as two levels hand over
//   5   root z (16)
//   6, 7   free (a level the crowd kit made: below)
//
// A level made by the crowd kit (assets/kit/crowd.js levelOf: the one builder, intents 0033 and 0038) carries what its
// one rule moves a vertex by in what is free, and its shape's sixteen numbers in front of its vertices:
//   vertex 0           the shape's sixteen numbers (crowd.js RULE) as half floats, two a number of 32 bits (two
//                      elements to read, not four: they are read for every vertex); its corners count from 1
//   after its vertices its finest level carries its far data (crowd.js: the sphere its impostor is baked in, its
//                      chunks), as 32-bit floats; the vertex it begins at in the numbers' slots 14 and 15 (x 1024,
//                      and the rest). What the GPU bakes its far end from (src/detail/impostor.js)
//   6   tip x (16) | y (16)              the point it is enlarged about (a chunk's plane's: its chunk's middle)
//   7   tip z (16) | go (16)             the error, metres, at which it goes (a plane's: at which its chunk comes:
//                                        assets/kit/crowd.js), log2 in 2048ths from 2^-16 m (0: never)
//
//   packPlant(mesh) -> { index: its corners, verts: Uint32Array, count: how many vertices, box }   what a family hands on
//                      (box: [x0, y0, z0, x1, y1, z1], metres in its own frame, round all it can reach: a crowd's sprigs
//                      enlarged about their tips as far as its rule lets them; what the eye's culling tests it by,
//                      src/scatter/drawer.js kindBox)
//   plantFamily(id, asset)   a plant asset's shapes as a family of the zoo (assets/zoo/index.js)
import { kindRule, shapesOf, most } from '../kinds.js';
import { held, sn, q16, oct, OCT } from './pack.js';
import { crowd, levelOf, CROWD, RULE } from './crowd.js';
import { goneAt, rungAt, rungPx, BAND } from '../../src/detail/error.js';

export const GRID = { xz: 40, y0: -2, y1: 78 }, UVK = 1024, UV0 = 16, GOQ = 2048, GO0 = 16;   // x and z over -40 … 40 m, y over -2 … 78 m, 16 bits each (1.2 mm); uv in 1024ths, from -16; a go's log2 in 2048ths, from 2^-16 m (15 µm … 65 km)
/** How many tiles a chunk's plane's uv can name, from 0 (its 16 bits, in UVK ths from -UV0): a shape's planes lie in a
    grid of so many a row, and as many rows (assets/kit/crowd.js levelOf; src/detail/atlas.js atlasesOf). */
export const UV_TILES = 65536 / UVK - UV0;
/** A number as a half float's 16 bits (round to nearest; what the GPU's unpackHalf2x16 reads back). */
const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);
const half = (x) => {
  F32[0] = x; const b = U32[0], s = (b >>> 16) & 0x8000, e = ((b >>> 23) & 0xff) - 112, m = b & 0x7fffff;
  if (e <= 0) return s | (e < -10 ? 0 : ((m | 0x800000) >> (1 - e)) + 0x1000 >> 13);   // (under the smallest normal: kept as a subnormal)
  if (e >= 31) return s | 0x7c00;
  const h = (e << 10) | (m >> 13), r = m & 0x1fff; return s | (h + (r > 0x1000 || (r === 0x1000 && h & 1) ? 1 : 0));
};
const gx = (v) => q16(v, -GRID.xz, 2 * GRID.xz), gy = (v) => q16(v, GRID.y0, GRID.y1 - GRID.y0);   // (a place in the grid, 16 bits)
let OU = 0, OV = 0;
const oct8 = (x, y, z) => { oct(x, y, z); OU = sn(OCT[0], 255); OV = sn(OCT[1], 255); };   // (a direction as two numbers of 8 bits)

/** A mesh of the tree kit (as its builder left it, or as typed arrays) as the heap takes it: every vertex packed,
    its triangles' corners as they are. */
export function packPlant(m) {
  const FV = m.far ? Math.ceil(m.far.length / 8) : 0, P = m.position, N = m.normal, UV = m.uv, CN = m.cn, RT = m.root, n = m.part.length, R = m.rule ? 1 : 0, out = new Uint32Array((n + R + FV) * 8);
  // (its far data, after its vertices: crowd.js; where it begins, a vertex's number, as two whole numbers a half float holds exactly)
  if (FV) { new Float32Array(out.buffer, (n + R) * 32, m.far.length).set(m.far); m.rule[14] = Math.floor((n + R) / 1024); m.rule[15] = (n + R) % 1024; }
  if (R) for (let i = 0; i < 8; i++) out[i] = (half(m.rule[i * 2]) | (half(m.rule[i * 2 + 1]) << 16)) >>> 0;   // (a crowd's level: its shape's numbers first, two to a number of 32 bits)
  // (its box: every vertex where it stands and what it grows from; a card's, enlarged about its tip as far as the rule
  // lets it, its root's too: a card grows out of it as it comes. Whatever it is moved to lies between those)
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], grow = R ? Math.max(CROWD.SWELL, m.rule[RULE.SWELL] || 0) : 1;
  const take = (x, y, z) => { if (x < box[0]) box[0] = x; if (y < box[1]) box[1] = y; if (z < box[2]) box[2] = z; if (x > box[3]) box[3] = x; if (y > box[4]) box[4] = y; if (z > box[5]) box[5] = z; };
  for (let v = 0; v < n; v++) {
    const p = v * 3; take(P[p], P[p + 1], P[p + 2]); take(RT[p], RT[p + 1], RT[p + 2]);
    if (R) { const T = m.tip; take(T[p], T[p + 1], T[p + 2]); if ((m.part[v] & 3) === 1) for (const Q of [P, RT]) take(T[p] + (Q[p] - T[p]) * grow, T[p + 1] + (Q[p + 1] - T[p + 1]) * grow, T[p + 2] + (Q[p + 2] - T[p + 2]) * grow); }
  }
  for (let v = 0; v < n; v++) {
    const o = (v + R) * 8, p = v * 3;
    out[o] = (gx(P[p]) | (gy(P[p + 1]) << 16)) >>> 0;
    oct8(N[p], N[p + 1], N[p + 2]);
    out[o + 1] = (gx(P[p + 2]) | (OU << 16) | (OV << 24)) >>> 0;
    out[o + 2] = (held((UV[v * 2] + UV0) * UVK, 65535) | (held((UV[v * 2 + 1] + UV0) * UVK, 65535) << 16)) >>> 0;
    oct8(CN[p], CN[p + 1], CN[p + 2]);
    out[o + 3] = (held(m.ao[v] * 255, 255) | ((m.part[v] & 3) << 8) | ((m.twig?.[v] > 0.5 ? 1 : 0) << 12) | (OU << 16) | (OV << 24)) >>> 0;
    out[o + 4] = (gx(RT[p]) | (gy(RT[p + 1]) << 16)) >>> 0;
    out[o + 5] = gx(RT[p + 2]);
    if (R) {
      const T = m.tip, go = m.go[v], q = !(go > 0) ? 0 : Math.max(1, Math.min(65535, Math.round((Math.log2(go) + GO0) * GOQ)));
      out[o + 6] = (gx(T[p]) | (gy(T[p + 1]) << 16)) >>> 0;
      out[o + 7] = (gx(T[p + 2]) | (q << 16)) >>> 0;
    }
  }
  return { index: R ? Uint32Array.from(m.index, (x) => x + R) : Uint32Array.from(m.index), verts: out, count: n + R, box: n ? Float32Array.from(box) : null };   // (count: its numbers and its vertices; its far data after them is not counted)
}

/** A plant asset's shapes (assets/*.js made by the tree kit's tree()) as a family of the zoo (assets/zoo/index.js):
    `id` its name there. Its kinds are its shapes; its levels the asset's (each a first share of its finest, by the
    crowd kit: crowdAt), and after them, where it has one, its shade (what the shadow map is drawn from). The engine
    that places plants (src/scatter/trees.js) finds it by the asset's uid. */
export const plantFamily = (id, asset) => ({
  id, placed: 'trees', asset: asset.uid, count: asset.shapeCount, get levels() { return asset.levelCount + (asset.shadeRaw ? 1 : 0); },
  // (room.band: { band: the sizes on screen the level is drawn between, as its stand's drawer cut its levels, atlas: the
  // numbers its far end's atlases are sized by } (src/scatter/trees.js); 'shade', its shade: what the shadow map is drawn
  // from, none for a plant without one)
  meshOf: (i, l, room = null) => { const b = room?.band; return packPlant(b === 'shade' || (!b && l >= asset.levelCount) ? (asset.shadeRaw ? asset.shadeRaw(i) : NONE) : crowdAt(asset, i, l, b?.band ?? null, b?.atlas)); },
  // what of a shape is solid, and its box (src/world/bodies.js), in metres of its own frame at scale 1: its kind's rule
  // (assets/kinds.js: a tree its trunk, a shrub its leaves) made from what the tree kit measured of it (its height, its
  // trunk where a walker meets it) and its asset's footprint at that height
  boundsOf: (i) => { const d = dimsOf(asset, i), x = Math.max(d.length, d.width) / 2; return { min: [-x, 0, -x], max: [x, d.height, x] }; },
  collidersOf: (i) => shapesOf(kindRule(asset, 'solid'), dimsOf(asset, i)),
});
const dimsOf = (asset, i) => { const H = most(asset.size.height), h = asset.heights?.[i] ?? H, k = h / H; return { height: h, length: most(asset.size.length) * k, width: most(asset.size.width ?? asset.size.length) * k, trunk: asset.trunk?.[i] ?? null }; };

// ---- the plants' levels by the crowd kit (intent 0033): one build of a shape's finest, every level a first share of
// it (assets/kit/crowd.js), holding all that its sizes ask for; what is drawn of it is the crowd kit's rule ----
/** How deep a plant's foot is set into the ground (src/scatter/trees.js stands it so). */
export const FOOT = 0.15;
/** Whether a plant has a far end (its impostor, after its clumps where the crowd kit finds them): its own, else its kind's. */
export const hasFar = (a) => !!(a.far ?? kindRule(a, 'far'));
/** Where a plant is gone (src/detail/error.js goneAt): the land under it wears its stand's colour or its floor, so leaving
    it out differs by how far it stands over the ground, of its size on screen's measure, the most of its shapes'. */
export const goneOf = (a) => {
  let e = 0; for (let i = 0; i < (a.shapeCount ?? 1); i++) e = Math.max(e, Math.max(0, (a.heights?.[i] ?? most(a.size.height)) - FOOT) / shapeSize(a, i));
  return goneAt(e || 1);
};
/** The sizes on screen each level of a plant is drawn between, finest first: [lo, hi]: everything's (rungPx), down to the
    one its end falls in, the last to where it has sunk away, the BAND under its end (src/detail/handover.js: it is
    whole down to where leaving it out fits). A stand cuts its kinds' as one (src/scatter/trees.js groupsOf). */
export const bandsOf = (a) => { const g = goneOf(a), last = rungAt(g); return Array.from({ length: last + 1 }, (_, l) => [l === last ? g / BAND : rungPx(l), l ? rungPx(l - 1) : Infinity]); };
/** How large shape `shape` of a plant is at scale 1, as its size on screen is measured (src/scatter/trees.js sizeAtOne). */
export const shapeSize = (a, shape) => { const H = a.size.height, S = a.growth?.stages?.find((x) => shape >= x.offset && shape < x.offset + x.variants); return (S ? a.heights?.[shape] ?? S.h : H) * (kindRule(a, 'measure') === 'height' ? 1 : Math.max(most(a.size.length), most(a.size.width ?? 0), most(H)) / H); };
const BUILT = new Map();   // (the last few shapes built: a kind's levels are asked for one after another)
// (the shade of a plant that has none, where its stand's drawer asks every kind for one: nothing)
const NONE = { position: [], normal: [], uv: [], cn: [], root: [], part: [], ao: [], index: [] };
/** A place along one axis as the GPU reads it back from the heap (the grid a vertex is packed on, above): where a
    chunk's parts are found by their tips (crowd.js clumpsOf), the same on both sides of the GPU. */
const SX = (2 * GRID.xz) / 65535, SY = (GRID.y1 - GRID.y0) / 65535;
const onGrid = (v, axis) => (axis === 1 ? gy(v) * SY + GRID.y0 : gx(v) * SX - GRID.xz);
/** A plant's shape as the crowd kit builds it from its finest (tree.js finest: its sprigs splayed, where it has a
    splay): its crowd, its clumps and its impostor's frame. A: the numbers its far end's atlases are sized by (the page's:
    src/detail/impostor.js atlases; none for a plant without a far end). */
export const crowdOf = (a, i, A = null) => {
  const key = `${a.uid}:${a.placement?.seed}:${i}:${A?.key ?? ''}`; let S = BUILT.get(key);
  if (!S) { if (BUILT.size >= 4) BUILT.delete(BUILT.keys().next().value); BUILT.set(key, (S = crowd(a.finest(i), { size: shapeSize(a, i), grid: onGrid, far: hasFar(a), ...A }))); }
  return S;
};
/** Level l of shape i: what it is drawn with between its sizes on screen (its first level: every size above its own).
    band: [lo, hi] as its stand's drawer cut it (none: its own, bandsOf); A: its atlases' numbers (crowdOf). */
export const crowdAt = (a, i, l, band = null, A = null) => { const [lo, hi] = band ?? bandsOf(a)[l]; return levelOf(crowdOf(a, i, A), lo, band ? hi : l === 0 ? Infinity : hi); };
