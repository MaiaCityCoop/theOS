// What a frame of the game asks of the GPU, counted. Switched on by `?draws` in the address (src/boot.js), before the
// first pipeline is made; then, in the game's console: `await __draws.frame()` ->
//   { passes, draws: { direct, indexed, indirect, indexedIndirect }, buffers: { direct, indexed, indirect, indexedIndirect } }
// passes: its render passes; draws: its draw calls by kind; buffers: of each kind, those whose pipeline reads at least
// one vertex buffer. That last count is for Safari: WebKit checks an indirect draw against the vertex buffers its
// pipeline reads before it passes it on, and passes one whose pipeline reads none (its vertices come from storage)
// straight on (WebKit's RenderPassEncoder.mm: computeMininumVertexInstanceCount, clampIndirectIndexBufferToValidValues).
// three's own count (renderer.info) leaves every indirect draw out. Counted where the page speaks to WebGPU, so
// whatever draws is counted, the game's own passes and three's alike. What is drawn through a bundle is not: the
// game makes none.
const KINDS = { draw: 'direct', drawIndexed: 'indexed', drawIndirect: 'indirect', drawIndexedIndirect: 'indexedIndirect' };
const none = () => ({ passes: 0, draws: { direct: 0, indexed: 0, indirect: 0, indexedIndirect: 0 }, buffers: { direct: 0, indexed: 0, indirect: 0, indexedIndirect: 0 } });

export function watch() {
  if (window.__draws || typeof GPURenderPassEncoder === 'undefined') return;   // (once, and only where there is WebGPU)
  let N = none();
  const reads = new WeakMap(), now = new WeakMap();   // how many vertex buffers a pipeline reads; the pipeline a pass draws with now
  const D = GPUDevice.prototype, E = GPUCommandEncoder.prototype, P = GPURenderPassEncoder.prototype, buffersOf = (d) => (d.vertex?.buffers ?? []).filter(Boolean).length;
  const make = D.createRenderPipeline, makeAsync = D.createRenderPipelineAsync, begin = E.beginRenderPass, set = P.setPipeline;
  D.createRenderPipeline = function (d) { const p = make.call(this, d); reads.set(p, buffersOf(d)); return p; };
  D.createRenderPipelineAsync = function (d) { return makeAsync.call(this, d).then((p) => { reads.set(p, buffersOf(d)); return p; }); };
  E.beginRenderPass = function (d) { N.passes++; return begin.call(this, d); };
  P.setPipeline = function (p) { now.set(this, p); return set.call(this, p); };
  for (const [name, kind] of Object.entries(KINDS)) {
    const draw = P[name];
    P[name] = function (...a) { N.draws[kind]++; if (reads.get(now.get(this)) > 0) N.buffers[kind]++; return draw.apply(this, a); };
  }
  window.__draws = {
    /** One frame of the game, from one animation frame to the next: what was counted in it (a promise). */
    frame: () => new Promise((done) => requestAnimationFrame(() => { N = none(); requestAnimationFrame(() => { const got = N; N = none(); done(got); }); })),
  };
}
