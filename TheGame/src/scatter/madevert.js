// A made thing's vertex unpacked on the GPU: what assets/kit/made.js packs into one element of the heap (four numbers of
// 32 bits: src/scatter/heap.js), bit for bit the other way.
import { uint, float, vec3, abs, normalize } from 'three/tsl';

const lo = (x) => float(x.bitAnd(uint(0xffff))), hi = (x) => float(x.shiftRight(uint(16)));
const b8 = (x, s) => float(x.shiftRight(uint(s)).bitAnd(uint(255))).div(255);
/** Element e (a uvec4 node) of a made thing whose box is (min, ext) (vec3 nodes: its kind's numbers) as its vertex:
    { position (metres in its own frame, its foot at 0), normal, colour (as its face gave it), part (which of its
    materials the face wears) }. Call it inside the vertex stage: each is a variable. */
export const madeOf = (e, min, ext) => {
  const u = lo(e.w).div(65535).mul(2).sub(1), v = hi(e.w).div(65535).mul(2).sub(1), y = float(1).sub(abs(u)).sub(abs(v)), k = y.negate().max(0);
  const c = (s) => b8(e.z, s).mul(b8(e.z, s)).mul(2);
  return {
    position: vec3(lo(e.x), hi(e.x), lo(e.y)).div(65535).mul(ext).add(min).toVar(),
    normal: normalize(vec3(u.add(u.greaterThanEqual(0).select(k.negate(), k)), y, v.add(v.greaterThanEqual(0).select(k.negate(), k)))).toVar(),
    colour: vec3(c(0), c(8), c(16)).toVar(),
    part: float(e.y.shiftRight(uint(16)).bitAnd(uint(255))).toVar(),
  };
};
