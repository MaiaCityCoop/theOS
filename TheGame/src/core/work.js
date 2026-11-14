// What a frame did besides drawing, said by whoever did it (did), for the hitch log (src/main.js): a frame that took
// too long is written down with what was done in it (meshes put on the GPU, kilobytes sent, a plot folded), so what
// makes the picture stop can be read from a person's own browser. Numbers by name, summed over the frame.
let WORK = {};
/** In this frame, `n` of `what` was done. */
export const did = (what, n = 1) => { WORK[what] = (WORK[what] || 0) + n; };
/** Whether the frame so far did more than draw: packed tiers again (beyond the one that is packed every frame), put
    meshes or textures on the GPU, looked what stands near. Such a frame's length says nothing of what its pixels cost. */
export const busy = () => (WORK.packs || 0) > 1 || !!(WORK.meshes || WORK.skins || WORK.scan || WORK.plot);
/** What the frame did, and begin the next ({}: nothing). */
export const taken = () => { const w = WORK; WORK = {}; return w; };
