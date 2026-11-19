// River: the water itself. A biome of the world, in the one recipe every biome follows (biomes/README.md).
export default {
  uid: '597e46d1-02b9-47c8-a6ff-598a05c9a080',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'River',
  kind: 'water',
  about: 'Slow, clear water over sand, dark where it is deep.',
  laid: 'In the river',   // where it lies, in words (the library's card)
  water: true,                                             // the water itself: drawn over the river's bed (src/terrain/water.js), not laid as a ground
  floor: { material: '83e8d1fa-61a3-41fc-a9f1-882ab8be9fbc' /* water */, tile: 4.5 },          // its ripples, sliding with the flow
  // its colour: what an endless depth of it shows (its reflectance under the surface), a notch towards a clear blue-green
  // (was 0.018 0.045 0.034); what it takes away of each colour follows from it (src/terrain/water.js), so a shallow
  // reach shows its bed through it, as much as its depth leaves
  colours: { deep: [0.013, 0.046, 0.06] },
  grass: null,
  stones: 0,
};
