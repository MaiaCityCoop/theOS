// A made thing's vertex unpacked on the GPU: what assets/kit/made.js packs into one element of the heap (four numbers of
// 32 bits: src/scatter/heap.js), bit for bit the other way.
import { uint, float, vec3, normalize } from 'three/tsl';
import { lo16 as lo, hi16 as hi, c8, octDir } from './unpack.js';

/** Element e (a uvec4 node) of a made thing whose box is (min, ext) (vec3 nodes: its kind's numbers) as its vertex:
    { position (metres in its own frame, its foot at 0), normal, colour (as its face gave it), part (which of its
    materials the face wears) }. Call it inside the vertex stage: each is a variable. */
export const madeOf = (e, min, ext) => {
  const u = lo(e.w).div(65535).mul(2).sub(1), v = hi(e.w).div(65535).mul(2).sub(1);
  return {
    position: vec3(lo(e.x), hi(e.x), lo(e.y)).div(65535).mul(ext).add(min).toVar(),
    normal: normalize(octDir(u, v)).toVar(),
    colour: vec3(c8(e.z, 0), c8(e.z, 8), c8(e.z, 16)).toVar(),
    part: float(e.y.shiftRight(uint(16)).bitAnd(uint(255))).toVar(),
  };
};
