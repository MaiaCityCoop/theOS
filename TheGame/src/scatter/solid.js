// A solid's vertex unpacked on the GPU: what assets/kit/solid.js packs into four numbers of 32 bits (an element of the
// heap: src/scatter/heap.js), bit for bit the other way.
import { uint, float, vec3, normalize, abs, max, mix } from 'three/tsl';

const bits = (x, s, m) => x.shiftRight(uint(s)).bitAnd(uint(m));
const oct = (u, v) => { const z = float(1).sub(abs(u)).sub(abs(v)), k = max(z.negate(), 0); return vec3(u.add(u.greaterThanEqual(0).select(k.negate(), k)), v.add(v.greaterThanEqual(0).select(k.negate(), k)), z); };
/** Element e (a uvec4 node) as a vertex, t of the way (0 … 1) to where it lies on the next coarser level's mesh (D: the
    level's delta, assets/kit/ladder.js): { p (its place, in the thing's own frame: its foot at 0, its largest side 1),
    n (its normal), shade (0 … 1), a, b (the two bones that move it: uint), w (how much the second does) }. */
export const solidOf = (e, t, D) => {
  const p = vec3(float(e.x.bitAnd(uint(0xffff))), float(e.x.shiftRight(uint(16))), float(e.y.bitAnd(uint(0xffff)))).div(65535).mul(2).sub(1);
  const n = oct(float(bits(e.y, 16, 511)).sub(255).div(255), float(e.y.shiftRight(uint(25)).bitOr(e.z.bitAnd(uint(3)).shiftLeft(uint(7)))).sub(255).div(255));
  const d = vec3(float(bits(e.z, 8, 1023)), float(bits(e.z, 18, 1023)), float(e.z.shiftRight(uint(28)).bitOr(e.w.bitAnd(uint(63)).shiftLeft(uint(4))))).sub(511).div(511).mul(D);
  const tn = oct(float(bits(e.w, 6, 127)).sub(63).div(63), float(bits(e.w, 13, 127)).sub(63).div(63));
  return { p: p.add(d.mul(t)), n: normalize(mix(n, tn, t)), shade: float(bits(e.z, 2, 63)).div(63), a: bits(e.w, 20, 15), b: bits(e.w, 24, 15), w: float(e.w.shiftRight(uint(28))).div(15) };
};
