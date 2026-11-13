// The stress stand: a test of the engine, not of the world. A thousand kinds of asset nobody drew (assets/kit/blob.js:
// each its own mesh of 50 000 to 200 000 triangles, its own two textures and tints, its own way of taking the light, of
// swaying and of holding snow), a thousand of each, a million in all, one in every cell of a square of land four
// kilometres a side round the tent. Only with `?stress` in the address; nothing of it is in the library.
//
// How a million of a thousand kinds are drawn:
//   - where each stands is a list on the GPU (its place, its kind, its turn, its size), made once; a tier a level packs
//     the ones of its level that are in view (tier.js), as for every other stand;
//   - every kind's meshes lie in one heap (heap.js): a level of every kind is one draw call, its vertices read from the
//     heap by the kind's number. Eight levels: eight draw calls, two shaders (the meshes', the dots'), whatever the
//     number of kinds;
//   - what a kind looks like is a row of numbers (its look: `mats`), read by its pixels by the kind's number: its
//     textures are layers of the world's one texture array, its way of taking the light one of the shader's models
//     (MODELS: matte, glossy, metal, leafy, glowing, wet, velvet, …). A new look is a row, a new model a branch: neither
//     a draw call nor a shader;
//   - the coarse levels of every kind are always there; the fine ones (the full mesh, and two under it) only of the
//     kinds that stand near, built in workers as the camera comes and put out again when it has gone. Until a fine
//     level has come, the next coarser one is drawn in its place.
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
import { Fn, If, float, uint, vec2, vec3, vec4, uniform, uniformArray, varyingProperty, instancedArray, storage, instanceIndex, vertexIndex, cameraViewMatrix, dFdx, dFdy, cos, sin, abs, max, pow, mix, sqrt, cross, reflect, length, normalize, smoothstep, clamp } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { camDist, groundAt } from '../world/land.nodes.js';
import { finish, skyLight, cloudAtOne, cloudShade, sunDim, unlit, weatherOn, snowLift, windAt, windStrength } from '../world/light.js';
import { pxK } from '../detail/index.js';
import { bandOf, padOf } from '../detail/handover.js';
import { Tier, offScreen, clipOf } from './tier.js';
import { inView } from './view.js';
import { createHeap, heapRow, heapVertex, heldOf, sinceCame, effective } from './heap.js';
import { fullOf, trisOf, vertsOf, blobLook, MODELS } from '../../assets/kit/blob.js';
import { recipes } from '../core/registry.js';
import { PLACES } from '../../world/places.js';

const KINDS = 1000, SIDE = 1000, CELL = 4;   // a thousand kinds; a thousand cells a side, one asset in each: a thousand of every kind
const SMIN = 0.9, SMAX = 5.5, FADE = 0.02, SINK = 1.6, FULL = 129, FULLN = -1;   // an asset's largest side, metres; FULL: the most squares an edge a full mesh has
const MORPH = 1.6, GROW = 0.5, RELIEF = 90, FARPX = 12;   // MORPH: a level turns into the next coarser over its last pixels, from this many times its end; GROW: seconds a level that came late takes to grow out of the coarser one; RELIEF: the size on screen from which its textures' relief is read; FARPX: under it a thing wears its textures' mean
// its levels, finest first. n: squares along an edge (FULLN: the kind's full mesh; under that: its dot); px: the size on
// screen it is drawn down to; P: its tier's cells a patch; slots: how many kinds' the heap holds at once (none: every
// kind's); cap: the most of it drawn at once
const LEVELS = [
  { n: FULLN, px: 256, P: 2, slots: 8, cap: 64 },
  { n: 32, px: 128, P: 4, slots: 48, cap: 256 },
  { n: 16, px: 64, P: 4, slots: 320, cap: 1024 },
  { n: 8, px: 32, P: 8, cap: 4096 },
  { n: 4, px: 16, P: 8, cap: 16384 },
  { n: 2, px: 8, P: 16, cap: 65536 },
  { n: 1, px: 3, P: 64, cap: 524288 },
  { n: -2, px: 1, P: 64, cap: SIDE * SIDE },   // its dot: one triangle, turned to the eye
];
if (new URLSearchParams(location.search).get('stress') === 'all') LEVELS.at(-1).px = 0.2;   // ?stress=all: drawn down to a fifth of a pixel, so that a view from high up draws every one of the million (a test of how many can be drawn: under a pixel nothing of them is seen)
const L = LEVELS.length, STREAMED = LEVELS.filter((l) => l.slots).length;
const nOf = (k, l) => (LEVELS[l].n === FULLN ? fullOf(k) : LEVELS[l].n), coarserOf = (l) => (l + 1 < L && LEVELS[l + 1].n > 0 ? LEVELS[l + 1].n : 0);   // a level's squares an edge, and the next coarser mesh's (0: none: a cube turns into nothing)
const SHADE = { level: 4, far: 60, wide: 1.5, reach: 20, shrink: 0.85 };   // what casts their shadows: a coarse level of each round the camera, a little smaller than the thing (so it does not shade itself)

const SMOOTH = uniform(1);   // 1: levels turn into each other; 0: they change at once (window.__stress.smooth: to see the difference)
const PXK = uniform(pxK()); addEventListener('resize', () => (PXK.value = pxK()));

// where each stands: cell (ix, iz) holds kind (ix·a + b) mod 1000, a and b its row's own (a with no factor in common
// with 1000: a row holds every kind once, so the field holds each exactly a thousand times)
function field(x0, z0) {
  let s = 0x9E3779B9; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const units = []; for (let a = 1; a < KINDS; a++) if (a % 2 && a % 5) units.push(a);
  const size = Float32Array.from({ length: KINDS }, () => 1.2 + 3.3 * rnd() ** 2);
  const N = SIDE * SIDE, X = new Float32Array(N), Z = new Float32Array(N), K = new Uint16Array(N), S = new Float32Array(N), packed = new Float32Array(N * 4);
  for (let iz = 0, i = 0; iz < SIDE; iz++) {
    const a = units[Math.floor(rnd() * units.length)], b = Math.floor(rnd() * KINDS);
    for (let ix = 0; ix < SIDE; ix++, i++) {
      const k = (ix * a + b) % KINDS, q = Math.round(((Math.min(SMAX, Math.max(SMIN, size[k] * (0.8 + 0.4 * rnd()))) - SMIN) / (SMAX - SMIN)) * 255);
      X[i] = x0 + (ix + 0.1 + 0.8 * rnd()) * CELL; Z[i] = z0 + (iz + 0.1 + 0.8 * rnd()) * CELL; K[i] = k; S[i] = SMIN + (q / 255) * (SMAX - SMIN);
      packed[i * 4] = X[i]; packed[i * 4 + 1] = Z[i]; packed[i * 4 + 3] = k * 16384 + Math.floor(rnd() * 64) * 256 + q;   // (its kind, its turn, its size: whole numbers a float holds exactly)
    }
  }
  return { X, Z, K, S, packed };
}

export function createStress(scene, renderer, tex) {
  const t = PLACES.tent ?? { x: 0, z: 0 }, I0 = Math.round(t.x / CELL) - SIDE / 2, J0 = Math.round(t.z / CELL) - SIDE / 2, x0 = I0 * CELL, z0 = J0 * CELL;
  const F = field(x0, z0), list = instancedArray(F.packed, 'vec4');
  // the ground under each, worked out once on the GPU
  renderer.compute(Fn(() => { const e = list.element(instanceIndex); e.assign(vec4(e.x, e.y, groundAt(e.xy, float(0)), e.w)); })().compute(SIDE * SIDE));

  const H = createHeap(KINDS, LEVELS.map((l) => { const n = l.n === FULLN ? FULL : l.n; return { idx: trisOf(n) * 3, verts: vertsOf(n), slots: l.slots }; }));
  const LO = uniformArray(LEVELS.map((l) => l.px));
  // every kind's look, four rows of numbers a kind: [first tint, model], [second tint, metres a tile of its textures],
  // [first texture's layer, second's, gloss, sway], [how uneven its snow lies, glow, light through it, -]. Its textures:
  // two of the world's that tile (the ground's, the barks, the stones: src/materials)
  const LAYERS = recipes('material').filter((m) => ['ground', 'bark', 'stone', 'grass'].includes(m.kind)).map((m) => tex.layer(m)), look = new Float32Array(KINDS * 16);
  for (let k = 0; k < KINDS; k++) {
    const B = blobLook(k), a = Math.floor(B.texA * LAYERS.length), b = (a + 1 + Math.floor(B.texB * (LAYERS.length - 1))) % LAYERS.length;
    look.set([B.c1[0] * 1.7, B.c1[1] * 1.7, B.c1[2] * 1.7, B.model, B.c2[0] * 1.7, B.c2[1] * 1.7, B.c2[2] * 1.7, B.scale, LAYERS[a], LAYERS[b], B.gloss, B.sway, B.snow, B.glow, B.through, 0], k * 16);
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
    const gx = dFdx(q), gy = dFdy(q), sides = (read) => read(q.zy, gx.zy, gy.zy).mul(b.x).add(read(q.xz, gx.xz, gy.xz).mul(b.y)).add(read(q.xy, gx.xy, gy.xy).mul(b.z));
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

  // its last level, a dot: a pixel or two of it, so one triangle turned to the eye, as large on screen as the thing, in
  // the mean of its textures and tints, plainly lit, sinking away under a pixel. A small shader of its own: a million
  // of them are a million times its corners' work, and they read nothing of the heap.
  const vDot = varyingProperty('vec4', 'sDot');
  const dot = (src) => {
    const m = new THREE.NodeMaterial();
    m.vertexNode = Fn(() => {
      const A = src.read(0), B = src.read(1), clip = offScreen().toVar(), px = A.w.mul(PXK).div(max(camDist(A.xy), 1e-3)), sunk = smoothstep(LEVELS[L - 1].px, LEVELS[L - 1].px * SINK, px);
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
  // a tier: level i of every kind; shadow: all of it round the camera, whatever its size on screen, for the light only
  const tier = (i, shadow = false) => {
    const Lv = { lo: LEVELS[i].px, hi: i ? LEVELS[i - 1].px : Infinity }, P = shadow ? 8 : LEVELS[i].P;
    const band = { near: uniform(0), far: uniform(1), ...bandOf(Lv, FADE, padOf(CELL, P)) }, reach = uniform(SMAX / 2 + (CELL * P) / 16 + 2);
    const live = (c) => {
      const alive = float(0).toVar(), A = vec4(0).toVar(), B = vec4(0).toVar(), ix = c.x.sub(I0), iz = c.y.sub(J0);
      If(ix.greaterThanEqual(0).and(ix.lessThan(SIDE)).and(iz.greaterThanEqual(0)).and(iz.lessThan(SIDE)), () => {
        const E = list.element(uint(iz.mul(SIDE).add(ix))), pos = E.xy, dist = camDist(pos), range = shadow ? length(pos.sub(U.uCam.xz)) : dist;
        const there = range.lessThan(band.far).and(range.greaterThanEqual(band.near));
        If(shadow ? there : there.and(inView(pos, reach, SMAX)), () => {
          const q = uint(E.w), kind = q.shiftRight(uint(14)), size = float(q.bitAnd(uint(255))).mul((SMAX - SMIN) / 255).add(SMIN), span = size.mul(PXK);
          // of this level: it is there (heap.js), and the thing is the size on screen the level is drawn at, or larger
          // while its next finer level has not come
          const R = heapRow(H, kind, uint(i)), has = R.z.greaterThan(uint(0));
          const finer = dist.greaterThanEqual(span.mul(band.from).sub(band.pad)), near = i ? finer.or(R.w.shiftRight(uint(i - 1)).bitAnd(uint(1)).equal(uint(0))) : finer;
          If(shadow ? has : has.and(dist.lessThan(span.mul(band.to).add(band.pad))).and(near), () => {
            A.assign(vec4(pos, E.z.sub(size.mul(0.06)), size));
            B.assign(vec4(float(q.shiftRight(uint(8)).bitAnd(uint(63))).mul(6.2831853 / 64), float(kind), lookOf(kind, 2).w, E.x.mul(0.37).add(E.y.mul(0.71)).fract().mul(6.2831853)));   // (its turn, its kind, how far it sways, its sway's phase)
            alive.assign(1);
          });
        });
      });
      return { alive: alive.greaterThan(0.5), data: [A, B] };
    };
    const material = (src) => {
      if (i === L - 1 && !shadow) return dot(src);
      const lv = uniform(i, 'uint'), whole = uniform(shadow ? 1 : 0), lo = uniform(LEVELS[i].px), morphs = uniform(coarserOf(i) ? 1 : 0), m = new THREE.NodeMaterial();   // its level as numbers: every level is one shader
      m.vertexNode = Fn(() => {
        const A = src.read(0), B = src.read(1), clip = offScreen().toVar();
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
    const count = trisOf(LEVELS[i].n === FULLN ? FULL : LEVELS[i].n) * 3, g = new THREE.InstancedBufferGeometry();
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: count }, (_, j) => j), 1));   // (a draw as long as the level's longest mesh: its vertices are read from the heap by their number)
    const T = new Tier(scene, g, material, { cell: CELL, P, near: 0, far: 1, order: 1, live, gpu: true, cap: shadow ? 4096 : LEVELS[i].cap, slots: 2, ...(shadow ? { cull: SHADE.reach, fixed: SHADE.far * SHADE.wide } : {}) });
    T.bounds = [x0, z0, x0 + SIDE * CELL, z0 + SIDE * CELL];
    T.band = shadow ? () => { T.near = 0; T.far = SHADE.far; band.near.value = -1; band.far.value = SHADE.far * SHADE.wide; }
      : () => {
        [T.near, T.far] = band.reach(SMIN, SMAX, pxK()); if (i <= STREAMED) T.near = 0;   // (a level may stand in for the finer ones, right up to the camera)
        band.near.value = T.near > 0 ? T.near : -1; band.far.value = T.far;
      };
    T.band(); T.level = i; T.viewKeyed = !shadow; T.asset = shadow ? 'Stress: shadows' : `Stress: level ${i}`;
    if (shadow) T.mesh.layers.set(1);
    const run = T.run.bind(T); T.run = (r, world, ...a) => run(r, `${world}|${H.versions[i]}|${i && !shadow ? H.versions[i - 1] : 0}`, ...a);   // packed again when the heap has changed at its level, or the next finer (which it stands in for)
    tiers.push(T);
    return T;
  };
  for (let i = 0; i < L; i++) tier(i);
  tier(SHADE.level, true);
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
  // each frame: put in what the workers have built; and, when the camera has moved, ask for the fine levels of what now
  // stands near (coarser first: quick to build, and something to draw meanwhile), nearest first
  const pump = () => {
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
    const R = (SMAX * K * 1.2) / (LEVELS[STREAMED - 1].px * inv), R2 = R * R - dy * dy; if (R2 <= 0) return;   // (as far as the coarsest of the fine levels is asked for, and a fifth)
    const r = Math.sqrt(R2), a0 = Math.max(0, Math.floor((cam.x - r - x0) / CELL)), a1 = Math.min(SIDE - 1, Math.floor((cam.x + r - x0) / CELL)), b0 = Math.max(0, Math.floor((cam.z - r - z0) / CELL)), b1 = Math.min(SIDE - 1, Math.floor((cam.z + r - z0) / CELL));
    const asks = [], ahead = speed * 0.35;
    for (let iz = b0; iz <= b1; iz++) for (let ix = a0; ix <= a1; ix++) {
      // its size on screen now (and a fifth: asked for a little early); and as it will be when a mesh asked for now has
      // come (`ahead`: the camera travelling, a fine level it will have passed by then is not asked for)
      const i = iz * SIDE + ix, k = F.K[i], d = Math.hypot(F.X[i] - cam.x, F.Z[i] - cam.z, dy), px = (F.S[i] * K * 1.2) / Math.max(1e-3, d * inv), then = (F.S[i] * K * 1.2) / ((d + ahead) * inv);
      for (let l = STREAMED - 1; l >= 0 && px > LEVELS[l].px; l--) {
        if (H.has(k, l)) { H.touch(k, l, round); wantAt[k * L + l] = round; }
        else if (then > LEVELS[l].px) { wantAt[k * L + l] = round; if (!pending.has(k * L + l)) asks.push({ k, l, px }); }
      }
    }
    queue = asks.sort((p, q) => q.l - p.l || q.px - p.px); feed();
  };
  tiers.solid = pump;

  // for looking at it (window.__stress): how many stand and of how many kinds; what each level holds and draws now
  const API = (window.__stress = {
    heap: H, tiers, stats, levels: LEVELS, field: F, pause: false, smooth: SMOOTH,
    census() { const n = new Uint32Array(KINDS); for (const k of F.K) n[k]++; return { placed: F.K.length, kinds: n.filter(Boolean).length, least: Math.min(...n), most: Math.max(...n) }; },
    async counts() {
      const out = [];
      for (const T of tiers) {
        const [{ count, data }] = await T.read(renderer), full = LEVELS[T.level].n === FULLN; let tris = 0;
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
