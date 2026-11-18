// The one drawer: how every kind of thing that stands or moves is drawn, whoever says where it is. A kind's meshes lie
// in a heap on the GPU (heap.js), its look in a row of numbers, its own texture in a layer of one array; a level of
// every kind is one draw (and one more for what is of the level's own shape, one for what is cut out as leaves), in one
// shader whose shading models are branches (src/shading); the fine levels and the textures come as things come near,
// made by the kinds' recipes in workers and kept in the browser.
//
// Who places things says where they stand and what is near; the drawer makes the tiers they are drawn by. Five place
// by it today, each with drawers of its own kinds: the stress stand (src/scatter/stress.js: a plot's lattice and its
// lanes, the test herds), the world's rocks (src/scatter/rocks.js), its plants (src/scatter/trees.js), the list of
// what stands at a spot of its own (src/scatter/placed.js: the tent, the fire pit; a city's buildings; intent 0029)
// and the herds that roam the meadow (src/scatter/herds.js, `?herds=N`). Every placer packs a thing the one way
// (row.js: A its place, foot and size in metres, B its turn, kind, motion and seed). Every thing it packs may have a
// state of its own (src/world/things.js: gone, grown; tinted and worn where a drawer is made with `state`), looked up
// by its placer's name and its cell (`thing`) or a key its placer gives, and a seed of its own (B.w) its look may
// differ by:
//   createDrawer(scene, renderer, tex, { name, LEVELS, SHADE, SMOOTH, ghost, skins, ground, soft, relief, make, state, zoo }) ->
//     tier(level, { cell, P, cap, sizes, place, shadow, casts, far, thing }) -> that level's tier (tier.js) for a placer:
//                               `place` is the placer's node code for a cell (where a thing stands in it, of which
//                               kind, how large); the drawer tests whether it is of the level and drops it into the
//                               level's draws. A tier a level: for a placer of millions (the stand), whose cells
//                               are too many to look at again as the camera moves
//     tierAll({ cell, P, cap, sizes, place, casts, far, last, thing, moving }) -> one tier for every level: each thing
//                               dropped into the draw of the level its size asks for, packed again whenever the camera
//                               has moved half a metre (moving: every frame, drawn on its skeleton: the movers, the
//                               herds). For a placer of few cells (the rocks): one packing shader, not eight
//     H, LO, lookOf(kind, row), numOf(kind, row), look, lookRows, sizes     the heap, the levels' pixels, a kind's look
//                               and its make's own numbers (the one table of a kind's numbers), as nodes and as numbers
//     meshOf(src, level, shadow, moving, foliage, shared), dot(src)     a level's material (tier.js: material(src, k))
//     drawOf(level), drawShaped(level), shapeOf     a level's draw: by corners looked up, or by the level's own list
//     ask(jobs)                 the recipes' workers (one set for every drawer)
//     start()                   each frame until the coarse levels are in (read back from the browser, or built)
//     skinsIn()                 each frame: the textures that have come, into their layers
//     scan(extra) -> null, or { reach(size), wants(kind, size, distance, own), none(), done(), ahead }
//                               once a frame: a look at what stands or passes near, when the camera has moved (or
//                               the lens, the governor or `extra`): ask for the levels and textures it is large
//                               enough on screen for now, and will still be when they have come
//     near(inv, ahead)          the same look, asked for outright
//     waiting(held)             how much of it is still out (src/core/settle.js: the world complete), below
//     stats, pending, skins, boneRows (the movers' skeletons, as numbers), fingerprint
// What a drawer's kinds may be is said when it is made, so a drawer whose kinds need none of it carries none of it in
// its shader: skins (how many kinds' own textures it holds at once; 0: none, its kinds wear the world's materials),
// ground (its kinds may wear a material of the world and be grown over in the colour of the ground round them: a tier
// then packs a third row, that colour and how dry the land is there), soft (the shadows that fall on it are read
// softly: large, still things), relief (the size on screen from which a thing's relief is read).
// A second make of vertex has none of the above at all: `make` (the plants': src/scatter/trees.js; the made things':
// src/scatter/placed.js) brings its own material, its vertices so many elements each; the drawer keeps their meshes,
// fills and streams them, and makes their tiers, as for any kind; where it asks (`dot`), its last level is the dot.
// Its LEVELS say their own sizes on screen and their own rooms (not the ladder's). A make's level is drawn a kind a
// draw while its kinds are few: each mesh's own list of corners that draw's index, a vertex shared by several triangles
// worked out once and no draw longer than its mesh (one draw as long as the largest for all ran four million vertices a
// frame in the wood where its plants have one and a half). Of many kinds (hundreds of species, a city's buildings) a
// level is drawn in a few draws by the size of its meshes (CLASSED, below): what a new species costs is its bytes.
// It was the stress stand's own until 2026-11-14: lifted out that day, and the world's rocks drawn by it since.
import * as THREE from 'three/webgpu';
import { Fn, If, float, uint, vec2, vec3, vec4, uniform, uniformArray, varyingProperty, storage, texture, vertexIndex, instanceIndex, cameraViewMatrix, screenCoordinate, dFdx, dFdy, cos, sin, abs, max, pow, mix, cross, length, normalize, smoothstep, clamp, fract, countLeadingZeros } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { ign, finish, skyLight, cloudAt, cloudAtOne, cloudShade, sunDim, unlit, weatherOn, snowLift, snowDepth, SNOW, windAt, windStrength } from '../world/light.js';
import { passOf, cut, motion, vWas } from '../core/pass.js';
import { landPages } from '../terrain/pages.js';
import { SOIL_RELIEF } from '../world/physics.js';
import { Tier, offScreen, clipOf } from './tier.js';
import { createHeap, heapRow, heapElem, heldOf, sinceCame, effective, cornersOf, shapedOf } from './heap.js';
import { ballCorners } from '../../assets/kit/blob.js';
import { solidOf } from './solid.js';
import { GHOST as GHOSTING } from '../world/bodies.js';   // (`?ghost`: the walker passes through everything, in every world, and what he is inside draws back from his eye)
import { LADDER, FULLN, DOTN, roomOf, underOf, trisOf, vertsOf } from '../../assets/kit/ladder.js';
import { dotMesh, BONES } from '../../assets/kit/solid.js';
import { bodyOf } from '../../assets/zoo/index.js';
import { CHAIN } from '../../assets/kit/bones.js';
import { MODELS, modelOf } from '../shading/index.js';
import { byRole } from '../core/registry.js';
import { bandOf, padOf } from '../detail/handover.js';
import { dialK, pxKMost, pxOn, farFor, farMost, spanAt, pxAt, dialPxAt, TRUTH } from '../detail/measure.js';
import { source } from '../core/settle.js';
import { asking } from '../core/workers.js';
import { note } from '../core/gpu.js';
import { keptGet, keptPut } from '../core/kept.js';
import { did } from '../core/work.js';
import { stateAt, keyN, nameKey } from '../world/things.js';
import { pxOf, turnOf, seedOf } from './row.js';
import { createCut, clusterOf, levelHead, allowedAt, eased, ruleOf } from './cut.js';
import { MARGIN } from './regions.js';
import { camDist } from '../world/land.nodes.js';
import { surfaceBand, BAND, GONE, dialPx } from '../detail/error.js';

const GROW = 1.5, SKIN = 128, SKINPX = 28, SINK = BAND, LOOK = 24;   // GROW: seconds a level that came late takes to grow out of the coarser one; SKIN: a kind's own texture, pixels a side; SKINPX: the size on screen from which a thing wears it (the stress world's zoo: 8b); SINK: how far over where it is gone a dot sinks away (the one hand-over, src/detail/error.js); LOOK: a kind's look, numbers (six rows of four)
// a make's levels: a kind a draw up to BYKIND kinds, else by the size of their meshes (classOf: the power of two of
// triangles a mesh of n corners fits in; classN the same as a node; classIndex: the corners of a class's draw, 0 … 3 · 2^c - 1)
const BYKIND = 32;
/** Whether a drawer's kinds' boxes are measured on their meshes as they come (a solid's: assets/kit/solid.js solidBox;
    a make that measures its own: MAKE.boxOf, the plants'), not said at the start (createDrawer kindBox). */
const measured = (SOLID, MAKE) => SOLID || !!MAKE.boxOf;
/** How much a kind's box is grown, of its size, for what may move a thing past it (createDrawer GROWN): a solid's little,
    a box said or measured of a make's kinds more, one taken from a kind's height most. */
const grownOf = (SOLID, MAKE) => (SOLID ? 0.02 : MAKE?.box || MAKE?.boxOf ? 0.05 : 0.3);
const classOf = (n) => { const t = Math.ceil(n / 3); return t <= 1 ? 0 : 32 - Math.clz32(t - 1); }, classN = (n) => uint(32).sub(countLeadingZeros(n.add(uint(2)).div(uint(3)).sub(uint(1))));
const CLASSIX = []; const classIndex = (c) => (CLASSIX[c] ||= new THREE.BufferAttribute(Uint32Array.from({ length: 3 * 2 ** c }, (_, j) => j), 1));
// the recipes' workers (recipes.worker.js, watched: src/core/workers.js): one set for every drawer, made when the first
// asks; all(jobs) tells every one of them, before anything asked after it
let POOL = null;
const pool = () => (POOL ||= (() => {
  const workers = Array.from({ length: 3 }, () => asking(new Worker(new URL('./recipes.worker.js', import.meta.url), { type: 'module' }), "the recipes' worker")); let turn = 0;
  const ask = (jobs) => workers[turn++ % workers.length]({ jobs }).then(({ out }) => out);
  ask.all = (jobs) => { for (const w of workers) w.worker.postMessage({ id: -1, jobs }); };
  return ask;
})());

/** name: its own (the ledger's, and what the browser keeps its coarse meshes under); LEVELS: the levels, finest first
    (the ladder's n and px, and of each: slots); SHADE: what casts the shadows (its shrink); SMOOTH: a uniform
    (whether levels turn into each other; the lens is the world's one, U.uPxK); ghost: a thing draws back from an eye inside it;
    skins, ground, soft, relief: what its kinds may be (above); full: the most squares an edge a full mesh of its kinds
    has (none: the ladder's most: a slot of the heap is as large as that); thin: [lo, hi] (intent 0033): no
    dot, a thing's last mesh thins away pixel by pixel from hi pixels on screen down to lo, its shadow with it; still: its
    kinds stand on no skeleton and their vertices carry their coarse normal and shade finely (assets/kit/solid.js);
    zoo: its kinds ({ first (the zoo's number
    of its first kind), ALL, STAND, MOVING, lookOfKind (of its k-th kind), fingerprint }: assets/zoo). */
export function createDrawer(scene, renderer, tex, { name = 'stand', LEVELS, SHADE, SMOOTH, ghost: GHOST = GHOSTING, corners: CORNERS = false, skins: SKINSMAX = 1024, ground: GROUND = false, soft: SOFT = false, relief: RELIEF = 90, full: FULLMOST = 0, make: MAKE = null, state: STATE = false, thin: THIN = null, still: STILL = false, zoo: { first = 0, kinds: KINDS = null, ALL, STAND = ALL, MOVING = 0, lookOfKind, fingerprint } }) {
  // MAKE: another make of vertex than the solids' ({ per: elements a vertex, flat: its meshes' corners are their
  // vertices in order (none shared: drawn by class, no corner is looked up), material(src, level, shadow, at): its
  // material (at(R): where a draw's vertex lies in the heap, and whether it is drawn), dot: its last level is the drawer's
  // dot, here(OWN): it makes its coarse levels itself, numbers: its kinds' own numbers, { rows, of(k) }, kept after their
  // looks in the one table: numOf, tell: jobs every recipes' worker is told first, what its kinds are made by that a
  // worker cannot read itself: the plants' stands, src/scatter/trees.js }): no textures of its own; a look and a dot
  // only where it says (its kinds' looks then say the dot's colour: a made thing's, src/scatter/placed.js).
  // KINDS: the zoo's numbers of its kinds, where they are not one after another from `first`
  // BANDED: its kinds are surfaces, each level some clusters of its hierarchy (src/scatter/cut.js), level 0 their cut;
  // none of it a dot
  const SOLID = !MAKE, BANDED = SOLID && !!LEVELS[0].band, DOT = (SOLID && !BANDED) || !!MAKE?.dot, NL = SOLID || DOT ? ALL : 0, kindNo = (k) => (KINDS ? KINDS[k] : first + k);
  // A make's own levels are drawn a kind a draw while its kinds are few (BYKIND): each mesh's own list of corners its
  // draw's index, no vertex worked out for nothing. Of more kinds (hundreds of species, a city of buildings), a level is
  // drawn in a few draws by the size of its meshes (CLASSED): a draw for each power of two of triangles, each thing
  // drawn as long as its class (at most twice its own), its corners looked up in the heap where its make shares vertices
  // between them.
  const CLASSED = !!MAKE && ALL > BYKIND, CORNERED = CLASSED && !MAKE.flat;   // CORNERED: its corners are kept in the heap
  const WORN = GROUND || (!SOLID && DOT);   // (its dot is the mean of the world's material its kind wears, in its tint)
  const L = LEVELS.length, STREAMED = LEVELS.filter((l) => l.slots).length, HULL = LEVELS.findIndex((l) => l.n > 0 && l.n <= 2), ROWS = (GROUND ? 3 : 2) + (STATE ? 1 : 0), SR = ROWS - 1;   // ROWS: what a tier packs of a thing, rows of four; SR: where a drawer made with `state` packs the thing's own (its tint, its wear: src/world/things.js)
  const room = (i) => LEVELS[i].room ?? (FULLMOST && LEVELS[i].n === FULLN ? { tris: trisOf(FULLMOST), verts: vertsOf(FULLMOST) } : roomOf(i));   // the most a level's mesh may be (a level's own, or the ladder's)
  const H = createHeap({ kinds: ALL, name: `${name}: meshes`, levels: LEVELS.map((l, i) => { const r = room(i); return MAKE ? (DOT && i === L - 1 ? { idx: 3, elems: 3, one: true } : { idx: CORNERED && !l.slots ? r.tris * 3 : 0, elems: r.verts * MAKE.per, slots: l.slots, sizes: l.rooms && !l.slots ? { idx: CORNERED ? Uint32Array.from(l.rooms, (x) => x.tris * 3) : new Uint32Array(ALL), elems: Uint32Array.from(l.rooms, (x) => x.verts * MAKE.per) } : null }) : { idx: r.tris * 3, elems: r.verts, slots: l.slots, one: l.n === DOTN, shape: !CORNERS && l.n > 0 ? ballCorners(l.n) : null }; }) });   // (shape: a level's ball, the ladder's: what is one is drawn by its one list of corners; another make's dot: one mesh for all)
  const LO = uniformArray(LEVELS.map((l) => l.px));
  // every kind's look, six rows of numbers a kind: [its own texture's mean colour, model], [its second tint, metres a
  // tile of its textures], [the layer of the world's texture it takes its relief from, the layer its own texture lies in
  // (none: -1), gloss, sway], [how uneven its snow lies, glow, light through it, its size], [when its own texture came,
  // the lobes of its leaves (0: it is solid)], [the layer of the world's material it wears (none: -1; its mean colour
  // is then the tint it is given), how much grows over it, how strong its relief is, how much of its size lies in the ground]
  // After its look, a kind of a make has the make's own numbers (MAKE.numbers: { rows, of(k) -> rows × 4 numbers }: a
  // plant's height, wind and leaves; a made thing's box, wind and surface): the one table of a kind's numbers, read by
  // lookOf (its look's rows) and numOf (its make's), one buffer for every pass to bind.
  // and last a kind's box, for the occlusion test (src/core/occlusion.js): [how far it reaches round its foot, its lowest,
  // its highest (in its sizes, as it is drawn at every level), whether it is known]: kindBox, below
  const LR = NL ? LOOK / 4 : 0, MR = MAKE?.numbers?.rows ?? 0, BR = LR + MR, STRIDE = (BR + 1) * 4, NK = ALL;   // rows of four a kind: its look's, its make's, its box
  const LAYERS = tex.used.filter((m) => ['ground', 'bark', 'stone', 'grass'].includes(m.kind)).map((m) => tex.layer(m)), look = new Float32Array(Math.max(4, NK * STRIDE)), MOSS = GROUND ? byRole('moss') : null;   // (MOSS: the material that plays what grows over a thing)
  for (let k = 0; k < NL; k++) {
    const B = lookOfKind(k), worn = B.material ? tex.layer(B.material) : -1;
    look.set([B.mean[0], B.mean[1], B.mean[2], modelOf(B.model), B.c2[0] * 1.7, B.c2[1] * 1.7, B.c2[2] * 1.7, B.scale, worn >= 0 ? worn : LAYERS[Math.min(LAYERS.length - 1, Math.floor(B.relief * LAYERS.length))], -1, B.gloss, B.sway, B.snow, B.glow, B.through, B.size ?? 1, -100, B.leaf ?? 0, B.dot?.[0] ?? 0, B.dot?.[1] ?? 0, worn, B.cover ?? 0, B.bump ?? 1, B.sunk ?? 0], k * STRIDE);
  }
  if (MR) for (let k = 0; k < ALL; k++) look.set(MAKE.numbers.of(k), k * STRIDE + LR * 4);
  // a kind's box: grown by every box that is said of it (b: [x0, y0, z0, x1, y1, z1], in its sizes, its foot at 0).
  // Where its make says its kinds' (MAKE.box(k), in their sizes: the made things'), that; a make that measures its
  // meshes (MAKE.boxOf(k, b): a mesh's box, as its family measured it, in its kind's sizes: the plants', its sprigs
  // enlarged as far as they grow) grows it by every mesh of it that comes, and is unknown until the first has; a make
  // that says nothing measures a kind by its height or more, and its family's box (assets/zoo/index.js bodyOf: metres) is
  // taken over its height; a solid's is measured on every mesh of it that comes (assets/kit/solid.js solidBox). Its dot
  // (its last level, where it has one) is as wide as its look says and stands round its middle (dot, below)
  const kindBox = (k, b, quiet = false) => {
    const o = k * STRIDE + BR * 4, r = Math.hypot(Math.max(Math.abs(b[0]), Math.abs(b[3])), Math.max(Math.abs(b[2]), Math.abs(b[5]))), known = look[o + 3] > 0.5;
    look.set([known ? Math.max(look[o], r) : r, known ? Math.min(look[o + 1], b[1]) : b[1], known ? Math.max(look[o + 2], b[4]) : b[4], 1], o);
    if (!quiet) { lookRows.addUpdateRange(o, 4); lookRows.needsUpdate = true; }
  };
  const MEASURED = measured(SOLID, MAKE), boxIn = (k, b) => (SOLID || !MAKE.boxOf ? b : MAKE.boxOf(k, b));   // (a mesh's box as measured, in its kind's sizes: a make that measures its own says how)
  for (let k = 0; k < ALL; k++) {
    if (!MEASURED) { let b = MAKE.box?.(k); if (!b) { const B = bodyOf(kindNo(k)).box, h = Math.max(1e-3, B.max[1]); b = { min: B.min.map((v) => v / h), max: B.max.map((v) => v / h) }; } kindBox(k, [...b.min, ...b.max], true); }
    if (DOT) { const w = 1.64 * (look[k * STRIDE + 18] > 0 ? look[k * STRIDE + 18] : 0.5), m = look[k * STRIDE + 18] > 0 ? look[k * STRIDE + 19] : 0.35; kindBox(k, [-w, m - w, -w, w, m + w, w], true); }   // (its triangle turned to the eye: its corners within 1.64 of its size round its middle)
  }
  const sizes = Float32Array.from({ length: SOLID ? STAND : 0 }, (_, k) => look[k * STRIDE + 15]), LEAVES = Array.from({ length: NL }, (_, k) => look[k * STRIDE + 17]).some((x) => x > 0.5);   // a standing kind's largest side, metres (its look's); LEAVES: some kind is cut out as leaves
  const lookRows = new THREE.StorageBufferAttribute(look, 4), mats = storage(lookRows, 'vec4', Math.max(1, NK * (STRIDE / 4))), lookOf = (kind, j) => mats.element(kind.mul(uint(STRIDE / 4)).add(uint(j))), numOf = (kind, j) => lookOf(kind, LR + j);
  // every kind's own texture (assets/kit/blob.js: blobSkin), SKIN pixels a side: a layer of one array texture for each
  // kind that is large enough on screen to show it, painted in a worker when it comes near, its layer given to another
  // when it has gone (as the fine meshes are: the pump, below). Ten thousand at once would be 950 MB; these are 89.
  const SKINS = Math.min(SOLID ? SKINSMAX : 0, renderer.backend.device?.limits?.maxTextureArrayLayers ?? 256);   // (none: its kinds wear the world's materials, and nothing of this is made)
  const skinRT = SKINS ? new THREE.RenderTarget(SKIN, SKIN, { depth: SKINS, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace }) : null;
  if (SKINS) { Object.assign(skinRT.texture, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 2 }); renderer.initRenderTarget(skinRT); }
  const skinTex = SKINS ? texture(skinRT.texture) : null, skins = { who: new Int32Array(SKINS).fill(-1), used: new Float64Array(SKINS), slot: new Int32Array(ALL).fill(-1) };
  if (SOLID) note(`${name}: looks`, look.byteLength, look.byteLength, 'geometry'); if (SKINS) note(`${name}: kinds' own textures`, Math.round(SKINS * SKIN * SKIN * 4 * 4 / 3), 0, 'geometry');
  // every moving kind's skeleton (assets/kit/creature.js): BONES bones a kind, three rows of four a bone
  // (worked out in a worker at the start, below: until they have come, what moves glides without a stride)
  const boneRows = new THREE.StorageBufferAttribute(new Float32Array(Math.max(1, MOVING) * BONES * 12), 4), BONE = storage(boneRows, 'vec4', Math.max(1, MOVING) * BONES * 3);
  // what a pixel is given: where it is and its pattern; its normal and its shade; where it is on the thing (metres from
  // its foot, at rest) and its kind; how large the thing is on screen
  const vEnd = varyingProperty('float', 'sEnd'), vA = varyingProperty('vec4', 'sA'), vB = varyingProperty('vec4', 'sB'), vC = varyingProperty('vec4', 'sC'), vPx = varyingProperty('float', 'sPx'), vSnow = varyingProperty('float', 'sSnow'), vSeed = varyingProperty('float', 'sSeed'), vN = varyingProperty('vec3', 'sN'), vUV = varyingProperty('vec2', 'sUV'), vG = varyingProperty('vec4', 'sG');   // (sN: the normal its texture is laid on by: the thing's own, at rest, for what moves; sUV: where on its leaf card a pixel is; sG: the colour of what grows on the ground round it, and how dry the land is there)

  // a thing's colour at a pixel, lit: its own texture laid on it from the sides (it stays on it as it stands); the relief
  // of one of the world's textures when it is large on screen; the snow on it; then its model's way of taking
  // the light. One piece of code for every kind and level: what differs is read from its look.
  // a leaf card (assets/kit/frond.js): what lies outside the leaf is not drawn, before anything is read for it. The leaf:
  // lobes along the card, each widest at its middle, the whole narrowing to its tip (cut in the prepass: src/core/pass.js)
  const leafCut = (builder) => { const lobes = lookOf(uint(vC.w.add(0.5)), 4).y, wide = abs(sin(vUV.y.mul(lobes).mul(Math.PI))).mul(0.8).add(0.2).mul(float(1).sub(vUV.y.mul(vUV.y).mul(0.6))); cut(builder, abs(vUV.x.mul(2).sub(1)).greaterThan(wide)); };
  const shade = (foliage, builder) => {
    const kind = uint(vC.w.add(0.5)), M0 = lookOf(kind, 0), M1 = lookOf(kind, 1), M2 = lookOf(kind, 2), M3 = lookOf(kind, 3), w = vA.xyz;
    if (foliage) leafCut(builder);
    // (its seed, 0 … 1: its kind's textures lie on it moved by so many tiles, so no two things of a kind wear the same
    // pattern; and its model is handed it, for a look of its own)
    const seed = vSeed, N0 = normalize(vB.xyz), Nq = normalize(vN), q = vC.xyz.div(M1.w).add(vec3(seed, fract(seed.mul(7.13)), fract(seed.mul(3.71))).mul(13)), b0 = pow(abs(Nq), vec3(4)), b = b0.div(b0.x.add(b0.y).add(b0.z));
    // (how fast its texture runs across the screen, asked once here: a read inside a branch that asks it itself makes the
    // GPU work out every branch for every pixel)
    const gx = dFdx(q).mul(U.uFine), gy = dFdy(q).mul(U.uFine);   // (built over time: as finely as the screen's own pixels would)
    // (a texture is read from two sides, not three: the two its face is turned towards; the third's share is nothing
    // where it would be dropped, so nothing jumps)
    const an = abs(Nq), least = an.x.min(an.y).min(an.z), wt = an.sub(least).max(0), w2 = wt.mul(wt), dx = an.x.lessThanEqual(an.y).and(an.x.lessThanEqual(an.z)), dz = dx.not().and(an.z.lessThan(an.y));
    const p1 = dx.select(q.xz, q.zy), g1x = dx.select(gx.xz, gx.zy), g1y = dx.select(gy.xz, gy.zy), k1 = dx.select(w2.y, w2.x).add(1e-5), p2 = dz.select(q.xz, q.xy), g2x = dz.select(gx.xz, gx.xy), g2y = dz.select(gy.xz, gy.xy), k2 = dz.select(w2.y, w2.z).add(1e-5);
    const sides = (read) => read(p1, g1x, g1y).mul(k1).add(read(p2, g2x, g2y).mul(k2)).div(k1.add(k2));
    // its colour: its own texture where it is large enough to show and has come (faded in by its size, and from when it
    // came); else, and under that, the texture's mean: what the mipmaps would make of it anyway
    const m = float(0.5).toVar(), M4 = lookOf(kind, 4), own = M0.rgb.toVar(), worn = smoothstep(SKINPX * 0.85, SKINPX * 1.6, vPx).mul(smoothstep(0, GROW * 2, U.uTime.sub(M4.x)));
    if (SKINS) If(M2.y.greaterThan(-0.5).and(worn.greaterThan(0.004)), () => { const a = sides((p, dx, dy) => skinTex.sample(p).depth(M2.y).grad(dx, dy)); own.assign(mix(M0.rgb, a.rgb.mul(a.rgb), worn)); m.assign(mix(0.5, a.a, worn)); });   // (m: its texture's height there: where a glowing kind glows)
    // a kind that wears one of the world's materials (its look's): read at every size (far off the GPU's mipmaps make
    // it the material's mean), its look's colour the tint it is given. And what grows over it where it faces up (its
    // look's cover: a rock's moss), in the colour of what grows round it (the tier's third row), held back where the
    // land is dry: thickest where its texture stands high, in the moss's own pattern
    const M5 = GROUND ? lookOf(kind, 5) : null, grown = GROUND ? float(0).toVar() : null;
    if (GROUND) {
      If(M5.x.greaterThan(-0.5), () => { const a = sides((p, dx, dy) => tex.a(M5.x, p).grad(dx, dy)); own.assign(a.rgb.mul(a.rgb).mul(M0.rgb)); m.assign(a.a); });
      If(M5.y.greaterThan(0), () => {
        const mt = tex.a(MOSS, q.xz.mul(1.7)).grad(gx.xz.mul(1.7), gy.xz.mul(1.7));
        grown.assign(smoothstep(0.45, 0.8, N0.y.mul(0.75).add(m.sub(0.5).mul(0.7)).add(mt.a.sub(0.5).mul(0.5))).mul(float(1).sub(vG.w.mul(0.85))).mul(M5.y.min(1)));
        own.assign(mix(own, vG.rgb.mul(0.75).mul(mt.a.add(0.5)), grown.mul(0.9).mul(M5.y.mul(1.5).min(1))));
      });
    }
    // its skirt (intent 0038, stage 6c): bedded in the soil, not set on it. The soil round it lies at the ground's own
    // height there (the land's page, src/terrain/pages.js: SOIL_RELIEF from its lowest to its highest over the land's smooth
    // surface, as the relief near the eye raises it), and where it faces up it fills its hollows (where its own
    // texture stands low) as much again: below that it wears the ground there, its normal the ground's, nothing grown
    // over it; the line between over the dial's pixels drawn (U.uErrorPx: src/detail/measure.js). (Its size in sA's fourth number; what of it lies in
    // the ground, its look's: how far its foot is over the land's smooth surface)
    const land = GROUND ? landPages() : null, bed = land ? float(0).toVar() : null, bedN = land ? vec3(0, 1, 0).toVar() : null;
    if (land) {
      const above = vC.y.sub(M5.w.mul(vA.w)).toVar(), edge = abs(dFdx(above)).add(abs(dFdy(above))).mul(U.uErrorPx).max(1e-4);
      If(above.lessThan(edge.add(SOIL_RELIEF)), () => {
        const G = land.read(w.xz, dFdx(w.xz).mul(U.uFine), dFdy(w.xz).mul(U.uFine), length(U.uCam.sub(w)));
        const soil = G.h.sub(0.5).add(float(0.5).sub(m).mul(max(N0.y, 0))).mul(SOIL_RELIEF);
        bed.assign(float(1).sub(smoothstep(soil.sub(edge), soil.add(edge), above)));
        own.assign(mix(own, G.c, bed)); bedN.assign(normalize(vec3(G.n.x, 1, G.n.y))); grown.mulAssign(float(1).sub(bed));
      });
    }
    const n = N0.toVar(), rough = float(0.7).toVar();
    If(vPx.greaterThan(RELIEF), () => {   // (its relief: only where it is large enough to show, faded in)
      const t1 = tex.n(M2.x, q.zy).grad(gx.zy, gy.zy), t2 = tex.n(M2.x, q.xz).grad(gx.xz, gy.xz), t3 = tex.n(M2.x, q.xy).grad(gx.xy, gy.xy), x = t1.xy.mul(2).sub(1), y = t2.xy.mul(2).sub(1), z = t3.xy.mul(2).sub(1);
      n.assign(normalize(N0.add(vec3(0, x.y, x.x).mul(b.x).add(vec3(y.x, 0, y.y).mul(b.y)).add(vec3(z.x, z.y, 0).mul(b.z)).mul(GROUND ? smoothstep(RELIEF, RELIEF * 2, vPx).mul(M5.z) : smoothstep(RELIEF, RELIEF * 2, vPx)))));
      rough.assign(tex.r(M2.x, q.zy, gx.zy, gy.zy).mul(b.x).add(tex.r(M2.x, q.xz, gx.xz, gy.xz).mul(b.y)).add(tex.r(M2.x, q.xy, gx.xy, gy.xy).mul(b.z)));
    });
    if (land) n.assign(normalize(mix(n, bedN, bed.mul(0.85))));   // (the soil it wears lies as the ground does)
    // (where the snow has lifted it, it is snow all through, its sides too: a small thing is buried whole. What stands
    // in the ground, a rock taller than the snow is deep, keeps the snow where it settles, on what of it faces up: its
    // sides stay bare)
    const W = weatherOn(n, snowLift(w, M3.x)), bare = own.mul(vB.w), col = (GROUND ? bare.mul(W.keep).add(W.add) : mix(bare.mul(W.keep).add(W.add), SNOW, smoothstep(0.03, 0.14, vSnow))).toVar();
    // the light: the sky's, and the sun's through the clouds and the shadow map
    const sunK = SOFT ? cloudAt(w) : cloudAtOne(w);
    const V = normalize(U.uCam.sub(w)), S = U.uSunDir, sun = U.uSun.mul(sunK), sky = skyLight(n), ndl = max(n.dot(S), 0), Hf = normalize(V.add(S)), ndh = max(n.dot(Hf), 0), nv = max(n.dot(V), 0);
    const shine = M2.z.mul(float(1).sub(rough.mul(0.6))).mul(W.keep), gloss = GROUND ? shine.mul(float(1).sub(grown)) : shine, back = max(V.negate().dot(S), 0), plain = col.mul(sky.add(sun.mul(ndl)));   // (what is grown over does not shine)
    const lit = vec3(0).toVar(), model = M0.w;
    // its model: how it takes the light (src/shading/*.js: each a file there, a branch here)
    const C = { colour: col, plain, tint: M0.rgb, second: M1.rgb, normal: n, eye: V, toSun: S, half: Hf, sun, sky, skyLight, ndl, ndh, nv, back, gloss, glow: M3.y, through: M3.z, height: m, bare: W.keep, phase: vC.w, seed, time: U.uTime };
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
      const A = src.readAt(0, SLOT), B = src.readAt(1, SLOT), clip = offScreen().toVar(), px = dialPxAt(pxOf(A.w, A.xy)), sunk = smoothstep(LEVELS[L - 1].px, LEVELS[L - 1].px * SINK, px);   // (px: dial pixels, as every level's: src/detail/error.js)
      If(px.lessThanEqual(LO.element(L - 2)).and(sunk.greaterThan(0)), () => {
        const V = cameraViewMatrix, right = vec3(V.element(0).x, V.element(1).x, V.element(2).x), up = vec3(V.element(0).y, V.element(1).y, V.element(2).y);
        // (how wide it is and how high its middle stands, of its size: its look's (a made thing's own outline), else a ball's)
        const M4 = lookOf(uint(B.y.add(0.5)), 4), wide = M4.z.greaterThan(0).select(M4.z, float(0.5)), mid = M4.z.greaterThan(0).select(M4.w, float(0.35));
        const r = A.w.mul(wide).mul(sunk), j = float(vertexIndex);
        const w = vec3(A.x, A.z.add(A.w.mul(mid)), A.y).add(right.mul(j.lessThan(0.5).select(float(-1), j.lessThan(1.5).select(float(1), float(0)))).mul(r)).add(up.mul(j.greaterThan(1.5).select(float(1.3), float(-0.5))).mul(r));
        vDot.assign(vec4(w, B.y));
        clip.assign(clipOf(w));
      });
      return clip;
    })();
    m.fragmentNode = Fn((builder) => {
      if (passOf(builder) === 'pre') return motion(vWas);   // (the prepass: a dot stands still)
      const out = vec4(0).toVar();
      If(unlit().not(), () => {
        const kind = uint(vDot.w.add(0.5)), M0 = lookOf(kind, 0), M3 = lookOf(kind, 3), w = vDot.xyz, n = normalize(normalize(U.uCam.sub(w)).add(vec3(0, 1, 0)));
        let base = M0.rgb;   // (what wears a material of the world: that material's mean, the last of its mipmaps, in its tint)
        if (WORN) { const M5 = lookOf(kind, 5), t = tex.a(M5.x.max(0), vec2(0.5)).level(10); base = M5.x.greaterThan(-0.5).select(t.rgb.mul(t.rgb).mul(M0.rgb), M0.rgb); }
        const W = weatherOn(n, M3.x.mul(0.5)), col = base.mul(0.85).mul(W.keep).add(W.add);
        out.assign(finish(col.mul(skyLight(n).add(U.uSun.mul(sunDim()).mul(cloudShade(w)).mul(max(n.dot(U.uSunDir), 0)))), w));
      });
      return out;
    })();
    m.userData.pre = true;   // (it takes part in the prepass: src/core/pass.js)
    return m;
  };
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
    let a = one(bone, p0, n0);
    for (let h = 1; h < CHAIN; h++) a = one(a.parent, a.p, a.n);   // (and the bones it hangs on: a shin with its thigh, the thigh with the body)
    return a;
  };
  // the one material of every mesh level: level i's (shadow: the whole of it, a little smaller, for the light only;
  // moving: a mover's, on its skeleton; foliage: leaf cards, cut out, seen from both sides)
  // (shared: drawn by the level's own list of corners, its vertices read by their numbers: what is of the level's shape)
  // (i: its level; none (null): the mesh says it (userData.level), so one material draws every level of a tier.
  // packed: whoever packed a thing chose its level, and it is drawn at that one whatever its size is now: tierAll)
  // (by: the cut's draw of level 0 (src/scatter/cut.js), a listed cluster an instance, its thing read through the list)
  const meshOf = (src, i, shadow = false, moving = false, foliage = false, shared = false, packed = false, by = null) => {
    const num = (f, type) => (i === null ? uniform(0, type).onObjectUpdate(({ object }) => f(object?.userData?.level ?? 0)) : uniform(f(i), type));
    const lv = num((l) => l, 'uint'), whole = uniform(shadow ? 1 : 0), m = new THREE.NodeMaterial();   // its level as numbers: every level is one shader
    const lo = BANDED ? null : num((l) => LEVELS[l].px), top = BANDED ? null : num((l) => (l ? LEVELS[l - 1].px : LEVELS[0].px * 2)), morphs = BANDED ? null : num((l) => (underOf(l) ? 1 : 0)), delta = BANDED ? null : num((l) => LEVELS[l].delta ?? LADDER[l].delta), still = num((l) => (l + 1 === HULL ? 1 : 0));
    const from = BANDED ? num((l) => surfaceBand(Math.min(l + 1, L - 1))[0]) : null;   // (a banded level that came late refines from what its coarser one showed: that one's least error)
    const limbs = moving && (i === null || i < HULL);   // (a mover's coarse levels are its hull: no bone moves it. Of a tier of every level (tierAll) its level is the mesh's, so whether it has limbs is asked as it is drawn)
    if (foliage) m.side = THREE.DoubleSide;
    m.vertexNode = Fn(() => {
      const E = by ? by.entry(instanceIndex) : null, A = by ? by.thing(E.thing, 0) : src.readAt(0, SLOT), B = by ? by.thing(E.thing, 1) : src.readAt(1, SLOT), clip = offScreen().toVar();
      const px = pxOf(A.w, A.xy), q = dialPxAt(px);   // its size on screen now: pixels drawn (what its textures are read by), and dial pixels (what its levels meet: src/detail/error.js)
      vPx.assign(px); if (THIN) vEnd.assign(smoothstep(THIN[0], THIN[1], q));   // (how much of it is left as it thins away)
      {
        const R = heapRow(H, uint(B.y), lv).toVar();
        // which element of the heap the draw's vertex is; whether it is drawn; how far it has turned into what replaces
        // it (at a time: the clock's, and for the prepass the clock's a frame ago); the range its way there is packed in
        let el, ok, tOf, D;
        if (by) {
          // (the cut's: the listed cluster's corners, turned as far as the cut found)
          const C = clusterOf(H, R, E.cluster);
          ok = vertexIndex.lessThan(C.tris.mul(uint(3))); el = H.index.element(R.x.add(C.first).add(vertexIndex)); tOf = () => E.t; D = C.D;
        } else if (BANDED) {
          // a level of clusters (src/scatter/cut.js): each by the rule, the thing's own size the error allowed
          const corner = H.index.element(R.x.add(vertexIndex)).toVar(), C = clusterOf(H, R, corner.shiftRight(uint(16))), head = levelHead(H, R), dT = camDist(A.xy);
          const b = (time) => clamp(eased(R, allowedAt(A, dT), from, time), head.lo, head.hi), now = b(U.uTime).toVar(), rule = ruleOf(C.self, C.parent, now, now);
          ok = vertexIndex.lessThan(cornersOf(R)).and(rule.drawn); el = corner.bitAnd(uint(0xffff)); tOf = (time) => (time === U.uTime ? rule.t : ruleOf(C.self, C.parent, b(time), b(time)).t); D = C.D;
        } else {
          // a mesh of the heap: the level its size asks for, and whether this one is drawn for it (heap.js: effective)
          const want = uint(0).toVar();
          for (let j = 0; j < L - 1; j++) want.addAssign(q.lessThanEqual(LO.element(j)).select(uint(1), uint(0)));
          ok = packed ? vertexIndex.lessThan(cornersOf(R)) : vertexIndex.lessThan(cornersOf(R)).and(whole.greaterThan(0.5).or(effective(heldOf(R), want, lv)));
          // how far it has turned into the next coarser mesh: over its last pixels, and backwards from when it came
          // (over the whole of its range, top to bottom: it is never still and never jumps)
          tOf = (time) => float(1).sub(whole).mul(SMOOTH).mul(max(morphs.mul(float(1).sub(smoothstep(lo, top, q))), float(1).sub(smoothstep(0, GROW, sinceCame(R, time)))));
          el = null; D = delta;
        }
        If(ok, () => {
          const t = tOf(U.uTime).toVar();
          const v = solidOf((el ? H.elems.element(R.y.add(el)) : shared ? H.elems.element(R.y.add(vertexIndex)) : heapElem(H, R, vertexIndex)).toVar(), t, D, STILL), { turn } = turnOf(B.x);
          const p0 = vec3(v.p).toVar(), n0 = vec3(v.n).toVar(), P = vec3(p0).toVar(), N = vec3(n0).toVar();
          const onBones = () => {
            // on its skeleton: moved by its two bones, each as much as the vertex is bound to it
            const base = uint(B.y).sub(uint(STAND)).mul(uint(BONES * 3)).toVar(), ma = boned(base, B.z, v.a, p0, n0);
            P.assign(ma.p); N.assign(ma.n);
            If(v.w.greaterThan(0.01), () => { const mb = boned(base, B.z, v.b, p0, n0); P.assign(mix(ma.p, mb.p, v.w)); N.assign(mix(ma.n, mb.n, v.w)); });
            // (at the last level it has limbs they come to rest as it turns into its hull: the hull does not move)
            const rested = t.mul(still); P.assign(mix(P, p0, rested)); N.assign(mix(N, n0, rested));
          };
          if (limbs) { if (i === null) If(lv.lessThan(uint(HULL)), onBones); else onBones(); }
          const k = whole.greaterThan(0.5).select(float(SHADE.shrink), float(1)), restOf = (q) => turn(q.sub(vec3(0, 0.4, 0)).mul(k).add(vec3(0, 0.4, 0)).mul(A.w)), rest = restOf(P).toVar();
          // the wind: its top sways, its foot stays (as a tree's: src/scatter/trees.js), as far as its look says; at a time
          // (the clock's, and for the prepass the clock's a frame ago: where it was)
          const kk = vec2(0).toVar(); let sway = null;
          if (!moving) {
            const up = clamp(p0.y, 0, 1), ws = windStrength, bend = up.mul(up).mul(A.w).mul(B.z);
            sway = (time) => windAt(A.xy, time).mul(bend).add(vec2(sin(time.mul(0.9).add(B.w)), cos(time.mul(0.7).add(B.w))).mul(bend).mul(ws.mul(0.4).add(smoothstep(0, 0.08, ws).mul(0.06))));
            If(B.z.greaterThan(0), () => { kk.assign(sway(U.uTime)); });   // (only what sways)
          }
          // (Nothing is drawn back from the walker: he is led round what stands (src/world/bodies.js: pushOut), and a
          // mover steps round him (the detour). Only where he walks through things, `?ghost`, a thing draws back from an
          // eye inside it, under its top and within its middle: seen from inside it would be seen through)
          const out = moving || !GHOST ? float(1) : U.uCam.y.lessThan(A.z.add(A.w.mul(1.1))).select(smoothstep(A.w.mul(0.2), A.w.mul(0.4), length(U.uCam.xz.sub(A.xy))), float(1)).max(whole);
          // the snow lies on it as deep as on the ground: what of it faces up is lifted by the snow's depth, as a mound
          // (most where it faces straight up, thinning down its sides; no deeper than the thing can carry; a mover
          // shakes most of it off)
          const nw = turn(N).toVar(), snow = snowDepth.min(A.w.mul(0.7)).mul(smoothstep(-0.25, 0.8, nw.y)).mul(moving ? 0.3 : 1);
          const w = vec3(A.x, A.z, A.y).add(rest.mul(out)).add(vec3(kk.x, snow.mul(out), kk.y)); vSnow.assign(snow);
          // (where it was a frame ago, for the prepass: grown as far as it had grown then, swayed as the wind had it then;
          // a mover's own motion is not followed, so its pixels say they keep nothing: below)
          const kw = sway ? B.z.greaterThan(0).select(sway(U.uTimeWas), vec2(0)) : null;
          const was = moving ? w : vec3(A.x, A.z, A.y).add(restOf(v.at(tOf(U.uTimeWas))).mul(out)).add(vec3(kw.x, snow.mul(out), kw.y));
          // (its texture lies on it as it stands; on a mover as it is at rest, in its own frame: it must not swim over
          // a leg that swings)
          vA.assign(vec4(w, A.w)); vB.assign(vec4(nw, v.shade)); vC.assign(vec4(moving ? p0.mul(A.w) : rest, B.y)); vN.assign(moving ? n0 : nw); vSeed.assign(seedOf(B));
          if (GROUND) vG.assign(by ? by.thing(E.thing, 2) : src.readAt(2, SLOT));
          if (foliage) vUV.assign(vec2(float(v.a).div(15), float(v.b).mul(16).add(v.w.mul(15)).div(255)));   // (where on its card: assets/kit/frond.js)
          clip.assign(clipOf(w, was));
        });
      }
      return clip;
    })();
    m.fragmentNode = Fn((builder) => {
      const pass = passOf(builder), out = vec4(0).toVar();
      if (THIN) cut(builder, ign(screenCoordinate.xy).greaterThanEqual(vEnd));   // (its last pixels: as many of its pixels as it has left, the same ones from frame to frame)
      if (pass === 'pre') { if (foliage) leafCut(builder); return motion(vWas, foliage ? 1 : 0); }   // (the prepass: what is cut, and where it was: src/core/pass.js)
      // (a mover's motion is not followed: its pixels say that nothing kept of them may be trusted, src/core/temporal.js)
      If(unlit().not(), () => { out.assign(vec4(shade(foliage, builder).rgb, moving && pass === 'main' ? 0 : 1)); });   // (into the shadow map: only its depth)
      return out;
    })();
    m.userData.pre = true;   // (it takes part in the prepass: src/core/pass.js)
    return m;
  };
  // (a draw as long as the level's longest mesh: its vertices are read from the heap by their number; a flat make's: its
  // room's vertices, read by their numbers)
  const indexOf = LEVELS.map((l, i) => (l.cut ? null : MAKE ? (MAKE.flat && !(DOT && i === L - 1) ? new THREE.BufferAttribute(Uint32Array.from({ length: room(i).verts }, (_, j) => j), 1) : null) : new THREE.BufferAttribute(Uint32Array.from({ length: room(i).tris * 3 }, (_, j) => j), 1)));   // (a level drawn by its cut has no draw of its own)
  const drawOf = (i) => { const g = new THREE.InstancedBufferGeometry(); g.setIndex(indexOf[i] ?? new THREE.BufferAttribute(new Uint32Array(3), 1)); return g; };   // (another make's: its own list, set when its mesh has come: blockIn)
  // (and a draw by the level's own list of corners, for what is of its shape: a vertex is then worked out once, not once
  // for every triangle that meets in it)
  const shapeOf = LEVELS.map((l, i) => (H.pools[i].shape ? new THREE.BufferAttribute(H.pools[i].shape, 1) : null)), drawShaped = (i) => { const g = new THREE.InstancedBufferGeometry(); g.setIndex(shapeOf[i]); return g; };
  // ---- the meshes: made by the kinds' recipes in workers (recipes.worker.js); the coarse levels of every kind at the
  // start, the fine ones as the camera comes near ----
  const ask = pool(), done = []; let busy = 0;   // (a worker knows a kind by the zoo's number: this drawer's k-th is first + k)
  if (MAKE?.tell) ask.all(MAKE.tell);   // (before anything of it is asked)
  const stats = { coarseMs: 0, built: 0, put: 0, full: 0, skins: 0, kept: false }, t0 = performance.now();
  // every kind's dot is there from the start (the same three corners for all). Its two coarse meshes are read back from
  // the browser where an earlier start kept them (src/core/kept.js: one piece, under the recipes' fingerprint); else
  // they are built in the workers once the first frames are drawn (a start that builds eleven thousand kinds beside
  // it is a slow start), and kept for the next
  if (DOT) H.putAll(L - 1, dotMesh());
  // (a level every kind has its own of: its number, its corners' and its elements' room in the heap, and a solid's delta or
  // the sizes a level of plants is drawn between, as their stand cut it)
  const ownOf = (l) => [l, MAKE ? room(l).tris * 3 : H.pools[l].idx, H.pools[l].elems, ...(SOLID ? [LEVELS[l].delta ?? LADDER[l].delta] : LEVELS[l].crowd != null ? [null, LEVELS[l].crowd] : [])];
  const OWN = []; for (let l = STREAMED; l < L - (DOT ? 1 : 0); l++) OWN.push(ownOf(l));   // (a make without a dot: its last level is every kind's own too; a solid's level says its delta: its kinds' boxes are measured where they are made; a level of plants the sizes it is drawn between, as their stand cut it: src/scatter/trees.js)
  let bonesOut = MOVING ? 1 : 0;   // (its movers' skeletons, until they have come)
  if (MOVING) ask([['bones', first + STAND, MOVING]]).then(([rows]) => { boneRows.array.set(rows); boneRows.needsUpdate = true; bonesOut = 0; });
  const FP = fingerprint(), KEPT = name === 'stand' ? 'own' : `own: ${name}`, EAGER = ALL <= 256; let coarse = -1, keptOwn = null, loadedAt = 0;   // (EAGER: a few kinds are read back or built as soon as the browser has answered, not after the first frames: they are there when the first picture is)
  keptGet(FP, KEPT).then((rec) => { keptOwn = Array.isArray(rec) && rec.length === OWN.length && rec.every((b, n) => b.l === OWN[n][0] && b.counts?.length === ALL && b.draws?.length === ALL && b.corners?.length === ALL * OWN[n][1] && (!MEASURED || b.boxes?.length === ALL * 6)) ? rec : false; if (EAGER) start(); });
  // a block of a level every kind has its own of (kinds k0 … k0 + n, each `idx` corners' room), come from the workers
  // or read back: into the heap. A make that keeps its corners itself: each mesh's list is the index of its kind's
  // draw at that level, in every tier of it
  const NONE = new Uint32Array(0);
  // a classed level's classes: from the smallest of its kinds' rooms to the largest (a mesh smaller than the smallest is
  // drawn in its class), and which of them hold a mesh (a class none is in is not drawn)
  const RANGE = LEVELS.map((l, i) => { if (!CLASSED || l.slots || (DOT && i === L - 1)) return null; const c = (l.rooms ?? [room(i)]).map((r) => classOf(MAKE.flat ? r.verts : r.tris * 3)); return [Math.min(...c), Math.max(...c)]; });
  const classesIn = LEVELS.map(() => new Set()), clampClass = (l, c) => Math.max(RANGE[l][0], Math.min(RANGE[l][1], c));
  // where a make's vertex of a draw at level i lies (at(R): R its kind's row there): its number, and whether the draw's
  // corner is one of its mesh's (a class's draw runs as long as its class)
  const atOf = (i) => (R) => ({ vertex: RANGE[i] && CORNERED ? H.index.element(R.x.add(vertexIndex)) : vertexIndex, drawn: vertexIndex.lessThan(cornersOf(R)) });
  const blockIn = (b, k0, n, idx, elems) => {
    MAKE?.onBlock?.(b, k0, n, idx, elems);   // (what a make reads of its meshes as they come: what the plants' far ends are baked from, src/scatter/trees.js)
    if (b.boxes) for (let j = 0; j < n; j++) if (b.draws[j]) kindBox(k0 + j, boxIn(k0 + j, b.boxes.subarray(j * 6, j * 6 + 6)));   // (a solid's, a plant's: measured where it was made)
    H.putBlock(b.l, k0, n, MAKE && !CORNERED ? NONE : b.corners, b.verts, CLASSED ? b.draws : b.counts);   // (classed: its count is its corners')
    if (RANGE[b.l]) for (let j = 0; j < n; j++) if (b.draws[j]) classesIn[b.l].add(clampClass(b.l, classOf(b.draws[j])));
    if (MAKE && !RANGE[b.l]) for (let j = 0; j < n; j++) {
      const list = b.corners.slice(j * idx, j * idx + b.draws[j]);
      for (const T of made) if (T.level === b.l) { T.geometries[k0 + j].setIndex(new THREE.BufferAttribute(list, 1)); T.setLength(k0 + j, list.length); }
    }
  };
  const fill = () => {
    coarse = 0;
    // (a make of a few small kinds may make its coarse levels itself, here, as the workers would (MAKE.here(OWN): the
    // blocks): they are there for the first picture, not behind the workers' queue of everything else the start asks)
    if (MAKE?.here) { const blocks = MAKE.here(OWN); blocks.forEach((b, j) => blockIn(b, 0, ALL, OWN[j][1], OWN[j][2])); coarse = ALL; stats.coarseMs = Math.round(performance.now() - t0); keptPut(FP, KEPT, blocks); return; }
    const all = OWN.map(([l, idx, elems]) => ({ l, corners: new Uint32Array(ALL * idx), verts: new Uint32Array(ALL * elems * 4), counts: new Uint32Array(ALL), draws: new Uint32Array(ALL), ...(MEASURED ? { boxes: new Float32Array(ALL * 6) } : {}) }));
    // (a hundred kinds a message, sent to the GPU as one piece a level; of fewer kinds, a third of them a message, one to
    // each worker: a kind whose levels are reduced from its full mesh takes a second or two, intent 0033)
    const STEP = Math.max(1, Math.min(100, Math.ceil(ALL / 3)));
    for (let k = 0; k < ALL; k += STEP) {
      const n = Math.min(STEP, ALL - k);
      ask([['own', KINDS ? KINDS.slice(k, k + n) : first + k, n, OWN]]).then(([blocks]) => {
        blocks.forEach((b, j) => { blockIn(b, k, n, OWN[j][1], OWN[j][2]); all[j].corners.set(b.corners, k * OWN[j][1]); all[j].verts.set(b.verts, k * OWN[j][2] * 4); all[j].counts.set(b.counts, k); all[j].draws.set(b.draws, k); if (b.boxes && all[j].boxes) all[j].boxes.set(b.boxes, k * 6); });
        coarse += n; if (coarse >= ALL) { stats.coarseMs = Math.round(performance.now() - t0); keptPut(FP, KEPT, all); }
      });
    }
  };
  const putAt = new Float64Array(ALL * L).fill(-1e9);   // when a kind's level was put in (the page's clock, ms)
  const skinAt = new Int32Array(ALL);   // the round a kind's own texture was last wanted in
  const wantAt = new Int32Array(ALL * L);   // wantAt: the round a kind's level was last wanted in; speed: the camera's, metres a second
  const pending = new Set(); let round = 1;   // round: each look at what stands near; a level wanted in the last one is not put out
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
      ask(batch.map(({ k, l }) => (SOLID ? ['mesh', kindNo(k), l, LEVELS[l].delta ?? LADDER[l].delta, { tris: room(l).tris, elems: H.pools[l].elems }] : ['mesh', kindNo(k), l]))).then((out) => { busy--; out.forEach((mesh, n) => { stats.built++; if (!batch[n].l) stats.full++; done.push({ k: batch[n].k, l: batch[n].l, mesh }); }); feed(); });   // (a solid's box measured there too: kindBox)
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
      skinBusy++; ask(ks.map((k) => ['skin', kindNo(k), SKIN])).then((out) => { skinBusy--; out.forEach((S, n) => skinDone.push({ k: ks[n], S })); skinFeed(); });
    }
  };
  const skinPut = (k, S) => {
    let at = -1, old = Infinity; for (let i = 0; i < SKINS; i++) { if (skins.who[i] < 0) { at = i; break; } if (skins.used[i] < round && skins.used[i] < old) { old = skins.used[i]; at = i; } }
    if (at < 0) return false;
    if (skins.who[at] >= 0) { const o = skins.who[at]; skins.slot[o] = -1; look[o * STRIDE + 9] = -1; lookRows.addUpdateRange(o * STRIDE + 8, 4); }
    const dev = renderer.backend.device, gpu = renderer.backend.get(skinRT.texture).texture;
    S.levels.forEach((data, m) => { const n = SKIN >> m; dev.queue.writeTexture({ texture: gpu, mipLevel: m, origin: { x: 0, y: 0, z: at } }, data, { bytesPerRow: n * 4, rowsPerImage: n }, { width: n, height: n, depthOrArrayLayers: 1 }); });
    skins.who[at] = k; skins.slot[k] = at; skins.used[at] = round;
    look[k * STRIDE + 9] = at; look[k * STRIDE + 16] = U.uTime.value; lookRows.addUpdateRange(k * STRIDE, LOOK); lookRows.needsUpdate = true; stats.skins++;
    return true;
  };
  // what the workers have built, put in: before the frame's tiers pack (the first tier's run: below), not after. Put in
  // after, a frame packed by the old table would be drawn by the new one, and every thing of that kind was gone for
  // that frame: a flicker each time a mesh came or went. A frame sends the GPU one full mesh at most, or a dozen
  // small ones (under a megabyte); and a level waits until the next coarser one has come and grown: each grows out of the one before it
  const fulls = [], made = [], all0 = uniform(0);   // its tiers; and those of the full meshes, a draw a slot of the heap
  let grewAt = -1e9;   // (the clock's seconds when a level was last put in: a solid make's grows out of the coarser one for GROW seconds from then)
  const arrive = () => {
    const now = performance.now();
    for (let sent = 0, puts = 0, n = done.length; n > 0 && sent < 220000 && puts < 12; n--) {
      const d = done.shift(), id = d.k * L + d.l;
      if (d.l < 2 && wantAt[id] >= round - 1 && (pending.has(id + 1) || now - putAt[id + 1] < GROW * 1000)) { done.push(d); continue; }
      pending.delete(id); asked[d.l]--; if (wantAt[id] < round - 1) continue;
      sent += d.mesh.draw ?? d.mesh.index.length; puts++;
      if (d.mesh.box) kindBox(d.k, boxIn(d.k, d.mesh.box));   // (before it is drawn: its box as large as it)
      if (H.put(d.k, d.l, d.mesh, round, round, U.uTime.value)) {
        stats.put++; putAt[id] = now; grewAt = U.uTime.value; did('meshes'); did('kB', Math.round((d.mesh.index.byteLength + d.mesh.verts.byteLength) / 1024));
        if (!d.l) for (const T0 of fulls) { for (const at of T0.slotArgs(H.pools[0].slot[d.k])) T0.setLength(at / 5, d.mesh.draw ?? d.mesh.index.length); if (MAKE) T0.geometries[H.pools[0].slot[d.k]].setIndex(new THREE.BufferAttribute(d.mesh.index, 1)); }   // (another make's: its corners are the slot's draw's own list)   // (its slot's draw: as long as it)
      }
    }
  };
  // each frame until every kind's coarse levels are in
  const start = () => {
    if (coarse < 0) {
      if (keptOwn) { keptOwn.forEach((b, j) => blockIn(b, 0, ALL, OWN[j][1], OWN[j][2])); coarse = ALL; keptOwn = false; stats.kept = true; stats.coarseMs = Math.round(performance.now() - t0); }
      else if (EAGER || window.__game?.loadMs) { loadedAt ||= performance.now(); if (keptOwn === false || performance.now() - loadedAt > 1500) fill(); }   // (the browser's answer is waited for a moment into the first frames: a busy start holds it back)
    }
  };
  // each frame: a few of the textures that have come, into their layers
  const skinsIn = () => {
    for (let n = 0; n < 3 && skinDone.length; n++) { const d = skinDone.shift(); skinPending.delete(d.k); if (skinAt[d.k] >= round - 1 && skinPut(d.k, d.S)) { did('skins'); did('kB', 87); } }   // (a few textures a frame)
  };
  // once a frame, for its placer's look at what is near: null while nothing calls for a new look (the camera has moved
  // less than 0.7 m, the lens, the detail governor and `extra` are as they were, and it looked less than 0.3 s ago),
  // else a look (near, below) with `ahead`: how far the camera travels while a mesh is made, by its speed
  let sx = 1e9, sz = 1e9, sk = '', scanAt = -1e9, speed = 0, lx = 0, ly = 0, lz = 0, lt = 0;
  const scan = (extra = '') => {
    const now = performance.now(), cam = U.uCam.value, inv = U.uLodInv.value, K = dialK(), key = `${inv.toFixed(2)}|${K.toFixed(0)}|${extra}`;   // (K: the live pixel and the dial, as one: src/detail/measure.js)
    const dt = Math.max(1e-3, (now - lt) / 1000), v = Math.hypot(cam.x - lx, cam.y - ly, cam.z - lz) / dt; lx = cam.x; ly = cam.y; lz = cam.z; lt = now;
    speed += (Math.min(v, 300) - speed) * Math.min(1, dt * 4);   // (metres a second, smoothed)
    if (Math.hypot(cam.x - sx, cam.z - sz) < 0.7 && key === sk && now - scanAt < 300) return null;
    sx = cam.x; sz = cam.z; sk = key; scanAt = now;   // (its placer says whether a look makes the frame busy: src/core/work.js)
    const ahead = speed * 0.35, N = near(inv, ahead); N.ahead = ahead; return N;
  };
  // a look at what stands or passes near (inv: the detail governor's, ahead: how far the camera travels while a mesh is
  // made); a size on screen is the measure's (src/detail/measure.js)
  const near = (inv, ahead) => {
    round++;
    const asks = [], want = [], lo = LEVELS[STREAMED - 1].px;
    // a thing s metres large, d metres off: its size on screen now, and as it will be when a mesh asked for now has come
    // (`ahead`: the camera travelling, and the thing itself: a fine level that will have been passed by then is not asked for)
    const wants = (k, s, d, own) => {
      // (its texture by the pixels drawn, as its shader reads it; its levels by the dial's pixels: src/detail/error.js)
      const drawn = pxOn(s * 1.2, Math.max(1e-3, d * inv)), drawnThen = pxOn(s * 1.2, (d + ahead + own) * inv), px = dialPx(drawn), then = dialPx(drawnThen);
      if (SKINS && drawn > SKINPX) { skinAt[k] = round; if (skins.slot[k] >= 0) skins.used[skins.slot[k]] = round; else if (drawnThen > SKINPX && !skinPending.has(k)) want.push([drawn, k]); }
      for (let l = STREAMED - 1; l >= 0 && px > LEVELS[l].px; l--) {
        if (H.has(k, l)) { H.touch(k, l, round); wantAt[k * L + l] = round; }
        else if (then > LEVELS[l].px) { wantAt[k * L + l] = round; if (!pending.has(k * L + l)) asks.push({ k, l, px }); }
      }
    };
    return {
      /** How far off a thing of that size is still asked for. */
      reach: (s) => farFor(lo, s * 1.2) / inv,
      wants,
      /** Nothing is near enough: nothing asked. */
      none() { queue = []; },
      /** All that is near has been said: ask, nearest and coarsest first. */
      done() { queue = asks.sort((p, q) => q.l - p.l || q.px - p.px); feed(); skinAsks.length = 0; for (const [, k] of want.sort((a, b) => b[0] - a[0])) skinAsks.push(k); skinFeed(); },
    };
  };
  // ---- a tier: level i of the kinds a placer places (tier.js). What stands in a cell, of which kind and how large,
  // the placer says; whether it is of this level, and which of the level's draws it is dropped into, is said here, the
  // same for every placer ----
  /** Level i's tier. cell, P: the placer's cells (metres) and how many a patch's side holds; cap: the most of it drawn
      at once; sizes: [the smallest, the largest] thing, metres; far: no further off than this, metres (none: as far
      as its size is seen); shadow: all that is near whatever its size, a little smaller, for the light only; casts: it
      casts its shadows as it is drawn.
      place(c, at, found): the placer's node code for cell c. Where a thing stands in it, it calls (once, inside
      whatever it tests first) found(kind, size, dist, fill, key?): its kind (a uint node, the drawer's k-th), its size
      (metres) and how far it is from the eye (camDist of its place); fill(A, B, G) then writes its rows, only for a
      thing that is of this level: A (x, z, the height of its foot, its size), B (its turn, its kind, how far it sways,
      its seed: a number of its own, 0 … 2π, its sway's phase where it sways), and G where the drawer was made with
      `ground` (the colour of what grows round it, how dry the land is there). key: the thing's own key where its cell
      does not name it (src/world/things.js: a list's place); `thing` (the tier's option) the placer's name otherwise. at: { band (near, far: uniforms, the distances this level's things lie between), whole (true
      where all that is near is drawn: the shadow's), all (that as a number) }. */
  // A thing's own state (src/world/things.js), in a packing: what is gone is not packed, what grew is packed larger, and
  // a drawer made with `state` packs its tint and its wear. Its key: what the placer says (found's fifth: a list's), else
  // its placer's name (`thing`) and its cell (one thing a cell). `go` packs it.
  const asItIs = (TH, c, key, rows, go) => {
    if (!TH && !key) { if (STATE) rows[SR].assign(vec4(1, 1, 1, 0)); go(); return; }
    const S = stateAt(key ?? keyN(TH, c.x, c.y));
    If(S.gone.not(), () => { rows[0].assign(vec4(rows[0].xyz, rows[0].w.mul(S.grow))); if (STATE) rows[SR].assign(vec4(S.tint, S.wear)); go(); });
  };
  const thingOf = (thing) => (thing == null ? null : uniform(typeof thing === 'number' ? thing : nameKey(thing), 'uint'));
  // Where a thing is in the world, for the eye's occlusion test (src/core/occlusion.js): its kind's box (kindBox) at its
  // size round its foot, grown by what may move it past that: its growth (grow, of its size: a make's sprigs enlarged
  // about their tips where it is a crowd that thins, a mover's limbs on its bones); and how far the wind may push it,
  // a metre of its sway (w: its top's, src/world/weather/wind.js windAt; the culling reckons it with the wind as it
  // blows, and the snow lying on it). far: the bucket of its far end's quad (MAKE.far: it stands over its whole sphere,
  // half of it towards the eye), drawn round half again the box's corner. A kind whose box is not known yet is never hidden
  const GROWN = grownOf(SOLID, MAKE);
  const boundsOf = (grow, far = -1) => (A, B, k) => {
    const R = lookOf(uint(B.y.add(0.5)), BR).toVar(), s = A.w;
    const half = vec3(R.x, R.z.sub(R.y).mul(0.5), R.x).mul(s), h = far >= 0 ? k.equal(uint(far)).select(vec3(length(half).mul(1.5)), half) : half;
    return { c: vec3(A.x, A.z.add(R.y.add(R.z).mul(0.5).mul(s)), A.y), h: R.w.greaterThan(0.5).select(h.add(s.mul(grow)).add(0.05), vec3(1e6)), w: s.mul(0.1).add(1.5) };
  };
  // The draws level i's tier has (shadow: the shadow's stand-in). The full meshes are a draw a slot of the heap, each as
  // long as the mesh that lies in it (set when it is put in: arrive, above): a full mesh is 50 000 to 200 000 triangles,
  // and one draw as long as the longest for all of them worked out 200 000 for each (perSlot, only where its finest
  // level is one of slots); another make's a draw a kind at the levels every kind has its own of (byKind), else a draw
  // a class of size (classed); the dot one draw for all. And a make's far end, where it brings one (MAKE.far: the
  // plants' impostors, src/scatter/trees.js): one quad a thing, every kind in one draw after the kinds' (KF); its packing
  // says which of the two draws a thing is packed into, both while it hands over from one to the other; the vertex
  // stages say which shows. What is cut out as leaves has a draw of its own at the levels it is cards (leafy: another
  // state of the pipeline); what is of the level's own shape, a ball of the ladder's, the last draw (KS).
  const drawsOf = (i, shadow) => {
    const isDot = DOT && i === L - 1, perSlot = i === 0 && !shadow && !!LEVELS[0].slots, classed = !!RANGE[i] && !perSlot, byKind = !!MAKE && !classed && !perSlot && !isDot;
    const FAR = byKind && !shadow && MAKE?.far ? MAKE.far : null, leafy = LEAVES && !shadow && i < HULL, K0 = perSlot ? LEVELS[0].slots : 1;
    const [cLo, cHi] = classed ? RANGE[i] : [0, -1], KS = shapeOf[i] ? (leafy ? K0 * 2 : K0) : -1;
    return { isDot, perSlot, classed, byKind, FAR, KF: FAR ? ALL : -1, leafy, K0, cLo, cHi, KS };
  };
  // (a resident tier's store: a cell's thing where keep(size, dist) says it may be held a while, src/scatter/regions.js
  // Resident; its band for the placer's own early test, held (widened as keep is); its rows, and its own state)
  const foundBy = (place, held, TH, keep, part) => (c, Q) => {
    const alive = float(0).toVar(), rows = Array.from({ length: ROWS }, () => vec4(0).toVar());
    place(c, { band: held(Q), ...part, ...Q }, (kind, size, dist, fill, key = null) => {
      If(keep(size, dist), () => { fill(...rows); asItIs(TH, c, key, rows, () => { alive.assign(1); }); });
    });
    return { alive: alive.greaterThan(0.5), data: rows };
  };
  const tier = (i, { cell, P, cap, sizes, place, shadow = false, casts = false, fade = 0.02, far = Infinity, thing = null, own = false, extra = {} }) => {   // (thing: its placer's name, for a thing's own state; own: the placer chooses its own patches, else its regions are resident; extra: more of the tier's own options: tier.js)
    const Lv = { lo: LEVELS[i].px, hi: i ? LEVELS[i - 1].px : Infinity }, band = { near: uniform(0), far: uniform(1), ...bandOf(Lv, fade, padOf(cell, P)) };
    const { isDot, perSlot, classed, byKind, FAR, KF, leafy, K0, cLo, cHi, KS } = drawsOf(i, shadow);
    // (its level and whether it is the shadow's as numbers: every tier's packing is one piece of code, compiled once)
    const lv = uniform(i, 'uint'), under = uniform(Math.max(0, i - 1), 'uint'), stands = uniform(i ? 1 : 0), all = uniform(shadow ? 1 : 0), TH = thingOf(thing), whole = all.greaterThan(0.5);
    // of this level, a thing of `kind`, `size` metres, `dist` metres off (pad: how far past its band): it is there
    // (heap.js), and it is the size on screen the level is drawn at, or larger while its next finer level has not come
    const ofLevel = (kind, size, dist, pad) => {
      const span = dialPxAt(spanAt(size, dist)), R = heapRow(H, kind, lv), has = R.z.greaterThan(uint(0));   // (its size on screen at a metre: the measure's, in dial pixels as its band: src/detail/error.js)
      const near = dist.greaterThanEqual(span.mul(band.from).sub(pad)).or(stands.greaterThan(0.5).and(R.w.shiftRight(under).bitAnd(uint(1)).equal(uint(0))));
      return { R, ok: has.and(whole.or(dist.lessThan(span.mul(band.to).add(pad)).and(near))) };
    };
    // which of its draws it is dropped into (bucket), and of its far end's too where it hands over to it (also)
    const holder = () => ({ alive: float(0).toVar(), bucket: float(0).toVar(), also: FAR ? float(-1).toVar() : null });
    const sortOf = (out, kind, rows, R) => {
      if (byKind) out.bucket.assign(float(kind));   // (its kind's own draw)
      if (classed) out.bucket.assign(float(classN(cornersOf(R)).max(uint(cLo)).min(uint(cHi)).sub(uint(cLo))));   // (its class's draw)
      if (perSlot) out.bucket.assign(float(R.y.sub(uint(H.pools[0].e0)).div(uint(H.pools[0].elems))));   // (the full meshes: which of the heap's slots its kind's lies in)
      if (leafy) out.bucket.addAssign(lookOf(kind, 4).y.greaterThan(0.5).select(float(K0), float(0)));
      if (KS >= 0) If(shapedOf(R), () => { out.bucket.assign(float(KS)); });
      if (FAR) {   // (its kind's draw, its far end's, or both)
        const w = FAR.wants(kind, rows);
        If(w.mesh.not(), () => { out.bucket.assign(-1); });
        If(w.far, () => { out.also.assign(KF); });
        If(w.mesh.or(w.far), () => { out.alive.assign(1); });
      } else out.alive.assign(1);
    };
    const done = (out, rows) => ({ alive: out.alive.greaterThan(0.5), data: rows, bucket: out.bucket, also: out.also });
    // (its own patches: a cell's thing, packed where it is of the level now)
    const live = (c, part = {}) => {
      const out = holder(), rows = Array.from({ length: ROWS }, () => vec4(0).toVar());
      place(c, { band, whole, all, ...part }, (kind, size, dist, fill, key = null) => {
        const L = ofLevel(kind, size, dist, band.pad);
        If(L.ok, () => { fill(...rows); asItIs(TH, c, key, rows, () => { sortOf(out, kind, rows, L.R); }); });
      });
      return done(out, rows);
    };
    // (resident: a cell's thing, held where it may be of the level a while (src/scatter/regions.js Resident): its band of
    // sizes on screen widened by the MARGIN either way, from this level on down to the next finer's band (while that one
    // has not come, this one draws it); the shadow's stand-in, a band of metres, by its region's pad. And of a thing held,
    // whether it is of the level now)
    const finer = i > 1 ? 1 / (LEVELS[i - 2].px * Math.exp(fade)) : 0, inner = shadow || !i ? band.from : uniform(finer);
    const held = (Q) => (shadow ? { ...band, near: band.near.sub(Q.pad), far: band.far.add(Q.pad) } : { ...band, near: band.near.div(MARGIN), far: band.far.mul(MARGIN) });
    const found = foundBy(place, held, TH, (size, dist) => { const span = dialPxAt(spanAt(size, dist)); return whole.or(dist.lessThan(span.mul(band.to).mul(MARGIN)).and(dist.greaterThanEqual(span.mul(inner).div(MARGIN)))); }, { whole, all });
    const select = (rows) => {
      const out = holder(), kind = uint(rows[1].y.add(0.5)), L = ofLevel(kind, rows[0].w, camDist(rows[0].xy), band.pad);
      If(L.ok, () => { sortOf(out, kind, rows, L.R); });
      return done(out, rows);
    };
    const resident = !own && !extra.spans;
    let made1 = null;   // (another make's material: one for every draw of the tier)
    const draws = classed ? Array.from({ length: cHi - cLo + 1 }, (_, c) => { const g = new THREE.InstancedBufferGeometry(); g.setIndex(classIndex(cLo + c)); return g; }) : Array.from({ length: byKind ? ALL : leafy ? K0 * 2 : K0 }, () => drawOf(i));
    if (FAR) draws.push(new THREE.InstancedBufferGeometry().setIndex([0, 1, 2, 0, 2, 3]));   // (the far end's quad: four corners, its vertex stage places them)
    const caps = FAR ? [...draws.slice(0, KF).map(() => cap), Math.min(1 << 20, cap * ALL)] : cap;   // (its own patches: its far end's draw holds as many as every kind's, up to about a million)
    const packs = resident ? { found, select, metres: shadow } : { live, cap: caps };   // (a resident tier's buckets are as large as it finds it needs: tier.js)
    const T = new Tier(scene, [...draws, ...(KS >= 0 ? [drawShaped(i)] : [])], (src, k = 0) => (k === KF ? FAR.material(src, i) : isDot && !shadow ? dot(src) : MAKE ? (made1 ||= MAKE.material(src, i, shadow, atOf(i))) : meshOf(src, i, shadow, false, leafy && k >= K0 && k !== KS, k === KS)), { cell, P, near: 0, far: 1, order: 1, ...packs, gpu: true, slots: ROWS, bounds: shadow ? null : boundsOf(GROWN, KF), ...extra });   // (the shadow's stand-in is never culled: what casts may stand where the eye does not see)
    T.band = shadow ? () => { T.near = 0; T.far = SHADE.far; band.near.value = -1; band.far.value = SHADE.far * SHADE.wide; }
      : () => {
        [T.near, T.far] = band.reach(sizes[0], sizes[1], dialK()); if (i <= STREAMED) T.near = 0;   // (a level may stand in for the finer ones, right up to the camera)
        T.far = Math.min(T.far, far); band.near.value = T.near > 0 ? T.near : -1; band.far.value = T.far;
      };
    T.band(); T.level = i; T.shaped = KS;
    for (const m of T.meshes) m.renderOrder = 1 + i * 0.01;   // the fine levels first: they are the near ones, and what is behind them need not be shaded
    if (shadow) for (const m of T.meshes) m.layers.set(1);
    else if (casts && !isDot) for (const m of T.meshes) m.layers.enable(1);   // (as drawn: src/world/shadow.js; a dot casts none)
    if (perSlot) { T.slotArgs = (s) => (leafy ? [s * 5, (s + K0) * 5] : [s * 5]); fulls.push(T); }   // (where a slot's draws keep their length)
    // packed again when the heap has changed at its level, or the next finer (which it stands in for); and what the
    // workers have built is put in as the first of the drawer's tiers comes to pack: before any of them does.
    // A draw for which the heap holds nothing is not made (nor its shader ever built): a slot no full mesh lies in,
    // the level's own shape where no kind has it, the corners looked up where every kind has
    const lead = !made.length, run = T.run.bind(T), hp = H.pools[i];
    const shows = (k) => (k === KF ? FAR.ready() : byKind ? H.has(k, i) : classed ? classesIn[i].has(cLo + k) : k === KS ? hp.shaped > 0 : perSlot ? hp.who[k % K0] >= 0 : hp.one || hp.held > hp.shaped);
    T.kindOf = (k) => (k === KF ? -1 : byKind ? k : perSlot && k !== KS ? hp.who[k % K0] : -1);   // whose mesh its k-th draw draws: a kind's own, or the one that lies in its slot of the heap (-1: none, or a draw of many kinds': a class's, the level's own shape, the dot, the far end's)
    T.farDraw = KF;   // (which of its draws is the far end's: -1 none)
    T.run = (r, world, ...a) => {
      if (lead) arrive();
      if (T.n > 0) T.meshes.forEach((m, k) => { m.visible = shows(k); });
      return run(r, `${world}|${H.versions[i]}|${i && !shadow ? H.versions[i - 1] : 0}${FAR ? `|${FAR.version()}` : ''}`, ...a);
    };
    made.push(T);
    return T;
  };
  /** One tier for every level: for a placer of few cells. A thing is dropped into the draw of the level its size asks
      for when it is packed (the finest of it that is there), and drawn at that level until it is packed again: whenever
      the camera has moved `step` metres, or the heap has changed. Over a level's last pixels a thing is the next
      coarser level's shape already and stays that, so a level taken a moment late is not seen. cell, P, cap, sizes,
      place, casts, far: as tier() (cap: of its farthest level; the nearer ones hold a quarter as many each); last: the
      last level its things have (they end before the ladder does). */
  const tierAll = ({ cell, P, cap, sizes, place, casts = false, far = Infinity, last = L - 1, step = 0.5, thing = null, moving = false }) => {   // (moving: what it packs moves on its skeleton: packed again every frame, drawn on its bones)
    const band = { near: uniform(-1), far: uniform(1) }, K0 = LEVELS[0].slots || 1, hp0 = H.pools[0], TH = thingOf(thing);
    // its draws: a slot of the heap's each for the full meshes; of every other mesh level the corners looked up and,
    // where the level has a shape of its own, that list; the dot
    // (a level 0 drawn by its cut: one draw that only holds its things, the cut's own drawing them)
    const CUT0 = !!LEVELS[0].cut, draws = CUT0 ? [{ level: 0, cut: true }] : Array.from({ length: K0 }, (_, s) => ({ level: 0, slot: s }));
    for (let i = 1; i <= Math.min(last, DOT ? L - 2 : L - 1); i++) { draws.push({ level: i }); if (shapeOf[i]) draws.push({ level: i, shared: true }); }
    if (DOT && last === L - 1) draws.push({ level: L - 1, dot: true });
    // (each level's two draws, its plain one and the one by its own list of corners, as one array: a packing that binds
    // many arrays of its own, the stress stand's movers', has twelve uniform buffers to a stage, no more)
    // (with the level's pixels: its packing binds this and not the drawer's LO)
    const at = (i, f) => Math.max(0, draws.findIndex((d) => d.level === i && f(d)));
    const DRAWS = uniformArray(LEVELS.map((l, i) => new THREE.Vector4(l.px, at(i, (d) => !d.shared), at(i, (d) => d.shared), 0)), 'vec4'), END = THIN ? THIN[0] : DOT && last === L - 1 ? LEVELS[L - 1].px : GONE;   // (END: the size on screen under which nothing of it is drawn: where it is gone. Dial pixels, every one: src/detail/error.js)
    // a thing of `kind`, px dial pixels large: the level its size asks for, drawn at the finest that is there and no finer
    // than that; its draw (into out.bucket, where it has one: then `go`)
    const levelOf = (kind, px, out, go = () => {}) => {
      const want = uint(0).toVar(), held = heldOf(heapRow(H, kind, uint(L - 1))), lvl = uint(last).toVar();
      for (let j = 0; j < last; j++) want.addAssign(px.lessThanEqual(DRAWS.element(j).x).select(uint(1), uint(0)));
      for (let l = last - 1; l >= 0; l--) If(want.lessThanEqual(uint(l)).and(held.shiftRight(uint(l)).bitAnd(uint(1)).equal(uint(1))), () => { lvl.assign(uint(l)); });
      const R = heapRow(H, kind, lvl).toVar();
      If(R.z.greaterThan(uint(0)), () => { go(() => { const dr = DRAWS.element(lvl); out.bucket.assign(lvl.equal(uint(0)).select(CUT0 ? float(0) : float(R.y.sub(uint(hp0.e0)).div(uint(hp0.elems))), shapedOf(R).select(dr.z, dr.y))); out.alive.assign(1); }); });
    };
    const whole = all0.greaterThan(0.5), holder = () => ({ alive: float(0).toVar(), bucket: float(0).toVar() });
    // (its own patches, what moves: a cell's thing, packed at its level now)
    const live = (c, part = {}) => {
      const out = holder(), rows = Array.from({ length: ROWS }, () => vec4(0).toVar());
      place(c, { band, whole, all: all0, ...part }, (kind, size, dist, fill, key = null) => {
        const px = dialPxAt(pxAt(size, dist));   // (its size on screen: the measure's, in dial pixels as its levels)
        If(px.greaterThan(END), () => { levelOf(kind, px, out, (sort) => { fill(...rows); asItIs(TH, c, key, rows, sort); }); });
      });
      return { alive: out.alive.greaterThan(0.5), data: rows, bucket: out.bucket };
    };
    // (resident: a cell's thing, held where it is not gone a while: its size on screen a MARGIN larger (src/scatter/
    // regions.js Resident); of a thing held, its level now)
    const found = foundBy(place, () => ({ ...band, near: band.near.div(MARGIN), far: band.far.mul(MARGIN) }), TH, (size, dist) => dialPxAt(pxAt(size, dist)).mul(MARGIN).greaterThan(END), { whole, all: all0 });
    const select = (rows) => {
      const out = holder(), kind = uint(rows[1].y.add(0.5)), px = dialPxAt(pxAt(rows[0].w, camDist(rows[0].xy)));
      If(px.greaterThan(END), () => { levelOf(kind, px, out, (sort) => sort()); });
      return { alive: out.alive.greaterThan(0.5), bucket: out.bucket };
    };
    // (one material for every mesh level of it, its level told by each mesh; one more for what is drawn by a level's own list)
    // (what moves chooses its own patches, packed every frame, a cap a draw: what is drawn large is few, four times as
    // many a level further off; what stands still is resident, its buckets as large as it finds it needs: tier.js)
    const packs = moving ? { live, cap: draws.map((d) => (d.dot ? cap : Math.min(cap, 16 * 4 ** Math.max(1, d.level)))) } : { found, select };
    const mats = {}, T = new Tier(scene, draws.map((d) => (d.cut ? new THREE.InstancedBufferGeometry().setIndex([0, 1, 2]) : d.shared ? drawShaped(d.level) : drawOf(d.level))), (src, k = 0) => { const d = draws[k], key = d.dot ? 'dot' : d.shared ? 'shared' : 'plain'; return (mats[key] ||= d.dot ? dot(src) : meshOf(src, null, false, moving, false, !!d.shared, true)); }, { cell, P, near: 0, far: 1, order: 1, ...packs, gpu: true, slots: ROWS, bounds: boundsOf(GROWN + (moving ? 0.5 : 0)) });
    T.step = step;
    T.band = () => { T.near = 0; T.far = Math.min(far, farFor(THIN ? END : Math.max(END, LEVELS[last].px * (last === L - 1 ? 1 : 0.5)), sizes[1])); band.far.value = T.far; };   // (a drawer that thins its things away: packed until they are gone)
    T.band(); T.draws = draws;
    T.meshes.forEach((m, k) => { const d = draws[k]; m.userData.level = d.level; m.renderOrder = 1 + d.level * 0.01; if (casts && !d.dot) m.layers.enable(1); });   // (the fine levels first; it casts its shadows as drawn, a dot none)
    if (!CUT0) { T.slotArgs = (s) => [s * 5]; fulls.push(T); }   // (where a slot's draw keeps its length)
    const shows = (d) => (d.cut ? false : d.dot ? true : d.slot != null ? hp0.who[d.slot] >= 0 : d.shared ? H.pools[d.level].shaped > 0 : H.pools[d.level].held > H.pools[d.level].shaped);
    // level 0's cut: every frame, after the packing, what of the things it holds is drawn, cluster by cluster
    // (the most of it that can be at level 0 at once: what stands within where its largest is that large, a thing a cell,
    // at the most pixels the screen can draw)
    const near0 = (sizes[1] * pxKMost()) / LEVELS[0].px, things = Math.ceil(Math.PI * (near0 / cell + 1) ** 2);
    const C = CUT0 ? createCut({ T, k: 0, H, room: room(0), name, things }) : null, cm = C ? new THREE.Mesh(C.geometry, meshOf(null, 0, false, moving, false, false, true, C)) : null;
    if (cm) { Object.assign(cm, { frustumCulled: false, renderOrder: 1, visible: false }); cm.userData.level = 0; if (casts) cm.layers.enable(1); scene.add(cm); T.cutMesh = cm; }
    const lead = !made.length, run = T.run.bind(T); let frame = 0;
    T.run = (r, world, ...a) => {
      if (lead) arrive();
      if (T.n > 0) T.meshes.forEach((m, k) => { m.visible = shows(draws[k]); });
      const out = run(r, `${world}|${H.version}${moving ? `|${frame++}` : ''}`, ...a);   // (what moves: packed every frame)
      if (cm) { cm.visible = T.n > 0 && hp0.held > 0; if (cm.visible) r.compute(C.passes); }
      return out;
    };
    T.movers = moving;
    made.push(T);
    return T;
  };
  // how much of it is still out, for the world complete (src/core/settle.js): its kinds' coarse levels not all in (read
  // back from the browser, or made in the workers), meshes and textures asked of the workers and not yet put in, its
  // movers' skeletons, and a level put in that is still growing out of the coarser one. That grows by the clock: where
  // the clock is held (held: it stood still since the last frame, as a still's does), it would never grow, and is grown
  // at once instead
  const waiting = (held = false) => {
    let n = (coarse < ALL ? ALL - Math.max(0, coarse) : 0) + pending.size + queue.length + done.length + skinAsks.length + skinPending.size + skinDone.length + bonesOut;
    if (SOLID && U.uTime.value - grewAt < GROW) { if (held) { H.ripen(U.uTime.value - GROW); grewAt = -1e9; } else n++; }
    return n;
  };
  source(`drawer: ${name}`, waiting);
  /** A make's own numbers of kind k, row j (four), changed: into the one table and to the GPU (the plants' far ends, as
      they are baked: src/scatter/trees.js). */
  const setNum = (k, j, v) => { const o = k * STRIDE + (LR + j) * 4; look.set(v, o); lookRows.addUpdateRange(o, 4); lookRows.needsUpdate = true; };
  return { H, LO, L, STREAMED, HULL, kindNo, lookOf, numOf, setNum, look, lookRows, sizes, skins, boneRows, fingerprint: FP, tier, tierAll, meshOf, dot, drawOf, drawShaped, shapeOf, ask, stats, pending, start, skinsIn, scan, near, waiting };
}
