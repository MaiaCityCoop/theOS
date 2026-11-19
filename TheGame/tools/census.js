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
//   --buffer=<bytes>             on a device whose adapter says its largest buffer is so large (the one sign of its class
//                                the game reads: src/core/gpu.js shareOf; an iPhone's 1073741824, its share 0.375), and
//   --window=<w>x<h>@<dpr>       a window of w × h CSS pixels at dpr device pixels a point (an iPhone's 390x844@3): then
//                                what the first view holds there, by class against the device's budget, its largest
//                                pools, and the dial at rest (memory: …). The tiers' own stores are not in it: they are
//                                sized by what their packings find, read back from the GPU, and the stand-in finds none
//   --settle                     and then the start's view drawn on, frame after frame as src/boot.js draws them, till
//                                the world is complete for it (src/core/settle.js ready) or its limit (SETTLE_MS): in
//                                how long, what is still out, and what each drawer asked of the recipes' workers and put
//                                in (settle: … in the JSON). The smoke holds it: every drawer asked and put something,
//                                and the world came complete (tools/smoke.js the start's view)
import { mock, pageFrames } from './gpu-mock.js';

const ARG = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const [WW, WH, WD] = ARG.window ? ARG.window.split(/[x@]/).map(Number) : [1920, 1080, 1];
const M = await mock({ lean: true, size: [WW, WH], dpr: WD }), { THREE, renderer } = M;
Object.assign(globalThis, { innerWidth: WW, innerHeight: WH, devicePixelRatio: WD });
if (ARG.buffer) {   // (the device's adapter, as src/boot.js asks it before anything is sized: its share of the budget)
  const nav = globalThis.navigator, limits = { maxBufferSize: +ARG.buffer, maxStorageBufferBindingSize: Math.min(+ARG.buffer, 2 ** 30) };
  nav.gpu = { requestAdapter: async () => ({ limits, info: { vendor: 'census', architecture: '' } }) };
  await (await import('../src/core/gpu.js')).askedLimits(); nav.gpu = undefined;
}
// (where each material and compute pass is made, as the loader hands it over: its place's own name, tools/glob.js)
const SITE = new WeakMap(); globalThis.__made = (id, x) => { if (x && typeof x === 'object' && !SITE.has(x)) SITE.set(x, id); return x; };

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
await M.planned();   // (the start's plan, as src/boot.js solves it: tools/gpu-mock.js planned)
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
const p = camera.position;
/** A frame at the start's view, as src/boot.js step, choose and draw make it, the governor at rest: t its clock (s). */
const frame = (t) => {
  U.uTime.value = t; tex.flush?.();   // (a frame's first: the materials asked for painted, src/boot.js step)
  sky.update(1 / 60); weather.update(1 / 60);
  const gy = heightAt(p.x, p.z), dy = (U.uDy.value = Math.max(0, p.y - gy - 2, HMIN - p.y));
  U.uAirH.value = Math.max(0, p.y - gy); camera.updateMatrixWorld();
  setPlanes(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  U.uLodInv.value = 1; measureNow();
  camera.far = farthest(); camera.updateProjectionMatrix();
  ground.update(p.x, p.z, dy, 1); terrain.update(camera, dy, 1); scatter.select(p.x, p.z, gy, 1, dy);
  weather.before(camera, gy); shadows.render(scene, camera, gy); screen.render(scene, camera);
};
frame(0);
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
// (all the start makes before its first frame, as the device counts it, tools/gate/device.js firstMade: the first view's
// asks; what a frame draws alone, a quad (the screen's passes, the materials painted); every compute pass handed to be
// compiled or run (the ground's, the land's, the scatter's at boot, a frame's). Each program once, by its code)
const madeR = new Map(), madeC = new Map(), keepAs = (m, code, who) => { if (!m.has(code)) m.set(code, who); };
for (const e of first) { let c; try { c = codeOf(e); } catch { continue; } if (e.pass === 'run') for (const x of c.split('\0')) keepAs(madeC, x, `asked: ${familyOf(e)}, packing`); else keepAs(madeR, c, `asked: ${familyOf(e)} · ${e.pass}`); }
const nameOf = (o) => [SITE.get(o.material) ?? SITE.get(o), o.material?.name || o.name].filter(Boolean).join(' ') || o.material?.type || 'a quad';
for (const o of [...M.drawn].filter(drawnAlone)) { try { const s = M.build(o, o.material); keepAs(madeR, `${s.vertex}\0${s.fragment}`, `drawn alone: ${nameOf(o)}`); } catch { /* the stand-in cannot build it: the smoke says why */ } }
for (const n of M.computed) { try { keepAs(madeC, M.compute(n), `handed: ${SITE.get(n) ?? (n.name || 'a compute pass')}`); } catch { /* as above */ } }
const madeBy = (m) => count([...m.values()], (w) => w.replace(/ level \d+.*$/, '').replace(/ \d+$/, ''));
const made = { programs: madeR.size + madeC.size, render: madeR.size, compute: madeC.size, kb: Math.round([...madeR.keys(), ...madeC.keys()].reduce((t, c) => t + c.length, 0) / 1024), outside: { render: madeBy(new Map([...madeR].filter(([, w]) => !w.startsWith('asked')))), compute: madeBy(new Map([...madeC].filter(([, w]) => !w.startsWith('asked')))) } };
const programs = Object.fromEntries(Object.entries(codes).map(([k, s]) => [k, s.size])), pipelines = Object.fromEntries(Object.entries(pipes).map(([k, s]) => [k, s.size]));
// (the programs drawn more than one way, and what differs between their ways)
const several = [...ways.values()].filter((w) => w.by.size > 1).map((w) => {
  const S = [...w.by.keys()].map((x) => JSON.parse(x)), differ = Object.keys(S[0]).filter((k) => S.some((x) => JSON.stringify(x[k]) !== JSON.stringify(S[0][k])));
  return { pass: w.pass, ways: w.by.size, kb: Math.round(w.bytes / 1024), differ, who: [...new Set([...w.by.values()].flatMap((x) => [...x]))].slice(0, 4) };
}).sort((a, b) => b.ways - a.ways);
// (the first view's programs by their size: what a compiler reads)
const sizes = [...ways.values()].map((w) => ({ pass: w.pass, kb: Math.round(w.bytes / 1024), who: [...new Set([...w.by.values()].flatMap((x) => [...x]))].slice(0, 3) })).sort((a, b) => b.kb - a.kb);
// ---- with a device: what the GPU holds there, by class against its budget, and the dial at rest ----
let memory = null;
if (ARG.buffer) {
  const L = (await import('../src/core/gpu.js')).ledger();
  memory = { share: L.share, rest: L.rest, whole: L.budget, noted: L.noted, classes: Object.fromEntries(Object.entries(L.classes).map(([c, v]) => [c, { budget: v.budget, held: v.noted }])), rows: L.rows.slice(0, 16) };
}
const result = {
  first: { asks: first.length, programs: Object.values(programs).reduce((a, b) => a + b, 0), pipelines: Object.values(pipelines).reduce((a, b) => a + b, 0), byPass: count(first, (e) => e.pass), programsByPass: programs, pipelinesByPass: pipelines, several, sizes, shaders, computeKb: Math.round(shaders.reduce((t, x) => t + x.kb, 0)), byFamily: count(first, (e) => `${familyOf(e)} · ${e.pass}`) },
  made,
  after: { asks: after.length, byPass: count(after, (e) => e.pass), byFamily: count(after, (e) => `${familyOf(e)} · ${e.pass}`) },
  camera: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), reach: +cascades().half[0].toFixed(1), memory,
};
if ('settle' in ARG) result.settle = await settleStart();
{
  console.log(`census: the first view waits for ${result.first.asks} asks, ${result.first.programs} programs, ${result.first.pipelines} pipelines; ${result.after.asks} more come after it (camera at ${result.camera}, the near cascade's reach ${result.reach} m)`);
  console.log(`  made before its first frame, as the device counts (asked, drawn alone, handed): ${made.programs} programs (${made.render} render, ${made.compute} compute), ${made.kb} KB; outside the first view's asks:`); for (const [k, n] of [...Object.entries(made.outside.render), ...Object.entries(made.outside.compute)]) console.log(`    ${String(n).padStart(4)}  ${k}`);
  console.log(`  by pass: ${JSON.stringify(result.first.byPass)}; programs: ${JSON.stringify(result.first.programsByPass)}; pipelines: ${JSON.stringify(result.first.pipelinesByPass)}`);
  console.log(`  programs drawn more than one way (each way a pipeline): ${several.length}`); for (const w of several) console.log(`    ${w.ways}×  ${w.pass} ${w.kb} KB, ${w.differ.join(', ')} differ: ${w.who.join(' | ')}`);
  console.log('  the largest programs:'); for (const z of sizes.slice(0, 12)) console.log(`    ${String(z.kb).padStart(4)} KB  ${z.pass}: ${z.who.join(' | ')}`);
  console.log(`  the packing's compute shaders: ${shaders.length}, ${result.first.computeKb} KB of WGSL; the largest:`); for (const z of shaders.slice(0, 14)) console.log(`    ${String(z.kb).padStart(5)} KB  ${z.who.join(' | ')}`);
  console.log('  by family and pass, the first view:'); for (const [k, n] of Object.entries(result.first.byFamily)) console.log(`    ${String(n).padStart(4)}  ${k}`);
  console.log(`  after it, by pass: ${JSON.stringify(result.after.byPass)}`); for (const [k, n] of Object.entries(result.after.byFamily).slice(0, 12)) console.log(`    ${String(n).padStart(4)}  ${k}`);
}
if (memory) {
  console.log(`memory: on a share of ${memory.share} (${memory.whole} MB), the dial at rest ${memory.rest}; the first view holds ${memory.noted} MB:`);
  for (const [c, v] of Object.entries(memory.classes)) console.log(`  ${c.padEnd(13)} ${String(v.held).padStart(7)} MB of ${v.budget}`);
  for (const [n, mb, , c] of memory.rows) console.log(`    ${String(mb).padStart(7)} MB  ${c}: ${n}`);
}
if (result.settle) {
  const S = result.settle;
  console.log(`settle: the start's view ${S.ready ? 'came complete' : `did not come complete within its ${S.limit} s`} after ${S.frames} frames, ${S.secs} s${S.ready ? '' : `; still out: ${JSON.stringify(S.out)}`}${S.threw.length ? `; ${S.threw.length} thrown: ${S.threw.join(' · ')}` : ''}`);
  for (const D of S.drawers) console.log(`  ${String(D.asked).padStart(5)} asked, ${String(D.put).padStart(5)} put  ${D.name}${D.out ? `, ${D.out} out` : ''}`);
}
console.log(`census-json: ${JSON.stringify(result)}`);
process.exit(0);

/** The start's view drawn on, frame after frame as src/boot.js draws them (the page's frames given: what they pace, the
    far ends' bakes), until the world is complete for it (src/core/settle.js ready), its limit, or something thrown
    (a worker's error: what it was asked never comes): whether it came, in how many frames and seconds, what is still
    out, and what each drawer asked of the recipes' workers and put in (src/scatter/drawer.js drawersMade). */
async function settleStart() {
  pageFrames();
  const { watch, tick, waiting, ready, SETTLE_MS } = await import('../src/core/settle.js'), { changed, taken } = await import('../src/core/work.js'), { drawersMade } = await import('../src/scatter/drawer.js');
  const threw = [], said = (e) => threw.push(String(e?.message ?? e).split('\n')[0].slice(0, 300));
  process.on('uncaughtException', said); process.on('unhandledRejection', said);
  renderer.domElement ??= { width: WW * WD, height: WH * WD };   // (what a frame's view is compared by besides the camera: the canvas's pixels)
  watch({ camera, renderer, screen, temporal, U });
  let came = null; ready.then((r) => (came = r));
  const t0 = performance.now(); let f = 0;
  while (!came && !threw.length && performance.now() - t0 < SETTLE_MS) { frame(++f / 60); tick(changed()); taken(); await new Promise((r) => setTimeout(r)); }   // (each frame a turn of its own: the workers' answers come in between)
  return { ready: !!came, frames: f, secs: +((performance.now() - t0) / 1000).toFixed(1), limit: SETTLE_MS / 1000, out: waiting(), threw,
    drawers: drawersMade().map((D) => ({ name: D.name, asked: D.stats.asked, put: D.stats.put, out: D.waiting() })) };
}
