// The stars in the sky's dome, as the sky darkens (worked out only then). A layer of the dome (src/world/sky.js).
import { vec3, If, floor, fract, sin, dot, step, smoothstep } from 'three/tsl';
import SKY from '../../../world/sky.js';

const h3 = (p) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));

export default {
  id: 'stars', order: 30,
  draw({ v, y, col, D }) {
    If(D.dark.greaterThan(0.01).and(y.greaterThan(0)), () => {
      const c = floor(v.mul(260)), q = fract(v.mul(260)).sub(0.5);
      const star = step(1 - SKY.stars.count, h3(c)).mul(smoothstep(0.22, 0, q.length())).mul(h3(c.add(7)).mul(0.6).add(0.4));
      col.addAssign(vec3(0.85, 0.9, 1).mul(star).mul(SKY.stars.bright).mul(D.dark).mul(smoothstep(0, 0.15, y)));
    });
  },
};
