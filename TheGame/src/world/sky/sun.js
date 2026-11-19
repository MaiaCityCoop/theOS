// The sun in the sky's dome: the glow round it, strongest when it is low, and its disc. A layer of the dome
// (src/world/sky.js): { id, order, draw({ v, y, s, col, D }) } adds to the dome's colour `col` along the view `v`
// (y: its height; s: how nearly it looks at the sun, 0..1).
import { smoothstep, step } from 'three/tsl';
import { glowAlong } from './dome.js';

export default {
  id: 'sun', order: 10,
  draw({ v, s, col, D }) {
    col.addAssign(glowAlong(v));   // the glow round the sun, strongest low (dome.js: the air's glow too)
    col.addAssign(D.sunL.mul(6).mul(smoothstep(0.99989, 0.99994, s)).mul(step(-0.02, D.sunD.y)));   // the sun's disc
  },
};
