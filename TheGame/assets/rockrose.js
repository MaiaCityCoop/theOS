// Rockrose (Cistus): a low grey-green mound, knee to hip high, where the wood opens. Grown as one grows
// (assets/kit/tree.js bush): many stems from its foot, branching close and low, each branch's end a card of its own
// sprig (materials/rockroseleaf.js: soft grey-green leaves, a few white flowers). Two shapes, each a mesh whose levels
// are first shares of it. An asset in the one recipe (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by
// the trees' engine in the pine forest's understory (biomes/pineforest.js `shrubs`), of which it takes its share.
import { tree, builder, bush } from './kit/tree.js';
import FAN from '../materials/holmoakleaf.twigs.js';

const woodCol = [0.2, 0.17, 0.14], leafCol = [0.08, 0.11, 0.07];   // (for a picture without the textures)
// the bush: its stems and branches, its branch ends; S its shape. As many cards as the mound it was (42 places, two
// sprigs at each): its levels and their budgets as they were
function grow(S) {
  const b = builder({ ao: (p) => 0.45 + 0.4 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] });
  bush(b, { r: S.r, h: S.h, lobes: S.lobes, ragged: 0.2, shoots: 84, size: [0.34, 0.46], stems: 9, rise: 0.45, seed: S.seed });
  return b;
}

export default tree({
  uid: '6d38d178-4510-4dcc-8178-eaa461e75367',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Rockrose',
  kind: 'shrub',
  about: 'A low grey-green mound, knee to hip high, at the edge of the wood.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'Cistus salviifolius, the sage-leaved rockrose: low, grey-green, white-flowered',
    typical: [0.3, 1],
    most: 1,
    source: ['RHS (Cistus salviifolius): ultimate height 0.5 to 1 m; Easyscape: 0.3 to 0.6 m, now and then 1 m'],
  },
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'fb5ce908-7437-45b6-879f-154de32d12b9' /* holm oak bark */, leaves: '4cdde33c-5114-41e7-badf-e9f69fcf42f5' /* rockrose sprig */ },
  foliage: { wrap: 0.45, through: 0.25, flutter: 0.6 },
  // its finest laid out as its sprigs' twigs, each a card of one twig (assets/kit/tree.js splayOf), as a holm oak's is:
  // seen close, a cluster with depth, not two crossed pictures (its sprig's fan the holm oak sprig's: rockroseleaf.js)
  fine: { sprig: FAN, twig: '82945b8b-cc3f-48e4-8843-01708f2ecf82' /* rockrose twig */ },
  shapes: [{ r: 1.05, h: 0.9, lobes: 3, seed: 621 }, { r: 0.8, h: 0.65, lobes: 2, seed: 622 }],
  grow,
  // where it grows (src/scatter/rule.js): the pine forest, where the sun reaches the ground (light: how thick in deep
  // shade and in the open): the glades and the wood's edge
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.15, light: [0.08, 1], scale: [0.45, 0.85], lean: 0, seed: 620 },
});
