// A plant's vertex unpacked on the GPU: what assets/kit/plant.js packs into two elements of the heap (eight numbers of
// 32 bits: src/scatter/heap.js), bit for bit the other way.
import { uint, float, vec2, vec3, normalize, exp2 } from 'three/tsl';
import { lo16 as lo, hi16 as hi, sn8 as b8, octDir } from './unpack.js';
import { GRID, UVK, UV0, GOQ, GO0 } from '../../assets/kit/plant.js';

const oct = (u, v) => normalize(octDir(u, v));
export const SX = (2 * GRID.xz) / 65535, SY = (GRID.y1 - GRID.y0) / 65535;   // (a vertex's place, 16 bits a number over the grid: src/scatter/trees.js and src/scatter/far.js read it too)
/** Elements e0 and e1 (uvec4 nodes) as a plant's vertex: { position (metres in the plant's own frame, its foot at 0),
    normal (what it is lit with), uv, ao, part (0 wood, 1 a sprig's card, 2 a chunk's plane: its clumps),
    twig (1 where its card wears the painting of one twig: its finest level), cn (its card's plane), root (what it
    grows from and shrinks to) }. Call it inside the vertex stage: each is a variable. */
export const plantOf = (e0, e1) => ({
  position: vec3(lo(e0.x).mul(SX).sub(GRID.xz), hi(e0.x).mul(SY).add(GRID.y0), lo(e0.y).mul(SX).sub(GRID.xz)).toVar(),
  normal: oct(b8(e0.y, 16), b8(e0.y, 24)).toVar(),
  uv: vec2(lo(e0.z), hi(e0.z)).div(UVK).sub(UV0).toVar(),
  ao: float(e0.w.bitAnd(uint(255))).div(255).toVar(),
  part: float(e0.w.shiftRight(uint(8)).bitAnd(uint(3))).toVar(),
  twig: float(e0.w.shiftRight(uint(12)).bitAnd(uint(1))).toVar(),
  cn: oct(b8(e0.w, 16), b8(e0.w, 24)).toVar(),
  root: vec3(lo(e1.x).mul(SX).sub(GRID.xz), hi(e1.x).mul(SY).add(GRID.y0), lo(e1.y).mul(SX).sub(GRID.xz)).toVar(),
});

/** A crowd level's vertex: what the rule moves it by, from the elements a plant's vertex is (assets/kit/plant.js), and
    its shape's sixteen numbers (ruleOf). */
export const crowdOfElems = (e0, e1, rule) => ({
  tip: vec3(lo(e1.z).mul(SX).sub(GRID.xz), hi(e1.z).mul(SY).add(GRID.y0), lo(e1.w).mul(SX).sub(GRID.xz)).toVar(),
  go: hi(e1.w).greaterThan(0).select(exp2(hi(e1.w).div(GOQ).sub(GO0)), float(0)).toVar(), rule,   // (metres: the error at which it goes, or its chunk comes)
});
