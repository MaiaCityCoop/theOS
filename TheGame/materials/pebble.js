// Pebble: worn stone. A material of the world, in the one recipe every material follows (materials/README.md):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is node code (TSL): from uv (0..1, tiling) it returns { h (height 0..1), col (albedo, linear), rough (0..1) },
// painted with the tiling noises of src/materials/paint.js.
import { float, vec2, vec3, mix, smoothstep, step, fract, sin, abs, max, clamp } from 'three/tsl';
import { pn, pfbm, pvor, fibre, pebbles } from '../src/materials/paint.js';
export default {
  uid: 'f4a707ab-dcac-4c3a-a4d6-7a929d0e945e',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Pebble',
  kind: 'stone',
  about: "Stone worn smooth by water and weather: a fine speckled grain, soft clouds of colour, a pale vein now and then; no cracks.",
  usedBy: 'stones',
  swatch: [0.36, 0.34, 0.31],
  bump: 0.09,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const base = pfbm(uv, 3, 31, 5), cloud = pfbm(uv.add(base.mul(0.3)), 2, 35, 3);
    const s1 = pn(uv.mul(210), 210, 32), s2 = pn(uv.mul(120), 120, 33), s3 = pn(uv.mul(340), 340, 36);
    const dark = smoothstep(0.7, 0.78, s1), light = smoothstep(0.74, 0.8, s2);
    const vein = float(1).sub(smoothstep(0, 0.012, abs(sin(uv.x.mul(2).add(uv.y).add(base.mul(0.9)).mul(6.2831853)).mul(0.5)))).mul(smoothstep(0.45, 0.7, cloud));
    const h = float(0.5).add(base.sub(0.5).mul(0.18)).add(s3.mul(0.03)).sub(dark.mul(0.02));
    let col = mix(vec3(0.24, 0.235, 0.22), vec3(0.4, 0.38, 0.34), base).mul(mix(vec3(1, 0.96, 0.9), vec3(0.92, 0.96, 1), cloud)).mul(s3.mul(0.16).add(0.92));
    col = mix(mix(mix(col, vec3(0.09, 0.09, 0.095), dark.mul(0.65)), vec3(0.6, 0.58, 0.54), light.mul(0.5)), vec3(0.72, 0.7, 0.66), vein.mul(0.75));
    return { h, col, rough: float(0.5) };
  },
};
