// The city's plots: the villages Maia City is built in, laid over the land as seen from above (src/city/). Change a
// number here and the city changes; the code holds none.
//
// The same plan as the old map's City view (maiaCITY play, 2026-11-05): a jittered hex grid cut into cells, each a soft,
// slightly irregular hexagon with rounded corners, roads between them. Here it is laid on the real land: a plot ends at a
// river's bank, rocky or broken ground stays wild, and the city's people share the plots by their real area.
//
//   people       everyone the city is for: 1,346,269 (the Fibonacci number F31)
//   perVillage   the people a village is planned for: plots = people / perVillage
//   m2           the land each person has (m²): a plot's planned area is perVillage × m2, its real one what the land leaves
//   road         metres of road between two plots
//   corner       how round a plot's corners are, as a share of the grid's spacing
//   river        metres a plot keeps from a river's water
//   skip         the share of grid points left out, so their neighbours grow into larger, odder plots
//   wild         a cell stays wild land (no plot) where its ground is mostly rock, or where it is broken: its heights
//                spread over more than `steep` metres
//   seed         the plan's own seed: the same seed, the same city
//   core         the first village, round the tent (world/places.js), its name; the village numbers count out from it
//   show         the camera's height (m above the ground) where the plots start to show, and where they are fully there
//   far          from how far off (m) they fade, and where they are gone
//   unlock       a new village opens beside one that is open: it must share a road with it (within `touch` metres)
export default {
  people: 1346269,
  perVillage: 1500,
  m2: 1500,
  road: 36,
  corner: 0.14,
  river: 18,
  skip: 0.07,
  wild: { rock: 0.55, steep: 70 },
  seed: 31,
  core: { name: 'Vision Village', at: 'tent' },
  show: [1500, 2800],
  far: [9000, 26000],
  unlock: { touch: 260 },
  // the land a plot holds, as words, and what it gives (the ten base resources of the game's mechanics)
  land: {
    meadow: { label: 'Meadow', gives: 'Grain · Fibre' },
    forest: { label: 'Pine forest', gives: 'Wood · Herbs' },
    dry: { label: 'Dry land', gives: 'Sand · Sun' },
    shore: { label: 'Shore', gives: 'Water · Clay' },
  },
};
