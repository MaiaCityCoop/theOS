// The one drawer: how every kind of thing that stands or moves is drawn, whoever says where it is. A kind's meshes lie
// in a heap on the GPU (heap.js), its look in a row of numbers, its own texture in a layer of one array; a level of
// every kind is one draw (and one more for what is of the level's own shape, one for what is cut out as leaves), in one
// shader whose shading models are branches (src/shading); the fine levels and the textures come as things come near,
// made by the kinds' recipes in workers and kept in the browser.
//
// Who places things (src/scatter/stress.js: a plot's lattice and its lanes) makes the tiers and says what is near:
//   createDrawer(scene, renderer, tex, { LEVELS, SHADE, SMOOTH, PXK, ghost, zoo }) ->
//     H, LO, lookOf(kind, row), look, lookRows, sizes     the heap, the levels' pixels, a kind's look, as nodes and as numbers
//     meshOf(src, level, shadow, moving, foliage, shared), dot(src)     a level's material (tier.js: material(src, k))
//     drawOf(level), drawShaped(level), shapeOf     a level's draw: by corners looked up, or by the level's own list
//     ask(jobs)                 the recipes' workers
//     start()                   each frame until the coarse levels are in (read back from the browser, or built)
//     skinsIn()                 each frame: the textures that have come, into their layers
//     arrive(tier0)             before a frame's tiers pack: the meshes that have come, into the heap
//     near(K, inv, ahead) -> { reach(size), wants(kind, size, distance, own), none(), done() }
//                               a look at what stands or passes near: ask for the levels and textures it is large
//                               enough on screen for now, and will still be when they have come
//     stats, pending, skins, boneRows (the movers' skeletons, as numbers), fingerprint
// It was the stress stand's own (src/scatter/stress.js) until 2026-11-14: lifted out so that what places the world's
// rocks and trees can draw by it too.
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, float, uint, vec2, vec3, vec4, uniform, uniformArray, varyingProperty, storage, texture, vertexIndex, cameraViewMatrix, dFdx, dFdy, cos, sin, abs, max, pow, mix, cross, length, normalize, smoothstep, clamp } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { camDist } from '../world/land.nodes.js';
import { finish, stillness, skyLight, cloudAtOne, cloudShade, sunDim, unlit, weatherOn, snowLift, snowDepth, SNOW, windAt, windStrength } from '../world/light.js';
import { offScreen, clipOf } from './tier.js';
import { createHeap, heapRow, heapElem, heldOf, sinceCame, effective, cornersOf } from './heap.js';
import { ballCorners } from '../../assets/kit/blob.js';
import { solidOf } from './solid.js';
import { LADDER, DOTN, roomOf, underOf } from '../../assets/kit/ladder.js';
import { dotMesh, BONES } from '../../assets/kit/solid.js';
import { MODELS, modelOf } from '../shading/index.js';
import { recipes } from '../core/registry.js';
import { note } from '../core/gpu.js';
import { keptGet, keptPut } from '../core/kept.js';
import { did } from '../core/work.js';

const GROW = 1.5, RELIEF = 90, SKIN = 128, SKINPX = 28, SINK = 1.6;   // GROW: seconds a level that came late takes to grow out of the coarser one; RELIEF: the size on screen from which its textures' relief is read; SKIN: a kind's own texture, pixels a side; SKINPX: the size on screen from which a thing wears it; SINK: how far under its last pixels a dot sinks away

/** LEVELS: the levels, finest first (the ladder's n and px, and of each: P, slots, cap); SHADE: what casts the shadows
    (its shrink); SMOOTH, PXK: uniforms (whether levels turn into each other; the lens's pixels a metre); ghost: a thing
    draws back from an eye inside it; zoo: the kinds ({ ALL, STAND, MOVING, lookOfKind, fingerprint }: assets/zoo). */
export function createDrawer(scene, renderer, tex, { LEVELS, SHADE, SMOOTH, PXK, ghost: GHOST = false, corners: CORNERS = false, zoo: { ALL, STAND, MOVING, lookOfKind, fingerprint } }) {
  const L = LEVELS.length, STREAMED = LEVELS.filter((l) => l.slots).length, HULL = LEVELS.findIndex((l) => l.n > 0 && l.n <= 2);
  const H = createHeap({ kinds: ALL, name: 'stand: meshes', levels: LEVELS.map((l, i) => { const r = roomOf(i); return { idx: r.tris * 3, elems: r.verts, slots: l.slots, one: l.n === DOTN, shape: !CORNERS && l.n > 0 ? ballCorners(l.n) : null }; }) });   // (shape: a level's ball, the ladder's: what is one is drawn by its one list of corners)
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
    const gx = dFdx(q).mul(U.uFine), gy = dFdy(q).mul(U.uFine);   // (built over time: as finely as the screen's own pixels would)
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
  const meshOf = (src, i, shadow = false, moving = false, foliage = false, shared = false) => {
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
        If(vertexIndex.lessThan(cornersOf(R)).and(whole.greaterThan(0.5).or(effective(heldOf(R), want, lv))), () => {
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
  const indexOf = LEVELS.map((l, i) => new THREE.BufferAttribute(Uint32Array.from({ length: roomOf(i).tris * 3 }, (_, j) => j), 1));   // (a draw as long as the level's longest mesh: its vertices are read from the heap by their number)
  const drawOf = (i) => { const g = new THREE.InstancedBufferGeometry(); g.setIndex(indexOf[i]); return g; };
  // (and a draw by the level's own list of corners, for what is of its shape: a vertex is then worked out once, not once
  // for every triangle that meets in it)
  const shapeOf = LEVELS.map((l, i) => (H.pools[i].shape ? new THREE.BufferAttribute(H.pools[i].shape, 1) : null)), drawShaped = (i) => { const g = new THREE.InstancedBufferGeometry(); g.setIndex(shapeOf[i]); return g; };
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
  // what the workers have built, put in: before the frame's tiers pack (the first tier's select: below), not after. Put in
  // after, a frame packed by the old table would be drawn by the new one, and every thing of that kind was gone for
  // that frame: a flicker each time a mesh came or went. A frame sends the GPU one full mesh at most, or a dozen
  // small ones (under a megabyte); and a level waits until the next coarser one has come and grown: each grows out of the one before it
  const arrive = (T0) => {
    const now = performance.now();
    for (let sent = 0, puts = 0, n = done.length; n > 0 && sent < 220000 && puts < 12; n--) {
      const d = done.shift(), id = d.k * L + d.l;
      if (d.l < 2 && wantAt[id] >= round - 1 && (pending.has(id + 1) || now - putAt[id + 1] < GROW * 1000)) { done.push(d); continue; }
      pending.delete(id); asked[d.l]--; if (wantAt[id] < round - 1) continue;
      sent += d.mesh.index.length; puts++;
      if (H.put(d.k, d.l, d.mesh, round, round, U.uTime.value)) {
        stats.put++; putAt[id] = now; did('meshes'); did('kB', Math.round((d.mesh.index.byteLength + d.mesh.verts.byteLength) / 1024));
        if (!d.l) { for (const at of [H.pools[0].slot[d.k] * 5, (H.pools[0].slot[d.k] + LEVELS[0].slots) * 5]) { T0.args.array[at] = d.mesh.index.length; T0.args.addUpdateRange(at, 1); } T0.args.needsUpdate = true; }   // (its slot's draw: as long as it)
      }
    }
  };
  // each frame until every kind's coarse levels are in
  const start = () => {
    if (coarse < 0) {
      if (keptOwn) { for (const b of keptOwn) H.putBlock(b.l, 0, ALL, b.corners, b.verts, b.counts); coarse = ALL; keptOwn = false; stats.kept = true; stats.coarseMs = Math.round(performance.now() - t0); }
      else if (window.__s8?.loadMs) { loadedAt ||= performance.now(); if (keptOwn === false || performance.now() - loadedAt > 1500) fill(); }   // (the browser's answer is waited for a moment into the first frames: a busy start holds it back)
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
      if (px > SKINPX) { skinAt[k] = round; if (skins.slot[k] >= 0) skins.used[skins.slot[k]] = round; else if (then > SKINPX && !skinPending.has(k)) want.push([px, k]); }
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
  return { H, LO, L, STREAMED, HULL, lookOf, look, lookRows, sizes, skins, boneRows, fingerprint: FP, meshOf, dot, drawOf, drawShaped, shapeOf, ask, stats, pending, start, skinsIn, arrive, near };
}
