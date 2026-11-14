// Hair: dark brown strands lying side by side down the tile (v), in locks that part and gather, a few lighter strands
// and a few nearly black through it. Worn along a head's surface from the crown down (characters/kit/human.js), so
// its strands fall as hair falls; the highlight along them is the character's shading, not the tile's.
import { float, vec2, vec3, mix, smoothstep, sin } from 'three/tsl';
import { pn, warp } from '../src/materials/paint.js';

export default {
  uid: '60d88699-64f9-4484-9a00-2980f5eeedd5',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Hair',
  kind: 'hair',
  about: 'Dark brown hair: fine strands side by side, gathered into locks that part and cross, lighter and darker strands through them.',
  usedBy: 'the heads of the characters',
  swatch: [0.2, 0.14, 0.1],
  bump: 0.01,
  paint: (uv) => {
    const q = uv.add(vec2(warp(uv, 3, 31, 0.5).x.mul(0.12), 0));   // the locks bend a little as they fall
    const lock = pn(q.mul(vec2(6, 1)), [6, 1], 32).mul(0.6).add(pn(q.mul(vec2(14, 2)), [14, 2], 35).mul(0.4));   // locks: wide stripes along v
    const strand = pn(vec2(q.x.mul(260), q.y.mul(6)), [260, 6], 33), fine = pn(vec2(q.x.mul(700), q.y.mul(10)), [700, 10], 34);
    const groove = sin(q.x.mul(Math.PI * 2 * 9).add(lock.mul(6))).mul(0.5).add(0.5);   // the parting between locks
    const h = lock.mul(0.35).add(groove.mul(0.25)).add(strand.mul(0.28)).add(fine.mul(0.12));
    const light = smoothstep(0.78, 0.95, strand), dark = smoothstep(0.3, 0.05, strand);
    const col = mix(mix(vec3(0.2, 0.135, 0.09), vec3(0.34, 0.24, 0.15), light), vec3(0.08, 0.055, 0.04), dark.add(smoothstep(0.35, 0.05, groove).mul(0.5)).min(1)).mul(float(0.85).add(lock.mul(0.3)));
    return { h, col, rough: float(0.55).add(dark.mul(0.1)) };
  },
};
