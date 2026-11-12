// Pine forest: stone pines in loose stands over a floor of their needles. A biome of the world, in the one recipe every
// biome follows (biomes/README.md); its trees are an asset of their own (assets/stonepine.js) that grows where this lies.
import { float, uint, smoothstep } from 'three/tsl';
import { vnoise } from '../src/world/noise.nodes.js';

export default {
  uid: '170e8df4-254e-4df2-95e2-c584380cf14b',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Pine forest',
  kind: 'forest',
  about: 'Stone pines in loose stands of a few hundred metres, holm oaks among them, their needles carpeting the ground, the grass thin under them.',
  laid: 'In stands over the higher, drier ground, away from the river',
  layer: 20,
  // where it lies, 0..1 (node code): stands of a few hundred metres (a slow noise, pushed by a quicker one so their edges
  // wander), kept off the river's banks
  where: ({ p, d, w }) => smoothstep(0.6, 0.72, vnoise(p.mul(1 / 1100), uint(80)).add(vnoise(p.mul(1 / 240), uint(81)).sub(0.5).mul(0.3))).mul(smoothstep(w.add(30), w.add(90), d)),
  floor: { material: '795da1c3-9cfe-4c4e-88c7-a58ce86444d4' /* pine needles */, tile: [2.2, 3.5] },
  grass: { cover: 0.25, tufts: true, height: 0.7, colours: { dry: [0.33, 0.28, 0.13] }, flowers: false },   // thin grass in the shade of the pines
  stones: 0.15,
  // its stand of trees, the same for every kind that grows here (an asset's placement.biome; each takes its `share` of
  // the cells: src/scatter/trees.js): one tree at most in a cell of `cell` metres, as many as `density` says, in groves
  // and glades `clumps` metres across; one kind leads here, another there, in patches `patches` metres across; the stand
  // as old as a slow noise between age.stand's years says, one tree in `young` a sapling from `min` years; `seed` moves it all
  trees: { cell: 10, density: 0.75, clumps: 55, patches: 90, age: { stand: [30, 150], young: 0.18, min: 3 }, seed: 300 },
  // far off, past where its trees are drawn, the land under it takes the colour of their crowns, in its stand's groves
  // (src/terrain/material.js); from/to (metres): only if no tree of it says where its trees end
  canopy: { colour: [0.05, 0.085, 0.035], from: 650, to: 1000 },
};
