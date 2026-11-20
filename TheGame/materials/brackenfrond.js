// Bracken frond: one card of a fern, painted once: a single frond from its foot to its tip, its stalk up the middle,
// its leaflets in pairs either side, longest a third of the way up and shorter to the tip, each rising as it goes out
// and cut into lobes. Not a tiling texture: the card's whole picture, its height the cut-out (src/scatter/trees.js).
import { float, vec3, mix, smoothstep, max, abs, sin, pow, clamp, floor, step, fract } from 'three/tsl';
import { pn } from '../src/materials/paint.js';

const N = 17;   // pairs of leaflets up the frond

export default {
  uid: '6042540e-d4ea-4a07-8bd9-d8465f5635b9',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Bracken frond',
  kind: 'foliage',
  about: 'A fern\'s frond: its stalk, and leaflets in pairs either side, cut into lobes, a fresh green, lighter along their ribs and at their tips: one foliage card.',
  usedBy: 'the bracken of the wood (a cut-out card)',
  swatch: [0.1, 0.18, 0.05],
  bump: 0.05,
  paint: (uv) => {
    // the frond bows a little to one side as it rises; its outline: widest a third up, to a point
    const y = uv.y, x = uv.x.sub(0.5).sub(y.mul(y).mul(0.07)), ax = abs(x);
    const reach = (t) => pow(sin(pow(clamp(t, 0, 1), 0.6).mul(Math.PI)), 0.8).mul(0.44);
    // (where nothing is drawn the card is fern green too: a far-off card's texels are means of their neighbours)
    const alpha = float(0).toVar(), col = vec3(0.09, 0.16, 0.05).toVar(), k0 = floor(y.mul(N));
    for (let i = -3; i <= 0; i++) {   // a leaflet rises as it goes out: a point may lie on one rooted lower down
      const k = k0.add(i), yk = k.add(0.5).div(N), W = reach(yk).max(1e-3), along = ax.div(W);
      const d = y.sub(yk).sub(ax.mul(0.5)), tone = fract(sin(k.mul(12.9898)).mul(43758.5453)).mul(0.3).add(0.8);
      const lobes = abs(sin(ax.mul(N * 7.5))).mul(0.4).add(0.6), half = float(0.46 / N).mul(float(1).sub(pow(along, 1.6))).mul(lobes);
      const leaf = float(1).sub(smoothstep(half.mul(0.55), half, abs(d))).mul(step(along, 1)).mul(step(0, k)).mul(smoothstep(0.03, 0.09, yk));
      const rib = float(1).sub(smoothstep(0.0015, 0.004, abs(d)));
      const green = mix(vec3(0.075, 0.145, 0.04), vec3(0.125, 0.215, 0.06), smoothstep(0.2, 1, along)).mul(tone);
      col.assign(mix(col, mix(green, vec3(0.16, 0.24, 0.09), rib.mul(0.6)), leaf)); alpha.assign(max(alpha, leaf));
    }
    const stalk = float(1).sub(smoothstep(0.004, 0.009, ax.div(float(1.15).sub(y)))).mul(step(y, 0.97));
    col.assign(mix(col, vec3(0.17, 0.2, 0.08), stalk)); alpha.assign(max(alpha, stalk));
    return { h: clamp(alpha, 0, 1), col: col.mul(pn(uv.mul(52), 52, 31).mul(0.2).add(0.9)), rough: float(0.6) };
  },
};
