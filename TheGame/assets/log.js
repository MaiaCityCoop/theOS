// A fallen log: a trunk or a great limb come down and lying, its bark greying, a few snapped branches on it. A form of
// the floor kit (assets/kit/floor.js fallen), as the dead wood's branches are, larger; the one placement rule lays it
// under the trees it fell from (src/scatter/rule.js: under).
import { tree, builder } from './kit/tree.js';
import { fallen } from './kit/floor.js';

const woodCol = [0.2, 0.16, 0.12];   // (for a picture without the textures)

export default tree({
  uid: 'aeff73cd-36d8-41b1-a9f4-a6be8cec6d1d',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Fallen log',
  kind: 'litter',
  about: 'A trunk or great limb brought down by a storm, its bark greying.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'a fallen pine or oak trunk, lying',
    typical: [0.2, 0.55],
    most: 0.9,
    own: ['how high a fallen log stands off the floor, 20 to 55 cm: a trunk 25 to 50 cm thick lying, its branches propping it; our own estimate'],
  },
  colours: { wood: woodCol, leaves: woodCol },
  materials: { wood: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark */, needles: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742' /* pine tuft (it bears none: the engine asks for one) */ },
  wind: { sway: 0 },   // it lies: no wind moves it
  shapes: [{ len: 4.6, r: 0.2, bow: 0.12, lift: 0.04, twigs: 3, taper: 0.6, seed: 761 }, { len: 3.2, r: 0.15, bow: 0.2, lift: 0.08, twigs: 4, taper: 0.5, seed: 762 }],
  grow: (S) => fallen(builder({ ao: () => 1, barkTile: 0.5, colours: [woodCol, woodCol] }), S),
  // where it lies (src/scatter/rule.js): under the pine forest's trees, where their litter falls (under: whose)
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.08, under: ['e4f1685f-2db4-41a6-89df-e818cb470fdd' /* stone pine */, '40cb573a-5aa3-4e2f-90ff-41e69d20915e' /* holm oak */], scale: [0.8, 1.2], lean: 0, seed: 760 },
});
