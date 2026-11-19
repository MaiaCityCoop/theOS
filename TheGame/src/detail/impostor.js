// The far end of everything (intent 0038): one octahedral impostor a shape, and a plant's clumps, both baked on the GPU
// from the thing at full detail and lit live by the shading contract (src/world/light.js), like a mesh. Nothing of the
// light is baked: a texel keeps its albedo, how much of it is covered, which way it faces, how deep it lies and how
// much light reaches into it.
//
//   - the views: VIEWS x VIEWS directions over the half-sphere above (hemi-octahedral: Brucks 2018), each a cell of CELL
//     texels a side of a shape's layer, framed by the sphere round the whole thing (assets/kit/crowd.js: sphere). Where
//     it is drawn it is one quad facing the eye, and each pixel blends the three views nearest its own ray's way, each
//     read where that ray crosses the view's plane through the thing's middle (its error then the views' spacing times
//     the sphere's radius, src/detail/atlas.js), so turning round it nothing snaps and nothing slides, and no pixel reads views chosen for
//     another (the error src/detail/atlas.js spacingOf counts is each pixel's own); each picture keeps its normals in
//     its own frame, where they face it (facingOf), so what is filtered between its texels is a way between theirs;
//   - a plant's clumps (assets/kit/crowd.js clumpsOf): each chunk of its leaves three crossed planes, each a tile of TILE
//     texels a side, the chunk's own leaves seen along that axis;
//   - how many views, how many texels, how many chunks: atlases(), from the share of memory the atlases are given and
//     the limits every device grants (src/detail/atlas.js atlasesOf);
//   - both are baked SS x SS samples a texel (what a texel covers is the share of its samples covered: the leaves' own
//     cut-outs, read at their finest, not a blur of them), as many pictures a frame as the GPU's pace says (a picture of
//     a large tree is a whole crown drawn, a row of them hundreds of milliseconds), and their smaller pictures keep
//     what they cover (Castaño 2010: each mip's alpha scaled, view by view, tile by tile, until as much of it is over the
//     cut as the thing covers), made in a worker (impostor.worker.js), so a far crown neither thins away nor fills into
//     a dome.
//
// What is baked, and how it is lit, is its drawer's (src/scatter/trees.js: a plant's leaves and bark from the heap):
// here only what every impostor shares, so plants, rocks and made things can have one.
import * as THREE from 'three/webgpu';
import { Fn, mrt, float, vec2, vec3, vec4, ivec2, uniform, texture, normalize, cross, abs, max, clamp, floor, ceil, sqrt, inverseSqrt, log2, mat3, If, Discard, screenCoordinate, instanceIndex, positionGeometry, varyingProperty, attribute, modelWorldMatrix, cameraProjectionMatrix, cameraViewMatrix } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { lit, weathered, snowLift, unlit } from '../world/light.js';
import { passOf } from '../core/pass.js';
import { IN, PLANE } from '../../assets/kit/crowd.js';
import { UV_TILES } from '../../assets/kit/plant.js';
import { makeOwned, PORTABLE, budgetShare } from '../core/gpu.js';
import { ownGpuMs, pace, frameShare } from '../core/pace.js';
import { shown } from '../core/settle.js';
import { compileFor } from '../core/compile.js';
import { SHARE_MB } from '../core/classes.js';
import { FNV, fnv } from '../core/hash.js';
import { workerPool } from '../core/workers.js';
import { pxAt } from './measure.js';
import { atlasesOf, atlasBytes, levelsUnder, SS, LEAST, PICTURES } from './atlas.js';
import { farLayers } from '../scatter/entries.js';

/** The numbers the plants' far ends' atlases are sized by: { VIEWS, CELL, TILE, TILES, CLUMPS, key } (src/detail/atlas.js
    atlasesOf), from the far ends the stands bake (src/scatter/entries.js farLayers), the share of memory they are given
    (src/core/classes.js SHARE_MB) and the limits every device grants (src/core/gpu.js PORTABLE): the same on every
    device and at every start of the same world. Handed to the crowd kit wherever it builds a far end (in the recipes'
    workers with each level's band: src/scatter/trees.js); a made thing's card takes the same views. */
let ATLASES = null;
export const atlases = () => (ATLASES ||= atlasesOf({ layers: farLayers(), bytes: SHARE_MB.geometry.atlases * 2 ** 20 * budgetShare(), limits: PORTABLE, tiles: UV_TILES }));   // (their share of geometry's budget on this device: src/core/gpu.js budgetShare)

// ---- the views: a direction over the half-sphere above, a point of the square [-1, 1]² (and back) ----
/** A direction (y up, y ≥ 0) of the square's point (u, v), node or numbers. */
export const dirOf = (u, v) => { const px = u.add(v).mul(0.5), pz = u.sub(v).mul(0.5); return normalize(vec3(px, max(float(1).sub(abs(px)).sub(abs(pz)), 1e-4), pz)); };
/** The square's point of a direction (its y ≥ 0; one under the horizon is taken as on it). */
export const squareOf = (d) => { const e = vec3(d.x, max(d.y, 0), d.z), q = e.div(abs(e.x).add(e.y).add(abs(e.z)).max(1e-6)); return vec2(q.x.add(q.z), q.x.sub(q.z)); };
/** A view's picture's right and up (its direction never straight up: VIEWS is even, src/detail/atlas.js). */
export const basisOf = (D) => { const right = normalize(cross(vec3(0, 1, 0), D)); return { right, up: cross(D, right) }; };

// ---- a picture's normals: in the picture's own frame, where they face it ----
// A picture keeps the way its thing faces where it shows it, turned to face the picture (a view's way, or the axis a
// clump's plane is across): a half-sphere of ways. Kept in the picture's own frame ({ u, v, w }: its right, its up, its
// way), by Lambert's equal-area map of the half-sphere (a disc: no fold), a texel filtered between two is within a few
// degrees of the mean of their ways where those are near (0.9° at most within 15° of each other, 3.8° within 30°). A
// map of the whole sphere kept in the thing's frame is folded: two ways either side of the fold lie on opposite edges
// of its square, and the texel filtered between them is another way, 90° off and more. (Twins for the impostors'
// worker: src/detail/atlas.js facingCode, facingWay.)
/** A normal of the thing's frame as its picture F keeps it: turned to face F.w, in F's frame (z along F.w). */
export const facingOf = (n, F) => { const m = n.dot(F.w).lessThan(0).select(n.negate(), n); return vec3(m.dot(F.u), m.dot(F.v), m.dot(F.w)); };
/** What a texel keeps of it, two numbers 0 … 1. */
export const facingEnc = (f) => { const m = normalize(f); return m.xy.mul(inverseSqrt(max(m.z, 0).add(1))).mul(0.5).add(0.5); };
/** A texel's two numbers back as a way in its picture's frame (facingOf's). */
const facingIn = (e) => { const X = e.mul(2).sub(1).mul(Math.SQRT2), r2 = X.dot(X).min(2); return normalize(vec3(X.mul(sqrt(float(1).sub(r2.mul(0.25)))), float(1).sub(r2.mul(0.5)))); };
/** A texel's two numbers back as a way in the thing's frame (F: its picture's frame). */
const facingDec = (e, F) => { const d = facingIn(e); return normalize(F.u.mul(d.x).add(F.v.mul(d.y)).add(F.w.mul(d.z))); };
/** The frame of a chunk's plane across axis a (0 … 2, a node): its own two axes (assets/kit/crowd.js PLANE) and a. */
export const planeFrame = (a) => {
  const axis = (k) => vec3(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0), by = (f) => a.equal(0).select(axis(f(0)), a.equal(1).select(axis(f(1)), axis(f(2))));
  return { u: by((k) => PLANE[k][0]), v: by((k) => PLANE[k][1]), w: by((k) => k) };
};

// ---- baking: where a point of the thing lands in a row's picture ----
/** The first picture of its row a piece of a bake draws (createBaker): a row is drawn a few pictures at a time, a
    draw's instances its pictures from this one on. */
export const PIECE = uniform(0, 'uint');
/** Which picture of its row (its view, its tile) an instance of a bake's draw is. */
export const pictureOf = () => instanceIndex.add(PIECE);
/** Where a point q of the thing (its frame: from its sphere's middle, in its radii) lands in view (i, row) of a row of
    `views` views (views x views of them), its depth towards that view's eye (z: -1 … 1): a vertex's clip, its depth,
    the view's way and its frame (F: its right, its up, its way). i: the instance's picture (pictureOf). */
export const viewClip = (q, row, views) => {
  const i = float(pictureOf()), D = dirOf(i.div(views - 1).mul(2).sub(1), float(row).div(views - 1).mul(2).sub(1)), B = basisOf(D);
  const x = q.dot(B.right), y = q.dot(B.up), z = q.dot(D);
  return { clip: vec4(i.add(0.5).add(x.mul(0.5)).div(views).mul(2).sub(1), y, float(0.5).sub(z.mul(0.5)), 1), z, D, F: { u: B.right, v: B.up, w: D } };
};
/** Where a point p of a plant (its own frame) lands in its tile, column `col` of a row of `per` tiles (as many as its
    baker draws a row): chunk c's plane across axis a (crowd.js PLANE), its box lo … hi; z: its depth along the axis,
    0 … 1 over the box (far side 0). */
export const tileClip = (p, lo, hi, a, col, per) => {
  const pick = (v, k) => (k === 0 ? v.x : k === 1 ? v.y : v.z), axis = (fn) => a.equal(0).select(fn(2, 1, 0), a.equal(1).select(fn(0, 2, 1), fn(0, 1, 2)));
  const rel = (k) => pick(p, k).sub(pick(lo, k)).div(pick(hi, k).sub(pick(lo, k)).max(1e-5));
  const u = axis((U) => rel(U)), v = axis((U, V) => rel(V)), z = axis((U, V, W) => rel(W));
  return { clip: vec4(col.add(u).div(per).mul(2).sub(1), v.mul(2).sub(1), float(1).sub(z), 1), z };
};

// ---- the atlases: a layer a shape, its pictures and their smaller ones ----
/** The texture format a picture of the atlas is made as (src/detail/atlas.js PICTURES): its channels, eight bits each. */
const formatOf = (P) => (P.channels === 'r' ? THREE.RedFormat : THREE.RGBAFormat);
/** Three array textures of `layers` layers, side x side texels each: its colour (albedo as its square root, cover), its
    data (which way it faces, in its picture's frame: facingOf; how deep; the light that reaches into it) and its leaf
    (how much of it is leaf, 0 … 1), each a number of its own, so each is filtered as it is. cell: a picture's texels a
    side; views: how many views a side its pictures are (an impostor's; none: a clump's tiles). put(layer, levels): its
    pictures from the worker, each level's three arrays, into the GPU. */
export function createAtlas(renderer, { name, side, layers, cell = side, views = 0 }) {
  const make = (P) => {
    const rt = new THREE.RenderTarget(side, side, { depth: Math.max(2, layers), depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace, format: formatOf(P) });   // (two layers at least: an array, however few shapes)
    return rt;
  };
  const [C, D, L] = PICTURES.map(make), mips = Math.floor(Math.log2(side)) + 1;
  makeOwned(renderer, `${name}`, Math.round(atlasBytes(side, Math.max(2, layers))), 0, 'geometry', C, D, L);   // (src/core/classes.js: its share, SHARE_MB; named its owner's, then made: src/core/gpu.js makeOwned)
  return {
    colour: C.texture, data: D.texture, leaf: L.texture, side, cell, views, targets: [C, D, L],   // (targets: to read a layer back, renderer.readRenderTargetPixelsAsync)
    tiles: uniform(side / cell),   // (its pictures a side, as data: an atlas sized to its stand's largest clumps reads with the same code as any)
    put(layer, levels) {
      const dev = renderer.backend.device, G = [C, D, L].map((t) => renderer.backend.get(t.texture).texture);
      levels.forEach((level, m) => {
        if (m >= mips) return;
        const n = level.n;
        PICTURES.forEach((P, i) => dev.queue.writeTexture({ texture: G[i], mipLevel: m, origin: { x: 0, y: 0, z: layer } }, level[P.name], { bytesPerRow: n * P.channels.length, rowsPerImage: n }, { width: n, height: n, depthOrArrayLayers: 1 }));
      });
    },
  };
}

// ---- the bake: a row of pictures at a time, SS x SS samples a texel, reduced on the GPU, read back, mipped in a worker ----
let WORKERS = null;
const workers = () => (WORKERS ||= workerPool("the impostors' worker", () => new Worker(new URL('./impostor.worker.js', import.meta.url), { type: 'module' })));
/** The pictures' smaller ones, as a worker makes them (impostor.worker.js, one of a pool as large as the device, watched:
    src/core/workers.js workerPool): { levels: [{ colour, data, leaf, n }] }. */
const mipsOf = (colour, data, leaf, side, cell, least) => workers().ask({ colour, data, leaf, side, cell, least }, [colour.buffer, data.buffer, leaf.buffer]);

/** What bakes a family's pictures: rows of `per` pictures `px` texels a side, drawn by draw(row) (a mesh whose
    instances are the row's pictures, from PIECE's on: pictureOf; its one material's two outputs, mrt's `output` its
    colour and cover and `data` its way, depth, and its light and leaf in one number, litIn: both drawn at once, the
    thing's corners worked out once for them), reduced SS x SS into the atlas' three textures' texels (light and leaf
    apart, each a mean of its own), as many pictures a frame as fit the frame's share for geometry, read back and mipped.
    One a kind of picture (views, tiles) per drawer: its targets are reused job after job, one job at a time. */
const nextFrame = () => new Promise((res) => requestAnimationFrame(() => res()));
export function createBaker(renderer, { per, px }) {
  // (its pictures a frame, by their own time on the GPU (src/core/pace.js, as the land's pages and the tiers' packing
  // are): a picture, not a row, the least of it. A row of a large tree's views is its whole crown drawn per times over,
  // twice (its colour, then its data: since drawn at once, mrt): 300 to 430 ms in one submission, in WebKit on the M2 at the first view (2026-11-19). Each baker its own, as
  // a views baker's picture is a whole thing drawn and a tiles baker's a chunk's planes)
  const P = pace(1);
  const W = per * px, opts = { depthBuffer: true, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, colorSpace: THREE.NoColorSpace };
  // (its samples: one target of two, its colour and its data, drawn at once by a picture's material: mrt, by name)
  const ss = new THREE.RenderTarget(W * SS, px * SS, { ...opts, count: 2 }), out = PICTURES.map((P) => new THREE.RenderTarget(W, W, { ...opts, depthBuffer: false, format: formatOf(P) }));
  ss.textures[0].name = 'output'; ss.textures[1].name = 'data';
  // the reduce: a texel of the atlas from its SS x SS samples (cover: their share covered; the rest: the covered ones'
  // mean, its way the mean way, its light and how much of it is leaf each a mean of its own: a sample is one or the
  // other, so its one number, litIn, says both exactly), into row `row` of the atlas: which 0 its colour, 1 its data,
  // 2 its leaf
  const row = uniform(0, 'int'), tc = texture(ss.textures[0]), td = texture(ss.textures[1]);
  const reduce = (which) => {
    const m = new THREE.NodeMaterial(); m.depthTest = false; m.depthWrite = false;
    m.vertexNode = vec4(positionGeometry.xy, 0, 1);   // (a triangle over the whole target, its corners straight in clip space)
    m.fragmentNode = Fn(() => {
      const p = ivec2(screenCoordinate.xy), base = ivec2(p.x.mul(SS), p.y.sub(row.mul(px)).mul(SS));
      const cov = float(0).toVar(), col = vec3(0).toVar(), nrm = vec3(0).toVar(), dep = float(0).toVar(), lit = float(0).toVar(), lf = float(0).toVar();
      for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
        const q = base.add(ivec2(dx, dy)), c = tc.load(q), d = td.load(q), a = c.a, L = litOf(d.w);
        cov.addAssign(a); col.addAssign(c.rgb.mul(a)); nrm.addAssign(facingIn(d.xy).mul(a)); dep.addAssign(d.z.mul(a)); lit.addAssign(L.light.mul(a)); lf.addAssign(L.leaf.mul(a));   // (its samples' ways in the one picture's frame)
      }
      const k = float(1).div(cov.max(1e-6));
      return which === 2 ? vec4(lf.mul(k), 0, 0, 1) : which ? vec4(facingEnc(nrm.add(vec3(0, 0, 1e-6))), dep.mul(k), lit.mul(k)) : vec4(col.mul(k), cov.div(SS * SS));
    })();
    return m;
  };
  const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const tris = [0, 1, 2].map((which) => { const m = reduce(which); return Object.assign(new THREE.Mesh(tri, m), { frustumCulled: false, userData: { materials: [m] } }); });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // (a piece of row r, its pictures a … a + n - 1: their samples drawn over what the row's pieces before it drew, then,
  // the row's last piece in, reduced into the atlas' row; the renderer as it was, after)
  const pieceOf = (r, a, n, draw) => {
    const prev = renderer.getRenderTarget(), pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha(), ac = renderer.autoClear;
    renderer.setClearColor(0x000000, 0);
    try {
      if (!r && !a) for (const o of out) { renderer.setRenderTarget(o); renderer.clear(); }
      const mesh = draw(r); mesh.geometry.instanceCount = n; PIECE.value = a;
      // the piece's samples, its colour and cover and its data at once, over the row's pieces before it (its first a
      // target cleared to nothing)
      mesh.material = mesh.userData.materials[0]; scene.add(mesh); renderer.setRenderTarget(ss); renderer.autoClear = !a; renderer.render(scene, cam); scene.remove(mesh);
      if (a + n < per) return;
      // the row whole: reduced into the atlas' row
      row.value = r;
      [0, 1, 2].forEach((w) => { const o = out[w]; o.viewport.set(0, r * px, W, px); o.scissor.set(0, r * px, W, px); o.scissorTest = true; scene.add(tris[w]); renderer.setRenderTarget(o); renderer.autoClear = false; renderer.render(scene, cam); scene.remove(tris[w]); o.viewport.set(0, 0, W, W); o.scissor.set(0, 0, W, W); o.scissorTest = false; });
    } finally { renderer.setRenderTarget(prev); renderer.setClearColor(pc, pa); renderer.autoClear = ac; }
  };
  // (what it draws, made for its targets before its first piece draws it, aside and in turn (src/core/compile.js): a
  // pipeline first used in a frame is made there, at once, on the page's thread. 2026-11-19, WebKit after the first
  // view: a new baker's first row held the thread about 1.5 s, its reduce's three and its pictures' two made then)
  const ahead = new WeakSet();
  const makeFor = async (mesh) => {
    const each = [[mesh.userData.materials[0], ss, mesh.geometry], ...tris.map((t, w) => [t.material, out[w], t.geometry])];
    for (const [m, target, geo] of each) {
      if (ahead.has(m)) continue;
      const o = Object.assign(new THREE.Mesh(geo, m), { frustumCulled: false });   // (its own stand-in: the pipeline made is the one any mesh of the same make draws with)
      scene.add(o);
      try { await compileFor(renderer, target, o, cam, scene); } finally { scene.remove(o); }
      ahead.add(m);
    }
  };
  let last = Promise.resolve();
  return {
    /** Its reduce's three meshes (its colour's, its data's, its leaf's), as the start compiles them (tools/smoke.js) */
    reduces: tris,
    /** What its pictures' samples are drawn into (two textures, `output` and `data`: a picture's material writes both,
        mrt): a mesh it draws says it (userData.target), for what builds that material as it is drawn (tools/smoke.js) */
    samples: ss,
    /** Bake `rows` rows of a thing's pictures into the atlas' layer, as many pictures a frame as the GPU's pace says
        (P): draw(r) its mesh for row r (its instances the row's pictures from PIECE's on: as many as each piece draws,
        set here; its materials [colour, data]); least: the smallest picture's side mipped to. A
        promise of { done }, once its pictures are read back (the targets free for the next job, which waits for it):
        done, once its layer is in the atlas, with its levels (what the browser keeps of it: src/scatter/trees.js farOf). */
    bake(atlas, layer, count, draw, least = LEAST) {
      const job = last.then(async () => {
        await makeFor(draw(0));
        // (as many pictures a frame as fit the frame's share for geometry, by each piece's own time on the GPU; at least one,
        // on any GPU; a row's pictures in pieces, each as many of them as are left this frame. Before the first view is
        // shown no frame is seen: a row whole, a frame, as fast as the GPU goes, its time still teaching the pace)
        for (let r = 0; r < count; r++) for (let a = 0; a < per; ) {
          if (P.left <= 0) { await nextFrame(); P.tick(); }
          const at = a, n = shown() ? Math.min(per - a, P.left) : per - a; a += n; P.left -= n;
          ownGpuMs(renderer, () => pieceOf(r, at, n, draw))?.then((ms) => P.measured(n, ms, frameShare('geometry'))).catch(() => {});
        }
        const [c, d, l] = await Promise.all(out.map((o) => renderer.readRenderTargetPixelsAsync(o, 0, 0, W, W)));
        // (of its pictures' levels, what the atlas keeps: from its own cell's on, a view's never-read finest not: atlasesOf STORED)
        const from = Math.round(Math.log2(px / atlas.cell));
        return { done: mipsOf(new Uint8Array(c), new Uint8Array(d), new Uint8Array(l), W, px, least).then(({ levels }) => { const kept = levels.slice(from); atlas.put(layer, kept); return kept; }) };
      });
      last = job.catch(() => {});
      return job;
    },
  };
}

// ---- reading them: a picture's texel, clamped inside its cell by half a texel of the coarsest level read ----
const inCell = (uv, cellPx, lod) => { const h = float(0.5).mul(float(2).pow(ceil(lod))).div(cellPx); return clamp(uv, h, float(1).sub(h)); };
/** A shape's impostor read where a pixel's ray meets it, the three views nearest that ray's way blended: { colour
    (albedo, gamma 2), cover, normal (its own frame), depth (along the eye's view, in radii), light (0 … 1), leaf (how
    much of it is leaf, 0 … 1) }.
    A: its atlas (createAtlas: its views a side); p: the pixel's point on the quad, eye: the eye, both in the thing's
    frame from its sphere's middle in its radii; lod: the level read. */
export function impostorRead(A, layer, p, eye, lod) {
  const rd = normalize(p.sub(eye)).toVar(), V = impostorViews(rd.negate(), A.views), N = A.views, out = { colour: vec3(0).toVar(), cover: float(0).toVar(), normal: vec3(0).toVar(), depth: float(0).toVar(), light: float(0).toVar(), leaf: float(0).toVar() };
  const C = texture(A.colour), Dt = texture(A.data), Lt = texture(A.leaf);
  for (let k = 0; k < 3; k++) {
    const g = V.cells[k], w = [V.w.x, V.w.y, V.w.z][k], D = dirOf(g.x.div(N - 1).mul(2).sub(1), g.y.div(N - 1).mul(2).sub(1)), B = basisOf(D), dd = rd.dot(D).min(-1e-3);
    const uvAt = (h) => { const t = h.sub(p.dot(D)).div(dd), q = p.add(rd.mul(t)); return vec2(q.dot(B.right), q.dot(B.up)).mul(0.5).add(0.5); };
    const st = (uv) => { const c = inCell(uv, float(A.cell), lod); return vec2(g.x.add(c.x), g.y.add(float(1).sub(c.y))).div(N); };
    const s = st(uvAt(float(0)));   // (where the ray crosses the view's plane through the middle: src/detail/atlas.js)
    const c = C.sample(s).depth(layer).level(lod), d = Dt.sample(s).depth(layer).level(lod);
    out.colour.addAssign(c.rgb.mul(w)); out.cover.addAssign(c.a.mul(w)); out.normal.addAssign(facingDec(d.xy, { u: B.right, v: B.up, w: D }).mul(w)); out.depth.addAssign(d.z.mul(2).sub(1).mul(w)); out.light.addAssign(d.w.mul(w));
    out.leaf.addAssign(Lt.sample(s).depth(layer).level(lod).r.mul(w));
  }
  return { ...out, normal: normalize(out.normal.add(vec3(0, 1e-5, 0))) };
}
/** A bake's sample's light and leaf, kept in one number as its picture is drawn (light / 2, and a half more for a
    leaf): exact for a sample, which is one or the other, and taken apart by the reduce before anything averages them. */
const litOf = (v) => { const leaf = v.greaterThanEqual(0.5); return { leaf: leaf.select(float(1), float(0)), light: leaf.select(v.mul(2).sub(1), v.mul(2)) }; };
/** The same as the bake writes it. */
export const litIn = (light, leaf) => light.clamp(0, 0.999).mul(0.5).add(leaf.mul(0.5));

/** The three views (of views x views) nearest the way d (the thing's frame, towards the eye: a pixel's own ray's), and
    their weights: the grid's triangle the way falls in (two of a cell's four corners and the nearer of the other two):
    { cells: [vec2 × 3] (view i, j), w: vec3 }. */
const impostorViews = (d, views) => {
  const g = squareOf(d).mul(0.5).add(0.5).mul(views - 1).clamp(0, views - 1 - 1e-4), c = floor(g), f = g.sub(c), up = f.x.add(f.y).greaterThan(1);
  const a = up.select(c.add(vec2(1, 1)), c), b = c.add(vec2(1, 0)), e = c.add(vec2(0, 1));
  const w = up.select(vec3(f.x.add(f.y).sub(1), float(1).sub(f.y), float(1).sub(f.x)), vec3(float(1).sub(f.x).sub(f.y), f.x, f.y));
  return { cells: [a, b, e], w };
};
/** A plant's clump read at uv (in tiles of the kit's grid, atlases().TILES a row: crowd.js levelOf), at level lod,
    clamped inside its tile there, the tile where it lies in the atlas' own grid (as many a side as its stand's largest
    clumps need: src/scatter/trees.js): { colour, cover, normal, light } as impostorRead (a chunk's planes are all
    leaf). */
export function clumpRead(A, layer, uv, lod) {
  const n = A.tiles, t = floor(uv), k = t.y.mul(atlases().TILES).add(t.x), at = vec2(k.sub(floor(k.div(n)).mul(n)), floor(k.div(n)));
  const s = inCell(uv.sub(t).sub(IN).div(1 - 2 * IN), float(A.cell), lod).add(at).div(n), c = texture(A.colour).sample(s).depth(layer).level(lod), d = texture(A.data).sample(s).depth(layer).level(lod);
  return { colour: c.rgb, cover: c.a, normal: facingDec(d.xy, planeFrame(k.sub(floor(k.div(3)).mul(3)))), light: d.w };   // (chunk c's plane across axis a is tile 3c + a: crowd.js PLANE)
}

// ---- a made thing's impostor (src/world/place.js: the library's stage): the same views of its nearest level ----
let renderer = null, BAKERS = null; const kept = new Map();   // a recipe's hash -> its views, baked once a recipe
/** The game's renderer bakes the impostors (set once by src/boot.js). */
export const setImpostorRenderer = (r) => (renderer = r);
/** Whether a made thing's impostor can be baked and drawn here (WebGPU): without, its faces are its last level. */
export const canBake = () => !!renderer?.backend?.isWebGPUBackend;
/** The bakers every impostor shares (their targets reused shape after shape, a job at a time): the views' (views(): the
    atlases' VIEWS a row of CELL texels), and a plant's clumps' tiles (tiles(n): n tiles a row of TILE texels). */
export const bakers = (r = renderer) => (BAKERS ||= { of: new Map(), views() { let b = this.of.get(0); if (!b) this.of.set(0, (b = createBaker(r, { per: atlases().VIEWS, px: atlases().CELL }))); return b; }, tiles(n) { let b = this.of.get(n); if (!b) this.of.set(n, (b = createBaker(r, { per: n, px: atlases().TILE }))); return b; } });
/** A recipe's hash: its geometry's numbers, so a changed recipe bakes again. */
const hashOf = (geo) => { let h = FNV; const a = geo.attributes.position.array, c = geo.attributes.color?.array || []; for (let i = 0; i < a.length; i += 7) h = fnv(h, Math.round(a[i] * 1000)); for (let i = 0; i < c.length; i += 11) h = fnv(h, Math.round(c[i] * 1000)); return `${a.length}:${(h >>> 0).toString(36)}`; };
/** A made thing's views (geo: its nearest level, its colours a vertex; c, r: its sphere) baked into an atlas of its own:
    { A, ready (1 once they are in) }. */
function viewsOf(geo, c, r, name) {
  const { VIEWS, STORED } = atlases(), A = createAtlas(renderer, { name: `a made thing's impostor ${name}`, side: VIEWS * STORED, layers: 2, cell: STORED, views: VIEWS }), ready = uniform(0), row = uniform(0, 'int'), g = new THREE.InstancedBufferGeometry();
  g.index = geo.index; for (const k of ['position', 'normal', 'color']) if (geo.attributes[k]) g.setAttribute(k, geo.attributes[k]);
  const vC = varyingProperty('vec3', 'mC'), vN = varyingProperty('vec3', 'mN'), vZ = varyingProperty('float', 'mZ');
  const vert = Fn(() => { const P = viewClip(positionGeometry.sub(c).div(r), row, VIEWS); vC.assign(attribute('color', 'vec3')); vN.assign(facingOf(attribute('normal', 'vec3'), P.F)); vZ.assign(P.z); return P.clip; })();
  const mat = (f) => Object.assign(new THREE.NodeMaterial(), { vertexNode: vert, fragmentNode: f, side: THREE.DoubleSide });
  const bm = Object.assign(new THREE.Mesh(g, null), { frustumCulled: false, userData: { target: bakers().views().samples, materials: [mat(mrt({ output: vec4(sqrt(max(vC, 0)), 1), data: Fn(() => vec4(facingEnc(vN), vZ.mul(0.5).add(0.5), litIn(float(1), float(0))))() }))] } });
  bakers().views().bake(A, 0, VIEWS, (j) => { row.value = j; g.instanceCount = VIEWS; return bm; }).then(({ done }) => done).then(() => (ready.value = 1));
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
    const { A, ready } = kept.get(key), vP = varyingProperty('vec3', 'vP'), vE = varyingProperty('vec3', 'vE'), vL = varyingProperty('float', 'vL'), vX = varyingProperty('vec3', 'vX');
    const M = mat3(modelWorldMatrix[0].xyz, modelWorldMatrix[1].xyz, modelWorldMatrix[2].xyz), k = modelWorldMatrix[0].xyz.length();
    m.vertexNode = Fn(() => {
      // (its sphere in the world, sinking as its thing's last level does: lower first, then narrower)
      const C = modelWorldMatrix.mul(vec4(c.mul(vec3(1, sunk, 1)), 1)).xyz, d = normalize(U.uCam.sub(C)), right = normalize(cross(vec3(0, 1, 0), d).add(vec3(1e-6, 0, 0))), up = cross(d, right);
      const w = C.add(right.mul(positionGeometry.x).add(up.mul(positionGeometry.y)).mul(k.mul(r).mul(sunk.sqrt())));
      vP.assign(M.transpose().mul(w.sub(C)).div(k.mul(k).mul(r).mul(sunk.sqrt()))); vE.assign(M.transpose().mul(U.uCam.sub(C)).div(k.mul(k).mul(r).mul(sunk.sqrt()))); vX.assign(w);
      vL.assign(clamp(log2(float(A.cell).div(pxAt(k.mul(2 * r), U.uCam.sub(C).length().mul(U.uLodInv)).max(1e-3))), 0, levelsUnder(A.cell)));   // (its texels one to a pixel drawn)
      return ready.greaterThan(0.5).select(cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(w, 1)), vec4(2, 2, 2, 1));
    })();
    m.userData.shadow = true;   // (it says what it cuts in the shadow pass: src/core/pass.js)
    m.fragmentNode = Fn((builder) => {
      const R = impostorRead(A, float(0), vP, vE, vL), out = vec4(0).toVar();
      If(R.cover.lessThan(0.5), () => { Discard(); });
      if (passOf(builder) === 'shadow') return out;   // (drawn into the shadow map, only its outline counts: no light)
      If(unlit().not(), () => {
        const n = normalize(M.mul(R.normal));   // (as the asset's own material lights it)
        out.assign(lit({ colour: weathered(R.colour.mul(R.colour), n, snowLift(vX, snow.clumps)), n, w: vX, ndl: max(n.dot(U.uSunDir), 0).mul(0.8).add(0.2) }));
      });
      return out;
    })();
  } else m.vertexNode = vec4(2, 2, 2, 1);   // (no impostor without WebGPU: its last level sinks away)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); mesh.frustumCulled = false; mesh.renderOrder = 1;
  return mesh;
}
