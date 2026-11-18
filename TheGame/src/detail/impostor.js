// The far end of everything (intent 0038): one octahedral impostor a shape, and a plant's clumps, both baked on the GPU
// from the thing at full detail and lit live by the shading contract (src/world/light.js), like a mesh. Nothing of the
// light is baked: a texel keeps its albedo, how much of it is covered, which way it faces, how deep it lies and how
// much light reaches into it.
//
//   - the views: VIEWS x VIEWS directions over the half-sphere above (hemi-octahedral: Brucks 2018), each a cell of CELL
//     texels a side of a shape's layer, framed by the sphere round the whole thing (assets/kit/crowd.js: sphere). Where
//     it is drawn it is one quad facing the eye, and each pixel blends the three views nearest the eye's, each read where
//     the pixel's own ray meets what that view saw (one step of parallax by its depth: arycama 2024, agargaro's
//     three.js octahedral impostors), so turning round it nothing snaps and nothing slides;
//   - a plant's clumps (assets/kit/crowd.js clumpsOf): each chunk of its leaves three crossed planes, each a tile of TILE
//     texels a side, the chunk's own leaves seen along that axis;
//   - both are baked SS x SS samples a texel (what a texel covers is the share of its samples covered: the leaves' own
//     cut-outs, read at their finest, not a blur of them), and their smaller pictures keep what they cover (Castaño 2010:
//     each mip's alpha scaled, view by view, tile by tile, until as much of it is over the cut as the thing covers),
//     made on the GPU where they were baked (createMips: nothing read back, no worker, nothing kept in the browser), so
//     a far crown neither thins away nor fills into a dome.
//
// What is baked, and how it is lit, is its drawer's (src/scatter/trees.js: a plant's leaves and bark from the heap):
// here only what every impostor shares, so plants, rocks and made things can have one.
import * as THREE from 'three/webgpu';
import { Fn, Loop, Break, float, int, uint, vec2, vec3, vec4, ivec2, uvec2, uvec4, uniform, texture, storageTexture, instancedArray, normalize, cross, abs, max, clamp, floor, round, sqrt, log2, mat3, If, Discard, screenCoordinate, instanceIndex, globalId, workgroupId, localId, workgroupArray, workgroupBarrier, atomicAdd, atomicStore, atomicLoad, packHalf2x16, unpackHalf2x16, positionGeometry, varyingProperty, attribute, modelWorldMatrix, cameraProjectionMatrix, cameraViewMatrix } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { finish, skyLight, weathered, snowLift, cloudAt, unlit } from '../world/light.js';
import { CROWD, IN } from '../../assets/kit/crowd.js';
import { note } from '../core/gpu.js';
import { FNV, fnv } from '../core/hash.js';
import { compileFor } from '../core/compile.js';
import { pxAt } from './measure.js';

const { VIEWS, CELL, TILE, TILES } = CROWD;
export const SS = 4;   // samples a side a texel is baked from
export const LODS = { views: (cell = CELL) => Math.log2(cell) - 2, tiles: Math.log2(TILE) - 2 };   // the smallest picture read: 4 texels a side (a view of `cell` texels; a tile)

// ---- the views: a direction over the half-sphere above, a point of the square [-1, 1]² (and back) ----
/** The square's point (-1 … 1) of view (i, j) of VIEWS a side. */
const at = (i) => (i / (VIEWS - 1)) * 2 - 1;
/** A direction (y up, y ≥ 0) of the square's point (u, v), node or numbers. */
export const dirOf = (u, v) => { const px = u.add(v).mul(0.5), pz = u.sub(v).mul(0.5); return normalize(vec3(px, max(float(1).sub(abs(px)).sub(abs(pz)), 1e-4), pz)); };
/** The square's point of a direction (its y ≥ 0; one under the horizon is taken as on it). */
export const squareOf = (d) => { const e = vec3(d.x, max(d.y, 0), d.z), q = e.div(abs(e.x).add(e.y).add(abs(e.z)).max(1e-6)); return vec2(q.x.add(q.z), q.x.sub(q.z)); };
/** A view's picture's right and up (its direction never straight up: VIEWS is even). */
export const basisOf = (D) => { const right = normalize(cross(vec3(0, 1, 0), D)); return { right, up: cross(D, right) }; };

/** An octahedral map of a direction of length one (src/scatter/unpack.js octDir reads it back), as 0 … 1. */
export const octEnc = (n) => {
  const p = n.xy.div(abs(n.x).add(abs(n.y)).add(abs(n.z)).max(1e-6)).toVar();
  If(n.z.lessThan(0), () => { p.assign(vec2(float(1).sub(abs(p.y)).mul(p.x.greaterThanEqual(0).select(1, -1)), float(1).sub(abs(p.x)).mul(p.y.greaterThanEqual(0).select(1, -1)))); });
  return p.mul(0.5).add(0.5);
};
const octDec = (e) => { const u = e.x.mul(2).sub(1), v = e.y.mul(2).sub(1), z = float(1).sub(abs(u)).sub(abs(v)), k = max(z.negate(), 0); return normalize(vec3(u.add(u.greaterThanEqual(0).select(k.negate(), k)), v.add(v.greaterThanEqual(0).select(k.negate(), k)), z)); };

// ---- baking: where a point of the thing lands in a row's picture ----
/** Where a point q of the thing (its frame: from its sphere's middle, in its radii) lands in view (i, row) of a row of
    VIEWS views, its depth towards that view's eye (z: -1 … 1): a vertex's clip and its depth. instanceIndex: i. */
export const viewClip = (q, row) => {
  const D = dirOf(float(instanceIndex).div(VIEWS - 1).mul(2).sub(1), float(row).div(VIEWS - 1).mul(2).sub(1)), B = basisOf(D);
  const x = q.dot(B.right), y = q.dot(B.up), z = q.dot(D);
  return { clip: vec4(float(instanceIndex).add(0.5).add(x.mul(0.5)).div(VIEWS).mul(2).sub(1), y, float(0.5).sub(z.mul(0.5)), 1), z, D };
};
/** Where a point p of a plant (its own frame) lands in its tile of a row of TILES tiles: chunk c's plane across axis a
    (crowd.js PLANE), its box lo … hi; z: its depth along the axis, 0 … 1 over the box (far side 0). */
export const tileClip = (p, lo, hi, a, col) => {
  const pick = (v, k) => (k === 0 ? v.x : k === 1 ? v.y : v.z), axis = (fn) => a.equal(0).select(fn(2, 1, 0), a.equal(1).select(fn(0, 2, 1), fn(0, 1, 2)));
  const rel = (k) => pick(p, k).sub(pick(lo, k)).div(pick(hi, k).sub(pick(lo, k)).max(1e-5));
  const u = axis((U) => rel(U)), v = axis((U, V) => rel(V)), z = axis((U, V, W) => rel(W));
  return { clip: vec4(col.add(u).div(TILES).mul(2).sub(1), v.mul(2).sub(1), float(1).sub(z), 1), z };
};

// ---- the atlases: a layer a shape, its pictures and their smaller ones ----
/** Two array textures of `layers` layers, side x side texels each, and their smaller pictures down to `least` texels a
    picture of `cell` (made on the GPU as a layer is baked: createBaker): its colour (albedo as its square root, cover)
    and its data (which way it faces, octahedral; how deep; light and leaf, 0 … 1 each half). */
export function createAtlas(renderer, { name, side, layers, cell = side, least = 4 }) {
  const mips = Array.from({ length: Math.log2(cell / least) + 1 }, (_, m) => ({ width: side >> m, height: side >> m }));
  const make = () => Object.assign(new THREE.StorageArrayTexture(side, side, Math.max(2, layers)), { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace, generateMipmaps: false, mipmaps: mips });   // (two layers at least: an array, however few)
  note(`${name}`, Math.round(side * side * layers * 8 * 4 / 3), 0);
  return { colour: make(), data: make(), side, cell, least };
}

// ---- a layer's smaller pictures, made on the GPU where it was baked: nothing read back, no worker, nothing kept ----
// From the pictures the bake left (createBaker: n × n texels, a picture every `cell` texels a side), each level half the
// one before, down to `least` texels a picture, no picture bleeding into the next, written straight into the atlas'
// layer (intent 0038, the cold start: these steps ran in a worker after a readback, a shape a frame, and what came of
// them was kept in the browser, 617 MB on a first start):
//   - a texel nothing covers takes its covered neighbours' rest, ring by ring (three at the finest level, two after),
//     so nothing wrong is read beside an edge;
//   - a texel of the next level is the four under it: their mean cover, the rest as the covered ones are, by how much
//     each covers;
//   - every level's alpha is scaled picture by picture until as much of it is over the cut (0.5) as the picture covers at
//     its finest (Castaño 2010): read at any distance and alpha tested, a crown covers what its leaves cover, neither
//     thinning away nor filling into a dome.
// Between the steps a level is kept as half floats (its colour and cover; its way, octahedral, its depth and its light; a
// depth under nought: a texel nothing covers that no ring has reached yet), in two buffers every bake shares.
function createMips(side, least) {
  const P = instancedArray(side * side, 'uvec4'), Q = instancedArray(side * side, 'uvec4'), most = (side / least) ** 2;
  const scale = instancedArray(most, 'float'), cover = instancedArray(most, 'float'), uN = uniform(0, 'uint'), uC = uniform(0, 'uint'), buf = [P, Q];
  const unpack = (v0) => { const v = v0.toVar(), a = unpackHalf2x16(v.x), b = unpackHalf2x16(v.y), d = unpackHalf2x16(v.w); return { rgb: vec3(a.x, a.y, b.x), a: b.y, oct: unpackHalf2x16(v.z), d: d.x, w: d.y }; };
  const pack = (rgb, a, oct, d, w) => uvec4(packHalf2x16(rgb.xy), packHalf2x16(vec2(rgb.z, a)), packHalf2x16(oct), packHalf2x16(vec2(d, w)));
  // (a texel an invocation, 8 × 8 a workgroup; a picture a workgroup of 64, its texels shared out among them: fn(index)
  // for each)
  const texel = (body) => Fn(() => { const x = globalId.x, y = globalId.y; If(x.lessThan(uN).and(y.lessThan(uN)), () => body(x, y, y.mul(uN).add(x))); })().computeKernel([8, 8, 1]);
  const picture = (body) => Fn(() => {
    const k = workgroupId.x, per = uN.div(uC), x0 = k.mod(per).mul(uC), y0 = k.div(per).mul(uC);
    body(k, (fn) => Loop({ start: localId.x, end: uC.mul(uC), type: 'uint', condition: '<', update: 64 }, ({ i }) => fn(y0.add(i.div(uC)).mul(uN).add(x0.add(i.mod(uC))))));
  })().computeKernel([64, 1, 1]);
  const ring = (src, dst) => texel((x, y, i) => {   // (one ring)
    const v = src.element(i).toVar(), V = unpack(v);
    If(V.d.greaterThanEqual(0), () => { dst.element(i).assign(v); }).Else(() => {
      const cx = x.div(uC).mul(uC), cy = y.div(uC).mul(uC), rgb = vec3(0).toVar(), n = vec3(0).toVar(), d = float(0).toVar(), w = float(0).toVar(), k = float(0).toVar();
      for (let j = -1; j <= 1; j++) for (let h = -1; h <= 1; h++) {
        const X = int(x).add(h), Y = int(y).add(j);
        If(X.greaterThanEqual(int(cx)).and(Y.greaterThanEqual(int(cy))).and(X.lessThan(int(cx.add(uC)))).and(Y.lessThan(int(cy.add(uC)))), () => {
          const N = unpack(src.element(uint(Y).mul(uN).add(uint(X))));
          If(N.d.greaterThanEqual(0), () => { rgb.addAssign(N.rgb); n.addAssign(octDec(N.oct)); d.addAssign(N.d); w.addAssign(N.w); k.addAssign(1); });
        });
      }
      If(k.greaterThan(0), () => { dst.element(i).assign(pack(rgb.div(k), V.a, octEnc(normalize(n)), d.div(k), w.div(k))); }).Else(() => { dst.element(i).assign(v); });
    });
  });
  const half = (src, dst) => texel((x, y, i) => {   // (uN: the smaller level's side)
    const a = float(0).toVar(), wt = float(0).toVar(), rgb = vec3(0).toVar(), n = vec3(0).toVar(), d = float(0).toVar(), w = float(0).toVar();
    for (let j = 0; j < 2; j++) for (let h = 0; h < 2; h++) {
      const N = unpack(src.element(y.mul(2).add(j).mul(uN.mul(2)).add(x.mul(2).add(h)))), q = max(N.a, 1e-4);
      a.addAssign(N.a); wt.addAssign(q); rgb.addAssign(N.rgb.mul(q)); n.addAssign(octDec(N.oct).mul(q)); d.addAssign(max(N.d, 0).mul(q)); w.addAssign(N.w.mul(q));
    }
    dst.element(i).assign(pack(rgb.div(wt), a.div(4), octEnc(normalize(n)), a.greaterThan(0).select(d.div(wt), float(-1)), w.div(wt)));
  });
  const byte = (a) => uint(round(clamp(a, 0, 1).mul(255)));   // (as the bytes say it)
  const sum = workgroupArray('uint', 1).toAtomic(), hist = workgroupArray('uint', 256).toAtomic();
  const covered = picture((k, each) => {   // (how much each picture covers at its finest)
    If(localId.x.equal(uint(0)), () => { atomicStore(sum.element(uint(0)), uint(0)); });
    workgroupBarrier();
    each((i) => { atomicAdd(sum.element(uint(0)), byte(unpack(P.element(i)).a)); });
    workgroupBarrier();
    If(localId.x.equal(uint(0)), () => { cover.element(k).assign(float(atomicLoad(sum.element(uint(0)))).div(float(uC.mul(uC)).mul(255))); });
  });
  const scaled = (src) => picture((k, each) => {   // (its alpha's 256 steps counted; the step above which as much lies as it covers, onto the cut)
    Loop({ start: localId.x, end: uint(256), type: 'uint', condition: '<', update: 64 }, ({ i }) => { atomicStore(hist.element(i), uint(0)); });
    workgroupBarrier();
    each((i) => { atomicAdd(hist.element(byte(unpack(src.element(i)).a)), uint(1)); });
    workgroupBarrier();
    If(localId.x.equal(uint(0)), () => {
      const want = uint(round(cover.element(k).mul(float(uC.mul(uC))))), over = uint(0).toVar(), t = int(255).toVar(), s = float(1 / 16).toVar();
      If(want.greaterThan(uint(0)), () => {
        Loop(t.greaterThan(int(0)), () => { const h = atomicLoad(hist.element(uint(t))); If(over.add(h).greaterThan(want), () => { Break(); }); over.addAssign(h); t.subAssign(1); });
        s.assign(clamp(float(127.5).div(max(float(t).add(0.5), 0.5)), 1 / 16, 16));
      });
      scale.element(k).assign(s);
    });
  });
  const rings = [ring(P, Q), ring(Q, P)], halves = [half(P, Q), half(Q, P)], scales = [scaled(P), scaled(Q)], loads = new WeakMap(), writes = new WeakMap();
  /** The pictures a baker left in its targets into P (a texel nothing covers: its depth under nought). */
  const loadOf = (outC, outD) => { if (!loads.has(outC)) loads.set(outC, texel((x, y, i) => { const c = texture(outC).load(ivec2(x, y)), d = texture(outD).load(ivec2(x, y)); P.element(i).assign(pack(c.rgb, c.a, d.xy, c.a.greaterThan(0).select(d.z, float(-1)), d.w)); })); return loads.get(outC); };
  /** Level `mip` (in buffer b) into layer `layer` of the atlas, its alpha scaled picture by picture: a kernel an atlas,
      a level and a buffer (a storage binding is one mip of one texture). */
  const writeOf = (A, b, mip, layer) => {
    let W = writes.get(A); if (!W) writes.set(A, (W = new Map()));
    const key = `${b} ${mip}`;
    if (!W.has(key)) W.set(key, texel((x, y, i) => {
      const V = unpack(buf[b].element(i)), s = scale.element(y.div(uC).mul(uN.div(uC)).add(x.div(uC)));
      const store = (t, v) => { const n = storageTexture(t, uvec2(x, y), v); n.mipLevel = mip; n.depthNode = layer; n.mergeable = false; n.toStack(); };
      store(A.colour, vec4(V.rgb, clamp(V.a.mul(s), 0, 1))); store(A.data, vec4(V.oct, max(V.d, 0), V.w));
    }));
    return W.get(key);
  };
  // the buffer each level ends in, and the kernels a bake runs, in order (k: a kernel, n: its texels a side or, a
  // picture's, its pictures; side, cell: the level's)
  const plan = (n, cell) => {
    const steps = [], at = [], go = (k, s, c, many = false) => steps.push({ k, s, c, many });
    let b = 0, s = n, c = cell, mip = 0;
    go('load', s, c); go(covered, s, c, true);
    for (let j = 0; j < 3; j++) { go(rings[b], s, c); b = 1 - b; }   // (three rings at the finest level, two after, as the worker had them)
    for (;;) {
      go(scales[b], s, c, true); at.push(b); go({ write: [b, mip] }, s, c);
      if (c / 2 < least) break;
      s /= 2; c /= 2; mip++;
      go(halves[b], s, c); b = 1 - b;
      for (let j = 0; j < 2; j++) { go(rings[b], s, c); b = 1 - b; }
    }
    return steps;
  };
  return {
    side, least,
    /** Every kernel a bake of n × n texels (pictures of `cell`) into atlas A runs (to compile them, aside). */
    kernels: (outC, outD, A, layer, n, cell) => plan(n, cell).map(({ k }) => (k === 'load' ? loadOf(outC, outD) : k.write ? writeOf(A, ...k.write, layer) : k)),
    /** The smaller pictures of what the bake left in outC and outD into A's layer `layer` (a uniform it has set): the
        kernels in order, each seeing what the one before wrote. */
    run(renderer, outC, outD, A, layer, n, cell) {
      for (const { k, s, c, many } of plan(n, cell)) {
        uN.value = s; uC.value = c;
        renderer.compute(k === 'load' ? loadOf(outC, outD) : k.write ? writeOf(A, ...k.write, layer) : k, many ? [(s / c) ** 2, 1, 1] : [Math.ceil(s / 8), Math.ceil(s / 8), 1]);
      }
    },
  };
}
let MIPS = null;
/** The steps every bake shares, for pictures of `side` texels (made again larger when a larger bake comes). */
const mipsFor = (side, least) => (MIPS && MIPS.side >= side && MIPS.least <= least ? MIPS : (MIPS = createMips(Math.max(side, MIPS?.side ?? 0), Math.min(least, MIPS?.least ?? least))));

// ---- the bake: a row of pictures at a time, SS x SS samples a texel, reduced; then the layer's smaller pictures ----
/** What bakes a family's pictures: rows of `per` pictures `px` texels a side, drawn by draw(row) (a mesh whose
    instances are the row's pictures, its two materials, userData.materials: [colour, data]), reduced SS x SS into the
    atlas' texels, and made smaller, all on the GPU. One a kind of picture (views, tiles) and size: its targets are
    reused bake after bake. */
export function createBaker(renderer, { per, px }) {
  const W = per * px, opts = { depthBuffer: true, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, colorSpace: THREE.NoColorSpace };
  const ss = [new THREE.RenderTarget(W * SS, px * SS, opts), new THREE.RenderTarget(W * SS, px * SS, opts)], out = [new THREE.RenderTarget(W, W, { ...opts, depthBuffer: false }), new THREE.RenderTarget(W, W, { ...opts, depthBuffer: false })];
  // the reduce: a texel of the atlas from its SS x SS samples (cover: their share covered; the rest: the covered ones'
  // mean, its way the mean way), into row `row` of the atlas
  const row = uniform(0, 'int'), tc = texture(ss[0].texture), td = texture(ss[1].texture);
  const reduce = (which) => {
    const m = new THREE.NodeMaterial(); m.depthTest = false; m.depthWrite = false;
    m.vertexNode = vec4(positionGeometry.xy, 0, 1);   // (a triangle over the whole target, its corners straight in clip space)
    m.fragmentNode = Fn(() => {
      const p = ivec2(screenCoordinate.xy), base = ivec2(p.x.mul(SS), p.y.sub(row.mul(px)).mul(SS));
      const cov = float(0).toVar(), col = vec3(0).toVar(), nrm = vec3(0).toVar(), dep = float(0).toVar(), lit = float(0).toVar();
      for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
        const q = base.add(ivec2(dx, dy)), c = tc.load(q), d = td.load(q), a = c.a;
        cov.addAssign(a); col.addAssign(c.rgb.mul(a)); nrm.addAssign(octDec(d.xy).mul(a)); dep.addAssign(d.z.mul(a)); lit.addAssign(d.w.mul(a));
      }
      const k = float(1).div(cov.max(1e-6));
      return which ? vec4(octEnc(normalize(nrm.add(vec3(0, 0, 1e-6)))), dep.mul(k), lit.mul(k)) : vec4(col.mul(k), cov.div(SS * SS));
    })();
    return m;
  };
  const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const tris = [0, 1].map((which) => Object.assign(new THREE.Mesh(tri, reduce(which)), { frustumCulled: false }));
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), layer = uniform(0, 'int'), made = new Map();
  // what a bake draws with, made before it is first drawn, aside, in turn (src/core/compile.js): the mesh's two materials
  // and the reduce for their targets, the smaller pictures' kernels; once a mesh and an atlas
  const as = (w) => function (o, s, c, g, m, ...rest) { return Object.getPrototypeOf(renderer).renderObject.call(this, o, s, c, g, o.userData.materials?.[w] ?? m, ...rest); };
  const makeFor = (mesh, A, least) => {
    const key = `${mesh.uuid} ${A.colour.uuid} ${least}`;
    if (!made.has(key)) {
      mesh.material ??= mesh.userData.materials[0];   // (three reads a mesh's material as it lays out what it compiles)
      const M = mipsFor(W, least);
      made.set(key, Promise.all([...[0, 1].flatMap((w) => [compileFor(renderer, ss[w], mesh, cam, scene, as(w)), compileFor(renderer, out[w], tris[w], cam, scene)]), renderer.compileComputeAsync(M.kernels(out[0].texture, out[1].texture, A, layer, W, px))]));
    }
    return made.get(key);
  };
  return {
    /** Bake `count` rows of a thing's pictures into the atlas' layer, and its smaller pictures down to `least` texels a
        picture: draw(r) its mesh for row r (its instances the row's pictures). A promise, once it is in (on the GPU, in
        order before whatever draws next): its pipelines are made first, once a mesh and an atlas. */
    async bake(A, at, count, draw, least = A.least) {
      await makeFor(draw(0), A, least);
      const prev = renderer.getRenderTarget(), pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha(), ac = renderer.autoClear;
      renderer.setClearColor(0x000000, 0);
      try {
        for (const o of out) { renderer.setRenderTarget(o); renderer.clear(); }
        for (let r = 0; r < count; r++) {
          const mesh = draw(r);
          // the row's samples: colour and cover, then its data, each drawn whole (a target cleared to nothing)
          [0, 1].forEach((w) => { mesh.material = mesh.userData.materials[w]; scene.add(mesh); renderer.setRenderTarget(ss[w]); renderer.autoClear = true; renderer.render(scene, cam); scene.remove(mesh); });
          // reduced into the atlas' row
          row.value = r;
          [0, 1].forEach((w) => { const o = out[w]; o.viewport.set(0, r * px, W, px); o.scissor.set(0, r * px, W, px); o.scissorTest = true; scene.add(tris[w]); renderer.setRenderTarget(o); renderer.autoClear = false; renderer.render(scene, cam); scene.remove(tris[w]); o.viewport.set(0, 0, W, W); o.scissor.set(0, 0, W, W); o.scissorTest = false; });
        }
      } finally { renderer.setRenderTarget(prev); renderer.setClearColor(pc, pa); renderer.autoClear = ac; }
      layer.value = at; mipsFor(W, least).run(renderer, out[0].texture, out[1].texture, A, layer, W, px);
    },
  };
}

// ---- reading them: a picture's texel, clamped inside its cell at the level read ----
const inCell = (uv, cellPx, lod) => { const h = float(0.5).mul(float(2).pow(floor(lod).add(1))).div(cellPx); return clamp(uv, h, float(1).sub(h)); };
/** A shape's impostor read where a pixel's ray meets it, the three views nearest the eye's blended: { colour (albedo,
    gamma 2), cover, normal (its own frame), depth (along the eye's view, in radii), light (0 … 1), leaf (0 … 1) }.
    p: the pixel's point on the quad, eye: the eye, both in the thing's frame from its sphere's middle in its radii;
    V: the views and their weights (impostorViews, worked out once for the thing); lod: the level read. */
export function impostorRead(A, layer, p, eye, V, lod) {
  const rd = normalize(p.sub(eye)).toVar(), out = { colour: vec3(0).toVar(), cover: float(0).toVar(), normal: vec3(0).toVar(), depth: float(0).toVar(), lit: float(0).toVar() };
  const C = texture(A.colour), Dt = texture(A.data);
  for (let k = 0; k < 3; k++) {
    const g = V.cells[k], w = [V.w.x, V.w.y, V.w.z][k], D = dirOf(g.x.div(VIEWS - 1).mul(2).sub(1), g.y.div(VIEWS - 1).mul(2).sub(1)), B = basisOf(D), dd = rd.dot(D).min(-1e-3);
    const uvAt = (h) => { const t = h.sub(p.dot(D)).div(dd), q = p.add(rd.mul(t)); return vec2(q.dot(B.right), q.dot(B.up)).mul(0.5).add(0.5); };
    const st = (uv) => { const c = inCell(uv, float(A.cell), lod); return vec2(g.x.add(c.x), g.y.add(float(1).sub(c.y))).div(VIEWS); };
    const h0 = Dt.sample(st(uvAt(float(0)))).depth(layer).level(lod).z.mul(2).sub(1), uv = uvAt(h0), s = st(uv);   // (one step of parallax: where the ray stands as high over the view's plane as what the view saw there)
    const c = C.sample(s).depth(layer).level(lod), d = Dt.sample(s).depth(layer).level(lod);
    out.colour.addAssign(c.rgb.mul(w)); out.cover.addAssign(c.a.mul(w)); out.normal.addAssign(octDec(d.xy).mul(w)); out.depth.addAssign(d.z.mul(2).sub(1).mul(w)); out.lit.addAssign(d.w.mul(w));
  }
  return { ...out, normal: normalize(out.normal.add(vec3(0, 1e-5, 0))), ...litOf(out.lit) };
}
/** A texel's light and leaf, as the bake keeps them in one number (light / 2, and a half more for a leaf). */
const litOf = (v) => { const leaf = v.greaterThanEqual(0.5); return { leaf: leaf.select(float(1), float(0)), light: leaf.select(v.mul(2).sub(1), v.mul(2)) }; };
/** The same as the bake writes it. */
export const litIn = (light, leaf) => light.clamp(0, 0.999).mul(0.5).add(leaf.mul(0.5));

/** The three views nearest the eye's way d (the thing's frame, from its middle towards the eye), and their weights:
    the grid's triangle the way falls in (two of a cell's four corners and the nearer of the other two). Once for a
    thing (its vertex stage): { cells: [vec2 × 3] (view i, j), w: vec3 }. */
export const impostorViews = (d) => {
  const g = squareOf(d).mul(0.5).add(0.5).mul(VIEWS - 1).clamp(0, VIEWS - 1 - 1e-4), c = floor(g), f = g.sub(c), up = f.x.add(f.y).greaterThan(1);
  const a = up.select(c.add(vec2(1, 1)), c), b = c.add(vec2(1, 0)), e = c.add(vec2(0, 1));
  const w = up.select(vec3(f.x.add(f.y).sub(1), float(1).sub(f.y), float(1).sub(f.x)), vec3(float(1).sub(f.x).sub(f.y), f.x, f.y));
  return { cells: [a, b, e], w };
};
/** A plant's clump read at uv (in tiles of the kit's grid, TILES a row: crowd.js levelOf), at level lod, clamped inside
    its tile there, the tile where it lies in the atlas' own grid (as many a side as its stand's largest clumps need:
    src/scatter/trees.js): { colour, cover, normal, lit, leaf } as impostorRead. */
export function clumpRead(A, layer, uv, lod) {
  const n = A.side / TILE, t = floor(uv), k = t.y.mul(TILES).add(t.x), at = vec2(k.sub(floor(k.div(n)).mul(n)), floor(k.div(n)));
  const s = inCell(uv.sub(t).sub(IN).div(1 - 2 * IN), float(TILE), lod).add(at).div(n), c = texture(A.colour).sample(s).depth(layer).level(lod), d = texture(A.data).sample(s).depth(layer).level(lod);
  return { colour: c.rgb, cover: c.a, normal: octDec(d.xy), ...litOf(d.w) };
}

// ---- a made thing's impostor (src/world/place.js: the library's stage): the same views of its nearest level ----
let renderer = null, BAKERS = null; const kept = new Map();   // a recipe's hash -> its views, baked once a recipe
/** The game's renderer bakes the impostors (set once by src/boot.js). */
export const setImpostorRenderer = (r) => (renderer = r);
/** Whether a made thing's impostor can be baked and drawn here (WebGPU): without, its faces are its last level. */
export const canBake = () => !!renderer?.backend?.isWebGPUBackend;
/** The bakers every impostor shares (their targets reused shape after shape): the views' (views(cell): one a size of a view), and a plant's clumps' tiles (tiles(n): one a size of a grid, n tiles a row). */
export const bakers = (r = renderer) => (BAKERS ||= { of: new Map(), views(cell = CELL) { let b = this.of.get(cell); if (!b) this.of.set(cell, (b = createBaker(r, { per: VIEWS, px: cell }))); return b; }, tiles(n = TILES) { let b = this.of.get(-n); if (!b) this.of.set(-n, (b = createBaker(r, { per: n, px: TILE }))); return b; } });
/** A recipe's hash: its geometry's numbers, so a changed recipe bakes again. */
const hashOf = (geo) => { let h = FNV; const a = geo.attributes.position.array, c = geo.attributes.color?.array || []; for (let i = 0; i < a.length; i += 7) h = fnv(h, Math.round(a[i] * 1000)); for (let i = 0; i < c.length; i += 11) h = fnv(h, Math.round(c[i] * 1000)); return `${a.length}:${(h >>> 0).toString(36)}`; };
/** A made thing's views (geo: its nearest level, its colours a vertex; c, r: its sphere) baked into an atlas of its own:
    { A, ready (1 once they are in) }. */
function viewsOf(geo, c, r, name) {
  const A = createAtlas(renderer, { name: `a made thing's impostor ${name}`, side: VIEWS * CELL, layers: 2, cell: CELL }), ready = uniform(0), row = uniform(0, 'int'), g = new THREE.InstancedBufferGeometry();
  g.index = geo.index; for (const k of ['position', 'normal', 'color']) if (geo.attributes[k]) g.setAttribute(k, geo.attributes[k]);
  const vC = varyingProperty('vec3', 'mC'), vN = varyingProperty('vec3', 'mN'), vZ = varyingProperty('float', 'mZ');
  const vert = Fn(() => { const P = viewClip(positionGeometry.sub(c).div(r), row), n = attribute('normal', 'vec3'); vC.assign(attribute('color', 'vec3')); vN.assign(n.dot(P.D).lessThan(0).select(n.negate(), n)); vZ.assign(P.z); return P.clip; })();
  const mat = (f) => Object.assign(new THREE.NodeMaterial(), { vertexNode: vert, fragmentNode: f, side: THREE.DoubleSide });
  const bm = Object.assign(new THREE.Mesh(g, null), { frustumCulled: false, userData: { materials: [mat(vec4(sqrt(max(vC, 0)), 1)), mat(Fn(() => vec4(octEnc(normalize(vN)), vZ.mul(0.5).add(0.5), litIn(float(1), float(0))))())] } });
  bakers().views().bake(A, 0, VIEWS, (j) => { row.value = j; g.instanceCount = VIEWS; return bm; }).then(() => (ready.value = 1));
  return { A, ready };
}
/** An asset's impostor as a mesh (its nearest level, geo): its views baked as it is first asked for (once a recipe),
    drawn once they are in (none without WebGPU); one quad facing the eye, each pixel its three nearest views blended,
    lit live as the asset's own material lights it. Its `sunk`: how far its thing's last level has sunk
    (src/detail/handover.js). */
export function impostorOf(geo, snow = { clumps: 0.08 }) {
  const m = new THREE.NodeMaterial(), sunk = (m.sunk = uniform(1));
  geo.computeBoundingSphere(); const { center: c0, radius: r } = geo.boundingSphere, c = vec3(c0.x, c0.y, c0.z);
  if (renderer?.backend?.isWebGPUBackend) {
    const key = hashOf(geo); if (!kept.has(key)) kept.set(key, viewsOf(geo, c, r, key));
    const { A, ready } = kept.get(key), vP = varyingProperty('vec3', 'vP'), vE = varyingProperty('vec3', 'vE'), vA = varyingProperty('vec4', 'vA'), vB = varyingProperty('vec2', 'vB'), vW = varyingProperty('vec3', 'vW'), vL = varyingProperty('float', 'vL'), vX = varyingProperty('vec3', 'vX');
    const M = mat3(modelWorldMatrix[0].xyz, modelWorldMatrix[1].xyz, modelWorldMatrix[2].xyz), k = modelWorldMatrix[0].xyz.length();
    m.vertexNode = Fn(() => {
      // (its sphere in the world, sinking as its thing's last level does: lower first, then narrower)
      const C = modelWorldMatrix.mul(vec4(c.mul(vec3(1, sunk, 1)), 1)).xyz, d = normalize(U.uCam.sub(C)), right = normalize(cross(vec3(0, 1, 0), d).add(vec3(1e-6, 0, 0))), up = cross(d, right);
      const w = C.add(right.mul(positionGeometry.x).add(up.mul(positionGeometry.y)).mul(k.mul(r).mul(sunk.sqrt())));
      vP.assign(M.transpose().mul(w.sub(C)).div(k.mul(k).mul(r).mul(sunk.sqrt()))); vE.assign(M.transpose().mul(U.uCam.sub(C)).div(k.mul(k).mul(r).mul(sunk.sqrt()))); vX.assign(w);
      const V = impostorViews(normalize(M.transpose().mul(d))); vA.assign(vec4(V.cells[0], V.cells[1])); vB.assign(V.cells[2]); vW.assign(V.w);
      vL.assign(clamp(log2(float(CELL).div(pxAt(k.mul(2 * r), U.uCam.sub(C).length().mul(U.uLodInv)).max(1e-3))), 0, LODS.views()));   // (its texels one to a pixel drawn)
      return ready.greaterThan(0.5).select(cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(w, 1)), vec4(2, 2, 2, 1));
    })();
    m.fragmentNode = Fn(() => {
      const R = impostorRead(A, float(0), vP, vE, { cells: [vA.xy, vA.zw, vB], w: vW }, vL), out = vec4(0).toVar();
      If(R.cover.lessThan(0.5), () => { Discard(); });
      If(unlit().not(), () => {   // drawn into the shadow map, only its outline counts: no light
        const n = normalize(M.mul(R.normal)), col = weathered(R.colour.mul(R.colour), n, snowLift(vX, snow.clumps)).mul(skyLight(n).add(U.uSun.mul(cloudAt(vX)).mul(max(n.dot(U.uSunDir), 0).mul(0.8).add(0.2))));   // as the asset's own material lights it
        out.assign(finish(col, vX));
      });
      return out;
    })();
  } else m.vertexNode = vec4(2, 2, 2, 1);   // (no impostor without WebGPU: its last level sinks away)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); mesh.frustumCulled = false; mesh.renderOrder = 1;
  return mesh;
}
