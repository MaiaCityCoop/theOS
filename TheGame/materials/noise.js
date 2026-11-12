// Land noise: four cloudy noises (rgb and a), many octaves each: the land's colour variation, with no grid to see. A material of the world, in the one recipe every material follows (materials/README.md):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is node code (TSL): from uv (0..1, tiling) it returns { h (height 0..1), col (albedo, linear), rough (0..1) },
// painted with the tiling noises of src/materials/paint.js.
import { float, vec2, vec3, mix, smoothstep, step, fract, sin, abs, max, clamp } from 'three/tsl';
import { pn, pfbm, pvor, fibre, pebbles } from '../src/materials/paint.js';
export default {
  uid: '8bb6dc3b-4919-4351-b31d-8e9873ae151c',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Land noise",
  kind: 'noise',
  about: "Four cloudy noises, one per channel, for the land's colour variation with no grid to see.",
  usedBy: "the tint of grass and ground across the land",
  swatch: [0.5, 0.5, 0.5],
  bump: 0.02,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const n = smoothstep(0.3, 0.7, vec3(pfbm(uv, 4, 31, 7), pfbm(uv.add(0.31), 4, 41, 7), pfbm(uv.add(0.67), 4, 51, 7)));
    return { h: smoothstep(0.3, 0.7, pfbm(uv.add(0.13), 4, 61, 7)), col: n.mul(n), rough: float(1) };
  },
};
