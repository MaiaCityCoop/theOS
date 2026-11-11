// Sandbox 8: one endless land. Everything is made once, before the first frame; walking only
// moves uniforms, patch offsets and the list of terrain nodes.
import * as THREE from 'three';
import { bakeTextures } from './bake.js';
import { createTerrain } from './terrain.js';
import { createGround } from './ground.js';
import { createGrass } from './grass.js';
import { createRocks } from './rocks.js';
import { createControls } from './controls.js';
import { riverAt, aridAt, HMIN, HMAX } from './world.js';

const canvas = document.getElementById('c'), hud = document.getElementById('hud'), msg = document.getElementById('msg');
const t0 = performance.now();
const SKY = new THREE.Color(0x9fc2e6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
const DPR_MAX = Math.min(window.devicePixelRatio || 1, 2), DPR_MIN = Math.min(1, DPR_MAX) * 0.75;
let dpr = Math.min(DPR_MAX, 1.5);
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(SKY);
renderer.sortObjects = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.15, 30000);
scene.add(camera);

// what every material shares
const sky = SKY.clone().convertSRGBToLinear();
const U = {
  uCam: { value: camera.position }, uDy: { value: 0 }, uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.78, 0.36).normalize() },
  uSun: { value: new THREE.Vector3(1.75, 1.66, 1.5) }, uAmb: { value: new THREE.Vector3(0.50, 0.56, 0.66) },
  uSky: { value: new THREE.Vector3(sky.r, sky.g, sky.b) },
};

const tex = bakeTextures(renderer);
const ground = createGround(renderer, U);
const terrain = createTerrain(scene, U, tex);
const grass = createGrass(scene, U);
const rocks = createRocks(scene, U, tex);
const controls = createControls(camera, canvas, msg);

// start beside the stream, looking along it
{
  let x = 0, z = 0, found = false;
  for (let r = 0; r < 4000 && !found; r += 6) for (let a = 0; a < 6.283 && !found; a += 6 / (r + 6)) {
    x = Math.cos(a) * r; z = Math.sin(a) * r;
    if (riverAt(x, z).d < 4 && aridAt(x, z) < 0.05) found = true;
  }
  for (let i = 0; i < 12; i++) { const R = riverAt(x, z), g2 = R.gx * R.gx + R.gz * R.gz || 1e-9; x -= R.r * R.gx / g2; z -= R.r * R.gz / g2; } // onto the line
  const R = riverAt(x, z), gl = Math.hypot(R.gx, R.gz) || 1, nx = R.gx / gl, nz = R.gz / gl;
  // stand on the bank, a few metres off, looking down the stream and a little across it
  controls.place(x + nx * 6 - nz * 4, z + nz * 6 + nx * 4, Math.atan2(-(nz * 0.9 - nx * 0.45), -(-nx * 0.9 - nz * 0.45) ));
}

const projScreen = new THREE.Matrix4();
function place(dt) {
  controls.update(dt);
  const p = camera.position;
  U.uDy.value = Math.max(0, p.y - HMAX, HMIN - p.y);
  camera.updateMatrixWorld();
  projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  ground.update(p.x, p.z, U.uDy.value);
  terrain.update(camera, projScreen, U.uDy.value);
  grass.update(p.x, p.z, U.uDy.value);
  rocks.update(p.x, p.z, U.uDy.value);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

// ---- the frame ----
let last = 0, ema = 16.7, worst = 0, frames = 0, hudAt = 0, dprAt = 0, ceiling = DPR_MAX, ceilingAt = 0, calm = 0, cpu = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const ms = last ? now - last : 16.7; last = now;
  const dt = Math.min(ms, 100) / 1000;
  U.uTime.value = (now - t0) / 1000;
  const c0 = performance.now();
  place(dt);
  cpu += (performance.now() - c0 - cpu) * 0.08;
  renderer.render(scene, camera);

  // hold 16.6 ms: give pixels back when a frame runs long, take them again when there is room
  ema += (ms - ema) * 0.08; if (ms > worst) worst = ms; frames++;
  if (now - dprAt > 700 && document.hasFocus()) {
    let next = dpr;
    if (ema > 18.6) { next = Math.max(DPR_MIN, dpr - (ema > 24 ? 0.25 : 0.125)); ceiling = Math.max(DPR_MIN, next); ceilingAt = now; calm = 0; }
    else if (ema < 17.3) { if (++calm >= 4 && dpr < Math.min(DPR_MAX, ceiling)) { next = Math.min(DPR_MAX, ceiling, dpr + 0.125); calm = 0; } }
    else calm = 0;
    if (now - ceilingAt > 20000) ceiling = DPR_MAX;
    if (next !== dpr) { dpr = next; renderer.setPixelRatio(dpr); ema = 16.7; }
    dprAt = now;
  }
  if (now - hudAt > 300) {
    const r = renderer.info.render, p = camera.position;
    hud.textContent = `${(1000 / ema).toFixed(0)} fps  ${ema.toFixed(1)} ms  worst ${worst.toFixed(0)} ms\n` +
      `${r.calls} draws  ${(r.triangles / 1e6).toFixed(2)} M tris  ratio ${dpr.toFixed(2)}  js ${cpu.toFixed(2)} ms\n` +
      `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}${controls.fly ? '  flying' : ''}`;
    stats.fps = 1000 / ema; stats.ms = ema; stats.worst = worst; stats.calls = r.calls; stats.triangles = r.triangles; stats.dpr = dpr; stats.frames = frames; stats.cpu = cpu;
    hudAt = now; worst = 0;
  }
}
const stats = (window.__s8 = { renderer, camera, scene });

// ---- before the first frame: compile every material, draw everything once ----
place(0);
terrain.all();
const culled = [];
scene.traverse((o) => { if (o.isMesh) { culled.push(o, o.visible, o.frustumCulled); o.visible = true; o.frustumCulled = false; } });
await renderer.compileAsync(scene, camera);
renderer.render(scene, camera);
for (let i = 0; i < culled.length; i += 3) { culled[i].visible = culled[i + 1]; culled[i].frustumCulled = culled[i + 2]; }
place(0);
renderer.render(scene, camera);
stats.loadMs = performance.now() - t0;
console.log(`[sandbox 8] ready in ${stats.loadMs.toFixed(0)} ms`);
requestAnimationFrame(frame);
