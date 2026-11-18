// Oak litter: what a holm oak drops under its crown: its small leathery leaves on their twigs, a few acorns. A form of
// the floor kit (assets/kit/floor.js strewn) whose species is its parameters; the one placement rule lays it where an
// oak's litter falls (src/scatter/rule.js: under).
import { tree, builder } from './kit/tree.js';
import { strewn } from './kit/floor.js';

const woodCol = [0.2, 0.15, 0.1], leafCol = [0.22, 0.2, 0.1];   // (for a picture without the textures)

export default tree({
  uid: '288bf051-5cba-4fe8-b30b-e508719ce800',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Oak litter',
  kind: 'litter',
  about: 'What a holm oak drops under its crown: sprigs of its small leathery leaves, gone dull and brown, twigs and a few acorns.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'Quercus ilex litter: fallen leafy sprigs, twigs, acorns',
    typical: [0.01, 0.06],
    most: 0.1,
    own: ['how high fallen sprigs and acorns lie off the floor: our own estimate'],
  },
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'fb5ce908-7437-45b6-879f-154de32d12b9' /* holm oak bark */, leaves: 'c4cbd29b-9dd2-494d-913b-9a80c40ab8e6' /* holm oak sprig */ },
  foliage: { wrap: 0.4, through: 0.1, flutter: 0, tint: [1.35, 1.0, 0.55] },   // (its leaves fallen: dull, brown)
  shapes: [{ r: 0.4, cones: [2, 0.028, 0.011], twigs: [2, 0.25, 0.005], sprigs: [6, 0.18], seed: 751 }, { r: 0.3, twigs: [1, 0.2, 0.005], sprigs: [5, 0.16], seed: 752 }],
  grow: (S) => strewn(builder({ ao: () => 0.8, barkTile: 0.08, colours: [woodCol, leafCol] }), S),
  // where it lies (src/scatter/rule.js): where a holm oak's litter falls (under), as much of the floor as `cover`
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.45, under: '40cb573a-5aa3-4e2f-90ff-41e69d20915e' /* holm oak */, scale: [0.8, 1.2], lean: 0, seed: 750 },
});
