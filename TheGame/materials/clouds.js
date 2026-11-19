// Cloud field: the shapes of the sky's cumulus, painted once into a tile the cloud layer reads (src/world/light.js:
// cloudField): heaped masses in red, their finer billows in green (materials/README.md).
import { float, vec3 } from 'three/tsl';
import { pfbm, warp } from '../src/materials/paint.js';
export default {
  uid: '1d8b0f79-8bab-44df-bae4-50f950fe0775',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Cloud field',
  kind: 'noise',
  role: 'billows',   // the part it plays for the engine (src/core/registry.js: byRole)
  about: "The sky's cumulus as a field: heaped masses, and their finer billows, for the cloud layer to read.",
  usedBy: 'the clouds in the sky, and their shadows on the land',
  swatch: [0.8, 0.82, 0.86],
  bump: 0.05,
  paint: (uv) => {
    const q = uv.add(warp(uv, 3, 1, 0.12));                     // heaped, not smeared
    const mass = pfbm(q, 2, 10, 3), billow = pfbm(uv.add(warp(uv, 6, 2, 0.06)), 6, 20, 4);   // masses smooth, the billows carry the fine edge
    return { h: mass, col: vec3(mass, billow, 0.5).mul(vec3(mass, billow, 1)).max(0), rough: float(1) };   // squared: the bake keeps colour as its square root
  },
};
