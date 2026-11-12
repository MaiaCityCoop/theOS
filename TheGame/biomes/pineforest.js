// Pine forest: stone pines in loose stands over a floor of their needles. A biome of the world, in the one recipe every
// biome follows (biomes/README.md); its trees are an asset of their own (assets/stonepine.js) that grows where this lies.
import { float, uint, smoothstep, mix, clamp } from 'three/tsl';
import { vnoise, groveAt, leadAt, bent, turned, second } from '../src/world/noise.nodes.js';

// its stand of trees, the same for every kind that grows here (an asset's placement.biome; each takes its `share` of
// the cells: src/scatter/trees.js): one tree at most in a cell of `cell` metres, as many as `density` says, in groves
// and glades `clumps` metres across; one kind leads here, another there, in patches `patches` metres across; the stand
// as old as a slow noise between age.stand's years says, one tree in `young` a sapling from `min` years; `seed` moves it all
const TREES = { cell: 10, density: 0.75, clumps: 55, patches: 90, age: { stand: [30, 150], young: 0.18, min: 3 }, seed: 300 };

export default {
  uid: '170e8df4-254e-4df2-95e2-c584380cf14b',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Pine forest',
  kind: 'forest',
  about: 'Stone pines in loose stands of a few hundred metres, holm oaks among them, their needles and leaves carpeting the ground in their shade, grass in the glades between.',
  laid: 'In stands over the higher, drier ground, away from the river',
  layer: 20,
  // where it lies, 0..1 (node code): stands of a few hundred metres (a slow noise, pushed by a quicker one so their edges
  // wander), kept off the river's banks. It reads its place bent (B), with a second swell far from home and its quicker
  // noise turned, so its stands are not blocks along the noise's grid (world/outlines.js; in JS: src/world/land.js woodAt)
  where: ({ p, d, w, B = bent(p) }) => smoothstep(0.6, 0.72, vnoise(B.div(1100), uint(80)).add(vnoise(turned(B, 2).div(520), uint(84)).sub(0.5).mul(second(p))).add(vnoise(turned(B).div(240), uint(81)).sub(0.5).mul(0.3))).mul(smoothstep(w.add(30), w.add(90), d)),
  floor: { material: '795da1c3-9cfe-4c4e-88c7-a58ce86444d4' /* pine needles */, tile: [2.2, 3.5] },
  // green grass in tufts: most of it in the glades, little in the shade of the groves (coverAt: place by place, by the
  // stand's own noise; cover: on the whole, for the library's card)
  grass: { cover: 0.3, coverAt: ({ p }) => mix(0.9, 0.1, clamp(groveAt(p, TREES).mul(0.8), 0, 1)), tufts: true, height: 0.6, flowers: false },
  stones: 0.15,
  trees: TREES,
  // its understory: the shrubs that grow here (assets whose placement.stand is `shrubs`), a stand of their own, read the
  // same way: thickets `clumps` metres across, one kind leading in patches
  // Thick, as a Mediterranean pine wood's is: a bush every three metres in its thickets, bushes merging, open litter
  // between them; where the holm oaks lead (the first share of the stand's kinds: deep shade) only a quarter of it
  shrubs: { cell: 3, density: 0.9, clumps: 24, patches: 26, seed: 520,
    // far off, where its bushes have sunk away, the floor wears their colour (fill: a bush covers most of its cell;
    // grain: a bush to a tree)
    cover: { colour: [0.06, 0.1, 0.04], fill: 0.85, grain: 0.3 },
    where: ({ p }) => mix(0.25, 1, smoothstep(0.24, 0.38, leadAt(p, TREES).mul(0.7).add(0.15))) },
  // far off, past where its trees are drawn, the land under it takes the colour of their crowns, in its stand's groves
  // (src/terrain/material.js); from/to (metres): only if no tree of it says where its trees end
  canopy: { colour: [0.05, 0.085, 0.035], from: 650, to: 1000 },
};
/** How open the wood is at p, 0 under its groves … 1 in its glades: for what grows by the light (a shrub's placement.where). */
export const gladeAt = (p) => float(1).sub(clamp(groveAt(p, TREES).mul(0.8), 0, 1));
