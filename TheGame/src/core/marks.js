// The marks the game stamps on its own timeline (performance.mark), each once: what everyone who measures a start reads,
// by these names (tools/gate.js paths, tools/gate/ten.js, the cold start's work), so no tool keeps a time of its own.
// Plain JS: the tools import it too.

/** The first frame that draws the world, not the loading veil, its GPU work done (src/boot.js). Its startTime is ms
    from the navigation's start; what was loaded before it is every resource whose responseEnd is at most that. */
export const FIRST_FRAME = 'game:first-frame';
/** The world ready: the veil lifts, the first frame with all it draws made (src/boot.js loadMs, src/core/settle.js
    drawn), stamped as it is (its GPU work not waited for: FIRST_FRAME is). What the gate's Ready reads (tools/gate/
    device.js): the page's own clock, not when a look from outside got an answer from its busy thread. */
export const READY = 'game:ready';

/** `name` stamped once the GPU has done all `renderer` was given so far (at once without WebGPU). */
export const stampDone = (renderer, name) => Promise.resolve(renderer.backend.device?.queue.onSubmittedWorkDone()).then(() => performance.mark(name));
