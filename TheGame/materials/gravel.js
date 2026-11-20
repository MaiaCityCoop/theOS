// River gravel: an alpine river's bar, as on the Isar: cobbles rolled round and flat, pale limestone grey and white, some
// blue-grey, beige and rust, packed close, finer gravel and grey silt between (materials/README.md).
import { float, vec3, mix, smoothstep, max } from 'three/tsl';
import { pn, pfbm, pebbles } from '../src/materials/paint.js';

// a stone's colour by its hash: mostly pale limestone, now and then a darker or warmer one
const stoneCol = (id) => {
  const k = id.mul(53).fract(), pale = mix(vec3(0.42, 0.42, 0.4), vec3(0.66, 0.65, 0.61), id.mul(31).fract());
  const odd = mix(mix(vec3(0.24, 0.26, 0.28), vec3(0.5, 0.44, 0.35), smoothstep(0.4, 0.6, id.mul(7).fract())), vec3(0.42, 0.27, 0.18), smoothstep(0.85, 0.9, id.mul(7).fract()));
  return mix(pale, odd, smoothstep(0.72, 0.76, k));
};

export default {
  uid: 'e1da2cdc-1305-4266-b1db-8c0ca473f438',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'River gravel',
  kind: 'ground',
  about: "An alpine river's gravel bar: rounded, flattish cobbles, pale limestone grey and white with a few blue-grey, beige and rust ones, packed close over finer gravel and grey silt.",
  usedBy: "the river's gravel bars",
  swatch: [0.5, 0.49, 0.46],
  bump: 0.018,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const silt = pfbm(uv, 6, 1, 5), grain = pn(uv.mul(300), 300, 2);
    const p1 = pebbles(uv, 9, 3, 0.62, 0.7), p2 = pebbles(uv, 21, 4, 0.75, 0.7), p3 = pebbles(uv, 47, 5, 0.85, 0.6), p4 = pebbles(uv, 110, 6, 0.9, 0.5);
    const a1 = p1.x, a2 = p2.x.mul(0.7), a3 = p3.x.mul(0.45), a4 = p4.x.mul(0.25);
    const top = max(max(a1, a2), max(a3, a4)), shade = max(max(p1.z, p2.z.mul(0.8)), p3.z.mul(0.5));
    const id = a1.greaterThanEqual(max(a2, max(a3, a4))).select(p1.y, a2.greaterThanEqual(max(a3, a4)).select(p2.y, a3.greaterThanEqual(a4).select(p3.y, p4.y)));
    const flat = top.mul(top).mul(0.4).add(top.mul(0.6));                       // flattish: the tops rounded, not domed
    const h = float(0.18).add(silt.mul(0.1)).add(grain.mul(0.04)).sub(shade.mul(0.05)).add(flat.mul(0.6));
    const ground = mix(vec3(0.26, 0.25, 0.22), vec3(0.4, 0.38, 0.34), silt).mul(grain.mul(0.3).add(0.85)).mul(float(1).sub(shade.mul(0.5)));
    const speck = pn(uv.mul(520), 520, 7), dry = smoothstep(0.35, 0.75, pfbm(uv, 3, 8, 3));   // a dry crust of pale silt on some stones
    const sc = mix(stoneCol(id).mul(speck.mul(0.18).add(0.91)).mul(top.mul(0.25).add(0.75)), vec3(0.7, 0.68, 0.63), dry.mul(top).mul(0.25));
    return { h, col: mix(ground, sc, smoothstep(0.03, 0.1, top)), rough: float(0.75) };
  },
};
