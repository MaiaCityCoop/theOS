// The sun in the sky's dome: its disc, as the air lets its light through (the glow round it is the air's own: the sky's
// light, src/world/sky/air.js). A layer of the dome (src/world/sky.js): { id, order, draw({ v, y, s, col, D }) } adds to
// the dome's colour `col` along the view `v` (y: its height; s: how nearly it looks at the sun, 0..1).
import { smoothstep, step } from 'three/tsl';

export default {
  id: 'sun', order: 10,
  draw({ s, col, D }) {
    col.addAssign(D.sunL.mul(smoothstep(0.99989, 0.99994, s)).mul(step(-0.02, D.sunD.y)));   // the sun's disc
  },
};
