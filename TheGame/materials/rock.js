// Rock: ridges, strata, cracks, lichen. A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is GLSL: from uv (0..1, tiling) it sets h (height 0..1), col (albedo, linear) and rough (0..1), with the
// noises of the baker (pn, pfbm, pvor, fibre, pebbles: src/materials/bake.js) to hand.
export default {
  id: 'rock',
  name: "Rock",
  kind: 'stone',
  about: "Ridged rock with strata, cracks and lichen.",
  usedBy: "stones and boulders; steep slopes",
  swatch: [0.22, 0.21, 0.2],
  bump: 0.035,   // how deep its relief reads in the normals: larger is flatter
  paint: /* glsl */ `
float rid = 0.0, a = 0.5, per = 4.0;
for (int i = 0; i < 6; i++) { rid += a * (1.0 - abs(2.0 * pn(uv * per, vec2(per), 1u + uint(i)) - 1.0)); per *= 2.0; a *= 0.5; }
float warp = pfbm(uv, 3.0, 9u, 3);
float strata = sin(6.2831853 * (uv.y * 9.0 + warp * 3.0)) * 0.5 + 0.5;
vec3 v = pvor(uv * 5.0 + warp, 5.0, 12u); float crack = 1.0 - smoothstep(0.0, 0.035, v.y - v.x);
float grain = pn(uv * 220.0, vec2(220.0), 13u), lich = smoothstep(0.62, 0.72, pfbm(uv, 9.0, 14u, 3));
h = rid * 0.6 + strata * 0.15 + grain * 0.07 - crack * 0.35 + 0.15;
col = mix(vec3(0.12, 0.115, 0.11), vec3(0.27, 0.26, 0.24), rid) * mix(vec3(1.0, 0.94, 0.86), vec3(0.9, 0.96, 1.0), strata) * (0.85 + 0.3 * grain);
col = mix(col, vec3(0.03), crack * 0.8);
col = mix(col, vec3(0.33, 0.35, 0.22), lich * 0.6);
rough = 0.8;
`,
};
