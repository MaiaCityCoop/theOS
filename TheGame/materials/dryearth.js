// Dry earth: cracked plates. A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is node code (TSL): from uv (0..1, tiling) it returns { h (height 0..1), col (albedo, linear), rough (0..1) },
// painted with the tiling noises of src/materials/paint.js.
import { float, vec2, vec3, mix, smoothstep, step, fract, sin, abs, max, clamp } from 'three/tsl';
import { pn, pfbm, pvor, fibre, pebbles } from '../src/materials/paint.js';
export default {
  id: 'dryearth',
  name: "Dry earth",
  kind: 'ground',
  about: "Cracked plates of dry soil, dusty, with fine cracks between the big ones.",
  usedBy: "the terrain where the land is dry",
  swatch: [0.33, 0.25, 0.16],
  bump: 0.014,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const warp = vec2(pn(uv.mul(4), 4, 1), pn(uv.mul(4), 4, 2)).mul(0.5);
    const v = pvor(uv.mul(7).add(warp), 7, 3), v2 = pvor(uv.mul(19).add(warp.mul(2)), 19, 4);
    const e1 = v.y.sub(v.x), e2 = v2.y.sub(v2.x);
    const crack = float(1).sub(smoothstep(0, 0.07, e1)), fine = float(1).sub(smoothstep(0, 0.05, e2)).mul(0.45);
    const dust = pfbm(uv, 8, 5, 5), grain = pn(uv.mul(200), 200, 6), cr = max(crack, fine);
    const h = float(1).sub(cr).mul(float(0.62).add(smoothstep(0, 0.4, e1).mul(0.12)).add(dust.mul(0.1))).add(grain.mul(0.06));
    const c0 = mix(vec3(0.27, 0.20, 0.125), vec3(0.37, 0.29, 0.185), fract(v.z.mul(7))).mul(dust.mul(0.4).add(0.8)).mul(grain.mul(0.16).add(0.92));
    return { h, col: mix(c0, vec3(0.07, 0.05, 0.03), cr.mul(0.9)), rough: float(0.9) };
  },
};
