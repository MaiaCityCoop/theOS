// Pebble: worn stone. A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is GLSL: from uv (0..1, tiling) it sets h (height 0..1), col (albedo, linear) and rough (0..1), with the
// noises of the baker (pn, pfbm, pvor, fibre, pebbles: src/materials/bake.js) to hand.
export default {
  id: 'pebble',
  name: 'Pebble',
  kind: 'stone',
  about: "Stone worn smooth by water and weather: a fine speckled grain, soft clouds of colour, a pale vein now and then; no cracks.",
  usedBy: 'stones',
  swatch: [0.36, 0.34, 0.31],
  bump: 0.09,   // how deep its relief reads in the normals: larger is flatter
  paint: /* glsl */ `
float base = pfbm(uv, 3.0, 31u, 5), cloud = pfbm(uv + base * 0.3, 2.0, 35u, 3);
float s1 = pn(uv * 210.0, vec2(210.0), 32u), s2 = pn(uv * 120.0, vec2(120.0), 33u), s3 = pn(uv * 340.0, vec2(340.0), 36u);
float dark = smoothstep(0.7, 0.78, s1), light = smoothstep(0.74, 0.8, s2);
float vein = 1.0 - smoothstep(0.0, 0.012, abs(sin(6.2831853 * (uv.x * 2.0 + uv.y + base * 0.9)) * 0.5));
vein *= smoothstep(0.45, 0.7, cloud);
h = 0.5 + 0.18 * (base - 0.5) + 0.03 * s3 - 0.02 * dark;
col = mix(vec3(0.24, 0.235, 0.22), vec3(0.4, 0.38, 0.34), base) * mix(vec3(1.0, 0.96, 0.9), vec3(0.92, 0.96, 1.0), cloud);
col *= 0.92 + 0.16 * s3;
col = mix(col, vec3(0.09, 0.09, 0.095), dark * 0.65);
col = mix(col, vec3(0.6, 0.58, 0.54), light * 0.5);
col = mix(col, vec3(0.72, 0.7, 0.66), vein * 0.75);
rough = 0.5;
`,
};
