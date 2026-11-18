// One start for every page that draws the world (intent 0038, stage 3). boot({ profile }) makes what every page shares
// (the renderer, the one way to the screen, the clock, the sky and the weather, the light and its shadows, the land) and
// what its profile adds, then runs the frame:
//
//   world   the game (index.html, lenses.html, a film's live world: cine/film.js): the land to the horizon and all
//           that stands and grows on it, the places, the city, the walker. Every material is compiled before the first
//           frame.
//   stage   one subject at a time on the library's stage (library.html, me.html: src/stage/studio.js): the land round
//           the stage and nothing on it but what the page shows (show), each subject's materials compiled when it is
//           shown and its textures painted when it first wears them; what grows on the land only for a subject that is
//           the meadow itself (grow: the grass, a biome)
//
// It gives the game (window.__game: what the pages, the films and the tools read) as soon as its parts are made, before
// they are compiled; game.ready is the page's first view complete (src/core/settle.js), what the gate waits for. The
// virtual camera (cine/cine.js: every frame passes through it) and the game's pill (cine/menu.js) come with it, first.
// What each folder of src/ does: ../README.md. A frame only moves uniforms and chooses what to draw.
import { outlinesKept, keepOutlines } from './core/outlines.js';   // (first: what was measured of the plants at an earlier start is read back before any file asks a plant's size)
import '../cine/cine.js';   // the virtual camera, before anything asks for a frame: it holds the game's camera wherever a page or a film says
import '../cine/menu.js';   // the game's pill
import * as THREE from 'three/webgpu';
import { loadingStep, loadingDone } from './ui/loading.js';   // the veil is told what is being made
import { HMIN, heightAt } from './world/land.js';
import { createUniforms } from './core/uniforms.js';
import { keepMeasure, TRUTH } from './detail/measure.js';
import { setImpostorRenderer } from './detail/impostor.js';
import { setPlanes } from './core/frustum.js';
import { createGovernor } from './core/governor.js';
import { createHud } from './core/hud.js';
import { useGPU } from './core/gpu.js';
import { taken, busy, changed } from './core/work.js';
import { settle, ready as firstView, waiting, watch, tick, partOf, leave } from './core/settle.js';
import { bakeTextures } from './materials/bake.js';
import { createTerrain, landMaterials } from './terrain/terrain.js';
import { createGround } from './scatter/ground.js';
import { createScatter } from './scatter/index.js';
import { recipe } from './core/registry.js';
import { place } from './world/place.js';
import { stand } from './scatter/placed.js';   // what stands at a spot of its own, drawn by the one drawer (intent 0029)
import { PLACES, STAGE } from '../world/places.js';
import { spawn } from './camera/walk.js';
import { createControls } from './camera/rig.js';   // the one camera, from the walker's eyes to the city (intent 0003)
import { createLens } from './camera/post.js';
import { createScreen } from './core/screen.js';
import { createTemporal } from './core/temporal.js';
import { createSky } from './world/sky.js';
import { createWeather } from './world/weather/index.js';
import { useBackend } from './world/light.js';
import { useTiles } from './world/tile.js';
import { createShadows } from './world/shadow.js';
import { useGround } from './world/rocksolid.js';
import { showBodies } from './world/bodies.js';
import { createCity } from './city/index.js';
import { createLakes } from './world/lakes.js';   // the city's plots over the land, seen from above (world/city.js)
import { inTurn, shareComputeCompiles, countCompiles } from './core/compile.js';
import { flag } from './core/flags.js';

const SKY = 0x9fc2e6, REACH = 6000;   // REACH: how far the stage's land is drawn (m): it ends in the air beyond what its camera looks at
// (each compile given 20 s: a pipeline the GPU never answers for, or one that fails, held the veil over the page for good
// (Samuel's Mac, 2026-11-17, at "Lighting the world"). Past that the page goes on, and what was not compiled is compiled
// as it is first drawn: a slow first frame, never a page that does not come)
const inTime = (what, p) => Promise.race([p.then(() => true, (err) => { console.warn(`the start: ${what} could not be compiled:`, err); return false; }), new Promise((res) => setTimeout(() => res(null), 20000))]).then((ok) => { if (ok === null) console.warn(`the start: ${what} took more than 20 s to compile; going on without waiting for it`); });

/** Start the world for this page: { profile: 'world' | 'stage' }. A promise of the game, once its parts are made. */
export async function boot({ profile = 'world' } = {}) {
  const world = profile === 'world', t0 = performance.now();
  const canvas = document.getElementById('c');
  // (textures of many layers: more than a device gives unasked. The land's pages are two arrays of up to 2048,
  // src/terrain/pages.js; the stress stand keeps its kinds' own textures in one, src/scatter/stress.js. And buffers as
  // large as the GPU has them, not the 128 and 256 MB a device gives unasked: what is shared by many lies in buffers as
  // large as these say, src/core/occlusion.js)
  const A = (await navigator.gpu?.requestAdapter?.({ powerPreference: 'high-performance' }).catch(() => null))?.limits, layers = Math.min(2048, A?.maxTextureArrayLayers ?? 256);
  const limits = { ...(layers > 256 ? { maxTextureArrayLayers: layers } : {}), ...(A ? { maxBufferSize: A.maxBufferSize, maxStorageBufferBindingSize: A.maxStorageBufferBindingSize } : {}) };
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', forceWebGL: flag('webgl'), trackTimestamp: flag('gputime') || flag('bench'), requiredLimits: limits });   // alpha false: the canvas is opaque (a frame's fourth number is not how see-through it is: it says how far what is kept may be trusted, src/core/pass.js; it must not show the page through); ?gputime: the GPU's own time per pass (tools/bench.js); neither the canvas nor any target is multisampled: the screen's picture is built over time (src/core/screen.js)
  if (flag('draws')) (await import('../tools/draws.js')).watch();   // ?draws: every pass and draw a frame asks of the GPU, counted (tools/draws.js: window.__draws), from before the first pipeline is made
  await renderer.init();
  useGPU(renderer);   // what only the GPU reads is kept on the GPU only (src/core/gpu.js)
  shareComputeCompiles(renderer);   // a compute shader compiled once, however many passes run it (src/core/compile.js)
  countCompiles(renderer);   // and what the GPU is compiling counted: the world is not complete before it has come (src/core/settle.js)
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;   // the screen's curve is put on once, by the upscale (src/core/temporal.js), or by a material drawn elsewhere (src/world/light.js toScreen)
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(SKY);
  renderer.info.autoReset = false;   // a frame may be several passes: counted together

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.15, 30000);
  scene.add(camera);
  if (!world) { camera.position.set(STAGE.x + 6, heightAt(STAGE.x, STAGE.z) + 3, STAGE.z + 6); camera.lookAt(STAGE.x, heightAt(STAGE.x, STAGE.z) + 1, STAGE.z); }   // (the stage's camera over the stage from the start: its land is laid round where it looks)
  let sizeW = innerWidth, sizeH = innerHeight, resizes = 0;
  addEventListener('resize', () => {   // only a real change of size rebuilds the canvas: that costs a frame of 100 ms
    if (innerWidth === sizeW && innerHeight === sizeH) return;
    sizeW = innerWidth; sizeH = innerHeight; resizes++;
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false);
  });

  // (settle(): a promise, the world complete for the camera as it stands: nothing streaming or building in any engine, and
  // the picture built over time come to rest on it; ready: the same for the page's first view; waiting(): what is still
  // out. What the gate waits on, never a timer: src/core/settle.js)
  let shown = null; const first = new Promise((res) => (shown = res));   // (the stage's first subject in: its first view is complete once it has settled)
  const game = (window.__game = { profile, renderer, camera, scene, outlines: { kept: outlinesKept, made: 0 }, settle, ready: world ? firstView : first.then(() => settle()), waiting });
  const bounds = world && flag('bounds') ? showBodies(scene) : null;   // ?bounds: what is solid round the walker drawn as lines, in every world (src/world/bodies.js)
  const U = createUniforms(camera, SKY);
  setImpostorRenderer(renderer);
  // The one way to the screen, for every view (src/core/screen.js): the world drawn at the inside's pixels (the governor's
  // dial; the screen keeps all its own), a prepass and the colour (src/core/pass.js), through the lens where the camera
  // brings one (src/camera/post.js), and brought up to the screen and built over time in one pass (src/core/temporal.js).
  const temporal = (game.temporal = createTemporal(renderer));
  const screen = (game.screen = createScreen(renderer, { temporal, lens: createLens(renderer) }));
  const governor = createGovernor(renderer, { apply: (r) => screen.set(r) });
  game.governor = governor;   // the film holds it still while it plays
  keepMeasure(() => screen.inside);   // the one measure of size on screen, for every level of detail (src/detail/measure.js)
  if (TRUTH) governor.hold(true);   // (?truth: everything at its finest, offline: no dial turned for its slow frames)
  watch({ camera, renderer, screen, temporal, U });   // what the world complete is measured against (src/core/settle.js)
  const marks = (game.boot = {}), mark = (k) => (marks[k] = Math.round(performance.now() - t0));   // where the start's time goes
  mark('renderer');
  await loadingStep('Painting the ground', 0.12);
  // (the shaders the start compiles, their bytes and the largest: `bun tools/gate.js compile`. The land's no longer grows
  // with the biomes: src/terrain/layers.js. The stage paints the land's materials at its start, a subject's when it wears them)
  const tex = bakeTextures(renderer, world ? { spare: 1 } : { spare: 8, first: landMaterials() });   // (the library's pictures ask for materials the world may not wear; the start's are compiled side by side and painted while the world is made: tex.ready)
  useTiles(tex);   // node code that reads a baked tile by itself (the clouds' field, the snow's clumps: src/world/tile.js)
  useBackend(renderer);   // and what is lit per corner (a tree) reads the shadow map's texels only where the backend can
  mark('bake');
  await loadingStep('Raising the land', 0.3);
  // what grows on the land (the ground under the camera and every scattered thing: src/scatter): the world's from the
  // start; the stage's once a subject asks for it (grow), in a group of its own that is shown and hidden with it
  let grown = null;
  const growing = (into) => {
    const ground = createGround(renderer, tex);
    useGround(ground);   // the rocks' bodies read their stones from it
    return { ground, pass: ground.compile(), into };   // (its pass, for its own maps: in turn, after the textures' (src/core/compile.js))
  };
  if (world) { grown = growing(scene); game.ground = grown.ground; }
  game.U = U; game.tex = tex;   // for pages that stage things
  mark('ground');
  const terrain = (game.terrain = createTerrain(scene, tex, renderer, world ? {} : { reach: REACH }));
  const layerPass = terrain.compile();   // the land's pages' passes, beside the others (they read no target)
  screen.afterPrepass(terrain.pages.ask, 'pages');   // (which pages the land's pixels read: src/terrain/pages.js)
  mark('terrain');
  const scatterOf = (g) => {
    g.scatter = createScatter(g.into, tex, g.ground, renderer, camera);
    game.scatter = g.scatter;   // for timings and pages that look at it
    g.packing = g.scatter.compile();   // the tiers' packing passes, side by side with the textures' (they read no target)
  };
  if (world) scatterOf(grown);
  mark('scatter');
  if (world) for (const at of Object.values(PLACES)) { const a = recipe(at.asset); if (!stand(a, at)) place(scene, a, at); }   // what stands at a named place, from the asset library: in the one list (src/scatter/placed.js), else on its own (a fire's light; no WebGPU)
  const controls = world ? createControls(camera, canvas, document.getElementById('msg'), document.getElementById('stat')) : null;
  const sky = createSky(scene, camera, renderer);
  // the weather: every condition a plug-in (src/world/weather/*.js: the wind, the snow, the snow falling, the clouds),
  // each on the panel, kept, and set by a film's shot by its id; game[id] for the pages and tools that look at one
  const weather = (game.weather = createWeather({ scene, renderer, camera }));
  for (const id of weather.ids) game[id] = weather[id];
  game.sky = sky;   // the sun and the sky: one time of day drives the light (intent 0007)
  const shadows = createShadows(renderer);   // the casters' shadows, read by every surface (src/world/light.js)
  game.shadows = shadows;
  game.controls = controls;
  const city = world ? (game.city = createCity({ scene, camera, canvas, renderer, compile: (o) => screen.compile(o, camera, scene) })) : null;   // (compiled for the target the world is drawn into)
  const hudAt = document.getElementById('hud'), hud = hudAt ? createHud(hudAt, renderer, camera, governor, game) : null;
  if (controls) spawn(controls);
  // the lakes round the camera (src/world/lakes.js: no river runs in a ring; what it rings round is water): found before the first frame
  const lakes = world ? (game.lakes = createLakes()) : null; let lakesSeen = 0;
  lakes?.lookHere(camera.position.x, camera.position.z);

  // ---- a frame: place the camera, choose what to draw, draw ----
  const projScreen = new THREE.Matrix4();
  const parts = { ctl: 0, ground: 0, terrain: 0, scatter: 0, draw: 0 };   // where a frame's time went, for the hitch log
  const live = () => !!grown?.live && (grown.into === scene || grown.into.parent === scene);   // (what grows on the land is drawn: packed, and in the world)
  function choose(dt) {
    let t = performance.now(), u;
    controls?.update(dt); sky.update(dt); weather.update(dt);
    const p = camera.position, dy = (U.uDy.value = Math.max(0, p.y - heightAt(p.x, p.z) - 2, HMIN - p.y));   // how high above the ground here: lifted, the grass and stones see it far off (intent 0003)
    U.uAirH.value = Math.max(0, p.y - heightAt(p.x, p.z));   // the height fog thins along a line of sight from up here (src/world/light.js)
    camera.updateMatrixWorld();
    setPlanes(projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    city?.update();
    const lod = governor.detail(camera);
    U.uLodInv.value = 1 / lod;
    u = performance.now(); parts.ctl = u - t; t = u;
    if (live()) grown.ground.update(p.x, p.z, dy, lod);
    u = performance.now(); parts.ground = u - t; t = u;
    terrain.update(camera, dy, 1 / lod);
    u = performance.now(); parts.terrain = u - t; t = u;
    if (live()) grown.scatter.select(p.x, p.z, heightAt(p.x, p.z), lod, dy);
    bounds?.(p.x, p.z);
    parts.scatter = performance.now() - t;
  }
  function draw() {
    const gy = heightAt(camera.position.x, camera.position.z);
    weather.before(camera, gy); shadows.render(scene, camera, gy);   // (what a condition draws before the picture: the clouds' shadow map)
    screen.render(scene, camera);   // (through its lens, where the camera brings one)
  }
  let last = 0, wasBusy = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const ms = last ? now - last : 16.7; last = now;
    U.uTime.value = (now - t0) / 1000;
    tex.flush();   // (materials asked for since the last frame: src/materials/bake.js)
    if (lakes) { lakes.update(camera); if (lakes.version !== lakesSeen) { lakesSeen = lakes.version; grown.ground.refresh(); terrain.refresh(); } }   // (new lakes: the ground under the camera drawn again, and its layers)
    renderer.info.reset();
    governor.begin();
    const c0 = performance.now();
    // (a film's footage fills the picture, cine/media.js: the world under it is neither chosen nor drawn, the GPU is the video's)
    if (!game.covered) { choose(Math.min(ms, 100) / 1000); hud?.cpu(performance.now() - c0); const d0 = performance.now(); draw(); parts.draw = performance.now() - d0; }
    governor.end(ms, now, live() && grown.scatter.over, wasBusy); wasBusy = busy();   // (the time since the last frame is that frame's: what it did besides drawing is told with it)
    if (!game.covered) tick(changed());   // (whether the world is complete: src/core/settle.js)
    hitch(ms, now);
    hud?.frame(ms, now, controls && controls.band !== 'eye' ? `  ${controls.band} ${Math.round(controls.height)} m` : '');
  }

  // ---- the hitch log (dev only): every frame over 24 ms, with where its time went, sent to the dev server every
  // few seconds (TheGame/.perf/hitches.jsonl), to find what makes the picture stop. Each post says which tab it is (an id
  // made at its load, its browser, its page), how many frames it drew since the last, and where the governor's dials stand:
  // the frame rate a person's own browser really holds, read from the file ----
  const HITCH = 24, hitches = []; let frames = 0, sentAt = 0;
  const TAB = { id: Math.random().toString(36).slice(2, 8), ua: /Chrome\//.test(navigator.userAgent) ? 'Chrome' : /Safari\//.test(navigator.userAgent) ? 'Safari' : 'other', page: location.pathname + location.search };
  function hitch(ms, now) {
    frames++; const work = taken();   // (what the frame did besides drawing: src/core/work.js)
    if (ms > HITCH && frames > 30) {
      const r = renderer.info.render, c = window.__cine, f = (v) => +v.toFixed(2);
      hitches.push({ at: Math.round(now), ms: f(ms), ctl: f(parts.ctl), ground: f(parts.ground), terrain: f(parts.terrain), scatter: f(parts.scatter), draw: f(parts.draw),
        lod: f(governor.lod), cap: f(governor.cap), dpr: governor.dpr, resizes, w: innerWidth, h: innerHeight, tris: r.triangles, calls: r.drawCalls ?? r.calls, film: c?.clips?.length ? f(c.time) : null, playing: !!c?.playing, page: location.pathname + location.search, ...(Object.keys(work).length ? { work } : {}) });
    }
    if (import.meta.env.DEV && now - sentAt > 4000 && (hitches.length || frames > 0)) {
      sentAt = now;
      const body = JSON.stringify({ at: Math.round(now), clock: new Date().toTimeString().slice(0, 8), ...TAB, hidden: document.hidden, size: [innerWidth, innerHeight], cam: [...camera.position.toArray(), ...camera.getWorldDirection(new THREE.Vector3()).toArray()].map((v) => +v.toFixed(2)), mid: +governor.mid.toFixed(1), out: screen.out, dpr: governor.dpr, lod: +governor.lod.toFixed(2), ms: +governor.ms.toFixed(1), late: +governor.late.toFixed(2), tris: renderer.info.render.triangles, frames, hitches: hitches.splice(0) }); frames = 0;
      fetch(import.meta.env.BASE_URL + 'perf-log', { method: 'POST', body }).catch(() => {});
    }
  }

  // ---- the stage: a subject stood in the world once its materials are compiled ----
  // What an object needs before it is drawn, compiled aside: its materials for the world's two passes and for the shadow
  // map, every level of it (an LOD's too, whatever its distance now), side by side and in turn (src/core/compile.js).
  // Compiled as it is first drawn instead, each pipeline would hold up everything the GPU is asked after it.
  const compiled = (object) => {
    const was = [];
    object.traverse((o) => { was.push([o, o.visible, o.frustumCulled, o.autoUpdate]); o.visible = true; o.frustumCulled = false; if (o.isLOD) o.autoUpdate = false; });
    const gy = heightAt(camera.position.x, camera.position.z), begun = inTurn(() => {});   // (its 20 s count from its turn, not from the queue before it)
    const done = Promise.all([screen.compile(object, camera, scene), shadows.compile(object, camera, gy, scene)]);
    return begun.then(() => inTime(object.name || 'a subject', done))
      .finally(() => { for (const [o, v, f, a] of was) { o.visible = v; o.frustumCulled = f; if (o.isLOD) o.autoUpdate = a; } });
  };
  const showing = new Set();
  /** Stand `object` in the world (in `parent`, the scene by default) once it is compiled: a promise of it, in. */
  const show = (object, parent = scene) => {
    showing.add(object);
    return compiled(object).then(() => { if (showing.delete(object)) { parent.add(object); shown(); } return object; });
  };
  /** Take `object` out of the world again (or before it is in). */
  const hide = (object) => { showing.delete(object); object.removeFromParent(); };
  /** What grows on the land, shown (and started, the first time) or hidden: a promise, once it is drawn. Hidden, it is
      neither packed nor drawn, and what it has out holds nothing up (src/core/settle.js: its own part). */
  const grow = (on = true) => {
    leave('grown', !on);
    if (!on) { if (grown) { grown.on = false; hide(grown.into); } return Promise.resolve(); }
    if (!grown) {
      grown = partOf('grown', () => { const g = growing(new THREE.Group()); scatterOf(g); return g; }); game.ground = grown.ground;
      grown.ready = Promise.all([grown.pass, grown.packing]).then(() => { grown.live = true; grown.scatter.warm(); });   // (packed from the next frame on; drawn once its materials are compiled)
    }
    grown.on = true;
    return grown.ready.then(() => (grown.on ? show(grown.into) : null));   // (unless it was hidden again meanwhile)
  };
  if (!world) Object.assign(game, { show, hide, grow });

  // ---- before the first frame: compile every material, draw everything once ----
  // Every pass is compiled before it is first drawn, side by side (a GPU that can compiles them in parallel), not one at
  // a time as each is first drawn: a pass compiled as it is drawn holds up everything the GPU is asked after it, the
  // page's own uploads too. One compile at a time for a target (three builds a material for the target in place); what
  // packs reads no target, so its passes compile beside the rest (`packing`, above).
  (async () => {
    mark('world');
    await tex.ready;   // the textures painted (their passes compiled side by side since they were asked for)
    mark('painted');
    if (world) { await grown.pass; await grown.packing; grown.live = true; }
    await layerPass;
    await inTurn(() => choose(0));   // (not while something else compiles: src/core/compile.js)
    mark('chosen');
    terrain.all(); if (world) grown.scatter.warm();
    const seen = [];
    if (world) scene.traverse((o) => { if (o.isMesh) { seen.push(o, o.visible); o.visible = true; } });
    mark('built');
    await loadingStep('Lighting the world', 0.55);
    await inTime('the materials', screen.compile(scene, camera));   // every material, for the target the world is drawn into (src/core/screen.js)
    await inTime("the shadow map's casters", shadows.compile(scene, camera, heightAt(camera.position.x, camera.position.z)));   // and every caster, for the shadow map
    tex.flush();   // (a material a shader asked for that no biome or asset names: painted before the first frame)
    mark('compiled');
    screen.render(scene, camera);   // (through the inside's target: its pipelines are the ones a frame uses)
    for (let i = 0; i < seen.length; i += 2) seen[i].visible = seen[i + 1];
    choose(0);
    screen.render(scene, camera);
    game.loadMs = performance.now() - t0;
    setTimeout(() => (game.outlines.made = keepOutlines()), 2500);   // what was measured anew this time, kept for the next start
    console.log(`[the game] ready in ${game.loadMs.toFixed(0)} ms`, marks);
    requestAnimationFrame(frame);
    // the veil goes once the world is on the screen: the stage's once its first subject is in (or after 20 s without one)
    if (!world) await Promise.race([first, new Promise((res) => setTimeout(res, 20000))]);
    requestAnimationFrame(() => requestAnimationFrame(loadingDone));
    if (world && flag('flyby')) import('../tools/flyby.js').then((m) => m.run());   // ?flyby: the camera flown by itself, to watch the plants' levels change (tools/flyby.js)
    if (world && flag('bench')) import('../tools/bench.js').then((m) => m.overlay());   // ?bench: the frame timed at the bench's six views once the world is loaded, the numbers on the screen (tools/bench.js)
  })();
  return game;
}
