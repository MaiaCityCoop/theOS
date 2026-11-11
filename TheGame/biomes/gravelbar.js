// Gravel bar: the long, low bar of gravel and sand on the inside of the river's bends, where the slow water drops what
// it carries. A biome of the world, in the one recipe every biome follows (biomes/index.js).
export default {
  id: 'gravelbar',
  name: 'Gravel bar',
  kind: 'bar',
  about: 'A wide, gentle slope of gravel and sand on the inside of a bend, shallow water running over its edge.',
  where: 'bar',                                            // laid on a bend's inside, between the water and the grass (barMask, src/world/land.glsl.js)
  floor: { material: 'path', tile: [1.4, 2.3] },
  grass: null,
  stones: 0.6,
};
