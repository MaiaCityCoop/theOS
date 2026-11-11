// Meadow: the land's own cover, wherever no other biome is. A biome of the world, in the one recipe every biome
// follows (biomes/index.js).
export default {
  id: 'meadow',
  name: 'Meadow',
  kind: 'grassland',
  about: 'Knee-high grass on dark soil, the odd bare patch, a few stones, now and then a white flower.',
  where: 'land',                                           // the land's own: everywhere no other biome is laid
  floor: { material: 'meadow', tile: [2.0, 3.2] },         // the ground: a material (materials/) at two tile sizes in metres
  patches: { material: 'path', tile: [2.0, 3.2] },         // bare patches between the grass, and the outcrops' floor
  slopes: { material: 'rock', tile: [3.0, 4.8] },          // where the land is too steep for soil
  grass: {
    cover: 1,                                              // how much of the ground the blades cover, 0 to 1
    height: 1,                                             // the blades' height, times the grass asset's own
    colours: { a: [0.026, 0.105, 0.016], b: [0.058, 0.15, 0.022] },   // two greens the blades vary between (linear)
    mute: 0.8,                                             // how much of their colour they keep: a real meadow is muted
    flowers: true,
    carpet: 'grasscarpet',                                 // the material that stands for the blades far away
  },
  stones: 0.07,                                            // the chance of a stone in a stone's cell
};
