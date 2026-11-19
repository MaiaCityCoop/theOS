// The world's textures as a start makes them (src/materials/bakeTextures), alone, for tools/paints.js cache: painted, or
// laid out as an earlier start kept them, and then kept at once (not once a world has settled: there is none here).
// What it says (window.__painted): how many it painted and laid out, the pipelines the GPU was asked for (the one
// cache's count, src/core/compile.js), a hash of each of the start's layers, and how its keeping went, frame by frame
// (its frames drawn as the game's are, each calling flush: the most layers kept in one frame, the most of their buffers
// held at once, as the ledger counts them, src/core/gpu.js). The address: fresh, what was kept let go first (a first
// start); refuse, every keeping refused (as a full store refuses it: what is painted is painted again next time); full,
// the store's estimate says it has no room.
import * as THREE from 'three/webgpu';
import { sharePipelines, pipelines } from '../src/core/compile.js';
import { useGPU, ledger } from '../src/core/gpu.js';
import { bakeTextures } from '../src/materials/bake.js';

const q = new URLSearchParams(location.search);
if (q.has('fresh')) await caches.delete('maia-painted-1');
if (q.has('refuse')) Cache.prototype.put = () => Promise.reject(new DOMException('the store is full', 'QuotaExceededError'));
if (q.has('full')) navigator.storage.estimate = async () => ({ quota: 1, usage: 1 });
const renderer = new THREE.WebGPURenderer({ antialias: false });
await renderer.init();
useGPU(renderer);   // (the device's makes counted, as the game's are: what the keeping's buffers are held against)
sharePipelines(renderer);
const tex = bakeTextures(renderer, { keepWhen: Promise.resolve() });
await tex.ready;
const asked = pipelines().asked;   // (what the start asked the GPU for, before it keeps anything)
// (its frames, each one's flush as the game's: what is kept, kept a layer a frame)
const KEPT = "the world's textures: a layer kept";
let on = true, was = 0, frames = 0, perFrame = 0, buffers = 0;
const frame = () => {
  if (!on) return;
  tex.flush(); frames++;
  const n = tex.counts().stored; perFrame = Math.max(perFrame, n - was); was = n;
  buffers = Math.max(buffers, ledger().makers.find(([, kind]) => kind === KEPT)?.[3] ?? 0);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
await tex.kept(); on = false;
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const layers = [];
for (const L of tex.layers()) layers.push({ ...L, hash: hex(await crypto.subtle.digest('SHA-256', await tex.read(L.layer, L.data))) });
window.__painted = { ...tex.counts(), asked, packed: tex.packed, layers, pace: { frames, perFrame, buffers } };
