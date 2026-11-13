// The stress stand: a test of the engine, not of the world. A thousand kinds of asset nobody drew (assets/kit/blob.js:
// each its own mesh of 50 000 to 200 000 triangles, its own two textures and tints, its own way of taking the light, of
// swaying and of holding snow). Every village plot of the city (src/city: 898 of them) is filled with a million of
// them, a thousand of each kind; and in every plot ten thousand more move about, each at its own pace: people
// walking, robots, animals, transports on their rounds (stand-ins for what will live there). 898 million standing, nine
// million moving. Only with `?stress` in the address; nothing of it is in the library.
//
// How so many are placed and drawn:
//   - nothing of where they stand is kept. A plot is a row of numbers (its middle, how far its edge is in 64
//     directions); its million are a lattice of 1000 by 1000 cells folded onto that shape, worked out on the GPU for the
//     cells a tier looks at (place). So a plot costs 272 bytes, and the world's size costs nothing;
//   - where a mover is is a function of the clock (its round, its pace: moverAt), worked out afresh every frame for the
//     plots near the camera: no mover has a state to keep;
//   - a tier a level packs the ones of its level that are in view (tier.js), its patches blocks of a plot's lattice;
//     the movers are one tier, packed every frame, each dropped into its level's draw;
//   - every kind's meshes lie in one heap (heap.js): a level of every kind is one draw call, its vertices read from the
//     heap by the kind's number. Two shaders (the meshes', the dots'), whatever the number of kinds;
//   - what a kind looks like is a row of numbers (its look: `mats`), read by its pixels by the kind's number: its
//     textures are layers of the world's one texture array, its way of taking the light one of the shader's models
//     (MODELS: matte, glossy, metal, leafy, glowing, wet, velvet, …). A new look is a row, a new model a branch: neither
//     a draw call nor a shader;
//   - the coarse levels of every kind are always there; the fine ones (the full mesh, and two under it) only of the
//     kinds that stand or pass near, built in workers as the camera comes and put out again when it has gone. Until a
//     fine level has come, the next coarser one is drawn in its place.
//
// Nothing of it appears, changes or drops out at once:
//   - its level by its size on screen (src/detail: one rule for every kind), so a large thing keeps its detail further
//     off than a small one beside it;
//   - over the last of a level's range every vertex moves to where it lies on the next coarser mesh (its normal, its
//     pattern and its shade with it: heapVertex), so when the coarser one takes over it is the same shape to the pixel;
//   - a fine level that comes late grows out of the coarser one the same way, over GROW seconds from when it came;
//   - its textures are read at every level (the GPU's mipmaps make a far thing its textures' mean), its relief fades in
//     with its size; its last level is a dot of that mean, sinking away under a pixel.
import * as THREE from 'three/webgpu';
import { Fn, If, float, int, uint, vec2, vec3, vec4, uniform, uniformArray, varyingProperty, storage, instanceIndex, vertexIndex, cameraViewMatrix, dFdx, dFdy, cos, sin, atan, abs, max, pow, mix, sqrt, floor, cross, reflect, length, normalize, smoothstep, clamp } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { camDist, groundAt, rnd } from '../world/land.nodes.js';
import { cellRnd } from '../world/land.js';
import { finish, skyLight, cloudAtOne, cloudShade, sunDim, unlit, weatherOn, snowLift, windAt, windStrength } from '../world/light.js';
import { pxK } from '../detail/index.js';
import { bandOf, padOf } from '../detail/handover.js';
import { boxIn } from '../core/frustum.js';
import { Tier, offScreen, clipOf, MAXP } from './tier.js';
import { inView } from './view.js';
import { createHeap, heapRow, heapVertex, heldOf, sinceCame, effective } from './heap.js';
import { fullOf, trisOf, vertsOf, blobLook, MODELS } from '../../assets/kit/blob.js';
import { recipes } from '../core/registry.js';
import CITY from '../../world/city.js';

const KINDS = 1000, SIDE = 1000, MSIDE = 100;   // a thousand kinds; a plot's lattice: a thousand cells a side, one asset in each (a thousand of every kind); its movers' lattice: ten thousand
const PLOTS = Math.round(CITY.people / CITY.perVillage), RAYS = 64, ROW = 4 + RAYS + RAYS + 1, BITS = 11, TAU = Math.PI * 2;   // a plot's row: its middle (x, z), its mean reach, its things' scale, then how far its edge is in RAYS directions, then the directions that cut its land into RAYS equal shares; BITS: a cell's number holds its plot above them
const SMIN = 0.25, SMAX = 2.2, MMAX = 6, MFAR = 1400, CELL = 1.4, FIT = 1.5, FADE = 0.02, SINK = 1.6, FULL = 129, FULLN = -1;   // an asset's largest side, metres (a mover's up to MMAX, seen as far as MFAR); CELL: a lattice cell's side, about; FIT: the cell's side a kind's own size is meant for; FULL: the most squares an edge a full mesh has
const MORPH = 1.6, GROW = 0.5, RELIEF = 90, FARPX = 12;   // MORPH: a level turns into the next coarser over its last pixels, from this many times its end; GROW: seconds a level that came late takes to grow out of the coarser one; RELIEF: the size on screen from which its textures' relief is read; FARPX: under it a thing wears its textures' mean
// its levels, finest first. n: squares along an edge (FULLN: the kind's full mesh; under that: its dot); px: the size on
// screen it is drawn down to; P: its tier's cells a patch (a block of a plot's lattice: it divides 1000); slots: how many
// kinds' the heap holds at once (none: every kind's); cap: the most of it drawn at once
const LEVELS = [
  { n: FULLN, px: 320, P: 2, slots: 8, cap: 64 },
  { n: 32, px: 128, P: 4, slots: 48, cap: 256 },
  { n: 16, px: 64, P: 4, slots: 320, cap: 1024 },
  { n: 8, px: 32, P: 8, cap: 4096 },
  { n: 4, px: 16, P: 10, cap: 16384 },
  { n: 2, px: 8, P: 20, cap: 65536 },
  { n: 1, px: 4, P: 50, cap: 131072 },
  { n: -2, px: 1.15, P: 100, cap: 524288 },   // its dot: one triangle, turned to the eye
];
const L = LEVELS.length, STREAMED = LEVELS.filter((l) => l.slots).length, MCAP = 65536;   // MCAP: the most movers of one level drawn at once
const nOf = (k, l) => (LEVELS[l].n === FULLN ? fullOf(k) : LEVELS[l].n), coarserOf = (l) => (l + 1 < L && LEVELS[l + 1].n > 0 ? LEVELS[l + 1].n : 0);   // a level's squares an edge, and the next coarser mesh's (0: none: a cube turns into nothing)
const SHADE = { level: 5, far: 30, wide: 1.5, reach: 12, shrink: 0.85 };   // what casts their shadows: a coarse level of each round the camera, a little smaller than the thing (so it does not shade itself)

const SMOOTH = uniform(1);   // 1: levels turn into each other; 0: they change at once (window.__stress.smooth: to see the difference)
const PXK = uniform(pxK()); addEventListener('resize', () => (PXK.value = pxK()));

// ---- a plot's lattice folded onto its shape, in JS (the same reckoning as the GPU's below: place, moverAt), for what the
// CPU must know: which blocks of it a tier looks at, and which kinds stand or pass near the camera ----
// a square (-1 … 1 each way) onto the unit disc, area for area (Shirley's concentric map), and back
const diskOf = (u, v) => { if (!u && !v) return [0, 0]; const big = Math.abs(u) > Math.abs(v), r = big ? u : v, phi = big ? (Math.PI / 4) * (v / u) : Math.PI / 2 - (Math.PI / 4) * (u / v); return [r * Math.cos(phi), r * Math.sin(phi)]; };
const squareOf = (rho, th) => {
  let phi = th < -Math.PI / 4 ? th + TAU : th; const q = Math.PI / 4;
  if (phi < q) return [rho, (phi * rho) / q]; if (phi < 3 * q) return [(-(phi - 2 * q) * rho) / q, rho];
  if (phi < 5 * q) return [-rho, (-(phi - 4 * q) * rho) / q]; return [((phi - 6 * q) * rho) / q, -rho];
};
const reachOf = (p, th) => { const t = ((th / TAU) % 1 + 1) % 1 * RAYS, i0 = Math.floor(t) % RAYS, f = t - Math.floor(t); return p.R[i0] * (1 - f) + p.R[(i0 + 1) % RAYS] * f; };
// the lattice is folded onto a plot's shape share for share: the disc's angle is a share of the plot's land (TH: the
// directions that cut it into RAYS equal shares), so as many stand in a narrow corner of it as in a wide one, for its size
const turnOf = (p, f) => { const t = (((f % 1) + 1) % 1) * RAYS, i0 = Math.min(RAYS - 1, Math.floor(t)); return p.TH[i0] + (p.TH[i0 + 1] - p.TH[i0]) * (t - i0); };
const shareOf = (p, th) => { let lo = 0, hi = RAYS; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.TH[m] <= th) lo = m; else hi = m; } return (lo + (th - p.TH[lo]) / Math.max(1e-9, p.TH[lo + 1] - p.TH[lo])) / RAYS; };
/** Where a point of plot p's lattice (fi, fj: 0 … 1000 each way) lies on the land. */
const toLand = (p, fi, fj) => { const [dx, dz] = diskOf((fi / SIDE) * 2 - 1, (fj / SIDE) * 2 - 1), th = turnOf(p, Math.atan2(dz, dx) / TAU), r = Math.hypot(dx, dz) * reachOf(p, th); return [p.x + Math.cos(th) * r, p.z + Math.sin(th) * r]; };
/** And the lattice point of a place on the land (outside the plot: beyond 0 … 1000). */
const toLattice = (p, x, z) => { const dx = x - p.x, dz = z - p.z, th = ((Math.atan2(dz, dx) % TAU) + TAU) % TAU; let phi = shareOf(p, th) * TAU; if (phi > Math.PI) phi -= TAU; const [a, b] = squareOf(Math.hypot(dx, dz) / reachOf(p, th), phi); return [((a + 1) / 2) * SIDE, ((b + 1) / 2) * SIDE]; };
// a row of a plot's lattice holds every kind once: cell i of row j is kind (i·a + b) mod 1000, a with no factor in
// common with 1000 (it ends in 1, 3, 7 or 9), a and b the row's own
const rowOf = (p, j) => { const r4 = Math.floor(cellRnd(p.i, j, 902) * 4); return [Math.floor(cellRnd(p.i, j, 901) * 100) * 10 + 1 + 2 * r4 + (r4 >= 2 ? 2 : 0), Math.floor(cellRnd(p.i, j, 904) * KINDS)]; };
/** What stands in cell (i, j) of plot p: { x, z, k (its kind), s (its size) }. */
const standsAt = (p, i, j, sizes) => {
  const c = (p.i << BITS) + i, [x, z] = toLand(p, i + 0.15 + 0.7 * cellRnd(c, j, 905), j + 0.15 + 0.7 * cellRnd(c, j, 906)), [a, b] = rowOf(p, j), k = (i * a + b) % KINDS;
  return { x, z, k, s: Math.min(SMAX, Math.max(SMIN, sizes[k] * (0.8 + 0.4 * cellRnd(c, j, 903)) * p.k)) };
};
// a mover's own numbers, from its hash: what it is (a person, a robot, an animal, a transport), its pace (m/s), its size,
// its kind, and its round: a transport's a ring road of its plot (which ring, which way, where it started); the others'
// a wander round a home (how far, how the two swings beat)
const moverOf = (p, i, j) => {
  const c = (p.i << BITS) + i, h = (s) => cellRnd(c, j, s), cl = h(921), h2 = h(922), h3 = h(923), h4 = h(924), h5 = h(925), h6 = h(926);
  const T = cl >= 0.9, A = !T && cl >= 0.75, R = !T && !A && cl >= 0.55;
  const v = T ? 8 + 12 * h2 : A ? 0.4 + 6 * h2 * h2 : R ? 2.5 + 2.5 * h2 : 0.8 + h2, s = T ? 3 + 3 * h3 : A ? 0.4 + 1.2 * h3 : R ? 1 + 1.4 * h3 : 1.5 + 0.4 * h3;
  if (T) return { T, v, s, k: Math.floor(h(927) * KINDS), rho: 0.3 + 0.25 * Math.floor(h4 * 3) + (h6 - 0.5) * 0.012, dir: h5 < 0.5 ? 1 : -1, th0: h6 * TAU };
  const th0 = h5 * TAU, rho0 = Math.sqrt(h4) * 0.8, R0 = reachOf(p, th0), a = 15 + 60 * h6, w1 = v / a;
  return { T, v, s, k: Math.floor(h(927) * KINDS), hx: p.x + Math.cos(th0) * R0 * rho0, hz: p.z + Math.sin(th0) * R0 * rho0, a, w1, w2: w1 * (0.6 + 0.5 * h3), p1: h2 * TAU * 7, p2: h6 * TAU * 13 };
};
/** Where a mover is at t seconds: [x, z]. */
const moverAtJS = (p, M, t) => {
  if (M.T) { const th = M.th0 + (M.dir * M.v * t) / (p.mean * M.rho), R = reachOf(p, th); return [p.x + Math.cos(th) * R * M.rho, p.z + Math.sin(th) * R * M.rho]; }
  return [M.hx + M.a * Math.sin(M.w1 * t + M.p1), M.hz + 0.7 * M.a * Math.sin(M.w2 * t + M.p2)];
};
// a plot as the stand keeps it: its number, a point inside it, and how far its edge is from there in RAYS directions
// (a ray from the point to the outline, a little short of it: what the lattice is folded onto, all of it inside the plot)
function plotOf(cp, i) {
  const O = cp.outline, n = O.length / 3, hit = (x, z, th) => {
    const dx = Math.cos(th), dz = Math.sin(th); let best = Infinity;
    for (let a = 0; a < n; a++) {
      const b = (a + 1) % n, ax = O[a * 3] - x, az = O[a * 3 + 2] - z, ex = O[b * 3] - O[a * 3], ez = O[b * 3 + 2] - O[a * 3 + 2], den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den; if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  };
  const p = { i, id: cp.id, x: cp.x, z: cp.z, R: new Float32Array(RAYS), TH: new Float32Array(RAYS + 1) }; let mean = 0, most = 0, least = Infinity;
  for (let r = 0; r < RAYS; r++) { const t = hit(p.x, p.z, (r / RAYS) * TAU), R = Math.max(30, (Number.isFinite(t) ? t : 30) * 0.97); p.R[r] = R; mean += R / RAYS; most = Math.max(most, R); least = Math.min(least, R); }
  // its land's shares by direction: the slice between two rays, summed round, then the directions at every 1/RAYS of it
  const slice = Array.from(p.R, (R, r) => (R * R + p.R[(r + 1) % RAYS] ** 2) / 4 * (TAU / RAYS)), area = slice.reduce((x, y) => x + y, 0);
  for (let m = 1, r = 0, sum = 0; m < RAYS; m++) { const want = (m / RAYS) * area; while (sum + slice[r] < want) sum += slice[r++]; p.TH[m] = ((r + (want - sum) / slice[r]) / RAYS) * TAU; }
  p.TH[RAYS] = TAU;
  // (cell: a lattice cell's side; narrow, wide: its shortest and longest side, where the plot's reach is unlike its
  // mean; k: how much smaller or larger than their own size its things stand, so a small plot's million fit as a large one's do)
  const cell = Math.sqrt(area / (SIDE * SIDE)), rms = Math.sqrt((2 * area) / TAU);
  return Object.assign(p, { mean, most, least, area, cell, narrow: cell * Math.min(least / rms, rms / most), wide: cell * Math.max(most / rms, rms / least), k: cell / FIT });
}

export function createStress(scene, renderer, tex) {
  // the plots, as the GPU reads them: a row each (ROW numbers: its middle, its mean reach, then its edge in RAYS
  // directions), filled when the city's plan has come (src/city: made in a worker at the start)
  const plotRows = new THREE.StorageBufferAttribute(new Float32Array(PLOTS * ROW), 1), PT = storage(plotRows, 'float', PLOTS * ROW), PL = [];
  const reach = (base, th) => { const t = th.div(TAU).add(1).fract().mul(RAYS), i0 = floor(t), a = uint(i0).min(uint(RAYS - 1)); return mix(PT.element(base.add(uint(4)).add(a)), PT.element(base.add(uint(4)).add(a.add(uint(1)).mod(uint(RAYS)))), t.sub(i0)); };
  const middle = (base) => vec2(PT.element(base), PT.element(base.add(uint(1))));
  // a point of a plot's lattice (fi, fj: 0 … 1000 each way) on the land: the square onto a disc, area for area, the disc
  // onto the plot's shape (the same in JS above: toLand)
  const place = (base, fi, fj) => {
    const u = fi.div(SIDE).mul(2).sub(1), v = fj.div(SIDE).mul(2).sub(1), big = abs(u).greaterThan(abs(v)), r = big.select(u, v), num = big.select(v, u), den = r.add(r.greaterThanEqual(0).select(float(1e-6), float(-1e-6)));
    const q = num.div(den).mul(Math.PI / 4), phi = big.select(q, float(Math.PI / 2).sub(q)), d = vec2(cos(phi), sin(phi)).mul(r);
    // (the disc's angle a share of the plot's land: the direction at that share, from its row)
    const t = atan(d.y, d.x).div(TAU).add(1).fract().mul(RAYS), i0 = floor(t), at = base.add(uint(4 + RAYS)).add(uint(i0).min(uint(RAYS - 1))), th = mix(PT.element(at), PT.element(at.add(uint(1))), t.sub(i0));
    return middle(base).add(vec2(cos(th), sin(th)).mul(length(d)).mul(reach(base, th)));
  };
  // a cell's number: its plot above BITS bits, its place in the plot's lattice under them
  const plotOfCell = (c) => c.x.shiftRight(int(BITS)), inPlot = (c) => c.x.bitAnd(int((1 << BITS) - 1));

  const H = createHeap(KINDS, LEVELS.map((l) => { const n = l.n === FULLN ? FULL : l.n; return { idx: trisOf(n) * 3, verts: vertsOf(n), slots: l.slots }; }));
  const LO = uniformArray(LEVELS.map((l) => l.px));
  // every kind's look, four rows of numbers a kind: [first tint, model], [second tint, metres a tile of its textures],
  // [first texture's layer, second's, gloss, sway], [how uneven its snow lies, glow, light through it, its size]. Its textures:
  // two of the world's that tile (the ground's, the barks, the stones: src/materials)
  const LAYERS = recipes('material').filter((m) => ['ground', 'bark', 'stone', 'grass'].includes(m.kind)).map((m) => tex.layer(m)), look = new Float32Array(KINDS * 16);
  let seed = 0x9E3779B9; const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sizes = Float32Array.from({ length: KINDS }, () => 0.42 + 1.2 * rand() ** 2);   // a kind's largest side, metres
  for (let k = 0; k < KINDS; k++) {
    const B = blobLook(k), a = Math.floor(B.texA * LAYERS.length), b = (a + 1 + Math.floor(B.texB * (LAYERS.length - 1))) % LAYERS.length;
    look.set([B.c1[0] * 1.7, B.c1[1] * 1.7, B.c1[2] * 1.7, B.model, B.c2[0] * 1.7, B.c2[1] * 1.7, B.c2[2] * 1.7, B.scale, LAYERS[a], LAYERS[b], B.gloss, B.sway, B.snow, B.glow, B.through, sizes[k]], k * 16);
  }
  const mats = storage(new THREE.StorageBufferAttribute(look, 4), 'vec4', KINDS * 4), lookOf = (kind, j) => mats.element(kind.mul(uint(4)).add(uint(j)));
  // what a pixel is given: where it is and its pattern; its normal and its shade; where it is on the thing (metres from
  // its foot, at rest) and its kind; how large the thing is on screen
  const vA = varyingProperty('vec4', 'sA'), vB = varyingProperty('vec4', 'sB'), vC = varyingProperty('vec4', 'sC'), vPx = varyingProperty('float', 'sPx');

  // a thing's colour at a pixel, lit: its two textures laid on it from three sides (they stay on it as it stands), mixed
  // by its pattern and tinted; their relief when it is large on screen; the snow on it; then its model's way of taking
  // the light. One piece of code for every kind and level: what differs is read from its look.
  const shade = () => {
    const kind = uint(vC.w.add(0.5)), M0 = lookOf(kind, 0), M1 = lookOf(kind, 1), M2 = lookOf(kind, 2), M3 = lookOf(kind, 3), w = vA.xyz;
    const N0 = normalize(vB.xyz), q = vC.xyz.div(M1.w), b0 = pow(abs(N0), vec3(4)), b = b0.div(b0.x.add(b0.y).add(b0.z));
    // (how fast its texture runs across the screen, asked once here: a read inside a branch that asks it itself makes the
    // GPU work out every branch for every pixel)
    const gx = dFdx(q), gy = dFdy(q);
    // (a texture is read from two sides, not three: the two its face is turned towards; the third's share is nothing
    // where it would be dropped, so nothing jumps)
    const an = abs(N0), least = an.x.min(an.y).min(an.z), wt = an.sub(least).max(0), w2 = wt.mul(wt), dx = an.x.lessThanEqual(an.y).and(an.x.lessThanEqual(an.z)), dz = dx.not().and(an.z.lessThan(an.y));
    const p1 = dx.select(q.xz, q.zy), g1x = dx.select(gx.xz, gx.zy), g1y = dx.select(gy.xz, gy.zy), k1 = dx.select(w2.y, w2.x).add(1e-5), p2 = dz.select(q.xz, q.xy), g2x = dz.select(gx.xz, gx.xy), g2y = dz.select(gy.xz, gy.xy), k2 = dz.select(w2.y, w2.z).add(1e-5);
    const sides = (read) => read(p1, g1x, g1y).mul(k1).add(read(p2, g2x, g2y).mul(k2)).div(k1.add(k2));
    // (a pixel reads only the texture its pattern shows there: both only along the pattern's edges)
    const m = smoothstep(0.35, 0.65, vA.w), c1 = vec3(0).toVar(), c2 = vec3(0).toVar();
    // (and a thing of a few pixels reads its textures' mean, one small read each: what the mipmaps would give it anyway)
    const far = vPx.lessThan(FARPX), mean = (layer) => tex.a(layer, vec2(0.5)).level(8), once = (layer) => { const a = vec4(0).toVar(); If(far, () => { a.assign(mean(layer)); }).Else(() => { a.assign(sides((p, dx, dy) => tex.a(layer, p).grad(dx, dy))); }); return a; };
    If(m.lessThan(0.995), () => { const a = once(M2.x); c1.assign(a.rgb.mul(a.rgb).mul(M0.rgb)); });
    If(m.greaterThan(0.005), () => { const a = once(M2.y); c2.assign(a.rgb.mul(a.rgb).mul(M1.rgb)); });
    const n = N0.toVar(), rough = float(0.7).toVar();
    If(vPx.greaterThan(RELIEF), () => {   // (its relief: only where it is large enough to show, faded in)
      const t1 = tex.n(M2.x, q.zy).grad(gx.zy, gy.zy), t2 = tex.n(M2.x, q.xz).grad(gx.xz, gy.xz), t3 = tex.n(M2.x, q.xy).grad(gx.xy, gy.xy), x = t1.xy.mul(2).sub(1), y = t2.xy.mul(2).sub(1), z = t3.xy.mul(2).sub(1);
      n.assign(normalize(N0.add(vec3(0, x.y, x.x).mul(b.x).add(vec3(y.x, 0, y.y).mul(b.y)).add(vec3(z.x, z.y, 0).mul(b.z)).mul(smoothstep(RELIEF, RELIEF * 2, vPx)))));
      rough.assign(t1.a.mul(b.x).add(t2.a.mul(b.y)).add(t3.a.mul(b.z)));
    });
    const W = weatherOn(n, snowLift(w, M3.x)), bare = mix(c1, c2, m).mul(vB.w), col = bare.mul(W.keep).add(W.add).toVar();
    // the light: the sky's, and the sun's through the clouds and the shadow map
    const sunK = cloudAtOne(w);
    const V = normalize(U.uCam.sub(w)), S = U.uSunDir, sun = U.uSun.mul(sunK), sky = skyLight(n), ndl = max(n.dot(S), 0), Hf = normalize(V.add(S)), ndh = max(n.dot(Hf), 0), nv = max(n.dot(V), 0);
    const gloss = M2.z.mul(float(1).sub(rough.mul(0.6))).mul(W.keep), back = max(V.negate().dot(S), 0), plain = col.mul(sky.add(sun.mul(ndl)));
    const lit = vec3(0).toVar(), model = M0.w;
    // its model: how it takes the light (assets/kit/blob.js: MODELS of them)
    If(model.lessThan(0.5), () => { lit.assign(plain); })   // matte
      .ElseIf(model.lessThan(1.5), () => { lit.assign(plain.add(sun.mul(pow(ndh, 40)).mul(gloss).mul(0.5))); })   // glossy: a highlight
      .ElseIf(model.lessThan(2.5), () => { lit.assign(col.mul(0.3).mul(sky.add(sun.mul(ndl))).add(skyLight(reflect(V.negate(), n)).mul(M0.rgb).mul(0.35)).add(sun.mul(M0.rgb).mul(pow(ndh, 120)).mul(gloss))); })   // metal: the sky in it, its highlight its own colour
      .ElseIf(model.lessThan(3.5), () => { lit.assign(col.mul(sky.add(sun.mul(max(n.dot(S).add(0.5).div(1.5), 0).add(pow(back, 3).mul(M3.z)))))); })   // leafy: the light round its edge and through it
      .ElseIf(model.lessThan(4.5), () => { lit.assign(plain.add(M1.rgb.mul(M3.y).mul(smoothstep(0.6, 0.9, m)).mul(sin(U.uTime.mul(2).add(vC.w)).mul(0.2).add(0.4)))); })   // glowing in its second colour, slowly beating
      .ElseIf(model.lessThan(5.5), () => { lit.assign(col.mul(0.6).mul(sky.add(sun.mul(ndl))).add(sun.mul(pow(ndh, 200)).mul(1.2)).add(sky.mul(pow(float(1).sub(nv), 5)).mul(0.6))); })   // wet: darker, a hard highlight, the sky at its edge
      .ElseIf(model.lessThan(6.5), () => { lit.assign(plain.add(M1.rgb.mul(pow(float(1).sub(nv), 3)).mul(sky.add(sun.mul(0.5))).mul(0.6))); })   // velvet: bright at its edge
      .ElseIf(model.lessThan(7.5), () => { lit.assign(mix(col, cos(vec3(0, 0.33, 0.67).add(nv.mul(1.5)).mul(6.2831853)).mul(0.25).add(0.25), 0.5).mul(sky.add(sun.mul(ndl))).add(sun.mul(pow(ndh, 60)).mul(0.4))); })   // iridescent: its colour turns with the angle
      .ElseIf(model.lessThan(8.5), () => { lit.assign(col.mul(sky.mul(1.1).add(sun.mul(pow(ndl, 0.6)).mul(0.9)))); })   // chalk: flat and soft
      .ElseIf(model.lessThan(9.5), () => { const th = normalize(cross(n, vec3(0, 1, 0)).add(1e-4)).dot(Hf); lit.assign(plain.add(sun.mul(pow(sqrt(max(float(1).sub(th.mul(th)), 0)), 80)).mul(gloss).mul(0.6))); })   // brushed: its highlight a band round it
      .ElseIf(model.lessThan(10.5), () => { lit.assign(col.mul(sky.add(sun.mul(max(n.dot(S).add(0.7).div(1.7), 0)))).add(M0.rgb.mul(sun).mul(back.mul(back)).mul(M3.z).mul(0.25))); })   // wax: the light deep in it
      .Else(() => { const top = smoothstep(0.45, 0.8, n.y).mul(W.keep); lit.assign(mix(col, col.mul(vec3(0.5, 1.1, 0.3)).add(vec3(0.004, 0.02, 0.002)), top).mul(sky.add(sun.mul(ndl)))); });   // overgrown: green on what faces up
    return finish(lit, w);
  };

  const SLOT = uniform(0, 'uint').onObjectUpdate(({ object }) => object?.userData?.slot ?? 0);   // where a mesh's things lie in its tier's packing, told by the mesh: every level's and every bucket's material is then one shader
  // its last level, a dot: a pixel or two of it, so one triangle turned to the eye, as large on screen as the thing, in
  // the mean of its textures and tints, plainly lit, sinking away under a pixel. A small shader of its own: a million
  // of them are a million times its corners' work, and they read nothing of the heap.
  const vDot = varyingProperty('vec4', 'sDot');
  const dot = (src) => {
    const m = new THREE.NodeMaterial();
    m.vertexNode = Fn(() => {
      const A = src.readAt(0, SLOT), B = src.readAt(1, SLOT), clip = offScreen().toVar(), px = A.w.mul(PXK).div(max(camDist(A.xy), 1e-3)), sunk = smoothstep(LEVELS[L - 1].px, LEVELS[L - 1].px * SINK, px);
      If(px.lessThanEqual(LO.element(L - 2)).and(sunk.greaterThan(0)), () => {
        const V = cameraViewMatrix, right = vec3(V.element(0).x, V.element(1).x, V.element(2).x), up = vec3(V.element(0).y, V.element(1).y, V.element(2).y);
        const r = A.w.mul(0.5).mul(sunk), j = float(vertexIndex);
        const w = vec3(A.x, A.z.add(A.w.mul(0.35)), A.y).add(right.mul(j.lessThan(0.5).select(float(-1), j.lessThan(1.5).select(float(1), float(0)))).mul(r)).add(up.mul(j.greaterThan(1.5).select(float(1.3), float(-0.5))).mul(r));
        vDot.assign(vec4(w, B.y));
        clip.assign(clipOf(w));
      });
      return clip;
    })();
    m.fragmentNode = Fn(() => {
      const out = vec4(0).toVar();
      If(unlit().not(), () => {
        const kind = uint(vDot.w.add(0.5)), M0 = lookOf(kind, 0), M1 = lookOf(kind, 1), M2 = lookOf(kind, 2), M3 = lookOf(kind, 3), w = vDot.xyz, n = normalize(normalize(U.uCam.sub(w)).add(vec3(0, 1, 0)));
        const mean = (layer) => { const a = tex.a(layer, vec2(0.5)).level(8); return a.rgb.mul(a.rgb); }, W = weatherOn(n, M3.x.mul(0.5));
        const col = mean(M2.x).mul(M0.rgb).add(mean(M2.y).mul(M1.rgb)).mul(0.5 * 0.85).mul(W.keep).add(W.add);
        out.assign(finish(col.mul(skyLight(n).add(U.uSun.mul(sunDim()).mul(cloudShade(w)).mul(max(n.dot(U.uSunDir), 0)))), w));
      });
      return out;
    })();
    return m;
  };

  const tiers = [];
  // the one material of every mesh level: level i's (shadow: the whole of it, a little smaller, for the light only)
  const meshOf = (src, i, shadow = false) => {
    const lv = uniform(i, 'uint'), whole = uniform(shadow ? 1 : 0), lo = uniform(LEVELS[i].px), morphs = uniform(coarserOf(i) ? 1 : 0), m = new THREE.NodeMaterial();   // its level as numbers: every level is one shader
    m.vertexNode = Fn(() => {
      const A = src.readAt(0, SLOT), B = src.readAt(1, SLOT), clip = offScreen().toVar();
      const px = A.w.mul(PXK).div(max(camDist(A.xy), 1e-3));   // its size on screen now
      vPx.assign(px);
      {
        // a mesh of the heap: the level its size asks for, and whether this one is drawn for it (heap.js: effective)
        const R = heapRow(H, uint(B.y), lv).toVar(), want = uint(0).toVar();
        for (let j = 0; j < L - 1; j++) want.addAssign(px.lessThanEqual(LO.element(j)).select(uint(1), uint(0)));
        If(vertexIndex.lessThan(R.z).and(whole.greaterThan(0.5).or(effective(heldOf(R), want, lv))), () => {
          // how far it has turned into the next coarser mesh: over its last pixels, and backwards from when it came
          const t = float(1).sub(whole).mul(SMOOTH).mul(max(morphs.mul(float(1).sub(smoothstep(lo, lo.mul(MORPH), px))), float(1).sub(smoothstep(0, GROW, sinceCame(R, U.uTime)))));
          const v = heapVertex(H, R, vertexIndex, t), cs = cos(B.x), sn = sin(B.x), turn = (p) => vec3(p.x.mul(cs).sub(p.z.mul(sn)), p.y, p.x.mul(sn).add(p.z.mul(cs)));
          const k = whole.greaterThan(0.5).select(float(SHADE.shrink), float(1)), rest = turn(v.p.sub(vec3(0, 0.4, 0)).mul(k).add(vec3(0, 0.4, 0)).mul(A.w));
          // the wind: its top sways, its foot stays (as a tree's: src/scatter/trees.js), as far as its look says
          const up = clamp(v.p.y, 0, 1), ws = windStrength, bend = up.mul(up).mul(A.w).mul(B.z);
          const kk = windAt(A.xy).mul(bend).add(vec2(sin(U.uTime.mul(0.9).add(B.w)), cos(U.uTime.mul(0.7).add(B.w))).mul(bend).mul(ws.mul(0.4).add(smoothstep(0, 0.08, ws).mul(0.06))));
          const w = vec3(A.x, A.z, A.y).add(rest).add(vec3(kk.x, 0, kk.y));
          vA.assign(vec4(w, v.mask)); vB.assign(vec4(turn(v.n), v.shade)); vC.assign(vec4(rest, B.y));
          clip.assign(clipOf(w));
        });
      }
      return clip;
    })();
    m.fragmentNode = Fn(() => {
      const out = vec4(0).toVar();
      If(unlit().not(), () => { out.assign(shade()); });   // (into the shadow map: only its depth)
      return out;
    })();
    return m;
  };
  const indexOf = LEVELS.map((l) => new THREE.BufferAttribute(Uint32Array.from({ length: trisOf(l.n === FULLN ? FULL : l.n) * 3 }, (_, j) => j), 1));   // (a draw as long as the level's longest mesh: its vertices are read from the heap by their number)
  const drawOf = (i) => { const g = new THREE.InstancedBufferGeometry(); g.setIndex(indexOf[i]); return g; };
  // the plots a tier may draw from: those whose land comes within `far` of the camera, and into its view
  const plotsNear = (cx, cz, h0, far, cull) => PL.filter((p) => { const d = Math.hypot(p.x - cx, p.z - cz) - p.most; return d < far && (cull === false || boxIn(p.x - p.most - cull, p.x + p.most + cull, h0 - 400, h0 + 400, p.z - p.most - cull, p.z + p.most + cull)); });

  // a tier: level i of every kind; shadow: all of it round the camera, whatever its size on screen, for the light only.
  // Its patches are blocks of P by P cells of a plot's lattice: chosen each frame from the plots near (select, below)
  const tier = (i, shadow = false) => {
    const Lv = { lo: LEVELS[i].px, hi: i ? LEVELS[i - 1].px : Infinity }, P = shadow ? 8 : LEVELS[i].P;
    const band = { near: uniform(0), far: uniform(1), ...bandOf(Lv, FADE, padOf(CELL, P)) }, round = uniform(SMAX / 2 + (CELL * P) / 16 + 2);
    // (its level and whether it is the shadow's as numbers: every tier's packing is one piece of code, compiled once)
    const lv = uniform(i, 'uint'), under = uniform(Math.max(0, i - 1), 'uint'), stands = uniform(i ? 1 : 0), all = uniform(shadow ? 1 : 0);
    const live = (c) => {
      const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar(), plot = plotOfCell(c), ci = inPlot(c), cj = c.y, base = uint(plot).mul(uint(ROW)), h = (s) => rnd(c.x, c.y, uint(s)), whole = all.greaterThan(0.5);
      const pos = place(base, float(ci).add(h(905).mul(0.7).add(0.15)), float(cj).add(h(906).mul(0.7).add(0.15))), dist = camDist(pos), range = mix(dist, length(pos.sub(U.uCam.xz)), all);
      If(range.lessThan(band.far).and(range.greaterThanEqual(band.near)).and(whole.or(inView(pos, round, SMAX))), () => {
        // its kind: its row holds every kind once (rowOf, above)
        const r4 = int(floor(rnd(plot, cj, uint(902)).mul(4))), a = int(floor(rnd(plot, cj, uint(901)).mul(100))).mul(10).add(1).add(r4.mul(2)).add(r4.greaterThanEqual(2).select(int(2), int(0)));
        const kind = uint(ci.mul(a).add(int(floor(rnd(plot, cj, uint(904)).mul(KINDS)))).mod(int(KINDS))), size = clamp(lookOf(kind, 3).w.mul(h(903).mul(0.4).add(0.8)).mul(PT.element(base.add(uint(3)))), SMIN, SMAX), span = size.mul(PXK);
        // of this level: it is there (heap.js), and the thing is the size on screen the level is drawn at, or larger
        // while its next finer level has not come
        const R = heapRow(H, kind, lv), has = R.z.greaterThan(uint(0));
        const near = dist.greaterThanEqual(span.mul(band.from).sub(band.pad)).or(stands.greaterThan(0.5).and(R.w.shiftRight(under).bitAnd(uint(1)).equal(uint(0))));
        If(has.and(whole.or(dist.lessThan(span.mul(band.to).add(band.pad)).and(near))), () => {
          A.assign(vec4(pos, groundAt(pos, float(0)).sub(size.mul(0.06)), size));
          B.assign(vec4(h(907).mul(TAU), float(kind), lookOf(kind, 2).w, h(908).mul(TAU)));   // (its turn, its kind, how far it sways, its sway's phase)
          alive.assign(1);
        });
      });
      return { alive: alive.greaterThan(0.5), data: [A, B] };
    };
    const T = new Tier(scene, drawOf(i), (src) => (i === L - 1 && !shadow ? dot(src) : meshOf(src, i, shadow)), { cell: CELL, P, near: 0, far: 1, order: 1, live, gpu: true, cap: shadow ? 8192 : LEVELS[i].cap, slots: 2 });
    T.band = shadow ? () => { T.near = 0; T.far = SHADE.far; band.near.value = -1; band.far.value = SHADE.far * SHADE.wide; }
      : () => {
        [T.near, T.far] = band.reach(SMIN, SMAX, pxK()); if (i <= STREAMED) T.near = 0;   // (a level may stand in for the finer ones, right up to the camera)
        band.near.value = T.near > 0 ? T.near : -1; band.far.value = T.far;
      };
    // its patches: of each plot near, the blocks of its lattice that lie in the tier's band of distances and in view
    // (where a block lies: its middle through toLand; a block near the camera is found by the camera's own lattice point)
    T.select = (cx, cz, h0, s, dy) => {
      const far0 = shadow ? Math.min(SHADE.far * SHADE.wide, T.far + Math.abs(dy) * 1.2) : T.far * s, far2 = far0 * far0 - dy * dy, near2 = T.near * T.near * s * s - dy * dy, list = T.list; let n = 0; T.over = false;
      if (far2 > 0) for (const p of plotsNear(cx, cz, h0, Math.sqrt(far2), shadow ? false : 0)) {
        const far = Math.sqrt(far2), [fi, fj] = toLattice(p, cx, cz), rl = far / p.narrow + P, nb = SIDE / P, rad = P * p.wide * 0.8;
        const i0 = Math.max(0, Math.floor((fi - rl) / P)), i1 = Math.min(nb - 1, Math.floor((fi + rl) / P)), j0 = Math.max(0, Math.floor((fj - rl) / P)), j1 = Math.min(nb - 1, Math.floor((fj + rl) / P));
        for (let bj = j0; bj <= j1; bj++) for (let bi = i0; bi <= i1; bi++) {
          const [x, z] = toLand(p, (bi + 0.5) * P, (bj + 0.5) * P), d = Math.hypot(x - cx, z - cz);
          if (d - rad > far || (near2 > 0 && d + rad < Math.sqrt(near2))) continue;
          const yb = 0.32 * d + 0.2 * rad + 8, c = shadow ? SHADE.reach : 0;
          if (!boxIn(x - rad - c, x + rad + c, h0 - yb, h0 + yb + c + SMAX, z - rad - c, z + rad + c)) continue;
          if (n === MAXP) { T.over = true; continue; }
          list[n++].set((p.i << BITS) + bi * P, bj * P);
        }
      }
      T.n = n; for (const m of T.meshes) m.visible = n > 0;
    };
    T.band(); T.level = i; T.viewKeyed = !shadow; T.asset = shadow ? 'Stress: shadows' : `Stress: level ${i}`;
    T.mesh.renderOrder = 1 + i * 0.01;   // the fine levels first: they are the near ones, and what is behind them need not be shaded
    if (shadow) T.mesh.layers.set(1);
    const run = T.run.bind(T); T.run = (r, world, ...a) => run(r, `${world}|${PL.length}|${H.versions[i]}|${i && !shadow ? H.versions[i - 1] : 0}`, ...a);   // packed again when the heap has changed at its level, or the next finer (which it stands in for)
    tiers.push(T);
    return T;
  };
  for (let i = 0; i < L; i++) tier(i);
  tier(SHADE.level, true);

  // ---- the movers: ten thousand a plot, each where its round has brought it by now. One tier, packed every frame; each
  // mover dropped into the draw of the level its size on screen asks for (the finest of it that is there) ----
  // where mover (mx, my) of a plot is at t, which way it faces, its size, its kind (the same in JS above: moverOf, moverAtJS)
  const moverAt = (base, mx, my, t) => {
    const h = (s) => rnd(mx, my, uint(s)), cl = h(921), h2 = h(922), h3 = h(923), h4 = h(924), h5 = h(925), h6 = h(926);
    const isT = cl.greaterThanEqual(0.9), isA = cl.greaterThanEqual(0.75), isR = cl.greaterThanEqual(0.55);
    const v = isT.select(h2.mul(12).add(8), isA.select(h2.mul(h2).mul(6).add(0.4), isR.select(h2.mul(2.5).add(2.5), h2.add(0.8))));
    const size = isT.select(h3.mul(3).add(3), isA.select(h3.mul(1.2).add(0.4), isR.select(h3.mul(1.4).add(1), h3.mul(0.4).add(1.5))));
    const pos = vec2(0).toVar(), yaw = float(0).toVar();
    If(isT, () => {   // a transport: round one of its plot's ring roads, one way or the other
      const rho = floor(h4.mul(3)).mul(0.25).add(0.3).add(h6.sub(0.5).mul(0.012)), dir = h5.lessThan(0.5).select(float(1), float(-1)), th = h6.mul(TAU).add(dir.mul(v).mul(t).div(PT.element(base.add(uint(2))).mul(rho)));
      pos.assign(middle(base).add(vec2(cos(th), sin(th)).mul(reach(base, th)).mul(rho))); yaw.assign(th.add(dir.mul(Math.PI / 2)));
    }).Else(() => {   // the others: a wander round a home, two swings that never quite repeat
      const th0 = h5.mul(TAU), home = middle(base).add(vec2(cos(th0), sin(th0)).mul(reach(base, th0)).mul(sqrt(h4).mul(0.8))), a = h6.mul(60).add(15), w1 = v.div(a), w2 = w1.mul(h3.mul(0.5).add(0.6)), e1 = w1.mul(t).add(h2.mul(TAU * 7)), e2 = w2.mul(t).add(h6.mul(TAU * 13));
      pos.assign(home.add(vec2(sin(e1), sin(e2).mul(0.7)).mul(a))); yaw.assign(atan(cos(e2).mul(0.7).mul(w2), cos(e1).mul(w1)));
    });
    return { pos, yaw, size, kind: uint(floor(h(927).mul(KINDS))) };
  };
  {
    const far = uniform(MFAR), round = uniform(MMAX);
    const live = (c) => {
      const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar(), bucket = float(L - 1).toVar(), base = uint(plotOfCell(c)).mul(uint(ROW));
      const M = moverAt(base, c.x, c.y, U.uTime), dist = camDist(M.pos);
      If(dist.lessThan(far).and(inView(M.pos, round, MMAX)), () => {
        const px = M.size.mul(PXK).div(max(dist, 1e-3));
        If(px.greaterThan(LEVELS[L - 1].px), () => {
          // the level its size asks for; drawn at the finest that is there and no finer than that
          const want = uint(0).toVar(), held = heldOf(heapRow(H, M.kind, uint(L - 1))), at = uint(L - 1).toVar();
          for (let j = 0; j < L - 1; j++) want.addAssign(px.lessThanEqual(LO.element(j)).select(uint(1), uint(0)));
          for (let l = L - 2; l >= 0; l--) If(want.lessThanEqual(uint(l)).and(held.shiftRight(uint(l)).bitAnd(uint(1)).equal(uint(1))), () => { at.assign(uint(l)); });
          A.assign(vec4(M.pos, groundAt(M.pos, float(0)).sub(M.size.mul(0.02)), M.size));
          B.assign(vec4(M.yaw, float(M.kind), 0, 0));
          bucket.assign(float(at)); alive.assign(1);
        });
      });
      return { alive: alive.greaterThan(0.5), data: [A, B], bucket };
    };
    const T = new Tier(scene, LEVELS.map((_, i) => drawOf(i)), (src, k) => (k === L - 1 ? dot(src) : meshOf(src, k)), { cell: CELL * 10, P: MSIDE, near: 0, far: MFAR, order: 1, live, gpu: true, cap: MCAP, slots: 2 });
    T.band = () => { T.near = 0; T.far = MFAR; }; T.movers = true; T.viewKeyed = true; T.asset = 'Stress: movers';
    T.select = (cx, cz, h0, s, dy) => {   // its patches: the whole of each plot near (its ten thousand)
      const far2 = T.far * T.far * s * s - dy * dy; let n = 0;
      if (far2 > 0) for (const p of plotsNear(cx, cz, h0, Math.sqrt(far2), MMAX)) if (n < MAXP) T.list[n++].set(p.i << BITS, 0);
      T.n = n; for (const m of T.meshes) m.visible = n > 0;
    };
    T.meshes.forEach((m, k) => { if (k < L - 1) m.layers.enable(1); m.renderOrder = 1.005 + k * 0.01; });   // they cast their shadows as drawn; near ones drawn first
    let frame = 0; const run = T.run.bind(T); T.run = (r, world, ...a) => run(r, `${world}|${frame++}`, ...a);   // packed every frame: they move
    tiers.push(T);
  }
  addEventListener('resize', () => tiers.forEach((T) => T.band()));

  // ---- the meshes: built in workers, the coarse levels of every kind at once, the fine ones as the camera comes near ----
  const workers = Array.from({ length: 3 }, () => new Worker(new URL('./blob.worker.js', import.meta.url), { type: 'module' })), waiting = new Map(), done = [];
  let nextId = 0, turn = 0, busy = 0;
  const ask = (jobs) => new Promise((res) => { const id = nextId++; waiting.set(id, res); workers[turn++ % workers.length].postMessage({ id, jobs }); });
  for (const w of workers) w.onmessage = ({ data }) => { waiting.get(data.id)(data.out); waiting.delete(data.id); };
  const stats = { coarseMs: 0, built: 0, put: 0, full: 0 }, t0 = performance.now();
  let coarse = 0;
  for (let k = 0; k < KINDS; k += 40) {
    const jobs = []; for (let j = k; j < Math.min(KINDS, k + 40); j++) for (let l = STREAMED; l < L; l++) jobs.push([j, l]);
    ask(jobs.map(([j, l]) => [j, LEVELS[l].n, coarserOf(l)])).then((out) => { out.forEach((mesh, n) => H.put(jobs[n][0], jobs[n][1], mesh, 0)); coarse += 40; if (coarse >= KINDS) stats.coarseMs = Math.round(performance.now() - t0); });
  }
  const putAt = new Float64Array(KINDS * L).fill(-1e9);   // when a kind's level was put in (the page's clock, ms)
  const wantAt = new Int32Array(KINDS * L); let speed = 0, lx = 0, ly = 0, lz = 0, lt = 0;   // wantAt: the round a kind's level was last wanted in; speed: the camera's, metres a second
  const pending = new Set(); let scanAt = -1e9, sx = 1e9, sz = 1e9, sk = '', round = 1;   // round: each look at what stands near; a level wanted in the last one is not put out
  // what is asked of the workers: a few at a time, the next as one comes back; of a level no more than it has room for
  let queue = []; const asked = new Int32Array(L);
  const feed = () => {
    while (busy < 6 && queue.length) {
      const { k, l } = queue.shift(), id = k * L + l;
      if (pending.has(id) || H.has(k, l) || H.room(l, round) <= asked[l]) continue;
      pending.add(id); busy++; asked[l]++;
      ask([[k, nOf(k, l), coarserOf(l)]]).then(([mesh]) => { busy--; stats.built++; if (!l) stats.full++; done.push({ k, l, mesh }); feed(); });
    }
  };
  // what the CPU knows of what stands near: a block of a plot's lattice (BL cells a side) worked out when first looked
  // at, a few kept; and a plot's movers' own numbers
  const BL = 32, blocks = new Map();
  const blockOf = (p, bi, bj) => {
    const key = (p.i * 64 + bi) * 64 + bj; let b = blocks.get(key); if (b) return b;
    b = { X: new Float32Array(BL * BL), Z: new Float32Array(BL * BL), S: new Float32Array(BL * BL), K: new Uint16Array(BL * BL) };
    for (let j = 0, n = 0; j < BL; j++) for (let i = 0; i < BL; i++, n++) { const ci = bi * BL + i, cj = bj * BL + j; if (ci >= SIDE || cj >= SIDE) { b.S[n] = 0; continue; } const o = standsAt(p, ci, cj, sizes); b.X[n] = o.x; b.Z[n] = o.z; b.S[n] = o.s; b.K[n] = o.k; }
    if (blocks.size > 96) blocks.delete(blocks.keys().next().value);
    blocks.set(key, b); return b;
  };
  // (a plot's ten thousand reckoned a part each time it is asked for: all at once is a frame lost)
  const moversOf = (p) => { const M = (p.movers ||= []); for (let n = 0; n < 1500 && M.length < MSIDE * MSIDE; n++) M.push(moverOf(p, M.length % MSIDE, Math.floor(M.length / MSIDE))); return M; };
  // each frame: put in what the workers have built; and, when the camera has moved, ask for the fine levels of what now
  // stands or passes near (coarser first: quick to build, and something to draw meanwhile), nearest first
  const pump = () => {
    if (!PL.length) {   // the city's plan has come: its plots, to the GPU
      const cp = window.__s8?.city?.plots; if (!cp?.length) return;
      cp.slice(0, PLOTS).forEach((c, i) => { const p = plotOf(c, i); PL.push(p); plotRows.array.set([p.x, p.z, p.mean, p.k, ...p.R, ...p.TH], i * ROW); });
      plotRows.needsUpdate = true;
    }
    const now = performance.now(), cam = U.uCam.value, dy = U.uDy.value, inv = U.uLodInv.value, K = pxK(), key = `${inv.toFixed(2)}|${K.toFixed(0)}`;
    if (API.pause) return;
    const dt = Math.max(1e-3, (now - lt) / 1000), v = Math.hypot(cam.x - lx, cam.y - ly, cam.z - lz) / dt; lx = cam.x; ly = cam.y; lz = cam.z; lt = now;
    speed += (Math.min(v, 300) - speed) * Math.min(1, dt * 4);
    // (a frame sends the GPU one full mesh at most, or many small ones; and a level waits until the next coarser one has
    // come and grown: each grows out of the one before it, one after another, never two at once)
    for (let sent = 0, n = done.length; n > 0 && sent < 700000; n--) {
      const d = done.shift(), id = d.k * L + d.l;
      if (d.l < STREAMED - 1 && wantAt[id] >= round - 1 && (pending.has(id + 1) || now - putAt[id + 1] < GROW * 1000)) { done.push(d); continue; }
      pending.delete(id); asked[d.l]--; if (wantAt[id] < round - 1) continue;
      sent += d.mesh.index.length; if (H.put(d.k, d.l, d.mesh, round, round, U.uTime.value)) { stats.put++; putAt[id] = now; }
    }
    if (Math.hypot(cam.x - sx, cam.z - sz) < 0.7 && key === sk && now - scanAt < 300) return;
    sx = cam.x; sz = cam.z; sk = key; scanAt = now; round++;
    // as far as the coarsest of the fine levels is asked for (and a fifth): of what stands, and of the largest mover
    const lo = LEVELS[STREAMED - 1].px, reachOfSize = (s) => (s * K * 1.2) / (lo * inv), Rs = reachOfSize(SMAX), Rm = reachOfSize(MMAX), asks = [], ahead = speed * 0.35, t = U.uTime.value;
    if (Rm <= dy) { queue = []; return; }
    // a thing s metres large, d metres off: its size on screen now, and as it will be when a mesh asked for now has come
    // (`ahead`: the camera travelling, and the thing itself: a fine level that will have been passed by then is not asked for)
    const wants = (k, s, d, own) => {
      const px = (s * K * 1.2) / Math.max(1e-3, d * inv), then = (s * K * 1.2) / ((d + ahead + own) * inv);
      for (let l = STREAMED - 1; l >= 0 && px > LEVELS[l].px; l--) {
        if (H.has(k, l)) { H.touch(k, l, round); wantAt[k * L + l] = round; }
        else if (then > LEVELS[l].px) { wantAt[k * L + l] = round; if (!pending.has(k * L + l)) asks.push({ k, l, px }); }
      }
    };
    for (const p of PL) {
      const off = Math.hypot(p.x - cam.x, p.z - cam.z) - p.most; if (off > Rm) continue;
      if (off < Rs && ahead < Rs) {   // what stands: the blocks of its lattice round the camera's own lattice point
        const [fi, fj] = toLattice(p, cam.x, cam.z), rl = Rs / p.narrow + 1, nb = Math.ceil(SIDE / BL);
        for (let bj = Math.max(0, Math.floor((fj - rl) / BL)); bj <= Math.min(nb - 1, Math.floor((fj + rl) / BL)); bj++) for (let bi = Math.max(0, Math.floor((fi - rl) / BL)); bi <= Math.min(nb - 1, Math.floor((fi + rl) / BL)); bi++) {
          const b = blockOf(p, bi, bj);
          for (let n = 0; n < BL * BL; n++) { if (!b.S[n]) continue; const d = Math.hypot(b.X[n] - cam.x, b.Z[n] - cam.z, dy); if (d < Rs) wants(b.K[n], b.S[n], d, 0); }
        }
      }
      for (const M of moversOf(p)) { const [x, z] = moverAtJS(p, M, t), d = Math.hypot(x - cam.x, z - cam.z, dy); if (d < reachOfSize(M.s)) wants(M.k, M.s, d, M.v * 0.35); }   // what passes
    }
    queue = asks.sort((p, q) => q.l - p.l || q.px - p.px); feed();
  };
  tiers.solid = pump;

  // for looking at it (window.__stress): how many stand in a plot and of how many kinds; what each level holds and draws now
  const API = (window.__stress = {
    heap: H, tiers, stats, levels: LEVELS, plots: PL, sizes, pause: false, smooth: SMOOTH,
    standsAt: (pi, i, j) => standsAt(PL[pi], i, j, sizes), toLand: (pi, fi, fj) => toLand(PL[pi], fi, fj), toLattice: (pi, x, z) => toLattice(PL[pi], x, z),
    movers: (pi, t = U.uTime.value) => { while (moversOf(PL[pi]).length < MSIDE * MSIDE); return API.moversNow(pi, t); },
    moversNow: (pi, t) => moversOf(PL[pi]).map((M) => { const [x, z] = moverAtJS(PL[pi], M, t); return { x, z, k: M.k, s: M.s, v: M.v, transport: M.T }; }),
    /** A plot counted, cell by cell: how many stand in it, of how many kinds, the fewest and the most of a kind; and the world's sums. */
    census(pi = 0) {
      const p = PL[pi], n = new Uint32Array(KINDS); for (let j = 0; j < SIDE; j++) { const [a, b] = rowOf(p, j); for (let i = 0; i < SIDE; i++) n[(i * a + b) % KINDS]++; }
      return { plot: p.id, stand: n.reduce((x, y) => x + y, 0), kinds: n.filter(Boolean).length, least: Math.min(...n), most: Math.max(...n), movers: MSIDE * MSIDE, plots: PL.length, standing: PL.length * SIDE * SIDE, moving: PL.length * MSIDE * MSIDE };
    },
    async counts() {
      const out = [];
      for (const T of tiers) {
        const B = await T.read(renderer);
        if (T.movers) { out.push({ tier: T.asset, packed: B.reduce((x, b) => x + b.count, 0), tris: B.reduce((x, b, l) => x + b.count * trisOf(LEVELS[l].n === FULLN ? 113 : LEVELS[l].n), 0), byLevel: B.map((b) => b.count), patches: T.n, over: T.over }); continue; }
        const [{ count, data }] = B, full = LEVELS[T.level].n === FULLN; let tris = 0;
        if (full) for (let j = 0; j < count; j++) tris += trisOf(fullOf(data[1][j * 4 + 1])); else tris = count * trisOf(LEVELS[T.level].n);
        out.push({ tier: T.asset, packed: count, tris, patches: T.n, over: T.over });
      }
      return { tiers: out, held: H.held(), pending: pending.size, ...stats, heapMB: +(H.bytes / 1048576).toFixed(1) };
    },
  });
  return tiers;
}

/** A scatter engine (src/scatter/index.js finds it): it places no asset of the library, only its own, and only when asked. */
export const engine = {
  id: 'stress',
  createOwn: (scene, tex, ground, gpu, renderer) => (gpu && new URLSearchParams(location.search).has('stress') ? createStress(scene, renderer, tex) : []),
};
