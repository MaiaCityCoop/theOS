// What the game holds in memory, by name (the ledger), and buffers that live on the GPU alone.
//
// three keeps a buffer twice: the typed array on the page it was made from, and the GPU's copy of it. For what only the
// GPU ever writes and reads (what a tier packed, the heap's meshes once they are sent) the page's copy is dead weight:
// 89 MB of it in the plain game, three times that with the stress stand. gpuStorage makes such a buffer on the GPU
// only: the node three is given stands on a placeholder of one item, and the buffer itself is handed to three's
// backend before it would make its own (it makes one only where none is there yet).
//
// The game must run on a machine of 8 GB, and holds at most 2 GB of it on the GPU (src/core/budget.js GPU_MB), shared
// out by the frame's classes as its milliseconds are (src/core/classes.js: geometry, light, ground, upscale/post, other;
// each its budget, BUDGET_MB). So every pool says here what it holds and whose it is (note, more: at its making, again
// when it is made anew, nought when it is let go). One tally is held against the budgets, one check: what the device
// itself makes, every buffer and texture under the class whose code made it (below), where the device is counted (on
// WebGPU); else what the pools say they hold. Past a class's budget, or the whole's, it is said once, loudly, with the
// class and the maker, and counted (the ledger's over), and made all the same, so nothing breaks while its owner sizes
// it to the room its class has (roomOf); the hour's gate fails on it (tools/gate.js). The readout in the corner shows the sum (src/core/hud.js); the game's
// memory() (window.__game.memory(), src/boot.js) is the one ledger: by class, now and at its most, beside each class's
// budget, and beside it what the device itself has made (every buffer and texture, counted as it is made and
// destroyed): what no pool notes shows there, the difference. A pool that may be larger or smaller (an atlas, the
// land's pages, the culling's arenas) is sized by the room its class has left (roomOf), with the device's own limits.
import * as THREE from 'three/webgpu';
import { storage } from 'three/tsl';
import { CLASS_NAMES, classOf } from './classes.js';
import { BUDGET_MB, GPU_MB } from './budget.js';
import { MiB } from './physics.js';
import { passBegins, timesOn } from './pace.js';

const HELD = new Map(), MB = MiB, PEAK = Object.fromEntries(CLASS_NAMES.map((c) => [c, 0])), OVER = new Map(), WHOLE = 'the whole GPU';
let peakAll = 0;
if (Object.values(BUDGET_MB).reduce((s, b) => s + b, 0) !== GPU_MB) throw new Error(`src/core/budget.js: the classes' budgets (BUDGET_MB) share out the GPU's whole (GPU_MB, ${GPU_MB} MB), so they add up to it`);
/** A pool's memory, bytes: on the GPU, and beside it on the page; its class (src/core/classes.js). Said again under the
    same name: replaced (nought: let go). owns: what it is (three's textures and targets): each named by it, its class
    and its name, as the device's own record and the ledger then call what is made of it (own). */
export const note = (name, gpu = 0, page = 0, cls = 'other', ...owns) => { HELD.set(name, { gpu, page, cls }); held(cls, name); own(cls, name, owns); };
/** The same, added to what the name holds already (many small buffers under one name). */
export const more = (name, gpu = 0, page = 0, cls = 'other', ...owns) => { const h = HELD.get(name) ?? { gpu: 0, page: 0, cls }; h.gpu += gpu; h.page += page; HELD.set(name, h); held(h.cls, name); own(h.cls, name, owns); };
/** What a class's pools hold on the GPU now, bytes. */
const heldBy = (cls) => { let n = 0; for (const h of HELD.values()) if (h.cls === cls) n += h.gpu; return n; };
/** The room a class has left on the GPU, bytes: its budget less what it holds, as its pools say it or as the device made
    it for its code (the more of the two: what three makes for it too). */
export const roomOf = (cls) => BUDGET_MB[cls] * MB - Math.max(heldBy(cls), MADE[cls] ?? 0);
/** A make that took `who` (a class, or the whole GPU) past its budget (MB), `by` (the pool, or what the device was asked
    to make) holding `bytes` there then: said once a class and maker (once: once a class, whatever made it first; the
    one tally's check, held and counted below, says it so), loudly, and counted; what was made is kept, so nothing
    breaks while its owner fits it to the room its class has (roomOf). */
const past = (who, by, bytes, budget, once = false) => {
  const key = once ? who : `${who}: ${by}`, o = OVER.get(key), mb = +(bytes / MB).toFixed(1);
  if (o) { o.times++; o.mb = Math.max(o.mb, mb); return; }
  OVER.set(key, { who, by, times: 1, mb, budget });
  console.error(`GPU memory: ${who} holds ${mb} MB, more than its ${budget} MB (src/core/budget.js), with ${by}: made all the same, until it is sized to the room its class has (src/core/gpu.js roomOf)`);
};
/** After a pool of `cls` changed (`by`: its name): the class's most and the whole's, and, where the device itself is not
    counted (the one tally there is then: no WebGPU), whether the class is past its budget. */
function held(cls, by) {
  const n = heldBy(cls); if (n > (PEAK[cls] ?? Infinity)) PEAK[cls] = n;
  let all = 0; for (const h of HELD.values()) all += h.gpu;
  if (all > peakAll) peakAll = all;
  if (!R && n > BUDGET_MB[cls] * MB) past(cls, by, n, BUDGET_MB[cls], true);
}
// How many kinds each drawer draws coarser than a pixel now (src/scatter/drawer.js: a band not come yet, a stand-in, no
// slot for it), by its name: beside the memory in the one ledger, so the gate's board shows it fall as the bands come
const SHORT = new Map();
/** Drawer `name` draws n kinds coarser than a pixel now (the ledger's short). */
export const short = (name, n) => { SHORT.set(name, n); };
/** The one ledger (the game's memory(), src/boot.js; the hour's gate reads it), MB:
      gpu, peak, budget   what the game holds on the GPU now and the most it held (all the device made, where it is
                          counted; else what the pools note), and GPU_MB
      classes             { class: { gpu, peak (the same, the class's: what the device made for its code, else what its
                          pools note), noted (what its pools say they hold), page (what they keep on the page), budget } }
      noted, page         what all the pools note, on the GPU and on the page; unnoted: what the device made beyond it
      makers              what the device made, by class and by what it was (a pool's name, three's label, else its
                          kind), the largest first: [[class, what, MB, how many], …], where no pool's note says it
      over                [{ who, by, times, mb, budget }]: each class, or the whole, a make took past its budget, with
                          what, how often, at the most
      rows                [[name, gpu MB, page MB, class], …], what each pool notes, the largest first
      short               { drawer: how many kinds it draws coarser than a pixel now } (short, above) */
export const ledger = () => {
  const mb = (b) => +(b / MB).toFixed(1), rows = [...HELD].map(([n, h]) => [n, h.gpu, h.page, h.cls]).sort((a, b) => b[1] + b[2] - a[1] - a[2]);
  const classes = Object.fromEntries(CLASS_NAMES.map((c) => [c, { gpu: 0, peak: 0, noted: 0, page: 0, budget: BUDGET_MB[c] }]));
  for (const [, g, p, c] of rows) { classes[c].noted += g; classes[c].page += p; }
  for (const c of CLASS_NAMES) Object.assign(classes[c], { gpu: mb(R ? MADE[c] : classes[c].noted), peak: mb(R ? MADE_PEAK[c] : PEAK[c]), noted: mb(classes[c].noted), page: mb(classes[c].page) });
  const noted = rows.reduce((s, r) => s + r[1], 0);
  return {
    gpu: mb(R ? made : noted), peak: mb(R ? peakMade : peakAll), budget: GPU_MB, classes, noted: mb(noted), page: mb(rows.reduce((s, r) => s + r[2], 0)),
    unnoted: R ? mb(Math.max(0, made - noted)) : null,
    makers: [...KINDS.values()].filter((k) => k.bytes > 0).sort((a, b) => b.bytes - a.bytes).slice(0, 24).map((k) => [k.cls, k.kind, mb(k.bytes), k.n]),
    over: [...OVER.values()].map((o) => ({ ...o })), rows: rows.map(([n, g, p, c]) => [n, mb(g), mb(p), c]), short: Object.fromEntries(SHORT),
  };
};

// ---- what the device itself makes: every buffer and texture, as it is made and destroyed ----
// (a texture's bytes: its texels' at every mip and layer, by its format; a compressed one's by its blocks)
/** A texel's bytes, by its format's own name: each channel's bits (r, g, b, a, e one each; depth, stencil one), a
    depth that is "plus" filled out to 32 bits with what is beside it, in whole bytes (WebGPU's formats). */
const texelBytes = (f) => {
  let bits = 0;
  for (const [, ch, n] of f.matchAll(/(depth|stencil|[rgbae]+)(\d+)/g)) bits += (ch === 'depth' || ch === 'stencil' ? 1 : ch.length) * +n;
  return Math.ceil((f.includes('plus') ? Math.ceil(bits / 32) * 32 : bits) / 8) || 4;
};
const BLOCK = (f) => (/^bc[14]-/.test(f) || /^etc2-rgb8|^eac-r11/.test(f) ? 8 : /^(bc|etc2|eac|astc-4x4)/.test(f) ? 16 : 0);   // (bytes a 4 × 4 block)
const texBytes = (d) => {
  const sz = Array.isArray(d.size) ? d.size : [d.size.width, d.size.height ?? 1, d.size.depthOrArrayLayers ?? 1], [w0, h0, n] = [sz[0], sz[1] ?? 1, sz[2] ?? 1];
  const b = BLOCK(d.format), t = texelBytes(d.format), three = d.dimension === '3d';
  let sum = 0;
  for (let m = 0, w = w0, h = h0, z = n; m < (d.mipLevelCount ?? 1); m++, w = Math.max(1, w >> 1), h = Math.max(1, h >> 1), z = three ? Math.max(1, z >> 1) : z) sum += (b ? Math.ceil(w / 4) * Math.ceil(h / 4) * b : w * h * t) * z;
  return sum * (d.sampleCount ?? 1);
};
// (each counted under the class whose code made it: the class of the pass running (mark: three makes its own buffers and
// targets as it first draws them, in some pass), or the one a pool here is made for (asClass); else other. This is the
// one tally held against the budgets, the class's and the whole's, where the device is counted: what no pool notes
// counts too, and a pool's own make is counted once)
let NOW = 'other', made = 0, peakMade = 0;   // (whose code runs; what the device has made, bytes; the most it held)
const MADE = Object.fromEntries(CLASS_NAMES.map((c) => [c, 0])), MADE_PEAK = { ...MADE }, KINDS = new Map(), SIZE = new WeakMap();
/** make() run as `cls`'s: what the device makes meanwhile is that class's. */
const asClass = (cls, make) => { const was = NOW; NOW = cls in MADE ? cls : 'other'; try { return make(); } finally { NOW = was; } };
const counted = (o, bytes, kind) => {
  const cls = NOW, key = `${cls}: ${kind}`, K = KINDS.get(key) ?? { cls, kind, bytes: 0, n: 0 };
  SIZE.set(o, { bytes, cls, key }); K.bytes += bytes; K.n++; KINDS.set(key, K);
  made += bytes; MADE[cls] += bytes;
  if (made > peakMade) peakMade = made;
  if (MADE[cls] > MADE_PEAK[cls]) MADE_PEAK[cls] = MADE[cls];
  if (MADE[cls] > BUDGET_MB[cls] * MB) past(cls, kind, MADE[cls], BUDGET_MB[cls], true);
  if (made > GPU_MB * MB) past(WHOLE, kind, made, GPU_MB, true);
  const d = o.destroy;
  o.destroy = function () {
    const s = SIZE.get(o);
    if (s) { made -= s.bytes; MADE[s.cls] -= s.bytes; const k = KINDS.get(s.key); k.bytes -= s.bytes; k.n--; SIZE.delete(o); }
    return d.call(this);
  };
  return o;
};
// (what a buffer or a texture is, where it has no label: by how it is used; by its format, size and use)
const U = globalThis.GPUBufferUsage ?? {}, TU = globalThis.GPUTextureUsage ?? {};
const bufferKind = (d) => d.label || (d.usage & U.INDEX ? 'index buffers' : d.usage & U.VERTEX ? 'vertex buffers' : d.usage & U.UNIFORM ? 'uniform buffers' : d.usage & U.STORAGE ? 'storage buffers' : d.usage & U.MAP_READ ? 'read-backs' : 'buffers');
const textureKind = (d) => {
  if (d.label) return d.label;
  const s = Array.isArray(d.size) ? d.size : [d.size.width, d.size.height ?? 1, d.size.depthOrArrayLayers ?? 1];
  return `${d.format} ${s[0]} × ${s[1] ?? 1}${(s[2] ?? 1) > 1 ? ` × ${s[2]}` : ''}${d.usage & TU.RENDER_ATTACHMENT ? ', drawn into' : ''}`;
};
// (and what the device makes is called so in its own record (what a GPU's memory tools show): its class and its owner,
// the pool or the three object its code named (note, own), else the part of the frame it was made in (mark), else what
// it is; never a name typed where it is made)
const CLASSED = new RegExp(`^(${CLASS_NAMES.map((c) => c.replace(/[/\\^$.*+?()[\]{}|]/g, '\\$&')).join('|')}): `);
let OWNER = null;   // (the part of the frame running: mark's name)
const labelOf = (d, kind) => (d.label && CLASSED.test(d.label) ? d.label : `${NOW}: ${d.label || (OWNER ? `${OWNER}, ${kind}` : kind)}`);
const countMade = (dev) => {
  if (dev.__counted) return; dev.__counted = true;
  const B = dev.createBuffer, T = dev.createTexture;
  dev.createBuffer = function (d) { const kind = bufferKind(d); return counted(B.call(this, { ...d, label: labelOf(d, kind) }), d.size ?? 0, kind); };
  dev.createTexture = function (d) { const kind = textureKind(d); return counted(T.call(this, { ...d, label: labelOf(d, kind) }), texBytes(d), kind); };
};
/** What a pool is (note, more: owns), named by it: three's textures, a target's (each of its pictures by its own name,
    and its depth) as `class: name`; what of them the device has made called so, and counted under that class and name
    (its code's own, whatever part of the frame it was made in), and what it makes of them later (useGPU: three's own
    make). Their names are not touched: three reads a target's pictures by them (mrt). */
const OWNS = new WeakMap();   // (a three texture: what owns it, { label, cls })
function own(cls, name, owns) {
  const to = cls in MADE ? cls : 'other', label = `${to}: ${name}`;
  for (const o of owns.flat()) {
    if (!o) continue;
    const ts = o.isRenderTarget ? [...o.textures.map((t, k) => [t, o.textures.length > 1 ? `${label} (${t.name || k})` : label]), ...(o.depthTexture ? [[o.depthTexture, `${label} (depth)`]] : [])] : o.isTexture ? [[o, label]] : [];
    for (const [t, l] of ts) { OWNS.set(t, { label: l, cls: to }); const g = R?.backend.has(t) ? R.backend.get(t).texture : null; if (g) relabel(g, l, to); }   // (has: three's data is never made before three makes it)
  }
}
/** A made texture called `label` and counted under class cls (own): its bytes moved there in the tally. */
function relabel(g, label, cls) {
  g.label = label;
  const s = SIZE.get(g), to = cls in MADE ? cls : 'other'; if (!s) return;
  const from = KINDS.get(s.key), key = `${to}: ${label}`, K = KINDS.get(key) ?? { cls: to, kind: label, bytes: 0, n: 0 };
  if (from) { from.bytes -= s.bytes; from.n--; }
  K.bytes += s.bytes; K.n++; KINDS.set(key, K);
  MADE[s.cls] -= s.bytes; MADE[to] += s.bytes; if (MADE[to] > MADE_PEAK[to]) MADE_PEAK[to] = MADE[to];
  SIZE.set(g, { ...s, cls: to, key });
}

// Whose the GPU's passes are, for a tool that times each part of a frame (tools/bench.js): the code that draws a part
// marks where its passes begin (the screen's: the culling, the prepass, the colour, the lens, the upscale; the light's:
// its cascades, the canopy, the air, the screen's light; the bench's frame what comes before them), and the tool reads
// the GPU's own clock pass by pass under those names. Nothing listens in the game: a mark is then one test.
let tap = null;
/** The passes from here on are `name`'s (null: no one's in particular), until the next mark; what the device makes
    meanwhile is the class's they are in. */
export const mark = (name) => { NOW = name ? classOf(name) : 'other'; OWNER = name || null; passBegins(name); if (tap) tap(name); };   // (and its own time on the GPU taken: src/core/pace.js)
/** A tool listens to the marks: fn(name), or null to stop. */
export const listen = (fn) => { tap = fn; };

let R = null;
/** The renderer whose GPU the lean buffers are made on (src/boot.js, once it has started). Without it (WebGL, a page that
    did not ask): gpuStorage makes an ordinary buffer, kept twice. */
export const useGPU = (renderer) => { R = renderer?.backend?.device ? renderer : null; if (R) { countMade(R.backend.device); ownedMade(R.backend); } timesOn(R?.backend.device); };
/** What three makes of a texture a pool owns (own), called and counted as its owner's, when it makes it (again: a target
    made larger). */
const ownedMade = (backend) => {
  const U2 = backend.textureUtils; if (!U2 || U2.__owned) return; U2.__owned = true;
  const make = U2.createTexture;
  U2.createTexture = function (texture, options) { const r = make.call(this, texture, options), o = OWNS.get(texture), g = o && backend.get(texture)?.texture; if (g) relabel(g, o.label, o.cls); return r; };
};
export const lean = () => !!R;
/** Whether the renderer's GPU has a WebGPU feature (none without WebGPU). */
export const hasFeature = (name) => !!R?.backend?.device?.features?.has(name);
/** The limits the design sizes against: every one read here (limitOf), and the layers of the land's pages and of the
    drawers' skins (src/terrain/pages.js, src/scatter/drawer.js). The device is asked for each as its adapter has it
    (src/boot.js limitsFrom), so what is sized from them is sized from what this GPU gives, never from WebGPU's defaults
    unasked; one not in the list is not read. */
const SIZED = ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxUniformBufferBindingSize', 'maxComputeWorkgroupsPerDimension', 'maxTextureArrayLayers'];
/** What to ask a device for, of its adapter's limits A: each of SIZED as A has it. */
const limitsFrom = (A) => Object.fromEntries(SIZED.filter((k) => A?.[k] != null).map((k) => [k, A[k]]));
/** What the device is asked for (src/boot.js): each of SIZED as this machine's adapter has it (none without WebGPU). */
export const askedLimits = async () => limitsFrom((await navigator.gpu?.requestAdapter?.({ powerPreference: 'high-performance' }).catch(() => null))?.limits);
/** One of the renderer's GPU's limits, one of SIZED (none without WebGPU: nothing then asks). */
export const limitOf = (name) => { if (!SIZED.includes(name)) throw new Error(`gpu: ${name} is not a limit the device is asked for (SIZED)`); return R?.backend?.device?.limits?.[name] ?? 0; };
/** Every buffer made here within the device's limits: one larger is an error of whoever sized it, said by name. */
const within = (bytes, name) => { const most = Math.min(limitOf('maxStorageBufferBindingSize') || Infinity, limitOf('maxBufferSize') || Infinity); if (bytes > most) throw new Error(`${name ?? 'a buffer'}: ${bytes} bytes, more than the GPU binds in one buffer (${most})`); };
/** The limits every WebGPU device grants (the standard's defaults), beside the adapter's own (limitOf): what a baked
    thing is sized by. A baked atlas is content kept by its key and drawn on any device, Safari and mobile among them,
    so its size may not depend on the GPU it was first made on (src/detail/atlas.js atlasesOf); what lives only while
    the page runs (arenas, pages, cascades) takes the adapter's own. */
export const PORTABLE = { maxTextureDimension2D: 8192, maxTextureArrayLayers: 256, maxUniformBufferBindingSize: 65536 };

const TYPES = { uint: [Uint32Array, 1], float: [Float32Array, 1], vec4: [Float32Array, 4], uvec4: [Uint32Array, 4] };
/** The bytes one element of a storage type is (gpuStorage's types). */
export const bytesOf = (type) => TYPES[type][1] * TYPES[type][0].BYTES_PER_ELEMENT;
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
  const buffer = asClass(cls, () => dev.createBuffer({ label: name ?? 'lean', size: Math.max(16, bytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }));
  R.backend.get(attr).buffer = buffer;
  if (name) note(name, bytes, 0, cls);
  return { node: storage(attr, type, count), attr, bytes, lean: true, write(at, data) { dev.queue.writeBuffer(buffer, at * 4, data); } };
}
// A buffer made again is another buffer: everything that binds the one it was binds the new one where it next binds
// (three: a storage node's attribute is another, so its bind groups are made again), and what keeps its bindings
// recorded (the late prepass's bundle, src/core/occlusion.js) records them again when remade() has moved on. The buffer
// it was is let go only once nothing can use it: after the next two frames have been drawn (every user bound the new
// one), and once the GPU has done all that was handed it before then.
let REMADE = 0;
/** A number that moves on whenever a buffer here is made again: what records its bindings records them again. */
export const remade = () => REMADE;
const nextFrame = (f) => (globalThis.requestAnimationFrame ? requestAnimationFrame(f) : setTimeout(f, 16));
const retire = (attr) => nextFrame(() => nextFrame(() => {
  const own = R.backend.get(attr).buffer, done = R.backend.device.queue?.onSubmittedWorkDone?.() ?? Promise.resolve();
  done.then(() => { attr.dispose(); if (own && R.backend.get(attr).buffer === own) own.destroy(); });   // (three's, let go by three; one three never bound, by us)
}));
/** A draw's index, its corners (list: a Uint32Array), made on the GPU at its true size and written there once (one
    sized writeBuffer: nothing mapped at its making, and no copy of it kept on the page). three is given a placeholder
    of one corner, its buffer handed to the backend before it would make its own: a draw so indexed takes its count
    from its own arguments (an indirect draw: src/scatter/tier.js), never from the placeholder. old: the index it
    replaces on the same draw; one made here is let go once nothing uses it (as a store made again, above). Without
    WebGPU: an ordinary index, kept twice. */
const INDICES = new WeakSet();
export function gpuIndex(list, old = null) {
  if (!R) return new THREE.BufferAttribute(list, 1);
  if (old && INDICES.has(old)) retire(old);
  const dev = R.backend.device, attr = new THREE.BufferAttribute(new Uint32Array(1), 1);
  const buffer = asClass('geometry', () => dev.createBuffer({ label: "a draw's corners", size: Math.max(4, list.byteLength), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST }));
  if (list.byteLength) dev.queue.writeBuffer(buffer, 0, list.buffer, list.byteOffset, list.byteLength);
  R.backend.get(attr).buffer = buffer; INDICES.add(attr);
  return attr;
}
/** The same, its size said later, before anything binds it (what is shared by things not all made yet: the culling's
    lists, src/core/occlusion.js), and said again as what it must hold changes (a resident tier's store, from its own
    count: src/scatter/tier.js; what grows with need, the single things' table: src/world/things.js): { node, attr (the buffer it is now), make(count) -> bytes }. Made again, it is a new
    buffer, the one it was retired (above), and the ledger says the difference. A storage buffer's length is not in its
    code, so the node is the same whatever it is made as. cls: the class its bytes are noted under (src/core/classes.js). */
export function gpuStorageLater(type, name = null, cls = 'other') {
  const [Arr, size] = TYPES[type], node = storage(new THREE.StorageBufferAttribute(new Arr(size), size), type, 1); let made = 0;
  return {
    node, get attr() { return node.value; },
    make(count) {
      const bytes = Math.max(1, count) * size * 4;
      if (!R) { const a = node.value; a.array = new Arr(Math.max(1, count) * size); a.count = Math.max(1, count); if (name) more(name, bytes - made, bytes - made, cls); made = bytes; return bytes; }
      within(bytes, name);
      const old = node.value, attr = made ? new THREE.StorageBufferAttribute(new Arr(size), size) : old;
      R.backend.get(attr).buffer = asClass(cls, () => R.backend.device.createBuffer({ label: name ?? 'lean', size: Math.max(16, bytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }));
      if (made) { node.value = attr; REMADE++; retire(old); }
      if (name) more(name, bytes - made, 0, cls);
      made = bytes;
      return bytes;
    },
    /** Write `data` (a typed array of its numbers) from its `at`-th number on, at once (made: the GPU's own buffer). */
    write(at, data) { const a = node.value; if (R) R.backend.device.queue.writeBuffer(R.backend.get(a).buffer, at * 4, data); else { a.array.set(data, at); a.addUpdateRange(at, data.length); a.needsUpdate = true; } },
  };
}
