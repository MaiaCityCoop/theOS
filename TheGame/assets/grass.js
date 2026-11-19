// The grass: the meadow's blades, instanced in three rings round the camera, dense and fine close, sparse and wide far
// (src/scatter/grass.js draws them). An asset in the one recipe (assets/index.js). How much of it grows where, how
// high and in which colours is each biome's own (its `grass`: biomes/*.js); here is the blade and its rings.
//
// tiers, near to far, distances in metres as the walker's 68° lens sees them (a longer lens stretches them by its own
// factor: core/governor.js):
//   segs   bends along the blade            w      half its width
//   cell   metres per cell: one blade may stand in each
//   P      cells along a patch's side: P * P blades a patch, a patch is cell * P metres
//   near, far, nearFade, farFade   the ring, and the dithered hand-over to its neighbours
//   end    where the last ring's blades shrink away
// A farther ring's cells are wider: its blades are widened with the cell's area (w / cell² about the same in every ring),
// so each ring covers the ground as the one before it and the hand-over does not thin the meadow.
export default {
  uid: 'eb8f406f-1035-4921-ba42-10f05efab6ed',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Grass',
  kind: 'grass',
  about: 'The blades of the meadow: each bends and flutters in the wind on its own, in tufts of a common height and lean; a white flower head now and then. Every biome says how much of it grows, how high, and in which greens.',
  size: { length: 0.03, width: 0.03, height: 0.58 },   // one blade, full grown
  height: 0.58,
  tiers: [
    { segs: 3, cell: 0.085, P: 96, near: -1, nearFade: 0, far: 15, farFade: 5, w: 0.014, end: 1e6 },
    { segs: 2, cell: 0.17, P: 96, near: 15, nearFade: 5, far: 42, farFade: 10, w: 0.033, end: 1e6 },
    { segs: 1, cell: 0.38, P: 96, near: 42, nearFade: 10, far: 88, farFade: 22, w: 0.106, end: 88 },
  ],
  placement: { at: 'scatter', engine: 'grass' },   // over all the land, as each biome's grass says
};
