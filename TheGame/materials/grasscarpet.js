// Grass, from afar: grass seen as a carpet: blades as strokes, light on dark; kept grey, the land tints it. A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is GLSL: from uv (0..1, tiling) it sets h (height 0..1), col (albedo, linear) and rough (0..1), with the
// noises of the baker (pn, pfbm, pvor, fibre, pebbles: src/materials/bake.js) to hand.
export default {
  id: 'grasscarpet',
  name: "Grass, from afar",
  kind: 'grass',
  about: "Grass seen as a carpet: blades as light strokes on dark, kept grey for the land to tint.",
  usedBy: "the terrain's grass far away, where blades are no longer drawn",
  swatch: [0.4, 0.5, 0.32],
  bump: 0.02,   // how deep its relief reads in the normals: larger is flatter
  paint: /* glsl */ `
vec2 a = uv, b = uv.yx, c = vec2(uv.x + uv.y, uv.x - uv.y), d = vec2(uv.x - uv.y, uv.x + uv.y), e = vec2(2.0 * uv.x + uv.y, uv.x - 2.0 * uv.y), f = vec2(uv.x + 2.0 * uv.y, 2.0 * uv.x - uv.y);
float s1 = smoothstep(0.5, 0.78, pn(a * vec2(22.0, 190.0), vec2(22.0, 190.0), 2u)), s2 = smoothstep(0.5, 0.78, pn(b * vec2(26.0, 170.0), vec2(26.0, 170.0), 3u));
float s3 = smoothstep(0.5, 0.78, pn(c * vec2(17.0, 140.0), vec2(17.0, 140.0), 4u)), s4 = smoothstep(0.5, 0.78, pn(d * vec2(15.0, 130.0), vec2(15.0, 130.0), 5u));
float s5 = smoothstep(0.5, 0.78, pn(e * vec2(11.0, 90.0), vec2(11.0, 90.0), 6u)), s6 = smoothstep(0.5, 0.78, pn(f * vec2(10.0, 80.0), vec2(10.0, 80.0), 7u));
float top = max(max(s1, s2), max(max(s3, s4), max(s5, s6))), under = (s1 + s2 + s3 + s4 + s5 + s6) / 6.0;
float clump = pfbm(uv, 4.0, 21u, 4), tone = pn(uv * 9.0, vec2(9.0), 22u);
h = clamp(0.12 + 0.5 * top + 0.5 * under + 0.45 * (clump - 0.5), 0.0, 1.0);
col = vec3(0.12 + 0.62 * h) * mix(vec3(1.0, 1.0, 0.82), vec3(0.86, 1.0, 0.9), tone);
rough = 0.9;
`,
};
