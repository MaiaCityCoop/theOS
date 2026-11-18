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
//     made in a worker (impostor.worker.js), so a far crown neither thins away nor fills into a dome.
//
// What is baked, and how it is lit, is its drawer's (src/scatter/trees.js: a plant's leaves and bark from the heap):
// here only what every impostor shares, so plants, rocks and made things can have one.
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, ivec2, uniform, texture, normalize, cross, abs, max, clamp, floor, sqrt, log2, mat3, If, Discard, screenCoordinate, instanceIndex, positionGeometry, varyingProperty, attribute, modelWorldMatrix, cameraProjectionMatrix, cameraViewMatrix } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { finish, skyLight, weathered, snowLift, cloudAt, unlit } from '../world/light.js';
import { CROWD, IN } from '../../assets/kit/crowd.js';
import { note } from '../core/gpu.js';
import { FNV, fnv } from '../core/hash.js';
import { pxAt, drawnAt } from './measure.js';

const { VIEWS, CELL, TILE, TILES } = CROWD;
export const SS = 4;   // samples a side a texel is baked from
export const LODS = { views: Math.log2(CELL) - 2, tiles: Math.log2(TILE) - 2 };   // the smallest picture read: 4 texels a side

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
/** Two array textures of `layers` layers, side x side texels each: its colour (albedo as its square root, cover) and its
    data (which way it faces, octahedral; how deep; light and leaf, 0 … 1 each half). put(layer, levels): its pictures
    from the worker, each level's two arrays, into the GPU. */
export function createAtlas(renderer, { name, side, layers }) {
  const make = () => {
    const rt = new THREE.RenderTarget(side, side, { depth: Math.max(2, layers), depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });   // (two layers at least: an array, however few shapes)
    renderer.initRenderTarget(rt); return rt;
  };
  const C = make(), D = make(), mips = Math.floor(Math.log2(side)) + 1;
  note(`${name}`, Math.round(side * side * layers * 8 * 4 / 3), 0);
  return {
    colour: C.texture, data: D.texture, side, targets: [C, D],   // (targets: to read a layer back, renderer.readRenderTargetPixelsAsync)
    put(layer, levels) {
      const dev = renderer.backend.device, gc = renderer.backend.get(C.texture).texture, gd = renderer.backend.get(D.texture).texture;
      levels.forEach(({ colour, data, n }, m) => {
        if (m >= mips) return;
        for (const [g, a] of [[gc, colour], [gd, data]]) dev.queue.writeTexture({ texture: g, mipLevel: m, origin: { x: 0, y: 0, z: layer } }, a, { bytesPerRow: n * 4, rowsPerImage: n }, { width: n, height: n, depthOrArrayLayers: 1 });
      });
    },
  };
}

// ---- the bake: a row of pictures at a time, SS x SS samples a texel, reduced on the GPU, read back, mipped in a worker ----
let WORKERS = null, nextJob = 0; const waiting = new Map();
const workers = () => (WORKERS ||= Array.from({ length: Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2)) }, () => {
  const w = new Worker(new URL('./impostor.worker.js', import.meta.url), { type: 'module' }); w.busy = 0;
  w.onmessage = ({ data }) => { w.busy--; waiting.get(data.id)?.(data); waiting.delete(data.id); };
  return w;
}));
/** The pictures' smaller ones, as a worker makes them (impostor.worker.js, the least busy of a few): { levels: [{ colour,
    data, n }] }. */
const mipsOf = (colour, data, side, cell, least) => new Promise((res) => { const id = nextJob++, w = workers().reduce((a, b) => (b.busy < a.busy ? b : a)); w.busy++; waiting.set(id, res); w.postMessage({ id, colour, data, side, cell, least }, [colour.buffer, data.buffer]); });

/** What bakes a family's pictures: rows of `per` pictures `px` texels a side, drawn by draw(row) (a mesh whose
    instances are the row's pictures, its two materials' outputs: { colour, data }), reduced SS x SS into the atlas'
    texels, read back and mipped. One a kind of picture (views, tiles) per drawer: its targets are reused job after job. */
export function createBaker(renderer, { per, px, rows }) {
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
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    /** Bake `rows` rows of a thing's pictures into the atlas' layer: draw(r) its mesh for row r (its instances the
        row's pictures, its materials [colour, data]); least: the smallest picture's side mipped to. A promise of
        { done }, once its pictures are read back (the targets free for the next): done, once its layer is in the atlas,
        with its levels (what the browser keeps of it: src/scatter/trees.js farOf). */
    async bake(atlas, layer, count, draw, least = 4) {
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
      const [c, d] = await Promise.all(out.map((o) => renderer.readRenderTargetPixelsAsync(o, 0, 0, W, W)));
      return { done: mipsOf(new Uint8Array(c), new Uint8Array(d), W, px, least).then(({ levels }) => { atlas.put(layer, levels); return levels; }) };
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
    const st = (uv) => { const c = inCell(uv, float(CELL), lod); return vec2(g.x.add(c.x), g.y.add(float(1).sub(c.y))).div(VIEWS); };
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
/** A plant's clump read at uv (in tiles: crowd.js levelOf), at level lod, clamped inside its tile there: { colour,
    cover, normal, lit, leaf } as impostorRead. */
export function clumpRead(A, layer, uv, lod) {
  const t = floor(uv), s = inCell(uv.sub(t).sub(IN).div(1 - 2 * IN), float(TILE), lod).add(t).div(TILES), c = texture(A.colour).sample(s).depth(layer).level(lod), d = texture(A.data).sample(s).depth(layer).level(lod);
  return { colour: c.rgb, cover: c.a, normal: octDec(d.xy), ...litOf(d.w) };
}

// ---- a made thing's impostor (src/world/place.js: the library's stage): the same views of its nearest level ----
let renderer = null, BAKERS = null; const kept = new Map();   // a recipe's hash -> its views, baked once a recipe
/** The game's renderer bakes the impostors (set once by src/main.js). */
export const setImpostorRenderer = (r) => (renderer = r);
/** The bakers every impostor shares (their targets reused shape after shape): the views', and a plant's clumps' tiles. */
export const bakers = (r = renderer) => (BAKERS ||= { views: createBaker(r, { per: VIEWS, px: CELL }), tiles: createBaker(r, { per: TILES, px: TILE }) });
/** A recipe's hash: its geometry's numbers, so a changed recipe bakes again. */
const hashOf = (geo) => { let h = FNV; const a = geo.attributes.position.array, c = geo.attributes.color?.array || []; for (let i = 0; i < a.length; i += 7) h = fnv(h, Math.round(a[i] * 1000)); for (let i = 0; i < c.length; i += 11) h = fnv(h, Math.round(c[i] * 1000)); return `${a.length}:${(h >>> 0).toString(36)}`; };
/** A made thing's views (geo: its nearest level, its colours a vertex; c, r: its sphere) baked into an atlas of its own:
    { A, ready (1 once they are in) }. */
function viewsOf(geo, c, r, name) {
  const A = createAtlas(renderer, { name: `a made thing's impostor ${name}`, side: VIEWS * CELL, layers: 2 }), ready = uniform(0), row = uniform(0, 'int'), g = new THREE.InstancedBufferGeometry();
  g.index = geo.index; for (const k of ['position', 'normal', 'color']) if (geo.attributes[k]) g.setAttribute(k, geo.attributes[k]);
  const vC = varyingProperty('vec3', 'mC'), vN = varyingProperty('vec3', 'mN'), vZ = varyingProperty('float', 'mZ');
  const vert = Fn(() => { const P = viewClip(positionGeometry.sub(c).div(r), row), n = attribute('normal', 'vec3'); vC.assign(attribute('color', 'vec3')); vN.assign(n.dot(P.D).lessThan(0).select(n.negate(), n)); vZ.assign(P.z); return P.clip; })();
  const mat = (f) => Object.assign(new THREE.NodeMaterial(), { vertexNode: vert, fragmentNode: f, side: THREE.DoubleSide });
  const bm = Object.assign(new THREE.Mesh(g, null), { frustumCulled: false, userData: { materials: [mat(vec4(sqrt(max(vC, 0)), 1)), mat(Fn(() => vec4(octEnc(normalize(vN)), vZ.mul(0.5).add(0.5), litIn(float(1), float(0))))())] } });
  bakers().views.bake(A, 0, VIEWS, (j) => { row.value = j; g.instanceCount = VIEWS; return bm; }).then(({ done }) => done).then(() => (ready.value = 1));
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
      vL.assign(clamp(log2(float(CELL).div(drawnAt(pxAt(k.mul(2 * r), U.uCam.sub(C).length().mul(U.uLodInv))).max(1e-3))), 0, LODS.views));   // (its texels one to a pixel drawn)
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
