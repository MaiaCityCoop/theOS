// Rockrose (Cistus): a low grey-green mound, knee to hip high, where the wood opens. Its own sprig
// (materials/rockroseleaf.js): soft grey-green leaves, a few white flowers.
// Built with the tree kit's mound (assets/kit/tree.js): two shapes, three levels of its own, its farthest the kit's. An
// asset in the one recipe (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by the trees' engine in the pine
// forest's understory (biomes/pineforest.js `shrubs`), of which it takes its share.
import { tree, builder, mound, rng } from './kit/tree.js';
import { mix } from 'three/tsl';
import { gladeAt } from '../biomes/pineforest.js';

const woodCol = [0.2, 0.17, 0.14], leafCol = [0.08, 0.11, 0.07];   // (for a picture without the textures)
// a level of it: q 0 near (its stems, every sprig), 1 further (fewer, larger sprigs), 2 far (a handful); S its shape
function grow(q, S) {
  const b = builder({ ao: (p) => 0.45 + 0.4 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] });
  mound(b, q, { r: S.r, h: S.h, lobes: S.lobes, ragged: 0.25, puffs: [42, 16, 5], count: [2, 2, 1], size: [0.42, 0.8, 1.3], rise: 0.45, stems: 4, R0: rng(S.seed) });
  return b;
}

export default tree({
  uid: '6d38d178-4510-4dcc-8178-eaa461e75367',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Rockrose',
  kind: 'shrub',
  about: 'A cistus: a low, grey-green mound to the knee or the hip, in the glades and at the wood’s edge.',
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'fb5ce908-7437-45b6-879f-154de32d12b9' /* holm oak bark */, leaves: '4cdde33c-5114-41e7-badf-e9f69fcf42f5' /* rockrose sprig */ },
  foliage: { wrap: 0.45, through: 0.25, flutter: 0.6 },
  shapes: [{ r: 1.05, h: 0.9, lobes: 3, seed: 621 }, { r: 0.8, h: 0.65, lobes: 2, seed: 622 }],
  grow,
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, shrub (assets/kinds.js)
  levels: [{ P: 4 }, { P: 8 }, { P: 16 }],
  // (its farthest, one body, darker than its sprigs' tops: a bush is mostly its own shade)
  far: { P: 32, shade: 0.72, speck: false, sides: 4, shoulder: false, trunk: false },
  // where it grows: the pine forest's understory, of which it takes its share
  placement: { at: 'scatter', engine: 'trees', stand: 'shrubs', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, share: 0.25, scale: [0.5, 1.3], lean: 0,
    // (it wants the sun: the glades and the wood's edge)
    where: ({ p }) => mix(0.15, 1, gladeAt(p)), seed: 620 },
});
