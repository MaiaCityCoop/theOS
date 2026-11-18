// Bracken (Pteridium): a fern of the wood's floor, a colony of long fronds arching up and out from a few feet close together. Each frond a
// card of its own picture (materials/brackenfrond.js).
// Built with the tree kit's mound (assets/kit/tree.js): two shapes, each a mesh whose levels are first shares of it. An
// asset in the one recipe (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by the trees' engine in the pine
// forest's understory (biomes/pineforest.js `shrubs`), of which it takes its share.
import { tree, builder, mound } from './kit/tree.js';

const woodCol = [0.2, 0.15, 0.1], leafCol = [0.07, 0.14, 0.04];   // (for a picture without the textures)
// the colony: its base and its fine fronds; S its shape
function grow(S) {
  const b = builder({ ao: (p) => 0.45 + 0.4 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] });
  mound(b, { r: S.r, h: S.h, lobes: S.lobes, ragged: 0.3, dome: [0, 0.5], puffs: [24, 11], count: [1, 1], size: [1.0, 1.0], rise: 0.8, seed: S.seed });
  return b;
}

export default tree({
  uid: 'ad7f7215-acb8-4a37-9287-f32d100b826f',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Bracken',
  kind: 'shrub',
  about: 'A fern of the wood’s floor: a handful of long fronds arching up and out from one foot, fresh green.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'Pteridium aquilinum, bracken',
    typical: [1, 2],
    most: 5,
    source: ['Natural England: fronds mostly 1 to 2 m (one of 4 m recorded); Britannica: to 5 m or more; Oxford Botanic Garden: mature fronds to 3 m'],
  },
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark */, leaves: '6042540e-d4ea-4a07-8bd9-d8465f5635b9' /* bracken frond */ },
  foliage: { wrap: 0.5, through: 0.6, flutter: 0.8 },
  shapes: [{ r: 0.55, h: 0.55, lobes: 4, seed: 631 }, { r: 0.4, h: 0.45, lobes: 3, seed: 632 }],
  grow,
  // where it grows (src/scatter/rule.js): the pine forest's floor, in colonies, most of it where the wood opens and
  // some in the half shade (light: how thick in deep shade and in the open)
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.5, light: [0.3, 1], scale: [0.55, 1.35], lean: 0, seed: 630 },
});
