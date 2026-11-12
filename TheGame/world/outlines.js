// The outlines of the land's biomes. A biome lies where its rule says (biomes/*.js: where), and a rule is built from a
// noise on a square grid: read as it is, forests and dry land come out in blocks along that grid, which shows from high
// up. So a rule reads its place bent: pushed aside by a slow noise; far from home it adds a second swell, turned off the
// grid; its finer noises are turned too. Change a number here and the land's forests and dry stretches move; the code
// (src/world/noise.nodes.js on the GPU, src/world/land.js in JS: the same, constant for constant) holds none.
//
//   home     the place the land is held at (world/places.js): there the push is none, and near it small
//   bend     the push: `size` metres across its swells, up to `by` metres each way
//   keep     metres round home: within the first the land lies as it always did (the stretch the stories are told on);
//            from the second on it is reshaped in full
//   second   how much the second swell adds to a rule's noise, far from home
//   turn     radians the two turned frames are turned by, about home (the second swell's and the finer noises')
export default {
  home: 'tent',
  bend: { size: 2600, by: 300 },
  keep: [600, 2500],
  second: 0.45,
  turn: [0.55, 1.665],
};
