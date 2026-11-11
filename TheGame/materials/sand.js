// Sand: grains, soft ripples, a few pebbles. A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is GLSL: from uv (0..1, tiling) it sets h (height 0..1), col (albedo, linear) and rough (0..1), with the
// noises of the baker (pn, pfbm, pvor, fibre, pebbles: src/materials/bake.js) to hand.
export default {
  id: 'sand',
  name: "Sand",
  kind: 'ground',
  about: "Sand with grains and soft ripples, and a few pebbles.",
  usedBy: "the river banks, the sandy patches of dry land",
  swatch: [0.5, 0.41, 0.26],
  bump: 0.007,   // how deep its relief reads in the normals: larger is flatter
  paint: /* glsl */ `
float warp = pn(uv * 3.0, vec2(3.0), 1u);
float rip = sin(6.2831853 * (uv.x * 7.0 + uv.y * 2.0 + warp * 1.6)) * 0.5 + 0.5;
float g1 = pn(uv * 256.0, vec2(256.0), 2u), g2 = pn(uv * 90.0, vec2(90.0), 3u), soft = pfbm(uv, 5.0, 4u, 4);
float id; float pb = pebbles(uv, 22.0, 5u, 0.14, id);
h = 0.3 + 0.14 * rip + 0.1 * g1 + 0.08 * g2 + 0.1 * soft + pb * 0.3;
col = mix(vec3(0.42, 0.33, 0.20), vec3(0.56, 0.47, 0.31), soft * 0.6 + rip * 0.25 + g2 * 0.15) * (0.85 + 0.3 * g1);
col = mix(col, mix(vec3(0.16, 0.15, 0.14), vec3(0.42, 0.37, 0.30), fract(id * 91.0)), step(0.02, pb));
rough = 0.85;
`,
};
