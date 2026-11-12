// Dry land: where the land is dry. A biome of the world, in the one recipe every biome follows (biomes/README.md).
export default {
  uid: '36d9e9fe-93ab-42c7-9e1d-8f32bbe99019',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Dry land',
  kind: 'steppe',
  about: 'Cracked earth with sandy spots, the grass in yellowing tufts, more stones lying about.',
  where: 'arid',                                           // laid by the land's dryness (aridMask in src/world/land.nodes.js)
  floor: { material: '082f0183-5d92-4ac8-821c-14408d3ee056' /* dryearth */, tile: [4.0, 6.4] },
  spots: { material: '2f329f07-d2ba-4dc8-a6e3-73053c65e10f' /* sand */, tile: [2.0, 3.2] },           // sandy spots in it
  grass: {
    cover: 0.45,                                           // grass only in tufts, and less of it
    tufts: true,
    height: 0.6,
    colours: { dry: [0.36, 0.29, 0.12] },                  // the colour the grass dries to
    flowers: false,
  },
  stones: 0.37,
};
