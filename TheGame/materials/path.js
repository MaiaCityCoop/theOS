// Path: a dirt path: trodden earth full of pebbles. A material of the world, in the one recipe every material follows (materials/README.md):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is node code (TSL): from uv (0..1, tiling) it returns { h (height 0..1), col (albedo, linear), rough (0..1) },
// painted with the tiling noises of src/materials/paint.js.
import { float, vec2, vec3, mix, smoothstep, step, fract, sin, abs, max, clamp } from 'three/tsl';
import { pn, pfbm, pvor, fibre, pebbles } from '../src/materials/paint.js';
export default {
  uid: '0db6a039-9f7f-4a58-8137-c3348dfb922e',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Path",
  kind: 'ground',
  about: "Trodden earth full of pebbles of three sizes.",
  usedBy: "paths, bare patches, the outcrops' floor, the library stage",
  swatch: [0.17, 0.12, 0.08],
  bump: 0.016,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const dirt = pfbm(uv, 7, 1, 5), grain = pn(uv.mul(180), 180, 2);
    const p1 = pebbles(uv, 13, 3, 0.5), p2 = pebbles(uv, 31, 4, 0.55), p3 = pebbles(uv, 67, 5, 0.6);
    const a2 = p2.x.mul(0.6), a3 = p3.x.mul(0.3), pb = max(p1.x, max(a2, a3));
    const id = p1.x.greaterThanEqual(max(a2, a3)).select(p1.y, a2.greaterThanEqual(a3).select(p2.y, p3.y));
    const h = float(0.25).add(dirt.mul(0.2)).add(grain.mul(0.06)).add(pb.mul(0.5));
    const c0 = mix(vec3(0.085, 0.058, 0.035), vec3(0.19, 0.135, 0.08), dirt).mul(grain.mul(0.3).add(0.85));
    const pc = mix(mix(vec3(0.13, 0.125, 0.12), vec3(0.38, 0.36, 0.33), fract(id.mul(53))), vec3(0.33, 0.24, 0.16), step(0.7, fract(id.mul(17))));
    return { h, col: mix(c0, pc.mul(pb.mul(0.4).add(0.6)), step(0.03, pb)), rough: float(0.9) };
  },
};
