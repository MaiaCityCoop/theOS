// The shadow cascades checked on the CPU (intent 0038, stage 9a): `bun tools/cascades.js`. No GPU: three's own WebGPU
// backend draws onto a stand-in device that records what it is asked (textures and views, passes and their attachments,
// pipelines, shaders, samplers, bind groups) and draws nothing. One caster (a slab 2.75 m over the floor, layer CASTS) and
// one receiver (a floor whose colour is src/world/light.js shadowAt) are drawn two frames, as the game draws them:
// src/world/shadow.js render (every cascade in the first, the farthest first; the near one and the next in turn in the
// second), then the eye. The cascades are laid out from the world's own stands (src/terrain/layers.js), the screen the
// gate's light check's (tools/gate/views.js CHECK_SIZE), the eye the gate's at the tent at eye level through the walker's
// lens (src/camera/rig.js). What it holds the light to (exit 1 where one fails):
//   layers     each cascade's pass writes its own layer of the one depth array, cleared and stored
//   casters    their shadow twins draw into it with depth written and tested (depth32float, less-equal), no colour
//   reads      the receiver declares the array and a comparison sampler, and reads the near cascade in layer 0 (six loads,
//              eight compared taps) and the others in one loop, each in its own layer by its index (four taps, once)
//   binding    the receiver binds the very texture the passes drew into, all its layers, its depth; the sampler less-equal
//   projection the caster as the near pass writes it (its clip space) and the floor point it shades as the receiver reads
//              it (the near cascade's matrix) meet at one texel, the caster nearer the light by as many metres as stand
//              between them
// It says nothing of the GPU itself: what the driver does with these is the Mac mini's to see (tools/gate.js).
import './glob.js';
import { VIEWS, CHECK_SIZE } from './gate/views.js';
import RIG from '../camera/rig.js';

// ---- the stand-in device ----
const LOG = { textures: [], passes: [], pipelines: [], shaders: [], samplers: [], groups: [] };
let ids = 0;
const plain = (o) => (o == null ? o : JSON.parse(JSON.stringify(o, (k, v) => (v && typeof v === 'object' && v.__id ? `#${v.__id}` : v))));
const made = (kind, extra = {}) => ({ __kind: kind, __id: ++ids, ...extra });
const textureOf = (d) => {
  const s = d.size, t = made('texture', { width: s.width ?? s[0], height: s.height ?? s[1] ?? 1, layers: s.depthOrArrayLayers ?? s[2] ?? 1, format: d.format, dimension: d.dimension ?? '2d', destroy() {} });
  t.createView = (v = {}) => made('view', { texture: t, desc: plain(v) });
  LOG.textures.push(t); return t;
};
const pass = (d) => {
  const z = d.depthStencilAttachment, rec = { colours: (d.colorAttachments ?? []).length, depth: z ? { texture: z.view?.texture, view: z.view?.desc, load: z.depthLoadOp, store: z.depthStoreOp, clear: z.depthClearValue } : null, draws: [] };
  LOG.passes.push(rec); let p = null;
  const draw = () => rec.draws.push(p);
  return { setPipeline(x) { p = x; }, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, draw, drawIndexed: draw, drawIndirect: draw, drawIndexedIndirect: draw, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {}, beginOcclusionQuery() {}, endOcclusionQuery() {}, executeBundles() {}, end() {}, pushDebugGroup() {}, popDebugGroup() {}, insertDebugMarker() {} };
};
const pipeline = (d) => { const r = made('pipeline', { label: d.label, depth: plain(d.depthStencil), targets: plain(d.fragment?.targets), fragment: d.fragment?.module }); r.getBindGroupLayout = () => made('layout'); LOG.pipelines.push(r); return r; };
const FEATURES = new Set(['core-features-and-limits', 'depth32float-stencil8', 'indirect-first-instance', 'float32-filterable', 'rg11b10ufloat-renderable', 'texture-compression-bc']);
const LIMITS = new Proxy({ maxTextureArrayLayers: 2048, maxTextureDimension2D: 16384, maxBindGroups: 4, maxSampledTexturesPerShaderStage: 16, maxSamplersPerShaderStage: 16, maxUniformBufferBindingSize: 65536, minUniformBufferOffsetAlignment: 256, minStorageBufferOffsetAlignment: 256, maxColorAttachments: 8, maxComputeWorkgroupsPerDimension: 65535 }, { get: (t, k) => (k in t ? t[k] : 1 << 20) });
const device = {
  features: FEATURES, limits: LIMITS, lost: new Promise(() => {}),
  createTexture: textureOf,
  createBuffer: (d) => { const data = new ArrayBuffer(Math.max(4, Math.ceil(d.size / 4) * 4)); return { size: d.size, usage: d.usage, mapState: 'unmapped', async mapAsync() {}, getMappedRange: (o = 0, n) => data.slice(o, n === undefined ? undefined : o + n), unmap() {}, destroy() {} }; },
  createSampler: (d = {}) => { const s = made('sampler', { desc: plain(d) }); LOG.samplers.push(s); return s; },
  createShaderModule: (d) => { const m = made('shader', { code: d.code, async getCompilationInfo() { return { messages: [] }; } }); LOG.shaders.push(m); return m; },
  createBindGroupLayout: () => made('layout'), createPipelineLayout: () => made('pipelineLayout'),
  createBindGroup: (d) => { const g = made('group', { entries: (d.entries ?? []).map((e) => e.resource) }); LOG.groups.push(g); return g; },
  createRenderPipeline: pipeline, createRenderPipelineAsync: async (d) => pipeline(d),
  createComputePipeline: () => made('compute', { getBindGroupLayout: () => made('layout') }), createComputePipelineAsync: async () => made('compute', { getBindGroupLayout: () => made('layout') }),
  createCommandEncoder: () => ({ beginRenderPass: pass, beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, dispatchWorkgroupsIndirect() {}, end() {} }), copyBufferToBuffer() {}, copyTextureToTexture() {}, copyTextureToBuffer() {}, copyBufferToTexture() {}, clearBuffer() {}, resolveQuerySet() {}, finish: () => made('commands') }),
  createRenderBundleEncoder: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, draw() {}, drawIndexed() {}, drawIndirect() {}, drawIndexedIndirect() {}, finish: () => made('bundle') }),
  createQuerySet: () => ({ destroy() {} }), pushErrorScope() {}, popErrorScope: async () => null, destroy() {},
  queue: { writeBuffer() {}, writeTexture() {}, copyExternalImageToTexture() {}, submit() {}, onSubmittedWorkDone: async () => {} },
};
class GPURenderBundleEncoder {}
const [W, H] = CHECK_SIZE.split('x').map(Number);
const canvas = { width: W, height: H, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => ({ configure() {}, unconfigure() {}, getCurrentTexture: () => textureOf({ size: { width: W, height: H }, format: 'bgra8unorm' }) }) };
Object.assign(globalThis, {
  window: globalThis, self: globalThis, innerWidth: W, innerHeight: H, devicePixelRatio: 1, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {},
  document: { hidden: false, createElement: () => canvas, getElementById: () => null, body: { appendChild() {} }, addEventListener() {} },
  GPURenderBundleEncoder, GPUShaderStage: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 }, GPUMapMode: { READ: 1, WRITE: 2 },
  GPUBufferUsage: { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 },
  GPUTextureUsage: { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 },
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'bun', gpu: { requestAdapter: async () => ({ features: FEATURES, limits: LIMITS, info: {}, requestDevice: async () => device }), getPreferredCanvasFormat: () => 'bgra8unorm', wgslLanguageFeatures: new Set() } } });

// ---- the scene: one caster, one receiver ----
const THREE = await import('three/webgpu'), T = await import('three/tsl');
const { U } = await import('../src/core/uniforms.js');
const { createShadows, useCascades, CASTS } = await import('../src/world/shadow.js');
const { CASTERS } = await import('../src/terrain/layers.js');
const { fovOf } = await import('../src/camera/rig.js');
const layout = useCascades(CASTERS), SHADOW_S = layout.S;   // (as src/boot.js lays them out)
const light = await import('../src/world/light.js');
const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false });
await renderer.init(); light.useBackend(renderer);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;   // (as the game: src/boot.js)
// (the eye: as high over the floor and as tilted as the gate's tent at eye level, through the walker's lens there)
const eye = VIEWS.find((v) => v.name === 'bench-tent-eye-level').rig, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(fovOf(RIG.keys[0].mm, W / H), W / H, 0.15, 30000);
camera.position.set(0, eye.h, 0); camera.rotation.set(eye.look, 0, 0); scene.add(camera);
const slab = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2), new THREE.MeshBasicNodeMaterial()); slab.position.set(0, 3, -6); slab.layers.enable(CASTS); scene.add(slab);
const floorMat = new THREE.MeshBasicNodeMaterial(); floorMat.colorNode = T.Fn(() => T.vec4(T.vec3(light.shadowAt(T.positionWorld)), 1))();
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), floorMat));
const shadows = createShadows(renderer), rt = shadows.target;
const frames = [];
for (let f = 0; f < 2; f++) {
  const from = LOG.passes.length; shadows.render(scene, camera, 0); frames.push(LOG.passes.slice(from));
  renderer.setRenderTarget(null); renderer.render(scene, camera);
}

// ---- the checks ----
let failed = 0;
const check = (what, ok, said) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${said ? `: ${said}` : ''}`); if (!ok) failed++; };
const cascades = renderer.backend.get(rt.depthTexture).texture;
const n = layout.n;
console.log(`laid out: ${n} cascades of ${SHADOW_S} texels a side, half sides ${layout.half.map((h) => h.toFixed(1)).join(', ')} m, texels ${layout.texel.map((t) => (100 * t).toFixed(2)).join(', ')} cm (lowest crown ${CASTERS.crown.toFixed(2)} m, reach ${CASTERS.reach} m, tallest ${CASTERS.top} m)`);
check(`the cascades are one depth array of ${n} layers`, cascades?.layers === n && cascades.format === 'depth32float', cascades && `${cascades.width}x${cascades.height}x${cascades.layers} ${cascades.format}`);
const layerOf = (p) => (p.depth?.texture === cascades ? p.depth.view.baseArrayLayer : null);
const into = frames.map((F) => F.filter((p) => layerOf(p) != null)), every = Array.from({ length: n }, (_, k) => n - 1 - k).join();
check('frame 1 draws every cascade into its own layer, the farthest first, the near one last', into[0].map(layerOf).join() === every, into[0].map(layerOf).join());
check('frame 2 draws the next one in turn and the near one', into[1].map(layerOf).join() === '1,0', into[1].map(layerOf).join());
const all = into.flat();
check('each cascade pass clears its layer and stores it, a 2D view of that one layer', all.every((p) => p.depth.load === 'clear' && p.depth.store === 'store' && p.depth.clear === 1 && p.depth.view.dimension === '2d' && p.depth.view.arrayLayerCount === 1));
check('the caster is drawn in each cascade pass', all.every((p) => p.draws.length === 1));
const twin = all.flatMap((p) => p.draws);
check('its shadow twin writes and tests depth (depth32float, less-equal) and no colour', twin.every((p) => p.depth?.format === 'depth32float' && p.depth.depthWriteEnabled === true && p.depth.depthCompare === 'less-equal' && p.targets.length === 0), JSON.stringify(twin[0]?.depth));
const code = LOG.shaders.map((s) => s.code).find((c) => /texture_depth_2d_array/.test(c) && /@fragment/.test(c)) ?? '';
const tex = code.match(/var (\w+) : texture_depth_2d_array;/)?.[1], smp = code.match(/var (\w+) : sampler_comparison;/)?.[1];
check('the receiver declares the cascades as a depth array with a comparison sampler', !!tex && smp === `${tex}_sampler`);
const loads = [...code.matchAll(new RegExp(`textureLoad\\( ${tex}, .*?, (\\d+), u32`, 'g'))].map((m) => m[1]);
const taps = [...code.matchAll(new RegExp(`textureSampleCompare\\( ${smp?.replace('_sampler', '')}, ${smp}, .*?, ([^,]+), \\w+ \\)`, 'g'))].map((m) => m[1].trim());
const near = taps.filter((l) => l === '0'), far = taps.filter((l) => !/^\d+$/.test(l));
check('the near cascade is read in layer 0: six blocker loads, eight compared taps', loads.length === 6 && loads.every((l) => l === '0') && near.length === 8, `loads ${loads.join('')}, taps ${near.join('')}`);
check('the others are read in one loop, each in its own layer by its index: four compared taps, once', far.length === 4 && near.length + far.length === taps.length && /\bfor ?\(|\bloop ?\{/.test(code), `taps by index: ${far.join(', ')}`);
const bound = LOG.groups.flatMap((g) => g.entries).filter((r) => r?.__kind === 'view' && r.texture === cascades);
check('the receiver binds the very texture the passes drew into: all its layers, its depth', bound.length > 0 && bound.every((v) => v.desc.dimension === '2d-array' && v.desc.aspect === 'depth-only' && (v.desc.arrayLayerCount ?? n) === n && !v.desc.baseArrayLayer), bound[0] && JSON.stringify(bound[0].desc));
check('U.tShadow is that texture, and the shadows are on', U.tShadow.value === rt.depthTexture && U.uShadowOn.value === 1);
check('its sampler compares less-equal, filtered', LOG.samplers.some((s) => s.desc.compare === 'less-equal' && s.desc.magFilter === 'linear' && s.desc.minFilter === 'linear'));
// the slab's underside as the near pass writes it (its clip space through the near cascade's camera: y down the
// framebuffer, depth 0 … 1) and the floor point it shades along the light, as the receiver reads it (its matrix)
const cam = shadows.cams[0], L = U.uSunDir.value, under = new THREE.Vector3(0, 2.75, -6), floor = under.clone().addScaledVector(L, -under.y / L.y);
const c = under.clone().applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix), q = floor.clone().applyMatrix4(layout.mats.array[0]);
const written = [(c.x * 0.5 + 0.5) * SHADOW_S, (0.5 - c.y * 0.5) * SHADOW_S], read = [q.x * SHADOW_S, q.y * SHADOW_S], metres = (q.z - c.z) * layout.range[0];
check('the caster as written and the floor it shades as read meet at one texel, the caster nearer the light', Math.hypot(written[0] - read[0], written[1] - read[1]) < 0.01 && c.z < q.z - layout.bias[0] / layout.range[0] && Math.abs(metres - under.y / L.y) < 1e-3,
  `texel ${written.map((v) => v.toFixed(1))} and ${read.map((v) => v.toFixed(1))}, ${metres.toFixed(3)} m between (${(under.y / L.y).toFixed(3)} along the light)`);
console.log(failed ? `${failed} check(s) failed` : 'every check holds');
process.exit(failed ? 1 : 0);
