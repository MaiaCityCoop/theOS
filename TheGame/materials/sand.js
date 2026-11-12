// Sand: grains, soft ripples, a few pebbles. A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is node code (TSL): from uv (0..1, tiling) it returns { h (height 0..1), col (albedo, linear), rough (0..1) },
// painted with the tiling noises of src/materials/paint.js.
import { float, vec2, vec3, mix, smoothstep, step, fract, sin, abs, max, clamp } from 'three/tsl';
import { pn, pfbm, pvor, fibre, pebbles } from '../src/materials/paint.js';
export default {
  id: 'sand',
  name: "Sand",
  kind: 'ground',
  about: "Sand with grains and soft ripples, and a few pebbles.",
  usedBy: "the river banks, the sandy patches of dry land",
  swatch: [0.5, 0.41, 0.26],
  bump: 0.007,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const warp = pn(uv.mul(3), 3, 1);
    const rip = sin(uv.x.mul(7).add(uv.y.mul(2)).add(warp.mul(1.6)).mul(6.2831853)).mul(0.5).add(0.5);
    const g1 = pn(uv.mul(256), 256, 2), g2 = pn(uv.mul(90), 90, 3), soft = pfbm(uv, 5, 4, 4);
    const pb = pebbles(uv, 22, 5, 0.14);
    const h = float(0.3).add(rip.mul(0.14)).add(g1.mul(0.1)).add(g2.mul(0.08)).add(soft.mul(0.1)).add(pb.x.mul(0.3));
    const c0 = mix(vec3(0.42, 0.33, 0.20), vec3(0.56, 0.47, 0.31), soft.mul(0.6).add(rip.mul(0.25)).add(g2.mul(0.15))).mul(g1.mul(0.3).add(0.85));
    return { h, col: mix(c0, mix(vec3(0.16, 0.15, 0.14), vec3(0.42, 0.37, 0.30), fract(pb.y.mul(91))), step(0.02, pb.x)), rough: float(0.85) };
  },
};
