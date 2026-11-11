// Sandbox 8: one endless land. This file only wires the parts and runs the frame.
//
//   world/      the land as functions: in JS for the walker's feet, in GLSL for the GPU
//   core/       what everything shares: uniforms, the frustum, the governor, the readout
//   materials/  the ground's textures, painted once at start
//   terrain/    the ground and the water: a quadtree of one tile
//   scatter/    what stands on the land: a table of assets, drawn tier by tier
//   camera/     the walker, and the lens's picture (depth of field)
//
// Everything is made before the first frame. A frame only moves uniforms and chooses what to draw.
import * as THREE from 'three';
import { HMIN, HMAX, heightAt } from './world.js';
import { createUniforms } from './core/uniforms.js';
import { setPlanes } from './core/frustum.js';
import { createGovernor } from './core/governor.js';
import { createHud } from './core/hud.js';
import { bakeTextures } from './materials/bake.js';
import { createTerrain } from './terrain/terrain.js';
import { createGround } from './scatter/ground.js';
import { createScatter } from './scatter/index.js';
import { ASSETS, place } from '../assets/index.js';
import { PLACES } from './world/places.js';
import { createControls, spawn } from './camera/walk.js';
import { createPost } from './camera/post.js';

const SKY = 0x9fc2e6, t0 = performance.now();
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
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

const stats = (window.__s8 = { renderer, camera, scene });
const U = createUniforms(camera, SKY);
const governor = createGovernor(renderer);
stats.governor = governor;   // the film holds it still while it plays
const tex = bakeTextures(renderer);
U.tNoise = { value: tex.a[7] };
const ground = createGround(renderer, U);
stats.ground = ground; stats.U = U; stats.tex = tex;   // for pages that stage things (the library)
const terrain = createTerrain(scene, U, tex);
const scatter = createScatter(scene, U, tex);
for (const at of Object.values(PLACES)) place(scene, U, ASSETS[at.asset], at);   // what stands at a named place, from the asset library
const controls = createControls(camera, canvas, document.getElementById('msg'));
const post = createPost(renderer, SKY);
const hud = createHud(document.getElementById('hud'), renderer, camera, governor, stats);
spawn(controls);

// ---- a frame: place the camera, choose what to draw, draw ----
const projScreen = new THREE.Matrix4();
const parts = { ctl: 0, ground: 0, terrain: 0, scatter: 0, draw: 0 };   // where a frame's time went, for the hitch log
function choose(dt) {
  let t = performance.now(), u;
  controls.update(dt);
  const p = camera.position, dy = (U.uDy.value = Math.max(0, p.y - HMAX, HMIN - p.y));
  camera.updateMatrixWorld();
  setPlanes(projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const lod = governor.detail(camera);
  U.uLodInv.value = 1 / lod;
  u = performance.now(); parts.ctl = u - t; t = u;
  ground.update(p.x, p.z, dy, lod);
  u = performance.now(); parts.ground = u - t; t = u;
  terrain.update(camera, dy, 1 / lod);
  u = performance.now(); parts.terrain = u - t; t = u;
  scatter.select(p.x, p.z, heightAt(p.x, p.z), lod, dy);
  parts.scatter = performance.now() - t;
}
function draw() {
  const dof = camera.userData.dof;   // the virtual camera brings a lens with it: its picture is drawn through it
  if (dof && dof.on) post.render(scene, camera, dof); else renderer.render(scene, camera);
}
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const ms = last ? now - last : 16.7; last = now;
  U.uTime.value = (now - t0) / 1000;
  renderer.info.reset();
  governor.begin();
  const c0 = performance.now();
  choose(Math.min(ms, 100) / 1000);
  hud.cpu(performance.now() - c0);
  const d0 = performance.now(); draw(); parts.draw = performance.now() - d0;
  governor.end(ms, now, scatter.over);
  hitch(ms, now);
  hud.frame(ms, now, controls.fly ? '  flying' : '');
}

// ---- the hitch log (dev only): every frame over 24 ms, with where its time went, sent to the dev server every
// few seconds (TheGame/.perf/hitches.jsonl), to find what makes the picture stop ----
const HITCH = 24, hitches = []; let frames = 0, sentAt = 0;
function hitch(ms, now) {
  frames++;
  if (ms > HITCH && frames > 30) {
    const r = renderer.info.render, c = window.__cine, f = (v) => +v.toFixed(2);
    hitches.push({ at: Math.round(now), ms: f(ms), ctl: f(parts.ctl), ground: f(parts.ground), terrain: f(parts.terrain), scatter: f(parts.scatter), draw: f(parts.draw),
      lod: f(governor.lod), cap: f(governor.cap), dpr: governor.dpr, resizes, w: innerWidth, h: innerHeight, tris: r.triangles, calls: r.calls, film: c?.clips?.length ? f(c.time) : null, playing: !!c?.playing, page: location.pathname + location.search });
  }
  if (import.meta.env.DEV && now - sentAt > 4000 && (hitches.length || frames > 0)) {
    sentAt = now;
    const body = JSON.stringify({ at: Math.round(now), frames, hitches: hitches.splice(0) }); frames = 0;
    fetch('/perf-log', { method: 'POST', body }).catch(() => {});
  }
}

// ---- before the first frame: compile every material, draw everything once ----
choose(0);
terrain.all(); scatter.warm();
const seen = [];
scene.traverse((o) => { if (o.isMesh) { seen.push(o, o.visible); o.visible = true; } });
await renderer.compileAsync(scene, camera);
renderer.render(scene, camera);
for (let i = 0; i < seen.length; i += 2) seen[i].visible = seen[i + 1];
choose(0);
renderer.render(scene, camera);
stats.loadMs = performance.now() - t0;
console.log(`[sandbox 8] ready in ${stats.loadMs.toFixed(0)} ms`);
requestAnimationFrame(frame);
