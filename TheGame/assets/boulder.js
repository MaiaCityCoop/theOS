// Boulders: large rocks where the land's outcrops break through. The stones' recipe (assets/stone.js), far fewer,
// much larger, and seen from much further away. Its sizes are its measure's (below): a boulder of size s is s across.
// What a real one measures, and where that is known from (intent 0035): next to what it is, read against the
// world's one scale (world/scale.js) and measured against what it draws by `bun tools/scale.js`.
const MEASURE = {
  real: 'boulders, where the outcrops break through',
  size: [0.7, 4.2],
  height: [0.5, 3],
  across: { typical: [0.512, 2.048], most: 8.192 },
  own: ['height: how high a boulder stands as it lies'],
  source: ['Blair & McPherson 1999, "Grain-size and textural classification of coarse sedimentary particles": boulders medium 0.512 to 1.024 m, coarse 1.024 to 2.048 m, very coarse 2.048 to 4.096 m; larger, blocks (fine 4.1 to 8.2 m)'],
};

export default {
  uid: '42345740-c3cc-455a-8017-a97ccdee6df3',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Boulders',
  kind: 'rock',
  about: 'Big weathered rocks, up to four metres, gathered where the outcrops of the land come to the surface.',
  measure: MEASURE,
  size: { length: MEASURE.size, width: MEASURE.size, height: MEASURE.height },
  colours: { stone: [0.5, 0.49, 0.45], moss: [0.33, 0.42, 0.24] },
  // big, broken and old: every face it lost still sharp, moss over all that looks up
  look: { material: '506c509b-300d-42eb-8403-f3969b06b271' /* rock */, moss: 1, relief: 1.1, tint: [1, 1, 1], cuts: 1, smooth: 0 },
  // shapes: how many different boulders there are (each a kind of the heap: assets/zoo/scattered.js), from its seed
  placement: { at: 'scatter', engine: 'rocks', cell: 20, outcrops: true, texture: 3.0, shapes: 12, seed: 100 },
};
