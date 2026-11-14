// The one drawer: how every kind of thing that stands or moves is drawn, whoever says where it is. A kind's meshes lie
// in a heap on the GPU (heap.js), its look in a row of numbers, its own texture in a layer of one array; a level of
// every kind is one draw (and one more for what is of the level's own shape, one for what is cut out as leaves), in one
// shader whose shading models are branches (src/shading); the fine levels and the textures come as things come near,
// made by the kinds' recipes in workers and kept in the browser.
//
// Who places things says where they stand and what is near; the drawer makes the tiers they are drawn by. Two place
// by it today, each with a drawer of its own kinds: the stress stand (src/scatter/stress.js: a plot's lattice and its
// lanes, the test herds) and the world's rocks (src/scatter/rocks.js):
//   createDrawer(scene, renderer, tex, { name, LEVELS, SHADE, SMOOTH, PXK, ghost, skins, ground, soft, relief, zoo }) ->
//     tier(level, { cell, P, cap, sizes, place, shadow, casts, far }) -> that level's tier (tier.js) for a placer:
//                               `place` is the placer's node code for a cell (where a thing stands in it, of which
//                               kind, how large); the drawer tests whether it is of the level and drops it into the
//                               level's draws. A tier a level: for a placer of millions (the stand), whose cells
//                               are too many to look at again as the camera moves
//     tierAll({ cell, P, cap, sizes, place, casts, far, last }) -> one tier for every level: each thing dropped
//                               into the draw of the level its size asks for, packed again whenever the camera has
//                               moved half a metre. For a placer of few cells (the rocks): one packing shader, not eight
//     H, LO, lookOf(kind, row), look, lookRows, sizes     the heap, the levels' pixels, a kind's look, as nodes and as numbers
//     meshOf(src, level, shadow, moving, foliage, shared), dot(src)     a level's material (tier.js: material(src, k))
//     drawOf(level), drawShaped(level), shapeOf     a level's draw: by corners looked up, or by the level's own list
//     ask(jobs)                 the recipes' workers (one set for every drawer)
//     start()                   each frame until the coarse levels are in (read back from the browser, or built)
//     skinsIn()                 each frame: the textures that have come, into their layers
//     near(K, inv, ahead) -> { reach(size), wants(kind, size, distance, own), none(), done() }
//                               a look at what stands or passes near: ask for the levels and textures it is large
//                               enough on screen for now, and will still be when they have come
//     stats, pending, skins, boneRows (the movers' skeletons, as numbers), fingerprint
// What a drawer's kinds may be is said when it is made, so a drawer whose kinds need none of it carries none of it in
// its shader: skins (how many kinds' own textures it holds at once; 0: none, its kinds wear the world's materials),
// ground (its kinds may wear a material of the world and be grown over in the colour of the ground round them: a tier
// then packs a third row, that colour and how dry the land is there), soft (the shadows that fall on it are read
// softly: large, still things), relief (the size on screen from which a thing's relief is read).
// It was the stress stand's own until 2026-11-14: lifted out that day, and the world's rocks drawn by it since.
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, float, uint, vec2, vec3, vec4, uniform, uniformArray, varyingProperty, storage, texture, vertexIndex, cameraViewMatrix, dFdx, dFdy, cos, sin, abs, max, pow, mix, cross, length, normalize, smoothstep, clamp } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { camDist } from '../world/land.nodes.js';
import { finish, stillness, skyLight, cloudAt, cloudAtOne, cloudShade, sunDim, unlit, weatherOn, snowLift, snowDepth, SNOW, windAt, windStrength } from '../world/light.js';
import { Tier, offScreen, clipOf } from './tier.js';
import { createHeap, heapRow, heapElem, heldOf, sinceCame, effective, cornersOf, shapedOf } from './heap.js';
import { ballCorners } from '../../assets/kit/blob.js';
import { solidOf } from './solid.js';
import { LADDER, FULLN, DOTN, roomOf, underOf, trisOf, vertsOf } from '../../assets/kit/ladder.js';
import { dotMesh, BONES } from '../../assets/kit/solid.js';
import { MODELS, modelOf } from '../shading/index.js';
import { recipes, byRole } from '../core/registry.js';
import { bandOf, padOf } from '../detail/handover.js';
import { pxK } from '../detail/index.js';
import { note } from '../core/gpu.js';
import { keptGet, keptPut } from '../core/kept.js';
import { did } from '../core/work.js';

const GROW = 1.5, SKIN = 128, SKINPX = 28, SINK = 1.6, LOOK = 24;   // GROW: seconds a level that came late takes to grow out of the coarser one; SKIN: a kind's own texture, pixels a side; SKINPX: the size on screen from which a thing wears it; SINK: how far under its last pixels a dot sinks away; LOOK: a kind's look, numbers (six rows of four)
// the recipes' workers (recipes.worker.js): one set for every drawer, made when the first asks
let POOL = null;
const pool = () => (POOL ||= (() => {
  const workers = Array.from({ length: 3 }, () => new Worker(new URL('./recipes.worker.js', import.meta.url), { type: 'module' })), waiting = new Map(); let nextId = 0, turn = 0;
  for (const w of workers) w.onmessage = ({ data }) => { waiting.get(data.id)(data.out); waiting.delete(data.id); };
  return (jobs) => new Promise((res) => { const id = nextId++; waiting.set(id, res); workers[turn++ % workers.length].postMessage({ id, jobs }); });
})());

/** name: its own (the ledger's, and what the browser keeps its coarse meshes under); LEVELS: the levels, finest first
    (the ladder's n and px, and of each: slots); SHADE: what casts the shadows (its shrink); SMOOTH, PXK: uniforms
    (whether levels turn into each other; the lens's pixels a metre); ghost: a thing draws back from an eye inside it;
    skins, ground, soft, relief: what its kinds may be (above); full: the most squares an edge a full mesh of its kinds
    has (none: the ladder's most: a slot of the heap is as large as that); zoo: its kinds ({ first (the zoo's number
    of its first kind), ALL, STAND, MOVING, lookOfKind (of its k-th kind), fingerprint }: assets/zoo). */
export function createDrawer(scene, renderer, tex, { name = 'stand', LEVELS, SHADE, SMOOTH, PXK, ghost: GHOST = false, corners: CORNERS = false, skins: SKINSMAX = 1024, ground: GROUND = false, soft: SOFT = false, relief: RELIEF = 90, full: FULLMOST = 0, zoo: { first = 0, ALL, STAND, MOVING, lookOfKind, fingerprint } }) {
  const L = LEVELS.length, STREAMED = LEVELS.filter((l) => l.slots).length, HULL = LEVELS.findIndex((l) => l.n > 0 && l.n <= 2), ROWS = GROUND ? 3 : 2;   // ROWS: what a tier packs of a thing, rows of four
  const room = (i) => (FULLMOST && LEVELS[i].n === FULLN ? { tris: trisOf(FULLMOST), verts: vertsOf(FULLMOST) } : roomOf(i));   // the most a level's mesh may be
  const H = createHeap({ kinds: ALL, name: `${name}: meshes`, levels: LEVELS.map((l, i) => { const r = room(i); return { idx: r.tris * 3, elems: r.verts, slots: l.slots, one: l.n === DOTN, shape: !CORNERS && l.n > 0 ? ballCorners(l.n) : null }; }) });   // (shape: a level's ball, the ladder's: what is one is drawn by its one list of corners)
  const LO = uniformArray(LEVELS.map((l) => l.px));
  // every kind's look, six rows of numbers a kind: [its own texture's mean colour, model], [its second tint, metres a
  // tile of its textures], [the layer of the world's texture it takes its relief from, the layer its own texture lies in
  // (none: -1), gloss, sway], [how uneven its snow lies, glow, light through it, its size], [when its own texture came,
  // the lobes of its leaves (0: it is solid)], [the layer of the world's material it wears (none: -1; its mean colour
  // is then the tint it is given), how much grows over it, how strong its relief is, how much of its size lies in the ground]
  const LAYERS = recipes('material').filter((m) => ['ground', 'bark', 'stone', 'grass'].includes(m.kind)).map((m) => tex.layer(m)), look = new Float32Array(ALL * LOOK), MOSS = GROUND ? byRole('moss') : null;   // (MOSS: the material that plays what grows over a thing)
  for (let k = 0; k < ALL; k++) {
    const B = lookOfKind(k), worn = B.material ? tex.layer(B.material) : -1;
    look.set([B.mean[0], B.mean[1], B.mean[2], modelOf(B.model), B.c2[0] * 1.7, B.c2[1] * 1.7, B.c2[2] * 1.7, B.scale, worn >= 0 ? worn : LAYERS[Math.min(LAYERS.length - 1, Math.floor(B.relief * LAYERS.length))], -1, B.gloss, B.sway, B.snow, B.glow, B.through, B.size ?? 1, -100, B.leaf ?? 0, 0, 0, worn, B.cover ?? 0, B.bump ?? 1, B.sunk ?? 0], k * LOOK);
  }
  const sizes = Float32Array.from({ length: STAND }, (_, k) => look[k * LOOK + 15]), LEAVES = Array.from({ length: ALL }, (_, k) => look[k * LOOK + 17]).some((x) => x > 0.5);   // a standing kind's largest side, metres (its look's); LEAVES: some kind is cut out as leaves
  const lookRows = new THREE.StorageBufferAttribute(look, 4), mats = storage(lookRows, 'vec4', ALL * (LOOK / 4)), lookOf = (kind, j) => mats.element(kind.mul(uint(LOOK / 4)).add(uint(j)));
  // every kind's own texture (assets/kit/blob.js: blobSkin), SKIN pixels a side: a layer of one array texture for each
  // kind that is large enough on screen to show it, painted in a worker when it comes near, its layer given to another
  // when it has gone (as the fine meshes are: the pump, below). Ten thousand at once would be 950 MB; these are 89.
  const SKINS = Math.min(SKINSMAX, renderer.backend.device?.limits?.maxTextureArrayLayers ?? 256);   // (none: its kinds wear the world's materials, and nothing of this is made)
  const skinRT = SKINS ? new THREE.RenderTarget(SKIN, SKIN, { depth: SKINS, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace }) : null;
  if (SKINS) { Object.assign(skinRT.texture, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 2 }); renderer.initRenderTarget(skinRT); }
  const skinTex = SKINS ? texture(skinRT.texture) : null, skins = { who: new Int32Array(SKINS).fill(-1), used: new Float64Array(SKINS), slot: new Int32Array(ALL).fill(-1) };
  note(`${name}: looks`, look.byteLength, look.byteLength); if (SKINS) note(`${name}: kinds' own textures`, Math.round(SKINS * SKIN * SKIN * 4 * 4 / 3), 0);
  // every moving kind's skeleton (assets/kit/creature.js): BONES bones a kind, three rows of four a bone
  // (worked out in a worker at the start, below: until they have come, what moves glides without a stride)
  const boneRows = new THREE.StorageBufferAttribute(new Float32Array(Math.max(1, MOVING) * BONES * 12), 4), BONE = storage(boneRows, 'vec4', Math.max(1, MOVING) * BONES * 3);
  // what a pixel is given: where it is and its pattern; its normal and its shade; where it is on the thing (metres from
  // its foot, at rest) and its kind; how large the thing is on screen
  const vA = varyingProperty('vec4', 'sA'), vB = varyingProperty('vec4', 'sB'), vC = varyingProperty('vec4', 'sC'), vPx = varyingProperty('float', 'sPx'), vSnow = varyingProperty('float', 'sSnow'), vN = varyingProperty('vec3', 'sN'), vUV = varyingProperty('vec2', 'sUV'), vG = varyingProperty('vec4', 'sG');   // (sN: the normal its texture is laid on by: the thing's own, at rest, for what moves; sUV: where on its leaf card a pixel is; sG: the colour of what grows on the ground round it, and how dry the land is there)

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
    const n = N0.toVar(), rough = float(0.7).toVar();
    If(vPx.greaterThan(RELIEF), () => {   // (its relief: only where it is large enough to show, faded in)
      const t1 = tex.n(M2.x, q.zy).grad(gx.zy, gy.zy), t2 = tex.n(M2.x, q.xz).grad(gx.xz, gy.xz), t3 = tex.n(M2.x, q.xy).grad(gx.xy, gy.xy), x = t1.xy.mul(2).sub(1), y = t2.xy.mul(2).sub(1), z = t3.xy.mul(2).sub(1);
      n.assign(normalize(N0.add(vec3(0, x.y, x.x).mul(b.x).add(vec3(y.x, 0, y.y).mul(b.y)).add(vec3(z.x, z.y, 0).mul(b.z)).mul(GROUND ? smoothstep(RELIEF, RELIEF * 2, vPx).mul(M5.z) : smoothstep(RELIEF, RELIEF * 2, vPx)))));
      rough.assign(t1.a.mul(b.x).add(t2.a.mul(b.y)).add(t3.a.mul(b.z)));
    });
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
        let base = M0.rgb;   // (what wears a material of the world: that material's mean, the last of its mipmaps, in its tint)
        if (GROUND) { const M5 = lookOf(kind, 5), t = tex.a(M5.x.max(0), vec2(0.5)).level(10); base = M5.x.greaterThan(-0.5).select(t.rgb.mul(t.rgb).mul(M0.rgb), M0.rgb); }
        const W = weatherOn(n, M3.x.mul(0.5)), col = base.mul(0.85).mul(W.keep).add(W.add);
        out.assign(finish(col.mul(skyLight(n).add(U.uSun.mul(sunDim()).mul(cloudShade(w)).mul(max(n.dot(U.uSunDir), 0)))), w));
      });
      return out;
    })();
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
    const a = one(bone, p0, n0);
    return one(a.parent, a.p, a.n);
  };
  // the one material of every mesh level: level i's (shadow: the whole of it, a little smaller, for the light only;
  // moving: a mover's, on its skeleton; foliage: leaf cards, cut out, seen from both sides)
  // (shared: drawn by the level's own list of corners, its vertices read by their numbers: what is of the level's shape)
  // (i: its level; none (null): the mesh says it (userData.level), so one material draws every level of a tier.
  // packed: whoever packed a thing chose its level, and it is drawn at that one whatever its size is now: tierAll)
  const meshOf = (src, i, shadow = false, moving = false, foliage = false, shared = false, packed = false) => {
    const num = (f, type) => (i === null ? uniform(0, type).onObjectUpdate(({ object }) => f(object?.userData?.level ?? 0)) : uniform(f(i), type));
    const lv = num((l) => l, 'uint'), whole = uniform(shadow ? 1 : 0), lo = num((l) => LEVELS[l].px), top = num((l) => (l ? LEVELS[l - 1].px : LEVELS[0].px * 2)), morphs = num((l) => (underOf(l) ? 1 : 0)), delta = num((l) => LADDER[l].delta), still = num((l) => (l + 1 === HULL ? 1 : 0)), m = new THREE.NodeMaterial();   // its level as numbers: every level is one shader
    const limbs = moving && i !== null && i < HULL;   // (a mover's coarse levels are its hull: no bone moves it)
    if (foliage) m.side = THREE.DoubleSide;
    m.vertexNode = Fn(() => {
      const A = src.readAt(0, SLOT), B = src.readAt(1, SLOT), clip = offScreen().toVar();
      const px = A.w.mul(PXK).div(max(camDist(A.xy), 1e-3));   // its size on screen now
      vPx.assign(px);
      {
        // a mesh of the heap: the level its size asks for, and whether this one is drawn for it (heap.js: effective)
        const R = heapRow(H, uint(B.y), lv).toVar(), want = uint(0).toVar();
        for (let j = 0; j < L - 1; j++) want.addAssign(px.lessThanEqual(LO.element(j)).select(uint(1), uint(0)));
        If(packed ? vertexIndex.lessThan(cornersOf(R)) : vertexIndex.lessThan(cornersOf(R)).and(whole.greaterThan(0.5).or(effective(heldOf(R), want, lv))), () => {
          // how far it has turned into the next coarser mesh: over its last pixels, and backwards from when it came
          // (over the whole of its range, top to bottom: it is never still and never jumps)
          const t = float(1).sub(whole).mul(SMOOTH).mul(max(morphs.mul(float(1).sub(smoothstep(lo, top, px))), float(1).sub(smoothstep(0, GROW, sinceCame(R, U.uTime))))).toVar();
          const v = solidOf((shared ? H.elems.element(R.y.add(vertexIndex)) : heapElem(H, R, vertexIndex)).toVar(), t, delta), cs = cos(B.x), sn = sin(B.x), turn = (p) => vec3(p.x.mul(cs).sub(p.z.mul(sn)), p.y, p.x.mul(sn).add(p.z.mul(cs)));
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
          const kk = vec2(0).toVar(); let swing = float(0);   // (swing: how far it sways, metres for a unit of the wind's push)
          if (!moving) {
            const up = clamp(p0.y, 0, 1), ws = windStrength, bend = up.mul(up).mul(A.w).mul(B.z); swing = bend;
            If(B.z.greaterThan(0), () => { kk.assign(windAt(A.xy).mul(bend).add(vec2(sin(U.uTime.mul(0.9).add(B.w)), cos(U.uTime.mul(0.7).add(B.w))).mul(bend).mul(ws.mul(0.4).add(smoothstep(0, 0.08, ws).mul(0.06))))); });   // (only what sways)
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
          // (its texture lies on it as it stands; on a mover as it is at rest, in its own frame: it must not swim over
          // a leg that swings)
          vA.assign(vec4(w, swing)); vB.assign(vec4(nw, v.shade)); vC.assign(vec4(moving ? p0.mul(A.w) : rest, B.y)); vN.assign(moving ? n0 : nw);
          if (GROUND) vG.assign(src.readAt(2, SLOT));
          if (foliage) vUV.assign(vec2(float(v.a).div(15), float(v.b).mul(16).add(v.w.mul(15)).div(255)));   // (where on its card: assets/kit/frond.js)
          clip.assign(clipOf(w));
        });
      }
      return clip;
    })();
    m.fragmentNode = Fn(() => {
      const out = vec4(0).toVar();
      // (built over time, src/core/temporal.js: a mover says in its pixels that it moves, a thing that sways how still it is)
      If(unlit().not(), () => { out.assign(vec4(shade(foliage).rgb, moving ? float(1).sub(U.uMarks) : stillness(vA.w, vA.xyz))); });   // (into the shadow map: only its depth)
      return out;
    })();
    return m;
  };
  const indexOf = LEVELS.map((l, i) => new THREE.BufferAttribute(Uint32Array.from({ length: room(i).tris * 3 }, (_, j) => j), 1));   // (a draw as long as the level's longest mesh: its vertices are read from the heap by their number)
  const drawOf = (i) => { const g = new THREE.InstancedBufferGeometry(); g.setIndex(indexOf[i]); return g; };
  // (and a draw by the level's own list of corners, for what is of its shape: a vertex is then worked out once, not once
  // for every triangle that meets in it)
  const shapeOf = LEVELS.map((l, i) => (H.pools[i].shape ? new THREE.BufferAttribute(H.pools[i].shape, 1) : null)), drawShaped = (i) => { const g = new THREE.InstancedBufferGeometry(); g.setIndex(shapeOf[i]); return g; };
  // ---- the meshes: made by the kinds' recipes in workers (recipes.worker.js); the coarse levels of every kind at the
  // start, the fine ones as the camera comes near ----
  const ask = pool(), done = []; let busy = 0;   // (a worker knows a kind by the zoo's number: this drawer's k-th is first + k)
  const stats = { coarseMs: 0, built: 0, put: 0, full: 0, skins: 0, kept: false }, t0 = performance.now();
  // every kind's dot is there from the start (the same three corners for all). Its two coarse meshes are read back from
  // the browser where an earlier start kept them (src/core/kept.js: one piece, under the recipes' fingerprint); else
  // they are built in the workers once the first frames are drawn (a start that builds eleven thousand kinds beside
  // it is a slow start), and kept for the next
  H.putAll(L - 1, dotMesh());
  const OWN = []; for (let l = STREAMED; l < L - 1; l++) OWN.push([l, H.pools[l].idx, H.pools[l].elems]);
  if (MOVING) ask([['bones', first + STAND, MOVING]]).then(([rows]) => { boneRows.array.set(rows); boneRows.needsUpdate = true; });
  const FP = fingerprint(), KEPT = name === 'stand' ? 'own' : `own: ${name}`, EAGER = ALL <= 256; let coarse = -1, keptOwn = null, loadedAt = 0;   // (EAGER: a few kinds are read back or built as soon as the browser has answered, not after the first frames: they are there when the first picture is)
  keptGet(FP, KEPT).then((rec) => { keptOwn = Array.isArray(rec) && rec.length === OWN.length && rec.every((b, n) => b.l === OWN[n][0] && b.counts?.length === ALL && b.corners?.length === ALL * OWN[n][1]) ? rec : false; if (EAGER) start(); });
  const fill = () => {
    coarse = 0;
    const all = OWN.map(([l, idx, elems]) => ({ l, corners: new Uint32Array(ALL * idx), verts: new Uint32Array(ALL * elems * 4), counts: new Uint32Array(ALL) }));
    for (let k = 0; k < ALL; k += 100) {   // (a hundred kinds a message, sent to the GPU as one piece a level)
      const n = Math.min(100, ALL - k);
      ask([['own', first + k, n, OWN]]).then(([blocks]) => {
        blocks.forEach((b, j) => { H.putBlock(b.l, k, n, b.corners, b.verts, b.counts); all[j].corners.set(b.corners, k * OWN[j][1]); all[j].verts.set(b.verts, k * OWN[j][2] * 4); all[j].counts.set(b.counts, k); });
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
      ask(batch.map(({ k, l }) => ['mesh', first + k, l])).then((out) => { busy--; out.forEach((mesh, n) => { stats.built++; if (!batch[n].l) stats.full++; done.push({ k: batch[n].k, l: batch[n].l, mesh }); }); feed(); });
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
      skinBusy++; ask(ks.map((k) => ['skin', first + k, SKIN])).then((out) => { skinBusy--; out.forEach((S, n) => skinDone.push({ k: ks[n], S })); skinFeed(); });
    }
  };
  const skinPut = (k, S) => {
    let at = -1, old = Infinity; for (let i = 0; i < SKINS; i++) { if (skins.who[i] < 0) { at = i; break; } if (skins.used[i] < round && skins.used[i] < old) { old = skins.used[i]; at = i; } }
    if (at < 0) return false;
    if (skins.who[at] >= 0) { const o = skins.who[at]; skins.slot[o] = -1; look[o * LOOK + 9] = -1; lookRows.addUpdateRange(o * LOOK + 8, 4); }
    const dev = renderer.backend.device, gpu = renderer.backend.get(skinRT.texture).texture;
    S.levels.forEach((data, m) => { const n = SKIN >> m; dev.queue.writeTexture({ texture: gpu, mipLevel: m, origin: { x: 0, y: 0, z: at } }, data, { bytesPerRow: n * 4, rowsPerImage: n }, { width: n, height: n, depthOrArrayLayers: 1 }); });
    skins.who[at] = k; skins.slot[k] = at; skins.used[at] = round;
    look[k * LOOK + 9] = at; look[k * LOOK + 16] = U.uTime.value; lookRows.addUpdateRange(k * LOOK, LOOK); lookRows.needsUpdate = true; stats.skins++;
    return true;
  };
  // what the workers have built, put in: before the frame's tiers pack (the first tier's run: below), not after. Put in
  // after, a frame packed by the old table would be drawn by the new one, and every thing of that kind was gone for
  // that frame: a flicker each time a mesh came or went. A frame sends the GPU one full mesh at most, or a dozen
  // small ones (under a megabyte); and a level waits until the next coarser one has come and grown: each grows out of the one before it
  const fulls = [], made = [], all0 = uniform(0);   // its tiers; and those of the full meshes, a draw a slot of the heap
  const arrive = () => {
    const now = performance.now();
    for (let sent = 0, puts = 0, n = done.length; n > 0 && sent < 220000 && puts < 12; n--) {
      const d = done.shift(), id = d.k * L + d.l;
      if (d.l < 2 && wantAt[id] >= round - 1 && (pending.has(id + 1) || now - putAt[id + 1] < GROW * 1000)) { done.push(d); continue; }
      pending.delete(id); asked[d.l]--; if (wantAt[id] < round - 1) continue;
      sent += d.mesh.index.length; puts++;
      if (H.put(d.k, d.l, d.mesh, round, round, U.uTime.value)) {
        stats.put++; putAt[id] = now; did('meshes'); did('kB', Math.round((d.mesh.index.byteLength + d.mesh.verts.byteLength) / 1024));
        if (!d.l) for (const T0 of fulls) { for (const at of T0.slotArgs(H.pools[0].slot[d.k])) { T0.args.array[at] = d.mesh.index.length; T0.args.addUpdateRange(at, 1); } T0.args.needsUpdate = true; }   // (its slot's draw: as long as it)
      }
    }
  };
  // each frame until every kind's coarse levels are in
  const start = () => {
    if (coarse < 0) {
      if (keptOwn) { for (const b of keptOwn) H.putBlock(b.l, 0, ALL, b.corners, b.verts, b.counts); coarse = ALL; keptOwn = false; stats.kept = true; stats.coarseMs = Math.round(performance.now() - t0); }
      else if (EAGER || window.__s8?.loadMs) { loadedAt ||= performance.now(); if (keptOwn === false || performance.now() - loadedAt > 1500) fill(); }   // (the browser's answer is waited for a moment into the first frames: a busy start holds it back)
    }
  };
  // each frame: a few of the textures that have come, into their layers
  const skinsIn = () => {
    for (let n = 0; n < 3 && skinDone.length; n++) { const d = skinDone.shift(); skinPending.delete(d.k); if (skinAt[d.k] >= round - 1 && skinPut(d.k, d.S)) { did('skins'); did('kB', 87); } }   // (a few textures a frame)
  };
  // a look at what stands or passes near (K: the lens's pixels a metre, inv: the detail governor's, ahead: how far the
  // camera travels while a mesh is made)
  const near = (K, inv, ahead) => {
    round++;
    const asks = [], want = [], lo = LEVELS[STREAMED - 1].px;
    // a thing s metres large, d metres off: its size on screen now, and as it will be when a mesh asked for now has come
    // (`ahead`: the camera travelling, and the thing itself: a fine level that will have been passed by then is not asked for)
    const wants = (k, s, d, own) => {
      const px = (s * K * 1.2) / Math.max(1e-3, d * inv), then = (s * K * 1.2) / ((d + ahead + own) * inv);
      if (SKINS && px > SKINPX) { skinAt[k] = round; if (skins.slot[k] >= 0) skins.used[skins.slot[k]] = round; else if (then > SKINPX && !skinPending.has(k)) want.push([px, k]); }
      for (let l = STREAMED - 1; l >= 0 && px > LEVELS[l].px; l--) {
        if (H.has(k, l)) { H.touch(k, l, round); wantAt[k * L + l] = round; }
        else if (then > LEVELS[l].px) { wantAt[k * L + l] = round; if (!pending.has(k * L + l)) asks.push({ k, l, px }); }
      }
    };
    return {
      /** How far off a thing of that size is still asked for. */
      reach: (s) => (s * K * 1.2) / (lo * inv),
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
      whatever it tests first) found(kind, size, dist, fill): its kind (a uint node, the drawer's k-th), its size
      (metres) and how far it is from the eye (camDist of its place); fill(A, B, G) then writes its rows, only for a
      thing that is of this level: A (x, z, the height of its foot, its size), B (its turn, its kind, how far it sways,
      its sway's phase), and G where the drawer was made with `ground` (the colour of what grows round it, how dry the
      land is there). at: { band (near, far: uniforms, the distances this level's things lie between), whole (true
      where all that is near is drawn: the shadow's), all (that as a number) }. */
  const tier = (i, { cell, P, cap, sizes, place, shadow = false, casts = false, fade = 0.02, far = Infinity }) => {
    const Lv = { lo: LEVELS[i].px, hi: i ? LEVELS[i - 1].px : Infinity }, band = { near: uniform(0), far: uniform(1), ...bandOf(Lv, fade, padOf(cell, P)) };
    // the full meshes are a draw a slot of the heap, each as long as the mesh that lies in it (set when it is put in:
    // arrive, above): a full mesh is 50 000 to 200 000 triangles, and one draw as long as the longest for all of them
    // worked out 200 000 for each
    const perSlot = i === 0 && !shadow;
    // (and what is cut out as leaves has a draw of its own at the levels it is cards: another state of the pipeline)
    const leafy = LEAVES && !shadow && i < HULL, K0 = perSlot ? LEVELS[0].slots : 1;
    // (and what is of the level's own shape, a ball of the ladder's, the last draw: by the level's list of corners)
    const KS = shapeOf[i] ? (leafy ? K0 * 2 : K0) : -1;
    // (its level and whether it is the shadow's as numbers: every tier's packing is one piece of code, compiled once)
    const lv = uniform(i, 'uint'), under = uniform(Math.max(0, i - 1), 'uint'), stands = uniform(i ? 1 : 0), all = uniform(shadow ? 1 : 0);
    const live = (c) => {
      const alive = float(0).toVar(), rows = Array.from({ length: ROWS }, () => vec4(0).toVar()), bucket = float(0).toVar(), whole = all.greaterThan(0.5);
      place(c, { band, whole, all }, (kind, size, dist, fill) => {
        // of this level: it is there (heap.js), and the thing is the size on screen the level is drawn at, or larger
        // while its next finer level has not come
        const span = size.mul(PXK), R = heapRow(H, kind, lv), has = R.z.greaterThan(uint(0));
        const near = dist.greaterThanEqual(span.mul(band.from).sub(band.pad)).or(stands.greaterThan(0.5).and(R.w.shiftRight(under).bitAnd(uint(1)).equal(uint(0))));
        If(has.and(whole.or(dist.lessThan(span.mul(band.to).add(band.pad)).and(near))), () => {
          fill(...rows);
          if (perSlot) bucket.assign(float(R.x.sub(uint(H.pools[0].i0)).div(uint(H.pools[0].idx))));   // (the full meshes: which of the heap's slots its kind's lies in)
          if (leafy) bucket.addAssign(lookOf(kind, 4).y.greaterThan(0.5).select(float(K0), float(0)));
          if (KS >= 0) If(shapedOf(R), () => { bucket.assign(float(KS)); });
          alive.assign(1);
        });
      });
      return { alive: alive.greaterThan(0.5), data: rows, bucket };
    };
    const T = new Tier(scene, [...Array.from({ length: leafy ? K0 * 2 : K0 }, () => drawOf(i)), ...(KS >= 0 ? [drawShaped(i)] : [])], (src, k = 0) => (i === L - 1 && !shadow ? dot(src) : meshOf(src, i, shadow, false, leafy && k >= K0 && k !== KS, k === KS)), { cell, P, near: 0, far: 1, order: 1, live, gpu: true, cap, slots: ROWS });
    T.band = shadow ? () => { T.near = 0; T.far = SHADE.far; band.near.value = -1; band.far.value = SHADE.far * SHADE.wide; }
      : () => {
        [T.near, T.far] = band.reach(sizes[0], sizes[1], pxK()); if (i <= STREAMED) T.near = 0;   // (a level may stand in for the finer ones, right up to the camera)
        T.far = Math.min(T.far, far); band.near.value = T.near > 0 ? T.near : -1; band.far.value = T.far;
      };
    T.band(); T.level = i; T.shaped = KS;
    for (const m of T.meshes) m.renderOrder = 1 + i * 0.01;   // the fine levels first: they are the near ones, and what is behind them need not be shaded
    if (shadow) for (const m of T.meshes) m.layers.set(1);
    else if (casts && i < L - 1) for (const m of T.meshes) m.layers.enable(1);   // (as drawn: src/world/shadow.js; a dot casts none)
    if (perSlot) { T.slotArgs = (s) => (leafy ? [s * 5, (s + K0) * 5] : [s * 5]); fulls.push(T); }   // (where a slot's draws keep their length)
    // packed again when the heap has changed at its level, or the next finer (which it stands in for); and what the
    // workers have built is put in as the first of the drawer's tiers comes to pack: before any of them does.
    // A draw for which the heap holds nothing is not made (nor its shader ever built): a slot no full mesh lies in,
    // the level's own shape where no kind has it, the corners looked up where every kind has
    const lead = !made.length, run = T.run.bind(T), hp = H.pools[i];
    const shows = (k) => (k === KS ? hp.shaped > 0 : perSlot ? hp.who[k % K0] >= 0 : hp.one || hp.held > hp.shaped);
    T.run = (r, world, ...a) => {
      if (lead) arrive();
      if (T.n > 0) T.meshes.forEach((m, k) => { m.visible = shows(k); });
      return run(r, `${world}|${H.versions[i]}|${i && !shadow ? H.versions[i - 1] : 0}`, ...a);
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
  const tierAll = ({ cell, P, cap, sizes, place, casts = false, far = Infinity, last = L - 1, step = 0.5 }) => {
    const band = { near: uniform(-1), far: uniform(1) }, K0 = LEVELS[0].slots || 1, hp0 = H.pools[0];
    // its draws: a slot of the heap's each for the full meshes; of every other mesh level the corners looked up and,
    // where the level has a shape of its own, that list; the dot
    const draws = Array.from({ length: K0 }, (_, s) => ({ level: 0, slot: s }));
    for (let i = 1; i <= Math.min(last, L - 2); i++) { draws.push({ level: i }); if (shapeOf[i]) draws.push({ level: i, shared: true }); }
    if (last === L - 1) draws.push({ level: L - 1, dot: true });
    const at = (f) => uniformArray(LEVELS.map((_, i) => Math.max(0, draws.findIndex((d) => d.level === i && f(d)))));
    const PLAIN = at((d) => !d.shared), SHARED = at((d) => d.shared), END = last === L - 1 ? LEVELS[L - 1].px : 0.3;   // (END: the size on screen under which nothing of it is drawn)
    const live = (c) => {
      const alive = float(0).toVar(), rows = Array.from({ length: ROWS }, () => vec4(0).toVar()), bucket = float(0).toVar();
      place(c, { band, whole: all0.greaterThan(0.5), all: all0 }, (kind, size, dist, fill) => {
        const px = size.mul(PXK).div(max(dist, 1e-3));
        If(px.greaterThan(END), () => {
          // the level its size asks for; drawn at the finest that is there and no finer than that
          const want = uint(0).toVar(), held = heldOf(heapRow(H, kind, uint(L - 1))), lvl = uint(last).toVar();
          for (let j = 0; j < last; j++) want.addAssign(px.lessThanEqual(LO.element(j)).select(uint(1), uint(0)));
          for (let l = last - 1; l >= 0; l--) If(want.lessThanEqual(uint(l)).and(held.shiftRight(uint(l)).bitAnd(uint(1)).equal(uint(1))), () => { lvl.assign(uint(l)); });
          const R = heapRow(H, kind, lvl).toVar();
          If(R.z.greaterThan(uint(0)), () => {
            fill(...rows);
            bucket.assign(lvl.equal(uint(0)).select(float(R.x.sub(uint(hp0.i0)).div(uint(hp0.idx))), shapedOf(R).select(SHARED.element(lvl), PLAIN.element(lvl))));
            alive.assign(1);
          });
        });
      });
      return { alive: alive.greaterThan(0.5), data: rows, bucket };
    };
    // (one material for every mesh level of it, its level told by each mesh; one more for what is drawn by a level's own list)
    const mats = {}, T = new Tier(scene, draws.map((d) => (d.shared ? drawShaped(d.level) : drawOf(d.level))), (src, k = 0) => { const d = draws[k], key = d.dot ? 'dot' : d.shared ? 'shared' : 'plain'; return (mats[key] ||= d.dot ? dot(src) : meshOf(src, null, false, false, false, !!d.shared, true)); }, { cell, P, near: 0, far: 1, order: 1, live, gpu: true, cap: draws.map((d) => (d.dot ? cap : Math.min(cap, 16 * 4 ** Math.max(1, d.level)))), slots: ROWS });   // (a cap a draw: what is drawn large is few, four times as many a level further off)
    T.step = step;
    T.band = () => { T.near = 0; T.far = Math.min(far, (sizes[1] * pxK()) / Math.max(END, LEVELS[last].px * (last === L - 1 ? 1 : 0.5))); band.far.value = T.far; };
    T.band(); T.draws = draws;
    T.meshes.forEach((m, k) => { const d = draws[k]; m.userData.level = d.level; m.renderOrder = 1 + d.level * 0.01; if (casts && !d.dot) m.layers.enable(1); });   // (the fine levels first; it casts its shadows as drawn, a dot none)
    T.slotArgs = (s) => [s * 5]; fulls.push(T);   // (where a slot's draw keeps its length)
    const shows = (d) => (d.dot ? true : d.slot != null ? hp0.who[d.slot] >= 0 : d.shared ? H.pools[d.level].shaped > 0 : H.pools[d.level].held > H.pools[d.level].shaped);
    const lead = !made.length, run = T.run.bind(T);
    T.run = (r, world, ...a) => {
      if (lead) arrive();
      if (T.n > 0) T.meshes.forEach((m, k) => { m.visible = shows(draws[k]); });
      return run(r, `${world}|${H.version}`, ...a);
    };
    made.push(T);
    return T;
  };
  return { H, LO, L, STREAMED, HULL, lookOf, look, lookRows, sizes, skins, boneRows, fingerprint: FP, tier, tierAll, meshOf, dot, drawOf, drawShaped, shapeOf, ask, stats, pending, start, skinsIn, near };
}
