// What a frame did besides drawing, said by whoever did it (did), for the hitch log (src/main.js): a frame that took
// too long is written down with what was done in it (meshes put on the GPU, kilobytes sent, a plot folded), so what
// makes the picture stop can be read from a person's own browser. Numbers by name, summed over the frame.
let WORK = {};
/** In this frame, `n` of `what` was done. */
export const did = (what, n = 1) => { WORK[what] = (WORK[what] || 0) + n; };
/** What the frame did, and begin the next ({}: nothing). */
export const taken = () => { const w = WORK; WORK = {}; return w; };
