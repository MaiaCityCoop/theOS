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
// How so many are placed and drawn (the placing is this file's; the drawing is the one drawer's, src/scatter/drawer.js,
// which this file made its tiers on and was one with until 2026-11-14):
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
import { Fn, If, Loop, float, int, uint, vec2, vec4, uniform, uniformArray, storage, texture, instanceIndex, cos, sin, atan, abs, max, mix, sqrt, floor, length, normalize, clamp } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { camDist, groundAt, rnd } from '../world/land.nodes.js';
import { cellRnd, heightAt } from '../world/land.js';
import { pxK } from '../detail/index.js';
import { padOf, bandOf } from '../detail/handover.js';
import { boxIn } from '../core/frustum.js';
import { Tier, MAXP } from './tier.js';
import { inView } from './view.js';
import { heapRow, heldOf, shapedOf } from './heap.js';
import { createDrawer } from './drawer.js';
import { LADDER, FULLN, trisOf } from '../../assets/kit/ladder.js';
import { STAND, MOVING, KINDS as ALL, FAMILIES, HERDS, lookOf as lookOfKind, fullTris, fingerprint } from '../../assets/zoo/index.js';
import { BONES } from '../../assets/kit/solid.js';
import { MODELS } from '../shading/index.js';
import { gpuStorage } from '../core/gpu.js';
import { did } from '../core/work.js';
import { addBodies, bodiesNear, outline } from '../world/bodies.js';
import { bodyOf } from '../../assets/zoo/index.js';
import { addWays, waysChanged } from '../world/ways.js';
import { moved } from '../../assets/kit/bones.js';
import CITY from '../../world/city.js';

const KINDS = 10000, SIDE = 1000, MSIDE = 100, GROUP = KINDS / SIDE;   // a plot's ten thousand places for a kind (given to the STAND kinds that stand: the zoo's; ALL: with those that roam); a plot's lattice: a thousand cells a side, one asset in each (GROUP rows of it hold every kind once: a hundred of every kind a plot); its movers' lattice: ten thousand
const PLOTS = Math.round(CITY.people / CITY.perVillage), RAYS = 64, PH_AT = 4 + RAYS + RAYS + 1, Q_AT = PH_AT + RAYS + 1, LC_AT = Q_AT + 1, VERGE_AT = Q_AT + 2, LEAST_AT = Q_AT + 3, CLRS_AT = Q_AT + 6, MAXW = 32, ROW = CLRS_AT + MAXW + 2, FAR_AT = ROW - 2, KEPT_AT = ROW - 1, KEPT = 8, BITS = 11, TAU = Math.PI * 2;   // a plot's row: its middle (x, z), its mean reach, its things' scale, then how far its edge is in RAYS directions, then the directions that cut its land into RAYS equal shares, the directions at every RAYS-th of the way round it (PH_AT), its movers' scale, how long it is round, the room of what stands beside its ways, its shortest reach (Q_AT …), half the width each of its ways is kept clear (CLRS_AT, MAXW of them), its longest reach, and where its places are kept (KEPT plots' at once; -1: not kept); BITS: a cell's number holds its plot above them
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
const reachOfP = (p, th) => reachOf(p, th);
const reachOf = (p, th) => { const t = ((th / TAU) % 1 + 1) % 1 * RAYS, i0 = Math.floor(t) % RAYS, f = t - Math.floor(t); return p.R[i0] * (1 - f) + p.R[(i0 + 1) % RAYS] * f; };
// the lattice is folded onto a plot's shape share for share: the disc's angle is a share of the plot's land (TH: the
// directions that cut it into RAYS equal shares), so as many stand in a narrow corner of it as in a wide one, for its size
const turnOf = (p, f) => { const t = (((f % 1) + 1) % 1) * RAYS, i0 = Math.min(RAYS - 1, Math.floor(t)); return p.TH[i0] + (p.TH[i0 + 1] - p.TH[i0]) * (t - i0); };
const shareOf = (p, th) => { let lo = 0, hi = RAYS; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.TH[m] <= th) lo = m; else hi = m; } return (lo + (th - p.TH[lo]) / Math.max(1e-9, p.TH[lo + 1] - p.TH[lo])) / RAYS; };
// The ways (src/world/ways.js): rings round a plot's middle, kept clear of what stands: the lattice is folded so that
// nothing falls on them (offWay: what would is set on their verges, which stand the thicker for it; backOn: the way
// back). A few are roads, wide (what drives keeps to the roads, what flies goes over them); between and round them run
// the trails, bundles of narrow paths winding through the thicket, one file wide each (what walks, runs and crawls
// keeps to them). The rings are a table, laid out with the lanes (layOut): each its share of the plot's reach, half the
// width of what goes on it, how it winds. A way is as wide as that and the room of what stands beside it (clrOf).
//   ZONE         how far to either side of a way, of its half width, what stands is moved aside
//   SKEW         no ring turns further from the round than this (the tangent of that angle: plotOf evens the reach)
//   WIND         the steepest a trail turns from its ring by its winding (a tangent)
//   REF          the reach (metres) the rings are laid out for: a plot narrower than that has smaller movers
//   BUNDLES      how many trails run inside the first road, between each two, and outside the last
//   NEARW        of so many plots near the camera the ways are told to what else places things
const ZONE = 2, SKEW = 0.8, WIND = 0.3, NEARW = 12, LANES = 16, REF = 340, BUNDLES = [2, 4, 4, 3];
let RING = []; const LUT = new Int8Array(64);   // the rings, from the middle outwards: [{ rho, W, MA, MN, bundle, road }]; and the ring nearest each sixty-fourth of the reach
/** The middle of way k at direction th, of plot p's reach (a trail winds: with its bundle, its own phase in each plot). */
const ringC = (p, k, th) => { const G = RING[k]; return G.rho + (G.MA ? G.MA * Math.sin(G.MN * th + (p.ph[G.bundle] ??= cellRnd(p.i, G.bundle, 950) * TAU)) : 0); };
/** Half the width way k is kept clear in plot p, metres: its lanes' and the room of what stands beside them (plotOf: p.clrs). */
const clrOf = (p, k) => p.clrs[k];
const nearK = (r) => LUT[Math.min(63, Math.max(0, Math.floor(r * 64)))];
/** The way whose verges a share r of the reach at direction th lies within (its number), or -1. */
const zoneOf = (p, r, th, R) => { const k0 = nearK(r); for (const k of [k0, k0 - 1, k0 + 1]) { if (k < 0 || k >= RING.length) continue; const G = RING[k], z = (ZONE * p.clrs[k]) / R; if (Math.abs(r - G.rho) > z + G.MA) continue; if (Math.abs(r - ringC(p, k, th)) < z) return k; } return -1; };   // (its winding asked only of what is near the ring at all: most things are not)
const offWay = (p, r, th, R) => { const k = zoneOf(p, r, th, R); if (k < 0) return r; const c = ringC(p, k, th), w = clrOf(p, k) / R, d = r - c, a = Math.abs(d); return c + (d < 0 ? -1 : 1) * (w + (a * (ZONE - 1)) / ZONE); };
const backOn = (p, r, th, R) => { const k = zoneOf(p, r, th, R); if (k < 0) return r; const c = ringC(p, k, th), w = clrOf(p, k) / R, d = r - c, a = Math.abs(d); return c + (d < 0 ? -1 : 1) * Math.max(0, a - w) * (ZONE / (ZONE - 1)); };
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
// bones over a stride). On a road a group has a lane each way, the quickest in the middle; what flies has one lane over
// each road. A trail is one lane of one group, one file wide, the next trail going the other way; the trails are dealt
// to the groups by their files' lengths. Each lane has its own pace (one for all in it, so none comes up with another;
// the next lane goes at another). So no mover meets another, and (the ways being clear) none meets what stands: by how
// the plot is laid out, at any distance and for nothing a frame. (A mover the walker stands in front of steps round
// him: the detour, below.)
let LAY = null;   // { WR: half a road's width, metres; herds: [{ fore, side, top, len, air, g, … }]; groups: [{ lo, hi, span, lanes, starts }]; cols: [{ g, off }]; rings }
function layOut(rooms) {
  // (lanes lie a number of metres further out from the middle: where a way turns from the round they are that much
  // closer, so a lane is as much wider: a road turns by the plot's shape (SKEW) at most, a trail by its winding too)
  const cosR = Math.cos(Math.atan(SKEW)), cosT = Math.cos(Math.atan(WIND));   // (a trail is one lane: no lane beside it to come closer to; its winding only)
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
  // across a road: the quickest in the middle, a lane each way; what flies: one lane over the middle of each road
  const roadG = groups.filter((G) => G.way === 'road').sort((a, b) => b.hi - a.hi), airG = groups.filter((G) => G.way === 'air'), trailG = groups.filter((G) => G.way === 'trail');
  let halfRoad = 0; for (const Gp of roadG) { Gp.off = halfRoad + Gp.lane / 2; halfRoad += Gp.lane; }
  const WR = Math.max(halfRoad, 0, ...airG.map((G) => G.lane / 2));
  // the trails dealt to the trail groups by their files' lengths (each one at the least), spread among each other
  const NT = trailG.length ? BUNDLES.reduce((a, b) => a + b, 0) : 0, need = trailG.map((G) => G.span), sum = need.reduce((a, b) => a + b, 0) || 1, cnt = need.map((x) => Math.max(1, Math.round((NT * x) / sum)));
  while (cnt.reduce((a, b) => a + b, 0) > NT) cnt[cnt.indexOf(Math.max(...cnt))]--;
  while (cnt.reduce((a, b) => a + b, 0) < NT) cnt[cnt.indexOf(Math.max(...cnt))]++;
  const owner = trailG.flatMap((G, g) => Array.from({ length: cnt[g] }, (_, n) => ({ g, key: (n + 0.5) / cnt[g] }))).sort((a, b) => a.key - b.key || a.g - b.g).map((x) => trailG[x.g]);
  // the rings, from the middle outwards: a bundle of trails, a road, a bundle, … Each is given the room it needs at a
  // reach of REF metres (its lanes, what stands beside them, and that again to either side: the fold's zone); what is
  // left over is the trails' room to wind (a bundle winds as one: its trails never come nearer each other)
  const V0 = SMAX / 2 + 0.4, hz = (W) => ZONE * (W + V0), roads = roadG.length || airG.length ? BUNDLES.length - 1 : 0, rings = []; let t = 0;
  BUNDLES.forEach((nb, b) => { for (let n = 0; n < nb && t < owner.length; n++, t++) rings.push({ road: false, W: owner[t].lane / 2, bundle: b, G: owner[t], MA: 0, MN: 0 }); if (b < roads) rings.push({ road: true, W: WR, bundle: 0, G: null, MA: 0, MN: 0 }); });
  const zones = rings.reduce((z, G) => z + 2 * hz(G.W), 0), A = owner.length ? Math.max(1.5, (0.87 * REF - zones) / (2 * BUNDLES.length)) : 0;
  let at = 0.05 * REF, prev = null;
  for (const G of rings) { if ((!G.road && (!prev || prev.road)) || (G.road && prev && !prev.road)) at += A; at += hz(G.W); G.rho = at / REF; at += hz(G.W); prev = G; }
  const over = Math.max(1, (at + A) / (0.95 * REF)); for (const G of rings) G.rho /= over;   // (more than fits a reach of REF: drawn together; the plots' movers are the smaller for it)
  for (let b = 0; b < BUNDLES.length; b++) { const B = rings.filter((G) => !G.road && G.bundle === b); if (!B.length) continue; const mid = B.reduce((x, G) => x + G.rho, 0) / B.length, MA = (0.9 * A) / REF / over, MN = Math.max(3, Math.round((WIND * mid) / MA)); for (const G of B) Object.assign(G, { MA, MN }); }
  // each group's lanes: a road group's each way on every road, what flies over every road, a trail group's its trails
  const roadK = rings.map((G, k) => (G.road ? k : -1)).filter((k) => k >= 0);
  for (const Gp of roadG) Gp.lanes = roadK.flatMap((k, n) => [{ k, off: Gp.off, dir: n % 2 ? -1 : 1 }, { k, off: -Gp.off, dir: n % 2 ? 1 : -1 }]);
  for (const Gp of airG) Gp.lanes = roadK.map((k, n) => ({ k, off: 0, dir: n % 2 ? -1 : 1 }));
  for (const Gp of trailG) Gp.lanes = rings.map((G, k) => (G.G === Gp ? k : -1)).filter((k) => k >= 0).map((k, n) => ({ k, off: 0, dir: n % 2 ? -1 : 1 }));
  for (const Gp of groups) {
    Gp.lanes = (Gp.lanes.length ? Gp.lanes : [{ k: 0, off: 0, dir: 1 }]).slice(0, LANES);
    // its reps (a row of the plot's movers each: every column of the group once) dealt onto its lanes by their lengths
    const le = Gp.lanes.map((L) => rings[L.k]?.rho ?? 0.5), tot = le.reduce((a, b) => a + b, 0); let acc = 0;
    Gp.starts = [0, ...le.map((x) => Math.round((MSIDE * (acc += x)) / tot))]; Gp.le = le;
    while (Gp.lanes.length < LANES) { Gp.lanes.push({ k: 0, off: 0, dir: 1 }); Gp.le.push(1); Gp.starts.push(MSIDE); }
  }
  // (what flies goes over the roads: no lower than the tallest that drives there, and a little)
  const airLow = (Math.max(0, ...H.filter((Y) => Y.way === 'road').map((Y) => Y.top * HERDS[Y.h].size[1])) + 0.8) / 0.85;
  return { WR, herds: H, groups, cols, airLow, rings, wind: A };
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
  const La = Gp.lanes[l], n = Math.max(1, Gp.starts[l + 1] - Gp.starts[l]), Ln = RING[La.k].rho * p.Lc;
  const v = (Gp.lo + (Gp.hi - Gp.lo) * cellRnd(p.i, C.g * 16 + l, 931)) * p.q, s = (G.size[0] + (G.size[1] - G.size[0]) * h3) * p.q;
  return { rig: G.name, herd: r, v, s, k: G.first + Math.min(G.count - 1, Math.floor(h(940) * G.count)), fly: (Y.air ? Math.max(LAY.airLow, G.fly[0] + (G.fly[1] - G.fly[0]) * h4) : 0) * p.q, ph: h5 * TAU, pace: Math.max(1, Math.floor(v / (s * G.stride) / ((TAU * 20) / WRAP) + 0.5)) * ((TAU * 20) / WRAP), g0: h6 * TAU * 20, stride: G.stride,
    lane: C.g * LANES + l, ring: La.k, Ln, dir: La.dir, u0: (j - Gp.starts[l] + C.off / Gp.span) / n, o: La.off * p.q, du: ((s * Y.fore) / Ln) * La.dir, side: Y.side, air: Y.air };
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
// A plot's movers by lane, each lane's in the order they go round: what asks which of them are near a place looks at the
// lanes that pass near it, and of those at the stretch that is passing now (all of a lane go at one pace: where each is
// now is where it began, moved on by as much). Ten thousand reckoned for every look was a late frame, three times a second.
const lanesOf = (p) => (p.lanes ||= (() => { const by = new Map(); for (const M of p.movers) { let L = by.get(M.lane); if (!L) by.set(M.lane, (L = { ring: M.ring, dir: M.dir, v: M.v, Ln: M.Ln, list: [] })); L.list.push(M); } for (const L of by.values()) { L.list.sort((a, b) => a.u0 - b.u0); L.u0 = Float64Array.from(L.list, (M) => M.u0); L.maxS = Math.max(...L.list.map((M) => M.s)); } return [...by.values()]; })());
// (a direction's share of the way round a plot: PH the other way)
const arcOf = (p, th) => { th = ((th % TAU) + TAU) % TAU; let lo = 0, hi = RAYS; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.PH[m] <= th) lo = m; else hi = m; } return (lo + (th - p.PH[lo]) / Math.max(1e-9, p.PH[lo + 1] - p.PH[lo])) / RAYS; };
function moversNear(p, x, z, reach, t, fn) {
  const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz), th = Math.atan2(dz, dx);
  for (const L of lanesOf(p)) {
    // (reach: metres, or what a lane's is: a lane of small things is looked at less far)
    const far = (typeof reach === 'function' ? reach(L) : reach) + 12, G = RING[L.ring], r0 = Math.max(1, (G.rho - G.MA) * p.least - 8), r1 = (G.rho + G.MA) * p.most + 8;
    if (r0 > l + far || r1 < l - far) continue;   // (its way lies wholly further in, or further out, than that)
    // how far round from the place's direction a point of the way can be and still be that near: two points so far
    // apart in direction, at these distances from the middle, are at least 2·sqrt(l·r)·sin(half the angle) apart
    const sh = far / (2 * Math.sqrt(Math.max(1e-6, l * r0))), A = L.u0, n = A.length;
    if (sh >= 0.999) { L.list.forEach(fn); continue; }
    const ph = 2 * Math.asin(sh), ua = arcOf(p, th - ph), span = (((arcOf(p, th + ph) - ua) % 1) + 1) % 1, from = (((ua - (L.dir * L.v * t) / L.Ln) % 1) + 1) % 1;   // that stretch of the way, as shares of it; where its movers began that are on it now
    let a = 0, b = n; while (a < b) { const m = (a + b) >> 1; if (A[m] < from) a = m + 1; else b = m; }
    for (let k = 0, j = a % n; k < n; k++, j = (j + 1) % n) { if ((((A[j] - from) % 1) + 1) % 1 > span) break; fn(L.list[j]); }
  }
}
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
  const p = { i, id: cp.id, x: cp.x, z: cp.z, R: new Float32Array(RAYS), TH: new Float32Array(RAYS + 1), PH: new Float32Array(RAYS + 1), ph: [] }; let mean = 0, most = 0, least = Infinity;
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
  // its ways: each as wide as its lanes and the room of what stands beside them (verge: half the largest thing, and a
  // hand); q: how much smaller than their own size its movers are, where the plot is too small for them: no two ways'
  // verges may meet where the plot is narrowest (nor the first the middle, the last the edge), and each lane must hold its reps
  const verge = Math.max(SMIN, SMAX * Math.min(1, 1.2 * k)) / 2 + 0.4; let q = 1;
  RING.forEach((G, j) => { const N = RING[j + 1]; if (N) q = Math.min(q, (((N.rho - G.rho - (!G.road && !N.road && G.bundle === N.bundle ? 0 : G.MA + N.MA)) * least) / ZONE - 2 * verge) / (G.W + N.W)); });
  if (RING.length) { const F = RING[0], E = RING.at(-1); q = Math.min(q, (((F.rho - F.MA) * least) / ZONE - verge) / F.W, (((0.985 - E.rho - E.MA) * least) / ZONE - verge) / E.W); }
  for (const Gp of LAY.groups) Gp.lanes.forEach((La, l) => { const n = Gp.starts[l + 1] - Gp.starts[l]; if (n > 0) q = Math.min(q, (Gp.le[l] * Lc) / n / Gp.span); });
  Object.assign(p, { mean, most, least, area, cell, narrow: cell * Math.min(least / rms, rms / most), wide: cell * Math.max(most / rms, rms / least), k, Lc, q: Math.max(0.02, q), verge });
  // half the width each way is kept clear: its lanes' and the verge; in a plot too small even for its smallest movers, no
  // more than its share of the way to the next (so no two ways' verges ever meet, whatever the plot)
  p.clrs = new Float32Array(MAXW);
  RING.forEach((G, j) => {
    if (G.W <= 0) return; const need = G.W * p.q + verge; let cap = Infinity;
    for (const N of [RING[j - 1], RING[j + 1]]) if (N) cap = Math.min(cap, (0.98 * ((Math.abs(N.rho - G.rho) - (!G.road && !N.road && G.bundle === N.bundle ? 0 : G.MA + N.MA)) * least) / ZONE * need) / (need + N.W * p.q + verge));
    if (j === 0) cap = Math.min(cap, (0.98 * (G.rho - G.MA) * least) / ZONE); if (j === RING.length - 1) cap = Math.min(cap, (0.98 * (0.985 - G.rho - G.MA) * least) / ZONE);
    p.clrs[j] = Math.max(0, Math.min(need, cap));
  });
  p.clrMax = Math.max(0, ...p.clrs);   // (the widest of its ways, half: how far the fold moves a thing at the most)
  return p;
}

// the plots, as the GPU reads them: a row each (ROW numbers), filled when the city's plan has come (src/city: made in a
// worker at the start). Kept here, not in the stand: what else places things reads the ways from them (below)
const CORNERS = new URLSearchParams(location.search).has('corners');   // (`?corners`: every corner of every triangle looked up and worked out by itself, as before 2026-11-14: to measure against)
const STRESS = new URLSearchParams(location.search).has('stress'), GHOST = new URLSearchParams(location.search).has('ghost');   // (GHOST: the walker walks through things)
const plotRows = new THREE.StorageBufferAttribute(new Float32Array(STRESS ? PLOTS * ROW : ROW), 1), PT = storage(plotRows, 'float', STRESS ? PLOTS * ROW : ROW), PL = [];
const reach = (base, th) => { const t = th.div(TAU).add(1).fract().mul(RAYS), i0 = floor(t), a = uint(i0).min(uint(RAYS - 1)); return mix(PT.element(base.add(uint(4)).add(a)), PT.element(base.add(uint(4)).add(a.add(uint(1)).mod(uint(RAYS)))), t.sub(i0)); };
const middle = (base) => vec2(PT.element(base), PT.element(base.add(uint(1))));
// the stand's ways, said to the world (src/world/ways.js): a place is on a way where, in one of the NEARW plots nearest
// the camera, it lies within the lanes' half width of one of the plot's rings (and so many metres more: margin)
const NEARV = Array.from({ length: NEARW }, () => new THREE.Vector4(-1, 0, 0, 0)), nearW = uniformArray(NEARV, 'vec4');
// the rings as the GPU reads them (filled when the lanes are laid out): [its share of the reach, half its lanes' width
// (metres), how far it winds, how many times round], [whose winding it shares, its room to its neighbours]; the ring
// nearest each sixty-fourth of the reach; how many rings there are
const ringRows = Array.from({ length: MAXW }, () => new THREE.Vector4(9, 0, 0, 0)), ringRows2 = Array.from({ length: MAXW }, () => new THREE.Vector4()), RINGU = uniformArray(ringRows, 'vec4'), RINGU2 = uniformArray(ringRows2, 'vec4'), lutRows = new Array(64).fill(0), LUTU = uniformArray(lutRows), nWays = uniform(1);
const nearKN = (r) => LUTU.element(uint(clamp(floor(r.mul(64)), 0, 63))), candK = (k0, dk) => clamp(k0.add(dk), 0, nWays.sub(1));
// half the width way k (a float) is kept clear in a plot, metres: its row says (plotOf: p.clrs)
const clrN = (base, k) => PT.element(base.add(uint(CLRS_AT)).add(uint(k)));
// the middle of way k (a float) of a plot at direction th, of its reach: the same in JS above (ringC)
const ringCN = (plot, k, th) => { const G = RINGU.element(uint(k)); return G.x.add(G.z.mul(sin(G.w.mul(th).add(rnd(plot, int(RINGU2.element(uint(k)).x), uint(950)).mul(TAU))))); };
if (STRESS) addWays({
  node: Fn(([p, margin]) => {
    const on = float(0).toVar();
    Loop(NEARW, ({ i }) => {
      const pi = nearW.element(i).x;
      If(pi.greaterThan(-0.5), () => {
        const base = uint(pi).mul(uint(ROW)), dq = p.sub(middle(base)), l = length(dq);
        If(l.lessThan(PT.element(base.add(uint(FAR_AT)))), () => {
          const th = atan(dq.y, dq.x).toVar(), R = reach(base, th).toVar(), rr = l.div(R), k0 = nearKN(rr), q = PT.element(base.add(uint(Q_AT)));
          for (const dk of [0, -1, 1]) { const k = candK(k0, dk), W = RINGU.element(uint(k)).y; If(W.greaterThan(0).and(abs(rr.sub(ringCN(int(pi), k, th))).mul(R).lessThan(W.mul(q).add(margin))), () => { on.assign(1); }); }
        });
      });
    });
    return on;
  }),
  at: (x, z, margin = 0) => { for (const p of PL) { const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz); if (l >= p.most) continue; const th = Math.atan2(dz, dx), R = reachOf(p, th), rr = l / R, k0 = nearK(rr); for (const k of [k0, k0 - 1, k0 + 1]) if (k >= 0 && k < RING.length && RING[k].W > 0 && Math.abs(rr - ringC(p, k, th)) * R < RING[k].W * p.q + margin) return true; } return false; },
});

export function createStress(scene, renderer, tex) {
  // a point of a plot's lattice (fi, fj: 0 … 1000 each way) on the land: the square onto a disc, area for area, the disc
  // onto the plot's shape, what would fall on a way set aside onto its verge (the same in JS above: toLand, offWay)
  const offWayN = (base, r, th, R) => {
    const plot = int(base.div(uint(ROW))), k0 = nearKN(r), out = float(r).toVar(), done = float(0).toVar();
    for (const dk of [0, -1, 1]) {
      const k = candK(k0, dk), w = clrN(base, k).div(R), c = ringCN(plot, k, th), d = r.sub(c), a = abs(d);
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

  // how it is drawn: the one drawer (src/scatter/drawer.js): the heap of every kind's meshes, their looks and textures,
  // the levels' materials and draws, and what streams them in. Here only where things stand and move.
  const D = createDrawer(scene, renderer, tex, { LEVELS, SHADE, SMOOTH, PXK, ghost: GHOST, corners: CORNERS, zoo: { ALL, STAND, MOVING, lookOfKind, fingerprint } });
  const { H, LO, lookOf, sizes, skins, boneRows, meshOf, dot, drawOf, drawShaped, shapeOf, ask, stats, pending } = D;

  const tiers = [];
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
    // (and what is of the level's own shape, a ball of the ladder's, the last draw: by the level's list of corners)
    const KS = shapeOf[i] ? (leafy ? K0 * 2 : 1) : -1;
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
          if (KS >= 0) If(shapedOf(R), () => { bucket.assign(float(KS)); });
          alive.assign(1);
        });
      });
      return { alive: alive.greaterThan(0.5), data: [A, B], bucket };
    };
    const T = new Tier(scene, [...Array.from({ length: leafy ? K0 * 2 : 1 }, () => drawOf(i)), ...(KS >= 0 ? [drawShaped(i)] : [])], (src, k = 0) => (i === L - 1 && !shadow ? dot(src) : meshOf(src, i, shadow, false, leafy && k >= K0 && k !== KS, k === KS)), { cell: CELL, P, near: 0, far: 1, order: 1, live, gpu: true, cap: shadow ? 8192 : LEVELS[i].cap, slots: 2 });
    T.band = shadow ? () => { T.near = 0; T.far = SHADE.far; band.near.value = -1; band.far.value = SHADE.far * SHADE.wide; }
      : () => {
        [T.near, T.far] = band.reach(SMIN, SMAX, pxK()); if (i <= STREAMED) T.near = 0;   // (a level may stand in for the finer ones, right up to the camera)
        band.near.value = T.near > 0 ? T.near : -1; band.far.value = T.far;
      };
    // its patches: of each plot near, the blocks of its lattice that lie in the tier's band of distances and in view
    // (where a block lies: its middle through toLand; a block near the camera is found by the camera's own lattice point)
    // (where a block's middle lies on the land: folded once, kept; a tier asks it of thousands of blocks a frame)
    // (and how far its things lie from there: its corners through the same fold, so a block that lies across a way reaches over it)
    const middles = new Map(), middleOf = (p, bi, bj) => {
      const key = (p.i * 512 + bi) * 512 + bj; let c = middles.get(key);
      if (!c) { if (middles.size > 40000) middles.clear(); const [x, z] = toLand(p, (bi + 0.5) * P, (bj + 0.5) * P); let r = 0; for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const [X, Z] = toLand(p, (bi + a) * P, (bj + b) * P); r = Math.max(r, Math.hypot(X - x, Z - z)); } middles.set(key, (c = [x, z, r * 1.1 + 1.5])); }
      return c;
    };
    T.select = (cx, cz, h0, s, dy) => {
      const far0 = shadow ? Math.min(SHADE.far * SHADE.wide, T.far + Math.abs(dy) * 1.2) : T.far * s, far2 = far0 * far0 - dy * dy, near2 = T.near * T.near * s * s - dy * dy, list = T.list; let n = 0; T.over = false;
      if (far2 > 0) for (const p of plotsNear(cx, cz, h0, Math.sqrt(far2), shadow ? false : 0)) {
        const far = Math.sqrt(far2), [fi, fj] = toLattice(p, cx, cz), rl = (far + 2 * p.clrMax) / p.narrow + P, nb = SIDE / P;
        const i0 = Math.max(0, Math.floor((fi - rl) / P)), i1 = Math.min(nb - 1, Math.floor((fi + rl) / P)), j0 = Math.max(0, Math.floor((fj - rl) / P)), j1 = Math.min(nb - 1, Math.floor((fj + rl) / P));
        for (let bj = j0; bj <= j1; bj++) for (let bi = i0; bi <= i1; bi++) {
          const [x, z, rad] = middleOf(p, bi, bj), d = Math.hypot(x - cx, z - cz);
          if (d - rad > far || (near2 > 0 && d + rad < Math.sqrt(near2))) continue;
          const yb = 0.32 * d + 0.2 * rad + 8, c = shadow ? SHADE.reach : 0;
          if (!boxIn(x - rad - c, x + rad + c, h0 - yb, h0 + yb + c + SMAX, z - rad - c, z + rad + c)) continue;
          if (n === MAXP) { T.over = true; continue; }
          list[n++].set((p.i << BITS) + bi * P, bj * P);
        }
      }
      T.n = n; for (const m of T.meshes) m.visible = n > 0;
    };
    T.band(); T.level = i; T.shaped = KS; T.viewKeyed = !shadow; T.asset = shadow ? 'Stress: shadows' : `Stress: level ${i}`;
    for (const m of T.meshes) m.renderOrder = 1 + i * 0.01;   // the fine levels first: they are the near ones, and what is behind them need not be shaded
    if (shadow) for (const m of T.meshes) m.layers.set(1);
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
  const rigRows = HERDS.flatMap((G) => [new THREE.Vector4(0, 0, G.size[0], G.size[1]), new THREE.Vector4(0.5, G.fly[0], G.fly[1], G.stride), new THREE.Vector4(G.first, G.count, 1, 0)]), colRows = Array.from({ length: MSIDE }, () => new THREE.Vector4()), grpRows = Array.from({ length: 8 }, () => new THREE.Vector4()), laneRows = Array.from({ length: 8 * LANES }, () => new THREE.Vector4());   // (eight groups at the most, LANES lanes each)
  const RIG = HERDS.length ? uniformArray(rigRows, 'vec4') : null, COLS = HERDS.length ? uniformArray(colRows, 'vec4') : null, GRP = HERDS.length ? uniformArray(grpRows, 'vec4') : null, LANE = HERDS.length ? uniformArray(laneRows, 'vec4') : null, SH = HERDS.length ? uniformArray(HERDS.map((G) => G.upTo)) : null, strideT = uniform(0), airLow = uniform(0);
  const laid = (Y) => {
    airLow.value = Y.airLow;
    if (Y.groups.length > 8) throw new Error('stress: more than eight groups of movers');
    LAY = Y; Y.herds.forEach((H, h) => { rigRows[h * 3 + 1].x = H.side; rigRows[h * 3 + 2].z = 2 * H.fore; });
    // the rings, to the fold and to what else places things
    if (Y.rings.length > MAXW) throw new Error('stress: more than ' + MAXW + ' ways');
    RING = Y.rings; nWays.value = Math.max(1, RING.length);
    RING.forEach((G, k) => { ringRows[k].set(G.rho, G.W, G.MA, G.MN); ringRows2[k].set(G.bundle, 0, 0, 0); });
    for (let i = 0; i < 64; i++) { let best = 0; RING.forEach((G, k) => { if (Math.abs(G.rho - (i + 0.5) / 64) < Math.abs(RING[best].rho - (i + 0.5) / 64)) best = k; }); LUT[i] = best; lutRows[i] = best; }
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
      const La = LANE.element(lb.add(l)).toVar(), s1 = l.lessThan(uint(LANES - 1)).select(LANE.element(lb.add(l).add(uint(1)).min(lb.add(uint(LANES - 1)))).w, float(MSIDE)), n = s1.sub(La.w).max(1), Ln = RINGU.element(uint(La.x)).x.mul(Lc), dir = La.z;
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

  // (how much room each herd's movers take as they move: the lanes are laid out by it, and the plots after them)
  if (MOVING) ask([['rooms']]).then(([rooms]) => laid(layOut(rooms))); else laid(layOut([]));
  let speed = 0, lx = 0, ly = 0, lz = 0, lt = 0, scanAt = -1e9, sx = 1e9, sz = 1e9, sk = '';   // speed: the camera's, metres a second; and when and where it last looked at what stands near
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
  { const first = tiers[0].select; tiers[0].select = (...a) => { D.arrive(tiers[0]); return first(...a); }; }   // (what the workers have built is put in before the frame's tiers pack: drawer.js)
  // each frame: when the camera has moved, ask for the fine levels of what now
  // stands or passes near (coarser first: quick to build, and something to draw meanwhile), nearest first
  let tick = 0;
  const nearMovers = [];   // (the movers within sixty metres of the camera: kept by each look, for what asks where they are)
  const pump = () => {
    if (!PL.length) {   // the city's plan has come: its plots, to the GPU
      const cp = window.__s8?.city?.plots; if (!cp?.length || !LAY) return;
      cp.slice(0, PLOTS).forEach((c, i) => { const p = plotOf(c, i); PL.push(p); plotRows.array.set([p.x, p.z, p.mean, p.k, ...p.R, ...p.TH, ...p.PH, p.q, p.Lc, p.verge, p.least, 0, 0, ...p.clrs, p.most, -1], i * ROW); });
      plotRows.addUpdateRange(0, plotRows.array.length); plotRows.needsUpdate = true;   // (all of it: a later change of one number must not be the only thing sent)
    }
    D.start();
    if (!(tick++ & 3)) keepNear(U.uCam.value.x, U.uCam.value.z);   // (which plots are near changes slowly: asked every fourth frame)
    const now = performance.now(), cam = U.uCam.value, dy = U.uDy.value, inv = U.uLodInv.value, K = pxK(), key = `${inv.toFixed(2)}|${K.toFixed(0)}`;
    if (API.pause) return;
    built = 0;
    const dt = Math.max(1e-3, (now - lt) / 1000), v = Math.hypot(cam.x - lx, cam.y - ly, cam.z - lz) / dt; lx = cam.x; ly = cam.y; lz = cam.z; lt = now;
    speed += (Math.min(v, 300) - speed) * Math.min(1, dt * 4);
    D.skinsIn();
    if (Math.hypot(cam.x - sx, cam.z - sz) < 0.7 && key === sk && now - scanAt < 300) return;
    sx = cam.x; sz = cam.z; sk = key; scanAt = now; did('scan');
    // as far as the coarsest of the fine levels is asked for (and a fifth): of what stands, and of the largest mover
    const ahead = speed * 0.35, t = U.uTime.value, N = D.near(K, inv, ahead), reachOfSize = N.reach, wants = N.wants, Rs = reachOfSize(SMAX), Rm = reachOfSize(MMAX);
    if (Rm <= dy) { N.none(); return; }
    nearMovers.length = 0;
    for (const p of PL) {
      const off = Math.hypot(p.x - cam.x, p.z - cam.z) - p.most; if (off > Rm) continue;
      if (off < Rs && ahead < Rs) {   // what stands: the blocks of its lattice round the camera's own lattice point
        const [fi, fj] = toLattice(p, cam.x, cam.z), rl = (Rs + p.clrMax) / p.narrow + 1, nb = Math.ceil(SIDE / BL);
        for (let bj = Math.max(0, Math.floor((fj - rl) / BL)); bj <= Math.min(nb - 1, Math.floor((fj + rl) / BL)); bj++) for (let bi = Math.max(0, Math.floor((fi - rl) / BL)); bi <= Math.min(nb - 1, Math.floor((fi + rl) / BL)); bi++) {
          const b = blockOf(p, bi, bj); if (!b) continue;
          for (let n = 0; n < BL * BL; n++) { if (!b.S[n]) continue; const d = Math.hypot(b.X[n] - cam.x, b.Z[n] - cam.z, dy); if (d < Rs) wants(b.K[n], b.S[n], d, 0); }
        }
      }
      if (HERDS.length) {   // what passes: of its lanes that run near, the movers on the stretch near
        const each = (M) => { const [x, z] = moverNearJS(p, M, t), d = Math.hypot(x - cam.x, z - cam.z, dy); if (d < 60) nearMovers.push({ p, M }); if (d < reachOfSize(M.s)) wants(M.k, M.s, d, M.v * 0.35); }, all = moversOf(p);
        if (all.length < MSIDE * MSIDE) all.forEach(each); else moversNear(p, cam.x, cam.z, (L) => Math.max(60, reachOfSize(L.maxS)), t, each);
      }
    }
    N.done();
  };
  // ---- what of it is solid (src/world/bodies.js): the things round a point, each with its kind's box and shapes (its
  // family's, beside its recipe: assets/zoo). Where they stand is reckoned here as the GPU reckons it (standsAt,
  // moverAtJS); a mover's shapes move with its bones. They stop the walker (`?stress&ghost`: they do not; a plot is a
  // thicket, a thing every metre and a half, but for its ways); a ray finds them always. `?stress&bounds` draws them ----
  const Q = new URLSearchParams(location.search), SOLID = !GHOST, BOUNDS = Q.has('bounds');
  const stood = new Map();
  addBodies((x, z, reach) => {
    const out = [], t = U.uTime.value;
    for (const p of PL) {
      if (Math.hypot(p.x - x, p.z - z) - p.most > reach) continue;
      const [fi, fj] = toLattice(p, x, z), rl = Math.ceil((reach + SMAX + p.clrMax) / p.narrow) + 1;
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
    heap: H, tiers, stats, levels: LEVELS, plots: PL, sizes, pause: false, smooth: SMOOTH, fingerprint: D.fingerprint, families: FAMILIES.map((E) => ({ id: E.id, first: E.first, count: E.count, roams: E.roams })), herds: HERDS, models: MODELS.map((M) => M.id),
    standsAt: (pi, i, j) => standsAt(PL[pi], i, j, sizes), boxOf: (k) => bodyOf(k).box, lay: () => LAY, way: (pi, k, o, u) => wayAtJS(PL[pi], k, o, u), rings: () => RING.map(({ rho, W, MA, MN, bundle, road }) => ({ rho, W, MA, MN, bundle, road })), clrOf: (pi, k) => clrOf(PL[pi], k), toLand: (pi, fi, fj) => toLand(PL[pi], fi, fj), toLattice: (pi, x, z) => toLattice(PL[pi], x, z),
    movers: (pi, t = U.uTime.value) => { while (moversOf(PL[pi]).length < MSIDE * MSIDE); return API.moversNow(pi, t); },
    moversNow: (pi, t) => moversOf(PL[pi]).map((M) => { const [x, z, yaw] = moverAtJS(PL[pi], M, t); return { x, z, yaw, rig: M.rig, herd: M.herd, ring: M.ring, s: M.s, v: M.v, kind: M.k, fly: M.fly }; }),
    /** Of plot pi's movers within `reach` metres of a place at t: how many there are (every one asked), and how many of those the look by lanes finds (moversNear: the two must agree). */
    nearCheck: (pi, x, z, reach, t = U.uTime.value) => { const p = PL[pi]; while (moversOf(p).length < MSIDE * MSIDE); const within = (M) => { const [mx, mz] = moverNearJS(p, M, t); return Math.hypot(mx - x, mz - z) < reach; }, all = p.movers.filter(within), got = new Set(); let looked = 0; moversNear(p, x, z, reach, t, (M) => { looked++; if (within(M)) got.add(M); }); return { within: all.length, found: all.filter((M) => got.has(M)).length, looked }; },
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
        out.push({ tier: T.asset, packed: count, tris, patches: T.n, over: T.over, shaped: T.shaped >= 0 ? B[T.shaped].count : 0 });
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
