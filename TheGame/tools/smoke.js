// The smoke gate (intent 0038): the world made on the GPU's stand-in (tools/gpu-mock.js) as the game makes it at its
// start (src/boot.js), and every material and every compute pass it makes built into WGSL: the screen's passes and the
// upscale, the painted materials, the ground under the camera, the land and its pages, every stand and everything the
// scatter's engines grow, what stands at a place, the sky, the weather, the shadows, the city; then the library's
// subject for every asset. A material is built as each pass draws it (src/core/pass.js: its own, its prepass's and its
// colour's twins). What would throw on a page as it builds (a name left unbound, node code that does not build, a module
// that does not load) throws here, on the CPU, in a minute or two: CI runs it on every push. And every place in the
// game's code that makes shaders (tools/sites.js) is held against what was built: one the smoke never built, and that
// tools/unbuilt.json does not name, fails (2026-11-19: the canopy's two passes were never made here, so never compiled
// by the gate, tools/gate/wgsl.js).
//
//   bun tools/smoke.js        a line a part (what it made, what it built), every failure with where it was thrown;
//                             exit 1 if anything failed
//   bun tools/smoke.js --json the same as one line of JSON: what was built, what a start of the world compiles (its
//                             pipelines, by their WGSL text: tools/health.js holds them to the base), what failed
//   bun tools/smoke.js --wgsl f  and every shader module built (the world's and the library's), each with the part it was
//                             built for, kept in f as JSON: what tools/gate/wgsl.js compiles on a device
//   bun tools/smoke.js --full    and what grows after it is made, waited for (the characters' figures, flesh and skin:
//                             a worker grows the bones; Bun given a page's frames and workers that import the game's
//                             modules): a minute, so the hour and gate.js wgsl run it, CI's smoke does not
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mock } from './gpu-mock.js';
import { sitesIn, gameFiles } from './sites.js';

const t0 = performance.now(), failed = [], made = [], bakers = [];
// (every pipeline built, by its WGSL text, not by object: a render one is a vertex and a fragment stage)
const shaders = { render: new Set(), compute: new Set() }, named = new Map();
/** A pipeline's WGSL kept (render: its vertex and fragment stage, joined by a NUL), with the first part it was built for;
    and held to what three's functions need (a node function with a layout, setLayout): three writes a function's code
    once, in the first shader that calls it, and every later shader takes that text (2026-11-19), so a function that
    names a uniform, a buffer or a texture names another shader's in every shader after the first. It is handed them
    instead (src/world/land.nodes.js riverRaw: the sandbox's uniform). */
const FN = /\nfn (\w+) \([^)]*\)[^{]*\{([\s\S]*?)\n\}/g, BINDS = /\b(?:object|render|frame)\.\w+|\bnodeUniform\d+\b|\bNodeBuffer\w*/, naming = new Set();
const add = (set, text, label) => {
  if (!set.has(text)) for (const [, fn, body] of text.matchAll(FN)) if (fn !== 'main' && !naming.has(fn) && BINDS.test(body)) { naming.add(fn); failed.push(`${label}: its function ${fn} names ${body.match(BINDS)[0]}: three writes a function once, in the first shader that calls it, so in every later one that is another shader's (hand it to the function)`); }
  set.add(text); if (!named.has(text)) named.set(text, label);
};
/** Pipelines by their WGSL text: render and compute ones, the distinct shader modules they hold, and those modules'
    bytes. */
const pipelinesOf = ({ render, compute }) => {
  const modules = new Set([...[...render].flatMap((p) => p.split('\0')), ...compute]);
  return { render: render.size, compute: compute.size, modules: modules.size, bytes: [...modules].reduce((s, m) => s + Buffer.byteLength(m), 0) };
};
// (the run's mode, decided once: the quick one CI runs, or --full, which waits for what grows after it is made, the
// characters' figures, flesh and skin, and gives Bun what a page has and it has not for it: its frames, and its workers
// able to import the game's modules, given tools/glob.js first. Each mode says what it waits for of a thing made, and
// which unbuilt places it knows, tools/unbuilt.json)
const MODE = process.argv.includes('--full') ? fullMode() : { grown: () => null, known: (J) => ({ ...J.sites, ...J.full }) };
function fullMode() {
  globalThis.requestAnimationFrame ??= (f) => setTimeout(() => f(performance.now())); globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
  const Real = globalThis.Worker, GLOB = new URL('./glob.js', import.meta.url).pathname;
  globalThis.Worker = class extends Real { constructor(url, o = {}) { super(url, { ...o, preload: [...[o.preload ?? []].flat(), GLOB] }); } };
  return { grown: (made) => made.grown, known: (J) => ({ ...J.sites }) };
}
const M = await mock({ lean: true }), { THREE, renderer } = M;
// (where each material and compute pass is made: the game's own frames on the stack as three's constructor sets its
// flag, by function, tools/sites.js; what a shader is called where it is kept, with its step and name below:
// tools/gate/wgsl.js)
const SITE = new WeakMap(), ROOT = new URL('..', import.meta.url).pathname;
// (and every one of them, and every mesh, kept as it is made: what the start makes is built here whether its one frame
// drew it or not, the lens's blur, say, made with the lens and drawn only out of focus)
const MADE = { isMaterial: [], isComputeNode: [], isMesh: [] };
for (const [C, flag] of [[THREE.Material, 'isMaterial'], [THREE.ComputeNode, 'isComputeNode'], [THREE.Mesh, 'isMesh']]) Object.defineProperty(C.prototype, flag, { configurable: true, set(v) { Object.defineProperty(this, flag, { value: v, writable: true, enumerable: true, configurable: true }); MADE[flag].push(this); } });
// (where each was made, by the place's own name the loader hands it with, tools/glob.js, tools/sites.js: never a stack's)
globalThis.__made = (id, x) => { if (x && typeof x === 'object' && !SITE.has(x)) SITE.set(x, id); return x; };
// (the game's own files and every place in them that makes shaders, read once: a frame named by its place's own line;
// git asked as from here, whatever a hook running it set: inside one, GIT_DIR made it list the repository's from its top)
const FILES = gameFiles(ROOT), SITES = sitesIn(ROOT, FILES), PLACE = new Map(SITES.map((p) => [p.id, p]));
const at = (x) => { const id = SITE.get(x); return id ? ` at ${id} ${PLACE.get(id)?.fn ?? ''}`.trimEnd() : ''; };   // (where it is made: its place's own name, and the function it is made in)
const BUILT = new Set(), built_ = (x) => { const id = SITE.get(x); if (id) BUILT.add(id); };   // (the game's places whose materials and passes were built here: unmade below)
// (what three says is wrong as it builds, it says by console.error: a failure here, said with the part it was in)
let part = 'loading';
const said = console.error;
console.error = (...a) => { failed.push(`${part}: ${a.map(String).join(' ').split('\n')[0]}`); };
// (what throws later, in a callback the start set going: a failure too, said with the part that set it going)
process.on('uncaughtException', (e) => failed.push(`${part}, later: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`));
process.on('unhandledRejection', (e) => failed.push(`${part}, later: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`));
const trace = process.env.TRACE ? (w) => said(`smoke: ${w} (${((performance.now() - t0) / 1000).toFixed(1)} s)`) : () => {};
const tryTo = async (name, fn) => { part = name; trace(name); try { return await fn(); } catch (e) { failed.push(`${name}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`); return null; } finally { madeIn(name); } };
// (each material and compute pass with the step of the start it was first made in, and a thing with its nearest named
// self or forebear: what a shader is called where it is kept, tools/gate/wgsl.js)
const origin = new Map(), madeIn = (step) => { const at = (x) => { if (x && !origin.has(x)) origin.set(x, step); }; scene?.traverse((o) => [o.material].flat().forEach(at)); for (const o of M.drawn) (o.isMaterial ? [o] : [o.material].flat()).forEach(at); M.computed.forEach(at); };
const nameOf = (o) => { let p = o; while (p && !p.name) p = p.parent; return p?.name || o.type || 'a thing'; };

// ---- the world, as src/boot.js makes it ----
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.15, 30000); scene.add(camera);
const game = await tryTo('the screen', async () => {
  const { createUniforms } = await import('../src/core/uniforms.js'), U = createUniforms(camera);
  (await import('../src/detail/impostor.js')).setImpostorRenderer(renderer);
  const { createTemporal } = await import('../src/core/temporal.js'), { createScreen } = await import('../src/core/screen.js'), { createLens } = await import('../src/camera/post.js');
  const temporal = createTemporal(renderer), screen = createScreen(renderer, { temporal, lens: createLens(renderer) });
  (await import('../src/detail/measure.js')).keepMeasure(() => screen.out);
  return { U, temporal, screen };
});
const tex = await tryTo('the materials painted', async () => {
  const { bakeTextures } = await import('../src/materials/bake.js'), tex = bakeTextures(renderer, { spare: 1 });
  (await import('../src/world/tile.js')).useTiles(tex);
  (await import('../src/world/light/start.js')).startLight(renderer, game?.screen);   // (the light's start where the start has it: before any material)
  return tex;
}) ?? M.tiles;
const ground = await tryTo('the ground', async () => {
  const { createGround } = await import('../src/scatter/ground.js'), ground = createGround(renderer, tex);
  (await import('../src/world/rocksolid.js')).useGround(ground); await ground.compile();
  return ground;
});
const terrain = await tryTo('the land', async () => { const { createTerrain } = await import('../src/terrain/terrain.js'), terrain = createTerrain(scene, tex, renderer); await terrain.compile(); return terrain; });
await tryTo('what grows', async () => { const { createScatter } = await import('../src/scatter/index.js'), { ahead } = await import('../src/core/compile.js'), scatter = createScatter(scene, tex, ground, renderer, camera); await scatter.compile(); await ahead(scatter.ahead()); bakers.push(...(scatter.bakes?.() ?? [])); });   // (and every tier's own packing, as the world makes it after its first frame: src/core/compile.js)
await tryTo('what stands at a place', async () => {
  const { recipe } = await import('../src/core/registry.js'), { place } = await import('../src/world/place.js'), { stand } = await import('../src/scatter/placed.js'), { PLACES } = await import('../world/places.js');
  for (const at of Object.values(PLACES)) { const a = recipe(at.asset); if (!stand(a, at)) place(scene, a, at); }
});
const light = await tryTo('the sky, the weather, the light', async () => {
  (await import('../src/world/sky.js')).createSky(scene, camera, renderer);
  (await import('../src/world/weather/index.js')).createWeather({ scene, renderer, camera });
  // (the light's passes as src/boot.js makes them: the shadow cascades and the canopy map with its sky probes)
  const { createLight } = await import('../src/world/light/index.js'), { groundAt } = await import('../src/world/land.nodes.js'), { crownsAt, crownsVersion } = await import('../src/terrain/layers.js');
  return createLight(renderer, { groundAt, land: terrain?.pages, crowns: { at: crownsAt, version: crownsVersion } });   // (its inputs as src/boot.js gives them)
});
await tryTo('the city', async () => { (await import('../src/city/index.js')).createCity({ scene, camera, canvas: { addEventListener() {}, style: {} }, renderer, compile: () => Promise.resolve() }); (await import('../src/world/lakes.js')).createLakes(); });
await tryTo('a frame', async () => { light?.render(scene, camera, 0); game?.screen?.render(scene, camera); await Promise.resolve(); await (await import('../src/core/compile.js')).inTurn(() => {}); });   // (the light's passes before the picture, as src/boot.js draw; and what it asked to be made, made: its passes of their own, src/core/compile.js drawMade)

// ---- every material made, built as each pass draws it ----
const { twinOf } = await import('../src/core/pass.js'), { prepassTarget } = await import('../src/core/screen.js'), { lightPass } = await import('../src/core/gbuffer.js'), { CASTS } = await import('../src/world/shadow.js');
const PRE_TARGET = prepassTarget(4, 4, new THREE.DepthTexture(4, 4));   // (the prepass built as it draws: into its target, writing its id too)
const built = new Set(), materials = new Map();
const take = (object, m) => { if (m?.isNodeMaterial && !materials.has(m)) materials.set(m, object); };
scene.traverse((o) => { for (const m of [o.material].flat()) take(o, m); });
for (const o of M.drawn) { if (o.isMaterial) take({ isMesh: true, geometry: new THREE.PlaneGeometry(), material: o }, o); else for (const m of [o.material].flat()) take(o, m); }
/** Material m of `object` built as each pass draws it (src/core/pass.js: its own, its prepass's and its colour's twins;
    and what a caster draws into the shadow cascades and the canopy map, its shadow twin: src/world/shadow.js). */
const buildPasses = (object, m) => {
  const twins = (() => { try { return twinOf(m); } catch { return { pre: null, main: null }; } })();
  for (const t of Object.values(twins)) if (t?.isMaterial) TWINS.add(t);   // (built as its material's twin, never on its own)
  for (const [pass, mat] of [['own', m], ['pre', twins.pre], ['main', twins.main], ['shadow', object.layers?.isEnabled?.(CASTS) ? twins.shadow : null]]) {
    if (!mat) continue;
    if (pass === 'pre') renderer.setRenderTarget(PRE_TARGET);
    try { const s = M.build(object.isMesh || object.isPoints || object.isLine || object.isSprite ? object : { isMesh: true, geometry: new THREE.BufferGeometry(), material: mat }, mat); add(shaders.render, `${s.vertex}\0${s.fragment}`, `${part}, ${pass}`); made.push(pass); built_(m); }
    catch (e) { failed.push(`${part}, ${pass}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`); }
    if (pass === 'pre') renderer.setRenderTarget(null);
  }
};
const buildAll = (where) => {
  for (const [m, object] of materials) {
    if (built.has(m)) continue; built.add(m);
    part = `${where}${origin.get(m) && origin.get(m) !== where ? `: ${origin.get(m)}` : ''}: ${nameOf(object)} (${m.name || m.type})${at(m)}`;
    buildPasses(object, m);
  }
};
{ const L = lightPass(); if (L) take(L.mesh, L.mesh.material); }   // (the one pass of light: drawn by the screen, in no scene)
/** Every material made so far and not yet taken: on the mesh it was given to, else on a quad, as a pass draws it. */
const TWINS = new WeakSet(), takeMade = () => { for (const o of MADE.isMesh) for (const m of [o.material, ...(o.userData?.materials ?? [])].flat()) take(o, m); for (const m of MADE.isMaterial) if (!TWINS.has(m)) take({ isMesh: true, geometry: new THREE.PlaneGeometry(), material: m }, m); };   // (a mesh's own, and those it draws by turns: a baker's, userData.materials)
takeMade();
buildAll('the world');
// what bakes the far ends (src/scatter/trees.js farOf): compiled at the start, drawn straight by the bakers, by no pass,
// so as itself only (no prepass or colour twin); and the bakers' own reduce (src/detail/impostor.js createBaker: a row's
// samples into the atlas' three textures), the views' and the clumps' tiles'
await tryTo("the far ends' reduce", async () => { const { bakers: of } = await import('../src/detail/impostor.js'); bakers.push(...of().views().reduces, ...of().tiles(1).reduces); });
for (const o of bakers) for (const m of o.userData.materials) {
  if (built.has(m)) continue; built.add(m); part = `the world: a far end's bake (${m.name || m.type})`;
  try { const s = M.build(o, m); add(shaders.render, `${s.vertex}\0${s.fragment}`, part); made.push('own'); built_(m); } catch (e) { failed.push(`${part}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`); }
}
let passes = 0;
/** Every compute pass made or run and not yet built, built (after each step: what it made since). */
const COMPILED = new WeakSet(), computeAll = () => { for (const node of new Set([...M.computed, ...MADE.isComputeNode])) { if (COMPILED.has(node)) continue; COMPILED.add(node); part = `a compute pass of ${origin.get(node) ?? 'the start'} (${node.name || node.type || 'compute'})${at(node)}`; try { add(shaders.compute, M.compute(node), part); passes++; built_(node); } catch (e) { failed.push(`${part}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`); } } };
computeAll();
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
  // (and what its pages stand besides: every material's ball, src/library/subjects.js; every character, and a person
  // of one's own on the settler, as me.html's stage makes it, src/me/stage.js)
  const { materialPreview } = await import('../src/materials/preview.js'), { humanOf } = await import('../characters/kit/human.js'), { personOf, randomAvatar } = await import('../characters/kit/avatar.js');
  for (const m of recipes('material')) { part = `the library: ${m.name}, its ball`; library.add(new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), materialPreview(tex, m.uid, 2))); }
  const people = recipes('character'), settler = people.find((c) => c.uid === '944dc52a-5094-480c-9396-5ceedbbf03b1');
  const grown = [], stand = (made) => { library.add(made.object); const g = MODE.grown(made); if (g) grown.push(g.catch((e) => failed.push(`${part}, grown: ${String(e?.message ?? e).slice(0, 300)}`))); };
  for (const c of people) { part = `the library: ${c.name}`; stand(c.make(tex)); }   // (each as its own recipe makes it: a figure, a skeleton, a person; what grows of it after, waited for with --full)
  if (settler) { part = 'the library: a person of one\'s own'; stand(humanOf(tex, personOf(randomAvatar(() => 0.5), settler))); }
  await Promise.all(grown);
});
const before = built.size;
library.traverse((o) => { for (const m of [o.material].flat()) take(o, m); });
takeMade();
buildAll('the library');
computeAll();
const libraryMade = built.size - before;
// ---- the stress stand (src/scatter/stress.js, the engine's test, ?stress): its zoo, apart from the world's count ----
const stress = new THREE.Scene();
await tryTo('the stress stand', async () => { (await import('../src/scatter/stress.js')).createStress(stress, renderer, tex); });
stress.traverse((o) => { for (const m of [o.material].flat()) take(o, m); });
takeMade();
buildAll('the stress stand');
computeAll();
// ---- what a browser without WebGPU draws (three's WebGL 2 backend, the stand-in's webgl): the picture built over time
// without storage textures (src/core/temporal.js), built as GLSL, apart from the WGSL ----
let glsl = 0;
await tryTo('the WebGL 2 fallback', async () => {
  const G = await mock({ webgl: true, lean: true }), from = MADE.isMaterial.length;
  (await import('../src/core/temporal.js')).createTemporal(G.renderer);
  for (const o of MADE.isMesh) for (const m of [o.material].flat()) if (MADE.isMaterial.indexOf(m) >= from) { TWINS.add(m); part = `the WebGL 2 fallback: ${nameOf(o)} (${m.name || m.type})${at(m)}`; try { G.build(o, m); glsl++; built_(m); } catch (e) { failed.push(`${part}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' · ')}`); } }
});

console.error = said;
// (a place that makes shaders the smoke does not build, and tools/unbuilt.json does not know: a new gap, a failure;
// one it knows, said; one it knows now built, said, to be taken out of it)
if (!SITES.length) failed.push(`the game's code gave no place that makes shaders (git ls-files in ${ROOT}: ${FILES.length} files): nothing was held against what was built`);   // (a census that sees nothing must not pass)
// (known: the gaps of every run, `sites`; and, but with --full, what only --full builds, `full`: --full must build it)
const KNOWN = new URL('./unbuilt.json', import.meta.url), J = existsSync(KNOWN) ? JSON.parse(readFileSync(KNOWN, 'utf8')) : {}, unmade = unbuilt(), known = MODE.known(J), count = {};
for (const u of unmade) count[u.at] = (count[u.at] ?? 0) + 1;
for (const [at, n] of Object.entries(count)) if (n > (known[at] ?? 0)) failed.push(`what the game makes at ${at} the smoke never builds (${n} place${n > 1 ? 's' : ''}: ${unmade.filter((u) => u.at === at).map((u) => `line ${u.line}`).join(', ')}), so the gate never compiles it: make it here, or name it in tools/unbuilt.json with why`);
const closed = Object.entries(known).filter(([at, n]) => (count[at] ?? 0) < n).map(([at]) => at), fullOnly = Object.keys(count).filter((at) => J.full?.[at]);
const secs = ((performance.now() - t0) / 1000).toFixed(1), P = world.pipelines, summary = { world, library: libraryMade, stress: built.size - before - libraryMade, glsl, secs: +secs, unbuilt: unmade.map((u) => `${u.at} (line ${u.line})`), failed: [...new Set(failed)] };
keep(summary);
const wgslAt = process.argv.indexOf('--wgsl');
if (wgslAt > 0) writeFileSync(process.argv[wgslAt + 1], JSON.stringify({ render: [...shaders.render].map((t) => { const [vertex, fragment] = t.split('\0'); return { label: named.get(t), vertex, fragment }; }), compute: [...shaders.compute].map((code) => ({ label: named.get(code), code })) }));
if (process.argv.includes('--json')) { console.log(JSON.stringify(summary)); process.exit(failed.length ? 1 : 0); }
console.log(`smoke: the world ${world.materials} materials (${world.builds} builds by pass), ${world.passes} compute passes, ${P.render} render and ${P.compute} compute pipelines, ${P.modules} shader modules, ${(P.bytes / 1024).toFixed(1)} KB of WGSL; the library ${libraryMade} materials more, the stress stand ${built.size - before - libraryMade}, the WebGL 2 fallback ${glsl} (GLSL); ${secs} s`);
if (failed.length) { console.log(`\n${failed.length} failed:\n  ${[...new Set(failed)].join('\n  ')}`); process.exit(1); }
if (fullOnly.length) console.log(`smoke: ${fullOnly.length} places built only with --full, what grows after it is made (tools/unbuilt.json full; the hour and gate.js wgsl run it): ${fullOnly.join('; ')}`);
const gaps = Object.keys(count).filter((at) => !J.full?.[at]);
if (gaps.length) console.log(`smoke: ${gaps.length} places in the game's code make shaders the smoke does not build, as tools/unbuilt.json says: ${gaps.join('; ')}`);
if (closed.length) console.log(`smoke: now built, take out of tools/unbuilt.json: ${closed.join('; ')}`);
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

/** Every place in the game's code that makes a node material or a compute pass (tools/sites.js: the game's own files,
    not the tools' or three's), by the function it is made in, none of whose were built here: what the gate would never
    compile (2026-11-19: the canopy's two passes, src/world/light/canopy.js, never made here, so never built, nor
    compiled by tools/gate/wgsl.js). Each { at: 'file function', line }. */
function unbuilt() {
  return SITES.filter((x) => !BUILT.has(x.id)).map((x) => ({ at: `${x.file} ${x.fn}`, line: x.line }));
}
