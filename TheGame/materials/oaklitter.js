// Oak litter: the floor under holm oaks, their fallen leaves, small and leathery, brown and tan and grey, a few still
// olive, lying every way over dark humus, with twigs, an acorn here and there and a little moss (materials/README.md).
//
// The leaves are not painted one by one: each layer is a grid of cells, a leaf to a cell (where it lies, how it turns,
// its size and its colour from the cell's own hash, the cells wrapping so the tile repeats), and a point looks only at
// the nine cells round it.
import { float, vec2, vec3, mix, smoothstep, max, abs, sin, cos, floor, fract, dot, mod } from 'three/tsl';
import { pn, pfbm, fibre, warp, pebbles } from '../src/materials/paint.js';

const hash = (c, k) => fract(sin(dot(c, vec2(127.1, 311.7)).add(k * 17.3)).mul(43758.5453));   // a cell's own number, 0..1 (k: which)
const LAYERS = [[21, 1], [27, 2], [33, 3]];   // the litter's layers, bottom to top: cells across the tile, the layer's own number

export default {
  uid: 'd269b213-283d-4f8f-92b0-66b57ac2e8b6',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Oak litter',
  kind: 'ground',
  about: "The floor under holm oaks: their small leathery leaves, fallen, brown, tan and grey, a few still olive, over dark humus, with twigs, an acorn here and there and a little moss.",
  usedBy: 'the ground where holm oaks lead in the pine forest',
  swatch: [0.16, 0.11, 0.065],
  bump: 0.02,
  paint: (uv) => {
    const soil = pfbm(uv, 5, 21, 5), grain = pn(uv.mul(180), 180, 22);
    const col = mix(vec3(0.06, 0.045, 0.032), vec3(0.12, 0.085, 0.058), soil).mul(grain.mul(0.3).add(0.85)).toVar(), h = soil.mul(0.2).add(grain.mul(0.04)).toVar();
    // moss in the damp hollows of the humus
    const moss = smoothstep(0.6, 0.76, pfbm(uv, 4, 27, 4));
    col.assign(mix(col, vec3(0.17, 0.23, 0.085).mul(pn(uv.mul(140), 140, 28).mul(0.4).add(0.75)), moss.mul(0.9))); h.addAssign(moss.mul(0.12));
    LAYERS.forEach(([N, s], li) => {
      const q = uv.mul(N).add(warp(uv, 7, 30 + s, 0.7)), cell = floor(q), up = (li + 1) / LAYERS.length;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const c = cell.add(vec2(i, j)), cw = mod(c, N), h1 = hash(cw, s), h2 = hash(cw, s + 5), h3 = hash(cw, s + 9), h4 = hash(cw, s + 13), h5 = hash(cw, s + 17);
        const ang = h3.mul(6.2832), d0 = q.sub(c.add(0.5).add(vec2(h1, h2).sub(0.5).mul(0.9))), d = vec2(d0.x.mul(cos(ang)).add(d0.y.mul(sin(ang))), d0.y.mul(cos(ang)).sub(d0.x.mul(sin(ang))));
        // a pointed oval, narrower to its ends; some cells hold none (the humus and the moss show between)
        const a = h4.mul(0.28).add(0.48), wide = a.mul(0.44).mul(float(1).sub(abs(d.x).div(a).mul(0.5))), e = max(abs(d.x).div(a), abs(d.y).div(wide.max(1e-3)));
        const leaf = float(1).sub(smoothstep(0.84, 1, e)).mul(smoothstep(0.24, 0.28, h5.add(up * 0.08)));
        // brown to tan; one in five long fallen and greyed, one in eight showing its pale felted underside, a few still olive
        const tone = hash(cw, s + 21), kind = hash(cw, s + 25);
        const brown = mix(vec3(0.22, 0.145, 0.085), vec3(0.33, 0.23, 0.125), tone);
        const own = mix(mix(mix(brown, vec3(0.25, 0.225, 0.185), smoothstep(0.76, 0.8, kind)), vec3(0.35, 0.315, 0.245), smoothstep(0.62, 0.66, kind).mul(float(1).sub(smoothstep(0.74, 0.76, kind)))), vec3(0.16, 0.19, 0.08), smoothstep(0.95, 0.97, kind));
        const rib = float(1).sub(smoothstep(0.03, 0.1, abs(d.y).div(wide.max(1e-3)))).mul(0.22).add(1), dome = float(1).sub(e.mul(e).mul(0.3));
        col.assign(mix(col, own.mul(rib).mul(dome).mul(0.55 + 0.45 * up), leaf)); h.assign(max(h, leaf.mul(dome).mul(0.3 + 0.45 * up)));
      }
    });
    // twigs fallen across them, and an acorn here and there
    for (const [[a, b], k] of [[[1, 0], 0], [[1, 2], 1]]) {
      const q0 = uv.add(warp(uv, 6, 50 + k, 0.05)), q = vec2(q0.x.mul(a).add(q0.y.mul(b)), q0.x.mul(-b).add(q0.y.mul(a))), f = fibre(q.mul(vec2(4, 170)), [4, 170], 44 + k).mul(smoothstep(0.55, 0.75, pn(q.mul(vec2(4, 3)), [4, 3], 47 + k)));
      col.assign(mix(col, vec3(0.2, 0.15, 0.1), f.mul(0.9))); h.assign(max(h, f.mul(0.85)));
    }
    const acorn = pebbles(uv, 13, 53, 0.09, 0.25);
    col.assign(mix(col, mix(vec3(0.3, 0.2, 0.1), vec3(0.4, 0.29, 0.15), acorn.y).mul(acorn.x.mul(0.4).add(0.7)), smoothstep(0.1, 0.3, acorn.x))); h.assign(max(h, acorn.x.mul(0.9)));
    return { h, col, rough: float(0.88) };
  },
};
