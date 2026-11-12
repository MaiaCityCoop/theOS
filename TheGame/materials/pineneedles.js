// Pine needles: a stone pine forest's floor, a litter of fallen needles, rusty and grey, over dark earth, with bits of
// bark and the odd cone (materials/README.md).
import { float, vec2, vec3, mix, smoothstep, max } from 'three/tsl';
import { pn, pfbm, fibre, warp, pebbles } from '../src/materials/paint.js';

// the litter's layers, bottom to top: a direction (whole steps, so it tiles), the needles' length and thinness
const LAYERS = [[[1, 0], 14, 260], [[0, 1], 15, 250], [[1, 1], 11, 210], [[1, -1], 11, 200], [[2, 1], 8, 160], [[1, -2], 8, 150]];

export default {
  uid: '795da1c3-9cfe-4c4e-88c7-a58ce86444d4',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Pine needles',
  kind: 'ground',
  about: "A pine forest's floor: fallen needles, rusty, and a greyed brown where they have lain longest, crossing every way over dark earth, with bark flakes and the odd cone.",
  usedBy: 'the floor of the pine forest',
  swatch: [0.3, 0.2, 0.12],
  bump: 0.018,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const soil = pfbm(uv, 5, 1, 5), grain = pn(uv.mul(200), 200, 2), drift = pfbm(uv, 3, 3, 3);
    let col = mix(vec3(0.05, 0.035, 0.022), vec3(0.11, 0.075, 0.045), soil).mul(grain.mul(0.3).add(0.85));
    let h = soil.mul(0.25).add(grain.mul(0.05));
    // bark flakes: small plates of the trees' bark
    const flake = pebbles(uv, 29, 4, 0.18, 0.9);
    col = mix(col.mul(float(1).sub(flake.z.mul(0.3))), mix(vec3(0.2, 0.13, 0.08), vec3(0.3, 0.2, 0.13), flake.y), smoothstep(0.05, 0.2, flake.x)); h = max(h, flake.x.mul(0.35));
    LAYERS.forEach(([[a, b], along, across], i) => {
      const q0 = uv.add(warp(uv, 9, 40 + i, 0.04)), q = vec2(q0.x.mul(a).add(q0.y.mul(b)), q0.x.mul(-b).add(q0.y.mul(a)));
      const f = fibre(q.mul(vec2(along, across)), [along, across], 10 + i), up = (i + 1) / LAYERS.length;
      const tone = pn(q.mul(vec2(along * 2, 4)), [along * 2, 4], 60 + i);
      // rust, and a greyed brown where they have lain longest (as dark as litter is: a forest's floor is not straw)
      const needle = mix(mix(vec3(0.37, 0.2, 0.085), vec3(0.27, 0.155, 0.075), tone), vec3(0.25, 0.215, 0.17), smoothstep(0.6, 0.85, drift.add(tone.mul(0.3))));
      col = mix(col, needle.mul(0.55 + 0.45 * up), f.mul(0.9)); h = max(h, f.mul(0.3 + 0.5 * up));
    });
    // a cone now and then
    const cone = pebbles(uv, 5, 9, 0.22, 0.3);
    col = mix(col, mix(vec3(0.22, 0.13, 0.07), vec3(0.34, 0.21, 0.11), pn(uv.mul(90), 90, 11)).mul(cone.x.mul(0.5).add(0.6)), smoothstep(0.1, 0.25, cone.x)); h = max(h, cone.x.mul(0.8));
    return { h, col, rough: float(0.9) };
  },
};
