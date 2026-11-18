// A thing as every placer packs it, and every make's material reads it: two rows of four, the one contract (intent 0029).
//
//   A = (x, z, its foot's height, its size in metres: what its size on screen is measured by: assets/kinds.js sizeOf)
//   B = (its turn, its kind, its motion, its seed)
//
// Its motion is how far it sways (the stress stand's), the clock of its stride (a mover's), or its sway's phase (a
// plant's); none (0) for what stands still (a rock, a made thing). Its seed is a number 0 … 2π of its own, what one thing
// of a kind may differ by from another (seedOf: 0 … 1). Whoever places, packs this; the drawer (drawer.js) and its
// makes (trees.js, placed.js) read it with what is here.
import { vec3, cos, sin, fract } from 'three/tsl';
import { camDist } from '../world/land.nodes.js';
import { pxAt } from '../detail/measure.js';

/** Its size on screen now, pixels, as the walker's lens sees it (size: metres; xy: where it stands): the measure's. */
export const pxOf = (size, xy) => pxAt(size, camDist(xy));
/** Its turn (yaw, radians) as two node functions: from its own frame into the world's (turn), and back (unturn). */
export const turnOf = (yaw) => {
  const cs = cos(yaw), sn = sin(yaw);
  return { turn: (v) => vec3(v.x.mul(cs).sub(v.z.mul(sn)), v.y, v.x.mul(sn).add(v.z.mul(cs))), unturn: (v) => vec3(v.x.mul(cs).add(v.z.mul(sn)), v.y, v.z.mul(cs).sub(v.x.mul(sn))) };
};
/** Its seed as a number 0 … 1. */
export const seedOf = (B) => fract(B.w.mul(0.1591549));   // (1 / 2π)
