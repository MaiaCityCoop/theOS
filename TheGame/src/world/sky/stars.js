// The stars in the sky's dome, each as bright as the night sky's own are: as many over the whole sky as the layer draws
// (its share of the cells a sphere of so many cells' radius crosses, 6π R², the cube's three faces turned to it), each
// fainter one the share of them it ranks among (a magnitude 2.5 log10 of how many are brighter, the brightest Sirius:
// src/world/light/physics.js BRIGHTEST_STAR), its light that share of the sun's (MOON.sun) spread over its spot (a
// smoothstep of 0.22 of a cell: 0.0456 of a cell's square). Worked out only while they can show (D.dark: the sky,
// src/world/sky.js). A layer of the dome.
import { vec3, If, floor, fract, sin, dot, step, smoothstep, max } from 'three/tsl';
import SKY from '../../../world/sky.js';
import { BRIGHTEST_STAR, MOON } from '../light/physics.js';

const h3 = (p) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
const CELLS = SKY.stars.cells, N = SKY.stars.count * 6 * Math.PI * CELLS * CELLS, SPOT = 0.0456 / (CELLS * CELLS);
/** The light of the brightest star drawn, as the code's (per steradian times π): a fainter one's is this over its rank's share. */
export const STAR_MOST = (Math.PI * 10 ** (-0.4 * (BRIGHTEST_STAR - MOON.sun))) / SPOT;

export default {
  id: 'stars', order: 30,
  draw({ v, y, col, D }) {
    If(D.dark.greaterThan(0.5).and(y.greaterThan(0)), () => {
      const c = floor(v.mul(CELLS)), q = fract(v.mul(CELLS)).sub(0.5);
      const star = step(1 - SKY.stars.count, h3(c)).mul(smoothstep(0.22, 0, q.length())).div(max(h3(c.add(7)).mul(N), 1));
      col.addAssign(vec3(0.85, 0.9, 1).mul(star).mul(STAR_MOST).mul(smoothstep(0, 0.15, y)));
    });
  },
};
