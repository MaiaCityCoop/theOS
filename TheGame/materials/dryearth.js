// Dry earth: mud dried into plates that curl up at their edges, split by cracks of every width (materials/README.md).
import { float, vec3, mix, smoothstep, max } from 'three/tsl';
import { pn, pfbm, cracks, pebbles } from '../src/materials/paint.js';
export default {
  uid: '082f0183-5d92-4ac8-821c-14408d3ee056',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Dry earth",
  kind: 'ground',
  about: "Mud dried into plates that curl up at their edges, split by cracks wide and fine, dust and grit over it.",
  usedBy: "the terrain where the land is dry",
  swatch: [0.33, 0.25, 0.16],
  bump: 0.014,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const big = cracks(uv, 6, 3, 0.9), fine = cracks(uv, 17, 4, 1.1), hair = cracks(uv, 41, 7, 1.3);
    const width = pn(uv.mul(23), 23, 8).mul(0.07).add(0.025);                  // a crack's width changes along it
    const crack = float(1).sub(smoothstep(width.mul(0.4), width, big.x));
    const split = float(1).sub(smoothstep(0, 0.035, fine.x)).mul(smoothstep(0.35, 0.6, pn(uv.mul(5), 5, 9)));   // not every plate splits again
    const craze = float(1).sub(smoothstep(0, 0.03, hair.x)).mul(0.5);
    const cr = max(crack, max(split.mul(0.75), craze));
    const curl = smoothstep(0, 0.04, big.x).mul(float(1).sub(smoothstep(0.04, 0.2, big.x)));   // the plate's edge, lifted
    const dust = pfbm(uv, 4, 5, 6), flake = pn(uv.mul(70), 70, 10), grain = pn(uv.mul(240), 240, 6);
    const grit = pebbles(uv, 53, 11, 0.12, 0.6);
    const h = float(0.55).add(curl.mul(0.16)).add(dust.mul(0.12)).add(flake.mul(0.05)).add(grain.mul(0.05)).mul(float(1).sub(cr.mul(0.85))).add(grit.x.mul(0.18));
    const plate = big.y.sub(0.5).mul(0.12).add(1);                             // plates differ only a little in colour
    const c0 = mix(vec3(0.25, 0.185, 0.115), vec3(0.39, 0.305, 0.2), dust).mul(plate).mul(flake.mul(0.14).add(0.93)).mul(grain.mul(0.16).add(0.92));
    const c1 = mix(c0, vec3(0.45, 0.38, 0.28), curl.mul(0.35).add(smoothstep(0.62, 0.8, dust).mul(0.3)));   // dust pale on the lifted rims and in drifts
    const inCrack = mix(vec3(0.055, 0.04, 0.026), vec3(0.16, 0.12, 0.08), smoothstep(0.5, 0.75, pn(uv.mul(31), 31, 12)));   // some cracks silted up
    const c2 = mix(mix(c1, c1.mul(0.6), grit.z.mul(0.5)), mix(vec3(0.2, 0.17, 0.14), vec3(0.4, 0.36, 0.3), grit.y), smoothstep(0.02, 0.1, grit.x));
    return { h, col: mix(c2, inCrack, cr.mul(0.92)), rough: float(0.92) };
  },
};
