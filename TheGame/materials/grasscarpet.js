// Grass, from afar: grass seen as a carpet: blades as strokes, light on dark; kept grey, the land tints it. A material of the world, in the one recipe every material follows (materials/README.md):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is node code (TSL): from uv (0..1, tiling) it returns { h (height 0..1), col (albedo, linear), rough (0..1) },
// painted with the tiling noises of src/materials/paint.js.
import { float, vec2, vec3, mix, smoothstep, step, fract, sin, abs, max, clamp } from 'three/tsl';
import { pn, pfbm, pvor, fibre, pebbles } from '../src/materials/paint.js';
export default {
  uid: '9c444204-47c9-4a6f-bfe3-ba8ab5c8e1c4',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Grass, from afar",
  kind: 'grass',
  about: "Grass seen as a carpet: blades as light strokes on dark, kept grey for the land to tint.",
  usedBy: "the terrain's grass far away, where blades are no longer drawn",
  swatch: [0.4, 0.5, 0.32],
  bump: 0.02,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const a = uv, b = uv.yx, c = vec2(uv.x.add(uv.y), uv.x.sub(uv.y)), d = vec2(uv.x.sub(uv.y), uv.x.add(uv.y));
    const e = vec2(uv.x.mul(2).add(uv.y), uv.x.sub(uv.y.mul(2))), f = vec2(uv.x.add(uv.y.mul(2)), uv.x.mul(2).sub(uv.y));
    const S = (q, x, y, s) => smoothstep(0.5, 0.78, pn(q.mul(vec2(x, y)), [x, y], s));
    const s1 = S(a, 22, 190, 2), s2 = S(b, 26, 170, 3), s3 = S(c, 17, 140, 4), s4 = S(d, 15, 130, 5), s5 = S(e, 11, 90, 6), s6 = S(f, 10, 80, 7);
    const top = max(max(s1, s2), max(max(s3, s4), max(s5, s6))), under = s1.add(s2).add(s3).add(s4).add(s5).add(s6).div(6);
    const clump = pfbm(uv, 4, 21, 4), tone = pn(uv.mul(9), 9, 22);
    const h = clamp(float(0.12).add(top.mul(0.5)).add(under.mul(0.5)).add(clump.sub(0.5).mul(0.45)), 0, 1);
    return { h, col: vec3(h.mul(0.62).add(0.12)).mul(mix(vec3(1, 1, 0.82), vec3(0.86, 1, 0.9), tone)), rough: float(0.9) };
  },
};
