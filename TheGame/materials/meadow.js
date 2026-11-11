// Meadow floor: dark soil under a thatch of dead and green strands. A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is GLSL: from uv (0..1, tiling) it sets h (height 0..1), col (albedo, linear) and rough (0..1), with the
// noises of the baker (pn, pfbm, pvor, fibre, pebbles: src/materials/bake.js) to hand.
export default {
  id: 'meadow',
  name: "Meadow floor",
  kind: 'ground',
  about: "The ground under the grass: dark soil under a thatch of dead and green strands.",
  usedBy: "the terrain where grass grows; the moss on rocks",
  swatch: [0.07, 0.09, 0.04],
  bump: 0.014,   // how deep its relief reads in the normals: larger is flatter
  paint: /* glsl */ `
float soil = pfbm(uv, 6.0, 1u, 5), grain = pn(uv * 160.0, vec2(160.0), 9u);
vec2 a = uv, b = uv.yx, c = vec2(uv.x + uv.y, uv.x - uv.y), d = vec2(uv.x - uv.y, uv.x + uv.y), e = vec2(2.0 * uv.x + uv.y, uv.x - 2.0 * uv.y);
float f1 = fibre(a * vec2(11.0, 170.0), vec2(11.0, 170.0), 2u), f2 = fibre(b * vec2(13.0, 150.0), vec2(13.0, 150.0), 3u);
float f3 = fibre(c * vec2(9.0, 120.0), vec2(9.0, 120.0), 4u), f4 = fibre(d * vec2(8.0, 110.0), vec2(8.0, 110.0), 5u);
float f5 = fibre(e * vec2(6.0, 70.0), vec2(6.0, 70.0), 6u);
float fib = max(max(f1, f2), max(max(f3, f4), f5));
float tone = pn(uv * 5.0, vec2(5.0), 7u);
vec3 straw = mix(vec3(0.30, 0.24, 0.11), vec3(0.20, 0.17, 0.09), tone);
vec3 green = vec3(0.07, 0.13, 0.03);
vec3 fc = mix(straw, green, step(0.5, fract(f1 * 3.0 + f3 * 5.0 + f4 * 7.0 + tone * 2.0)));
h = soil * 0.45 + grain * 0.12 + fib * 0.43;
col = mix(mix(vec3(0.035, 0.025, 0.016), vec3(0.085, 0.06, 0.036), soil) * (0.8 + 0.4 * grain), fc, fib * 0.85);
rough = 0.95;
`,
};
