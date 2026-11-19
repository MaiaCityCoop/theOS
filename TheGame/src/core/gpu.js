// What the game holds in memory, by name (the ledger), and buffers that live on the GPU alone.
//
// three keeps a buffer twice: the typed array on the page it was made from, and the GPU's copy of it. For what only the
// GPU ever writes and reads (what a tier packed, the heap's meshes once they are sent) the page's copy is dead weight:
// 89 MB of it in the plain game, three times that with the stress stand. gpuStorage makes such a buffer on the GPU
// only: the node three is given stands on a placeholder of one item, and the buffer itself is handed to three's
// backend before it would make its own (it makes one only where none is there yet).
//
// The game must run on a machine of 8 GB. So every pool says here what it holds (note, more), and the readout in the
// corner shows the sum (src/core/hud.js); `window.__memory()` lists it.
import * as THREE from 'three/webgpu';
import { storage } from 'three/tsl';

const HELD = new Map();
/** A pool's memory, bytes: on the GPU, and beside it on the page. Said again under the same name: replaced. */
export const note = (name, gpu = 0, page = 0) => { HELD.set(name, { gpu, page }); };
/** The same, added to what the name holds already (many small buffers under one name). */
export const more = (name, gpu = 0, page = 0) => { const h = HELD.get(name) ?? { gpu: 0, page: 0 }; h.gpu += gpu; h.page += page; HELD.set(name, h); };
/** Everything noted: { gpu, page (MB), rows: [[name, gpu MB, page MB], …] the largest first }. */
export const ledger = () => {
  const mb = (b) => +(b / 1048576).toFixed(1), rows = [...HELD].map(([n, h]) => [n, h.gpu, h.page]).sort((a, b) => b[1] + b[2] - a[1] - a[2]);
  return { gpu: mb(rows.reduce((s, r) => s + r[1], 0)), page: mb(rows.reduce((s, r) => s + r[2], 0)), rows: rows.map(([n, g, p]) => [n, mb(g), mb(p)]) };
};
if (typeof window !== 'undefined') window.__memory = ledger;

let R = null;
/** The renderer whose GPU the lean buffers are made on (main.js, once it has started). Without it (WebGL, a page that
    did not ask, `?fat`): gpuStorage makes an ordinary buffer, kept twice. */
export const useGPU = (renderer) => { R = renderer?.backend?.device ? renderer : null; };
export const lean = () => !!R;

const TYPES = { uint: [Uint32Array, 1], float: [Float32Array, 1], vec4: [Float32Array, 4], uvec4: [Uint32Array, 4] };
/** A storage buffer of `count` items of `type` (uint, float, vec4, uvec4), nothing in it yet:
      { node (what storage(…) gives: .element(i)), attr, bytes, write(at, data) }
    write: `data` (a typed array of its numbers) sent to the GPU from its `at`-th number on, at once (before what the
    frame draws next). name: what the ledger calls it (none: not noted; say it with `more`). instanced: as instancedArray's. */
export function gpuStorage(type, count, name = null, instanced = false) {
  const [Arr, size] = TYPES[type], bytes = count * size * 4, Attr = instanced ? THREE.StorageInstancedBufferAttribute : THREE.StorageBufferAttribute;
  if (!R) {
    const attr = new Attr(new Arr(count * size), size);
    if (name) note(name, bytes, bytes);
    return { node: storage(attr, type, count), attr, bytes, lean: false, write(at, data) { attr.array.set(data, at); attr.addUpdateRange(at, data.length); attr.needsUpdate = true; } };
  }
  const dev = R.backend.device, attr = new Attr(new Arr(size), size);
  const buffer = dev.createBuffer({ label: name ?? 'lean', size: Math.max(16, bytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  R.backend.get(attr).buffer = buffer;
  if (name) note(name, bytes, 0);
  return { node: storage(attr, type, count), attr, bytes, lean: true, write(at, data) { dev.queue.writeBuffer(buffer, at * 4, data); } };
}
