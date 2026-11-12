// Meadow floor: dark soil under a thatch of dead and green strands. A material of the world, in the one recipe every material follows (materials/README.md):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is node code (TSL): from uv (0..1, tiling) it returns { h (height 0..1), col (albedo, linear), rough (0..1) },
// painted with the tiling noises of src/materials/paint.js.
import { float, vec2, vec3, mix, smoothstep, step, fract, sin, abs, max, clamp } from 'three/tsl';
import { pn, pfbm, pvor, fibre, pebbles } from '../src/materials/paint.js';
export default {
  uid: 'ae3df398-9f52-4a4a-b54f-a2db2eafb0c8',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Meadow floor",
  kind: 'ground',
  about: "The ground under the grass: dark soil under a thatch of dead and green strands.",
  usedBy: "the terrain where grass grows; the moss on rocks",
  swatch: [0.07, 0.09, 0.04],
  bump: 0.014,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const soil = pfbm(uv, 6, 1, 5), grain = pn(uv.mul(160), 160, 9);
    const a = uv, b = uv.yx, c = vec2(uv.x.add(uv.y), uv.x.sub(uv.y)), d = vec2(uv.x.sub(uv.y), uv.x.add(uv.y)), e = vec2(uv.x.mul(2).add(uv.y), uv.x.sub(uv.y.mul(2)));
    const f1 = fibre(a.mul(vec2(11, 170)), [11, 170], 2), f2 = fibre(b.mul(vec2(13, 150)), [13, 150], 3);
    const f3 = fibre(c.mul(vec2(9, 120)), [9, 120], 4), f4 = fibre(d.mul(vec2(8, 110)), [8, 110], 5), f5 = fibre(e.mul(vec2(6, 70)), [6, 70], 6);
    const fib = max(max(f1, f2), max(max(f3, f4), f5)), tone = pn(uv.mul(5), 5, 7);
    const straw = mix(vec3(0.30, 0.24, 0.11), vec3(0.20, 0.17, 0.09), tone), green = vec3(0.07, 0.13, 0.03);
    const fc = mix(straw, green, step(0.5, fract(f1.mul(3).add(f3.mul(5)).add(f4.mul(7)).add(tone.mul(2)))));
    const h = soil.mul(0.45).add(grain.mul(0.12)).add(fib.mul(0.43));
    const col = mix(mix(vec3(0.035, 0.025, 0.016), vec3(0.085, 0.06, 0.036), soil).mul(grain.mul(0.4).add(0.8)), fc, fib.mul(0.85));
    return { h, col, rough: float(0.95) };
  },
};
