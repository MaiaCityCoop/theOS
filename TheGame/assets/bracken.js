// Bracken (Pteridium): a fern of the wood's floor, a handful of long fronds arching up and out from one foot. It borrows
// the pine's tuft (a fan of fine strokes) as its frond, tinted a fresh green.
// Built with the tree kit's mound (assets/kit/tree.js): two shapes, two levels of its own, its farthest two the kit's. An
// asset in the one recipe (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by the trees' engine in the pine
// forest's understory (biomes/pineforest.js `shrubs`), of which it takes its share.
import { tree, builder, mound, rng } from './kit/tree.js';

const woodCol = [0.2, 0.15, 0.1], leafCol = [0.07, 0.14, 0.04];   // (for a picture without the textures)
// a level of it: q 0 near (its stems, every sprig), 1 further (fewer, larger sprigs); S its shape
function grow(q, S) {
  const b = builder({ ao: (p) => 0.45 + 0.4 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] });
  mound(b, q, { r: S.r, h: S.h, dome: [0, 0.4], puffs: [10, 7], count: [1, 1], size: [1.35, 1.55], rise: 0.6, R0: rng(S.seed) });
  return b;
}

export default tree({
  uid: 'ad7f7215-acb8-4a37-9287-f32d100b826f',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Bracken',
  kind: 'shrub',
  about: 'A fern of the wood’s floor: a handful of long fronds arching up and out from one foot, fresh green.',
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark */, leaves: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742' /* pine tuft */ },
  foliage: { wrap: 0.5, through: 0.6, flutter: 0.8, tint: [0.9, 1.15, 0.6] },
  shapes: [{ r: 0.2, h: 0.45, seed: 631 }, { r: 0.16, h: 0.35, seed: 632 }],
  grow,
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, shrub (assets/kinds.js)
  levels: [{ P: 4 }, { P: 8 }],
  // (its farthest, one body, darker than its sprigs' tops: a bush is mostly its own shade)
  far: { P: 16, shade: 0.5 },
  // where it grows: the pine forest's understory, of which it takes its share
  placement: { at: 'scatter', engine: 'trees', stand: 'shrubs', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, share: 0.2, scale: [0.7, 1.25], lean: 0, seed: 630 },
});
