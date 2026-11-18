// Mastic (Pistacia lentiscus): the dense, dark evergreen bush under Mediterranean pines and oaks, a rounded mound to a
// man's height. It borrows the holm oak's sprig (small leathery leaves), lighter and yellower.
// Built with the tree kit's mound (assets/kit/tree.js): two shapes, each a mesh whose levels are first shares of it. An
// asset in the one recipe (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by the trees' engine in the pine
// forest's understory (biomes/pineforest.js `shrubs`), of which it takes its share.
import { tree, builder, mound } from './kit/tree.js';

const woodCol = [0.15, 0.13, 0.11], leafCol = [0.04, 0.075, 0.03];   // (for a picture without the textures)
// the bush: its stems, its base and its fine sprigs; S its shape
function grow(S) {
  const b = builder({ ao: (p) => 0.45 + 0.4 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] });
  mound(b, { r: S.r, h: S.h, lobes: S.lobes, ragged: 0.22, puffs: [56, 22], count: [3, 1], size: [0.5, 1.15], rise: 0.3, stems: 6, seed: S.seed });
  return b;
}

export default tree({
  uid: '1f69dea0-43f9-4fc0-9e41-90d76324e265',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Mastic',
  kind: 'shrub',
  about: 'A dense, rounded evergreen bush, head-high, dark and glossy.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'Pistacia lentiscus, mastic',
    typical: [1, 4],
    most: 8,
    source: ['RHS (Pistacia lentiscus): 2.5 to 4 m; Wikipedia: up to 4 m; Plants For A Future: 5 m; Stihl\'s tree profiles: 1 to 8 m, as a small tree'],
  },
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'fb5ce908-7437-45b6-879f-154de32d12b9' /* holm oak bark */, leaves: 'c4cbd29b-9dd2-494d-913b-9a80c40ab8e6' /* holm oak sprig */ },
  foliage: { wrap: 0.35, through: 0.2, flutter: 0.5, tint: [1.15, 1.25, 0.9] },
  shapes: [{ r: 1.5, h: 1.75, lobes: 3, seed: 611 }, { r: 1.15, h: 1.25, lobes: 2, seed: 612 }],
  grow,
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, shrub (assets/kinds.js)
  levels: [{ P: 4 }, { P: 8 }],
  far: { P: 32, speck: false },   // (its far level: its clumps and its impostor, no speck after it)
  // where it grows: the pine forest's understory, of which it takes its share
  placement: { at: 'scatter', engine: 'trees', stand: 'shrubs', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, share: 0.35, scale: [0.4, 1.3], lean: 0, seed: 610 },
});
