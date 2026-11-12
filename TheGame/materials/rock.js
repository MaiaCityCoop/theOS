// Rock: ridges, strata, cracks, lichen. A material of the world, in the one recipe every material follows (materials/README.md):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is node code (TSL): from uv (0..1, tiling) it returns { h (height 0..1), col (albedo, linear), rough (0..1) },
// painted with the tiling noises of src/materials/paint.js.
import { float, vec2, vec3, mix, smoothstep, step, fract, sin, abs, max, clamp } from 'three/tsl';
import { pn, pfbm, pvor, fibre, pebbles } from '../src/materials/paint.js';
export default {
  uid: '506c509b-300d-42eb-8403-f3969b06b271',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Rock",
  kind: 'stone',
  about: "Ridged rock with strata, cracks and lichen.",
  usedBy: "stones and boulders; steep slopes",
  swatch: [0.22, 0.21, 0.2],
  bump: 0.035,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    let rid = float(0), a = 0.5, per = 4;
    for (let i = 0; i < 6; i++) { rid = rid.add(float(1).sub(abs(pn(uv.mul(per), per, 1 + i).mul(2).sub(1))).mul(a)); per *= 2; a *= 0.5; }
    const warp = pfbm(uv, 3, 9, 3);
    const strata = sin(uv.y.mul(9).add(warp.mul(3)).mul(6.2831853)).mul(0.5).add(0.5);
    const v = pvor(uv.mul(5).add(warp), 5, 12), crack = float(1).sub(smoothstep(0, 0.035, v.y.sub(v.x)));
    const grain = pn(uv.mul(220), 220, 13), lich = smoothstep(0.62, 0.72, pfbm(uv, 9, 14, 3));
    const h = rid.mul(0.6).add(strata.mul(0.15)).add(grain.mul(0.07)).sub(crack.mul(0.35)).add(0.15);
    const c0 = mix(vec3(0.12, 0.115, 0.11), vec3(0.27, 0.26, 0.24), rid).mul(mix(vec3(1, 0.94, 0.86), vec3(0.9, 0.96, 1), strata)).mul(grain.mul(0.3).add(0.85));
    return { h, col: mix(mix(c0, vec3(0.03), crack.mul(0.8)), vec3(0.33, 0.35, 0.22), lich.mul(0.6)), rough: float(0.8) };
  },
};
