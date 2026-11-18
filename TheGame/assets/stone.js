// Stones: small rocks lying all over the land, more where it is dry, thick along the river's banks. An asset in the
// one recipe (assets/index.js). Its shapes are worn rocks (assets/kit/rock.js), every coarser version the builder's; its
// placement is a scatter: the land's engine (src/scatter/rocks.js) spreads thousands, each cell hashed to its own
// shape, size and turn. Its sizes are its measure's (below): a stone of size s is s across.
// What a real one measures, and where that is known from (intent 0035): next to what it is, read against the
// world's one scale (world/scale.js) and measured against what it draws by `bun tools/scale.js`.
const MEASURE = {
  real: 'field stones: most of them cobbles, a few small boulders',
  size: [0.07, 0.55],
  height: [0.05, 0.4],
  across: { typical: [0.064, 0.256], most: 1.024 },
  own: ['height: how high a stone stands as it lies'],
  source: ['Wentworth 1922, "A scale of grade and class terms for clastic sediments": cobbles 64 to 256 mm, boulders larger; Blair & McPherson 1999: fine boulders 0.256 to 0.512 m, medium 0.512 to 1.024 m'],
};

export default {
  uid: '62b01bbe-c92c-4181-b774-45a6af054b12',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Stones',
  kind: 'rock',
  about: 'Small field stones, a few centimetres to half a metre, lying in the grass and thick on the river banks.',
  measure: MEASURE,
  size: { length: MEASURE.size, width: MEASURE.size, height: MEASURE.height },
  colours: { stone: [0.52, 0.5, 0.46] },
  // worn round and smooth by the river and the weather: few broken faces, little moss, a paler, warmer grey than the boulders
  look: { material: 'f4a707ab-dcac-4c3a-a4d6-7a929d0e945e' /* pebble */, moss: 0.12, relief: 0.6, tint: [0.92, 0.9, 0.87], cuts: 0.3, smooth: 0.85 },
  casts: false,   // too small for a shadow worth drawing them twice
  // shapes: how many different stones there are (each a kind of the heap: assets/zoo/scattered.js), from its seed
  placement: { at: 'scatter', engine: 'rocks', cell: 2.2, outcrops: false, texture: 1.1, shapes: 12, seed: 200 },
};
