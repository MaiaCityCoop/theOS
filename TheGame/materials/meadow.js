// Meadow floor: dark soil under a thatch of bent strands, dead and green, layer on layer, with leaf litter and moss
// (materials/README.md).
import { float, vec2, vec3, mix, smoothstep, max } from 'three/tsl';
import { pn, pfbm, fibre, warp, pvor } from '../src/materials/paint.js';

// the thatch's layers, bottom to top: a direction (as whole steps along u and v, so it tiles), how long and how thin its
// strands are, how much they bend
const LAYERS = [
  [[1, 0], 7, 150, 0.6], [[0, 1], 9, 140, 0.7], [[1, 1], 6, 120, 0.8], [[1, -1], 6, 115, 0.8],
  [[2, 1], 5, 90, 0.9], [[1, 2], 5, 95, 0.9], [[2, -1], 4, 80, 1], [[1, -2], 4, 85, 1],
];

export default {
  uid: 'ae3df398-9f52-4a4a-b54f-a2db2eafb0c8',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Meadow floor",
  kind: 'ground',
  role: 'moss',   // the part it plays for the engine (src/core/registry.js: byRole)
  about: "The ground under the grass: dark soil under a thatch of bent strands, dead and green, with leaf litter and moss.",
  usedBy: "the terrain where grass grows; the moss on rocks",
  swatch: [0.07, 0.09, 0.04],
  bump: 0.014,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const soil = pfbm(uv, 6, 1, 5), grain = pn(uv.mul(160), 160, 9), green = pfbm(uv, 3, 7, 3);
    const moss = smoothstep(0.55, 0.7, pfbm(uv, 5, 20, 4)).mul(pn(uv.mul(90), 90, 21).mul(0.5).add(0.5));
    let col = mix(mix(vec3(0.03, 0.022, 0.014), vec3(0.08, 0.057, 0.034), soil).mul(grain.mul(0.4).add(0.8)), vec3(0.05, 0.085, 0.025), moss);
    let h = soil.mul(0.3).add(grain.mul(0.08)).add(moss.mul(0.12));
    // leaf litter: small brown flakes in drifts
    const lv = pvor(uv.mul(34).add(warp(uv, 34, 30, 0.8)), 34, 31), leaf = smoothstep(0.32, 0.22, lv.x).mul(smoothstep(0.5, 0.65, pfbm(uv, 4, 32, 3)));
    col = mix(col, mix(vec3(0.16, 0.09, 0.04), vec3(0.28, 0.19, 0.08), lv.z), leaf.mul(0.9)); h = max(h, leaf.mul(0.42));
    LAYERS.forEach(([[a, b], along, across, bend], i) => {
      const q0 = uv.add(warp(uv, 7, 40 + i, bend * 0.06));                     // a strand bends
      const q = vec2(q0.x.mul(a).add(q0.y.mul(b)), q0.x.mul(-b).add(q0.y.mul(a)));
      const f = fibre(q.mul(vec2(along, across)), [along, across], 2 + i), up = (i + 1) / LAYERS.length;
      const tone = pn(q.mul(vec2(along * 2, 3)), [along * 2, 3], 60 + i);     // one strand's colour along it
      const straw = mix(vec3(0.33, 0.27, 0.13), vec3(0.19, 0.15, 0.08), tone), live = mix(vec3(0.06, 0.13, 0.025), vec3(0.11, 0.18, 0.04), tone);
      const c = mix(straw, live, smoothstep(0.4, 0.6, green.add(tone.sub(0.5).mul(0.6)))).mul(0.55 + 0.45 * up);   // the deeper, the darker
      col = mix(col, c, f.mul(0.92)); h = max(h, f.mul(0.35 + 0.55 * up));
    });
    return { h, col, rough: float(0.95) };
  },
};
