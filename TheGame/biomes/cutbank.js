// Cut bank: bare earth on the outside of the river's bends, where the current eats into the land and leaves a small
// cliff of soil over deep water. A biome of the world, in the one recipe every biome follows (biomes/README.md).
import { float, uint, max, smoothstep } from 'three/tsl';
import { vnoise, edgeJit } from '../src/world/noise.nodes.js';

export default {
  uid: '57c60389-675b-4f6f-89c9-43c406f845f8',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Cut bank',
  kind: 'bare earth',
  about: 'A low cliff of bare earth on the outside of a bend, cut by the current; deep water at its foot, grass hanging over its edge.',
  laid: "On a bend's outside, where the current cuts the bank",   // where it lies, in words (the library's card)
  layer: 60,                                               // after the slopes' rock: a cut bank's face is earth, steep as it is
  river: true,
  // where it lies (node code): on a bend's outside, from just inside the water's edge to a few metres up the bank
  where: ({ p, d, w, b }) => { const dd = d.add(edgeJit(p.add(31)).mul(0.7)); return max(b, 0).mul(smoothstep(w.mul(0.85), w.mul(0.98), dd)).mul(float(1).sub(smoothstep(w.add(1.4), w.add(3.4), dd))); },
  floor: { material: '082f0183-5d92-4ac8-821c-14408d3ee056' /* dryearth */, tile: [1.6, 2.6] },
  grass: null,
  stones: 0.12,
};
