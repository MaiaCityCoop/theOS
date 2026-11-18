// One stand-in for the GPU (intent 0038), for whatever checks the game's node code without one. three builds a material's
// or a compute pass's code (WGSL for WebGPU, GLSL for WebGL 2) from the renderer it is handed, reading a few of its
// fields: this is a renderer with those and nothing else. No device, no canvas, nothing drawn: plain Bun, so CI runs it.
//   - tools/smoke.js builds every material and pass of the world on it: a name left unbound, an import that is not
//     there, node code that does not build, fails in a few minutes on every push, not on a GPU or on next;
//   - a refactor of a pass is proven to change nothing by a digest: its code, and what its CPU side asks of the renderer
//     frame by frame (`record`: every target set and every thing drawn, in order), before and after.
//
//   import { mock } from './gpu-mock.js'   imported first: it sets what the game's modules read of the page as they load
//                                           (its size, its window, no WebGPU in navigator), and Vite's import.meta.glob
//                                           (tools/glob.js); the game's own modules after it, with `await import(...)`
//   const M = await mock({ webgl, dpr, record, lean })
//     M.THREE, M.TSL          three as the game imports it
//     M.renderer              the stand-in (webgl: as WebGL 2's backend, three's GLSL builder; dpr: its pixel ratio)
//     M.build(object, material = object.material, { context, camera })   -> { vertex, fragment, uniforms }: the object's
//                             code with that material (context: what node code reads as it is built); throws where three
//                             throws
//     M.compute(node)          -> its code, a compute pass's
//     M.calls                  with `record`: 'target <id>' and 'render <id>', in order (M.id(o): an object's id there);
//                             M.drawn: every material or mesh rendered
//     M.computed               every compute node the game asked to compile or run
//     M.tiles                  the world's baked tiles, stood in by one small array texture (src/world/tile.js), and set
//     lean: the page's GPU for src/core/gpu.js (useGPU): what only the GPU reads made on the device, as the game makes it
import './glob.js';

Object.assign(globalThis, { innerHeight: 1080, innerWidth: 1920, window: globalThis, addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, navigator: { gpu: undefined, userAgent: 'bun', hardwareConcurrency: 4 },
  location: { search: '', hash: '', pathname: '/', origin: 'http://localhost', href: 'http://localhost/' } });
// (the page: every element a stand-in that takes whatever is set on it and answers whatever is asked of it, so the
// game's own panels and labels are made as they are on a page, and nothing of them is drawn)
const NOT = new Set(['then', 'toJSON', 'valueOf', 'toString', 'nodeType', 'length']);
const element = () => new Proxy({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, children: [], hidden: false, textContent: '', innerHTML: '', value: '' }, {
  get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' || NOT.has(k) ? undefined : /^(querySelectorAll|getElementsBy)/.test(k) ? () => [] : k === 'getBoundingClientRect' ? () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) : k === 'getContext' ? () => null : () => element()),
  set: (o, k, v) => ((o[k] = v), true) });
globalThis.document ??= { createElement: element, createElementNS: element, getElementById: () => element(), querySelector: () => element(), querySelectorAll: () => [], body: element(), head: element(), documentElement: element(),
  addEventListener() {}, removeEventListener() {}, hidden: false, visibilityState: 'visible', fonts: { ready: Promise.resolve() } };
globalThis.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };

export async function mock({ webgl = false, dpr = 1, record = false, lean = false, size = [1920, 1080] } = {}) {
  const THREE = await import('three/webgpu'), TSL = await import('three/tsl');
  globalThis.devicePixelRatio = dpr;
  const Builder = webgl ? THREE.GLSLNodeBuilder : THREE.WGSLNodeBuilder, features = new Set(['indirect-first-instance', 'timestamp-query']);
  const ids = new Map(), id = (o) => (o == null ? null : (ids.has(o) || ids.set(o, `#${ids.size}`), ids.get(o)));
  const calls = [], drawn = new Set(), computed = new Set(), done = () => ({ destroy() {} });
  const device = { features, limits: { maxStorageBufferBindingSize: 2 ** 30, maxBufferSize: 2 ** 30, maxComputeWorkgroupsPerDimension: 65535, maxTextureArrayLayers: 2048, maxUniformBufferBindingSize: 65536, maxTextureDimension2D: 8192 },
    createBuffer: done, createTexture: done, queue: { writeBuffer() {}, writeTexture() {}, submit() {} } };
  const backend = { isWebGPUBackend: !webgl, isWebGLBackend: webgl, compatibilityMode: false, parameters: {}, get: () => ({}), device: webgl ? null : device,
    capabilities: { getUniformBufferLimit: () => 65536 }, utils: { getTextureSampleData: () => ({ primarySamples: 1, samples: 1, isMSAA: false }) },
    extensions: { has: () => true, get: () => ({}) }, createNodeBuilder: (o, r) => new Builder(o, r) };
  let target = null;
  const renderer = {
    backend, library: new THREE.StandardNodeLibrary(), nodes: { getCacheKey: () => 0, library: null }, contextNode: TSL.context(), _bindings: undefined,
    debug: { diagnostics: { keywords: false }, onNodeBuilderCreated: null }, info: { render: {}, compute: {}, memory: {}, autoReset: true, reset() {} },
    xr: { enabled: false }, shadowMap: { enabled: false }, lighting: { getNode: () => null }, isOutputTarget: false, highPrecision: false, autoClear: true,
    currentColorSpace: THREE.LinearSRGBColorSpace, outputColorSpace: THREE.LinearSRGBColorSpace, toneMapping: THREE.NoToneMapping,
    hasFeature: () => true, hasCompatibility: () => false,   // (every feature: every path of the node code is built) getColorBufferType: () => THREE.HalfFloatType, getMRT: () => null, getOutputRenderTarget: () => null, getPixelRatio: () => dpr,
    size: { W: size[0] * dpr, H: size[1] * dpr }, getDrawingBufferSize: (v) => v.set(renderer.size.W, renderer.size.H), getSize: (v) => v.set(renderer.size.W / dpr, renderer.size.H / dpr), setSize() {}, setPixelRatio() {},
    getRenderTarget: () => target, setRenderTarget: (t) => { target = t; if (record) calls.push(`target ${id(t)}`); },
    render: (o) => { drawn.add(o); if (record) calls.push(`render ${id(o)}`); }, clear() {}, setRenderObjectFunction() {}, getRenderObjectFunction: () => null, setViewport() {}, setScissor() {}, setScissorTest() {}, copyTextureToTexture() {}, copyFramebufferToTexture() {}, setAnimationLoop() {}, dispose() {}, setClearColor() {}, getClearColor: (c) => c, getClearAlpha: () => 1, initRenderTarget() {},
    compileComputeAsync: (passes) => { for (const p of [passes].flat()) computed.add(p); return Promise.resolve(); }, compute: (p) => { for (const n of [p].flat()) computed.add(n); }, computeAsync: (p) => { for (const n of [p].flat()) computed.add(n); return Promise.resolve(); },
    compileAsync: () => Promise.resolve(), getArrayBufferAsync: () => Promise.resolve(new ArrayBuffer(64)), readRenderTargetPixelsAsync: (t, x, y, w, h) => Promise.resolve(new Uint8Array(Math.max(4, w * h * 4))),
  };
  renderer.nodes.library = renderer.library;
  const build = (object, material = object.material, { context = null, camera = new THREE.PerspectiveCamera() } = {}) => {
    const b = new Builder(object, renderer); b.material = material; b.scene = new THREE.Scene(); b.camera = camera;
    if (context) Object.assign(b.context, context);
    b.build();
    return { vertex: b.vertexShader, fragment: b.fragmentShader, uniforms: b.uniforms };
  };
  const compute = (node) => { const b = new Builder(null, renderer); b.compute = node; b.build(); return b.computeShader; };
  // (one array texture of 16 layers, 1 x 1, for every baked tile a material reads: src/world/tile.js)
  const arr = new THREE.DataArrayTexture(new Uint8Array(16 * 4), 1, 1, 16); arr.needsUpdate = true;
  const read = (layer, uv) => TSL.texture(arr, uv).depth(layer?.isNode ? layer : TSL.int(layer ?? 0));
  const tiles = { a: read, n: read, r: read, used: [], layer: () => 0, flush() {}, ready: Promise.resolve() };
  (await import('../src/world/tile.js')).useTiles(tiles);
  if (lean && !webgl) (await import('../src/core/gpu.js')).useGPU(renderer);
  return { THREE, TSL, renderer, build, compute, calls, drawn, computed, id, tiles };
}
