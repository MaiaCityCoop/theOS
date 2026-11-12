// Gravel bar: the long, low bar of gravel and sand on the inside of the river's bends, where the slow water drops what
// it carries. A biome of the world, in the one recipe every biome follows (biomes/README.md).
import { float, uint, max, smoothstep } from 'three/tsl';
import { vnoise, edgeJit } from '../src/world/noise.nodes.js';

export default {
  uid: 'bf492d59-e40f-4f10-ba3b-b7d19f724c29',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Gravel bar',
  kind: 'bar',
  about: 'A wide, gentle slope of gravel and sand on the inside of a bend, shallow water running over its edge.',
  laid: "On a bend's inside, between the water and the grass",   // where it lies, in words (the library's card)
  layer: 40,
  river: true,
  mix: 0.75,                                               // its ground a mix over the sand, not a stripe
  // where it lies (node code): on a bend's inside, between the water and the grass, in drifts
  where: ({ p, d, w, b }) => {
    const bar = max(b.negate(), 0), dd = d.add(edgeJit(p.add(57)).mul(1.4));
    return smoothstep(0.15, 0.6, bar).mul(smoothstep(w.mul(0.4), w.mul(0.85), dd)).mul(float(1).sub(smoothstep(w.mul(bar.mul(0.35).add(0.95)), w.mul(bar.mul(0.5).add(1.2)), dd))).mul(smoothstep(0.35, 0.65, vnoise(p.mul(1 / 9), uint(46)).add(0.25)));
  },
  floor: { material: 'e1da2cdc-1305-4266-b1db-8c0ca473f438' /* river gravel */, tile: [1.6, 2.6] },
  grass: null,
  stones: 1,
};
