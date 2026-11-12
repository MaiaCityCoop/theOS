// Meadow: the land's own cover, wherever no other biome is. A biome of the world, in the one recipe every biome
// follows (biomes/README.md).
export default {
  uid: '32a4de29-d325-415d-85b7-f6e647830234',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Meadow',
  kind: 'grassland',
  about: 'Knee-high grass on dark soil, the odd bare patch, a few stones, now and then a white flower.',
  laid: 'Everywhere no other biome is',   // where it lies, in words (the library's card)
  base: true,                                              // the land's own: under every other biome, everywhere
  floor: { material: 'ae3df398-9f52-4a4a-b54f-a2db2eafb0c8' /* meadow */, tile: [2.0, 3.2] },         // the ground: a material (materials/) at two tile sizes in metres
  patches: { material: '0db6a039-9f7f-4a58-8137-c3348dfb922e' /* path */, tile: [2.0, 3.2] },         // bare patches between the grass, and the outcrops' floor
  slopes: { material: '506c509b-300d-42eb-8403-f3969b06b271' /* rock */, tile: [3.0, 4.8], layer: 50 },          // where the land is too steep for soil
  grass: {
    cover: 1,                                              // how much of the ground the blades cover, 0 to 1
    height: 1,                                             // the blades' height, times the grass asset's own
    colours: { a: [0.026, 0.105, 0.016], b: [0.058, 0.15, 0.022], dry: [0.36, 0.29, 0.12] },   // two greens the blades vary between, and the colour their tips dry to (linear)   // two greens the blades vary between (linear)
    mute: 0.8,                                             // how much of their colour they keep: a real meadow is muted
    flowers: true,
    carpet: '9c444204-47c9-4a6f-bfe3-ba8ab5c8e1c4' /* grasscarpet */,                                 // the material that stands for the blades far away
  },
  stones: 0.07,                                            // the chance of a stone in a stone's cell
};
