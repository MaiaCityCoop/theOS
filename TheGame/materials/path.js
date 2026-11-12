// Path: trodden earth, packed smooth where feet go, loose crumbs and pebbles of three sizes bedded in it (materials/README.md).
import { float, vec3, mix, smoothstep, max } from 'three/tsl';
import { pn, pfbm, pebbles } from '../src/materials/paint.js';
export default {
  uid: '0db6a039-9f7f-4a58-8137-c3348dfb922e',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: "Path",
  kind: 'ground',
  about: "Trodden earth, packed smooth where feet go, with loose crumbs and pebbles of three sizes bedded in it.",
  usedBy: "paths, bare patches, the outcrops' floor, the library stage",
  swatch: [0.17, 0.12, 0.08],
  bump: 0.016,   // how deep its relief reads in the normals: larger is flatter
  paint: (uv) => {
    const dirt = pfbm(uv, 7, 1, 5), grain = pn(uv.mul(180), 180, 2), crumb = pn(uv.mul(75), 75, 6);
    const packed = smoothstep(0.45, 0.65, pfbm(uv, 3, 7, 4));                   // trodden flat and a little paler
    const p1 = pebbles(uv, 13, 3, 0.45, 0.5), p2 = pebbles(uv, 31, 4, 0.5, 0.6), p3 = pebbles(uv, 67, 5, 0.55, 0.7);
    const a2 = p2.x.mul(0.6), a3 = p3.x.mul(0.3), pb = max(p1.x, max(a2, a3)), shade = max(p1.z, max(p2.z.mul(0.7), p3.z.mul(0.4)));
    const id = p1.x.greaterThanEqual(max(a2, a3)).select(p1.y, a2.greaterThanEqual(a3).select(p2.y, p3.y));
    const loose = crumb.mul(float(1).sub(packed)).mul(0.1);
    const h = float(0.25).add(dirt.mul(0.18)).add(grain.mul(0.05)).add(loose).sub(shade.mul(0.04)).add(pb.mul(0.5));
    const c0 = mix(vec3(0.08, 0.055, 0.034), vec3(0.19, 0.135, 0.082), dirt).mul(grain.mul(0.28).add(0.86)).mul(crumb.mul(0.16).add(0.92));
    const c1 = mix(c0, c0.mul(vec3(1.25, 1.22, 1.18)), packed.mul(0.6)).mul(float(1).sub(shade.mul(0.45)));   // packed earth paler, dark where a stone sits
    const pc = mix(mix(vec3(0.12, 0.115, 0.11), vec3(0.4, 0.38, 0.35), id.mul(53).fract()), vec3(0.34, 0.24, 0.15), smoothstep(0.68, 0.72, id.mul(17).fract()));
    const lit = pb.mul(0.45).add(0.55).mul(pn(uv.mul(400), 400, 8).mul(0.2).add(0.9));   // a stone's own speckle and roundness
    return { h, col: mix(c1, pc.mul(lit), smoothstep(0.02, 0.08, pb)), rough: float(0.9) };
  },
};
