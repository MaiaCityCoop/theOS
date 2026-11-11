// River: the water itself. A biome of the world, in the one recipe every biome follows (biomes/index.js).
export default {
  id: 'river',
  name: 'River',
  kind: 'water',
  about: 'Slow, clear water over sand at its edges, green-brown and dark where it is deep; foam only where it meets the bank.',
  where: 'water',                                          // in the river's bed (src/terrain/water.glsl.js)
  floor: { material: 'water', tile: [4.5, 4.5] },          // its ripples, sliding with the flow
  colours: { shallow: [0.085, 0.09, 0.05], deep: [0.018, 0.045, 0.034] },
  grass: null,
  stones: 0,
};
