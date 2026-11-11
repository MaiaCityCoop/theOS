// Cut bank: bare earth on the outside of the river's bends, where the current eats into the land and leaves a small
// cliff of soil over deep water. A biome of the world, in the one recipe every biome follows (biomes/index.js).
export default {
  id: 'cutbank',
  name: 'Cut bank',
  kind: 'bare earth',
  about: 'A low cliff of bare earth on the outside of a bend, cut by the current; deep water at its foot, grass hanging over its edge.',
  where: 'cutbank',                                        // laid where the bank is steep, on a bend's outside (cutMask, src/world/land.glsl.js)
  floor: { material: 'dryearth', tile: [1.6, 2.6] },
  grass: null,
  stones: 0.12,
};
