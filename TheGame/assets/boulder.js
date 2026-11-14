// Boulders: large rocks where the land's outcrops break through. The stones' recipe (assets/stone.js), far fewer,
// much larger, and seen from much further away.
export default {
  uid: '42345740-c3cc-455a-8017-a97ccdee6df3',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Boulders',
  kind: 'rock',
  about: 'Big weathered rocks, up to four metres, gathered where the outcrops of the land come to the surface.',
  size: { length: [0.7, 4.2], width: [0.7, 4.2], height: [0.5, 3] },
  colours: { stone: [0.5, 0.49, 0.45], moss: [0.33, 0.42, 0.24] },
  // big, broken and old: every face it lost still sharp, moss over all that looks up
  look: { material: '506c509b-300d-42eb-8403-f3969b06b271' /* rock */, moss: 1, relief: 1.1, tint: [1, 1, 1], cuts: 1, smooth: 0 },
  // its levels of detail are the ladder's (assets/kit/ladder.js), as for all the heap draws: a full mesh of so many
  // squares an edge (12 n² triangles) where it fills the screen, down to a dot that sinks away under a pixel
  detail: { ladder: 96 },
  // shapes: how many different boulders there are (each a kind of the heap: assets/zoo/boulders.js), from its seed
  placement: { at: 'scatter', engine: 'rocks', cell: 20, outcrops: true, texture: 3.0, shapes: 12, seed: 100 },
};
