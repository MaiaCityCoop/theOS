// The biomes, from the registry (src/core/registry.js): every recipe of type 'biome', and the one a place of the land
// lays (its `where`). A biome's number (the sandbox's uSand.w) is its place in this list.
import { recipes } from '../core/registry.js';

export const BIOMES = recipes('biome');
/** The biome a place lays ('land', 'arid', 'bank', 'water', 'cutbank', 'bar'). */
export const at = (where) => BIOMES.find((b) => b.where === where);
