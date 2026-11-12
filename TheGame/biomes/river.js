// River: the water itself. A biome of the world, in the one recipe every biome follows (biomes/README.md).
export default {
  uid: '597e46d1-02b9-47c8-a6ff-598a05c9a080',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'River',
  kind: 'water',
  about: 'Slow, clear water over sand at its edges, green-brown and dark where it is deep; foam only where it meets the bank.',
  where: 'water',                                          // in the river's bed (src/terrain/water.js)
  floor: { material: '83e8d1fa-61a3-41fc-a9f1-882ab8be9fbc' /* water */, tile: [4.5, 4.5] },          // its ripples, sliding with the flow
  colours: { shallow: [0.072, 0.098, 0.078], deep: [0.013, 0.046, 0.06] },   // a notch towards a clear blue-green (was shallow 0.085 0.09 0.05, deep 0.018 0.045 0.034)
  grass: null,
  stones: 0,
};
