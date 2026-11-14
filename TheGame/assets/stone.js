// Stones: small rocks lying all over the land, more where it is dry, thick along the river's banks. An asset in the
// one recipe (assets/index.js). Its shapes are worn rocks (assets/kit/rock.js), each at every level of the ladder; its
// placement is a scatter: the land's engine (src/scatter/rocks.js) spreads thousands, each cell hashed to its own
// shape, size and turn.
export default {
  uid: '62b01bbe-c92c-4181-b774-45a6af054b12',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Stones',
  kind: 'rock',
  about: 'Small field stones, a few centimetres to half a metre, lying in the grass and thick on the river banks.',
  size: { length: [0.07, 0.55], width: [0.07, 0.55], height: [0.05, 0.4] },
  colours: { stone: [0.52, 0.5, 0.46] },
  // worn round and smooth by the river and the weather: few broken faces, little moss, a paler, warmer grey than the boulders
  look: { material: 'f4a707ab-dcac-4c3a-a4d6-7a929d0e945e' /* pebble */, moss: 0.12, relief: 0.6, tint: [0.92, 0.9, 0.87], cuts: 0.3, smooth: 0.85 },
  // its levels of detail are the ladder's (assets/kit/ladder.js), as for all the heap draws: a full mesh of so many
  // squares an edge where a long lens fills the screen with it, down to a cube; under six pixels it has shrunk away
  // (end: a stone that small is lost in the grass round it)
  detail: { ladder: 96, end: 6, casts: false },   // too small for a shadow worth drawing them twice
  // shapes: how many different stones there are (each a kind of the heap: assets/zoo/stones.js), from its seed
  placement: { at: 'scatter', engine: 'rocks', cell: 2.2, outcrops: false, texture: 1.1, shapes: 12, seed: 200 },
};
