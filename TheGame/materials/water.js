// Water: ripples (the albedo pass keeps foam in rgb) (materials/README.md).
import { float, vec2, vec3, smoothstep, abs, clamp } from 'three/tsl';
import { pfbm, pvor } from '../src/materials/paint.js';
export default {
  uid: '83e8d1fa-61a3-41fc-a9f1-882ab8be9fbc',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Water",
  kind: 'water',
  about: "Ripples, and foam in the albedo: the river's surface.",
  usedBy: "the river",
  swatch: [0.35, 0.45, 0.5],
  bump: 0.02,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const n1 = pfbm(uv, 5, 1, 4), n2 = pfbm(uv.add(0.37), 11, 2, 3);
    const h = n1.mul(0.6).add(float(1).sub(abs(n2.mul(2).sub(1))).mul(0.4));
    const v = pvor(uv.mul(9).add(vec2(n1, n2).mul(0.8)), 9, 3), v2 = pvor(uv.mul(23), 23, 4);
    const foam = float(1).sub(smoothstep(0, 0.16, v.y.sub(v.x))).mul(0.8).add(float(1).sub(smoothstep(0, 0.2, v2.y.sub(v2.x))).mul(0.5));
    const c = clamp(foam.mul(pfbm(uv, 6, 5, 3).add(0.5)), 0, 1);
    return { h, col: vec3(c.mul(c)), rough: float(0.05) };
  },
};
