// Reeds (Phragmites australis): a clump of common reed standing in a lake's shallows, a man's height and more, its
// plumes over it. Each clump a few cards of its own picture (materials/reedclump.js), standing upright round its foot.
// Built with the tree kit (assets/kit/tree.js): three shapes, each a mesh whose levels are first shares of it. An asset in
// the one recipe (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by the trees' engine in the riverbank's
// reeds (biomes/riverbank.js `reeds`: only in the shallow margin of a lake).
import { tree, builder, cards } from './kit/tree.js';
import { rng } from '../src/core/hash.js';

const woodCol = [0.3, 0.27, 0.15], leafCol = [0.2, 0.26, 0.1];   // (for a picture without the textures)
// the clump, all its cards; S its shape
function grow(S) {
  const b = builder({ ao: (p) => 0.55 + 0.45 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] }), R = rng(S.seed), n = S.cards;
  for (let i = 0; i < n; i++) {
    const a = R() * 2 * Math.PI, d = S.r * Math.sqrt(R()), p = [Math.cos(a) * d, -0.05, Math.sin(a) * d];
    const tilt = 0.12 * R(), ta = R() * 2 * Math.PI, dir = [Math.sin(tilt) * Math.cos(ta), Math.cos(tilt), Math.sin(tilt) * Math.sin(ta)];
    const s = S.h * (0.75 + 0.3 * R());
    cards(b, p, dir, s, [Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3], 0.85, R, p);
  }
  return b;
}

export default tree({
  uid: 'ea2b55d0-a99a-4444-841b-772cc86e10b6',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Reeds',
  kind: 'shrub',
  about: 'A clump of common reed in the shallows, taller than a man, plumed.',
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
  // where it grows (src/scatter/rule.js): the riverbank, in beds, only where it rings a lake (lakes) and only in the
  // shallow margin, from where the water shoals to just up the bank (shore: of the river's half-width from the channel's
  // middle)
  placement: { at: 'scatter', engine: 'trees', biome: '84588b7e-0680-47ca-9793-409c7359db0c' /* riverbank */, cover: 1, lakes: true, shore: [0.42, 1.28], scale: [1, 1.6], lean: 0.08, seed: 880 },
});
