// Land noise: four cloudy noises (rgb and a), many octaves each: the land's colour variation, with no grid to see. A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is GLSL: from uv (0..1, tiling) it sets h (height 0..1), col (albedo, linear) and rough (0..1), with the
// noises of the baker (pn, pfbm, pvor, fibre, pebbles: src/materials/bake.js) to hand.
export default {
  id: 'noise',
  name: "Land noise",
  about: "Four cloudy noises, one per channel, for the land's colour variation with no grid to see.",
  usedBy: "the tint of grass and ground across the land",
  swatch: [0.5, 0.5, 0.5],
  bump: 0.02,   // how deep its relief reads in the normals: larger is flatter
  paint: /* glsl */ `
vec3 n = vec3(pfbm(uv, 4.0, 31u, 7), pfbm(uv + 0.31, 4.0, 41u, 7), pfbm(uv + 0.67, 4.0, 51u, 7));
n = smoothstep(0.3, 0.7, n);
col = n * n; h = smoothstep(0.3, 0.7, pfbm(uv + 0.13, 4.0, 61u, 7)); rough = 1.0;
`,
};
