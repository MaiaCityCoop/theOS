// The smoke gate (intent 0038): the world made on the GPU's stand-in (tools/gpu-mock.js) as the game makes it at its
// start (src/boot.js), and every material and every compute pass it makes built into WGSL: the screen's passes and the
// upscale, the painted materials, the ground under the camera, the land and its pages, every stand and everything the
// scatter's engines grow, what stands at a place, the sky, the weather, the shadows, the city; then the library's
// subject for every asset. A material is built as each pass draws it (src/core/pass.js: its own, its prepass's and its
// colour's twins). What would throw on a page as it builds (a name left unbound, node code that does not build, a module
// that does not load) throws here, on the CPU, in a minute or two: CI runs it on every push.
//
//   bun tools/smoke.js        a line a part (what it made, what it built), every failure with where it was thrown;
//                             exit 1 if anything failed
//   bun tools/smoke.js --json the same as one line of JSON: what was built, what a start of the world compiles (its
//                             pipelines, by their WGSL text: tools/health.js holds them to the base), what failed
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mock } from './gpu-mock.js';

const t0 = performance.now(), failed = [], made = [], bakers = [];
// (every pipeline built, by its WGSL text, not by object: a render one is a vertex and a fragment stage)
const shaders = { render: new Set(), compute: new Set() };
/** Pipelines by their WGSL text: render and compute ones, the distinct shader modules they hold, and those modules'
    bytes. */
const pipelinesOf = ({ render, compute }) => {
  const modules = new Set([...[...render].flatMap((p) => p.split('\0')), ...compute]);
  return { render: render.size, compute: compute.size, modules: modules.size, bytes: [...modules].reduce((s, m) => s + Buffer.byteLength(m), 0) };
};
const M = await mock({ lean: true }), { THREE, renderer } = M;
// (what three says is wrong as it builds, it says by console.error: a failure here, said with the part it was in)
let part = 'loading';
const said = console.error;
console.error = (...a) => { failed.push(`${part}: ${a.map(String).join(' ').split('\n')[0]}`); };
// (what throws later, in a callback the start set going: a failure too, said with the part that set it going)
process.on('uncaughtException', (e) => failed.push(`${part}, later: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`));
process.on('unhandledRejection', (e) => failed.push(`${part}, later: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`));
const trace = process.env.TRACE ? (w) => said(`smoke: ${w} (${((performance.now() - t0) / 1000).toFixed(1)} s)`) : () => {};
const tryTo = async (name, fn) => { part = name; trace(name); try { return await fn(); } catch (e) { failed.push(`${name}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`); return null; } };

// ---- the world, as src/boot.js makes it ----
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.15, 30000); scene.add(camera);
const game = await tryTo('the screen', async () => {
  const { createUniforms } = await import('../src/core/uniforms.js'), U = createUniforms(camera, 0x9fc2e6);
  (await import('../src/detail/impostor.js')).setImpostorRenderer(renderer);
  const { createTemporal } = await import('../src/core/temporal.js'), { createScreen } = await import('../src/core/screen.js'), { createLens } = await import('../src/camera/post.js');
  const temporal = createTemporal(renderer), screen = createScreen(renderer, { temporal, lens: createLens(renderer) });
  (await import('../src/detail/measure.js')).keepMeasure(() => screen.inside);
  return { U, temporal, screen };
});
const tex = await tryTo('the materials painted', async () => {
  const { bakeTextures } = await import('../src/materials/bake.js'), tex = bakeTextures(renderer, { spare: 1 });
  (await import('../src/world/tile.js')).useTiles(tex); (await import('../src/world/light.js')).useBackend(renderer);
  return tex;
}) ?? M.tiles;
const ground = await tryTo('the ground', async () => {
  const { createGround } = await import('../src/scatter/ground.js'), ground = createGround(renderer, tex);
  (await import('../src/world/rocksolid.js')).useGround(ground); await ground.compile();
  return ground;
});
await tryTo('the land', async () => { const { createTerrain } = await import('../src/terrain/terrain.js'), terrain = createTerrain(scene, tex, renderer); await terrain.compile(); });
await tryTo('what grows', async () => { const { createScatter } = await import('../src/scatter/index.js'), { ahead } = await import('../src/core/compile.js'), scatter = createScatter(scene, tex, ground, renderer, camera); await scatter.compile(); await ahead(scatter.ahead()); bakers.push(...(scatter.bakes?.() ?? [])); });   // (and every tier's own packing, as the world makes it after its first frame: src/core/compile.js)
await tryTo('what stands at a place', async () => {
  const { recipe } = await import('../src/core/registry.js'), { place } = await import('../src/world/place.js'), { stand } = await import('../src/scatter/placed.js'), { PLACES } = await import('../world/places.js');
  for (const at of Object.values(PLACES)) { const a = recipe(at.asset); if (!stand(a, at)) place(scene, a, at); }
});
await tryTo('the sky, the weather, the shadows', async () => {
  (await import('../src/world/sky.js')).createSky(scene, camera, renderer);
  (await import('../src/world/weather/index.js')).createWeather({ scene, renderer, camera });
  (await import('../src/world/shadow.js')).createShadows(renderer);
});
await tryTo('the city', async () => { (await import('../src/city/index.js')).createCity({ scene, camera, canvas: { addEventListener() {}, style: {} }, renderer, compile: () => Promise.resolve() }); (await import('../src/world/lakes.js')).createLakes(); });
await tryTo('a frame', async () => { game?.screen?.render(scene, camera); });

// ---- every material made, built as each pass draws it ----
const { twinOf } = await import('../src/core/pass.js');
const built = new Set(), materials = new Map();
const take = (object, m) => { if (m?.isNodeMaterial && !materials.has(m)) materials.set(m, object); };
scene.traverse((o) => { for (const m of [o.material].flat()) take(o, m); });
for (const o of M.drawn) { if (o.isMaterial) take({ isMesh: true, geometry: new THREE.PlaneGeometry(), material: o }, o); else for (const m of [o.material].flat()) take(o, m); }
const buildAll = (where) => {
  for (const [m, object] of materials) {
    if (built.has(m)) continue; built.add(m);
    part = `${where}: ${object.name || object.type || 'a thing'} (${m.name || m.type})`;
    const twins = (() => { try { return twinOf(m); } catch { return { pre: null, main: null }; } })();
    for (const [pass, mat] of [['own', m], ['pre', twins.pre], ['main', twins.main]]) {
      if (!mat) continue;
      try { const s = M.build(object.isMesh || object.isPoints || object.isLine || object.isSprite ? object : { isMesh: true, geometry: new THREE.BufferGeometry(), material: mat }, mat); shaders.render.add(`${s.vertex}\0${s.fragment}`); made.push(pass); }
      catch (e) { failed.push(`${part}, ${pass}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`); }
    }
  }
};
buildAll('the world');
// what bakes the far ends (src/scatter/trees.js farOf): compiled at the start, drawn straight by the bakers, by no pass,
// so as itself only (no prepass or colour twin)
for (const o of bakers) for (const m of o.userData.materials) {
  if (built.has(m)) continue; built.add(m); part = `the world: a far end's bake (${m.name || m.type})`;
  try { const s = M.build(o, m); shaders.render.add(`${s.vertex}\0${s.fragment}`); made.push('own'); } catch (e) { failed.push(`${part}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`); }
}
let passes = 0;
for (const node of M.computed) { part = `a compute pass (${node.name || node.type || 'compute'})`; try { shaders.compute.add(M.compute(node)); passes++; } catch (e) { failed.push(`${part}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`); } }
const world = { materials: built.size, builds: made.length, passes, pipelines: pipelinesOf(shaders) };   // (counted here: the world's start, not the library's)

// ---- the library: every asset's subject, as its page stands it (src/library) ----
const library = new THREE.Scene();
await tryTo('the library', async () => {
  const { recipes } = await import('../src/core/registry.js'), { engineOf, rowOf } = await import('../src/scatter/index.js'), { place } = await import('../src/world/place.js'), { STAGE } = await import('../world/places.js');
  for (const a of recipes('asset')) {
    part = `the library: ${a.name}`;
    try {
      if (a.placement?.at === 'scatter') { const E = engineOf(a), T = E?.thumb?.(tex, rowOf(a)); for (const t of T?.things ?? []) library.add(t); }
      else place(library, a, { x: STAGE.x, z: STAGE.z, asset: a.uid });
    } catch (e) { failed.push(`${part}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`); }
  }
});
const before = built.size;
library.traverse((o) => { for (const m of [o.material].flat()) take(o, m); });
buildAll('the library');

console.error = said;
const secs = ((performance.now() - t0) / 1000).toFixed(1), P = world.pipelines, summary = { world, library: built.size - before, secs: +secs, failed: [...new Set(failed)] };
keep(summary);
if (process.argv.includes('--json')) { console.log(JSON.stringify(summary)); process.exit(failed.length ? 1 : 0); }
console.log(`smoke: the world ${world.materials} materials (${world.builds} builds by pass), ${world.passes} compute passes, ${P.render} render and ${P.compute} compute pipelines, ${P.modules} shader modules, ${(P.bytes / 1024).toFixed(1)} KB of WGSL; the library ${built.size - before} materials more; ${secs} s`);
if (failed.length) { console.log(`\n${failed.length} failed:\n  ${[...new Set(failed)].join('\n  ')}`); process.exit(1); }
console.log('smoke: every material and pass built');
process.exit(0);   // (the game's own timers and loops would keep it running)

/** The run's summary kept for its commit (.gate/smoke/<commit>.json) where the tree is that commit as it stands:
    tools/health.js reads it instead of making the world again, and CI keeps main's, so a pull request's base is never
    made again either. */
function keep(s) {
  const git = (...a) => spawnSync('git', a, { cwd: import.meta.dirname, encoding: 'utf8' }).stdout?.trim() ?? '';
  const sha = git('rev-parse', 'HEAD'), dir = new URL('../.gate/smoke/', import.meta.url).pathname;
  if (!sha || git('status', '--porcelain')) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${sha}.json`, JSON.stringify(s));
}
