// Boulders: large rocks where the land's outcrops break through. The stones' recipe (assets/stone.js), far fewer,
// much larger, and seen from much further away.
export default {
  id: 'boulder',
  name: 'Boulders',
  kind: 'rock',
  about: 'Big weathered rocks, up to four metres, gathered where the outcrops of the land come to the surface.',
  size: { length: [0.7, 4.2], width: [0.7, 4.2], height: [0.5, 3] },
  colours: { stone: [0.5, 0.49, 0.45], moss: [0.33, 0.42, 0.24] },
  lods: [{ far: 60, rock: 3, P: 4 }, { far: 250, rock: 2, P: 8 }, { far: 600, rock: 1, P: 16 }, { far: 1100, rock: 0, P: 32 }],
  placement: { at: 'scatter', engine: 'rocks', cell: 20, outcrops: true, texture: 3.0, shapes: 1, seed: 100 },
};
