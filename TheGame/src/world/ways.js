// The ways: the ground kept free for what moves. Who lays ways says where they run (addWays: one answer, as a node
// for the GPU and in JS); who places what stands asks (offWays, onWay) and keeps off them; what moves keeps to its way.
// So nothing stands where things move, and nothing that moves runs into what stands: by how the world is laid out,
// not by looking each frame. How the movers of a way keep clear of each other is its layer's own rule (the stand's:
// a lane a herd, a place in it for each: src/scatter/stress.js).
import { float, max } from 'three/tsl';

const layers = []; let version = 0;
/** Lay ways: { node(p, margin) → 1 where p (a vec2, metres) is on a way or within margin metres of one, else 0 (a
    function node: it may be called where no function is open), at(x, z, margin) → the same in JS, true or false }.
    To be said before anything that places is made (as a module is read: the shaders are put together once). */
export function addWays(layer) { layers.push(layer); }
/** 1 on a way (or within margin metres of one), as a node; null where no ways are laid. */
export const wayAt = (p, margin = 0) => (layers.length ? layers.map((W) => W.node(p, float(margin))).reduce((a, b) => max(a, b)) : null);
/** What may stand at p: k off the ways, nothing on them (k itself where none are laid: the shader is the one it was). */
export const offWays = (k, p, margin = 0) => { const w = wayAt(p, margin); return w ? k.mul(float(1).sub(w)) : k; };
/** The same in JS: whether (x, z) is on a way, or within margin metres of one. */
export const onWay = (x, z, margin = 0) => layers.some((W) => W.at(x, z, margin));
/** The ways have changed (other plots near, new ones laid): what was placed by them is placed again (waysVersion: read by what keeps a placing). */
export const waysChanged = () => ++version;
export const waysVersion = () => version;
