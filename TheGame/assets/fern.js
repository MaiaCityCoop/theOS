// A small fern of the wood's floor: a tuft of fronds a hand to a knee high, in the half shade among stones, roots and
// fallen wood. Its species is its parameters (the site's own is still to be chosen: intent 0038, stage 7); its frond the
// bracken's painting (materials/brackenfrond.js), smaller. Built with the tree kit's mound (assets/kit/tree.js); the one
// placement rule places it (src/scatter/rule.js).
import { tree, builder, mound } from './kit/tree.js';

const woodCol = [0.2, 0.15, 0.1], leafCol = [0.07, 0.14, 0.04];   // (for a picture without the textures)

export default tree({
  uid: '88061345-bd51-4b57-b741-dfb987754e08',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Fern',
  kind: 'herb',
  about: 'A small fern of the wood’s floor: a tuft of arching fronds a hand to a knee high, in the half shade.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'a small woodland fern (a polypody, a spleenwort): a tuft of fronds',
    typical: [0.15, 0.45],
    most: 0.6,
    own: ['a tuft of fronds 15 to 45 cm high: our own estimate for a small fern of Mediterranean woods, until the site\'s species are chosen'],
  },
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark */, leaves: '6042540e-d4ea-4a07-8bd9-d8465f5635b9' /* bracken frond */ },
  foliage: { wrap: 0.55, through: 0.6, flutter: 0.6 },
  shapes: [{ r: 0.24, h: 0.3, lobes: 2, seed: 771 }, { r: 0.18, h: 0.24, lobes: 1, seed: 772 }],
  grow: (S) => { const b = builder({ ao: (p) => 0.45 + 0.4 * Math.min(1, p[1] / S.h), barkTile: 0.5, colours: [woodCol, leafCol] }); mound(b, { r: S.r, h: S.h, lobes: S.lobes, ragged: 0.3, dome: [0, 0.6], puffs: [16, 7], count: [1, 1], size: [S.h * 1.1, S.h * 1.1], rise: 0.9, seed: S.seed }); return b; },
  // where it grows (src/scatter/rule.js): the pine forest's floor, most of it in the half shade (light: how thick in
  // deep shade and in the open)
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.22, light: [0.7, 0.5], scale: [0.7, 1.3], lean: 0, seed: 770 },
});
