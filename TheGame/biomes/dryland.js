// Dry land: where the land is dry. A biome of the world, in the one recipe every biome follows (biomes/README.md).
import { uint, smoothstep } from 'three/tsl';
import { vnoise, bent, turned, second } from '../src/world/noise.nodes.js';

const SPOTS = 45;   // metres, the sandy spots' noise
export default {
  uid: '36d9e9fe-93ab-42c7-9e1d-8f32bbe99019',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'biome',
  name: 'Dry land',
  kind: 'steppe',
  about: 'Cracked earth with sandy spots, the grass in yellowing tufts, more stones lying about.',
  laid: 'Where the land is dry',   // where it lies, in words (the library's card)
  layer: 10,                                               // laid in this order, lowest first (src/world/land.nodes.js: biomesAt)
  // where it lies, 0..1 (node code): where the land is dry, a slow noise over kilometres and a finer one along its edge.
  // It reads its place bent (B), with a second swell far from home and its finer noise turned, so it is not blocks along
  // the noise's grid (world/outlines.js; in JS, the same: src/world/land.js aridAt)
  where: ({ p, B = bent(p) }) => smoothstep(0.5, 0.66, vnoise(B.div(700), uint(50)).add(vnoise(turned(B, 2).div(330), uint(54)).sub(0.5).mul(second(p))).add(vnoise(turned(B).div(150), uint(51)).sub(0.5).mul(0.3))),
  floor: { material: '082f0183-5d92-4ac8-821c-14408d3ee056' /* dryearth */, tile: 4.0 },
  // sandy spots in it, where a noise of SPOTS metres says (its size: kept as long as the land's layer map holds them,
  // src/terrain/layers.js)
  spots: { material: '2f329f07-d2ba-4dc8-a6e3-73053c65e10f' /* sand */, tile: 2.0, where: ({ p }) => smoothstep(0.55, 0.72, vnoise(p.div(SPOTS), uint(73))), size: SPOTS },
  grass: {
    cover: 0.45,                                           // grass only in tufts, and less of it
    tufts: true,
    height: 0.6,
    colours: { dry: [0.36, 0.29, 0.12] },                  // the colour the grass dries to
    flowers: false,
  },
  stones: 0.37,
};
