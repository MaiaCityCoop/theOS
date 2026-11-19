// The GPU's pace, measured, not reckoned (intent 0038: it differs a device to the next): what a frame does of a
// piecemeal job (the land's pages laid, src/terrain/pages.js; the tiers' packing visits, src/scatter/tier.js) is held to
// what the GPU does in a share of the frame, by each piece's own time on the GPU.
//
//   ownGpuMs(renderer, submit)   a submission's own time on the GPU, ms, a promise: by the GPU's own clock where it has
//                                one (stampedMs); else heard, a bound: from when it is handed over (submit()), or when
//                                the GPU has done all handed before it, whichever is later, to when it is done (null
//                                where there is no queue to ask: the CPU's stand-in, tools/gpu-mock.js)
//   stampedMs(device, submit)    submit() run with its own GPU time taken by the GPU's own timestamps: a promise of ms;
//                                null where the device has none ('timestamp-query'), submit() not run then. The one
//                                reader of a submission's GPU time: ownGpuMs, and the gate's watch (tools/gate/device.js,
//                                globalThis.__stampedMs; isMark: the clock's own command buffers)
//   frameShare(cls)              the ms a frame what is paced in class cls may take now: the whole frame (FRAME_MS)
//                                behind the veil, its class's share (FRAME_MS_BY_CLASS) once the first view shows
//   pace(unit)                   how many of something a frame: { n, left, tick(), measured(count, ms, budget, exact) }:
//                                a frame begins with tick() (left = n); a piece of `count` of them took `ms` of a
//                                `budget` (ms a frame): fewer at once where they took longer, at most twice as many, once
//                                a frame, where they took less. Never fewer than `unit`, the whole of its work it does at
//                                the least a frame (a piece, a page, a window), on a time heard on the page's thread
//                                (ownGpuMs: a busy frame holds it back, and charges its stall to what was handed over
//                                before it); fewer only on the GPU's own time of it (exact: its timestamps, or the
//                                frame held), down to one
//   passBegins(name)             a pass named `name` begins (src/core/gpu.js mark; null: none): the one before ends, and
//                                its own time on the GPU is added to its name's, as ownGpuMs takes it (from when it
//                                began, or the GPU was done with all handed before, to when it is done)
//   spentSince(reader, names)    what the passes so named have taken on the GPU since this reader last asked (ms; none
//                                the first time): the room a paced pass has left in its class (src/terrain/water.js:
//                                the light's)
//   frameDone()                  the frame's passes are all handed over (src/boot.js, after it draws): a promise of its
//                                own time on the GPU, its passes' together, once they are done (null where there is no
//                                queue to ask): what the governor judges (src/core/governor.js)

import { FRAME_MS, FRAME_MS_BY_CLASS } from './budget.js';
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
// submission's work and one after it (an empty compute pass each, in command buffers of their own about it), resolved
// and read back. Not heard on the page's thread, so a stall of it is not charged to the GPU (2026-11-19: the ground's
// pieces, well under a millisecond each, were heard 231 and 461 ms late, frame after frame) ----
const CLOCK = "the GPU's clock", POOLS = new WeakMap();
/** submit() run with its own time on the GPU taken by the GPU's timestamps: a promise of ms (null where they could not
    be read); null where the device has no 'timestamp-query', and submit() not run. raw: how the clock's own marks are
    handed to the queue (the gate's watch hands its unwatched submit). */
function stampedMs(device, submit, raw = (cbs) => device.queue.submit(cbs)) {
  if (!device?.features?.has('timestamp-query')) return null;
  const free = POOLS.get(device) ?? POOLS.set(device, []).get(device);
  const s = free.pop() ?? { set: device.createQuerySet({ type: 'timestamp', count: 2, label: CLOCK }), res: device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC, label: CLOCK }), out: device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, label: CLOCK }) };
  const mark = (end) => {
    const e = device.createCommandEncoder({ label: CLOCK });
    e.beginComputePass({ label: CLOCK, timestampWrites: end ? { querySet: s.set, endOfPassWriteIndex: 1 } : { querySet: s.set, beginningOfPassWriteIndex: 0 } }).end();
    if (end) { e.resolveQuerySet(s.set, 0, 2, s.res, 0); e.copyBufferToBuffer(s.res, 0, s.out, 0, 16); }
    return e.finish({ label: CLOCK });
  };
  raw([mark(false)]); submit(); raw([mark(true)]);
  return s.out.mapAsync(GPUMapMode.READ).then(() => { const [a, b] = new BigUint64Array(s.out.getMappedRange()); s.out.unmap(); free.push(s); return Math.max(0, Number(b - a) / 1e6); }, () => null);
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
    n: unit, left: unit, frame: 0, grew: -1,
    /** A frame begins: as many as the pace says. */
    tick() { P.frame++; P.left = P.n; },
    /** `count` of them took `ms` on the GPU (exact: its own time, not one heard on the page's thread), of `budget` ms a
        frame: as many a frame as fit it. */
    measured(count, ms, budget, exact = false) {
      const fit = Math.max(exact ? 1 : unit, Math.floor((budget * count) / ms));
      if (fit < P.n) P.n = fit;
      else if (P.grew !== P.frame) { P.n = Math.min(fit, 2 * P.n); P.grew = P.frame; }   // (more at most once a frame, twice as many at most)
    },
  };
  return P;
}
