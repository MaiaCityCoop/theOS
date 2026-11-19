// The stress stand: a test of the engine, not of the world. It draws the zoo (assets/zoo: every FAMILY of kinds found
// there, each one file that keeps one contract; nothing here knows a family by name). Today's: eight thousand shapes
// nobody drew, each its own mesh of 50 000 to 200 000 triangles, its own texture and look; two thousand plants of
// leaf cards, cut out, swaying; a thousand kinds of creature, each ONE mesh on a skeleton of its own. Every village
// plot of the city (src/city: 898 of them) is filled with a million of what stands, a hundred of each kind; and in
// every plot ten thousand of what roams move about, each herd at its own pace. 898 million standing, nine million
// moving. Loaded only with `?stress` in the address (src/scatter/index.js); nothing of it is in the library.
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
//   - a fine level that comes late grows out of the coarser one the same way, over the drawer's GROW seconds from when it came;
//   - its textures are read at every level (the GPU's mipmaps make a far thing its textures' mean), its relief fades in
//     with its size; its last level is a dot of that mean, sinking away under a pixel.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, float, int, uint, vec2, vec4, uniform, uniformArray, storage, instanceIndex, cos, sin, atan, abs, max, mix, floor, length, normalize, clamp } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { camDist, groundAt, rnd } from '../world/land.nodes.js';
import { heightAt } from '../world/land.js';
import { rnd as cellRnd } from '../core/hash.js';   // (a cell's number 0 … 1 on the CPU, as the GPU's rnd)
import { boxIn } from '../core/frustum.js';
import { MAXP } from './tier.js';
import { pace, frameShare } from '../core/pace.js';
import { inView } from './view.js';
import { createDrawer } from './drawer.js';
import { LADDER, FULLN, trisOf, ladderOf } from '../../assets/kit/ladder.js';
import { SURFACE_LEVELS, surfaceBand, surfacePx, BAND } from '../detail/error.js';
import { zooRooms, mostOf } from './rooms.js';
import { ready } from '../core/settle.js';
import { heapTable, heapRow, heldOf } from './heap.js';
import { pxAt, dialPxAt } from '../detail/measure.js';
import { STAND, MOVING, KINDS as ALL, FAMILIES, HERDS, lookOf as lookOfKind, fullTris, fingerprint } from '../../assets/zoo/index.js';
import { BONES, STILL_PER } from '../../assets/kit/solid.js';
import { MODELS } from '../shading/index.js';
import { gpuStorage, roomOf } from '../core/gpu.js';
import { did } from '../core/work.js';
import { addBodies } from '../world/bodies.js';
import { idOf } from '../world/things.js';
import { bodyOf } from '../../assets/zoo/index.js';
import { addWays, waysChanged } from '../world/ways.js';
import { moved } from '../../assets/kit/bones.js';
import CITY from '../../world/city.js';

const KINDS = 10000, SIDE = 1000, MSIDE = 100, GROUP = KINDS / SIDE;   // a plot's ten thousand places for a kind (given to the STAND kinds that stand: the zoo's; ALL: with those that roam); a plot's lattice: a thousand cells a side, one asset in each (GROUP rows of it hold every kind once: a hundred of every kind a plot); its movers' lattice: ten thousand
const PLOTS = Math.round(CITY.people / CITY.perVillage), RAYS = 64, PH_AT = 4 + RAYS + RAYS + 1, Q_AT = PH_AT + RAYS + 1, LC_AT = Q_AT + 1, VERGE_AT = Q_AT + 2, LEAST_AT = Q_AT + 3, CLRS_AT = Q_AT + 6, MAXW = 32, ROW = CLRS_AT + MAXW + 2, FAR_AT = ROW - 2, KEPT_AT = ROW - 1, KEPT = 8, BITS = 11, TAU = Math.PI * 2;   // a plot's row: its middle (x, z), its mean reach, its things' scale, then how far its edge is in RAYS directions, then the directions that cut its land into RAYS equal shares, the directions at every RAYS-th of the way round it (PH_AT), its movers' scale, how long it is round, the room of what stands beside its ways, its shortest reach (Q_AT …), half the width each of its ways is kept clear (CLRS_AT, MAXW of them), its longest reach, and where its places are kept (KEPT plots' at once; -1: not kept); BITS: a cell's number holds its plot above them
const SMIN = 0.25, SMAX = 2.2, MMAX = 6, MFAR = 1400, CELL = 1.4, FIT = 1.5, FADE = 0.02;   // an asset's largest side, metres (a mover's up to MMAX, seen as far as MFAR); CELL: a lattice cell's side, about; FIT: the cell's side a kind's own size is meant for
// its levels, finest first: the ladder's (assets/kit/ladder.js: n, a level's mesh; px, the size on screen it is drawn
// down to), and of each: P, its tier's cells a patch (a block of a plot's lattice: it divides 1000); slots: how many
// kinds' the heap holds at once (none: every kind's); cap: what it reckons it draws at once (its tier's rooms till its
// own count is read back: src/scatter/tier.js)
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
// The zoo's kinds that stand and bring their bands (assets/zoo/index.js bandOf: the blobs), the first of what stands
// (the families' order: assets/zoo/index.js FAMILIES): drawn by their bands (createStress: a drawer of its own)
const BANDED = FAMILIES.filter((E) => !E.placed && !E.roams && E.F.bandOf);
if (BANDED.some((E, i) => E.first !== BANDED.slice(0, i).reduce((n, B) => n + B.count, 0))) throw new Error("stress: the zoo's kinds with bands are not the first that stand");
// their bands (intent 0038, stage 8b; src/detail/error.js surfaceBand) as the drawer takes them: each its P and cap
// the ladder level's drawn at its top (the same sizes on screen), its room the families' (rooms.json, src/scatter/rooms.js
// zooRooms), level 0 drawn by its cut; every band by slots, how many decided once the world is made (slotsOf)
const bandsOf = () => Array.from({ length: SURFACE_LEVELS }, (_, l) => { const at = LEVELS[ladderOf(l ? surfacePx(l - 1) : Infinity)]; return { px: surfacePx(l), band: surfaceBand(l), delta: 0, room: mostOf(BANDED.map((E) => zooRooms(E.F, l, STILL_PER))), P: at.P, cap: at.cap, slots: 1, ...(l ? {} : { cut: true }) }; });
// how many kinds' each band holds at once: of what geometry's class has left once the world is made (src/core/gpu.js
// roomOf), a band's share each and one share more for what grows after it, no more than there are kinds; none where
// nothing is left (its kinds drawn by the ladder, and said short)
const slotsOf = (LV, NB) => { const bytes = (r) => r.tris * 3 * 4 + r.verts * STILL_PER * 16, share = Math.max(0, roomOf('geometry')) / (LV.length + 1); return LV.map((l) => Math.min(NB, Math.floor(share / bytes(l.room)))); };
const L = LEVELS.length, MCAP = 65536;   // MCAP: the most movers of one level drawn at once
const WRAP = 512;   // seconds after which the movers' stride clock begins again
const SHADE = { level: 5, far: 30, wide: 1.5, reach: 12, shrink: 0.85 };   // what casts their shadows: a coarse level of each round the camera, a little smaller than the thing (so it does not shade itself)

const OFF = STAND > KINDS ? 7919 : 0;   // a plot's places are given to the kinds that stand in turn (place n: kind n, round again where there are fewer kinds); where there are more kinds than places each plot begins further along: another ten thousand of them
const SMOOTH = uniform(1);   // 1: levels turn into each other; 0: they change at once (window.__stress.smooth: to see the difference)

// ---- a plot's lattice folded onto its shape, in JS (the same reckoning as the GPU's below: place, moverAt), for what the
// CPU must know: which blocks of it a tier looks at, and which kinds stand or pass near the camera ----
// a square (-1 … 1 each way) onto the unit disc, area for area (Shirley's concentric map), and back
// (each into `out`, two numbers: what the looks fold thousands of times a look makes nothing)
const diskInto = (u, v, out) => { if (!u && !v) { out[0] = out[1] = 0; return out; } const big = Math.abs(u) > Math.abs(v), r = big ? u : v, phi = big ? (Math.PI / 4) * (v / u) : Math.PI / 2 - (Math.PI / 4) * (u / v); out[0] = r * Math.cos(phi); out[1] = r * Math.sin(phi); return out; };
const squareInto = (rho, th, out) => {
  const phi = th < -Math.PI / 4 ? th + TAU : th, q = Math.PI / 4;
  if (phi < q) { out[0] = rho; out[1] = (phi * rho) / q; } else if (phi < 3 * q) { out[0] = (-(phi - 2 * q) * rho) / q; out[1] = rho; }
  else if (phi < 5 * q) { out[0] = -rho; out[1] = (-(phi - 4 * q) * rho) / q; } else { out[0] = ((phi - 6 * q) * rho) / q; out[1] = -rho; }
  return out;
};
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
const zoneOf = (p, r, th, R) => { const k0 = nearK(r); for (let n = 0; n < 3; n++) { const k = k0 + (n === 2 ? 1 : -n); if (k < 0 || k >= RING.length) continue; const G = RING[k], z = (ZONE * p.clrs[k]) / R; if (Math.abs(r - G.rho) > z + G.MA) continue; if (Math.abs(r - ringC(p, k, th)) < z) return k; } return -1; };   // (its winding asked only of what is near the ring at all: most things are not)
const offWay = (p, r, th, R) => { const k = zoneOf(p, r, th, R); if (k < 0) return r; const c = ringC(p, k, th), w = clrOf(p, k) / R, d = r - c, a = Math.abs(d); return c + (d < 0 ? -1 : 1) * (w + (a * (ZONE - 1)) / ZONE); };
const backOn = (p, r, th, R) => { const k = zoneOf(p, r, th, R); if (k < 0) return r; const c = ringC(p, k, th), w = clrOf(p, k) / R, d = r - c, a = Math.abs(d); return c + (d < 0 ? -1 : 1) * Math.max(0, a - w) * (ZONE / (ZONE - 1)); };
/** Where a point of plot p's lattice (fi, fj: 0 … 1000 each way) lies on the land: into out, [x, z]. */
const landInto = (p, fi, fj, out) => { diskInto((fi / SIDE) * 2 - 1, (fj / SIDE) * 2 - 1, out); const dx = out[0], dz = out[1], th = turnOf(p, Math.atan2(dz, dx) / TAU), R = reachOf(p, th), r = offWay(p, Math.hypot(dx, dz), th, R) * R; out[0] = p.x + Math.cos(th) * r; out[1] = p.z + Math.sin(th) * r; return out; };
const toLand = (p, fi, fj) => [...landInto(p, fi, fj, new Float64Array(2))];
/** And the lattice point of a place on the land (outside the plot: beyond 0 … 1000): into out, [fi, fj]. */
const latticeInto = (p, x, z, out) => { const dx = x - p.x, dz = z - p.z, th = ((Math.atan2(dz, dx) % TAU) + TAU) % TAU, R = reachOf(p, th); let phi = shareOf(p, th) * TAU; if (phi > Math.PI) phi -= TAU; squareInto(backOn(p, Math.hypot(dx, dz) / R, th, R), phi, out); out[0] = ((out[0] + 1) / 2) * SIDE; out[1] = ((out[1] + 1) / 2) * SIDE; return out; };
/** Where share u (0 … 1 round) of way k of plot p lies, o metres further out (the same on the GPU: wayPos): into out. */
const wayInto = (p, k, o, u, out) => { const t = (((u % 1) + 1) % 1) * RAYS, i0 = Math.min(RAYS - 1, Math.floor(t)), th = p.PH[i0] + (p.PH[i0 + 1] - p.PH[i0]) * (t - i0), r = reachOf(p, th) * ringC(p, k, th) + o; out[0] = p.x + Math.cos(th) * r; out[1] = p.z + Math.sin(th) * r; return out; };
const wayAtJS = (p, k, o, u) => [...wayInto(p, k, o, u, new Float64Array(2))];

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
/** What stands in cell (i, j) of plot p, into a block b's own arrays at n (b.X, b.Z: where; b.K its kind; b.S its size). */
const standInto = (p, i, j, sizes, b, n) => {
  const c = (p.i << BITS) + i, k = kindAt(p, i, j); landInto(p, i + 0.15 + 0.7 * cellRnd(c, j, 905), j + 0.15 + 0.7 * cellRnd(c, j, 906), FOLD);
  b.X[n] = FOLD[0]; b.Z[n] = FOLD[1]; b.K[n] = k; b.S[n] = Math.min(SMAX, Math.max(SMIN, sizes[k] * (0.8 + 0.4 * cellRnd(c, j, 903)) * p.k));
};
const FOLD = new Float64Array(2);   // (what the fold of one place gives: [x, z])
/** The same as numbers of its own: { x, z, k, s } (what a look at it asks: window.__stress). */
const standsAt = (p, i, j, sizes) => { const b = { X: [0], Z: [0], K: [0], S: [0] }; standInto(p, i, j, sizes, b, 0); return { x: b.X[0], z: b.Z[0], k: b.K[0], s: b.S[0] }; };
// a mover's own numbers: which herd it is of (its column of the plot's movers: a herd has as many columns as its
// share), of which of the herd's kinds, its size; its group's lane (its row of the plot's movers: a rep of the group's
// file) and its place in it (its column's place in the file), the lane's pace and way round. As numbers, MF a mover, in a
// plot's own array (moversOf): no mover is a thing of its own on the page (ten thousand a plot near)
const MOVER = ['herd', 'v', 's', 'kind', 'fly', 'phase', 'pace', 'g0', 'lane', 'way', 'Ln', 'dir', 'u0', 'o', 'du'], MF = MOVER.length;   // (its numbers, in this order)
const [HERD, V, SZ, KIND, FLY, PHASE, PACE, G0, LANE, WAY, LN, DIR, U0, OFS, DU] = MOVER.map((_, n) => n);
const moverInto = (p, i, j, F, m) => {
  const c = (p.i << BITS) + i, h = (s) => cellRnd(c, j, s), h3 = h(923), h4 = h(924), h5 = h(925), h6 = h(926);
  let r = 0; while (r < HERDS.length - 1 && (i + 0.5) / MSIDE >= HERDS[r].upTo) r++;
  const G = HERDS[r], Y = LAY.herds[r], C = LAY.cols[i], Gp = LAY.groups[C.g]; let l = 0; while (l < LANES - 1 && j >= Gp.starts[l + 1]) l++;
  const La = Gp.lanes[l], n = Math.max(1, Gp.starts[l + 1] - Gp.starts[l]), Ln = RING[La.k].rho * p.Lc;
  const v = (Gp.lo + (Gp.hi - Gp.lo) * cellRnd(p.i, C.g * 16 + l, 931)) * p.q, s = (G.size[0] + (G.size[1] - G.size[0]) * h3) * p.q, o = m * MF;
  F[o + HERD] = r; F[o + V] = v; F[o + SZ] = s; F[o + KIND] = G.first + Math.min(G.count - 1, Math.floor(h(940) * G.count)); F[o + FLY] = (Y.air ? Math.max(LAY.airLow, G.fly[0] + (G.fly[1] - G.fly[0]) * h4) : 0) * p.q;
  F[o + PHASE] = h5 * TAU; F[o + PACE] = Math.max(1, Math.floor(v / (s * G.stride) / ((TAU * 20) / WRAP) + 0.5)) * ((TAU * 20) / WRAP); F[o + G0] = h6 * TAU * 20;
  F[o + LANE] = C.g * LANES + l; F[o + WAY] = La.k; F[o + LN] = Ln; F[o + DIR] = La.dir; F[o + U0] = (j - Gp.starts[l] + C.off / Gp.span) / n; F[o + OFS] = La.off * p.q; F[o + DU] = ((s * Y.fore) / Ln) * La.dir;
};
// The detour: a mover the walker stands before (on the ground, within its length and a little ahead or behind, across
// its lane less than half its width and his own) steps aside of him, as far as it must, and back again once past.
// Nothing remembered: a function of where he is and where its lane has it (the same on the GPU: nominal). Into out[0, 1].
const detourInto = (F, o, x, z, yaw, out) => {
  const Y = LAY.herds[F[o + HERD]], s = F[o + SZ]; out[0] = x; out[1] = z;
  if (Y.air || U.uDy.value > 1) return;
  const tx = Math.cos(yaw), tz = Math.sin(yaw), dx = x - U.uCam.value.x, dz = z - U.uCam.value.z, al = dx * tx + dz * tz, ac = -dx * tz + dz * tx, hl = s * Y.fore, need = s * Y.side + 0.75 - Math.abs(ac);
  if (need <= 0) return;
  const e = Math.min(1, Math.max(0, (Math.abs(al) - hl - 0.5) / 2.5)), k = need * (1 - e * e * (3 - 2 * e)) * (ac < 0 ? -1 : 1);
  out[0] = x - tz * k; out[1] = z + tx * k;
};
/** Where mover m of plot p (F: its movers' numbers) is at t seconds, into out: [x, z, the way it faces]. Its two ends on
    its lane, its middle between them; stepped round the walker. */
const AT_A = new Float64Array(2), AT_B = new Float64Array(2);
const moverAtInto = (p, F, m, t, out) => {
  const o = m * MF, u = F[o + U0] + (F[o + DIR] * F[o + V] * t) / F[o + LN];
  wayInto(p, F[o + WAY], F[o + OFS], u - F[o + DU], AT_A); wayInto(p, F[o + WAY], F[o + OFS], u + F[o + DU], AT_B);
  const yaw = Math.atan2(AT_B[1] - AT_A[1], AT_B[0] - AT_A[0]); detourInto(F, o, (AT_A[0] + AT_B[0]) / 2, (AT_A[1] + AT_B[1]) / 2, yaw, out); out[2] = yaw; return out;
};
// A plot's movers by lane, each lane's in the order they go round: what asks which of them are near a place looks at the
// lanes that pass near it, and of those at the stretch that is passing now (all of a lane go at one pace: where each is
// now is where it began, moved on by as much). Ten thousand reckoned for every look was a late frame, three times a second.
const lanesOf = (p) => (p.lanes ||= (() => {
  const F = p.mv.F, n = p.mv.n, by = new Map();
  for (let m = 0; m < n; m++) { const o = m * MF; let L = by.get(F[o + LANE]); if (!L) by.set(F[o + LANE], (L = { ring: F[o + WAY], dir: F[o + DIR], v: F[o + V], Ln: F[o + LN], all: [] })); L.all.push(m); }
  for (const L of by.values()) { L.all.sort((a, b) => F[a * MF + U0] - F[b * MF + U0]); L.list = Uint32Array.from(L.all); L.u0 = Float64Array.from(L.all, (m) => F[m * MF + U0]); L.maxS = L.all.reduce((x, m) => Math.max(x, F[m * MF + SZ]), 0); delete L.all; }
  return [...by.values()];
})());
// (a direction's share of the way round a plot: PH the other way)
const arcOf = (p, th) => { th = ((th % TAU) + TAU) % TAU; let lo = 0, hi = RAYS; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.PH[m] <= th) lo = m; else hi = m; } return (lo + (th - p.PH[lo]) / Math.max(1e-9, p.PH[lo + 1] - p.PH[lo])) / RAYS; };
function moversNear(p, x, z, reach, t, fn) {
  const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz), th = Math.atan2(dz, dx);
  for (const L of lanesOf(p)) laneNear(p, L, l, th, reach, t, fn);
}
/** Of lane L of plot p, the movers on the stretch near a place l metres from the plot's middle in direction th:
    fn(m) each (moversNear's, a lane at a time: a paced look's piece). */
function laneNear(p, L, l, th, reach, t, fn) {
  // (reach: metres, or what a lane's is: a lane of small things is looked at less far)
  const far = (typeof reach === 'function' ? reach(L) : reach) + 12, G = RING[L.ring], r0 = Math.max(1, (G.rho - G.MA) * p.least - 8), r1 = (G.rho + G.MA) * p.most + 8;
  if (r0 > l + far || r1 < l - far) return;   // (its way lies wholly further in, or further out, than that)
  // how far round from the place's direction a point of the way can be and still be that near: two points so far
  // apart in direction, at these distances from the middle, are at least 2·sqrt(l·r)·sin(half the angle) apart
  const sh = far / (2 * Math.sqrt(Math.max(1e-6, l * r0))), A = L.u0, n = A.length;
  if (sh >= 0.999) { for (let k = 0; k < L.list.length; k++) fn(L.list[k]); return; }
  const ph = 2 * Math.asin(sh), ua = arcOf(p, th - ph), span = (((arcOf(p, th + ph) - ua) % 1) + 1) % 1, from = (((ua - (L.dir * L.v * t) / L.Ln) % 1) + 1) % 1;   // that stretch of the way, as shares of it; where its movers began that are on it now
  let a = 0, b = n; while (a < b) { const m = (a + b) >> 1; if (A[m] < from) a = m + 1; else b = m; }
  for (let k = 0, j = a % n; k < n; k++, j = (j + 1) % n) { if ((((A[j] - from) % 1) + 1) % 1 > span) break; fn(L.list[j]); }
}
/** Its place only, to the bend of its lane: for what asks how far off it is. Into out. */
const moverNearInto = (p, F, m, t, out) => { const o = m * MF; return wayInto(p, F[o + WAY], F[o + OFS], F[o + U0] + (F[o + DIR] * F[o + V] * t) / F[o + LN], out); };
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
const plotRows = new THREE.StorageBufferAttribute(new Float32Array(PLOTS * ROW), 1), PT = storage(plotRows, 'float', PLOTS * ROW), PL = [];
const reach = (base, th) => { const t = th.div(TAU).add(1).fract().mul(RAYS), i0 = floor(t), a = uint(i0).min(uint(RAYS - 1)); return mix(PT.element(base.add(uint(4)).add(a)), PT.element(base.add(uint(4)).add(a.add(uint(1)).mod(uint(RAYS)))), t.sub(i0)); };
const middle = (base) => vec2(PT.element(base), PT.element(base.add(uint(1))));
// the stand's ways, said to the world (src/world/ways.js): a place is on a way where, in one of the NEARW plots nearest
// the camera, it lies within the lanes' half width of one of the plot's rings (and so many metres more: margin)
// (all of it one array of rows on the GPU, not four: a shader stage binds at most twelve uniform buffers, and every pass
// that asks the ways (the tiers' packing of rocks, trees, the ground) also reads the land's, the lakes' and its own; four
// arrays here took the packing of the stand past twelve and nothing drew. The rows: the NEARW nearest plots, then the
// rings' first rows, their second rows, the 64 of the nearest-ring table)
const AT_RING = NEARW, AT_RING2 = NEARW + MAXW, AT_LUT = NEARW + 2 * MAXW;
const wayRows = Array.from({ length: AT_LUT + 64 }, (_, i) => new THREE.Vector4(i < AT_RING ? -1 : i < AT_RING2 ? 9 : 0, 0, 0, 0)), WAYU = uniformArray(wayRows, 'vec4');
const NEARV = wayRows.slice(0, AT_RING), nearW = { element: (i) => WAYU.element(i) };
// the rings as the GPU reads them (filled when the lanes are laid out): [its share of the reach, half its lanes' width
// (metres), how far it winds, how many times round], [whose winding it shares, its room to its neighbours]; the ring
// nearest each sixty-fourth of the reach; how many rings there are
const ringRows = wayRows.slice(AT_RING, AT_RING2), ringRows2 = wayRows.slice(AT_RING2, AT_LUT), lutRows = wayRows.slice(AT_LUT), nWays = uniform(1);
const RINGU = { element: (k) => WAYU.element(uint(k).add(uint(AT_RING))) }, RINGU2 = { element: (k) => WAYU.element(uint(k).add(uint(AT_RING2))) }, LUTU = { element: (i) => WAYU.element(uint(i).add(uint(AT_LUT))).x };
const nearKN = (r) => LUTU.element(uint(clamp(floor(r.mul(64)), 0, 63))), candK = (k0, dk) => clamp(k0.add(dk), 0, nWays.sub(1));
// half the width way k (a float) is kept clear in a plot, metres: its row says (plotOf: p.clrs)
const clrN = (base, k) => PT.element(base.add(uint(CLRS_AT)).add(uint(k)));
// the middle of way k (a float) of a plot at direction th, of its reach: the same in JS above (ringC)
const ringCN = (plot, k, th) => { const G = RINGU.element(uint(k)); return G.x.add(G.z.mul(sin(G.w.mul(th).add(rnd(plot, int(RINGU2.element(uint(k)).x), uint(950)).mul(TAU))))); };
addWays({
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
  const kept = gpuStorage('uint', KEPT * SIDE * SIDE, "stand: where the near plots' millions stand", 'geometry').node, fillPlot = uniform(0, 'uint'), fillSlot = uniform(0, 'uint');
  const keepPass = Fn(() => {
    const i = int(instanceIndex.mod(uint(SIDE))), j = int(instanceIndex.div(uint(SIDE))), base = fillPlot.mul(uint(ROW)), cx = int(fillPlot).shiftLeft(int(BITS)).add(i);
    const d = place(base, float(i).add(rnd(cx, j, uint(905)).mul(0.7).add(0.15)), float(j).add(rnd(cx, j, uint(906)).mul(0.7).add(0.15))).sub(middle(base)).div(PT.element(base.add(uint(FAR_AT)))).mul(0.5).add(0.5).clamp(0, 1).mul(65535);
    kept.element(fillSlot.mul(uint(SIDE * SIDE)).add(instanceIndex)).assign(uint(d.x).bitOr(uint(d.y).shiftLeft(uint(16))));
  })().compute(SIDE * SIDE);
  const slots = { who: new Int32Array(KEPT).fill(-1), version: 0 };
  // (the plots nearest the camera, nearest first, and the ways told: kept lists, made once)
  const NN = Math.max(KEPT, NEARW), byNear = new Int32Array(NN), nearD = new Float64Array(NN), nearW = new Int32Array(NEARW).fill(-1);
  const inNear = (i, n) => { for (let k = 0; k < n; k++) if (byNear[k] === i) return true; return false; };
  // each frame: the KEPT plots nearest are kept; one that is not yet is given a slot (a free one, or the farthest's) and
  // filled. The nearest are found by a look at each plot into a short list kept in order: no sort of all, nothing made
  const keepNear = (cx, cz) => {
    let n = 0;
    for (const q of PL) {
      const d = Math.hypot(q.x - cx, q.z - cz) - q.most; if (n === NN && d >= nearD[NN - 1]) continue;
      let k = Math.min(n, NN - 1); while (k > 0 && nearD[k - 1] > d) { nearD[k] = nearD[k - 1]; byNear[k] = byNear[k - 1]; k--; }
      nearD[k] = d; byNear[k] = q.i; if (n < NN) n++;
    }
    // (the ways of the NEARW nearest, told to what else places things: src/world/ways.js; other plots than before: it places again)
    let same = true; for (let w = 0; w < NEARW && same; w++) { const i = w < n ? byNear[w] : -1; same = nearW.includes(i); }
    if (!same) { for (let w = 0; w < NEARW; w++) { nearW[w] = w < n ? byNear[w] : -1; NEARV[w].x = nearW[w]; } waysChanged(); }
    const kept = Math.min(n, KEPT); let p = null; for (let k = 0; k < kept && !p; k++) if (PL[byNear[k]].slot == null) p = PL[byNear[k]];
    if (!p) return;
    let at = slots.who.indexOf(-1); for (let s0 = 0; at < 0 && s0 < KEPT; s0++) if (!inNear(slots.who[s0], kept)) at = s0;
    if (at < 0) return;
    if (slots.who[at] >= 0) { const o = PL[slots.who[at]]; o.slot = null; plotRows.array[o.i * ROW + KEPT_AT] = -1; plotRows.addUpdateRange(o.i * ROW + KEPT_AT, 1); }
    slots.who[at] = p.i; p.slot = at; plotRows.array[p.i * ROW + KEPT_AT] = at; plotRows.addUpdateRange(p.i * ROW + KEPT_AT, 1); plotRows.needsUpdate = true;
    fillPlot.value = p.i; fillSlot.value = at; renderer.compute(keepPass); slots.version++; did('plot');
  };

  // how it is drawn: the one drawer (src/scatter/drawer.js): the heap of every kind's meshes, their looks and textures,
  // the levels' materials and draws, and what streams them in. Two of it: the ladder's draws every kind from the start;
  // the zoo's kinds that bring their bands are drawn by them where a band of theirs is in, as the world's rocks are
  // (bandsOf, above: its heap laid out once the world is made, from what is left, slotsOf). Here only where things
  // stand and move.
  // (the zoo's kinds' rows in the two, at the ladder's levels and at their bands, one table: the ladder's patches read
  // both, banded below, one storage buffer: heap.js heapTable)
  const NB = BANDED.reduce((n, E) => n + E.count, 0), BANDS = NB ? bandsOf() : null, ROWS = heapTable(ALL * LEVELS.length + (NB ? NB * BANDS.length : 0), 'stand: meshes');
  const D = createDrawer(scene, renderer, tex, { name: 'stand', LEVELS, SHADE, SMOOTH, skinShare: (ALL - NB) / ALL, table: ROWS, zoo: { first: 0, ALL, STAND, MOVING, lookOfKind, fingerprint } });
  const DB = NB ? createDrawer(scene, renderer, tex, { name: 'stand: bands', LEVELS: BANDS, SHADE, SMOOTH, still: true, bands: true, skinShare: NB / ALL, table: ROWS, zoo: { first: 0, ALL: NB, STAND: NB, MOVING: 0, lookOfKind, fingerprint } }) : null;
  if (DB) ready.then(() => DB.lay(slotsOf(BANDS, NB)));   // (the bands' room: what the world leaves once it is complete, never first: src/core/settle.js)
  const { H, lookOf, sizes, skins, boneRows, ask, stats, pending } = D;
  // (by which drawer a thing of the zoo's kind z, size metres, dist metres off, is drawn: by its bands where one of them
  // no finer than its size asks is in (heap.js), else by the ladder)
  const banded = (z, size, dist) => { const px = dialPxAt(pxAt(size, dist)), want = uint(0).toVar(); for (let j = 0; j < BANDS.length - 1; j++) want.addAssign(px.lessThanEqual(DB.LO.element(j)).select(uint(1), uint(0))); return z.lessThan(uint(NB)).and(heldOf(heapRow(DB.H, z, uint(0))).shiftRight(want).greaterThan(uint(0))); };
  const LADDERED = { D, LV: LEVELS, ok: (z, size, dist) => (DB ? banded(z, size, dist).not() : null), name: 'level', shade: 'shadows' };
  const BANDED_ = DB && { D: DB, LV: BANDS, ok: (z) => z.lessThan(uint(NB)), name: 'band', shade: 'band shadows' };

  const tiers = [];
  // the plots a tier may draw from: those whose land comes within `far` of the camera, and into its view
  const plotNear = (p, cx, cz, h0, far, cull) => { const d = Math.hypot(p.x - cx, p.z - cz) - p.most; return d < far && (cull === false || boxIn(p.x - p.most - cull, p.x + p.most + cull, h0 - 400, h0 + 400, p.z - p.most - cull, p.z + p.most + cull)); };

  // a tier: level i of every kind; shadow: all of it round the camera, whatever its size on screen, for the light only.
  // The drawer's (drawer.js: tier): it tests whether a thing is of the level and drops it into the level's draws; here
  // only where a thing stands. Its patches are blocks of P by P cells of a plot's lattice: chosen each frame from the
  // plots near (select, below)
  const tier = (W, i, shadow = false) => {   // (W: its drawer, its levels, and which of the zoo's kinds are its: LADDERED, BANDED_)
    const P = shadow ? 8 : W.LV[i].P, round = uniform(SMAX / 2 + (CELL * P) / 16 + 2);
    const place = (c, { band, whole, all }, found) => {
      const plot = plotOfCell(c), ci = inPlot(c), cj = c.y, base = uint(plot).mul(uint(ROW)), h = (s) => rnd(c.x, c.y, uint(s));
      // (where it stands: kept for its plot, above; a plot not kept yet has nothing to show)
      const slot = PT.element(base.add(uint(KEPT_AT))), u = kept.element(uint(slot.max(0)).mul(uint(SIDE * SIDE)).add(uint(cj.mul(int(SIDE)).add(ci))));
      const pos = middle(base).add(vec2(float(u.bitAnd(uint(0xffff))), float(u.shiftRight(uint(16)))).div(65535).mul(2).sub(1).mul(PT.element(base.add(uint(FAR_AT))))), dist = camDist(pos), range = mix(dist, length(pos.sub(U.uCam.xz)), all);
      If(slot.greaterThan(-0.5).and(range.lessThan(band.far)).and(range.greaterThanEqual(band.near)).and(whole.or(inView(pos, round, SMAX))), () => {
        // its kind: its group of rows holds every kind once (groupOf, above)
        const g = cj.div(int(GROUP)), r4 = int(floor(rnd(plot, g, uint(902)).mul(4))), a = int(floor(rnd(plot, g, uint(901)).mul(KINDS / 10))).mul(10).add(1).add(r4.mul(2)).add(r4.greaterThanEqual(2).select(int(2), int(0)));
        const kind = uint(ci.add(cj.mod(int(GROUP)).mul(int(SIDE))).mul(a).add(int(floor(rnd(plot, g, uint(904)).mul(KINDS)))).mod(int(KINDS)).add(plot.mul(int(OFF))).mod(int(STAND))), size = clamp(lookOf(kind, 3).w.mul(h(903).mul(0.4).add(0.8)).mul(PT.element(base.add(uint(3)))), SMIN, SMAX), ok = W.ok(kind, size, dist);   // (its kind of the zoo's, its size by its look; whether its tier's drawer draws it: W)
        If(ok ?? true, () => {
          found(kind, size, dist, (A, B) => {
            A.assign(vec4(pos, groundAt(pos, float(0)).sub(size.mul(0.06)), size));
            B.assign(vec4(h(907).mul(TAU), float(kind), lookOf(kind, 2).w, h(908).mul(TAU)));   // (its turn, its kind, how far it sways, its sway's phase)
          });
        });
      });
    };
    const T = W.D.tier(i, { cell: CELL, P, cap: shadow ? 8192 : W.LV[i].cap, sizes: [SMIN, SMAX], place, shadow, fade: FADE, thing: 'stand', own: true });   // (own: its plots are its patches, below)   // (thing: a thing's own state, by its cell of its plot's lattice: src/world/things.js)
    // its patches: of each plot near, the blocks of its lattice that lie in the tier's band of distances and in view
    // (where a block lies: its middle through toLand; a block near the camera is found by the camera's own lattice point)
    // (where a block's middle lies on the land: folded once, kept; a tier asks it of thousands of blocks a frame)
    // (and how far its things lie from there: its corners through the same fold, so a block that lies across a way reaches over it)
    const middles = new Map(), SEL = new Float64Array(2), middleOf = (p, bi, bj) => {
      const key = (p.i * 512 + bi) * 512 + bj; let c = middles.get(key);
      if (!c) { if (middles.size > 40000) middles.clear(); const [x, z] = toLand(p, (bi + 0.5) * P, (bj + 0.5) * P); let r = 0; for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const [X, Z] = toLand(p, (bi + a) * P, (bj + b) * P); r = Math.max(r, Math.hypot(X - x, Z - z)); } middles.set(key, (c = [x, z, r * 1.1 + 1.5])); }
      return c;
    };
    T.select = (cx, cz, h0, s, dy) => {
      const far0 = shadow ? Math.min(SHADE.far * SHADE.wide, T.far + Math.abs(dy) * 1.2) : T.far * s, far2 = far0 * far0 - dy * dy, near2 = T.near * T.near * s * s - dy * dy, list = T.list; let n = 0; T.over = false;
      if (far2 > 0) for (const p of PL) {
        if (!plotNear(p, cx, cz, h0, Math.sqrt(far2), shadow ? false : 0)) continue;
        latticeInto(p, cx, cz, SEL); const far = Math.sqrt(far2), fi = SEL[0], fj = SEL[1], rl = (far + 2 * p.clrMax) / p.narrow + P, nb = SIDE / P;
        const i0 = Math.max(0, Math.floor((fi - rl) / P)), i1 = Math.min(nb - 1, Math.floor((fi + rl) / P)), j0 = Math.max(0, Math.floor((fj - rl) / P)), j1 = Math.min(nb - 1, Math.floor((fj + rl) / P));
        for (let bj = j0; bj <= j1; bj++) for (let bi = i0; bi <= i1; bi++) {
          const mid = middleOf(p, bi, bj), x = mid[0], z = mid[1], rad = mid[2], d = Math.hypot(x - cx, z - cz);
          if (d - rad > far || (near2 > 0 && d + rad < Math.sqrt(near2))) continue;
          const yb = 0.32 * d + 0.2 * rad + 8, c = shadow ? SHADE.reach : 0;
          if (!boxIn(x - rad - c, x + rad + c, h0 - yb, h0 + yb + c + SMAX, z - rad - c, z + rad + c)) continue;
          if (n === MAXP) { T.over = true; continue; }
          list[n++].set((p.i << BITS) + bi * P, bj * P);
        }
      }
      T.n = n; for (const m of T.meshes) m.visible = n > 0;
    };
    T.viewKeyed = !shadow; T.asset = shadow ? `Stress: ${W.shade}` : `Stress: ${W.name} ${i}`; T.bands = W === BANDED_;
    const run = T.run.bind(T); T.run = (r, world, ...a) => run(r, `${world}|${slots.version}`, ...a);   // packed again when other plots' places are kept (and when the heap has changed: the drawer's)
    tiers.push(T);
    return T;
  };
  for (let i = 0; i < L; i++) tier(LADDERED, i);
  tier(LADDERED, SHADE.level, true);
  if (BANDED_) { BANDS.forEach((_, l) => tier(BANDED_, l)); tier(BANDED_, BANDS.findIndex((_, l) => ladderOf(l ? surfacePx(l - 1) : Infinity) === SHADE.level), true); }   // (its shade: the band of the ladder's shadow level's sizes)

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
    for (let i = 0; i < 64; i++) { let best = 0; RING.forEach((G, k) => { if (Math.abs(G.rho - (i + 0.5) / 64) < Math.abs(RING[best].rho - (i + 0.5) / 64)) best = k; }); LUT[i] = best; lutRows[i].x = best; }
    Y.cols.forEach((C, i) => colRows[i].set(C.g, C.off, 0, 0));
    Y.groups.forEach((Gp, g) => { grpRows[g].set(Gp.lo, Gp.hi, Gp.span, 0); Gp.lanes.forEach((La, l) => laneRows[g * LANES + l].set(La.k, La.off, La.dir, Gp.starts[l])); });
  };
  if (HERDS.length) {
    const far = uniform(MFAR), round = uniform(MMAX);
    // where a mover is now (and all that says what it is): the same in JS above (moverInto, moverAtInto, detourInto)
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
    // each mover, as the drawer's one tier of every level packs it (drawer.js tierAll: the level its size asks for, the
    // finest that is there; packed every frame, drawn on its bones)
    const place = (c, part, found) => {
      const { h, h4, h5, h6, v, S, t, q, pos: at, yaw, I1, I2 } = nominal(c), pos = vec2(at).toVar();
      const dist = camDist(pos);
      If(dist.lessThan(far).and(inView(pos, round, MMAX)), () => {
        const kind = uint(I2.x.add(floor(h(940).mul(I2.y)).min(I2.y.sub(1))));
        found(kind, S, dist, (A, B) => {
          // (what flies: so high over the ground, rising and falling a little)
          const up = I1.z.greaterThan(0.01).select(max(mix(I1.y, I1.z, h4), airLow), float(0)).mul(q).mul(sin(t.mul(0.4).add(h5.mul(TAU))).mul(0.15).add(1));   // (no lower than the tallest that drives under it)
          // its stride: how far it has come, in radians of its gait (its herd's stride: that much of its size a radian). From a
          // clock that begins again every WRAP seconds (a stride counted from the page's start would lose its
          // fineness in an hour); its pace is made to fit that clock, so no leg jumps when it does
          const step = (TAU * 20) / WRAP, pace = floor(v.div(S.mul(I1.w)).div(step).add(0.5)).max(1).mul(step);
          A.assign(vec4(pos, groundAt(pos, float(0)).add(up), S));
          B.assign(vec4(yaw, float(kind), pace.mul(strideT).add(h6.mul(TAU * 20)), h5.mul(TAU)));   // (its turn, its kind, its stride's clock, its seed: row.js)
        });
      });
    };
    const T = D.tierAll({ cell: CELL * 10, P: MSIDE, cap: MCAP, sizes: [SMIN, MMAX], place, casts: true, far: MFAR, moving: true });
    T.band = () => { T.near = 0; T.far = MFAR; }; T.viewKeyed = true; T.asset = 'Stress: movers';
    T.select = (cx, cz, h0, s, dy) => {   // its patches: each plot near, its ten thousand
      const far2 = T.far * T.far * s * s - dy * dy; let n = 0; strideT.value = U.uTime.value % WRAP;
      if (far2 > 0) for (const p of PL) if (n < MAXP && plotNear(p, cx, cz, h0, Math.sqrt(far2), MMAX)) T.list[n++].set(p.i << BITS, 0);
      T.n = n; for (const m of T.meshes) m.visible = n > 0;
    };
    tiers.push(T);
  }

  // (how much room each herd's movers take as they move: the lanes are laid out by it, and the plots after them)
  if (MOVING) ask([['rooms']]).then(([rooms]) => laid(layOut(rooms))); else laid(layOut([]));
  // what the CPU knows of what stands near: a block of a plot's lattice (BL cells a side) worked out when first looked
  // at, a few kept; and a plot's movers' own numbers
  const BL = 32, blocks = new Map();
  // (a block of a plot's lattice, as far as it is worked out: rows of it, a row at a time as a paced look comes to it, all
  // at once where a body is asked of it now (must); and where it lies, as far as it is. Kept while a look of the last two
  // looked at it or a body was asked of it (used: the look it was last of): what is near, by need, let go once passed)
  let looks = 0;
  const blockOf = (p, bi, bj, must = false) => {
    const key = (p.i * 64 + bi) * 64 + bj; let b = blocks.get(key);
    if (!b) { b = { p, bi, bj, rows: 0, used: looks, X: new Float32Array(BL * BL), Z: new Float32Array(BL * BL), S: new Float32Array(BL * BL), K: new Uint16Array(BL * BL), x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }; blocks.set(key, b); }
    b.used = looks;
    if (must) while (b.rows < BL) rowOf(b);
    return b;
  };
  const passed = () => { looks++; for (const [key, b] of blocks) if (b.used < looks - 2) blocks.delete(key); };   // (a look done: what neither it nor the one before looked at let go)
  const rowOf = (b) => {
    const j = b.rows++, cj = b.bj * BL + j;
    for (let i = 0, n = j * BL; i < BL; i++, n++) {
      const ci = b.bi * BL + i; if (ci >= SIDE || cj >= SIDE) { b.S[n] = 0; continue; }
      standInto(b.p, ci, cj, sizes, b, n); b.x0 = Math.min(b.x0, b.X[n]); b.x1 = Math.max(b.x1, b.X[n]); b.z0 = Math.min(b.z0, b.Z[n]); b.z1 = Math.max(b.z1, b.Z[n]);
    }
  };
  // (a plot's ten thousand reckoned a part each time it is asked for, into its own numbers: all at once is a frame lost.
  // Let go again once the plot is a BAND further than the movers are looked at: kept for the plots near only)
  const moversOf = (p, most = 1500) => { const M = (p.mv ||= { n: 0, F: new Float64Array(MSIDE * MSIDE * MF) }); for (let k = 0; k < most && M.n < MSIDE * MSIDE; k++, M.n++) moverInto(p, M.n % MSIDE, Math.floor(M.n / MSIDE), M.F, M.n); return M; };
  // (both drawers: each of them, and their looks at what is near as one: the ladder's reach for both (a band's slots are
  // asked as far as the ladder's fine levels are, no further), a kind asked of the ladder, a kind with bands of its
  // bands too; null: neither looks this frame)
  const each = (f) => { f(D); if (DB) f(DB); };
  const look = () => {
    const N = D.scan(), NBs = DB?.scan(); if (!N && !NBs) return null;
    const S0 = N ?? NBs;
    return { ahead: S0.ahead, reach: S0.reach, reachAny: (sz) => Math.max(N?.reachAny(sz) ?? 0, NBs?.reachAny(sz) ?? 0), wants: (k, sz, d, own) => { N?.wants(k, sz, d, own); if (k < NB) NBs?.wants(k, sz, d, own); }, far: (k) => { N?.far(k); if (k < NB) NBs?.far(k); }, none() { N?.none(); NBs?.none(); }, done() { N?.done(); NBs?.done(); } };
  };
  // each frame: when the camera has moved, ask for the fine levels of what now
  // stands or passes near (coarser first: quick to build, and something to draw meanwhile), nearest first
  let tick = 0;
  // (the movers within sixty metres of the camera, as each look finds them, for what asks where they are: each its plot's
  // number and its own, in kept lists: what the last look found, and what the look under way is finding)
  let NEAR_P = new Int32Array(256), NEAR_M = new Int32Array(256), nearN = 0, NEXT_P = new Int32Array(256), NEXT_M = new Int32Array(256), nextN = 0; const LOOKP = new Float64Array(2), BODYP = new Float64Array(2), BODYQ = new Float64Array(3);
  const nextPush = (pi, m) => { if (nextN === NEXT_P.length) { const a = new Int32Array(2 * nextN), b = new Int32Array(2 * nextN); a.set(NEXT_P); b.set(NEXT_M); NEXT_P = a; NEXT_M = b; } NEXT_P[nextN] = pi; NEXT_M[nextN++] = m; };
  // ---- a look, paced (src/core/pace.js): each frame as much of it as fits the frame's share for what no class names
  // ('other'), by what its pieces took of the page's thread, one piece at the least: of each plot near in turn, a row of
  // one of its lattice's blocks round the camera not yet worked out, a block's things (those of them a look can ask
  // anything of at their size asked: wants; the rest within reach counted for the bands: far), then a column of its
  // movers not yet worked out, or, all there, those on the stretch near. The look is said done (its asks to the
  // workers, the movers near to what asks where they are) when the last piece is through. (2026-11-19: a look all in
  // one frame took 7.8 ms, every 0.7 m: a late frame at 60 fps) ----
  const PACED = pace(1); let job = null;
  const begin = (N, cam) => {
    const Rs = N.reach(SMAX), Rm = N.reach(MMAX), plots = [];
    for (const p of PL) { const off = Math.hypot(p.x - cam.x, p.z - cam.z) - p.most; if (off > Rm) { if (p.mv && off > Rm * BAND) { p.mv = null; p.lanes = null; } continue; } plots.push(p); }   // (its movers let go: far enough not to come back at once)
    nextN = 0;
    return { N, Rs, kany: N.reachAny(1), plots, at: 0, blocks: null, b: 0, row: 0, lanes: null, lane: 0 };
  };
  // (the blocks of plot p's lattice round the camera's own lattice point, as far as Rs reaches)
  const blocksNear = (p, cam, Rs) => {
    latticeInto(p, cam.x, cam.z, LOOKP); const fi = LOOKP[0], fj = LOOKP[1], rl = (Rs + p.clrMax) / p.narrow + 1, nb = Math.ceil(SIDE / BL), out = [];
    for (let bj = Math.max(0, Math.floor((fj - rl) / BL)); bj <= Math.min(nb - 1, Math.floor((fj + rl) / BL)); bj++) for (let bi = Math.max(0, Math.floor((fi - rl) / BL)); bi <= Math.min(nb - 1, Math.floor((fi + rl) / BL)); bi++) out.push(blockOf(p, bi, bj));
    return out;
  };
  // (row j of a block: of what stands in it within reach, what a look can ask anything of at its size, asked; the rest
  // counted for the bands. False where the block lies wholly further than that: none of it looked at)
  const lookRow = (b, j, cam, dy, J) => {
    if (!j) { const ex = Math.max(b.x0 - cam.x, 0, cam.x - b.x1), ez = Math.max(b.z0 - cam.z, 0, cam.z - b.z1); if (ex * ex + ez * ez + dy * dy >= J.Rs * J.Rs) return false; }
    for (let n = j * BL, e = n + BL; n < e; n++) {
      const sz = b.S[n]; if (!sz) continue; const d = Math.hypot(b.X[n] - cam.x, b.Z[n] - cam.z, dy); if (d >= J.Rs) continue;
      if (d < sz * J.kany) J.N.wants(b.K[n], sz, d, 0); else J.N.far(b.K[n]);
    }
    return true;
  };
  // (what passes near in plot p, a lane of it: the movers on the stretch near; those within sixty metres kept for what
  // asks where they are)
  const lookLane = (p, L, cam, dy, t, J) => {
    const F = p.mv.F, reachOfSize = J.N.reach, each = (m) => { moverNearInto(p, F, m, t, LOOKP); const o = m * MF, d = Math.hypot(LOOKP[0] - cam.x, LOOKP[1] - cam.z, dy); if (d < 60) nextPush(p.i, m); if (d < reachOfSize(F[o + SZ])) J.N.wants(F[o + KIND], F[o + SZ], d, F[o + V] * 0.35); };
    const dx = cam.x - p.x, dz = cam.z - p.z; laneNear(p, L, Math.hypot(dx, dz), Math.atan2(dz, dx), (Q) => Math.max(60, reachOfSize(Q.maxS)), t, each);
  };
  // the next piece of a look (a row, a lane: none much longer than another); false where it is through
  const piece = (J, cam, dy, t) => {
    const p = J.plots[J.at]; if (!p) return false;
    if (!J.blocks) J.blocks = J.N.ahead < J.Rs && Math.hypot(p.x - cam.x, p.z - cam.z) - p.most < J.Rs ? blocksNear(p, cam, J.Rs) : [];
    if (J.b < J.blocks.length) {
      const b = J.blocks[J.b];
      if (b.rows < BL) rowOf(b);   // (a row of it worked out)
      else if (!lookRow(b, J.row, cam, dy, J) || ++J.row === BL) { J.b++; J.row = 0; }   // (a row of it looked at)
      return true;
    }
    if (HERDS.length && !J.lanes) { if (moversOf(p, MSIDE).n === MSIDE * MSIDE) { J.lanes = lanesOf(p); J.lane = 0; } return true; }   // (a column of its movers worked out)
    if (J.lanes && J.lane < J.lanes.length) { lookLane(p, J.lanes[J.lane++], cam, dy, t, J); return true; }   // (a lane of them looked at)
    J.at++; J.blocks = null; J.b = 0; J.row = 0; J.lanes = null; return J.at < J.plots.length;
  };
  const finish = (J) => { [NEAR_P, NEXT_P] = [NEXT_P, NEAR_P]; [NEAR_M, NEXT_M] = [NEXT_M, NEAR_M]; nearN = nextN; J.N.done(); passed(); };
  const pump = () => {
    if (!PL.length) {   // the city's plan has come: its plots, to the GPU
      const cp = window.__game?.city?.plots; if (!cp?.length || !LAY) return;
      cp.slice(0, PLOTS).forEach((c, i) => { const p = plotOf(c, i); PL.push(p); plotRows.array.set([p.x, p.z, p.mean, p.k, ...p.R, ...p.TH, ...p.PH, p.q, p.Lc, p.verge, p.least, 0, 0, ...p.clrs, p.most, -1], i * ROW); });
      plotRows.addUpdateRange(0, plotRows.array.length); plotRows.needsUpdate = true;   // (all of it: a later change of one number must not be the only thing sent)
    }
    each((d) => d.start());
    if (!(tick++ & 3)) keepNear(U.uCam.value.x, U.uCam.value.z);   // (which plots are near changes slowly: asked every fourth frame)
    const cam = U.uCam.value, dy = U.uDy.value;
    if (API.pause) return;
    each((d) => d.skinsIn());
    if (!job) { const N = look(); if (!N) return; if (N.reach(MMAX) <= dy) { N.none(); return; } job = begin(N, cam); }
    PACED.tick(); did('scan');
    const t0 = performance.now(), t = U.uTime.value, share = frameShare('other'); let n = 0;
    while (job && (n === 0 || (n < PACED.left && performance.now() - t0 < share))) { n++; if (!piece(job, cam, dy, t)) { finish(job); job = null; } }   // (as many as the pace says, and no more once the share is spent: the page's own time is known as it goes)
    PACED.measured(n, performance.now() - t0, share, true);
  };
  // ---- what of it is solid (src/world/bodies.js): the things round a point, each with its kind's box and shapes (its
  // family's, beside its recipe: assets/zoo). Where they stand is reckoned here as the GPU reckons it (standsAt,
  // moverAtInto); a mover's shapes move with its bones. They stop the walker as everything solid of every world does (a
  // plot is a thicket, a thing every metre and a half, but for its ways; `?ghost`: nothing stops him); a ray finds them
  // always. `?bounds` draws them, as it draws every body round the camera ----
  // (what stands, read from the lattice's blocks as the looks keep them, a few dozen at the most: blockOf; a body made
  // only of what is within reach, each time it is asked, none kept beside them)
  addBodies((x, z, reach) => {
    const out = [], t = U.uTime.value;
    for (const p of PL) {
      if (Math.hypot(p.x - x, p.z - z) - p.most > reach) continue;
      latticeInto(p, x, z, BODYP); const fi = BODYP[0], fj = BODYP[1], rl = Math.ceil((reach + SMAX + p.clrMax) / p.narrow) + 1;
      const i0 = Math.max(0, Math.floor(fi - rl)), i1 = Math.min(SIDE - 1, Math.floor(fi + rl)), j0 = Math.max(0, Math.floor(fj - rl)), j1 = Math.min(SIDE - 1, Math.floor(fj + rl));
      if (i0 > i1 || j0 > j1) continue;
      for (let bj = Math.floor(j0 / BL); bj <= Math.floor(j1 / BL); bj++) for (let bi = Math.floor(i0 / BL); bi <= Math.floor(i1 / BL); bi++) {
        const b = blockOf(p, bi, bj, true);
        for (let j = Math.max(j0, bj * BL); j <= Math.min(j1, bj * BL + BL - 1); j++) for (let i = Math.max(i0, bi * BL); i <= Math.min(i1, bi * BL + BL - 1); i++) {
          const n = (j - bj * BL) * BL + (i - bi * BL), sz = b.S[n]; if (!sz || Math.hypot(b.X[n] - x, b.Z[n] - z) > reach + sz) continue;
          const k = b.K[n];
          out.push({ id: (p.i * SIDE + j) * SIDE + i, thing: idOf('stand', (p.i << BITS) + i, j), x: b.X[n], z: b.Z[n], y: heightAt(b.X[n], b.Z[n]) - sz * 0.06, up: 0, yaw: cellRnd((p.i << BITS) + i, j, 907) * TAU, s: sz, kind: k, body: bodyOf(k) });
        }
      }
    }
    for (let n = 0; n < nearN; n++) {
      const p = PL[NEAR_P[n]], F = p.mv?.F; if (!F) continue;
      const m = NEAR_M[n], o = m * MF, S = F[o + SZ]; moverAtInto(p, F, m, t, BODYQ); const mx = BODYQ[0], mz = BODYQ[1], yaw = BODYQ[2]; if (Math.hypot(mx - x, mz - z) > reach + S + 2) continue;
      const k = F[o + KIND], up = F[o + FLY] * (Math.sin(t * 0.4 + F[o + PHASE]) * 0.15 + 1), g = F[o + PACE] * (t % WRAP) + F[o + G0], rows = boneRows.array.subarray((k - STAND) * BONES * 12, (k - STAND + 1) * BONES * 12);
      out.push({ id: -1 - n, x: mx, z: mz, y: heightAt(mx, mz) + up, up, yaw, s: S, kind: k, body: bodyOf(k), pose: (bone, q, o2) => moved(rows, bone, g, q, o2) });
    }
    return out;
  });
  tiers.solid = () => pump();

  // for looking at it (window.__stress): how many stand in a plot and of how many kinds; what each level holds and draws now
  const API = (window.__stress = {
    heap: H, bands: DB && { heap: DB.H, levels: BANDS, stats: DB.stats, pending: DB.pending }, tiers, stats, levels: LEVELS, plots: PL, sizes, pause: false, smooth: SMOOTH, fingerprint: D.fingerprint, families: FAMILIES.map((E) => ({ id: E.id, first: E.first, count: E.count, roams: E.roams })), herds: HERDS, models: MODELS.map((M) => M.id),
    standsAt: (pi, i, j) => standsAt(PL[pi], i, j, sizes), boxOf: (k) => bodyOf(k).box, lay: () => LAY, way: (pi, k, o, u) => wayAtJS(PL[pi], k, o, u), rings: () => RING.map(({ rho, W, MA, MN, bundle, road }) => ({ rho, W, MA, MN, bundle, road })), clrOf: (pi, k) => clrOf(PL[pi], k), toLand: (pi, fi, fj) => toLand(PL[pi], fi, fj), toLattice: (pi, x, z) => [...latticeInto(PL[pi], x, z, new Float64Array(2))],
    movers: (pi, t = U.uTime.value) => { while (moversOf(PL[pi]).n < MSIDE * MSIDE); return API.moversNow(pi, t); },
    moversNow: (pi, t) => { const p = PL[pi], M = moversOf(p), F = M.F, q = new Float64Array(3); return Array.from({ length: M.n }, (_, m) => { const o = m * MF; moverAtInto(p, F, m, t, q); return { x: q[0], z: q[1], yaw: q[2], rig: HERDS[F[o + HERD]].name, herd: F[o + HERD], ring: F[o + WAY], s: F[o + SZ], v: F[o + V], kind: F[o + KIND], fly: F[o + FLY] }; }); },
    /** Of plot pi's movers within `reach` metres of a place at t: how many there are (every one asked), and how many of those the look by lanes finds (moversNear: the two must agree). */
    nearCheck: (pi, x, z, reach, t = U.uTime.value) => { const p = PL[pi], M = moversOf(p); while (M.n < MSIDE * MSIDE) moversOf(p); const q = new Float64Array(2), within = (m) => { moverNearInto(p, M.F, m, t, q); return Math.hypot(q[0] - x, q[1] - z) < reach; }, all = []; for (let m = 0; m < M.n; m++) if (within(m)) all.push(m); const got = new Set(); let looked = 0; moversNear(p, x, z, reach, t, (m) => { looked++; if (within(m)) got.add(m); }); return { within: all.length, found: all.filter((m) => got.has(m)).length, looked }; },
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
        const full = !T.bands && LEVELS[T.level].n === FULLN, count = B.reduce((x, b) => x + b.count, 0); let tris = 0;
        if (T.bands) for (const b of B) for (let j = 0; j < b.count; j++) tris += DB.H.count(b.data[1][j * 4 + 1], T.level) / 3;   // (a band's: all its clusters', what the rule draws of them no more)
        else if (full) for (const b of B) for (let j = 0; j < b.count; j++) tris += fullTris(b.data[1][j * 4 + 1]); else tris = count * trisOf(LEVELS[T.level].n);
        out.push({ tier: T.asset, packed: count, tris, patches: T.n, over: T.over, shaped: T.shaped >= 0 ? B[T.shaped].count : 0 });
      }
      return { tiers: out, held: H.held(), skinsHeld: skins.who.filter((x) => x >= 0).length, pending: pending.size, ...stats, heapMB: +(H.bytes / 1048576).toFixed(1) };
    },
  });
  return tiers;
}

/** A scatter engine (src/scatter/index.js loads it where `?stress` asks): it places no asset of the library, only its own. */
export const engine = {
  id: 'stress',
  createOwn: (scene, tex, ground, gpu, renderer) => (gpu ? createStress(scene, renderer, tex) : []),
};
