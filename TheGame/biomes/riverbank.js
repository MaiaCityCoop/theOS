// Riverbank: the sand along the water. A biome of the world, in the one recipe every biome follows (biomes/README.md).
export default {
  uid: '84588b7e-0680-47ca-9793-409c7359db0c',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Riverbank',
  kind: 'shore',
  about: 'A strip of damp sand and pebbles between the water and the grass, stones washed up along it.',
  where: 'bank',                                           // laid along the river's edge (bankMask)
  floor: { material: '2f329f07-d2ba-4dc8-a6e3-73053c65e10f' /* sand */, tile: [2.0, 3.2] },
  grass: null,                                             // nothing grows on it
  stones: 0.52,
};
