// The game: one endless land. This file only wires the parts and runs the frame.
//
//   world/      the land as functions: in JS for the walker's feet (land.js), as nodes for the GPU (land.nodes.js);
//               the light every material shares (light.js), the sky, the shadows, the places and what stands there
//   core/       what everything shares: uniforms, the frustum, the governor, the readout
//   materials/  the ground's textures, painted once at start into one texture array
//   terrain/    the ground and the water: a quadtree of one tile
//   scatter/    what stands on the land: a table of assets, drawn tier by tier
//   detail/     levels of detail by size on screen, and far cards
//   camera/     the one camera, and the lens's picture (depth of field)
//
// Drawn by three's WebGPURenderer (WebGL 2 where WebGPU is missing), every material in node code (TSL, intent 0008).
// Everything is made before the first frame. A frame only moves uniforms and chooses what to draw.
import { outlinesKept, keepOutlines } from './core/outlines.js';   // (first: what was measured of the plants at an earlier start is read back before any file asks a plant's size)
import * as THREE from 'three/webgpu';
import { loadingStep, loadingDone } from './ui/loading.js';   // first: the veil is told what is being made
import { HMIN, heightAt } from './world/land.js';
import { createUniforms } from './core/uniforms.js';
import { keepMeasure, TRUTH } from './detail/measure.js';
import { setImpostorRenderer } from './detail/impostor.js';
import { setPlanes } from './core/frustum.js';
import { createGovernor } from './core/governor.js';
import { createHud } from './core/hud.js';
import { useGPU } from './core/gpu.js';
import { taken, busy, changed } from './core/work.js';
import { settle, ready, waiting, watch, tick } from './core/settle.js';
import { bakeTextures } from './materials/bake.js';
import { createTerrain } from './terrain/terrain.js';
import { createGround } from './scatter/ground.js';
import { createScatter } from './scatter/index.js';
import { recipe } from './core/registry.js';
import { place } from './world/place.js';
import { stand } from './scatter/placed.js';   // what stands at a spot of its own, drawn by the one drawer (intent 0029)
import { PLACES } from '../world/places.js';
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

const SKY = 0x9fc2e6, t0 = performance.now();
const canvas = document.getElementById('c');
// (the stress stand keeps its kinds' own textures in one array of many layers: more than a device gives unasked; src/scatter/stress.js)
const layers = flag('stress') ? Math.min(2048, (await navigator.gpu?.requestAdapter?.({ powerPreference: 'high-performance' }).catch(() => null))?.limits?.maxTextureArrayLayers ?? 256) : 256;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', forceWebGL: flag('webgl'), trackTimestamp: flag('gputime') || flag('bench'), ...(layers > 256 ? { requiredLimits: { maxTextureArrayLayers: layers } } : {}) });   // alpha false: the canvas is opaque (a pixel's fourth number is not how see-through it is: it says how still the thing is, src/world/light.js stillness; it must not show the page through); ?gputime: the GPU's own time per pass (tools/bench.js); neither the canvas nor any target is multisampled: the screen's picture is built over time (src/core/screen.js)
if (flag('draws')) (await import('../tools/draws.js')).watch();   // ?draws: every pass and draw a frame asks of the GPU, counted (tools/draws.js: window.__draws), from before the first pipeline is made
await renderer.init();
useGPU(renderer);   // what only the GPU reads is kept on the GPU only (src/core/gpu.js)
shareComputeCompiles(renderer);   // a compute shader compiled once, however many passes run it (src/core/compile.js)
countCompiles(renderer);   // and what the GPU is compiling counted: the world is not complete before it has come (src/core/settle.js)
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;   // every material makes its colours for the screen itself (toScreen)
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(SKY);
renderer.info.autoReset = false;   // a frame may be several passes: counted together

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.15, 30000);
scene.add(camera);
let sizeW = innerWidth, sizeH = innerHeight, resizes = 0;
addEventListener('resize', () => {   // only a real change of size rebuilds the canvas: that costs a frame of 100 ms
  if (innerWidth === sizeW && innerHeight === sizeH) return;
  sizeW = innerWidth; sizeH = innerHeight; resizes++;
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false);
});

// (settle(): a promise, the world complete for the camera as it stands: nothing streaming or building in any engine, and
// the picture built over time come to rest on it; ready: the same for the first view; waiting(): what is still out.
// What the gate waits on, never a timer: src/core/settle.js)
const stats = (window.__game = { renderer, camera, scene, outlines: { kept: outlinesKept, made: 0 }, settle, ready, waiting });
const bounds = flag('bounds') ? showBodies(scene) : null;   // ?bounds: what is solid round the walker drawn as lines, in every world (src/world/bodies.js)
const U = createUniforms(camera, SKY);
setImpostorRenderer(renderer);
// The one way to the screen, for every view (src/core/screen.js): the world drawn at the inside's pixels (the governor's
// dial; the screen keeps all its own), through the lens where the camera brings one (src/camera/post.js), and the
// screen's picture built over time from those frames (src/core/temporal.js).
const temporal = (stats.temporal = createTemporal(renderer));
const screen = (stats.screen = createScreen(renderer, { temporal, lens: createLens(renderer) }));
const governor = createGovernor(renderer, { apply: (r) => screen.set(r) });
stats.governor = governor;   // the film holds it still while it plays
keepMeasure(() => screen.inside);   // the one measure of size on screen, for every level of detail (src/detail/measure.js)
if (TRUTH) governor.hold(true);   // (?truth: everything at its finest, offline: no dial turned for its slow frames)
watch({ camera, renderer, screen, temporal, U });   // what the world complete is measured against (src/core/settle.js)
const boot = (stats.boot = {}), mark = (k) => (boot[k] = Math.round(performance.now() - t0));   // where the start's time goes
mark('renderer');
await loadingStep('Painting the ground', 0.12);
// (the shaders the start compiles, their bytes and the largest: `bun tools/gate.js compile`. The land's no longer grows
// with the biomes: src/terrain/layers.js)
const tex = bakeTextures(renderer, { spare: /library/.test(location.pathname) ? 8 : 1 });   // (the library's pictures ask for materials the world may not wear; the start's are compiled side by side and painted while the world is made: tex.ready)
useTiles(tex);   // node code that reads a baked tile by itself (the clouds' field, the snow's clumps: src/world/tile.js)
useBackend(renderer);   // and what is lit per corner (a tree) reads the shadow map's texels only where the backend can
mark('bake');
await loadingStep('Raising the land', 0.3);
const ground = createGround(renderer, tex);
useGround(ground);   // the rocks' bodies read their stones from it
const groundPass = ground.compile();   // its pass, for its own maps: in turn, after the textures' (src/core/compile.js)
stats.ground = ground; stats.U = U; stats.tex = tex;   // for pages that stage things (the library)
mark('ground');
const terrain = createTerrain(scene, tex, renderer);
const layerPass = terrain.compile();   // the layer map's pass, beside the others (it reads no target)
mark('terrain');
stats.terrain = terrain;
const scatter = createScatter(scene, tex, ground, renderer, camera);
stats.scatter = scatter;   // for timings and pages that look at it
mark('scatter');
const packing = scatter.compile();   // the tiers' packing passes, side by side with the textures' (they read no target)
for (const at of Object.values(PLACES)) { const a = recipe(at.asset); if (!stand(a, at)) place(scene, a, at); }   // what stands at a named place, from the asset library: in the one list (src/scatter/placed.js), else on its own (a fire's light; no WebGPU)
const controls = createControls(camera, canvas, document.getElementById('msg'), document.getElementById('stat'));
const sky = createSky(scene, camera, renderer);
// the weather: every condition a plug-in (src/world/weather/*.js: the wind, the snow, the snow falling, the clouds),
// each on the panel, kept, and set by a film's shot by its id; stats[id] for the pages and tools that look at one
const weather = (stats.weather = createWeather({ scene, renderer, camera }));
for (const id of weather.ids) stats[id] = weather[id];
stats.sky = sky;   // the sun and the sky: one time of day drives the light (intent 0007)
const shadows = createShadows(renderer);   // the casters' shadows, read by every surface (src/world/light.js)
stats.shadows = shadows;
stats.controls = controls;
const city = (stats.city = createCity({ scene, camera, canvas, renderer, compile: (o) => screen.compile(o, camera, scene) }));   // (compiled for the target the world is drawn into)
const hud = createHud(document.getElementById('hud'), renderer, camera, governor, stats);
spawn(controls);
// the lakes round the camera (src/world/lakes.js: no river runs in a ring; what it rings round is water): found before the first frame
const lakes = (stats.lakes = createLakes()); let lakesSeen = 0;
lakes.lookHere(camera.position.x, camera.position.z);

// ---- a frame: place the camera, choose what to draw, draw ----
const projScreen = new THREE.Matrix4();
const parts = { ctl: 0, ground: 0, terrain: 0, scatter: 0, draw: 0 };   // where a frame's time went, for the hitch log
function choose(dt) {
  let t = performance.now(), u;
  controls.update(dt); sky.update(dt); weather.update(dt);
  const p = camera.position, dy = (U.uDy.value = Math.max(0, p.y - heightAt(p.x, p.z) - 2, HMIN - p.y));   // how high above the ground here: lifted, the grass and stones see it far off (intent 0003)
  U.uAirH.value = Math.max(0, p.y - heightAt(p.x, p.z));   // the height fog thins along a line of sight from up here (src/world/light.js)
  camera.updateMatrixWorld();
  setPlanes(projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  city.update();
  const lod = governor.detail(camera);
  U.uLodInv.value = 1 / lod;
  u = performance.now(); parts.ctl = u - t; t = u;
  ground.update(p.x, p.z, dy, lod);
  u = performance.now(); parts.ground = u - t; t = u;
  terrain.update(camera, dy, 1 / lod);
  u = performance.now(); parts.terrain = u - t; t = u;
  scatter.select(p.x, p.z, heightAt(p.x, p.z), lod, dy);
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
  lakes.update(camera); if (lakes.version !== lakesSeen) { lakesSeen = lakes.version; ground.refresh(); terrain.refresh(); }   // (new lakes: the ground under the camera drawn again, and its layers)
  renderer.info.reset();
  governor.begin();
  const c0 = performance.now();
  // (a film's footage fills the picture, cine/media.js: the world under it is neither chosen nor drawn, the GPU is the video's)
  if (!stats.covered) { choose(Math.min(ms, 100) / 1000); hud.cpu(performance.now() - c0); const d0 = performance.now(); draw(); parts.draw = performance.now() - d0; }
  governor.end(ms, now, scatter.over, wasBusy); wasBusy = busy();   // (the time since the last frame is that frame's: what it did besides drawing is told with it)
  if (!stats.covered) tick(changed());   // (whether the world is complete: src/core/settle.js)
  hitch(ms, now);
  hud.frame(ms, now, controls.band !== 'eye' ? `  ${controls.band} ${Math.round(controls.height)} m` : '');
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

// ---- before the first frame: compile every material, draw everything once ----
// Every pass is compiled before it is first drawn, side by side (a GPU that can compiles them in parallel), not one at
// a time as each is first drawn: a pass compiled as it is drawn holds up everything the GPU is asked after it, the
// page's own uploads too. One compile at a time for a target (three builds a material for the target in place); what
// packs reads no target, so its passes compile beside the rest (`packing`, above).
mark('world');
await tex.ready;   // the textures painted (their passes compiled side by side since they were asked for)
mark('painted');
await groundPass; await packing; await layerPass;
await inTurn(() => choose(0));   // (not while something else compiles: src/core/compile.js)
mark('chosen');
terrain.all(); scatter.warm();
const seen = [];
scene.traverse((o) => { if (o.isMesh) { seen.push(o, o.visible); o.visible = true; } });
mark('built');
await loadingStep('Lighting the world', 0.55);
// (each compile given 20 s: a pipeline the GPU never answers for, or one that fails, held the veil over the page for
// good (Samuel's Mac, 2026-11-17, at "Lighting the world"). Past that the page goes on, and what was not compiled is
// compiled as it is first drawn: a slow first frame, never a page that does not come)
const inTime = (what, p) => Promise.race([p.then(() => true, (err) => { console.warn(`the start: ${what} could not be compiled:`, err); return false; }), new Promise((res) => setTimeout(() => res(null), 20000))]).then((ok) => { if (ok === null) console.warn(`the start: ${what} took more than 20 s to compile; going on without waiting for it`); });
await inTime('the materials', screen.compile(scene, camera));   // every material, for the target the world is drawn into (src/core/screen.js)
await inTime("the shadow map's casters", shadows.compile(scene, camera, heightAt(camera.position.x, camera.position.z)));   // and every caster, for the shadow map
tex.flush();   // (a material a shader asked for that no biome or asset names: painted before the first frame)
mark('compiled');
screen.render(scene, camera);   // (through the inside's target: its pipelines are the ones a frame uses)
for (let i = 0; i < seen.length; i += 2) seen[i].visible = seen[i + 1];
choose(0);
screen.render(scene, camera);
stats.loadMs = performance.now() - t0;
setTimeout(() => (stats.outlines.made = keepOutlines()), 2500);   // what was measured anew this time, kept for the next start
console.log(`[the game] ready in ${stats.loadMs.toFixed(0)} ms`, boot);
requestAnimationFrame(frame);
requestAnimationFrame(() => requestAnimationFrame(loadingDone));   // the veil goes once the world is on the screen
if (flag('flyby')) import('../tools/flyby.js').then((m) => m.run());   // ?flyby: the camera flown by itself, to watch the plants' levels change (tools/flyby.js)
if (flag('bench')) import('../tools/bench.js').then((m) => m.overlay());   // ?bench: the frame timed at the bench's six views once the world is loaded, the numbers on the screen (tools/bench.js)
export { ready };   // (for a page that shows the world: the first view complete)
