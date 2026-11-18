// The grass: the meadow's blades, drawn round the camera by its engine (src/scatter/grass.js), each as it is, its bends
// fewer further off. An asset in the one recipe (assets/index.js). How much of it grows where, how high and in
// which colours is each biome's own (its `grass`: biomes/*.js); here is the blade, at its full detail, and no more:
//
//   blade  { segs, cell, P, w }   segs: bends along it; cell: metres per cell, one blade may stand in each; P: cells along
//          a patch's side (P * P blades a patch: how the engine packs them); w: half its width
//
// Its engine makes every coarser ring of it from this alone: the blade in its own cells, as wide and as tall, bent in
// fewer straight pieces, each ring where how far that misses the blade's curve is the one ERROR_PX (src/detail/error.js).
// None is fewer: a meadow thins only towards its end, where the ground under it wears its colour.
export default {
  uid: 'eb8f406f-1035-4921-ba42-10f05efab6ed',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Grass',
  kind: 'grass',
  about: 'The blades of the meadow, in tufts, each moving in the wind.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'the grasses of a hay meadow, leaf and flowering stem',
    typical: [0.3, 1.2],
    most: 1.5,
    source: ['false oat-grass (Arrhenatherum elatius), a hay meadow\'s tallest: 0.5 to 1.2 m, now and then 1.5 m (Flora Helvetica); 0.6 to 1.5 m (Bayer crop science)'],
  },
  size: { length: 0.03, width: 0.03, height: 0.58 },   // one blade, full grown
  height: 0.58,
  blade: { segs: 3, cell: 0.085, P: 96, w: 0.014 },
  placement: { at: 'scatter', engine: 'grass' },   // over all the land, as each biome's grass says
};
