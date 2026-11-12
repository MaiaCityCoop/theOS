// Gravel bar: the long, low bar of gravel and sand on the inside of the river's bends, where the slow water drops what
// it carries. A biome of the world, in the one recipe every biome follows (biomes/README.md).
export default {
  uid: 'bf492d59-e40f-4f10-ba3b-b7d19f724c29',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Gravel bar',
  kind: 'bar',
  about: 'A wide, gentle slope of gravel and sand on the inside of a bend, shallow water running over its edge.',
  where: 'bar',                                            // laid on a bend's inside, between the water and the grass (barMask, src/world/land.nodes.js)
  floor: { material: '0db6a039-9f7f-4a58-8137-c3348dfb922e' /* path */, tile: [1.4, 2.3] },
  grass: null,
  stones: 0.6,
};
