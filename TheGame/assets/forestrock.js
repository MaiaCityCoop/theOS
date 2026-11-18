// A stone bedded in the forest's soil: a lump of the bedrock showing through the floor, weathered round, most of it
// under the ground. A form of the floor kit (assets/kit/floor.js bedded) whose stone is its parameters; the one
// placement rule places it (src/scatter/rule.js), and the larger things keep off it.
import { tree, builder } from './kit/tree.js';
import { bedded } from './kit/floor.js';

const stoneCol = [0.32, 0.31, 0.28];   // (for a picture without the textures)

export default tree({
  uid: '9a35e642-1d36-4201-8056-bd40b16f7432',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Bedded stone',
  kind: 'litter',
  about: 'A stone of the bedrock showing through the forest floor, weathered round.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'a stone bedded in a forest\'s soil: what shows of it over the floor',
    typical: [0.1, 0.4],
    most: 0.8,
    own: ['how high a bedded stone shows over the floor, 10 to 40 cm: our own estimate'],
  },
  colours: { wood: stoneCol, leaves: stoneCol },
  materials: { wood: '506c509b-300d-42eb-8403-f3969b06b271' /* rock */, leaves: '506c509b-300d-42eb-8403-f3969b06b271' /* rock (it bears none: the engine asks for one) */ },
  wind: { sway: 0 },   // a stone: no wind moves it
  shapes: [{ r: 0.45, h: 0.26, lumps: 0.6, seed: 791 }, { r: 0.32, h: 0.22, lumps: 0.8, seed: 792 }, { r: 0.7, h: 0.34, lumps: 0.5, seed: 793 }],
  grow: (S) => bedded(builder({ ao: () => 1, barkTile: 1, colours: [stoneCol, stoneCol] }), S),
  // where it lies (src/scatter/rule.js): the pine forest's floor, here and there
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.05, scale: [0.7, 1.4], lean: 0, seed: 790 },
});
