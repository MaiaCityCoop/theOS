// Pine litter: what a stone pine drops round its foot and out under its crown: a few of its heavy cones, twigs, tufts
// of its needles. A form of the floor kit (assets/kit/floor.js strewn) whose species is its parameters; the one placement
// rule lays it where a pine's litter falls (src/scatter/rule.js: under).
import { tree, builder } from './kit/tree.js';
import { strewn } from './kit/floor.js';

const woodCol = [0.24, 0.15, 0.08], leafCol = [0.3, 0.24, 0.12];   // (for a picture without the textures)

export default tree({
  uid: '0118b206-a962-466f-acb8-dc914ba4682b',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Pine litter',
  kind: 'litter',
  about: 'What a stone pine drops under its crown: a few of its heavy brown cones, twigs, tufts of its long needles, lying on the floor.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'Pinus pinea litter: its cones lying, with twigs and needles',
    typical: [0.04, 0.1],
    most: 0.15,
    own: ['how high a cone lying on its side stands, 4 to 10 cm: the cone itself 8 to 15 cm long and about as thick as half that (the species\' cones); a strewing of them, our own estimate'],
  },
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark */, leaves: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742' /* pine tuft */ },
  foliage: { wrap: 0.4, through: 0.2, flutter: 0, tint: [1.2, 0.95, 0.6] },   // (needles fallen: dry, browner)
  shapes: [{ r: 0.45, cones: [3, 0.12, 0.045], twigs: [3, 0.32, 0.007], sprigs: [5, 0.22], seed: 741 }, { r: 0.35, cones: [1, 0.11, 0.042], twigs: [2, 0.25, 0.006], sprigs: [6, 0.2], seed: 742 }, { r: 0.4, cones: [2, 0.13, 0.05], twigs: [1, 0.4, 0.008], sprigs: [3, 0.2], seed: 743 }],
  grow: (S) => strewn(builder({ ao: () => 0.8, barkTile: 0.08, colours: [woodCol, leafCol] }), S),
  // where it lies (src/scatter/rule.js): where a stone pine's litter falls (under), as much of the floor as `cover`
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.45, under: 'e4f1685f-2db4-41a6-89df-e818cb470fdd' /* stone pine */, scale: [0.8, 1.2], lean: 0, seed: 740 },
});
