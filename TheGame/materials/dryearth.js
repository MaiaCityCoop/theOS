// Dry earth: cracked plates. A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is GLSL: from uv (0..1, tiling) it sets h (height 0..1), col (albedo, linear) and rough (0..1), with the
// noises of the baker (pn, pfbm, pvor, fibre, pebbles: src/materials/bake.js) to hand.
export default {
  id: 'dryearth',
  name: "Dry earth",
  about: "Cracked plates of dry soil, dusty, with fine cracks between the big ones.",
  usedBy: "the terrain where the land is dry",
  swatch: [0.33, 0.25, 0.16],
  bump: 0.014,   // how deep its relief reads in the normals: larger is flatter
  paint: /* glsl */ `
vec2 warp = vec2(pn(uv * 4.0, vec2(4.0), 1u), pn(uv * 4.0, vec2(4.0), 2u)) * 0.5;
vec3 v = pvor(uv * 7.0 + warp, 7.0, 3u); vec3 v2 = pvor(uv * 19.0 + warp * 2.0, 19.0, 4u);
float e1 = v.y - v.x, e2 = v2.y - v2.x;
float crack = 1.0 - smoothstep(0.0, 0.07, e1), fine = (1.0 - smoothstep(0.0, 0.05, e2)) * 0.45;
float dust = pfbm(uv, 8.0, 5u, 5), grain = pn(uv * 200.0, vec2(200.0), 6u);
float cr = max(crack, fine);
h = (1.0 - cr) * (0.62 + 0.12 * smoothstep(0.0, 0.4, e1) + 0.1 * dust) + grain * 0.06;
col = mix(vec3(0.27, 0.20, 0.125), vec3(0.37, 0.29, 0.185), fract(v.z * 7.0)) * (0.8 + 0.4 * dust) * (0.92 + 0.16 * grain);
col = mix(col, vec3(0.07, 0.05, 0.03), cr * 0.9);
rough = 0.9;
`,
};
