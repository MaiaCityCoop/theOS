// The sun in the sky's dome: the glow round it, strongest when it is low, and its disc. A layer of the dome
// (src/world/sky.js): { id, order, draw({ v, y, s, col, D }) } adds to the dome's colour `col` along the view `v`
// (y: its height; s: how nearly it looks at the sun, 0..1).
import { float, max, pow, smoothstep, step } from 'three/tsl';

export default {
  id: 'sun', order: 10,
  draw({ y, s, col, D }) {
    col.addAssign(D.glow.mul(pow(s, 5).mul(0.55).add(pow(s, 48).mul(0.6))).mul(float(1).sub(max(y, 0)).mul(0.4).add(0.6)));   // the glow round the sun, strongest low
    col.addAssign(D.sunL.mul(6).mul(smoothstep(0.99989, 0.99994, s)).mul(step(-0.02, D.sunD.y)));   // the sun's disc
  },
};
