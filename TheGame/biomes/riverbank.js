// Riverbank: the sand along the water. A biome of the world, in the one recipe every biome follows (biomes/index.js).
export default {
  id: 'riverbank',
  name: 'Riverbank',
  kind: 'shore',
  about: 'A strip of damp sand and pebbles between the water and the grass, stones washed up along it.',
  where: 'bank',                                           // laid along the river's edge (bankMask)
  floor: { material: 'sand', tile: [2.0, 3.2] },
  grass: null,                                             // nothing grows on it
  stones: 0.52,
};
