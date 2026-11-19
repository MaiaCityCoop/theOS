// The GPU's pace, measured, not reckoned (intent 0038: it differs a device to the next): what a frame does of a
// piecemeal job (the land's pages laid, src/terrain/pages.js; the tiers' packing visits, src/scatter/tier.js) is held to
// what the GPU does in a share of the frame, by each piece's own time on the GPU.
//
//   ownGpuMs(renderer, submit)   a submission's own time on the GPU, ms, a promise: by the GPU's own clock where it has
//                                one (stampedMs); else heard, a bound: from when it is handed over (submit()), or when
//                                the GPU has done all handed before it, whichever is later, to when it is done (null
//                                where there is no queue to ask: the CPU's stand-in, tools/gpu-mock.js)
//   stampedMs(device, submit)    submit() run with its own GPU time taken by the GPU's own timestamps: a promise of ms
//                                (null where the GPU wrote them not, or alike: no time, heard then); null where the
//                                device has none ('timestamp-query'), or every pair of its clock's slots is in flight
//                                (heard then), submit() not run then. The one reader of a submission's GPU
//                                time: ownGpuMs, and the gate's watch (tools/gate/device.js, globalThis.__stampedMs;
//                                isMark: the clock's own command buffers)
//   frameShare(cls)              the ms a frame what is paced in class cls may take now: the whole frame (FRAME_MS)
//                                behind the veil, its class's share (FRAME_MS_BY_CLASS) once the first view shows
//   pace(unit)                   how many of something a frame: { n, left, tick(), measured(count, ms, budget, exact) }:
//                                a frame begins with tick() (left = n); a piece of `count` of them took `ms` of a
//                                `budget` (ms a frame): fewer at once where they took longer, at most twice as many, once
//                                a frame, where they took less. Never fewer than `unit`, the whole of its work it does at
//                                the least a frame (a piece, a page, a window), on a time heard on the page's thread
//                                (ownGpuMs: a busy frame holds it back, and charges its stall to what was handed over
//                                before it); fewer only on the GPU's own time of it (exact: its timestamps, or the
//                                frame held), down to one. And most(least): as many as one submission may hold,
//                                SUBMIT_MS (budget.js) at what one of them took last (each), never fewer than `least`
//                                (a piece's own least, not the frame's unit: a stall makes pieces smaller)
//   passBegins(name)             a pass named `name` begins (src/core/gpu.js mark; null: none): the one before ends, and
//                                its own time on the GPU is added to its name's, as ownGpuMs takes it (from when it
//                                began, or the GPU was done with all handed before, to when it is done)
//   spentSince(reader, names)    what the passes so named have taken on the GPU since this reader last asked (ms; none
//                                the first time): the room a paced pass has left in its class (src/terrain/water.js:
//                                the light's)
//   frameDone()                  the frame's passes are all handed over (src/boot.js, after it draws): a promise of its
//                                own time on the GPU, its passes' together, once they are done (null where there is no
//                                queue to ask): what the governor judges (src/core/governor.js)

import { FRAME_MS, FRAME_MS_BY_CLASS, SUBMIT_MS } from './budget.js';
import { ready } from './settle.js';

// ---- a class's share of the frame ----
// Behind the veil, till the first view is shown, nothing is seen moving: what is paced may take the whole frame
// (FRAME_MS); once it shows, its class's share (FRAME_MS_BY_CLASS, src/core/budget.js). One rule, read by everything
// paced (the land's pages, the ground's maps, the tiers' visits and packings, the far ends' bakes).
let veiled = true; ready.then(() => { veiled = false; });
/** The ms a frame what is paced in class `cls` may take now (a GPU's, or a packing's on the page's thread): the whole
    frame's behind the veil, its class's share once the first view shows. */
export const frameShare = (cls) => (veiled ? FRAME_MS : FRAME_MS_BY_CLASS[cls]);

// ---- a submission's own time on the GPU by the GPU's own clock: two timestamps the GPU writes itself, one before the
// submission's work and one after it (a compute pass of one workgroup doing nothing each, in command buffers of their
// own about it), read back. Not heard on the page's thread, so a stall of it is not charged to the GPU (2026-11-19: the
// ground's pieces, well under a millisecond each, were heard 231 and 461 ms late, frame after frame). The marks work:
// an Apple GPU samples its clock at a pass's stages, and a pass that dispatches nothing has none, so neither browser
// writes its timestamps (2026-11-19, the M2: WebKit and Chrome alike read 0 for both of an empty pass, 3-4 µs apart for
// a pass of one workgroup doing nothing, 4.6-5.2 ms for one doing 5 ms of work; every stamp of the hour's WebKit run
// and of Chrome's had read 0) ----
// One query set a device, made at its first stamp and never again: Metal gives a process 32 counter sample buffers, a
// query set one each where the browser does not pool them (Dawn, src/dawn/native/metal/QuerySetMTL.h; pooled since
// 2026-07, after Chrome 138), so a set a stamp in flight, made whenever none was free, ran out of them: some 6,000
// "Cannot allocate sample buffer" a Chrome run, at both shares, every stamp past them heard after all (2026-11-19, the
// draw path's runs). Its slots are taken a pair a stamp, in turn, held from the stamp's first mark till the batch that
// reads it is back; with the next pair still held, a submission is not stamped (heard). A batch is every stamp whose
// marks are handed over: the whole set resolved, copied and mapped at once, one batch in flight, the next asked as it
// comes back.
const CLOCK = "the GPU's clock", CLOCKS = new WeakMap();
/** The most queries one query set holds (WebGPU: a set of more is invalid; Dawn pools its sample buffers at as many):
    the clock's slots, a pair a stamp, so the most stamps in flight on a device. 8 bytes a slot, 16 more read back.
    unit: queries. source: WebGPU, https://www.w3.org/TR/webgpu/#dom-gpudevice-createqueryset */
const QUERIES = 4096;
/** The device's clock: its one query set, what it is resolved to and read back through, the pass its marks dispatch
    (one workgroup doing nothing), the pairs held; made at its first stamp, the make's errors caught (made: whether it
    could be made; dead: not, or the device is gone). */
function clockOf(device) {
  let C = CLOCKS.get(device);
  if (C) return C;
  const bytes = QUERIES * 8, buf = (usage) => device.createBuffer({ size: bytes, usage, label: CLOCK });
  device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
  const nothing = device.createComputePipeline({ label: CLOCK, layout: 'auto', compute: { module: device.createShaderModule({ label: CLOCK, code: '@compute @workgroup_size(1) fn main() {}' }), entryPoint: 'main' } });
  C = { device, nothing, set: device.createQuerySet({ type: 'timestamp', count: QUERIES, label: CLOCK }), res: buf(GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC), out: buf(GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ), held: new Uint8Array(QUERIES / 2), next: 0, due: [], reading: false, dead: false, raw: null };
  C.made = Promise.all([device.popErrorScope(), device.popErrorScope()]).then((e) => !e.some(Boolean), () => false);
  CLOCKS.set(device, C);
  return C;
}
/** submit() run with its own time on the GPU taken by the GPU's timestamps: a promise of ms (null where they could not
    be read); null where the device has no 'timestamp-query' or every pair of its clock is in flight, and submit() not
    run. raw: how the clock's own command buffers are handed to the queue (the gate's watch hands its unwatched submit). */
function stampedMs(device, submit, raw = (cbs) => device.queue.submit(cbs)) {
  if (!device?.features?.has('timestamp-query')) return null;
  const C = clockOf(device), i = C.next;
  if (C.dead || C.held[i]) return null;   // (the pairs all in flight: heard, never another set)
  C.held[i] = 1; C.next = (i + 1) % C.held.length; C.raw = raw;
  const mark = (end) => {
    const e = device.createCommandEncoder({ label: CLOCK });
    const p = e.beginComputePass({ label: CLOCK, timestampWrites: end ? { querySet: C.set, endOfPassWriteIndex: 2 * i + 1 } : { querySet: C.set, beginningOfPassWriteIndex: 2 * i } });
    p.setPipeline(C.nothing); p.dispatchWorkgroups(1); p.end();   // (a stage for the GPU's clock to be sampled at)
    return e.finish({ label: CLOCK });
  };
  raw([mark(false)]); submit(); raw([mark(true)]);
  return new Promise((done) => { C.due.push({ i, done }); if (!C.reading) read(C); });
}
/** A stamp's time, ms, from its two timestamps (ns): none (null) where the first was never written (a query never
    written resolves to 0) or the second is not after it. A time of nought is no time: the GPU's word that its work cost
    nothing would let what is paced by it grow without end (src/core/pace.js pace: budget × count / 0). (2026-11-19, the
    hour on ba6bea3, WebKit at Retina: "19842 of 19842 timed by the GPU's timestamps; the longest 0 ms".) */
const spanOf = (a, b) => (a > 0n && b > a ? Number(b - a) / 1e6 : null);
/** The clock's stamps whose marks are handed over, read at once: the set resolved and copied after them on the queue,
    then mapped; each stamp given its time (spanOf; null where the set could not be made or the device is gone), its
    pair let go, and the next batch asked. */
function read(C) {
  const batch = C.due; C.due = [];
  C.reading = batch.length > 0;
  if (!C.reading) return;
  const back = (ms) => { batch.forEach((s, k) => { C.held[s.i] = 0; s.done(ms ? ms[k] : null); }); read(C); };
  if (C.dead) { back(null); return; }
  const cmd = C.device.createCommandEncoder({ label: CLOCK });
  cmd.resolveQuerySet(C.set, 0, QUERIES, C.res, 0); cmd.copyBufferToBuffer(C.res, 0, C.out, 0, QUERIES * 8);
  C.raw([cmd.finish({ label: CLOCK })]);
  Promise.all([C.made, C.out.mapAsync(GPUMapMode.READ)]).then(([ok]) => { const t = ok && new BigUint64Array(C.out.getMappedRange()), ms = t && batch.map((s) => spanOf(t[2 * s.i], t[2 * s.i + 1])); C.out.unmap(); return ms; })
    .then((ms) => { C.dead ||= !ms; back(ms); }, () => { C.dead = true; back(null); });
}
/** Whether a command buffer is one of the clock's own marks (handed on unwatched: tools/gate/device.js). */
const isMark = (cb) => cb?.label === CLOCK;
globalThis.__stampedMs = stampedMs; globalThis.__isMark = isMark;   // (for the gate's watch, in the page before the game: one reader)
/** A submission's own time on the GPU (ms, a promise; null without a queue to ask): by the GPU's timestamps where it
    has them, else heard (a bound: a stall of the page's thread in it). */
export function ownGpuMs(renderer, submit) {
  const dev = renderer.backend?.device, q = dev?.queue;
  if (!q?.onSubmittedWorkDone) { submit(); return null; }
  const before = q.onSubmittedWorkDone().then(() => performance.now()), t0 = performance.now();
  const stamped = stampedMs(dev, submit) ?? (submit(), null);
  const after = q.onSubmittedWorkDone().then(() => performance.now());
  const heard = Promise.all([before, after]).then(([d0, d1]) => Math.max(1e-3, d1 - Math.max(t0, d0)));
  return stamped ? Promise.all([stamped, heard]).then(([gpu, bound]) => gpu ?? bound) : heard;   // (by the GPU's clock; heard, a bound, where it has none)
}

// ---- each pass's own time on the GPU, by its marks ----
let QUEUE = null, open = null, doneWas = 0, FRAME = 0;
const TOTAL = new Map(), READ = new Map(), OWN = new Map();   // (TOTAL: a pass's name -> ms all told; READ: a reader -> what it had seen of them; OWN: a frame's number -> its passes' ms so far)
/** The device whose queue the passes' times are taken on (src/core/gpu.js useGPU); none: none taken. */
export const timesOn = (device) => { QUEUE = device?.queue?.onSubmittedWorkDone ? device.queue : null; };
/** A pass named `name` begins (null: none): the one before ends; its own time on the GPU added to its name's. */
export function passBegins(name) {
  if (!QUEUE) return;
  const was = open;
  if (was) QUEUE.onSubmittedWorkDone().then(() => { const d = performance.now(), ms = Math.max(0, d - Math.max(was.t0, doneWas)); TOTAL.set(was.name, (TOTAL.get(was.name) ?? 0) + ms); OWN.set(was.frame, (OWN.get(was.frame) ?? 0) + ms); doneWas = d; }, () => {});
  open = name ? { name, t0: performance.now(), frame: FRAME } : null;
}
/** The frame's passes are all handed over: a promise of its own time on the GPU (ms: its passes' together, each from
    when it began or the GPU was done with all before it, to when it is done), once they are done; null without a queue
    to ask. A pass still open ends here (its time is this frame's), and the queue is done with them in the order they
    were handed over, so its last is counted first. */
export function frameDone() {
  if (!QUEUE) return null;
  passBegins(null);
  const f = FRAME++;
  return QUEUE.onSubmittedWorkDone().then(() => { const ms = OWN.get(f) ?? 0; OWN.delete(f); return ms; }, () => null);
}
/** What the passes named `names` have taken on the GPU since `reader` last asked (ms; none the first time it asks). */
export function spentSince(reader, names) {
  const first = !READ.has(reader); if (first) READ.set(reader, new Map());
  const seen = READ.get(reader); let ms = 0;
  for (const n of names) { const t = TOTAL.get(n) ?? 0; ms += t - (seen.get(n) ?? 0); seen.set(n, t); }
  return first ? 0 : ms;
}

/** How many of something a frame, following their measured time to a budget (above). From `unit` a frame, the whole
    of its work it does at the least, and never fewer on a time heard on the page's thread: what was done is heard when
    the frame lets the page hear it, and a stall of the frame is charged to the piece handed over before it (2026-11-19,
    WebKit: pieces of the ground's maps of about 4 ms of the GPU, timed with the frame held, heard as 231 and 0 ms, 461
    and 0, a block of 64 texels as seconds; a pace held to one such piece a frame by them drew a window in minutes).
    Fewer only where the time is the GPU's own (exact: its timestamps, or the frame held): down to one. */
export function pace(unit = 1) {
  const P = {
    n: unit, left: unit, frame: 0, grew: -1, each: 0,   // (each: what one of them took, ms, as the last of them was measured)
    /** A frame begins: as many as the pace says. */
    tick() { P.frame++; P.left = P.n; },
    /** As many as one submission may hold: SUBMIT_MS at what one took last (all it is asked, before any is measured),
        never fewer than `least`, a piece's own least (the ground's maps: a page of texels; the growth map: a
        workgroup's, its frame's unit a whole window): a stall makes pieces smaller. */
    most: (least = 1) => (P.each > 0 ? Math.max(least, Math.floor(SUBMIT_MS / P.each)) : Infinity),
    /** `count` of them took `ms` on the GPU (exact: its own time, not one heard on the page's thread), of `budget` ms a
        frame: as many a frame as fit it. */
    measured(count, ms, budget, exact = false) {
      P.each = ms / count;
      const fit = Math.max(exact ? 1 : unit, Math.floor((budget * count) / ms));
      if (fit < P.n) P.n = fit;
      else if (P.grew !== P.frame) { P.n = Math.min(fit, 2 * P.n); P.grew = P.frame; }   // (more at most once a frame, twice as many at most)
    },
  };
  return P;
}
