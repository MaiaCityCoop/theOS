// Wood ash: what is left in a fire pit the morning after. Fine pale grey powder, almost white where it burned
// hottest, drifted into soft hollows, with black flecks and small broken lumps of charcoal through it. The bed the
// fire sits on (assets/firepit.js).
import { float, vec2, vec3, mix, smoothstep } from 'three/tsl';
import { pn, pfbm, pvor, pebbles } from '../src/materials/paint.js';
export default {
  uid: 'c0092c17-16c9-4470-b98e-b030175d561b',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Wood ash',
  kind: 'ground',
  about: 'A fire pit the morning after: fine pale grey ash drifted into hollows, black flecks and broken charcoal through it.',
  usedBy: 'the bed of the fire pit',
  swatch: [0.52, 0.5, 0.48],
  bump: 0.02,
  paint: (uv) => {
    // the powder: smooth drifts, paler on the heaps and in the hottest middle of a fire
    const drift = pfbm(uv, 4, 51, 4), fine = pn(uv.mul(170), 170, 52);
    const grey = mix(vec3(0.33, 0.32, 0.31), vec3(0.74, 0.73, 0.71), drift.mul(0.75).add(fine.mul(0.25)));
    // charcoal: small lumps sat in it, and the flecks of it ground into the powder
    // (few and small: a bed of ash with lumps sat here and there in it, not a spotted hide; intent 0018)
    const lump = pebbles(uv, 17, 53, 0.11, 0.6), fleck = smoothstep(0.8, 0.9, pvor(uv.mul(90), 90, 54).z);
    const char = smoothstep(0.02, 0.3, lump.x);
    const col = mix(mix(grey, vec3(0.1, 0.095, 0.09), fleck.mul(0.5)), mix(vec3(0.055, 0.05, 0.05), vec3(0.14, 0.12, 0.11), lump.y), char.mul(0.9));
    const h = float(0.5).add(drift.mul(0.2)).add(lump.x.mul(0.3)).add(fine.mul(0.06));
    return { h, col, rough: float(0.96).sub(char.mul(0.14)) };   // the powder dead matt, the charcoal a touch less
  },
};
