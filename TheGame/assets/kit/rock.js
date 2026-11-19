// A rock by its recipe (an asset of kind rock: assets/boulder.js, stone.js): a ball pulled out of round by slow noise,
// faces broken off it by planes (its look's `cuts`), left rough or worn round (`smooth`), then squashed and tipped over
// as it came to lie. Each of an asset's shapes (placement.shapes, from its seed) is a kind of the heap
// (src/scatter/heap.js): that shape at every level of the ladder (ladder.js), from a full mesh of 110 000 triangles
// with its lumps and pits down to a cube and a dot, each level the same shape, smoother. Plain JS, no three: it runs in
// a worker (src/scatter/recipes.worker.js) and on the page.
//
// A kit: the families that bring a rock asset's shapes to the heap are assets/zoo/*.js (rockFamily, below).
//
//   rockMesh(asset, v, l) -> { index, verts }   shape v at level l, packed (solid.js): each vertex with its place on the
//                                               next coarser level's mesh, and how dark it is where it meets the ground
//   rockBody(asset, v) -> { span, sunk, rad, top, frame }   what who places it must know: shape v as it was grown
//                                               (span: its largest side then, rad: how far it reaches from its middle,
//                                               top: how high it stands), how much of its largest side lies under the
//                                               ground, and its box as it is drawn (frame: its largest side 1)
// A rock is drawn at its size: a rock of size s is s across, its largest side, metres (its asset's size.length, which
// is the measure's: world/scale.js). No engine scales it by anything of its own.
//   rockFamily(id, asset)                       the asset's shapes as a family of the zoo (assets/zoo/index.js)
import { LADDER, FULLN, DOTN, underOf } from './ladder.js';
import { ball, ballMesh, hash3, noise3, SWELL } from './blob.js';
import { dotMesh } from './solid.js';
import { ladderOf, ladderMesh } from './reduce.js';
import { LOD } from './crowd.js';   // (`?lod=new`: its levels made from its full mesh by the one reduction, intent 0033)
import { sstep } from './math.js';
import { kindOf, kindRule, shapesOf } from '../kinds.js';

/** squares along an edge of a rock's full mesh (12 n² triangles) */
export const FULL_ROCK = 96;
/** how far under the ground a rock's middle lies, of its size: it is half buried */
export const BURIED = 0.22;
// how much of a ripple of frequency f a mesh of n squares an edge can carry (as blob.js: a coarse level is the same
// shape, smoother: no ripple it cannot draw)
const carry = (n, f) => Math.min(1, Math.max(0, (n / (3.14 * f) - 0.5) * 2));

// shape v of an asset: its numbers, from the asset's seed (another seed, as the library's Random gives: another shape)
const SHAPES = new Map();
function shapeOf(asset, v) {
  const key = `${asset.uid}:${asset.placement.seed}:${v}`; let S = SHAPES.get(key); if (S) return S;
  if (SHAPES.size > 512) SHAPES.clear();   // (a library pressed for seed after seed keeps no more than a few hundred)
  const look = asset.look ?? {}, seed = asset.placement.seed + v * 7, h = (i) => hash3(i, 9, v, seed), cuts = [];
  for (let k = 0; k < Math.round(7 * (look.cuts ?? 1)); k++) {   // the faces it lost: each a plane, so far from its middle
    const x = hash3(k, 1, 0, seed) - 0.5, y = hash3(k, 2, 0, seed) - 0.5, z = hash3(k, 3, 0, seed) - 0.5, l = Math.hypot(x, y, z) || 1;
    cuts.push([x / l, y / l, z / l, 0.62 + 0.3 * hash3(k, 4, 0, seed)]);
  }
  // how it came to lie: as wide as 0.8 … 1.3 of its size, as high as 0.55 … 0.95, tipped about an axis of its own
  let ax = h(4) - 0.5, ay = h(5) - 0.5, az = h(6) - 0.5; const al = Math.hypot(ax, ay, az) || 1, ang = h(7) * 6.2831853;
  S = { seed, sm: 1 - 0.75 * (look.smooth ?? 0), cuts, sx: 0.8 + 0.5 * h(1), sy: 0.55 + 0.4 * h(2), sz: 0.8 + 0.5 * h(3), ax: ax / al, ay: ay / al, az: az / al, c: Math.cos(ang), s: Math.sin(ang), box: null, body: null };
  SHAPES.set(key, S);
  return S;
}
// a point of shape S's surface at level n, its direction (x, y, z) a unit vector: out[o … o + 2] its place, for a rock
// of size 1 lying as it lies (its middle at 0)
function surface(S, n, x, y, z, out, o) {
  const sd = S.seed, w2 = carry(n, 3.3), w3 = carry(n, 8), w4 = carry(n, 19), w5 = carry(n, 44), fine = 0.3 + 0.7 * S.sm;
  let r = 1 + 0.5 * (noise3(x * 1.4 + 9, y * 1.4, z * 1.4, sd) - 0.5) * carry(n, 1.4);
  if (w2) r += S.sm * 0.22 * (noise3(x * 3.3, y * 3.3 + 5, z * 3.3, sd + 1) - 0.5) * w2;
  if (w3) r += S.sm * 0.08 * (noise3(x * 8, y * 8, z * 8 + 3, sd + 2) - 0.5) * w3;
  if (w4) r += fine * 0.03 * (noise3(x * 19 + 4, y * 19, z * 19, sd + 3) - 0.5) * w4;   // its lumps and its pits: only its finest meshes carry them
  if (w5) r += fine * 0.012 * (noise3(x * 44, y * 44 + 2, z * 44, sd + 4) - 0.5) * w5;
  for (const c of S.cuts) { const dt = x * c[0] + y * c[1] + z * c[2]; if (dt > 0.05) { const lim = c[3] / dt; if (lim < r) r = lim + (r - lim) * 0.12; } }   // (a face it lost: flat, a little of its relief left on it)
  const px = x * r * S.sx, py = y * r * S.sy, pz = z * r * S.sz, d = S.ax * px + S.ay * py + S.az * pz, k = 1 - S.c;
  out[o] = px * S.c + (S.ay * pz - S.az * py) * S.s + S.ax * d * k;
  out[o + 1] = py * S.c + (S.az * px - S.ax * pz) * S.s + S.ay * d * k;
  out[o + 2] = pz * S.c + (S.ax * py - S.ay * px) * S.s + S.az * d * k;
}
// its own frame (its foot at 0, its middle over 0, its largest side 1) and what who places it must know, measured on
// a mesh of 8 squares an edge: every level of it lies in the same frame
function measure(S) {
  if (S.body) return S;
  const F = ball(8, (x, y, z, out, o) => { surface(S, 8, x, y, z, out, o); return 1; }, true), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let v = 0; v < F.V; v++) for (let a = 0; a < 3; a++) { const p = F.pos[v * 3 + a]; if (p < lo[a]) lo[a] = p; if (p > hi[a]) hi[a] = p; }
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), mx = (lo[0] + hi[0]) / 2, mz = (lo[2] + hi[2]) / 2; let rad = 0;
  for (let v = 0; v < F.V; v++) rad = Math.max(rad, Math.hypot(F.pos[v * 3] - mx, F.pos[v * 3 + 2] - mz));
  S.box = { x: mx, y: lo[1], z: mz, k: 1 / span };
  S.body = { span, sunk: (BURIED - lo[1]) / span, rad, top: hi[1] - BURIED, frame: { min: [(lo[0] - mx) / span, 0, (lo[2] - mz) / span], max: [(hi[0] - mx) / span, (hi[1] - lo[1]) / span, (hi[2] - mz) / span] } };   // (frame: its box in the frame it is drawn in)
  return S;
}
// shape S's surface at level n in its own frame: what ball() asks (out: the point; returns its shade: darker where it
// meets the ground, the dark of the gap under it)
const rockAt = (S, n) => {
  const B = measure(S).box, sw = SWELL[n] ?? 1, cy = 0.5 / B.k;   // (a coarse body is swollen to cover as much of the screen as the rock: blob.js)
  return (x, y, z, out, o) => {
    surface(S, n, x, y, z, out, o);
    const ly = out[o + 1];
    out[o] = (out[o] - B.x) * sw * B.k; out[o + 1] = ((out[o + 1] - B.y - cy) * sw + cy) * B.k; out[o + 2] = (out[o + 2] - B.z) * sw * B.k;
    return 0.45 + 0.55 * sstep(-0.25, 0.35, ly);
  };
};
/** Shape v of a rock asset at its full detail, all its recipe makes: { V, pos, nor, shade, index } (assets/kit/blob.js:
    ball), its own frame (its foot at 0, its largest side 1). */
export const rockFull = (asset, v) => { const S = shapeOf(asset, v); return ball(FULL_ROCK, rockAt(S, FULL_ROCK), true); };
// (`?lod=new`: a shape's levels, all from its full mesh by the one reduction (reduce.js), the last few kept: a worker
// asked for a shape's levels one after another makes them once)
const CHAINS = new Map();
const chainOf = (asset, v) => {
  const key = `${asset.uid}:${asset.placement.seed}:${v}`; let C = CHAINS.get(key); if (C) return C;
  if (CHAINS.size >= 3) CHAINS.delete(CHAINS.keys().next().value);
  CHAINS.set(key, (C = ladderOf(rockFull(asset, v)))); return C;
};
/** Shape v of a rock asset at level l of the ladder. Under `?lod=new` every level is made from its full mesh alone
    (sketch: as before, the recipe drawn coarser: what is wanted on the page at once, the library's). */
export function rockMesh(asset, v, l, sketch = false) {
  const n = LADDER[l].n;
  if (n === DOTN) return dotMesh();
  if (LOD.on && !sketch) return ladderMesh(chainOf(asset, v), l);
  const S = shapeOf(asset, v);
  return ballMesh((q) => rockAt(S, q), n === FULLN ? FULL_ROCK : n, underOf(l), LADDER[l].delta);
}
/** What who places shape v must know: { span (its largest side as it was grown), sunk (how much of its largest side
    lies under the ground), rad (how far it reaches from its middle, level, as grown), top (how high it stands over the
    ground, as grown), frame (its box in the frame it is drawn in: its foot at 0, its largest side 1) }. Drawn at size s,
    it is s across. */
export const rockBody = (asset, v) => measure(shapeOf(asset, v)).body;

/** A rock asset's shapes as a family of the zoo (assets/zoo/index.js): `id` its name there. The engine that places
    rocks (src/scatter/rocks.js) finds it by the asset's uid. Its look is the asset's: the world's material it wears,
    its tint, its moss, its relief. */
export const rockFamily = (id, asset) => ({
  id, placed: 'rocks', asset: asset.uid, count: asset.placement.shapes ?? 1,
  meshOf: (i, l) => rockMesh(asset, i, l),
  // (what its fingerprint reads: the recipe drawn coarser, quick on the page, and which way its levels are made)
  printOf: (i, l) => rockMesh(asset, i, l, true), print: () => (LOD.on ? 'reduce 1' : ''),
  lookOf: (i) => {
    // (size: its largest side as a stand that sizes its kinds by their look draws it, src/scatter/stress.js: the size
    // the world draws most of them at, its asset's least to most by the cube of a die, as src/scatter/rocks.js does)
    const B = rockBody(asset, i), L = asset.look ?? {}, [lo, hi] = asset.size.length, middle = lo + (hi - lo) * 0.125;
    return { model: 'glossy', mean: L.tint ?? [1, 1, 1], c2: [0, 0, 0], material: L.material ?? null, cover: L.moss ?? 1, bump: L.relief ?? 1.1, relief: 0, scale: asset.placement.texture ?? 2, gloss: 0.2, sway: 0, snow: kindOf(asset, 'snow')?.clumps ?? 0.05, glow: 0, through: 0, size: middle, sunk: B.sunk };
  },
  fullTris: () => 12 * FULL_ROCK * FULL_ROCK,
  // what of it is solid, and its box (src/world/bodies.js), in the frame it is drawn in: its kind's rule (assets/kinds.js:
  // a rock its round, a little inside its outline (it lies half buried, and stops you where you see it), up to its top)
  boundsOf: (i) => rockBody(asset, i).frame,
  collidersOf: (i) => { const B = rockBody(asset, i), F = B.frame; return shapesOf(kindRule(asset, 'solid'), { height: F.max[1], length: F.max[0] - F.min[0], width: F.max[2] - F.min[2], round: { r: (B.rad / B.span) * 0.7, top: F.max[1] } }); },
});
