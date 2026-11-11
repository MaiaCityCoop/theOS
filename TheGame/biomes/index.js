// The biome library: what lies and grows on each kind of land, one file each in this folder, in one recipe:
//
//   id, name, kind, about   what it is (kind: one word, the list's line under its name)
//   where                   which of the land's places lays it: 'land' (everywhere else), 'arid', 'bank', 'water';
//                           the places themselves are the land's masks (src/world/land.glsl.js)
//   floor                   its ground: { material (an id in materials/), tile: [metres, metres] }
//   patches, spots, slopes  more grounds within it, the same way
//   grass                   its grass, or null: { cover, height, colours, tufts, flowers, carpet }
//   stones                  how many stones lie on it: the chance of one in a stone's cell
//   colours                 its own colours where it needs them (the river's)
//
// The land's shaders are written from these files (src/world/biomes.glsl.js): change a number here and the world
// changes with it. A new biome on a place that exists: a file here and a line below; on a new kind of place, a mask too.
import meadow from './meadow.js';
import dryland from './dryland.js';
import riverbank from './riverbank.js';
import river from './river.js';

export const BIOMES = [meadow, dryland, riverbank, river];
export const BIOME = Object.fromEntries(BIOMES.map((b) => [b.id, b]));
/** The biome a place lays. */
export const at = (where) => BIOMES.find((b) => b.where === where);
