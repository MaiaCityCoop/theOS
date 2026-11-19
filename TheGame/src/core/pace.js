// The GPU's pace, measured, not reckoned (intent 0038: it differs a device to the next): what a frame does of a
// piecemeal job (the land's pages laid, src/terrain/pages.js; the tiers' packing visits, src/scatter/tier.js) is held to
// what the GPU does in a share of the frame, by each piece's own time on the GPU.
//
//   ownGpuMs(renderer, submit)   a submission's own time on the GPU, ms: from when it is handed over (submit()), or when
//                                the GPU has done all handed before it, whichever is later, to when it is done; a promise
//                                (null where there is no queue to ask: the CPU's stand-in, tools/gpu-mock.js)
//   pace(least)                  how many of something a frame: { n, left, tick(), measured(count, ms, budget) }: a frame
//                                begins with tick() (left = n); a piece of `count` of them took `ms` of a `budget` (ms a
//                                frame): fewer at once where they took longer, at most twice as many, once a frame, where
//                                they took less; never fewer than `least`
//   passBegins(name)             a pass named `name` begins (src/core/gpu.js mark; null: none): the one before ends, and
//                                its own time on the GPU is added to its name's, as ownGpuMs takes it (from when it
//                                began, or the GPU was done with all handed before, to when it is done)
//   spentSince(reader, names)    what the passes so named have taken on the GPU since this reader last asked (ms; none
//                                the first time): the room a paced pass has left in its class (src/terrain/water.js:
//                                the light's)

/** A submission's own time on the GPU (ms, a promise; null without a queue to ask). */
export function ownGpuMs(renderer, submit) {
  const q = renderer.backend?.device?.queue;
  if (!q?.onSubmittedWorkDone) { submit(); return null; }
  const before = q.onSubmittedWorkDone().then(() => performance.now()), t0 = performance.now();
  submit();
  const after = q.onSubmittedWorkDone().then(() => performance.now());
  return Promise.all([before, after]).then(([d0, d1]) => Math.max(1e-3, d1 - Math.max(t0, d0)));
}

// ---- each pass's own time on the GPU, by its marks ----
let QUEUE = null, open = null, doneWas = 0;
const TOTAL = new Map(), READ = new Map();   // (TOTAL: a pass's name -> ms all told; READ: a reader -> what it had seen of them)
/** The device whose queue the passes' times are taken on (src/core/gpu.js useGPU); none: none taken. */
export const timesOn = (device) => { QUEUE = device?.queue?.onSubmittedWorkDone ? device.queue : null; };
/** A pass named `name` begins (null: none): the one before ends; its own time on the GPU added to its name's. */
export function passBegins(name) {
  if (!QUEUE) return;
  const was = open;
  if (was) QUEUE.onSubmittedWorkDone().then(() => { const d = performance.now(); TOTAL.set(was.name, (TOTAL.get(was.name) ?? 0) + Math.max(0, d - Math.max(was.t0, doneWas))); doneWas = d; }, () => {});
  open = name ? { name, t0: performance.now() } : null;
}
/** What the passes named `names` have taken on the GPU since `reader` last asked (ms; none the first time it asks). */
export function spentSince(reader, names) {
  const first = !READ.has(reader); if (first) READ.set(reader, new Map());
  const seen = READ.get(reader); let ms = 0;
  for (const n of names) { const t = TOTAL.get(n) ?? 0; ms += t - (seen.get(n) ?? 0); seen.set(n, t); }
  return first ? 0 : ms;
}

/** How many of something a frame, following their measured time to a budget (above). From `least` a frame. */
export function pace(least = 1) {
  const P = {
    n: least, left: least, frame: 0, grew: -1,
    /** A frame begins: as many as the pace says. */
    tick() { P.frame++; P.left = P.n; },
    /** `count` of them took `ms` on the GPU, of `budget` ms a frame: as many a frame as fit it. */
    measured(count, ms, budget) {
      const fit = Math.max(least, Math.floor((budget * count) / ms));
      if (fit < P.n) P.n = fit;
      else if (P.grew !== P.frame) { P.n = Math.min(fit, 2 * P.n); P.grew = P.frame; }   // (more at most once a frame, twice as many at most)
    },
  };
  return P;
}
