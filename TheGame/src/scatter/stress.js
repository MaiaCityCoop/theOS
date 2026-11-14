// The stress stand: a test of the engine, not of the world. It draws the zoo (assets/zoo: every FAMILY of kinds found
// there, each one file that keeps one contract; nothing here knows a family by name). Today's: eight thousand shapes
// nobody drew, each its own mesh of 50 000 to 200 000 triangles, its own texture and look; two thousand plants of
// leaf cards, cut out, swaying; a thousand kinds of creature, each ONE mesh on a skeleton of its own. Every village
// plot of the city (src/city: 898 of them) is filled with a million of what stands, a hundred of each kind; and in
// every plot ten thousand of what roams move about, each herd at its own pace. 898 million standing, nine million
// moving. Only with `?stress` in the address; nothing of it is in the library.
//
// What plugs in, each a file found by itself: a family of kinds (assets/zoo/*.js: meshes at every level, texture,
// look, skeleton, herds), a way of taking the light (src/shading/*.js), a material of the world (materials/*.js: the
// reliefs the kinds take). The engine under it knows none of them: the heap (heap.js), a vertex's 16 bytes
// (assets/kit/solid.js), the ladder of levels (assets/kit/ladder.js), the tiers (tier.js), the workers and the keeper.
//
// How so many are placed and drawn:
//   - nothing of where they stand is kept. A plot is a row of numbers (its middle, how far its edge is in 64
//     directions); its million are a lattice of 1000 by 1000 cells folded onto that shape, worked out on the GPU for the
//     cells a tier looks at (place). So a plot costs under a kilobyte, and the world's size costs nothing;
//   - where a mover is is a function of the clock (its lane on one of its plot's ways, its place in it, its lane's
//     pace: nominal), worked out afresh every frame for the plots near the camera: no mover has a state to keep;
//   - nothing stands on the ways (the lattice is folded off them; what else places things asks src/world/ways.js) and
//     every mover has a lane and a place in it of its own (the lanes, below): none meets a thing or another, by how
//     the plot is laid out;
//   - a tier a level packs the ones of its level that are in view (tier.js), its patches blocks of a plot's lattice;
//     the movers are one tier, packed every frame, each dropped into its level's draw;
//   - every kind's meshes lie in one heap (heap.js): a level of every kind is one draw call, its vertices read from the
//     heap by the kind's number. Two shaders (the meshes', the dots'), whatever the number of kinds;
//   - what a kind looks like is a row of numbers (its look, as its family says it: `mats`), read by its pixels by the kind's number: its
//     textures are layers of the world's one texture array, its way of taking the light one of the shader's models
//     (MODELS: matte, glossy, metal, leafy, glowing, wet, velvet, …). A new look is a row, a new model a branch: neither
//     a draw call nor a shader;
//   - the coarse levels of every kind are always there; the fine ones (the full mesh, and two under it) only of the
//     kinds that stand or pass near, built in workers as the camera comes and put out again when it has gone. Until a
//     fine level has come, the next coarser one is drawn in its place;
//   - a mover is one mesh, each vertex bound to two bones of its kind's skeleton (sixteen bones a kind, three rows of
//     numbers a bone); the bones are moved in the vertex stage by the mover's stride, itself a function of the clock:
//     legs walking, wheels turning, wings beating cost no state and nothing of the CPU;
//   - memory: the meshes, the near plots' places and what the tiers pack live on the GPU only (src/core/gpu.js: no
//     second copy on the page; the ledger there says what each pool holds); a vertex is 16 bytes (assets/kit/solid.js).
//     What the workers made at a first start is kept in the browser (src/core/kept.js) and read back at the next.
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
import { Fn, If, Loop, Discard, float, int, uint, vec2, vec3, vec4, uniform, uniformArray, varyingProperty, storage, texture, instanceIndex, vertexIndex, cameraViewMatrix, dFdx, dFdy, cos, sin, atan, abs, max, min, pow, mix, sqrt, floor, cross, reflect, length, normalize, smoothstep, clamp } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { camDist, groundAt, rnd } from '../world/land.nodes.js';
import { cellRnd, heightAt } from '../world/land.js';
import { finish, skyLight, cloudAtOne, cloudShade, sunDim, unlit, weatherOn, snowLift, snowDepth, SNOW, windAt, windStrength } from '../world/light.js';
import { pxK } from '../detail/index.js';
import { bandOf, padOf } from '../detail/handover.js';
import { boxIn } from '../core/frustum.js';
import { Tier, offScreen, clipOf, MAXP } from './tier.js';
import { inView } from './view.js';
import { createHeap, heapRow, heapElem, heldOf, sinceCame, effective } from './heap.js';
import { solidOf } from './solid.js';
import { LADDER, FULLN, DOTN, trisOf, roomOf, underOf } from '../../assets/kit/ladder.js';
import { STAND, MOVING, KINDS as ALL, FAMILIES, HERDS, lookOf as lookOfKind, fullTris, fingerprint } from '../../assets/zoo/index.js';
import { dotMesh, BONES } from '../../assets/kit/solid.js';
import { MODELS, modelOf } from '../shading/index.js';
import { recipes } from '../core/registry.js';
import { gpuStorage, note } from '../core/gpu.js';
import { keptGet, keptPut } from '../core/kept.js';
import { did } from '../core/work.js';
import { addBodies, bodiesNear, outline } from '../world/bodies.js';
import { bodyOf } from '../../assets/zoo/index.js';
import { addWays, waysChanged } from '../world/ways.js';
import { moved } from '../../assets/kit/bones.js';
import CITY from '../../world/city.js';

const KINDS = 10000, SIDE = 1000, MSIDE = 100, GROUP = KINDS / SIDE;   // a plot's ten thousand places for a kind (given to the STAND kinds that stand: the zoo's; ALL: with those that roam); a plot's lattice: a thousand cells a side, one asset in each (GROUP rows of it hold every kind once: a hundred of every kind a plot); its movers' lattice: ten thousand
const PLOTS = Math.round(CITY.people / CITY.perVillage), RAYS = 64, PH_AT = 4 + RAYS + RAYS + 1, Q_AT = PH_AT + RAYS + 1, LC_AT = Q_AT + 1, CLR_AT = Q_AT + 2, WQ_AT = Q_AT + 3, CLRT_AT = Q_AT + 4, WQT_AT = Q_AT + 5, ROW = WQT_AT + 3, FAR_AT = ROW - 2, KEPT_AT = ROW - 1, KEPT = 8, BITS = 11, TAU = Math.PI * 2;   // a plot's row: its middle (x, z), its mean reach, its things' scale, then how far its edge is in RAYS directions, then the directions that cut its land into RAYS equal shares, the directions at every RAYS-th of the way round it (PH_AT), its movers' scale, how long it is round, half the width of its roads with and without their verges, the same of its trails (Q_AT …), its longest reach, and where its places are kept (KEPT plots' at once; -1: not kept); BITS: a cell's number holds its plot above them
const SMIN = 0.25, SMAX = 2.2, MMAX = 6, MFAR = 1400, CELL = 1.4, FIT = 1.5, FADE = 0.02, SINK = 1.6;   // an asset's largest side, metres (a mover's up to MMAX, seen as far as MFAR); CELL: a lattice cell's side, about; FIT: the cell's side a kind's own size is meant for
const GROW = 1.5, RELIEF = 90, SKIN = 128, SKINPX = 28;   // GROW: seconds a level that came late takes to grow out of the coarser one; RELIEF: the size on screen from which its textures' relief is read; SKIN: a kind's own texture, pixels a side; SKINPX: the size on screen from which a thing wears it (under that: its mean colour)
// its levels, finest first: the ladder's (assets/kit/ladder.js: n, a level's mesh; px, the size on screen it is drawn
// down to), and of each: P, its tier's cells a patch (a block of a plot's lattice: it divides 1000); slots: how many
// kinds' the heap holds at once (none: every kind's); cap: the most of it drawn at once
const LEVELS = [
  { P: 2, slots: 8, cap: 64 },
  { P: 4, slots: 48, cap: 256 },
  { P: 4, slots: 320, cap: 1024 },
  { P: 8, slots: 768, cap: 4096 },
  { P: 10, slots: 2048, cap: 16384 },
  { P: 20, cap: 65536 },
  { P: 50, cap: 131072 },
  { P: 100, cap: 524288 },   // its dot: one triangle, turned to the eye
].map((l, i) => ({ n: LADDER[i].n, px: LADDER[i].px, ...l }));
const L = LEVELS.length, STREAMED = LEVELS.filter((l) => l.slots).length, MCAP = 65536;   // MCAP: the most movers of one level drawn at once
const HULL = LEVELS.findIndex((l) => l.n > 0 && l.n <= 2), WRAP = 512;   // HULL: the first level at which a mover is its hull, nothing of it moving (creature.js); WRAP: seconds after which the movers' stride clock begins again
const SHADE = { level: 5, far: 30, wide: 1.5, reach: 12, shrink: 0.85 };   // what casts their shadows: a coarse level of each round the camera, a little smaller than the thing (so it does not shade itself)

const OFF = STAND > KINDS ? 7919 : 0;   // a plot's places are given to the kinds that stand in turn (place n: kind n, round again where there are fewer kinds); where there are more kinds than places each plot begins further along: another ten thousand of them
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
// The ways (src/world/ways.js): WAYS rings round a plot's middle, at even shares of its reach, kept clear of what
// stands: the lattice is folded so that nothing falls on them (offWay: what would is set on their verges, which stand
// the thicker for it; backOn: the way back). Every other ring is a road (what drives keeps to the roads, what flies
// goes over them); between them the trails, narrower, winding through the thicket (what walks, runs and crawls keeps
// to them). A way is as wide as the lanes it carries (the lanes, below; p.clr, p.clrT: half of that and the room of
// what stands beside it, metres).
//   WAY0, WAYD   the first ring, and from one to the next, of the plot's reach (rings 0, 2, …: roads; 1, 3, …: trails)
//   MA, MN, WIND how far a trail winds to either side of its ring (of the reach), how many times round, how steeply
//   ZONE         how far to either side of a way, of its half width, what stands is moved aside
//   SKEW         no ring turns further from the round than this (the tangent of that angle: plotOf evens the reach)
//   NEARW        of so many plots near the camera the ways are told to what else places things
const WAYS = 8, WAY0 = 0.15, WAYD = 0.105, ZONE = 2, SKEW = 0.8, NEARW = 12, MA = 0.02, LANES = 8;
const WIND = 0.3, MN = Array.from({ length: WAYS }, (_, k) => Math.max(3, Math.round((WIND * (WAY0 + k * WAYD)) / MA)));   // (WIND: the steepest a trail turns from its ring, as a tangent)
/** The middle of way k at direction th, of plot p's reach (a trail winds: its own phase in each plot). */
const ringC = (p, k, th) => WAY0 + k * WAYD + (k & 1 ? MA * Math.sin(MN[k] * th + cellRnd(p.i, k, 950) * TAU) : 0);
const ringOf = (r) => WAY0 + Math.min(WAYS - 1, Math.max(0, Math.round((r - WAY0) / WAYD))) * WAYD;   // (the ring nearest, unwound: for what needs it only roughly)
/** The way whose verges a share r of the reach at direction th lies within (its number), or -1. */
const zoneOf = (p, r, th, R) => { const k0 = Math.min(WAYS - 1, Math.max(0, Math.round((r - WAY0) / WAYD))); for (const k of [k0, k0 - 1, k0 + 1]) { if (k < 0 || k >= WAYS) continue; if (Math.abs(r - ringC(p, k, th)) < (ZONE * (k & 1 ? p.clrT : p.clr)) / R) return k; } return -1; };
const offWay = (p, r, th, R) => { const k = zoneOf(p, r, th, R); if (k < 0) return r; const c = ringC(p, k, th), w = (k & 1 ? p.clrT : p.clr) / R, d = r - c, a = Math.abs(d); return c + (d < 0 ? -1 : 1) * (w + (a * (ZONE - 1)) / ZONE); };
const backOn = (p, r, th, R) => { const k = zoneOf(p, r, th, R); if (k < 0) return r; const c = ringC(p, k, th), w = (k & 1 ? p.clrT : p.clr) / R, d = r - c, a = Math.abs(d); return c + (d < 0 ? -1 : 1) * Math.max(0, a - w) * (ZONE / (ZONE - 1)); };
/** Where a point of plot p's lattice (fi, fj: 0 … 1000 each way) lies on the land. */
const toLand = (p, fi, fj) => { const [dx, dz] = diskOf((fi / SIDE) * 2 - 1, (fj / SIDE) * 2 - 1), th = turnOf(p, Math.atan2(dz, dx) / TAU), R = reachOf(p, th), r = offWay(p, Math.hypot(dx, dz), th, R) * R; return [p.x + Math.cos(th) * r, p.z + Math.sin(th) * r]; };
/** And the lattice point of a place on the land (outside the plot: beyond 0 … 1000). */
const toLattice = (p, x, z) => { const dx = x - p.x, dz = z - p.z, th = ((Math.atan2(dz, dx) % TAU) + TAU) % TAU, R = reachOf(p, th); let phi = shareOf(p, th) * TAU; if (phi > Math.PI) phi -= TAU; const [a, b] = squareOf(backOn(p, Math.hypot(dx, dz) / R, th, R), phi); return [((a + 1) / 2) * SIDE, ((b + 1) / 2) * SIDE]; };
/** Where share u (0 … 1 round) of way k of plot p lies, o metres further out (the same on the GPU: wayPos). */
const wayAtJS = (p, k, o, u) => { const t = (((u % 1) + 1) % 1) * RAYS, i0 = Math.min(RAYS - 1, Math.floor(t)), th = p.PH[i0] + (p.PH[i0 + 1] - p.PH[i0]) * (t - i0), r = reachOf(p, th) * ringC(p, k, th) + o; return [p.x + Math.cos(th) * r, p.z + Math.sin(th) * r]; };

// The lanes. A herd keeps to the roads (`road`), flies over them (`fly`), or keeps to the trails. Herds of one kind of
// way whose paces can meet go together in a group: its lanes carry them mixed, one after another (walkers, beasts,
// snakes in one file; runners and rovers in another), each a place of its own in the file, a length and a quarter of
// its own apart, as long and as wide as its herd's widest as it moves (the zoo's herdRooms: its colliders carried by its
// bones over a stride). A group has a lane each way on each of its ways, each lane its own pace (one for all in it, so
// none comes up with another; the next lane goes at another). Across a way the quickest go in the middle, each side its
// own way round. What flies has one lane over each road. So no mover meets another, and (the ways being clear) none
// meets what stands: by how the plot is laid out, at any distance and for nothing a frame. (A mover the walker stands
// in front of steps round him: the detour, below.)
let LAY = null;   // { WR, WT: half a road's and a trail's width, metres; herds: [{ fore, side, top, len, air, g, … }]; groups: [{ lo, hi, span, lanes, starts }]; cols: [{ g, off }] }
function layOut(rooms) {
  // (lanes lie a number of metres further out from the middle: where a way turns from the round they are that much
  // closer, so a lane is as much wider: a road turns by the plot's shape (SKEW) at most, a trail by its winding too)
  const cosR = Math.cos(Math.atan(SKEW)), cosT = Math.cos(Math.atan(SKEW) + Math.atan(WIND));
  const H = HERDS.map((G, h) => { const R = rooms[h] ?? { fore: 0.5, side: 0.5, top: 1 }, len = 2 * R.fore * G.size[1], wid = 2 * R.side * G.size[1], pad = 0.2 + 0.06 * len; return { h, name: G.name, fore: R.fore, side: R.side, top: R.top, len, wid, slot: 1.25 * len + 0.3, lane: wid / (G.fly[1] > 0 || G.road ? cosR : cosT) + 2 * pad, air: G.fly[1] > 0 ? 1 : 0, way: G.fly[1] > 0 ? 'air' : G.road ? 'road' : 'trail', lo: G.speed[0], hi: G.speed[1], cols: [], g: 0 }; });
  for (let i = 0; i < MSIDE; i++) { let r = 0; while (r < HERDS.length - 1 && (i + 0.5) / MSIDE >= HERDS[r].upTo) r++; H[r].cols.push(i); }
  // the groups: of each kind of way, the herds by their slowest pace, each into the group before while their paces still meet
  const groups = [];
  for (const way of ['road', 'trail', 'air']) {
    let cur = null;
    for (const Y of H.filter((Y) => Y.way === way && Y.cols.length).sort((a, b) => a.lo - b.lo)) {
      const lo = cur ? Math.max(cur.lo, Y.lo) : Y.lo, hi = cur ? Math.min(cur.hi, Y.hi) : Y.hi;
      if (cur && hi - lo >= 0.3 * Math.min(cur.hi - cur.lo, Y.hi - Y.lo)) Object.assign(cur, { lo, hi }).herds.push(Y);
      else groups.push((cur = { way, lo: Y.lo, hi: Y.hi, herds: [Y] }));
    }
  }
  // a group's file: its herds' columns spread through it (not thirty walkers, then twelve beasts); each its place in a rep
  const cols = Array.from({ length: MSIDE }, () => ({ g: 0, off: 0 }));
  groups.forEach((Gp, g) => {
    const all = Gp.herds.flatMap((Y) => Y.cols.map((i, n) => ({ i, Y, key: (n + 0.5) / Y.cols.length }))).sort((a, b) => a.key - b.key || a.i - b.i); let at = 0;
    for (const { i, Y } of all) { Y.g = g; cols[i] = { g, off: at + Y.slot / 2 }; at += Y.slot; }
    Gp.span = at; Gp.lane = Math.max(...Gp.herds.map((Y) => Y.lane));
  });
  // across a way: the quickest in the middle; a lane each way on each of its ways (what flies: one, over the middle of the road)
  const half = { road: 0, trail: 0, air: 0 };
  for (const way of ['road', 'trail', 'air']) for (const Gp of groups.filter((G) => G.way === way).sort((a, b) => b.hi - a.hi)) {
    const rings = Array.from({ length: WAYS / 2 }, (_, n) => 2 * n + (way === 'trail' ? 1 : 0));
    if (way === 'air') { Gp.lanes = rings.map((k, n) => ({ k, off: 0, dir: n % 2 ? -1 : 1 })); half.air = Math.max(half.air, Gp.lane / 2); }
    else { const off = half[way] + Gp.lane / 2; half[way] += Gp.lane; Gp.lanes = rings.flatMap((k, n) => [{ k, off, dir: n % 2 ? -1 : 1 }, { k, off: -off, dir: n % 2 ? 1 : -1 }]); }
    // its reps (a row of the plot's movers each: every column of the group once) dealt onto its lanes by their lengths
    const le = Gp.lanes.map((L) => WAY0 + L.k * WAYD - (L.k & 1 ? MA : 0)), tot = le.reduce((a, b) => a + b, 0); let acc = 0;
    Gp.starts = [0, ...le.map((x) => Math.round((MSIDE * (acc += x)) / tot))]; Gp.le = le;
    while (Gp.lanes.length < LANES) { Gp.lanes.push({ k: 0, off: 0, dir: 1 }); Gp.le.push(1); Gp.starts.push(MSIDE); }
  }
  // (what flies goes over the roads: no lower than the tallest that drives there, and a little)
  const airLow = (Math.max(0, ...H.filter((Y) => Y.way === 'road').map((Y) => Y.top * HERDS[Y.h].size[1])) + 0.8) / 0.85;
  return { WR: Math.max(half.road, half.air), WT: half.trail, herds: H, groups, cols, airLow };
}
// GROUP rows of a plot's lattice hold every kind once: the n-th cell of a group (its rows end to end) is kind
// (n·a + b) mod KINDS, a with no factor in common with KINDS (it ends in 1, 3, 7 or 9), a and b the group's own
const groupOf = (p, g) => { const r4 = Math.floor(cellRnd(p.i, g, 902) * 4); return [Math.floor(cellRnd(p.i, g, 901) * (KINDS / 10)) * 10 + 1 + 2 * r4 + (r4 >= 2 ? 2 : 0), Math.floor(cellRnd(p.i, g, 904) * KINDS)]; };
const kindAt = (p, i, j) => { const [a, b] = groupOf(p, Math.floor(j / GROUP)); return ((((i + SIDE * (j % GROUP)) * a + b) % KINDS) + OFF * p.i) % STAND; };
/** What stands in cell (i, j) of plot p: { x, z, k (its kind), s (its size) }. */
const standsAt = (p, i, j, sizes) => {
  const c = (p.i << BITS) + i, [x, z] = toLand(p, i + 0.15 + 0.7 * cellRnd(c, j, 905), j + 0.15 + 0.7 * cellRnd(c, j, 906)), k = kindAt(p, i, j);
  return { x, z, k, s: Math.min(SMAX, Math.max(SMIN, sizes[k] * (0.8 + 0.4 * cellRnd(c, j, 903)) * p.k)) };
};
// a mover's own numbers: which herd it is of (its column of the plot's movers: a herd has as many columns as its
// share), of which of the herd's kinds, its size; its group's lane (its row of the plot's movers: a rep of the group's
// file) and its place in it (its column's place in the file), the lane's pace and way round
const moverOf = (p, i, j) => {
  const c = (p.i << BITS) + i, h = (s) => cellRnd(c, j, s), h3 = h(923), h4 = h(924), h5 = h(925), h6 = h(926);
  let r = 0; while (r < HERDS.length - 1 && (i + 0.5) / MSIDE >= HERDS[r].upTo) r++;
  const G = HERDS[r], Y = LAY.herds[r], C = LAY.cols[i], Gp = LAY.groups[C.g]; let l = 0; while (l < LANES - 1 && j >= Gp.starts[l + 1]) l++;
  const La = Gp.lanes[l], n = Math.max(1, Gp.starts[l + 1] - Gp.starts[l]), Ln = (WAY0 + La.k * WAYD) * p.Lc;
  const v = (Gp.lo + (Gp.hi - Gp.lo) * cellRnd(p.i, C.g * 16 + l, 931)) * p.q, s = (G.size[0] + (G.size[1] - G.size[0]) * h3) * p.q;
  return { rig: G.name, herd: r, v, s, k: G.first + Math.min(G.count - 1, Math.floor(h(940) * G.count)), fly: (Y.air ? Math.max(LAY.airLow, G.fly[0] + (G.fly[1] - G.fly[0]) * h4) : 0) * p.q, ph: h5 * TAU, pace: Math.max(1, Math.floor(v / (s * G.stride) / ((TAU * 20) / WRAP) + 0.5)) * ((TAU * 20) / WRAP), g0: h6 * TAU * 20, stride: G.stride,
    ring: La.k, Ln, dir: La.dir, u0: (j - Gp.starts[l] + C.off / Gp.span) / n, o: La.off * p.q, du: ((s * Y.fore) / Ln) * La.dir, side: Y.side, air: Y.air };
};
// The detour: a mover the walker stands before (on the ground, within its length and a little ahead or behind, across
// its lane less than half its width and his own) steps aside of him, as far as it must, and back again once past.
// Nothing remembered: a function of where he is and where its lane has it (the same on the GPU: nominal).
const detour = (M, x, z, yaw, s) => {
  if (M.air || U.uDy.value > 1) return [x, z];
  const tx = Math.cos(yaw), tz = Math.sin(yaw), dx = x - U.uCam.value.x, dz = z - U.uCam.value.z, al = dx * tx + dz * tz, ac = -dx * tz + dz * tx, hl = s * LAY.herds[M.herd].fore, need = s * M.side + 0.75 - Math.abs(ac);
  if (need <= 0) return [x, z];
  const e = Math.min(1, Math.max(0, (Math.abs(al) - hl - 0.5) / 2.5)), k = need * (1 - e * e * (3 - 2 * e)) * (ac < 0 ? -1 : 1);
  return [x - tz * k, z + tx * k];
};
/** Where a mover is at t seconds: [x, z, the way it faces]. Its two ends on its lane, its middle between them; stepped round the walker. */
const moverAtJS = (p, M, t) => { const u = M.u0 + (M.dir * M.v * t) / M.Ln, a = wayAtJS(p, M.ring, M.o, u - M.du), b = wayAtJS(p, M.ring, M.o, u + M.du), yaw = Math.atan2(b[1] - a[1], b[0] - a[0]), [x, z] = detour(M, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, yaw, M.s); return [x, z, yaw]; };
/** Its place only, to the bend of its lane: for what asks how far off it is. */
const moverNearJS = (p, M, t) => wayAtJS(p, M.ring, M.o, M.u0 + (M.dir * M.v * t) / M.Ln);
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
  const p = { i, id: cp.id, x: cp.x, z: cp.z, R: new Float32Array(RAYS), TH: new Float32Array(RAYS + 1), PH: new Float32Array(RAYS + 1) }; let mean = 0, most = 0, least = Infinity;
  const raw = Array.from({ length: RAYS }, (_, r) => { const t = hit(p.x, p.z, (r / RAYS) * TAU); return Math.log(Math.max(30, (Number.isFinite(t) ? t : 30) * 0.97)); });
  // its reach made even, so that a ring round its middle is a way a long thing can follow: it turns no further from
  // the round than SKEW (each ray no longer than its neighbours allow), it has no corner (smoothed over nine rays),
  // and it is drawn in until all of it lies inside the plot again
  const lg = raw.slice(), c = SKEW * (TAU / RAYS);
  for (let r = 1; r < 2 * RAYS; r++) lg[r % RAYS] = Math.min(lg[r % RAYS], lg[(r - 1) % RAYS] + c);
  for (let r = 2 * RAYS - 1; r > 0; r--) lg[(r - 1) % RAYS] = Math.min(lg[(r - 1) % RAYS], lg[r % RAYS] + c);
  const sm = lg.map((_, r) => { let t = 0; for (let d = -4; d <= 4; d++) t += lg[(r + d + RAYS) % RAYS] * (5 - Math.abs(d)); return t / 25; }), drawn = Math.min(0, ...sm.map((v, r) => raw[r] - v));
  for (let r = 0; r < RAYS; r++) { const R = Math.exp(sm[r] + drawn); p.R[r] = R; mean += R / RAYS; most = Math.max(most, R); least = Math.min(least, R); }
  // how long it is round (its reach's own ring; a ring at a share of the reach is that share of it), and the
  // directions at every RAYS-th of the way round: what goes round a ring at an even pace asks them (PH)
  const seg = Array.from(p.R, (R, r) => { const a = (r / RAYS) * TAU, b = ((r + 1) / RAYS) * TAU, R1 = p.R[(r + 1) % RAYS]; return Math.hypot(R1 * Math.cos(b) - R * Math.cos(a), R1 * Math.sin(b) - R * Math.sin(a)); }), Lc = seg.reduce((x, y) => x + y, 0);
  for (let m = 1, r = 0, sum = 0; m < RAYS; m++) { const want = (m / RAYS) * Lc; while (sum + seg[r] < want) sum += seg[r++]; p.PH[m] = ((r + (want - sum) / seg[r]) / RAYS) * TAU; }
  p.PH[RAYS] = TAU;
  // its land's shares by direction: the slice between two rays, summed round, then the directions at every 1/RAYS of it
  const slice = Array.from(p.R, (R, r) => (R * R + p.R[(r + 1) % RAYS] ** 2) / 4 * (TAU / RAYS)), area = slice.reduce((x, y) => x + y, 0);
  for (let m = 1, r = 0, sum = 0; m < RAYS; m++) { const want = (m / RAYS) * area; while (sum + slice[r] < want) sum += slice[r++]; p.TH[m] = ((r + (want - sum) / slice[r]) / RAYS) * TAU; }
  p.TH[RAYS] = TAU;
  // (cell: a lattice cell's side; narrow, wide: its shortest and longest side, where the plot's reach is unlike its
  // mean; k: how much smaller or larger than their own size its things stand, so a small plot's million fit as a large one's do)
  const cell = Math.sqrt(area / (SIDE * SIDE)), rms = Math.sqrt((2 * area) / TAU), k = cell / FIT;
  // its ways: half as wide as their lanes (LAY.WR, LAY.WT) and the room of what stands beside them (half the largest
  // thing, and a hand); q: how much smaller than their own size its movers are, where the plot is too small for them:
  // a road's and a trail's verges must not meet where the plot is narrowest, and each lane must hold its reps
  const verge = Math.max(SMIN, SMAX * Math.min(1, 1.2 * k)) / 2 + 0.4, room = ((WAYD - MA) * least) / ZONE;
  let q = LAY.WR + LAY.WT > 0 ? Math.min(1, (room - 2 * verge) / (LAY.WR + LAY.WT)) : 1;
  for (const Gp of LAY.groups) Gp.lanes.forEach((La, l) => { const n = Gp.starts[l + 1] - Gp.starts[l]; if (n > 0) q = Math.min(q, (Gp.le[l] * Lc) / n / Gp.span); });
  q = Math.max(0.02, q);
  const clr = (W) => (W > 0 ? Math.min(W * q + verge, room * 0.49) : 0);
  return Object.assign(p, { mean, most, least, area, cell, narrow: cell * Math.min(least / rms, rms / most), wide: cell * Math.max(most / rms, rms / least), k, Lc, q, wq: LAY.WR > 0 ? LAY.WR * q : -1e6, clr: clr(LAY.WR), wqT: LAY.WT > 0 ? LAY.WT * q : -1e6, clrT: clr(LAY.WT) });
}

// the plots, as the GPU reads them: a row each (ROW numbers), filled when the city's plan has come (src/city: made in a
// worker at the start). Kept here, not in the stand: what else places things reads the ways from them (below)
const STRESS = new URLSearchParams(location.search).has('stress');
const plotRows = new THREE.StorageBufferAttribute(new Float32Array(STRESS ? PLOTS * ROW : ROW), 1), PT = storage(plotRows, 'float', STRESS ? PLOTS * ROW : ROW), PL = [];
const reach = (base, th) => { const t = th.div(TAU).add(1).fract().mul(RAYS), i0 = floor(t), a = uint(i0).min(uint(RAYS - 1)); return mix(PT.element(base.add(uint(4)).add(a)), PT.element(base.add(uint(4)).add(a.add(uint(1)).mod(uint(RAYS)))), t.sub(i0)); };
const middle = (base) => vec2(PT.element(base), PT.element(base.add(uint(1))));
// the stand's ways, said to the world (src/world/ways.js): a place is on a way where, in one of the NEARW plots nearest
// the camera, it lies within the lanes' half width of one of the plot's rings (and so many metres more: margin)
const NEARV = Array.from({ length: NEARW }, () => new THREE.Vector4(-1, 0, 0, 0)), nearW = uniformArray(NEARV, 'vec4'), MNU = uniformArray(MN);
// the middle of way k (a float) of a plot at direction th, of its reach: the same in JS above (ringC)
const ringCN = (plot, k, th) => k.mul(WAYD).add(WAY0).add(k.mod(2).greaterThan(0.5).select(sin(MNU.element(uint(k)).mul(th).add(rnd(plot, int(k), uint(950)).mul(TAU))).mul(MA), float(0)));
if (STRESS) addWays({
  node: Fn(([p, margin]) => {
    const on = float(0).toVar();
    Loop(NEARW, ({ i }) => {
      const pi = nearW.element(i).x;
      If(pi.greaterThan(-0.5), () => {
        const base = uint(pi).mul(uint(ROW)), dq = p.sub(middle(base)), l = length(dq);
        If(l.lessThan(PT.element(base.add(uint(FAR_AT)))), () => {
          const th = atan(dq.y, dq.x).toVar(), R = reach(base, th).toVar(), rr = l.div(R), k0 = clamp(floor(rr.sub(WAY0).div(WAYD).add(0.5)), 0, WAYS - 1);
          for (const dk of [0, -1, 1]) { const k = clamp(k0.add(dk), 0, WAYS - 1), wq = k.mod(2).greaterThan(0.5).select(PT.element(base.add(uint(WQT_AT))), PT.element(base.add(uint(WQ_AT)))); If(abs(rr.sub(ringCN(int(pi), k, th))).mul(R).lessThan(wq.add(margin)), () => { on.assign(1); }); }
        });
      });
    });
    return on;
  }),
  at: (x, z, margin = 0) => { for (const p of PL) { const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz); if (l >= p.most) continue; const th = Math.atan2(dz, dx), R = reachOf(p, th), rr = l / R, k0 = Math.min(WAYS - 1, Math.max(0, Math.round((rr - WAY0) / WAYD))); for (const k of [k0, k0 - 1, k0 + 1]) if (k >= 0 && k < WAYS && Math.abs(rr - ringC(p, k, th)) * R < (k & 1 ? p.wqT : p.wq) + margin) return true; } return false; },
});

export function createStress(scene, renderer, tex) {
  // a point of a plot's lattice (fi, fj: 0 … 1000 each way) on the land: the square onto a disc, area for area, the disc
  // onto the plot's shape, what would fall on a way set aside onto its verge (the same in JS above: toLand, offWay)
  const offWayN = (base, r, th, R) => {
    const plot = int(base.div(uint(ROW))), k0 = clamp(floor(r.sub(WAY0).div(WAYD).add(0.5)), 0, WAYS - 1), out = float(r).toVar(), done = float(0).toVar();
    for (const dk of [0, -1, 1]) {
      const k = clamp(k0.add(dk), 0, WAYS - 1), w = k.mod(2).greaterThan(0.5).select(PT.element(base.add(uint(CLRT_AT))), PT.element(base.add(uint(CLR_AT)))).div(R), c = ringCN(plot, k, th), d = r.sub(c), a = abs(d);
      If(done.lessThan(0.5).and(a.lessThan(w.mul(ZONE))), () => { out.assign(d.lessThan(0).select(float(-1), float(1)).mul(w.add(a.mul((ZONE - 1) / ZONE))).add(c)); done.assign(1); });
    }
    return out;
  };
  const place = (base, fi, fj) => {
    const u = fi.div(SIDE).mul(2).sub(1), v = fj.div(SIDE).mul(2).sub(1), big = abs(u).greaterThan(abs(v)), r = big.select(u, v), num = big.select(v, u), den = r.add(r.greaterThanEqual(0).select(float(1e-6), float(-1e-6)));
    const q = num.div(den).mul(Math.PI / 4), phi = big.select(q, float(Math.PI / 2).sub(q)), d = vec2(cos(phi), sin(phi)).mul(r);
    // (the disc's angle a share of the plot's land: the direction at that share, from its row)
    const t = atan(d.y, d.x).div(TAU).add(1).fract().mul(RAYS), i0 = floor(t), at = base.add(uint(4 + RAYS)).add(uint(i0).min(uint(RAYS - 1))), th = mix(PT.element(at), PT.element(at.add(uint(1))), t.sub(i0)).toVar(), R = reach(base, th).toVar();
    return middle(base).add(vec2(cos(th), sin(th)).mul(offWayN(base, length(d), th, R)).mul(R));
  };
  // where share u (0 … 1 round) of way k of a plot lies, o metres further out (the same in JS: wayAtJS)
  const wayPos = (base, k, o, u) => { const t = u.fract().mul(RAYS), i0 = floor(t), at = base.add(uint(PH_AT)).add(uint(i0).min(uint(RAYS - 1))), th = mix(PT.element(at), PT.element(at.add(uint(1))), t.sub(i0)).toVar(); return middle(base).add(vec2(cos(th), sin(th)).mul(reach(base, th).mul(ringCN(int(base.div(uint(ROW))), k, th)).add(o))); };
  // a cell's number: its plot above BITS bits, its place in the plot's lattice under them
  const plotOfCell = (c) => c.x.shiftRight(int(BITS)), inPlot = (c) => c.x.bitAnd(int((1 << BITS) - 1));
  // where a plot's million stand, kept for the KEPT plots nearest the camera: folding the lattice onto a plot's shape
  // is the costly part of placing a thing (a square root, two turns, six reads), and a tier asks it of up to a million
  // cells each time the camera turns. So it is asked once for a plot that comes near (keepPass: a million cells, one pass),
  // and kept as two numbers of 16 bits a cell (its place in the plot's own square, to 5 cm): 4 MB a plot, on the GPU only
  const kept = gpuStorage('uint', KEPT * SIDE * SIDE, "stand: where the near plots' millions stand").node, fillPlot = uniform(0, 'uint'), fillSlot = uniform(0, 'uint');
  const keepPass = Fn(() => {
    const i = int(instanceIndex.mod(uint(SIDE))), j = int(instanceIndex.div(uint(SIDE))), base = fillPlot.mul(uint(ROW)), cx = int(fillPlot).shiftLeft(int(BITS)).add(i);
    const d = place(base, float(i).add(rnd(cx, j, uint(905)).mul(0.7).add(0.15)), float(j).add(rnd(cx, j, uint(906)).mul(0.7).add(0.15))).sub(middle(base)).div(PT.element(base.add(uint(FAR_AT)))).mul(0.5).add(0.5).clamp(0, 1).mul(65535);
    kept.element(fillSlot.mul(uint(SIDE * SIDE)).add(instanceIndex)).assign(uint(d.x).bitOr(uint(d.y).shiftLeft(uint(16))));
  })().compute(SIDE * SIDE);
  const slots = { who: new Int32Array(KEPT).fill(-1), version: 0 }; let nearKey = '';
  // each frame: the KEPT plots nearest are kept; one that is not yet is given a slot (a free one, or the farthest's) and filled
  const keepNear = (cx, cz) => {
    const order = PL.map((p) => [Math.hypot(p.x - cx, p.z - cz) - p.most, p]).sort((a, b) => a[0] - b[0]), near = order.slice(0, KEPT).map((x) => x[1]), p = near.find((q) => q.slot == null);
    // (the ways of the NEARW nearest, told to what else places things: src/world/ways.js; other plots than before: it places again)
    const key = order.slice(0, NEARW).map((x) => x[1].i).sort((a, b) => a - b).join(); if (key !== nearKey) { nearKey = key; NEARV.forEach((v, n) => (v.x = order[n] ? order[n][1].i : -1)); waysChanged(); }
    if (!p) return;
    let at = slots.who.indexOf(-1); if (at < 0) at = slots.who.findIndex((i) => !near.includes(PL[i]));
    if (at < 0) return;
    if (slots.who[at] >= 0) { const o = PL[slots.who[at]]; o.slot = null; plotRows.array[o.i * ROW + KEPT_AT] = -1; plotRows.addUpdateRange(o.i * ROW + KEPT_AT, 1); }
    slots.who[at] = p.i; p.slot = at; plotRows.array[p.i * ROW + KEPT_AT] = at; plotRows.addUpdateRange(p.i * ROW + KEPT_AT, 1); plotRows.needsUpdate = true;
    fillPlot.value = p.i; fillSlot.value = at; renderer.compute(keepPass); slots.version++; did('plot');
  };

  const H = createHeap({ kinds: ALL, name: 'stand: meshes', levels: LEVELS.map((l, i) => { const r = roomOf(i); return { idx: r.tris * 3, elems: r.verts, slots: l.slots, one: l.n === DOTN }; }) });
  const LO = uniformArray(LEVELS.map((l) => l.px));
  // every kind's look, five rows of numbers a kind: [its own texture's mean colour, model], [its second tint, metres a
  // tile of its textures], [the layer of the world's texture it takes its relief from, the layer its own texture lies in
  // (none: -1), gloss, sway], [how uneven its snow lies, glow, light through it, its size], [when its own texture came, the lobes of its leaves (0: it is solid)]
  const LAYERS = recipes('material').filter((m) => ['ground', 'bark', 'stone', 'grass'].includes(m.kind)).map((m) => tex.layer(m)), look = new Float32Array(ALL * 20);
  for (let k = 0; k < ALL; k++) {
    const B = lookOfKind(k);
    look.set([B.mean[0], B.mean[1], B.mean[2], modelOf(B.model), B.c2[0] * 1.7, B.c2[1] * 1.7, B.c2[2] * 1.7, B.scale, LAYERS[Math.min(LAYERS.length - 1, Math.floor(B.relief * LAYERS.length))], -1, B.gloss, B.sway, B.snow, B.glow, B.through, B.size ?? 1, -100, B.leaf ?? 0, 0, 0], k * 20);
  }
  const sizes = Float32Array.from({ length: STAND }, (_, k) => look[k * 20 + 15]);   // a standing kind's largest side, metres (its look's)
  const lookRows = new THREE.StorageBufferAttribute(look, 4), mats = storage(lookRows, 'vec4', ALL * 5), lookOf = (kind, j) => mats.element(kind.mul(uint(5)).add(uint(j)));
  // every kind's own texture (assets/kit/blob.js: blobSkin), SKIN pixels a side: a layer of one array texture for each
  // kind that is large enough on screen to show it, painted in a worker when it comes near, its layer given to another
  // when it has gone (as the fine meshes are: the pump, below). Ten thousand at once would be 950 MB; these are 89.
  const SKINS = Math.min(1024, renderer.backend.device?.limits?.maxTextureArrayLayers ?? 256);
  const skinRT = new THREE.RenderTarget(SKIN, SKIN, { depth: SKINS, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });
  Object.assign(skinRT.texture, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 2 }); renderer.initRenderTarget(skinRT);
  const skinTex = texture(skinRT.texture), skins = { who: new Int32Array(SKINS).fill(-1), used: new Float64Array(SKINS), slot: new Int32Array(ALL).fill(-1) };
  note('stand: looks', look.byteLength, look.byteLength); note("stand: kinds' own textures", Math.round(SKINS * SKIN * SKIN * 4 * 4 / 3), 0);
  // every moving kind's skeleton (assets/kit/creature.js): BONES bones a kind, three rows of four a bone
  // (worked out in a worker at the start, below: until they have come, what moves glides without a stride)
  const boneRows = new THREE.StorageBufferAttribute(new Float32Array(Math.max(1, MOVING) * BONES * 12), 4), BONE = storage(boneRows, 'vec4', Math.max(1, MOVING) * BONES * 3);
  // what a pixel is given: where it is and its pattern; its normal and its shade; where it is on the thing (metres from
  // its foot, at rest) and its kind; how large the thing is on screen
  const vA = varyingProperty('vec4', 'sA'), vB = varyingProperty('vec4', 'sB'), vC = varyingProperty('vec4', 'sC'), vPx = varyingProperty('float', 'sPx'), vSnow = varyingProperty('float', 'sSnow'), vN = varyingProperty('vec3', 'sN'), vUV = varyingProperty('vec2', 'sUV');   // (sN: the normal its texture is laid on by: the thing's own, at rest, for what moves; sUV: where on its leaf card a pixel is)

  // a thing's colour at a pixel, lit: its own texture laid on it from the sides (it stays on it as it stands); the relief
  // of one of the world's textures when it is large on screen; the snow on it; then its model's way of taking
  // the light. One piece of code for every kind and level: what differs is read from its look.
  const shade = (foliage = false) => {
    const kind = uint(vC.w.add(0.5)), M0 = lookOf(kind, 0), M1 = lookOf(kind, 1), M2 = lookOf(kind, 2), M3 = lookOf(kind, 3), w = vA.xyz;
    // a leaf card (assets/kit/frond.js): what lies outside the leaf is not drawn, before anything is read for it. The
    // leaf: lobes along the card, each widest at its middle, the whole narrowing to its tip
    if (foliage) { const lobes = lookOf(kind, 4).y, wide = abs(sin(vUV.y.mul(lobes).mul(Math.PI))).mul(0.8).add(0.2).mul(float(1).sub(vUV.y.mul(vUV.y).mul(0.6))); Discard(abs(vUV.x.mul(2).sub(1)).greaterThan(wide)); }
    const N0 = normalize(vB.xyz), Nq = normalize(vN), q = vC.xyz.div(M1.w), b0 = pow(abs(Nq), vec3(4)), b = b0.div(b0.x.add(b0.y).add(b0.z));
    // (how fast its texture runs across the screen, asked once here: a read inside a branch that asks it itself makes the
    // GPU work out every branch for every pixel)
    const gx = dFdx(q), gy = dFdy(q);
    // (a texture is read from two sides, not three: the two its face is turned towards; the third's share is nothing
    // where it would be dropped, so nothing jumps)
    const an = abs(Nq), least = an.x.min(an.y).min(an.z), wt = an.sub(least).max(0), w2 = wt.mul(wt), dx = an.x.lessThanEqual(an.y).and(an.x.lessThanEqual(an.z)), dz = dx.not().and(an.z.lessThan(an.y));
    const p1 = dx.select(q.xz, q.zy), g1x = dx.select(gx.xz, gx.zy), g1y = dx.select(gy.xz, gy.zy), k1 = dx.select(w2.y, w2.x).add(1e-5), p2 = dz.select(q.xz, q.xy), g2x = dz.select(gx.xz, gx.xy), g2y = dz.select(gy.xz, gy.xy), k2 = dz.select(w2.y, w2.z).add(1e-5);
    const sides = (read) => read(p1, g1x, g1y).mul(k1).add(read(p2, g2x, g2y).mul(k2)).div(k1.add(k2));
    // its colour: its own texture where it is large enough to show and has come (faded in by its size, and from when it
    // came); else, and under that, the texture's mean: what the mipmaps would make of it anyway
    const m = float(0.5).toVar(), M4 = lookOf(kind, 4), own = M0.rgb.toVar(), worn = smoothstep(SKINPX * 0.85, SKINPX * 1.6, vPx).mul(smoothstep(0, GROW * 2, U.uTime.sub(M4.x)));
    If(M2.y.greaterThan(-0.5).and(worn.greaterThan(0.004)), () => { const a = sides((p, dx, dy) => skinTex.sample(p).depth(M2.y).grad(dx, dy)); own.assign(mix(M0.rgb, a.rgb.mul(a.rgb), worn)); m.assign(mix(0.5, a.a, worn)); });   // (m: its texture's height there: where a glowing kind glows)
    const n = N0.toVar(), rough = float(0.7).toVar();
    If(vPx.greaterThan(RELIEF), () => {   // (its relief: only where it is large enough to show, faded in)
      const t1 = tex.n(M2.x, q.zy).grad(gx.zy, gy.zy), t2 = tex.n(M2.x, q.xz).grad(gx.xz, gy.xz), t3 = tex.n(M2.x, q.xy).grad(gx.xy, gy.xy), x = t1.xy.mul(2).sub(1), y = t2.xy.mul(2).sub(1), z = t3.xy.mul(2).sub(1);
      n.assign(normalize(N0.add(vec3(0, x.y, x.x).mul(b.x).add(vec3(y.x, 0, y.y).mul(b.y)).add(vec3(z.x, z.y, 0).mul(b.z)).mul(smoothstep(RELIEF, RELIEF * 2, vPx)))));
      rough.assign(t1.a.mul(b.x).add(t2.a.mul(b.y)).add(t3.a.mul(b.z)));
    });
    const W = weatherOn(n, snowLift(w, M3.x)), bare = own.mul(vB.w), col = mix(bare.mul(W.keep).add(W.add), SNOW, smoothstep(0.03, 0.14, vSnow)).toVar();   // (where the snow has lifted it, it is snow all through: its sides too)
    // the light: the sky's, and the sun's through the clouds and the shadow map
    const sunK = cloudAtOne(w);
    const V = normalize(U.uCam.sub(w)), S = U.uSunDir, sun = U.uSun.mul(sunK), sky = skyLight(n), ndl = max(n.dot(S), 0), Hf = normalize(V.add(S)), ndh = max(n.dot(Hf), 0), nv = max(n.dot(V), 0);
    const gloss = M2.z.mul(float(1).sub(rough.mul(0.6))).mul(W.keep), back = max(V.negate().dot(S), 0), plain = col.mul(sky.add(sun.mul(ndl)));
    const lit = vec3(0).toVar(), model = M0.w;
    // its model: how it takes the light (src/shading/*.js: each a file there, a branch here)
    const C = { colour: col, plain, tint: M0.rgb, second: M1.rgb, normal: n, eye: V, toSun: S, half: Hf, sun, sky, skyLight, ndl, ndh, nv, back, gloss, glow: M3.y, through: M3.z, height: m, bare: W.keep, phase: vC.w, time: U.uTime };
    if (MODELS.length === 1) lit.assign(MODELS[0].lit(C));
    else { let chain = null; MODELS.forEach((M, i) => { const body = () => { lit.assign(M.lit(C)); }; chain = !chain ? If(model.lessThan(0.5), body) : i < MODELS.length - 1 ? chain.ElseIf(model.lessThan(i + 0.5), body) : chain.Else(body); }); }
    return finish(lit, w);
  };

  const SLOT = uniform(0, 'uint').onObjectUpdate(({ object }) => object?.userData?.slot ?? 0);   // where a mesh's things lie in its tier's packing, told by the mesh: every level's and every bucket's material is then one shader
  // its last level, a dot: a pixel or two of it, so one triangle turned to the eye, as large on screen as the thing, in
  // its texture's mean colour, plainly lit, sinking away under a pixel. A small shader of its own: a million
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
        const kind = uint(vDot.w.add(0.5)), M0 = lookOf(kind, 0), M3 = lookOf(kind, 3), w = vDot.xyz, n = normalize(normalize(U.uCam.sub(w)).add(vec3(0, 1, 0)));
        const W = weatherOn(n, M3.x.mul(0.5)), col = M0.rgb.mul(0.85).mul(W.keep).add(W.add);
        out.assign(finish(col.mul(skyLight(n).add(U.uSun.mul(sunDim()).mul(cloudShade(w)).mul(max(n.dot(U.uSunDir), 0)))), w));
      });
      return out;
    })();
    return m;
  };

  const tiers = [];
  // a point of a mover and its normal as bone `bone` of its skeleton has moved them (the kind's bones begin at `base`;
  // g: the mover's stride; creature.js says what a bone is): swung or turned about its pivot, or shifted; then the
  // same by the bone it hangs on
  const boned = (base, g, bone, p0, n0) => {
    const one = (idx, p, n) => {
      const at = base.add(idx.mul(uint(3))), r0 = BONE.element(at).toVar(), r1 = BONE.element(at.add(uint(1))).toVar(), r2 = BONE.element(at.add(uint(2))).toVar();
      const s = sin(g.mul(r2.y).add(r2.z)), swing = r1.w.greaterThan(0.5).and(r1.w.lessThan(1.5)), shift = r1.w.greaterThan(1.5).and(r1.w.lessThan(2.5)), spin = r1.w.greaterThan(2.5);
      const ang = swing.select(r2.w.add(r2.x.mul(s)), spin.select(g.mul(r2.y), float(0))).toVar(), c = cos(ang), sn = sin(ang), k = r1.xyz;
      const rot = (v) => v.mul(c).add(cross(k, v).mul(sn)).add(k.mul(k.dot(v)).mul(float(1).sub(c)));
      return { p: r0.xyz.add(rot(p.sub(r0.xyz))).add(k.mul(shift.select(r2.x.mul(s), float(0)))).toVar(), n: rot(n).toVar(), parent: uint(r0.w) };
    };
    const a = one(bone, p0, n0);
    return one(a.parent, a.p, a.n);
  };
  // the one material of every mesh level: level i's (shadow: the whole of it, a little smaller, for the light only;
  // moving: a mover's, on its skeleton; foliage: leaf cards, cut out, seen from both sides)
  const meshOf = (src, i, shadow = false, moving = false, foliage = false) => {
    const lv = uniform(i, 'uint'), whole = uniform(shadow ? 1 : 0), lo = uniform(LEVELS[i].px), top = uniform(i ? LEVELS[i - 1].px : LEVELS[0].px * 2), morphs = uniform(underOf(i) ? 1 : 0), delta = uniform(LADDER[i].delta), still = uniform(i + 1 === HULL ? 1 : 0), m = new THREE.NodeMaterial();   // its level as numbers: every level is one shader
    const limbs = moving && i < HULL;   // (a mover's coarse levels are its hull: no bone moves it)
    if (foliage) m.side = THREE.DoubleSide;
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
          // (over the whole of its range, top to bottom: it is never still and never jumps)
          const t = float(1).sub(whole).mul(SMOOTH).mul(max(morphs.mul(float(1).sub(smoothstep(lo, top, px))), float(1).sub(smoothstep(0, GROW, sinceCame(R, U.uTime))))).toVar();
          const v = solidOf(heapElem(H, R, vertexIndex).toVar(), t, delta), cs = cos(B.x), sn = sin(B.x), turn = (p) => vec3(p.x.mul(cs).sub(p.z.mul(sn)), p.y, p.x.mul(sn).add(p.z.mul(cs)));
          const p0 = vec3(v.p).toVar(), n0 = vec3(v.n).toVar(), P = vec3(p0).toVar(), N = vec3(n0).toVar();
          if (limbs) {
            // on its skeleton: moved by its two bones, each as much as the vertex is bound to it
            const base = uint(B.y).sub(uint(STAND)).mul(uint(BONES * 3)).toVar(), ma = boned(base, B.z, v.a, p0, n0);
            P.assign(ma.p); N.assign(ma.n);
            If(v.w.greaterThan(0.01), () => { const mb = boned(base, B.z, v.b, p0, n0); P.assign(mix(ma.p, mb.p, v.w)); N.assign(mix(ma.n, mb.n, v.w)); });
            // (at the last level it has limbs they come to rest as it turns into its hull: the hull does not move)
            const rested = t.mul(still); P.assign(mix(P, p0, rested)); N.assign(mix(N, n0, rested));
          }
          const k = whole.greaterThan(0.5).select(float(SHADE.shrink), float(1)), rest = turn(P.sub(vec3(0, 0.4, 0)).mul(k).add(vec3(0, 0.4, 0)).mul(A.w)).toVar();
          // the wind: its top sways, its foot stays (as a tree's: src/scatter/trees.js), as far as its look says
          const kk = vec2(0).toVar();
          if (!moving) {
            const up = clamp(p0.y, 0, 1), ws = windStrength, bend = up.mul(up).mul(A.w).mul(B.z);
            If(B.z.greaterThan(0), () => { kk.assign(windAt(A.xy).mul(bend).add(vec2(sin(U.uTime.mul(0.9).add(B.w)), cos(U.uTime.mul(0.7).add(B.w))).mul(bend).mul(ws.mul(0.4).add(smoothstep(0, 0.08, ws).mul(0.06))))); });   // (only what sways)
          }
          // (a thing the eye is inside of draws back from it: seen from inside it would be seen through. Only then: the eye
          // under its top and within its middle, where no walker comes, who goes round it (src/world/bodies.js: pushOut);
          // a camera that flies, or walks through things (`?ghost`), may. Not a mover: it steps round the walker, the detour)
          const out = moving ? float(1) : U.uCam.y.lessThan(A.z.add(A.w.mul(1.1))).select(smoothstep(A.w.mul(0.2), A.w.mul(0.4), length(U.uCam.xz.sub(A.xy))), float(1)).max(whole);
          // the snow lies on it as deep as on the ground: what of it faces up is lifted by the snow's depth, as a mound
          // (most where it faces straight up, thinning down its sides; no deeper than the thing can carry; a mover
          // shakes most of it off)
          const nw = turn(N).toVar(), snow = snowDepth.min(A.w.mul(0.7)).mul(smoothstep(-0.25, 0.8, nw.y)).mul(moving ? 0.3 : 1);
          const w = vec3(A.x, A.z, A.y).add(rest.mul(out)).add(vec3(kk.x, snow.mul(out), kk.y)); vSnow.assign(snow);
          // (its texture lies on it as it stands; on a mover as it is at rest, in its own frame: it must not swim over
          // a leg that swings)
          vA.assign(vec4(w, 0)); vB.assign(vec4(nw, v.shade)); vC.assign(vec4(moving ? p0.mul(A.w) : rest, B.y)); vN.assign(moving ? n0 : nw);
          if (foliage) vUV.assign(vec2(float(v.a).div(15), float(v.b).mul(16).add(v.w.mul(15)).div(255)));   // (where on its card: assets/kit/frond.js)
          clip.assign(clipOf(w));
        });
      }
      return clip;
    })();
    m.fragmentNode = Fn(() => {
      const out = vec4(0).toVar();
      If(unlit().not(), () => { out.assign(shade(foliage)); });   // (into the shadow map: only its depth)
      return out;
    })();
    return m;
  };
  const indexOf = LEVELS.map((l, i) => new THREE.BufferAttribute(Uint32Array.from({ length: roomOf(i).tris * 3 }, (_, j) => j), 1));   // (a draw as long as the level's longest mesh: its vertices are read from the heap by their number)
  const drawOf = (i) => { const g = new THREE.InstancedBufferGeometry(); g.setIndex(indexOf[i]); return g; };
  // the plots a tier may draw from: those whose land comes within `far` of the camera, and into its view
  const plotsNear = (cx, cz, h0, far, cull) => PL.filter((p) => { const d = Math.hypot(p.x - cx, p.z - cz) - p.most; return d < far && (cull === false || boxIn(p.x - p.most - cull, p.x + p.most + cull, h0 - 400, h0 + 400, p.z - p.most - cull, p.z + p.most + cull)); });

  // a tier: level i of every kind; shadow: all of it round the camera, whatever its size on screen, for the light only.
  // Its patches are blocks of P by P cells of a plot's lattice: chosen each frame from the plots near (select, below)
  const tier = (i, shadow = false) => {
    const Lv = { lo: LEVELS[i].px, hi: i ? LEVELS[i - 1].px : Infinity }, P = shadow ? 8 : LEVELS[i].P;
    const band = { near: uniform(0), far: uniform(1), ...bandOf(Lv, FADE, padOf(CELL, P)) }, round = uniform(SMAX / 2 + (CELL * P) / 16 + 2);
    // the full meshes are a draw a slot of the heap, each as long as the mesh that lies in it (set when it is put in:
    // arrive, below): a full mesh is 50 000 to 200 000 triangles, and one draw as long as the longest for all of them
    // worked out 200 000 for each
    const perSlot = i === 0 && !shadow;
    // (and what is cut out as leaves has a draw of its own at the levels it is cards: another state of the pipeline)
    const leafy = !shadow && i < HULL, K0 = perSlot ? LEVELS[0].slots : 1;
    // (its level and whether it is the shadow's as numbers: every tier's packing is one piece of code, compiled once)
    const lv = uniform(i, 'uint'), under = uniform(Math.max(0, i - 1), 'uint'), stands = uniform(i ? 1 : 0), all = uniform(shadow ? 1 : 0);
    const live = (c) => {
      const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar(), bucket = float(0).toVar(), plot = plotOfCell(c), ci = inPlot(c), cj = c.y, base = uint(plot).mul(uint(ROW)), h = (s) => rnd(c.x, c.y, uint(s)), whole = all.greaterThan(0.5);
      // (where it stands: kept for its plot, above; a plot not kept yet has nothing to show)
      const slot = PT.element(base.add(uint(KEPT_AT))), u = kept.element(uint(slot.max(0)).mul(uint(SIDE * SIDE)).add(uint(cj.mul(int(SIDE)).add(ci))));
      const pos = middle(base).add(vec2(float(u.bitAnd(uint(0xffff))), float(u.shiftRight(uint(16)))).div(65535).mul(2).sub(1).mul(PT.element(base.add(uint(FAR_AT))))), dist = camDist(pos), range = mix(dist, length(pos.sub(U.uCam.xz)), all);
      If(slot.greaterThan(-0.5).and(range.lessThan(band.far)).and(range.greaterThanEqual(band.near)).and(whole.or(inView(pos, round, SMAX))), () => {
        // its kind: its group of rows holds every kind once (groupOf, above)
        const g = cj.div(int(GROUP)), r4 = int(floor(rnd(plot, g, uint(902)).mul(4))), a = int(floor(rnd(plot, g, uint(901)).mul(KINDS / 10))).mul(10).add(1).add(r4.mul(2)).add(r4.greaterThanEqual(2).select(int(2), int(0)));
        const kind = uint(ci.add(cj.mod(int(GROUP)).mul(int(SIDE))).mul(a).add(int(floor(rnd(plot, g, uint(904)).mul(KINDS)))).mod(int(KINDS)).add(plot.mul(int(OFF))).mod(int(STAND))), size = clamp(lookOf(kind, 3).w.mul(h(903).mul(0.4).add(0.8)).mul(PT.element(base.add(uint(3)))), SMIN, SMAX), span = size.mul(PXK);
        // of this level: it is there (heap.js), and the thing is the size on screen the level is drawn at, or larger
        // while its next finer level has not come
        const R = heapRow(H, kind, lv), has = R.z.greaterThan(uint(0));
        const near = dist.greaterThanEqual(span.mul(band.from).sub(band.pad)).or(stands.greaterThan(0.5).and(R.w.shiftRight(under).bitAnd(uint(1)).equal(uint(0))));
        If(has.and(whole.or(dist.lessThan(span.mul(band.to).add(band.pad)).and(near))), () => {
          A.assign(vec4(pos, groundAt(pos, float(0)).sub(size.mul(0.06)), size));
          B.assign(vec4(h(907).mul(TAU), float(kind), lookOf(kind, 2).w, h(908).mul(TAU)));   // (its turn, its kind, how far it sways, its sway's phase)
          if (perSlot) bucket.assign(float(R.x.sub(uint(H.pools[0].i0)).div(uint(H.pools[0].idx))));   // (the full meshes: which of the heap's slots its kind's lies in)
          if (leafy) bucket.addAssign(lookOf(kind, 4).y.greaterThan(0.5).select(float(K0), float(0)));
          alive.assign(1);
        });
      });
      return { alive: alive.greaterThan(0.5), data: [A, B], bucket };
    };
    const T = new Tier(scene, leafy ? Array.from({ length: K0 * 2 }, () => drawOf(i)) : drawOf(i), (src, k = 0) => (i === L - 1 && !shadow ? dot(src) : meshOf(src, i, shadow, false, leafy && k >= K0)), { cell: CELL, P, near: 0, far: 1, order: 1, live, gpu: true, cap: shadow ? 8192 : LEVELS[i].cap, slots: 2 });
    T.band = shadow ? () => { T.near = 0; T.far = SHADE.far; band.near.value = -1; band.far.value = SHADE.far * SHADE.wide; }
      : () => {
        [T.near, T.far] = band.reach(SMIN, SMAX, pxK()); if (i <= STREAMED) T.near = 0;   // (a level may stand in for the finer ones, right up to the camera)
        band.near.value = T.near > 0 ? T.near : -1; band.far.value = T.far;
      };
    // its patches: of each plot near, the blocks of its lattice that lie in the tier's band of distances and in view
    // (where a block lies: its middle through toLand; a block near the camera is found by the camera's own lattice point)
    // (where a block's middle lies on the land: folded once, kept; a tier asks it of thousands of blocks a frame)
    const middles = new Map(), middleOf = (p, bi, bj) => { const key = (p.i * 512 + bi) * 512 + bj; let c = middles.get(key); if (!c) { if (middles.size > 40000) middles.clear(); middles.set(key, (c = toLand(p, (bi + 0.5) * P, (bj + 0.5) * P))); } return c; };
    T.select = (cx, cz, h0, s, dy) => {
      const far0 = shadow ? Math.min(SHADE.far * SHADE.wide, T.far + Math.abs(dy) * 1.2) : T.far * s, far2 = far0 * far0 - dy * dy, near2 = T.near * T.near * s * s - dy * dy, list = T.list; let n = 0; T.over = false;
      if (far2 > 0) for (const p of plotsNear(cx, cz, h0, Math.sqrt(far2), shadow ? false : 0)) {
        const far = Math.sqrt(far2), [fi, fj] = toLattice(p, cx, cz), rl = (far + 2 * Math.max(p.clr, p.clrT)) / p.narrow + P, nb = SIDE / P, rad0 = P * p.wide * 0.8, wr = (ZONE * Math.max(p.clr, p.clrT)) / p.least + MA, pad = (P / SIDE) * 1.5;
        const i0 = Math.max(0, Math.floor((fi - rl) / P)), i1 = Math.min(nb - 1, Math.floor((fi + rl) / P)), j0 = Math.max(0, Math.floor((fj - rl) / P)), j1 = Math.min(nb - 1, Math.floor((fj + rl) / P));
        for (let bj = j0; bj <= j1; bj++) for (let bi = i0; bi <= i1; bi++) {
          // (a block that lies across a way reaches over it: its cells stand on both verges)
          const ring = Math.max(Math.abs((2 * (bi + 0.5) * P) / SIDE - 1), Math.abs((2 * (bj + 0.5) * P) / SIDE - 1)), rad = rad0 + (Math.abs(ring - ringOf(ring)) < wr + pad ? 2.2 * Math.max(p.clr, p.clrT) + 2 * MA * p.most : 0);
          const [x, z] = middleOf(p, bi, bj), d = Math.hypot(x - cx, z - cz);
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
    for (const m of T.meshes) m.renderOrder = 1 + i * 0.01;   // the fine levels first: they are the near ones, and what is behind them need not be shaded
    if (shadow) T.mesh.layers.set(1);
    const run = T.run.bind(T); T.run = (r, world, ...a) => run(r, `${world}|${slots.version}|${H.versions[i]}|${i && !shadow ? H.versions[i - 1] : 0}`, ...a);   // packed again when the heap has changed at its level, or the next finer (which it stands in for)
    tiers.push(T);
    return T;
  };
  for (let i = 0; i < L; i++) tier(i);
  tier(SHADE.level, true);

  // ---- the movers: ten thousand a plot, each ONE mesh of its kind on a skeleton (assets/kit/creature.js), where its
  // round has brought it by now, its stride as far as it has come. One tier, packed every frame; each mover dropped
  // into the draw of the level its size on screen asks for (the finest of it that is there) ----
  // (a herd, as the GPU reads it: [-, -, its size from … to], [how wide it is as it moves (of its size, half), how high it flies from … to, its stride], [its first kind, how many kinds, how long it is as it moves (of its size), -];
  // a column of the plot's movers: [its group, its place in the group's file (metres)]; a group: [its pace from … to, its file's length, -]; its lanes: [its way, how far out of its middle, which way round, its first rep])
  const rigRows = HERDS.flatMap((G) => [new THREE.Vector4(0, 0, G.size[0], G.size[1]), new THREE.Vector4(0.5, G.fly[0], G.fly[1], G.stride), new THREE.Vector4(G.first, G.count, 1, 0)]), colRows = Array.from({ length: MSIDE }, () => new THREE.Vector4()), grpRows = Array.from({ length: 8 }, () => new THREE.Vector4()), laneRows = Array.from({ length: 8 * LANES }, () => new THREE.Vector4());
  const RIG = HERDS.length ? uniformArray(rigRows, 'vec4') : null, COLS = HERDS.length ? uniformArray(colRows, 'vec4') : null, GRP = HERDS.length ? uniformArray(grpRows, 'vec4') : null, LANE = HERDS.length ? uniformArray(laneRows, 'vec4') : null, SH = HERDS.length ? uniformArray(HERDS.map((G) => G.upTo)) : null, strideT = uniform(0), airLow = uniform(0);
  const laid = (Y) => {
    airLow.value = Y.airLow;
    if (Y.groups.length > 8) throw new Error('stress: more than eight groups of movers');
    LAY = Y; Y.herds.forEach((H, h) => { rigRows[h * 3 + 1].x = H.side; rigRows[h * 3 + 2].z = 2 * H.fore; });
    Y.cols.forEach((C, i) => colRows[i].set(C.g, C.off, 0, 0));
    Y.groups.forEach((Gp, g) => { grpRows[g].set(Gp.lo, Gp.hi, Gp.span, 0); Gp.lanes.forEach((La, l) => laneRows[g * LANES + l].set(La.k, La.off, La.dir, Gp.starts[l])); });
  };
  if (HERDS.length) {
    const far = uniform(MFAR), round = uniform(MMAX);
    // where a mover is now (and all that says what it is): the same in JS above (moverOf, moverAtJS, detour)
    const nominal = (c) => {
      const plot = plotOfCell(c), base = uint(plot).mul(uint(ROW)), col = inPlot(c), mx = c.x, my = c.y, h = (s) => rnd(mx, my, uint(s));
      // which herd it is of: its column of the plot's movers
      const cl = float(col).add(0.5).div(MSIDE), rig = uint(0).toVar();
      for (let r = 0; r < HERDS.length - 1; r++) rig.addAssign(cl.greaterThanEqual(SH.element(r)).select(uint(1), uint(0)));
      const I0 = RIG.element(rig.mul(uint(3))), I1 = RIG.element(rig.mul(uint(3)).add(uint(1))), I2 = RIG.element(rig.mul(uint(3)).add(uint(2)));
      const q = PT.element(base.add(uint(Q_AT))), Lc = PT.element(base.add(uint(LC_AT))), h3 = h(923), h4 = h(924), h5 = h(925), h6 = h(926), t = U.uTime;
      // its group's lane: its row of the plot's movers is a rep of the group's file, dealt onto the lanes
      const C = COLS.element(col), g = uint(C.x), GR = GRP.element(g), lb = g.mul(uint(LANES)), l = uint(0).toVar(), fy = float(my);
      for (let n = 1; n < LANES; n++) l.addAssign(fy.greaterThanEqual(LANE.element(lb.add(uint(n))).w).select(uint(1), uint(0)));
      const La = LANE.element(lb.add(l)).toVar(), s1 = l.lessThan(uint(LANES - 1)).select(LANE.element(lb.add(l).add(uint(1)).min(lb.add(uint(LANES - 1)))).w, float(MSIDE)), n = s1.sub(La.w).max(1), Ln = La.x.mul(WAYD).add(WAY0).mul(Lc), dir = La.z;
      // the lane's pace (one for all that go in it), its own size; its place in the lane
      const v = mix(GR.x, GR.y, rnd(plot, int(g).mul(int(16)).add(int(l)), uint(931))).mul(q), S = mix(I0.z, I0.w, h3).mul(q);
      const u = fy.sub(La.w).add(C.y.div(GR.z)).div(n).add(dir.mul(v).mul(t).div(Ln)), du = S.mul(I2.z).mul(0.5).div(Ln).mul(dir), o = La.y.mul(q);
      // (its two ends on its lane, its middle between them: a long thing follows the bend)
      const a = wayPos(base, La.x, o, u.sub(du)).toVar(), b = wayPos(base, La.x, o, u.add(du)).toVar(), pos = a.add(b).mul(0.5).toVar(), tv = normalize(b.sub(a).add(vec2(1e-6, 0)));
      // the detour: stepped aside of the walker standing before it (on the ground only; the same in JS: detour)
      If(I1.z.lessThan(0.01).and(U.uDy.lessThan(1)), () => {
        const d = pos.sub(U.uCam.xz), al = d.dot(tv), ac = d.x.mul(tv.y).negate().add(d.y.mul(tv.x)), need = S.mul(I1.x).add(0.75).sub(abs(ac));
        If(need.greaterThan(0), () => { const e = clamp(abs(al).sub(S.mul(I2.z).mul(0.5)).sub(0.5).div(2.5), 0, 1), k = need.mul(float(1).sub(e.mul(e).mul(float(3).sub(e.mul(2))))).mul(ac.lessThan(0).select(float(-1), float(1))); pos.addAssign(vec2(tv.y.negate(), tv.x).mul(k)); });
      });
      return { plot, base, h, h3, h4, h5, h6, v, S, t, q, pos, yaw: atan(tv.y, tv.x), I0, I1, I2 };
    };
    const live = (c) => {
      const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar(), bucket = float(L - 1).toVar();
      const { h, h4, h5, h6, v, S, t, q, pos: at, yaw, I1, I2 } = nominal(c), pos = vec2(at).toVar();
      const dist = camDist(pos);
      If(dist.lessThan(far).and(inView(pos, round, MMAX)), () => {
        const px = S.mul(PXK).div(max(dist, 1e-3));
        If(px.greaterThan(LEVELS[L - 1].px), () => {
          const kind = uint(I2.x.add(floor(h(940).mul(I2.y)).min(I2.y.sub(1))));
          // the level its size asks for; drawn at the finest that is there and no finer than that
          const want = uint(0).toVar(), held = heldOf(heapRow(H, kind, uint(L - 1))), lvl = uint(L - 1).toVar();
          for (let j = 0; j < L - 1; j++) want.addAssign(px.lessThanEqual(LO.element(j)).select(uint(1), uint(0)));
          for (let l = L - 2; l >= 0; l--) If(want.lessThanEqual(uint(l)).and(held.shiftRight(uint(l)).bitAnd(uint(1)).equal(uint(1))), () => { lvl.assign(uint(l)); });
          // (what flies: so high over the ground, rising and falling a little)
          const up = I1.z.greaterThan(0.01).select(max(mix(I1.y, I1.z, h4), airLow), float(0)).mul(q).mul(sin(t.mul(0.4).add(h5.mul(TAU))).mul(0.15).add(1));   // (no lower than the tallest that drives under it)
          // its stride: how far it has come, in radians of its gait (its herd's stride: that much of its size a radian). From a
          // clock that begins again every WRAP seconds (a stride counted from the page's start would lose its
          // fineness in an hour); its pace is made to fit that clock, so no leg jumps when it does
          const step = (TAU * 20) / WRAP, pace = floor(v.div(S.mul(I1.w)).div(step).add(0.5)).max(1).mul(step);
          A.assign(vec4(pos, groundAt(pos, float(0)).add(up), S));
          B.assign(vec4(yaw, float(kind), pace.mul(strideT).add(h6.mul(TAU * 20)), 0));
          bucket.assign(float(lvl)); alive.assign(1);
        });
      });
      return { alive: alive.greaterThan(0.5), data: [A, B], bucket };
    };
    const T = new Tier(scene, LEVELS.map((_, i) => drawOf(i)), (src, k) => (k === L - 1 ? dot(src) : meshOf(src, k, false, true)), { cell: CELL * 10, P: MSIDE, near: 0, far: MFAR, order: 1, live, gpu: true, cap: MCAP, slots: 2 });
    T.band = () => { T.near = 0; T.far = MFAR; }; T.movers = true; T.viewKeyed = true; T.asset = 'Stress: movers';
    T.select = (cx, cz, h0, s, dy) => {   // its patches: each plot near, its ten thousand
      const far2 = T.far * T.far * s * s - dy * dy; let n = 0; strideT.value = U.uTime.value % WRAP;
      if (far2 > 0) for (const p of plotsNear(cx, cz, h0, Math.sqrt(far2), MMAX)) if (n < MAXP) T.list[n++].set(p.i << BITS, 0);
      T.n = n; for (const m of T.meshes) m.visible = n > 0;
    };
    T.meshes.forEach((m, k) => { if (k < L - 1) m.layers.enable(1); m.renderOrder = 1.005 + k * 0.01; });   // they cast their shadows as drawn; near ones drawn first
    let frame = 0; const run = T.run.bind(T); T.run = (r, world, ...a) => run(r, `${world}|${frame++}`, ...a);   // packed every frame: they move
    tiers.push(T);
  }
  addEventListener('resize', () => tiers.forEach((T) => T.band()));

  // ---- the meshes: made by the kinds' recipes in workers (recipes.worker.js); the coarse levels of every kind at the
  // start, the fine ones as the camera comes near ----
  const workers = Array.from({ length: 3 }, () => new Worker(new URL('./recipes.worker.js', import.meta.url), { type: 'module' })), waiting = new Map(), done = [];
  let nextId = 0, turn = 0, busy = 0;
  const ask = (jobs) => new Promise((res) => { const id = nextId++; waiting.set(id, res); workers[turn++ % workers.length].postMessage({ id, jobs }); });
  for (const w of workers) w.onmessage = ({ data }) => { waiting.get(data.id)(data.out); waiting.delete(data.id); };
  const stats = { coarseMs: 0, built: 0, put: 0, full: 0, skins: 0, kept: false }, t0 = performance.now();
  // every kind's dot is there from the start (the same three corners for all). Its two coarse meshes are read back from
  // the browser where an earlier start kept them (src/core/kept.js: one piece, under the recipes' fingerprint); else
  // they are built in the workers once the first frames are drawn (a start that builds eleven thousand kinds beside
  // it is a slow start), and kept for the next
  H.putAll(L - 1, dotMesh());
  const OWN = []; for (let l = STREAMED; l < L - 1; l++) OWN.push([l, H.pools[l].idx, H.pools[l].elems]);
  if (MOVING) ask([['bones', STAND, MOVING]]).then(([rows]) => { boneRows.array.set(rows); boneRows.needsUpdate = true; });
  // (how much room each herd's movers take as they move: the lanes are laid out by it, and the plots after them)
  if (MOVING) ask([['rooms']]).then(([rooms]) => laid(layOut(rooms))); else laid(layOut([]));
  const FP = fingerprint(); let coarse = -1, keptOwn = null, loadedAt = 0;
  keptGet(FP, 'own').then((rec) => { keptOwn = Array.isArray(rec) && rec.length === OWN.length && rec.every((b, n) => b.l === OWN[n][0] && b.counts?.length === ALL && b.corners?.length === ALL * OWN[n][1]) ? rec : false; });
  const fill = () => {
    coarse = 0;
    const all = OWN.map(([l, idx, elems]) => ({ l, corners: new Uint32Array(ALL * idx), verts: new Uint32Array(ALL * elems * 4), counts: new Uint32Array(ALL) }));
    for (let k = 0; k < ALL; k += 100) {   // (a hundred kinds a message, sent to the GPU as one piece a level)
      ask([['own', k, 100, OWN]]).then(([blocks]) => {
        blocks.forEach((b, n) => { H.putBlock(b.l, k, 100, b.corners, b.verts, b.counts); all[n].corners.set(b.corners, k * OWN[n][1]); all[n].verts.set(b.verts, k * OWN[n][2] * 4); all[n].counts.set(b.counts, k); });
        coarse += 100; if (coarse >= ALL) { stats.coarseMs = Math.round(performance.now() - t0); keptPut(FP, 'own', all); }
      });
    }
  };
  const putAt = new Float64Array(ALL * L).fill(-1e9);   // when a kind's level was put in (the page's clock, ms)
  const skinAt = new Int32Array(ALL);   // the round a kind's own texture was last wanted in
  const wantAt = new Int32Array(ALL * L); let speed = 0, lx = 0, ly = 0, lz = 0, lt = 0;   // wantAt: the round a kind's level was last wanted in; speed: the camera's, metres a second
  const pending = new Set(); let scanAt = -1e9, sx = 1e9, sz = 1e9, sk = '', round = 1;   // round: each look at what stands near; a level wanted in the last one is not put out
  // what is asked of the workers: a few at a time, the next as one comes back; of a level no more than it has room for
  let queue = []; const asked = new Int32Array(L);
  const feed = () => {
    const rooms = new Int32Array(L).fill(-1), roomOf = (l) => (rooms[l] < 0 ? (rooms[l] = H.room(l, round)) : rooms[l]);   // (how many a level can take in: counted once a feed, not for every one asked)
    while (busy < 6 && queue.length) {
      const batch = [];   // (the small levels a dozen a message, the large ones one)
      while (queue.length && batch.length < (batch.length && batch[0].l >= 3 ? 12 : 1)) {
        const q = queue[0], id = q.k * L + q.l; if (batch.length && q.l < 3) break;
        queue.shift(); if (pending.has(id) || H.has(q.k, q.l) || roomOf(q.l) <= asked[q.l]) continue;
        pending.add(id); asked[q.l]++; batch.push(q);
      }
      if (!batch.length) continue;
      busy++;
      ask(batch.map(({ k, l }) => ['mesh', k, l])).then((out) => { busy--; out.forEach((mesh, n) => { stats.built++; if (!batch[n].l) stats.full++; done.push({ k: batch[n].k, l: batch[n].l, mesh }); }); feed(); });
    }
  };
  // a kind's own texture: asked of the workers like a mesh; when it has come, written into a layer of the array (a free
  // one, or the one longest unwanted) and its look told where it lies, when it came and its true mean colour
  const skinAsks = [], skinDone = [], skinPending = new Set(); let skinBusy = 0;
  const skinFeed = () => {
    while (skinBusy < 3 && skinAsks.length) {
      const ks = []; let room = 0; for (let i = 0; i < SKINS; i++) if (skins.who[i] < 0 || skins.used[i] < round) room++;
      while (skinAsks.length && ks.length < 4) { const k = skinAsks.shift(); if (skinPending.has(k) || skins.slot[k] >= 0 || room <= skinPending.size) continue; skinPending.add(k); ks.push(k); }
      if (!ks.length) continue;
      skinBusy++; ask(ks.map((k) => ['skin', k, SKIN])).then((out) => { skinBusy--; out.forEach((S, n) => skinDone.push({ k: ks[n], S })); skinFeed(); });
    }
  };
  const skinPut = (k, S) => {
    let at = -1, old = Infinity; for (let i = 0; i < SKINS; i++) { if (skins.who[i] < 0) { at = i; break; } if (skins.used[i] < round && skins.used[i] < old) { old = skins.used[i]; at = i; } }
    if (at < 0) return false;
    if (skins.who[at] >= 0) { const o = skins.who[at]; skins.slot[o] = -1; look[o * 20 + 9] = -1; lookRows.addUpdateRange(o * 20 + 8, 4); }
    const dev = renderer.backend.device, gpu = renderer.backend.get(skinRT.texture).texture;
    S.levels.forEach((data, m) => { const n = SKIN >> m; dev.queue.writeTexture({ texture: gpu, mipLevel: m, origin: { x: 0, y: 0, z: at } }, data, { bytesPerRow: n * 4, rowsPerImage: n }, { width: n, height: n, depthOrArrayLayers: 1 }); });
    skins.who[at] = k; skins.slot[k] = at; skins.used[at] = round;
    look[k * 20 + 9] = at; look[k * 20 + 16] = U.uTime.value; lookRows.addUpdateRange(k * 20, 20); lookRows.needsUpdate = true; stats.skins++;
    return true;
  };
  // what the CPU knows of what stands near: a block of a plot's lattice (BL cells a side) worked out when first looked
  // at, a few kept; and a plot's movers' own numbers
  const BL = 32, blocks = new Map(); let built = 0;
  const blockOf = (p, bi, bj) => {
    const key = (p.i * 64 + bi) * 64 + bj; let b = blocks.get(key); if (b) return b;
    if (built++ >= 3) return null;   // (three new blocks a look: the rest at the next)
    b = { X: new Float32Array(BL * BL), Z: new Float32Array(BL * BL), S: new Float32Array(BL * BL), K: new Uint16Array(BL * BL) };
    for (let j = 0, n = 0; j < BL; j++) for (let i = 0; i < BL; i++, n++) { const ci = bi * BL + i, cj = bj * BL + j; if (ci >= SIDE || cj >= SIDE) { b.S[n] = 0; continue; } const o = standsAt(p, ci, cj, sizes); b.X[n] = o.x; b.Z[n] = o.z; b.S[n] = o.s; b.K[n] = o.k; }
    if (blocks.size > 96) blocks.delete(blocks.keys().next().value);
    blocks.set(key, b); return b;
  };
  // (a plot's ten thousand reckoned a part each time it is asked for: all at once is a frame lost)
  const moversOf = (p) => { const M = (p.movers ||= []); for (let n = 0; n < 1500 && M.length < MSIDE * MSIDE; n++) M.push(moverOf(p, M.length % MSIDE, Math.floor(M.length / MSIDE))); return M; };
  // what the workers have built, put in: before the frame's tiers pack (the first tier's select: below), not after. Put in
  // after, a frame packed by the old table would be drawn by the new one, and every thing of that kind was gone for
  // that frame: a flicker each time a mesh came or went. A frame sends the GPU one full mesh at most, or a dozen
  // small ones (under a megabyte); and a level waits until the next coarser one has come and grown: each grows out of the one before it
  const arrive = () => {
    const now = performance.now();
    for (let sent = 0, puts = 0, n = done.length; n > 0 && sent < 220000 && puts < 12; n--) {
      const d = done.shift(), id = d.k * L + d.l;
      if (d.l < 2 && wantAt[id] >= round - 1 && (pending.has(id + 1) || now - putAt[id + 1] < GROW * 1000)) { done.push(d); continue; }
      pending.delete(id); asked[d.l]--; if (wantAt[id] < round - 1) continue;
      sent += d.mesh.index.length; puts++;
      if (H.put(d.k, d.l, d.mesh, round, round, U.uTime.value)) {
        stats.put++; putAt[id] = now; did('meshes'); did('kB', Math.round((d.mesh.index.byteLength + d.mesh.verts.byteLength) / 1024));
        if (!d.l) { const T0 = tiers[0]; for (const at of [H.pools[0].slot[d.k] * 5, (H.pools[0].slot[d.k] + LEVELS[0].slots) * 5]) { T0.args.array[at] = d.mesh.index.length; T0.args.addUpdateRange(at, 1); } T0.args.needsUpdate = true; }   // (its slot's draw: as long as it)
      }
    }
  };
  { const first = tiers[0].select; tiers[0].select = (...a) => { arrive(); return first(...a); }; }
  // each frame: when the camera has moved, ask for the fine levels of what now
  // stands or passes near (coarser first: quick to build, and something to draw meanwhile), nearest first
  let tick = 0;
  const nearMovers = [];   // (the movers within sixty metres of the camera: kept by each look, for what asks where they are)
  const pump = () => {
    if (!PL.length) {   // the city's plan has come: its plots, to the GPU
      const cp = window.__s8?.city?.plots; if (!cp?.length || !LAY) return;
      cp.slice(0, PLOTS).forEach((c, i) => { const p = plotOf(c, i); PL.push(p); plotRows.array.set([p.x, p.z, p.mean, p.k, ...p.R, ...p.TH, ...p.PH, p.q, p.Lc, p.clr, p.wq, p.clrT, p.wqT, p.most, -1], i * ROW); });
      plotRows.addUpdateRange(0, plotRows.array.length); plotRows.needsUpdate = true;   // (all of it: a later change of one number must not be the only thing sent)
    }
    if (coarse < 0) {
      if (keptOwn) { for (const b of keptOwn) H.putBlock(b.l, 0, ALL, b.corners, b.verts, b.counts); coarse = ALL; keptOwn = false; stats.kept = true; stats.coarseMs = Math.round(performance.now() - t0); }
      else if (window.__s8?.loadMs) { loadedAt ||= performance.now(); if (keptOwn === false || performance.now() - loadedAt > 1500) fill(); }   // (the browser's answer is waited for a moment into the first frames: a busy start holds it back)
    }
    if (!(tick++ & 3)) keepNear(U.uCam.value.x, U.uCam.value.z);   // (which plots are near changes slowly: asked every fourth frame)
    const now = performance.now(), cam = U.uCam.value, dy = U.uDy.value, inv = U.uLodInv.value, K = pxK(), key = `${inv.toFixed(2)}|${K.toFixed(0)}`;
    if (API.pause) return;
    built = 0;
    const dt = Math.max(1e-3, (now - lt) / 1000), v = Math.hypot(cam.x - lx, cam.y - ly, cam.z - lz) / dt; lx = cam.x; ly = cam.y; lz = cam.z; lt = now;
    speed += (Math.min(v, 300) - speed) * Math.min(1, dt * 4);
    for (let n = 0; n < 3 && skinDone.length; n++) { const d = skinDone.shift(); skinPending.delete(d.k); if (skinAt[d.k] >= round - 1 && skinPut(d.k, d.S)) { did('skins'); did('kB', 87); } }   // (a few textures a frame)
    if (Math.hypot(cam.x - sx, cam.z - sz) < 0.7 && key === sk && now - scanAt < 300) return;
    sx = cam.x; sz = cam.z; sk = key; scanAt = now; round++; did('scan');
    // as far as the coarsest of the fine levels is asked for (and a fifth): of what stands, and of the largest mover
    const lo = LEVELS[STREAMED - 1].px, reachOfSize = (s) => (s * K * 1.2) / (lo * inv), Rs = reachOfSize(SMAX), Rm = reachOfSize(MMAX), asks = [], want = [], ahead = speed * 0.35, t = U.uTime.value;
    if (Rm <= dy) { queue = []; return; }
    // a thing s metres large, d metres off: its size on screen now, and as it will be when a mesh asked for now has come
    // (`ahead`: the camera travelling, and the thing itself: a fine level that will have been passed by then is not asked for)
    const wants = (k, s, d, own) => {
      const px = (s * K * 1.2) / Math.max(1e-3, d * inv), then = (s * K * 1.2) / ((d + ahead + own) * inv);
      if (px > SKINPX) { skinAt[k] = round; if (skins.slot[k] >= 0) skins.used[skins.slot[k]] = round; else if (then > SKINPX && !skinPending.has(k)) want.push([px, k]); }
      for (let l = STREAMED - 1; l >= 0 && px > LEVELS[l].px; l--) {
        if (H.has(k, l)) { H.touch(k, l, round); wantAt[k * L + l] = round; }
        else if (then > LEVELS[l].px) { wantAt[k * L + l] = round; if (!pending.has(k * L + l)) asks.push({ k, l, px }); }
      }
    };
    nearMovers.length = 0;
    for (const p of PL) {
      const off = Math.hypot(p.x - cam.x, p.z - cam.z) - p.most; if (off > Rm) continue;
      if (off < Rs && ahead < Rs) {   // what stands: the blocks of its lattice round the camera's own lattice point
        const [fi, fj] = toLattice(p, cam.x, cam.z), rl = Rs / p.narrow + 1, nb = Math.ceil(SIDE / BL);
        for (let bj = Math.max(0, Math.floor((fj - rl) / BL)); bj <= Math.min(nb - 1, Math.floor((fj + rl) / BL)); bj++) for (let bi = Math.max(0, Math.floor((fi - rl) / BL)); bi <= Math.min(nb - 1, Math.floor((fi + rl) / BL)); bi++) {
          const b = blockOf(p, bi, bj); if (!b) continue;
          for (let n = 0; n < BL * BL; n++) { if (!b.S[n]) continue; const d = Math.hypot(b.X[n] - cam.x, b.Z[n] - cam.z, dy); if (d < Rs) wants(b.K[n], b.S[n], d, 0); }
        }
      }
      if (HERDS.length) for (const M of moversOf(p)) { const [x, z] = moverNearJS(p, M, t), d = Math.hypot(x - cam.x, z - cam.z, dy); if (d < 60) nearMovers.push({ p, M }); if (d < reachOfSize(M.s)) wants(M.k, M.s, d, M.v * 0.35); }   // what passes
    }
    queue = asks.sort((p, q) => q.l - p.l || q.px - p.px); feed();
    skinAsks.length = 0; for (const [, k] of want.sort((a, b) => b[0] - a[0])) skinAsks.push(k); skinFeed();
  };
  // ---- what of it is solid (src/world/bodies.js): the things round a point, each with its kind's box and shapes (its
  // family's, beside its recipe: assets/zoo). Where they stand is reckoned here as the GPU reckons it (standsAt,
  // moverAtJS); a mover's shapes move with its bones. They stop the walker (`?stress&ghost`: they do not; a plot is a
  // thicket, a thing every metre and a half, but for its ways); a ray finds them always. `?stress&bounds` draws them ----
  const Q = new URLSearchParams(location.search), SOLID = !Q.has('ghost'), BOUNDS = Q.has('bounds');
  const stood = new Map();
  addBodies((x, z, reach) => {
    const out = [], t = U.uTime.value;
    for (const p of PL) {
      if (Math.hypot(p.x - x, p.z - z) - p.most > reach) continue;
      const [fi, fj] = toLattice(p, x, z), rl = Math.ceil((reach + SMAX) / p.narrow) + 1;
      for (let j = Math.max(0, Math.floor(fj - rl)); j <= Math.min(SIDE - 1, Math.floor(fj + rl)); j++) for (let i = Math.max(0, Math.floor(fi - rl)); i <= Math.min(SIDE - 1, Math.floor(fi + rl)); i++) {
        const id = (p.i * SIDE + j) * SIDE + i; let o = stood.get(id);   // (what stands in a cell stands there for good: reckoned once, kept)
        if (!o) { const st = standsAt(p, i, j, sizes); o = { id, x: st.x, z: st.z, y: heightAt(st.x, st.z) - st.s * 0.06, up: 0, yaw: cellRnd((p.i << BITS) + i, j, 907) * TAU, s: st.s, kind: st.k, body: bodyOf(st.k) }; if (stood.size > 40000) stood.clear(); stood.set(id, o); }
        if (Math.hypot(o.x - x, o.z - z) <= reach + o.s) out.push(o);
      }
    }
    nearMovers.forEach(({ p, M }, n) => {
      const [mx, mz, yaw] = moverAtJS(p, M, t); if (Math.hypot(mx - x, mz - z) > reach + M.s + 2) return;
      const up = M.fly * (Math.sin(t * 0.4 + M.ph) * 0.15 + 1), g = M.pace * (t % WRAP) + M.g0, rows = boneRows.array.subarray((M.k - STAND) * BONES * 12, (M.k - STAND + 1) * BONES * 12);
      out.push({ id: -1 - n, x: mx, z: mz, y: heightAt(mx, mz) + up, up, yaw, s: M.s, kind: M.k, body: bodyOf(M.k), pose: (bone, q, o) => moved(rows, bone, g, q, o) });
    });
    return out;
  }, { stops: SOLID });
  let outlinedAt = 0;
  tiers.solid = () => { pump(); if (BOUNDS && performance.now() - outlinedAt > 120) { outlinedAt = performance.now(); outline(scene, bodiesNear(U.uCam.value.x, U.uCam.value.z, 14)); } };

  // for looking at it (window.__stress): how many stand in a plot and of how many kinds; what each level holds and draws now
  const API = (window.__stress = {
    heap: H, tiers, stats, levels: LEVELS, plots: PL, sizes, pause: false, smooth: SMOOTH, fingerprint: FP, families: FAMILIES.map((E) => ({ id: E.id, first: E.first, count: E.count, roams: E.roams })), herds: HERDS, models: MODELS.map((M) => M.id),
    standsAt: (pi, i, j) => standsAt(PL[pi], i, j, sizes), boxOf: (k) => bodyOf(k).box, lay: () => LAY, way: (pi, k, o, u) => wayAtJS(PL[pi], k, o, u), ways: { WAYS, WAY0, WAYD, ZONE, MA }, toLand: (pi, fi, fj) => toLand(PL[pi], fi, fj), toLattice: (pi, x, z) => toLattice(PL[pi], x, z),
    movers: (pi, t = U.uTime.value) => { while (moversOf(PL[pi]).length < MSIDE * MSIDE); return API.moversNow(pi, t); },
    moversNow: (pi, t) => moversOf(PL[pi]).map((M) => { const [x, z, yaw] = moverAtJS(PL[pi], M, t); return { x, z, yaw, rig: M.rig, herd: M.herd, ring: M.ring, s: M.s, v: M.v, kind: M.k, fly: M.fly }; }),
    /** The plot a place lies in (its number), or -1. */
    plotAt: (x, z) => { for (const p of PL) { const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz); if (l < p.most && l < reachOf(p, Math.atan2(dz, dx))) return p.i; } return -1; },
    /** A plot counted, cell by cell: how many stand in it, of how many kinds, the fewest and the most of a kind; and the world's sums. */
    census(pi = 0) {
      const p = PL[pi], n = new Uint32Array(STAND); for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) n[kindAt(p, i, j)]++;
      return { plot: p.id, stand: n.reduce((x, y) => x + y, 0), kinds: n.filter(Boolean).length, least: Math.min(...n), most: Math.max(...n), movers: MSIDE * MSIDE, plots: PL.length, standing: PL.length * SIDE * SIDE, moving: PL.length * MSIDE * MSIDE };
    },
    async counts() {
      const out = [];
      for (const T of tiers) {
        const B = await T.read(renderer);
        if (T.movers) { out.push({ tier: T.asset, packed: B.reduce((x, b) => x + b.count, 0), tris: B.reduce((x, b, l) => x + b.count * (LEVELS[l].n === FULLN ? 125000 : trisOf(LEVELS[l].n)), 0), byLevel: B.map((b) => b.count), patches: T.n, over: T.over }); continue; }
        const full = LEVELS[T.level].n === FULLN, count = B.reduce((x, b) => x + b.count, 0); let tris = 0;
        if (full) for (const b of B) for (let j = 0; j < b.count; j++) tris += fullTris(b.data[1][j * 4 + 1]); else tris = count * trisOf(LEVELS[T.level].n);
        out.push({ tier: T.asset, packed: count, tris, patches: T.n, over: T.over });
      }
      return { tiers: out, held: H.held(), skinsHeld: skins.who.filter((x) => x >= 0).length, pending: pending.size, ...stats, heapMB: +(H.bytes / 1048576).toFixed(1) };
    },
  });
  return tiers;
}

/** A scatter engine (src/scatter/index.js finds it): it places no asset of the library, only its own, and only when asked. */
export const engine = {
  id: 'stress',
  createOwn: (scene, tex, ground, gpu, renderer) => (gpu && new URLSearchParams(location.search).has('stress') ? createStress(scene, renderer, tex) : []),
};
