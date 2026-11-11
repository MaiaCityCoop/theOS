// Stones: small rocks lying all over the land, more where it is dry, thick along the river's banks. An asset in the
// one recipe (assets/index.js). Its levels of detail are rough rocks of more or fewer faces; its placement is a
// scatter: the land's engine (src/scatter/rocks.js) spreads thousands, each cell hashed to its own size and turn.
export default {
  id: 'stone',
  name: 'Stones',
  kind: 'rock',
  about: 'Small field stones, a few centimetres to half a metre, lying in the grass and thick on the river banks.',
  size: { length: [0.07, 0.55], width: [0.07, 0.55], height: [0.05, 0.4] },
  colours: { stone: [0.52, 0.5, 0.46] },
  // rock: how often its icosphere is divided (2 round, 0 a rough twenty-sided stone); P: cells per patch side
  lods: [{ far: 12, rock: 2, P: 8 }, { far: 50, rock: 1, P: 16 }, { far: 110, rock: 0, P: 32 }],
  placement: { at: 'scatter', engine: 'rocks', cell: 2.2, outcrops: false, texture: 1.1, shapes: 1, seed: 200 },
};
