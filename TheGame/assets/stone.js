// Stones: small rocks lying all over the land, more where it is dry, thick along the river's banks. An asset in the
// one recipe (assets/index.js). Its levels of detail are rough rocks of more or fewer faces; its placement is a
// scatter: the land's engine (src/scatter/rocks.js) spreads thousands, each cell hashed to its own size and turn.
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
  // rock: how often its icosphere is divided (2 round, 0 a rough twenty-sided stone); P: cells per patch side
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, rock (assets/kinds.js)
  detail: { levels: [{ rock: 2, P: 8 }, { rock: 1, P: 16 }, { rock: 0, P: 32 }] },
  placement: { at: 'scatter', engine: 'rocks', cell: 2.2, outcrops: false, texture: 1.1, shapes: 1, seed: 200 },
};
