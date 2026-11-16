// Reeds (Phragmites australis): a clump of common reed standing in a lake's shallows, a man's height and more, its
// plumes over it. Each clump a few cards of its own picture (materials/reedclump.js), standing upright round its foot.
// Built with the tree kit (assets/kit/tree.js): three shapes, two levels of its own, its farthest the kit's. An asset in
// the one recipe (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by the trees' engine in the riverbank's
// reeds (biomes/riverbank.js `reeds`: only in the shallow margin of a lake).
import { tree, builder, cards } from './kit/tree.js';
import { rng } from '../src/core/hash.js';

const woodCol = [0.3, 0.27, 0.15], leafCol = [0.2, 0.26, 0.1];   // (for a picture without the textures)
// a level of it: q 0 near (all its cards), 1 further (half of them, each larger); S its shape
function grow(q, S) {
  const b = builder({ ao: (p) => 0.55 + 0.45 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] }), R = rng(S.seed), n = q ? Math.ceil(S.cards / 2) : S.cards;
  for (let i = 0; i < n; i++) {
    const a = R() * 2 * Math.PI, d = S.r * Math.sqrt(R()), p = [Math.cos(a) * d, -0.05, Math.sin(a) * d];
    const tilt = 0.12 * R(), ta = R() * 2 * Math.PI, dir = [Math.sin(tilt) * Math.cos(ta), Math.cos(tilt), Math.sin(tilt) * Math.sin(ta)];
    const s = S.h * (0.75 + 0.3 * R()) * (q ? 1.12 : 1);
    cards(b, p, dir, s, [Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3], 0.85, R, p);
  }
  return b;
}

export default tree({
  uid: 'ea2b55d0-a99a-4444-841b-772cc86e10b6',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Reeds',
  kind: 'shrub',
  about: "A clump of common reed in a lake's shallows: tall narrow leaves and stems a man's height and more, feathery plumes over them.",
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'Phragmites australis, common reed',
    typical: [2, 4],
    most: 6,
    source: ['RHS (Phragmites australis): 2.5 to 4 m; Wikipedia: stems 2 to 6 m, the tallest where summers are hot; native stands lower than the invasive (Invasive Species Centre, Ontario: to 5 m)'],
  },
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark */, leaves: '307376d9-da36-4388-8c5a-8cfb308ee312' /* reed clump */ },
  foliage: { wrap: 0.5, through: 0.7, flutter: 1.2 },
  wind: { sway: 0.35 },   // (tall and thin: the wind bends a reed bed in waves)
  shapes: [{ r: 0.35, h: 2.1, cards: 5, seed: 881 }, { r: 0.25, h: 1.7, cards: 4, seed: 882 }, { r: 0.45, h: 2.4, cards: 6, seed: 883 }],
  grow,
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, shrub (assets/kinds.js)
  levels: [{ P: 4, most: [52, 26] }, { P: 8, most: [28, 14] }],   // most: the most vertices and triangles a shape of it has there (its place in the heap)
  far: { P: 32, shade: 0.9, speck: false, sides: 5, shoulder: false, trunk: false },
  // where it grows: the riverbank's reeds (only in a lake's shallow margin), all of its cells
  placement: { at: 'scatter', engine: 'trees', stand: 'reeds', biome: '84588b7e-0680-47ca-9793-409c7359db0c' /* riverbank */, share: 1, scale: [1, 1.6], lean: 0.08, seed: 880 },
});
