// Pine bark: a stone pine's trunk, thick plates of reddish bark, tall and narrow, split by deep grey-brown fissures, the
// plates flaking in layers (materials/README.md). Wrapped round the trees' trunks and limbs (src/scatter/trees.js).
import { float, vec2, vec3, mix, smoothstep, max } from 'three/tsl';
import { pn, pfbm, pvor, warp } from '../src/materials/paint.js';
export default {
  uid: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Pine bark',
  kind: 'bark',
  about: "A stone pine's bark: thick reddish plates, tall and narrow, split by deep grey-brown fissures, flaking in layers.",
  usedBy: 'the trunks and limbs of the stone pines',
  swatch: [0.36, 0.2, 0.12],
  bump: 0.03,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    // plates: cells three times taller than wide (fewer of them up the tile), their edges wandering
    const q = vec2(uv.x.mul(7), uv.y.mul(2.5)).add(warp(uv, 5, 2, 0.9)).add(warp(uv, 13, 9, 0.3)), v = pvor(q, [7, 2.5], 3), edge = v.y.sub(v.x);   // wandering, uneven plates
    const width = pn(vec2(uv.x.mul(11), uv.y.mul(5)), [11, 5], 8).mul(0.14).add(0.04), fissure = float(1).sub(smoothstep(width.mul(0.3), width, edge));   // a fissure's width changes along it
    const layers = pn(vec2(uv.x.mul(24), uv.y.mul(9)), [24, 9], 5), flake = smoothstep(0.55, 0.75, layers);   // the plate's top layer, peeled in places
    const grain = pn(vec2(uv.x.mul(160), uv.y.mul(40)), [160, 40], 6), mott = pfbm(uv, 3, 7, 4);
    const plate = mix(vec3(0.24, 0.12, 0.07), vec3(0.36, 0.2, 0.12), v.z.mul(0.5).add(mott.mul(0.5))).mul(mix(vec3(1), vec3(0.85, 0.85, 0.88), smoothstep(0.55, 0.8, mott))).mul(flake.mul(0.18).add(0.88)).mul(grain.mul(0.2).add(0.9));
    const under = mix(vec3(0.42, 0.2, 0.09), vec3(0.52, 0.28, 0.13), grain);   // where the top layer has come off: fresher, more orange
    const deep = mix(vec3(0.035, 0.03, 0.028), vec3(0.15, 0.13, 0.12), smoothstep(0.0, 0.12, edge));   // the fissures: grey, black in their depth
    const col = mix(mix(plate, under, flake.mul(smoothstep(0.2, 0.5, edge)).mul(0.6)), deep, fissure);
    const h = float(0.65).add(v.x.mul(0.2)).add(flake.mul(0.06)).add(grain.mul(0.04)).mul(float(1).sub(fissure.mul(0.85)));
    return { h, col, rough: float(0.9) };
  },
};
