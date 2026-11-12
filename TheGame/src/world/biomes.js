// The biomes, from the registry (src/core/registry.js): every recipe of type 'biome'. Each brings its own rule for where
// it lies (land.nodes.js: biomesAt). A biome's number (the sandbox's uSand.w) is its place in this list. Its `role` (a
// word: land, arid, bank, water, cutbank, bar) is for what runs on the CPU and cannot read a rule in node code: the
// rocks' bodies (rocksolid.js), the walker's start (camera/walk.js), the water's colours.
import { recipes } from '../core/registry.js';

export const BIOMES = recipes('biome');
/** The biome of a role. */
export const at = (role) => BIOMES.find((b) => b.role === role);
