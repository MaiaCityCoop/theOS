// Dead wood: a fallen branch on the forest's floor, weathered grey, a few twigs still on it, some of them snapped. What a
// pine wood's floor is strewn with between its bushes: it gives the ground things that lie on it and cast their shade.
// A form of the floor kit (assets/kit/floor.js fallen): tubes only, no foliage; three shapes. An asset in the one recipe
// (assets/index.js), of kind `litter` (assets/kinds.js), placed by the one rule under the trees it fell from
// (src/scatter/rule.js: under).
import { tree, builder } from './kit/tree.js';
import { fallen } from './kit/floor.js';

const woodCol = [0.2, 0.17, 0.14], leafCol = [0.2, 0.17, 0.14];   // (for a picture without the textures)

export default tree({
  uid: '43ceb501-3788-47fc-bb64-fa4df1bcafa1',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Dead wood',
  kind: 'litter',
  about: 'A fallen branch on the wood’s floor: grey bark, a few twigs still on it, lying where it came down.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'a fallen branch of a pine, lying on the floor',
    typical: [0.05, 0.5],
    most: 0.6,
    own: ['typical, most: what a fallen branch stands off the ground: no source; its thickness, 7 to 15 cm, is coarse woody debris (pieces over 7.6 cm, the US Forest Service\'s inventory)'],
    source: ['US Forest Service, Forest Inventory and Analysis: coarse woody debris, pieces 7.6 cm (3 in) and more across'],
  },
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'fb5ce908-7437-45b6-879f-154de32d12b9' /* holm oak bark: grey, as wood weathers */, needles: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742' /* pine tuft (it bears none: the engine asks for one) */ },
  wind: { sway: 0 },   // it lies: no wind moves it
  shapes: [{ len: 2.9, r: 0.075, bow: 0.3, lift: 0.14, twigs: 6, seed: 711 }, { len: 1.8, r: 0.05, bow: 0.16, lift: 0.07, twigs: 4, seed: 712 }, { len: 1.1, r: 0.034, bow: 0.07, lift: 0.03, twigs: 3, seed: 713 }],
  grow: (S) => fallen(builder({ ao: () => 1, barkTile: 0.35, colours: [woodCol, leafCol] }), S),
  // where it lies (src/scatter/rule.js): under the pine forest's trees, where their litter falls (under: whose)
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.25, under: ['e4f1685f-2db4-41a6-89df-e818cb470fdd' /* stone pine */, '40cb573a-5aa3-4e2f-90ff-41e69d20915e' /* holm oak */], scale: [0.85, 1.15], lean: 0, seed: 710 },
});
