// A woodland herb: a low leafy tuft of the floor, ankle to shin high, where light comes through the crowns. Its species
// is its parameters (the site's own are still to be chosen: intent 0038, stage 7); its leaves the rockrose's painting
// (materials/rockroseleaf.js), small. Built with the tree kit's mound (assets/kit/tree.js); the one placement rule places
// it (src/scatter/rule.js).
import { tree, builder, mound } from './kit/tree.js';

const woodCol = [0.2, 0.17, 0.14], leafCol = [0.08, 0.12, 0.06];   // (for a picture without the textures)

export default tree({
  uid: 'e15cd79e-5464-4e62-8a11-94353801ffd8',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Woodland herb',
  kind: 'herb',
  about: 'A low leafy herb of the wood’s floor, ankle to shin high, in the patches of light between the crowns.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'a low herb of Mediterranean woods: a leafy tuft',
    typical: [0.08, 0.3],
    most: 0.45,
    own: ['a leafy tuft 8 to 30 cm high: our own estimate for the herbs of a Mediterranean wood\'s floor, until the site\'s species are chosen'],
  },
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'fb5ce908-7437-45b6-879f-154de32d12b9' /* holm oak bark */, leaves: '4cdde33c-5114-41e7-badf-e9f69fcf42f5' /* rockrose sprig */ },
  foliage: { wrap: 0.5, through: 0.4, flutter: 0.7, tint: [0.95, 1.05, 0.85] },
  shapes: [{ r: 0.2, h: 0.2, lobes: 1, seed: 781 }, { r: 0.16, h: 0.14, lobes: 2, seed: 782 }],
  grow: (S) => { const b = builder({ ao: (p) => 0.5 + 0.4 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] }); mound(b, { r: S.r, h: S.h, lobes: S.lobes, ragged: 0.25, dome: [0.1, 0.9], puffs: [14, 5], count: [1, 1], size: [S.h * 0.8, S.h * 1.2], rise: 0.6, seed: S.seed }); return b; },
  // where it grows (src/scatter/rule.js): the pine forest's floor where the light comes through (light: how thick in
  // deep shade and in the open)
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.25, light: [0.15, 1], scale: [0.7, 1.4], lean: 0, seed: 780 },
});
