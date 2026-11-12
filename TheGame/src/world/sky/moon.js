// The moon in the sky's dome: its disc, brighter when full and by night. A layer of the dome (src/world/sky.js).
import { vec3, sin, step } from 'three/tsl';
import SKY from '../../../world/sky.js';

export default {
  id: 'moon', order: 20,
  draw({ v, col, D }) {
    col.addAssign(vec3(0.85, 0.87, 0.92).mul(D.dark.mul(0.65).add(0.35)).mul(sin(D.phase.mul(Math.PI)).mul(0.75).add(0.25))
      .mul(step(-0.05, D.moonD.y)).mul(step(Math.cos(SKY.moon.size), v.dot(D.moonD))));
  },
};
