// Riverbank: the sand along the water. A biome of the world, in the one recipe every biome follows (biomes/README.md).
import { float, uint, max, smoothstep } from 'three/tsl';
import { vnoise, edgeJit } from '../src/world/noise.nodes.js';

export default {
  uid: '84588b7e-0680-47ca-9793-409c7359db0c',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Riverbank',
  kind: 'shore',
  about: 'A strip of damp sand and pebbles between the water and the grass, stones washed up along it.',
  laid: 'Along the river',   // where it lies, in words (the library's card)
  layer: 30,
  river: true,                                             // it lies by the river: in a sandbox with its own river, it keeps to it
  // where it lies (node code): a strip along the water, wider on a bend's inside, narrower under a cut bank, its edge ragged
  // (d: how far from the channel's middle, w: its half-width, b: which bank, > 0 a bend's outside)
  where: ({ p, d, w, b }) => {
    const bar = max(b.negate(), 0), cut = max(b, 0), dd = d.add(edgeJit(p).mul(bar.mul(1.5).add(1.6))), e = w.mul(bar.mul(0.5).add(1.15));
    return float(1).sub(smoothstep(e, e.add(3).add(bar.mul(4)), dd)).mul(float(1).sub(cut.mul(0.6)));
  },
  floor: { material: '2f329f07-d2ba-4dc8-a6e3-73053c65e10f' /* sand */, tile: [2.0, 3.2] },
  grass: null,                                             // nothing grows on it
  stones: 0.52,
};
