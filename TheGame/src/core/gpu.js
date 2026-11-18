// What the game holds in memory, by name (the ledger), and buffers that live on the GPU alone.
//
// three keeps a buffer twice: the typed array on the page it was made from, and the GPU's copy of it. For what only the
// GPU ever writes and reads (what a tier packed, the heap's meshes once they are sent) the page's copy is dead weight:
// 89 MB of it in the plain game, three times that with the stress stand. gpuStorage makes such a buffer on the GPU
// only: the node three is given stands on a placeholder of one item, and the buffer itself is handed to three's
// backend before it would make its own (it makes one only where none is there yet).
//
// The game must run on a machine of 8 GB: a hard gate, shared out by the frame's classes as its milliseconds are
// (src/core/classes.js: geometry, light, ground, upscale/post, other; each its budget). So every pool says here what it
// holds and whose it is (note, more: at its making, again when it is made anew, nought when it is let go), and the
// readout in the corner shows the sum (src/core/hud.js); `window.__memory()` lists it, by class beside each class's
// budget, and beside it what the device itself has made (every buffer and texture, counted as it is made and
// destroyed): what no pool notes shows there, the difference. A pool that may be larger or smaller (an atlas, the
// land's pages, the shadows' cascades, the culling's arenas) is sized by the room its class has left (roomOf), with the
// device's own limits.
import * as THREE from 'three/webgpu';
import { storage } from 'three/tsl';
import { BUDGET_MB, CLASS_NAMES } from './classes.js';

const HELD = new Map(), MB = 1 << 20;
/** A pool's memory, bytes: on the GPU, and beside it on the page; its class (src/core/classes.js). Said again under the
    same name: replaced (nought: let go). */
export const note = (name, gpu = 0, page = 0, cls = 'other') => { HELD.set(name, { gpu, page, cls }); };
/** The same, added to what the name holds already (many small buffers under one name). */
export const more = (name, gpu = 0, page = 0, cls = 'other') => { const h = HELD.get(name) ?? { gpu: 0, page: 0, cls }; h.gpu += gpu; h.page += page; HELD.set(name, h); };
/** What a class's pools hold on the GPU now, bytes. */
export const heldBy = (cls) => { let n = 0; for (const h of HELD.values()) if (h.cls === cls) n += h.gpu; return n; };
/** The room a class has left on the GPU, bytes: its budget less what its pools hold. */
export const roomOf = (cls) => BUDGET_MB[cls] * MB - heldBy(cls);
/** Everything noted: { gpu, page (MB), classes: { class: { gpu, page, budget (MB) } }, device: what the device has made
    (MB; null without WebGPU), unnoted: of that, what no pool notes, rows: [[name, gpu MB, page MB, class], …] the
    largest first }. */
export const ledger = () => {
  const mb = (b) => +(b / MB).toFixed(1), rows = [...HELD].map(([n, h]) => [n, h.gpu, h.page, h.cls]).sort((a, b) => b[1] + b[2] - a[1] - a[2]);
  const classes = Object.fromEntries(CLASS_NAMES.map((c) => [c, { gpu: 0, page: 0, budget: BUDGET_MB[c] }]));
  for (const [, g, p, c] of rows) { classes[c].gpu += g; classes[c].page += p; }
  for (const c of CLASS_NAMES) { classes[c].gpu = mb(classes[c].gpu); classes[c].page = mb(classes[c].page); }
  const gpu = rows.reduce((s, r) => s + r[1], 0);
  return { gpu: mb(gpu), page: mb(rows.reduce((s, r) => s + r[2], 0)), classes, device: R ? mb(MADE.bytes) : null, unnoted: R ? mb(Math.max(0, MADE.bytes - gpu)) : null, rows: rows.map(([n, g, p, c]) => [n, mb(g), mb(p), c]) };
};
if (typeof window !== 'undefined') window.__memory = ledger;

// ---- what the device itself makes: every buffer and texture, as it is made and destroyed ----
// (a texture's bytes: its texels' at every mip and layer, by its format; a compressed one's by its blocks)
const TEXEL = { r8unorm: 1, r8snorm: 1, r8uint: 1, r8sint: 1, r16float: 2, r16uint: 2, r16sint: 2, rg8unorm: 2, rg8snorm: 2, rg8uint: 2, r32float: 4, r32uint: 4, r32sint: 4, rg16float: 4, rg16uint: 4, rg16sint: 4, rgba8unorm: 4, 'rgba8unorm-srgb': 4, rgba8snorm: 4, rgba8uint: 4, rgba8sint: 4, bgra8unorm: 4, 'bgra8unorm-srgb': 4, rgb10a2unorm: 4, rg11b10ufloat: 4, rgb9e5ufloat: 4, rg32float: 8, rg32uint: 8, rg32sint: 8, rgba16float: 8, rgba16uint: 8, rgba16sint: 8, rgba32float: 16, rgba32uint: 16, rgba32sint: 16, depth16unorm: 2, depth24plus: 4, 'depth24plus-stencil8': 4, depth32float: 4, 'depth32float-stencil8': 5, stencil8: 1 };
const BLOCK = (f) => (/^bc[14]-/.test(f) || /^etc2-rgb8|^eac-r11/.test(f) ? 8 : /^(bc|etc2|eac|astc-4x4)/.test(f) ? 16 : 0);   // (bytes a 4 × 4 block)
const texBytes = (d) => {
  const sz = Array.isArray(d.size) ? d.size : [d.size.width, d.size.height ?? 1, d.size.depthOrArrayLayers ?? 1], [w0, h0, n] = [sz[0], sz[1] ?? 1, sz[2] ?? 1];
  const b = BLOCK(d.format), t = TEXEL[d.format] ?? 4, three = d.dimension === '3d';
  let sum = 0;
  for (let m = 0, w = w0, h = h0, z = n; m < (d.mipLevelCount ?? 1); m++, w = Math.max(1, w >> 1), h = Math.max(1, h >> 1), z = three ? Math.max(1, z >> 1) : z) sum += (b ? Math.ceil(w / 4) * Math.ceil(h / 4) * b : w * h * t) * z;
  return sum * (d.sampleCount ?? 1);
};
const MADE = { bytes: 0 }, SIZE = new WeakMap();
const counted = (o, bytes) => { SIZE.set(o, bytes); MADE.bytes += bytes; const d = o.destroy; o.destroy = function () { if (SIZE.has(o)) { MADE.bytes -= SIZE.get(o); SIZE.delete(o); } return d.call(this); }; return o; };
const countMade = (dev) => {
  if (dev.__counted) return; dev.__counted = true;
  const B = dev.createBuffer, T = dev.createTexture;
  dev.createBuffer = function (d) { return counted(B.call(this, d), d.size ?? 0); };
  dev.createTexture = function (d) { return counted(T.call(this, d), texBytes(d)); };
};

// Whose the GPU's passes are, for a tool that times each part of a frame (tools/bench.js): the code that draws a part
// marks where its passes begin (the screen's: the culling, the prepass, the colour, the lens, the upscale; the bench's
// frame what comes before it), and the tool reads the GPU's own clock pass by pass under those names. Nothing listens
// in the game: a mark is then one test.
let tap = null;
/** The passes from here on are `name`'s (null: no one's in particular), until the next mark. */
export const mark = (name) => { if (tap) tap(name); };
/** A tool listens to the marks: fn(name), or null to stop. */
export const listen = (fn) => { tap = fn; };

let R = null;
/** The renderer whose GPU the lean buffers are made on (src/boot.js, once it has started). Without it (WebGL, a page that
    did not ask): gpuStorage makes an ordinary buffer, kept twice. */
export const useGPU = (renderer) => { R = renderer?.backend?.device ? renderer : null; if (R) countMade(R.backend.device); };
export const lean = () => !!R;
/** Whether the renderer's GPU has a WebGPU feature (none without WebGPU). */
export const hasFeature = (name) => !!R?.backend?.device?.features?.has(name);
/** The limits the design sizes against: every one read here (limitOf), and the layers of the land's pages and of the
    drawers' skins (src/terrain/pages.js, src/scatter/drawer.js). The device is asked for each as its adapter has it
    (src/boot.js limitsFrom), so what is sized from them is sized from what this GPU gives, never from WebGPU's defaults
    unasked; one not in the list is not read. */
const SIZED = ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxUniformBufferBindingSize', 'maxComputeWorkgroupsPerDimension', 'maxTextureArrayLayers'];
/** What to ask a device for, of its adapter's limits A: each of SIZED as A has it. */
export const limitsFrom = (A) => Object.fromEntries(SIZED.filter((k) => A?.[k] != null).map((k) => [k, A[k]]));
/** One of the renderer's GPU's limits, one of SIZED (none without WebGPU: nothing then asks). */
export const limitOf = (name) => { if (!SIZED.includes(name)) throw new Error(`gpu: ${name} is not a limit the device is asked for (SIZED)`); return R?.backend?.device?.limits?.[name] ?? 0; };
/** Every buffer made here within the device's limits: one larger is an error of whoever sized it, said by name. */
const within = (bytes, name) => { const most = Math.min(limitOf('maxStorageBufferBindingSize') || Infinity, limitOf('maxBufferSize') || Infinity); if (bytes > most) throw new Error(`${name ?? 'a buffer'}: ${bytes} bytes, more than the GPU binds in one buffer (${most})`); };

const TYPES = { uint: [Uint32Array, 1], float: [Float32Array, 1], vec4: [Float32Array, 4], uvec4: [Uint32Array, 4] };
/** A storage buffer of `count` items of `type` (uint, float, vec4, uvec4), nothing in it yet:
      { node (what storage(…) gives: .element(i)), attr, bytes, write(at, data) }
    write: `data` (a typed array of its numbers) sent to the GPU from its `at`-th number on, at once (before what the
    frame draws next). name: what the ledger calls it (none: not noted; say it with `more`); cls: whose it is
    (src/core/classes.js). instanced: as instancedArray's. */
export function gpuStorage(type, count, name = null, cls = 'other', instanced = false) {
  const [Arr, size] = TYPES[type], bytes = count * size * 4, Attr = instanced ? THREE.StorageInstancedBufferAttribute : THREE.StorageBufferAttribute;
  if (!R) {
    const attr = new Attr(new Arr(count * size), size);
    if (name) note(name, bytes, bytes, cls);
    return { node: storage(attr, type, count), attr, bytes, lean: false, write(at, data) { attr.array.set(data, at); attr.addUpdateRange(at, data.length); attr.needsUpdate = true; } };
  }
  within(bytes, name);
  const dev = R.backend.device, attr = new Attr(new Arr(size), size);
  const buffer = dev.createBuffer({ label: name ?? 'lean', size: Math.max(16, bytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  R.backend.get(attr).buffer = buffer;
  if (name) note(name, bytes, 0, cls);
  return { node: storage(attr, type, count), attr, bytes, lean: true, write(at, data) { dev.queue.writeBuffer(buffer, at * 4, data); } };
}
/** The same, its size said later, before anything binds it (what is shared by things not all made yet: the culling's
    lists, src/core/occlusion.js): { node, attr, make(count) -> bytes }. A storage buffer's length is not in its code, so
    the node is the same whatever it is made as. */
export function gpuStorageLater(type, name = null, cls = 'other') {
  const [Arr, size] = TYPES[type], attr = new THREE.StorageBufferAttribute(new Arr(size), size);
  return {
    node: storage(attr, type, 1), attr,
    make(count) {
      const bytes = Math.max(1, count) * size * 4;
      if (!R) { attr.array = new Arr(Math.max(1, count) * size); attr.count = Math.max(1, count); if (name) note(name, bytes, bytes, cls); return bytes; }
      within(bytes, name);
      R.backend.get(attr).buffer = R.backend.device.createBuffer({ label: name ?? 'lean', size: Math.max(16, bytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      if (name) note(name, bytes, 0, cls);
      return bytes;
    },
  };
}
