// The first view's census (intent 0038, the cold start), on the GPU's stand-in (tools/gpu-mock.js): the world made as
// src/boot.js makes it, with what it compiles before its first frame (the ground's maps, the land's pages, the tiers'
// packing), its camera where the start puts it (14 m out from the tent's door, facing it: src/camera/walk.js spawn), and
// its first frame drawn once: the light's passes, then the screen's (src/boot.js choose and draw). The stand-in walks a
// scene as three does (what is visible, its LODs, the camera's layers, the frustum) and hands each thing to the route a
// pass draws with, so every ask a frame makes is made as in a browser. Then what was asked (src/core/compile.js
// compiles().open): how many asks the first view waits for (near 0) and how many come after, by pass and family; and how
// many programs the first view's are (each built to WGSL here, told apart by its code). What a browser's start waits
// for, counted with no GPU, and no machine's memory, in the way.
//
//   bun tools/census.js          a table, then the same as one line of JSON (census-json: …)
import { mock } from './gpu-mock.js';

const M = await mock({ lean: true }), { THREE, renderer } = M;

// ---- the stand-in walks a scene, a thing at a time, to the route a pass draws with ----
let route = null;
const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
const walk = (root, camera, fn, scene) => {
  root.updateMatrixWorld?.(); camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), THREE.WebGPUCoordinateSystem);
  const visit = (o) => {
    if (!o.visible) return;
    if (o.isLOD && o.autoUpdate) o.update(camera);
    if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.layers.test(camera.layers) && (!o.frustumCulled || frustum.intersectsObject(o)))
      for (const m of [o.material].flat()) if (m && m.visible !== false) fn.call(renderer, o, scene, camera, o.geometry, m, null, null, null, null);
    for (const c of o.children) visit(c);
  };
  visit(root);
};
const drawnAlone = (o) => !o.isScene && !o.children?.length;   // (a pass of its own: a quad drawn by itself)
Object.setPrototypeOf(renderer, { renderObject() {} });   // (what a route draws, once it is made: nothing here; three's own, on its prototype: src/core/compile.js drawn)
renderer.setRenderObjectFunction = (f) => { route = f; };
renderer.getRenderObjectFunction = () => route;
const render0 = renderer.render;
renderer.render = (scene, camera) => (drawnAlone(scene) ? render0(scene, camera) : walk(scene, camera, route ?? renderer.renderObject, scene));
// (a compile: three hands what it compiles to the render object function it reads as it begins, src/core/compile.js)
renderer.compileAsync = (root, camera, scene) => {
  if (drawnAlone(root)) { M.drawn.add(root); renderer.renderObject(root, scene ?? root, camera, root.geometry, root.material); } else walk(root, camera, renderer.renderObject, scene ?? root);
  return Promise.resolve();
};

// ---- the world, as src/boot.js makes it (the start's own order) ----
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.15, 30000); scene.add(camera);
const { createUniforms } = await import('../src/core/uniforms.js'), U = createUniforms(camera);
(await import('../src/detail/impostor.js')).setImpostorRenderer(renderer);
const { createTemporal } = await import('../src/core/temporal.js'), { createScreen } = await import('../src/core/screen.js'), { createLens } = await import('../src/camera/post.js');
const temporal = createTemporal(renderer), screen = createScreen(renderer, { temporal, lens: createLens(renderer) });
const { keepMeasure, measureNow } = await import('../src/detail/measure.js'); keepMeasure(() => screen.out);
let tex = M.tiles;
try { tex = (await import('../src/materials/bake.js')).bakeTextures(renderer, { spare: 1 }); } catch { /* the stand-in's tiles */ }
(await import('../src/world/tile.js')).useTiles(tex);
(await import('../src/world/light/start.js')).startLight(renderer, screen);
(await import('../src/core/compile.js')).firstReach((await import('../src/world/shadow.js')).cascades().half[0]);
const { createGround } = await import('../src/scatter/ground.js'), ground = createGround(renderer, tex);
(await import('../src/world/rocksolid.js')).useGround(ground);
await ground.compile();
const { createTerrain } = await import('../src/terrain/terrain.js'), terrain = createTerrain(scene, tex, renderer);
await terrain.compile(); screen.afterPrepass(terrain.pages.ask, 'pages');
const { createScatter } = await import('../src/scatter/index.js'), scatter = createScatter(scene, tex, ground, renderer, camera);
await scatter.compile();
const { recipe } = await import('../src/core/registry.js'), { place } = await import('../src/world/place.js'), { stand } = await import('../src/scatter/placed.js'), { PLACES } = await import('../world/places.js');
for (const at of Object.values(PLACES)) { const a = recipe(at.asset); if (!stand(a, at)) place(scene, a, at); }
const sky = (await import('../src/world/sky.js')).createSky(scene, camera, renderer);
const weather = (await import('../src/world/weather/index.js')).createWeather({ scene, renderer, camera });
const { groundAt } = await import('../src/world/land.nodes.js'), { crownsAt, crownsVersion } = await import('../src/terrain/layers.js');
const shadows = (await import('../src/world/light/index.js')).createLight(renderer, { groundAt, land: terrain.pages, crowns: { at: crownsAt, version: crownsVersion } });
const { waterReads, waterDrawn } = await import('../src/terrain/water.js');
screen.afterPrepass((f) => waterReads(f, temporal.history(), temporal.K.most), 'water');
screen.apart(terrain.waterMesh, (render) => waterDrawn(renderer, render), 'water');

const { compiles } = await import('../src/core/compile.js'), { twinOf } = await import('../src/core/pass.js'), { prepassTarget } = await import('../src/core/screen.js'), { cascades } = await import('../src/world/shadow.js');
// ---- its camera where the start puts it, and its first frame (src/boot.js choose, draw), the governor at rest ----
const { heightAt, HMIN } = await import('../src/world/land.js'), { WALKER } = await import('../world/scale.js');
const { setPlanes } = await import('../src/core/frustum.js'), { farthest } = await import('../src/detail/extent.js');
const tent = PLACES.tent, dx = -Math.sin(tent.yaw), dz = -Math.cos(tent.yaw), cx = tent.x + dx * 14, cz = tent.z + dz * 14;
camera.rotation.order = 'YXZ'; camera.position.set(cx, heightAt(cx, cz) + WALKER.eye, cz); camera.rotation.set(0, Math.atan2(dx, dz), 0);
sky.update(1 / 60); weather.update(1 / 60);
const p = camera.position, gy = heightAt(p.x, p.z), dy = (U.uDy.value = Math.max(0, p.y - gy - 2, HMIN - p.y));
U.uAirH.value = Math.max(0, p.y - gy); camera.updateMatrixWorld();
setPlanes(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
U.uLodInv.value = 1; measureNow();
camera.far = farthest(); camera.updateProjectionMatrix();
ground.update(p.x, p.z, dy, 1); terrain.update(camera, dy, 1); scatter.select(p.x, p.z, gy, 1, dy);
weather.before(camera, gy); shadows.render(scene, camera, gy); screen.render(scene, camera);
const OPEN = compiles().open;   // (read at once: the asks a frame makes are made in turns from the next microtask on)

// ---- what the frame asked, before any of it is made ----
const open = OPEN, first = open.filter((e) => e.counted && e.near === 0), after = open.filter((e) => e.counted && e.near > 0);
const familyOf = (e) => e.name.replace(/ \(cast\)$/, '').replace(/ (pre|main)$/, '').replace(/ level \d+( \d+)?$/, '').replace(/ ring \d+$/, '').replace(/ \d+$/, '');
const count = (L, key) => { const out = {}; for (const e of L) out[key(e)] = (out[key(e)] ?? 0) + 1; return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1])); };
// (each of the first view's asks built as its pass builds it: its code, told apart by what it is)
const PRE = prepassTarget(4, 4, new THREE.DepthTexture(4, 4)), codes = {};
const codeOf = (e) => {
  if (e.pass === 'run') return [e.what].flat().map((n) => M.compute(n)).join('\0');
  const o = e.what, m = [o.material].flat()[0], T = m?.isNodeMaterial ? twinOf(m) : null;
  const mat = e.pass === 'own' ? m : e.pass === 'cast' ? T?.shadow : T?.[e.pass];
  if (!mat) return `none ${e.name}`;
  if (e.pass === 'pre') renderer.setRenderTarget(PRE);
  try { const s = M.build(o.isMesh ? o : { isMesh: true, geometry: new THREE.BufferGeometry(), material: mat }, mat); return `${s.vertex}\0${s.fragment}`; } finally { renderer.setRenderTarget(null); }
};
// (and as a pipeline: its code and what three tells pipelines apart by besides, how it is drawn: its side, its blending,
// its depth, the vertex buffers its geometry binds, which way its faces turn; src/core/compile.js sharePipelines keys a
// pipeline by all of it. A program drawn more than one way is more than one pipeline)
const layoutOf = (g) => (g ? `${Object.entries(g.attributes ?? {}).map(([n, a]) => `${n}:${a.itemSize}${a.isInstancedBufferAttribute ? 'i' : ''}`).sort().join(',')}${g.index ? '|i' : ''}` : '-');
const matOf = (e) => { const m = [e.what.material].flat()[0], T = m?.isNodeMaterial ? twinOf(m) : null; return e.pass === 'own' ? m : e.pass === 'cast' ? T?.shadow : T?.[e.pass]; };
const STATE = ['side', 'transparent', 'blending', 'depthTest', 'depthWrite', 'depthFunc', 'colorWrite'];
const stateOf = (e) => { if (e.pass === 'run') return {}; const m = matOf(e) ?? {}; return { ...Object.fromEntries(STATE.map((k) => [k, m[k]])), layout: layoutOf(e.what.geometry), flipped: e.what.matrixWorld?.determinant?.() < 0 }; };
const pipes = {}, ways = new Map();   // (a pass's pipelines; a program -> how it is drawn, each way's names)
for (const e of first) {
  let c; try { c = codeOf(e); } catch (err) { c = `failed ${e.name}: ${err.message}`; }
  (codes[e.pass] ||= new Set()).add(c);
  const st = JSON.stringify(stateOf(e)); (pipes[e.pass] ||= new Set()).add(`${c}#${st}`);
  const key = `${e.pass}\0${c}`; let w = ways.get(key); if (!w) ways.set(key, (w = { pass: e.pass, bytes: c.length, by: new Map() })); if (!w.by.has(st)) w.by.set(st, new Set()); w.by.get(st).add(familyOf(e));
}
// (a packing is a list of passes, a compute pipeline each: the first view's compute pipelines are its passes' distinct shaders)
const passCodes = new Set(), passWho = new Map();
for (const e of first.filter((x) => x.pass === 'run')) for (const n of [e.what].flat()) { let c; try { c = M.compute(n); } catch { continue; } passCodes.add(c); if (!passWho.has(c)) passWho.set(c, new Set()); passWho.get(c).add(e.name.replace(/: packing$/, '')); }
// (each compute shader's size, the largest first: what a compiler reads of the packing)
const shaders = [...passCodes].map((c) => ({ kb: +(c.length / 1024).toFixed(1), who: [...passWho.get(c)].slice(0, 3) })).sort((a, b) => b.kb - a.kb);
pipes.run = passCodes;
const programs = Object.fromEntries(Object.entries(codes).map(([k, s]) => [k, s.size])), pipelines = Object.fromEntries(Object.entries(pipes).map(([k, s]) => [k, s.size]));
// (the programs drawn more than one way, and what differs between their ways)
const several = [...ways.values()].filter((w) => w.by.size > 1).map((w) => {
  const S = [...w.by.keys()].map((x) => JSON.parse(x)), differ = Object.keys(S[0]).filter((k) => S.some((x) => JSON.stringify(x[k]) !== JSON.stringify(S[0][k])));
  return { pass: w.pass, ways: w.by.size, kb: Math.round(w.bytes / 1024), differ, who: [...new Set([...w.by.values()].flatMap((x) => [...x]))].slice(0, 4) };
}).sort((a, b) => b.ways - a.ways);
// (the first view's programs by their size: what a compiler reads)
const sizes = [...ways.values()].map((w) => ({ pass: w.pass, kb: Math.round(w.bytes / 1024), who: [...new Set([...w.by.values()].flatMap((x) => [...x]))].slice(0, 3) })).sort((a, b) => b.kb - a.kb);
const result = {
  first: { asks: first.length, programs: Object.values(programs).reduce((a, b) => a + b, 0), pipelines: Object.values(pipelines).reduce((a, b) => a + b, 0), byPass: count(first, (e) => e.pass), programsByPass: programs, pipelinesByPass: pipelines, several, sizes, shaders, computeKb: Math.round(shaders.reduce((t, x) => t + x.kb, 0)), byFamily: count(first, (e) => `${familyOf(e)} · ${e.pass}`) },
  after: { asks: after.length, byPass: count(after, (e) => e.pass), byFamily: count(after, (e) => `${familyOf(e)} · ${e.pass}`) },
  camera: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), reach: +cascades().half[0].toFixed(1),
};
{
  console.log(`census: the first view waits for ${result.first.asks} asks, ${result.first.programs} programs, ${result.first.pipelines} pipelines; ${result.after.asks} more come after it (camera at ${result.camera}, the near cascade's reach ${result.reach} m)`);
  console.log(`  by pass: ${JSON.stringify(result.first.byPass)}; programs: ${JSON.stringify(result.first.programsByPass)}; pipelines: ${JSON.stringify(result.first.pipelinesByPass)}`);
  console.log(`  programs drawn more than one way (each way a pipeline): ${several.length}`); for (const w of several) console.log(`    ${w.ways}×  ${w.pass} ${w.kb} KB, ${w.differ.join(', ')} differ: ${w.who.join(' | ')}`);
  console.log('  the largest programs:'); for (const z of sizes.slice(0, 12)) console.log(`    ${String(z.kb).padStart(4)} KB  ${z.pass}: ${z.who.join(' | ')}`);
  console.log(`  the packing's compute shaders: ${shaders.length}, ${result.first.computeKb} KB of WGSL; the largest:`); for (const z of shaders.slice(0, 14)) console.log(`    ${String(z.kb).padStart(5)} KB  ${z.who.join(' | ')}`);
  console.log('  by family and pass, the first view:'); for (const [k, n] of Object.entries(result.first.byFamily)) console.log(`    ${String(n).padStart(4)}  ${k}`);
  console.log(`  after it, by pass: ${JSON.stringify(result.after.byPass)}`); for (const [k, n] of Object.entries(result.after.byFamily).slice(0, 12)) console.log(`    ${String(n).padStart(4)}  ${k}`);
}
console.log(`census-json: ${JSON.stringify(result)}`);
process.exit(0);
