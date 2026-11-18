// A plant's vertex unpacked on the GPU: what assets/kit/plant.js packs into two elements of the heap (eight numbers of
// 32 bits: src/scatter/heap.js), bit for bit the other way.
import { uint, float, vec2, vec3, normalize } from 'three/tsl';
import { lo16 as lo, hi16 as hi, sn8 as b8, octDir } from './unpack.js';
import { GRID, UVK, UV0 } from '../../assets/kit/plant.js';

const oct = (u, v) => normalize(octDir(u, v));
const SX = (2 * GRID.xz) / 65535, SY = (GRID.y1 - GRID.y0) / 65535;
/** Elements e0 and e1 (uvec4 nodes) as a plant's vertex: { position (metres in the plant's own frame, its foot at 0),
    normal (what it is lit with), uv, ao, part (0 wood, 1 a sprig's card, 2 a chunk's plane: its clumps), hand (from, kept),
    twig (1 where its card wears the painting of one twig: its finest level), cn (its card's plane), root (what it
    grows from and shrinks to) }. Call it inside the vertex stage: each is a variable. */
export const plantOf = (e0, e1) => ({
  position: vec3(lo(e0.x).mul(SX).sub(GRID.xz), hi(e0.x).mul(SY).add(GRID.y0), lo(e0.y).mul(SX).sub(GRID.xz)).toVar(),
  normal: oct(b8(e0.y, 16), b8(e0.y, 24)).toVar(),
  uv: vec2(lo(e0.z), hi(e0.z)).div(UVK).sub(UV0).toVar(),
  ao: float(e0.w.bitAnd(uint(255))).div(255).toVar(),
  part: float(e0.w.shiftRight(uint(8)).bitAnd(uint(3))).toVar(),
  hand: vec2(float(e0.w.shiftRight(uint(10)).bitAnd(uint(1))), float(e0.w.shiftRight(uint(11)).bitAnd(uint(1)))).toVar(),
  twig: float(e0.w.shiftRight(uint(12)).bitAnd(uint(1))).toVar(),
  cn: oct(b8(e0.w, 16), b8(e0.w, 24)).toVar(),
  root: vec3(lo(e1.x).mul(SX).sub(GRID.xz), hi(e1.x).mul(SY).add(GRID.y0), lo(e1.y).mul(SX).sub(GRID.xz)).toVar(),
});
