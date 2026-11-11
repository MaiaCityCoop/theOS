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
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });

const stats = (window.__s8 = { renderer, camera, scene });
const U = createUniforms(camera, SKY);
const governor = createGovernor(renderer);
const tex = bakeTextures(renderer);
U.tNoise = { value: tex.a[7] };
const ground = createGround(renderer, U);
const terrain = createTerrain(scene, U, tex);
const scatter = createScatter(scene, U, tex);
const controls = createControls(camera, canvas, document.getElementById('msg'));
const post = createPost(renderer, SKY);
const hud = createHud(document.getElementById('hud'), renderer, camera, governor, stats);
spawn(controls);

// ---- a frame: place the camera, choose what to draw, draw ----
const projScreen = new THREE.Matrix4();
function choose(dt) {
  controls.update(dt);
  const p = camera.position, dy = (U.uDy.value = Math.max(0, p.y - HMAX, HMIN - p.y));
  camera.updateMatrixWorld();
  setPlanes(projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const lod = governor.detail(camera);
  U.uLodInv.value = 1 / lod;
  ground.update(p.x, p.z, dy, lod);
  terrain.update(camera, dy, 1 / lod);
  scatter.select(p.x, p.z, heightAt(p.x, p.z), lod, dy);
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
  draw();
  governor.end(ms, now, scatter.over);
  hud.frame(ms, now, controls.fly ? '  flying' : '');
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
