// The biomes, from the registry (src/core/registry.js): every recipe of type 'biome'. Each brings its own rule for where
// it lies (land.nodes.js: biomesAt). A biome's number (the sandbox's uSand.w) is its place in this list.
import { recipes } from '../core/registry.js';

export const BIOMES = recipes('biome');
/** The base biome (under all the others) and the water's. */
export const BASE = BIOMES.find((b) => b.base), WATER = BIOMES.find((b) => b.water);
