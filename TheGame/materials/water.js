// Water: ripples (the albedo pass keeps foam in rgb). A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is GLSL: from uv (0..1, tiling) it sets h (height 0..1), col (albedo, linear) and rough (0..1), with the
// noises of the baker (pn, pfbm, pvor, fibre, pebbles: src/materials/bake.js) to hand.
export default {
  id: 'water',
  name: "Water",
  about: "Ripples, and foam in the albedo: the river's surface.",
  usedBy: "the river",
  swatch: [0.35, 0.45, 0.5],
  bump: 0.02,   // how deep its relief reads in the normals: larger is flatter
  paint: /* glsl */ `
float n1 = pfbm(uv, 5.0, 1u, 4), n2 = pfbm(uv + 0.37, 11.0, 2u, 3);
h = n1 * 0.6 + (1.0 - abs(2.0 * n2 - 1.0)) * 0.4;
vec3 v = pvor(uv * 9.0 + vec2(n1, n2) * 0.8, 9.0, 3u); vec3 v2 = pvor(uv * 23.0, 23.0, 4u);
float foam = (1.0 - smoothstep(0.0, 0.16, v.y - v.x)) * 0.8 + (1.0 - smoothstep(0.0, 0.2, v2.y - v2.x)) * 0.5;
col = vec3(clamp(foam * (0.5 + pfbm(uv, 6.0, 5u, 3)), 0.0, 1.0)); col *= col;
rough = 0.05;
`,
};
