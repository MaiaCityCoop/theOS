// Holm oak bark: a holm oak's trunk (Quercus ilex), dark grey-brown, almost black in the wet, cracked all over into
// small plates about as wide as they are tall, like a lizard's skin, with grey-green crusts of lichen on some
// (materials/README.md). Wrapped round the trees' trunks and limbs (src/scatter/trees.js).
import { float, vec2, vec3, mix, smoothstep } from 'three/tsl';
import { pn, pfbm, pvor, warp } from '../src/materials/paint.js';
export default {
  uid: 'fb5ce908-7437-45b6-879f-154de32d12b9',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Holm oak bark',
  kind: 'bark',
  about: "A holm oak's bark: dark grey-brown, cracked into small squarish plates, lichen on some of them.",
  usedBy: 'the trunks and limbs of the holm oaks',
  swatch: [0.15, 0.135, 0.115],
  bump: 0.035,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    // small plates, about as wide as tall, their edges wandering
    const q = uv.mul(20).add(warp(uv, 6, 2, 1.1)).add(warp(uv, 17, 9, 0.35)), v = pvor(q, 20, 3), edge = v.y.sub(v.x);
    const width = pn(uv.mul(13), 13, 8).mul(0.1).add(0.05), fissure = float(1).sub(smoothstep(width.mul(0.3), width, edge));   // a crack's width changes along it
    const grain = pn(vec2(uv.x.mul(170), uv.y.mul(60)), [170, 60], 6), mott = pfbm(uv, 3, 7, 4), swell = pn(vec2(uv.x.mul(9), uv.y.mul(2)), [9, 2], 11);
    const plate = mix(vec3(0.085, 0.075, 0.065), vec3(0.2, 0.18, 0.155), v.z.mul(0.45).add(mott.mul(0.55))).mul(grain.mul(0.25).add(0.87));
    const lichen = smoothstep(0.62, 0.8, pfbm(uv, 4, 21, 3)).mul(smoothstep(0.1, 0.3, edge));   // grey-green crusts, on the plates' tops
    const top = mix(plate, vec3(0.3, 0.33, 0.27), lichen.mul(0.55));
    const deep = mix(vec3(0.015, 0.013, 0.012), vec3(0.07, 0.06, 0.055), smoothstep(0, 0.1, edge));   // the cracks: black in their depth
    const h = float(0.6).add(v.x.mul(0.25)).add(swell.mul(0.08)).add(grain.mul(0.04)).mul(float(1).sub(fissure.mul(0.8)));
    return { h, col: mix(top, deep, fissure), rough: float(0.92) };
  },
};
