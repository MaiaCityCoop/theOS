// Path: a dirt path: trodden earth full of pebbles. A material of the world, in the one recipe every material follows (materials/index.js):
// what it is, where the world uses it, how deep its relief is, and how it is painted, once, at the start.
//
// `paint` is GLSL: from uv (0..1, tiling) it sets h (height 0..1), col (albedo, linear) and rough (0..1), with the
// noises of the baker (pn, pfbm, pvor, fibre, pebbles: src/materials/bake.js) to hand.
export default {
  id: 'path',
  name: "Path",
  kind: 'ground',
  about: "Trodden earth full of pebbles of three sizes.",
  usedBy: "paths, bare patches, the outcrops' floor, the library stage",
  swatch: [0.17, 0.12, 0.08],
  bump: 0.016,   // how deep its relief reads in the normals: larger is flatter
  paint: /* glsl */ `
float dirt = pfbm(uv, 7.0, 1u, 5), grain = pn(uv * 180.0, vec2(180.0), 2u);
float i1, i2, i3;
float p1 = pebbles(uv, 13.0, 3u, 0.5, i1), p2 = pebbles(uv, 31.0, 4u, 0.55, i2), p3 = pebbles(uv, 67.0, 5u, 0.6, i3);
float pb = max(p1, max(p2 * 0.6, p3 * 0.3));
float id = p1 >= max(p2 * 0.6, p3 * 0.3) ? i1 : (p2 * 0.6 >= p3 * 0.3 ? i2 : i3);
h = 0.25 + 0.2 * dirt + 0.06 * grain + pb * 0.5;
col = mix(vec3(0.085, 0.058, 0.035), vec3(0.19, 0.135, 0.08), dirt) * (0.85 + 0.3 * grain);
vec3 pc = mix(mix(vec3(0.13, 0.125, 0.12), vec3(0.38, 0.36, 0.33), fract(id * 53.0)), vec3(0.33, 0.24, 0.16), step(0.7, fract(id * 17.0)));
col = mix(col, pc * (0.6 + 0.4 * pb), step(0.03, pb));
rough = 0.9;
`,
};
