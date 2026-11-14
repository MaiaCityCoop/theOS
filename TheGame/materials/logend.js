// Pine log end: the sawn face of a log round, pale cream heartwood in tight growth rings, every few years a darker
// band of late wood, the rays running across them, and the saw's own fine scratches over the whole face. What a log
// cut to sit on shows on top (assets/firepit.js), and anything else sawn through (materials/README.md).
import { float, vec2, vec3, mix, smoothstep } from 'three/tsl';
import { pn, pfbm, warp } from '../src/materials/paint.js';
export default {
  uid: '5e888d71-827c-4efc-8d13-50717c7f1dc8',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Pine log end',
  kind: 'wood',
  about: "A log's sawn face: pale cream wood in tight rings, darker late wood between them, rays across, saw marks over it.",
  usedBy: 'the sawn tops of the log rounds round the fire',
  swatch: [0.62, 0.47, 0.3],
  bump: 0.012,   // nearly flat: a sawn face is smooth, its rings read as colour more than relief
  paint: (uv) => {
    // the rings: tight bands that wander, so no two run quite parallel
    const q = uv.add(warp(uv, 5, 31, 0.55)), ring = pn(vec2(q.x.mul(46), q.y.mul(5)), [46, 5], 32);
    const late = smoothstep(0.52, 0.78, ring);   // the late wood: a darker, harder band a year
    const early = mix(vec3(0.72, 0.56, 0.37), vec3(0.58, 0.42, 0.26), pfbm(uv, 7, 33, 3).mul(0.8));
    const wood = mix(early, vec3(0.34, 0.22, 0.13), late.mul(0.8));
    // the rays: fine lines across the rings, where the wood splits when it dries
    const ray = smoothstep(0.78, 0.95, pn(vec2(uv.x.mul(3), uv.y.mul(130)), [3, 130], 34));
    const saw = pn(vec2(uv.x.mul(210), uv.y.mul(9)), [210, 9], 35).mul(0.1).add(0.95);   // the blade's scratches
    const col = mix(wood, vec3(0.26, 0.18, 0.12), ray.mul(0.45)).mul(saw);
    const h = float(0.62).add(late.mul(0.12)).sub(ray.mul(0.2)).add(pn(uv.mul(60), 60, 36).mul(0.05));
    return { h, col, rough: float(0.8).add(late.mul(0.08)) };
  },
};
