// Pine forest: stone pines in loose stands over a floor of their needles. A biome of the world, in the one recipe every
// biome follows (biomes/README.md); its trees are an asset of their own (assets/stonepine.js) that grows where this lies.
import { uint, smoothstep, mix } from 'three/tsl';
import { vnoise, groveAt, bent, turned, second } from '../src/world/noise.nodes.js';

// its groves and glades: what grows here is thick in groves `clumps` metres across and opens between them, one kind of
// tree leading here and another there in patches `patches` metres across (the one placement rule, src/scatter/rule.js,
// at the size of a grown tree; what is smaller in groves as much smaller); its grass follows them too
const GROVES = { clumps: 55, patches: 90 };

export default {
  uid: '170e8df4-254e-4df2-95e2-c584380cf14b',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Pine forest',
  kind: 'forest',
  about: 'Stone pines and holm oaks in loose stands, needles on the ground.',
  laid: 'Higher, drier ground',
  layer: 20,
  // where it lies, 0..1 (node code): stands of a few hundred metres (a slow noise, pushed by a quicker one so their edges
  // wander), kept off the river's banks. It reads its place bent (B), with a second swell far from home and its quicker
  // noise turned, so its stands are not blocks along the noise's grid (world/outlines.js; in JS: src/world/land.js woodAt)
  where: ({ p, d, w, B = bent(p) }) => smoothstep(0.6, 0.72, vnoise(B.div(1100), uint(80)).add(vnoise(turned(B, 2).div(520), uint(84)).sub(0.5).mul(second(p))).add(vnoise(turned(B).div(240), uint(81)).sub(0.5).mul(0.3))).mul(smoothstep(w.add(30), w.add(90), d)),
  floor: { material: '795da1c3-9cfe-4c4e-88c7-a58ce86444d4' /* pine needles */, tile: 2.2 },
  // green grass in tufts: most of it in the glades, little in the shade of the groves (coverAt: place by place, by the
  // stand's own noise; cover: on the whole, for the library's card)
  // (under the crowns none to speak of: a blade here and there over the whole floor reads as a sprinkle, not as grass;
  // it comes in where the stand thins, and stands thick in the glades)
  grass: { cover: 0.3, coverAt: ({ p }) => mix(0.9, 0.015, smoothstep(0.12, 0.55, groveAt(p, GROVES).mul(0.8))), tufts: true, height: 0.6, flowers: false },
  stones: 0.15,
  groves: GROVES,
  // how old its stands are: a slow noise between these years (its saplings come where the light reaches the ground)
  age: [30, 150],
  // far off, past where its trees are drawn, the land under it takes the colour of their crowns, in its groves
  // (src/terrain/material.js); from/to (metres): only if no tree of it says where its trees end
  canopy: { colour: [0.05, 0.085, 0.035] },
  // and where its bushes, herbs and litter have sunk away, their colour (fill: a bush covers most of its cell); the
  // pattern they make there as large as they are (src/terrain/layers.js: each stand's own plants' footprint)
  understory: { colour: [0.06, 0.1, 0.04], fill: 0.85 },
};
