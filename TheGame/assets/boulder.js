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
  // its levels of detail, near to far (src/detail); a boulder ends its levels sooner on screen than its kind does,
  // so it is not drawn past about a kilometre, as before
  detail: { px: [100, 25, 10, 5.5], levels: [{ rock: 3, P: 4 }, { rock: 2, P: 8 }, { rock: 1, P: 16 }, { rock: 0, P: 32 }] },
  placement: { at: 'scatter', engine: 'rocks', cell: 20, outcrops: true, texture: 3.0, shapes: 1, seed: 100 },
};
