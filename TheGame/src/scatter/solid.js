// A solid's vertex unpacked on the GPU: what assets/kit/solid.js packs into four numbers of 32 bits (an element of the
// heap: src/scatter/heap.js), bit for bit the other way.
import { uint, float, vec3, normalize, mix } from 'three/tsl';
import { bits, octDir as oct } from './unpack.js';

/** Element e (a uvec4 node) as a vertex, t of the way (0 … 1) to where it lies on the next coarser level's mesh (D: the
    level's delta, assets/kit/ladder.js): { p (its place, in the thing's own frame: its foot at 0, its largest side 1),
    at(u) (its place u of the way: where it lay a frame ago, for the prepass), n (its normal), shade (0 … 1), a, b (the
    two bones that move it: uint), w (how much the second does) }. */
export const solidOf = (e, t, D, still = false) => {
  const p = vec3(float(e.x.bitAnd(uint(0xffff))), float(e.x.shiftRight(uint(16))), float(e.y.bitAnd(uint(0xffff)))).div(65535).mul(2).sub(1);
  const n = oct(float(bits(e.y, 16, 511)).sub(255).div(255), float(e.y.shiftRight(uint(25)).bitOr(e.z.bitAnd(uint(3)).shiftLeft(uint(7)))).sub(255).div(255));
  const d = vec3(float(bits(e.z, 8, 1023)), float(bits(e.z, 18, 1023)), float(e.z.shiftRight(uint(28)).bitOr(e.w.bitAnd(uint(63)).shiftLeft(uint(4))))).sub(511).div(511).mul(D);
  // (still: a solid on no skeleton whose levels are a cluster hierarchy, assets/kit/surface.js: its coarse normal as fine as its own,
  // and its coarse shade, where the bones would be: assets/kit/solid.js)
  const tn = still ? oct(float(bits(e.w, 6, 511)).sub(255).div(255), float(bits(e.w, 15, 511)).sub(255).div(255)) : oct(float(bits(e.w, 6, 127)).sub(63).div(63), float(bits(e.w, 13, 127)).sub(63).div(63));
  const shade = float(bits(e.z, 2, 63)).div(63);
  return { p: p.add(d.mul(t)), at: (u) => p.add(d.mul(u)), n: normalize(mix(n, tn, t)), shade: still ? mix(shade, float(bits(e.w, 24, 63)).div(63), t) : shade, a: still ? uint(0) : bits(e.w, 20, 15), b: still ? uint(0) : bits(e.w, 24, 15), w: still ? float(0) : float(e.w.shiftRight(uint(28))).div(15) };
};
