// The Body alone (intent 0041): what `bun tools/body.js` laid (TheGame/.body/), carried by the rig and drawn
// through the game's own flesh (characters/kit/muscles/flesh.js) with none of the world round it, so a still of it
// takes seconds where the library takes the world's start. A tool: tools/body.html on the game's dev server.
//
// The address says the view and the pose (all optional):
//   y, x, z      what the camera looks at (m; the body stands at the middle, 1.8 m tall)      d      how far off (m)
//   yaw, pitch   where it stands round and over that (degrees; 0: in front)                  fov    its lens (degrees)
//   sun, suna    the key light: degrees to the camera's left, and up (the library's: 45, 40)  exp    the exposure
//   pose         the rig's plain moves as JSON, e.g. {"elbow.L":2,"arm.R":[0,1.5,0]} (characters/kit/skeleton/pose.js)
//   layer        skin | fat | muscles                                                        lv     a level of detail, 0 … 2
//   gpu          through WebGPU (as the game draws); without it WebGL 2, which a machine without a GPU can draw too
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { q, num, renderer, scene, camera } from './alone.page.js';
import { rigOf, turnsOf, turnOf } from '../characters/kit/skeleton/pose.js';

// the rig, as characters/kit/bones.js makes it: a bone at each joint, turned like the world at rest
const RIG = rigOf(), names = Object.keys(RIG), object = new THREE.Group(), bones = { root: new THREE.Bone() }, rest = {}; object.add(bones.root); scene.add(object);
for (const n of names) if (!bones[n]) bones[n] = new THREE.Bone();
for (const n of names) { const j = RIG[n], p = j.parent ? RIG[j.parent].at : [0, 0, 0]; rest[n] = new THREE.Vector3(j.at[0] - p[0], j.at[1] - p[1], j.at[2] - p[2]); bones[n].position.copy(rest[n]); if (j.parent) bones[j.parent].add(bones[n]); }
{ const T = turnsOf(q.get('pose') ? JSON.parse(q.get('pose')) : {}), m4 = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const n of names) { const t = T[n]; if (!t) continue; const A = turnOf(t, RIG[n]); m4.set(A[0], A[1], A[2], 0, A[3], A[4], A[5], 0, A[6], A[7], A[8], 0, 0, 0, 0, 1); bones[n].quaternion.setFromRotationMatrix(m4); if (!Array.isArray(t) && t.shift) bones[n].position.add(v.set(...t.shift).applyMatrix4(m4)); }
  object.updateMatrixWorld(true); }

// what was laid (tools/body.js): its numbers in one file, the rest as JSON
const [text, bin] = await Promise.all([fetch('../.body/body.json').then((r) => r.text()), fetch('../.body/body.bin').then((r) => r.arrayBuffer())]);
const ARRAYS = { Float32Array, Uint32Array, Uint16Array, Uint8Array, Int32Array, Int16Array }, data = JSON.parse(text, (k, x) => (x && x.$t ? new ARRAYS[x.$t](bin, x.o, x.n) : x));
const { fleshOf } = await import('../characters/kit/muscles/flesh.js'), flesh = fleshOf(data, { object, bones, eye: uniform(camera.position) }), layer = q.get('layer') ?? 'skin';
for (const [k, m] of [['skin', flesh.skin], ['fat', flesh.fat], ['muscles', flesh.muscles]]) if (m) { object.add(m); m.visible = k === layer; }
for (const m of flesh.mouth ?? []) m.visible = layer === 'skin';   // (the teeth show through the skin's smile only)
flesh.update();
if (q.has('lv')) for (const m of [flesh.skin, flesh.fat]) if (m) m.geometry = m.userData.levels[Math.min(m.userData.levels.length - 1, num('lv', 0))];
let frames = 0; (function draw() { renderer.render(scene, camera); if (++frames < 3) requestAnimationFrame(draw); else window.__drawn = true; })();   // (what a still waits for)
