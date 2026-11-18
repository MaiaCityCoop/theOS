// Mastic (Pistacia lentiscus): the dense, dark evergreen bush under Mediterranean pines and oaks, a rounded mound to a
// man's height. Grown as one grows (assets/kit/tree.js bush): its stems leave its root crown and branch towards the
// light, and each branch's end is a card of its own leaves (materials/masticleaf.js: compound leaves, paired dark
// glossy leaflets, the youngest bronze), as a fern is laid as its fronds. Two shapes, each a mesh whose levels are first
// shares of it. An asset in the one recipe (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by the
// trees' engine in the pine forest's understory (biomes/pineforest.js `shrubs`), of which it takes its share.
import { tree, builder, bush } from './kit/tree.js';

const woodCol = [0.15, 0.13, 0.11], leafCol = [0.04, 0.075, 0.03];   // (for a picture without the textures)
// the bush: its stems and branches, its branch ends; S its shape. As many cards as the mound it was (56 places, three
// sprigs at each): its levels and their budgets as they were
function grow(S) {
  const b = builder({ ao: (p) => 0.45 + 0.4 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] });
  bush(b, { r: S.r, h: S.h, lobes: S.lobes, shoots: 168, size: [0.4, 0.6], stems: 7, seed: S.seed });
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
  materials: { wood: 'fb5ce908-7437-45b6-879f-154de32d12b9' /* holm oak bark */, leaves: 'caac10dc-f24f-4509-a3b4-7f9c817afd63' /* mastic branch end */ },
  foliage: { wrap: 0.35, through: 0.2, flutter: 0.5 },   // (thick, leathery leaves: little light through them)
  shapes: [{ r: 1.5, h: 1.75, lobes: 3, seed: 611 }, { r: 1.15, h: 1.25, lobes: 2, seed: 612 }],
  grow,
  // where it grows (src/scatter/rule.js): under the pine forest's crowns and between them; light: how thick in deep
  // shade and in the open (it bears shade)
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.8, light: [0.35, 1], scale: [0.4, 1.3], lean: 0, seed: 610 },
});
