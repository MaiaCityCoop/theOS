// The moon in the sky's dome: its disc, as bright as its phase makes it and the air lets it through (src/world/sky.js).
// A layer of the dome.
import { step } from 'three/tsl';
import SKY from '../../../world/sky.js';

export default {
  id: 'moon', order: 20,
  draw({ v, col, D }) {
    col.addAssign(D.moonL.mul(step(-0.05, D.moonD.y)).mul(step(Math.cos(SKY.moon.size), v.dot(D.moonD))));
  },
};
