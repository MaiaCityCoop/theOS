// A figure alone (intent 0043): a character of the library that is brought in whole (characters/kit/figure.js), made by
// its own recipe and drawn with none of the world round it, so a still of a move or of a face takes seconds where
// the library takes the world's start. A tool: tools/figure.html on the game's dev server.
//
// The address says who, what they do and the view (all optional):
//   who          the recipe's file in characters/ without its ending (man, woman)
//   move, face   one of its moves and one of its expressions, by their ids             t      its clock (s) when the still is taken
//   y, x, z      what the camera looks at (m; the figure stands at the middle)          d      how far off (m)
//   yaw, pitch   where it stands round and over that (degrees; 0: in front)            fov    its lens (degrees)
//   sun, suna    the key light: degrees to the camera's left, and up (the library's: 45, 40)  exp    the exposure
//   file         another figure's file in place of the recipe's (an address the dev server answers): one not in the library yet
//   head         the camera looks at its eyes, however tall it is (y is then added to that)
//   bones        its skeleton drawn over it          gpu    through WebGPU (as the game draws); without it WebGL 2
//   read         the picture read back from the GPU and laid over the page (where a WebGPU canvas does not show in a still)
//   round        left on its walk's round (1.5 m from the middle); turned: left turned as its move turned it
import * as THREE from 'three/webgpu';
import { uniform, texture } from 'three/tsl';
import { q, num, renderer, scene, camera, at, aim } from './alone.page.js';

const who = (q.get('who') ?? 'man').replace(/[^a-z0-9-]/g, ''), own = (await import(`../characters/${who}.js`)).default, recipe = q.get('file') ? { ...own, name: q.get('file').split('/').pop(), file: new URL(q.get('file'), location.href).href } : own;
const T = new THREE.Texture(), tex = new Proxy({}, { get: (_, k) => (k === 'want' ? () => {} : () => texture(T)) });
const P = (q.get('file') ? (await import('../characters/kit/figure.js')).figureOf(tex, recipe, { eye: uniform(camera.position) }) : recipe.make(tex, { eye: uniform(camera.position) })); await P.grown;
if (P.failed) { window.__drawn = { error: P.failed }; throw new Error(P.failed); }
const stage = new THREE.Group(); stage.add(P.object); scene.add(stage); window.__figure = P;   // (for a look from the console)
if (q.has('head')) { at[1] = P.height * 0.938 + num('y', 0); aim(); }   // (the camera at its eyes, however tall it is)
if (q.get('move')) P.setMove(q.get('move'));
if (q.get('face')) P.setExpression(q.get('face'));
// (its clock run to t in steps, as the game's frames would: a walk goes its way round, a blend comes to its end)
{ const t = num('t', 2), n = Math.max(1, Math.round(t / (1 / 30))), eyeAt = { x: camera.position.x, z: camera.position.z }; for (let i = 0; i < n; i++) P.step(t / n, eyeAt); }
if (!q.has('round')) { P.object.position.set(0, 0, 0); if (!q.has('turned')) P.object.rotation.y = 0; P.object.updateMatrixWorld(true); }   // (taken off its walk's round to the middle, facing the front; `round` leaves it there, `turned` as it is turned)
if (q.has('bones')) { const lines = new THREE.SkeletonHelper(P.bones.root); lines.material.depthTest = false; lines.material.transparent = true; lines.renderOrder = 9; scene.add(lines); }
let low = Infinity; { const v = new THREE.Vector3(); for (const s of ['Left', 'Right']) for (const b of ['Foot', 'ToeBase', 'ToeEnd']) { const bone = P.bones[s + b]; if (bone) low = Math.min(low, bone.getWorldPosition(v).y); } }
await renderer.compileAsync?.(scene, camera);
// (a browser without a screen may not show a WebGPU canvas in a still: `read` draws the picture into a target, reads it
// back from the GPU and lays it over the page, and keeps its numbers (window.__pixels) for a tool to save)
if (q.has('read')) {
  const W = innerWidth, H = innerHeight, rt = new THREE.RenderTarget(W, H, { type: THREE.HalfFloatType }); renderer.setRenderTarget(rt); renderer.render(scene, camera);
  const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H); renderer.setRenderTarget(null);
  const cv = document.createElement('canvas'); cv.id = 'read'; cv.width = W; cv.height = H; cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:5'; const g = cv.getContext('2d'), im = g.createImageData(W, H), up = !renderer.backend.isWebGPUBackend;
  const f16 = (h) => { const e = (h >> 10) & 31, m = h & 1023, v = e === 0 ? m * 2 ** -24 : e === 31 ? 65504 : (1 + m / 1024) * 2 ** (e - 15); return h & 0x8000 ? -v : v; }, lit = px instanceof Uint16Array ? f16 : (v) => v;
  let drawn = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, o = ((up ? H - 1 - y : y) * W + x) * 4; for (let k = 0; k < 3; k++) im.data[o + k] = 255 * Math.min(1, Math.max(0, lit(px[i + k]))); im.data[o + 3] = 255; if (Math.abs(lit(px[i]) - lit(px[0])) + Math.abs(lit(px[i + 2]) - lit(px[2])) > 0.02) drawn++; }   // (drawn: unlike the ground's corner)
  g.putImageData(im, 0, 0); document.body.append(cv); window.__read = { backend: renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2', lit: +(drawn / (W * H)).toFixed(3) }; window.__pixels = { w: W, h: H, rgba: im.data };   // (and the numbers themselves, for a tool to keep: such a browser may not show a 2D canvas either)
}
let frames = 0; (function draw() { renderer.render(scene, camera); if (++frames < 4) requestAnimationFrame(draw); else window.__drawn = { ...(window.__read ?? {}), who: recipe.name, height: +P.height.toFixed(3), stands: P.stands, faces: P.faces, bones: P.bonesCount, figures: P.figures, move: P.move, face: P.expression, lowestFootBone: +low.toFixed(3) }; })();   // (what a still waits for)
