// Sand: wind ripples with a steep side, dark mineral grains gathered in their troughs, a few pebbles (materials/README.md).
import { float, vec3, mix, smoothstep, fract } from 'three/tsl';
import { pn, pfbm, warp, pebbles } from '../src/materials/paint.js';
export default {
  uid: '2f329f07-d2ba-4dc8-a6e3-73053c65e10f',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Sand",
  kind: 'ground',
  about: "Sand in wind ripples with a steep side, dark grains gathered in their troughs, and a few pebbles.",
  usedBy: "the river banks, the sandy patches of dry land",
  swatch: [0.5, 0.41, 0.26],
  bump: 0.007,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const q = uv.add(warp(uv, 3, 1, 0.12)).add(warp(uv, 9, 7, 0.03));             // ripples bend and fork
    const ph = fract(q.x.mul(9).add(q.y.mul(2))), rip = smoothstep(0, 0.78, ph).mul(float(1).sub(smoothstep(0.78, 1, ph)));   // a long gentle back, a short steep face
    const calm = smoothstep(0.2, 0.5, pfbm(uv, 2, 9, 3));                      // the ripples die out here and there
    const g1 = pn(uv.mul(320), 320, 2), g2 = pn(uv.mul(110), 110, 3), soft = pfbm(uv, 5, 4, 4);
    const pb = pebbles(uv, 22, 5, 0.06, 0.5);
    const r = rip.mul(calm);
    const h = float(0.3).add(r.mul(0.34)).add(g1.mul(0.07)).add(g2.mul(0.06)).add(soft.mul(0.1)).add(pb.x.mul(0.3));
    const trough = float(1).sub(smoothstep(0.05, 0.3, rip)).mul(calm);
    const heavy = smoothstep(0.55, 0.75, pn(uv.mul(260), 260, 10)).mul(trough.mul(0.8).add(0.15));   // dark grains, most where the ripple bottoms out
    const c0 = mix(vec3(0.41, 0.32, 0.195), vec3(0.57, 0.48, 0.32), soft.mul(0.5).add(r.mul(0.4)).add(g2.mul(0.15))).mul(g1.mul(0.28).add(0.86));
    const c1 = mix(mix(c0, vec3(0.12, 0.1, 0.08), heavy.mul(0.7)), vec3(0.7, 0.66, 0.58), smoothstep(0.86, 0.92, g1).mul(0.4));   // and a glint of pale quartz
    const c2 = c1.mul(float(1).sub(pb.z.mul(0.3)));
    return { h, col: mix(c2, mix(vec3(0.16, 0.15, 0.14), vec3(0.42, 0.37, 0.3), pb.y.mul(91).fract()), smoothstep(0.02, 0.08, pb.x)), rough: float(0.85) };
  },
};
