// The world's textures as a start makes them (src/materials/bakeTextures), alone, for tools/paints.js cache: painted, or
// laid out as an earlier start kept them, and then kept at once (not once a world has settled: there is none here).
// What it says (window.__painted): how many it painted and laid out, the pipelines the GPU was asked for (the one
// cache's count, src/core/compile.js), and a hash of each of the start's layers. The address: fresh, what was kept
// let go first (a first start); refuse, every keeping refused (as a full store refuses it: what is painted is painted
// again next time).
import * as THREE from 'three/webgpu';
import { sharePipelines, pipelines } from '../src/core/compile.js';
import { bakeTextures } from '../src/materials/bake.js';

const q = new URLSearchParams(location.search);
if (q.has('fresh')) await caches.delete('maia-painted-1');
if (q.has('refuse')) Cache.prototype.put = () => Promise.reject(new DOMException('the store is full', 'QuotaExceededError'));
const renderer = new THREE.WebGPURenderer({ antialias: false });
await renderer.init();
sharePipelines(renderer);
const tex = bakeTextures(renderer, { keepWhen: Promise.resolve() });
await tex.ready;
const asked = pipelines().asked;   // (what the start asked the GPU for, before it keeps anything)
await tex.kept();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const layers = [];
for (const L of tex.layers()) layers.push({ ...L, hash: hex(await crypto.subtle.digest('SHA-256', await tex.read(L.layer, L.data))) });
window.__painted = { ...tex.counts(), asked, packed: tex.packed, layers };
