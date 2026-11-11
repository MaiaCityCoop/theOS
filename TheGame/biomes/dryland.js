// Dry land: where the land is dry. A biome of the world, in the one recipe every biome follows (biomes/index.js).
export default {
  id: 'dryland',
  name: 'Dry land',
  kind: 'steppe',
  about: 'Cracked earth with sandy spots, the grass in yellowing tufts, more stones lying about.',
  where: 'arid',                                           // laid by the land's dryness (aridMask in src/world/land.glsl.js)
  floor: { material: 'dryearth', tile: [4.0, 6.4] },
  spots: { material: 'sand', tile: [2.0, 3.2] },           // sandy spots in it
  grass: {
    cover: 0.45,                                           // grass only in tufts, and less of it
    tufts: true,
    height: 0.6,
    colours: { dry: [0.36, 0.29, 0.12] },                  // the colour the grass dries to
    flowers: false,
  },
  stones: 0.37,
};
