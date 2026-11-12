// Mastic (Pistacia lentiscus): the dense, dark evergreen bush under Mediterranean pines and oaks, a rounded mound to a
// man's height. It borrows the holm oak's sprig (small leathery leaves), lighter and yellower.
// Built with the tree kit's mound (assets/kit/tree.js): two shapes, three levels of its own, its farthest the kit's. An
// asset in the one recipe (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by the trees' engine in the pine
// forest's understory (biomes/pineforest.js `shrubs`), of which it takes its share.
import { tree, builder, mound } from './kit/tree.js';

const woodCol = [0.15, 0.13, 0.11], leafCol = [0.04, 0.075, 0.03];   // (for a picture without the textures)
// a level of it: q 0 near (its stems, every sprig), 1 further (fewer, larger sprigs), 2 far (a handful); S its shape
function grow(q, S) {
  const b = builder({ ao: (p) => 0.45 + 0.4 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] });
  mound(b, q, { r: S.r, h: S.h, lobes: S.lobes, ragged: 0.22, puffs: [56, 19, 6], count: [3, 2, 1], size: [0.5, 0.95, 1.7], rise: 0.3, stems: 6, seed: S.seed });
  return b;
}

export default tree({
  uid: '1f69dea0-43f9-4fc0-9e41-90d76324e265',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Mastic',
  kind: 'shrub',
  about: 'The lentisk of the Mediterranean woods: a dense, rounded evergreen bush to a man’s height, dark and glossy, under the pines and oaks.',
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'fb5ce908-7437-45b6-879f-154de32d12b9' /* holm oak bark */, leaves: 'c4cbd29b-9dd2-494d-913b-9a80c40ab8e6' /* holm oak sprig */ },
  foliage: { wrap: 0.35, through: 0.2, flutter: 0.5, tint: [1.15, 1.25, 0.9] },
  shapes: [{ r: 1.5, h: 1.75, lobes: 3, seed: 611 }, { r: 1.15, h: 1.25, lobes: 2, seed: 612 }],
  grow,
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, shrub (assets/kinds.js)
  levels: [{ P: 4 }, { P: 8 }, { P: 16 }],
  // (its farthest, one body, darker than its sprigs' tops: a bush is mostly its own shade)
  far: { P: 32, shade: 0.72, speck: false, sides: 4, shoulder: false, trunk: false },
  // where it grows: the pine forest's understory, of which it takes its share
  placement: { at: 'scatter', engine: 'trees', stand: 'shrubs', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, share: 0.35, scale: [0.4, 1.3], lean: 0, seed: 610 },
});
