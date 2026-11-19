// Land noise: four cloudy noises (rgb and a), many octaves each: the land's colour variation, with no grid to see (materials/README.md).
import { float, vec3, smoothstep } from 'three/tsl';
import { pfbm } from '../src/materials/paint.js';
export default {
  uid: '8bb6dc3b-4919-4351-b31d-8e9873ae151c',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Land noise",
  kind: 'noise',
  role: 'noise',   // the part it plays for the engine (src/core/registry.js: byRole)
  about: "Four cloudy noises, one per channel, for the land's colour variation with no grid to see.",
  usedBy: "the tint of grass and ground across the land",
  swatch: [0.5, 0.5, 0.5],
  bump: 0.02,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const n = smoothstep(0.3, 0.7, vec3(pfbm(uv, 4, 31, 7), pfbm(uv.add(0.31), 4, 41, 7), pfbm(uv.add(0.67), 4, 51, 7)));
    return { h: smoothstep(0.3, 0.7, pfbm(uv.add(0.13), 4, 61, 7)), col: n.mul(n), rough: float(1) };
  },
};
