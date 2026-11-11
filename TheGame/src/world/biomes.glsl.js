// The biomes (biomes/*.js) as the land's shaders read them: their numbers written into GLSL, and the library's
// sandbox, where one biome is laid over all the land round the stage.
import { BIOMES, at } from '../../biomes/index.js';
import { MATERIALS } from '../../materials/index.js';

const v3 = (c) => `vec3(${c.map((x) => x.toFixed(4)).join(', ')})`, f = (x) => Number(x).toFixed(4);
const tex = (g) => { const i = MATERIALS.findIndex((m) => m.id === g.material); return `tA${i}, tN${i}`; };
const tile = (g) => `${f(g.tile[0])}, ${f(g.tile[1])}`;
const land = at('land'), arid = at('arid'), bank = at('bank'), water = at('water');
const idx = (b) => BIOMES.indexOf(b).toFixed(1);

/** The materials the land's shader samples, by their numbers. */
export const LAND_MATERIALS = [...new Set([land.floor, land.patches, land.slopes, arid.floor, arid.spots, bank.floor].map((g) => MATERIALS.findIndex((m) => m.id === g.material)).concat(MATERIALS.findIndex((m) => m.id === land.grass.carpet)))].sort();

export const BIOME_GLSL = /* glsl */ `
// ---- the biomes, from biomes/*.js ----
const vec3 LAND_GRASS_A = ${v3(land.grass.colours.a)}, LAND_GRASS_B = ${v3(land.grass.colours.b)};
const float LAND_GRASS_MUTE = ${f(land.grass.mute)}, LAND_STONES = ${f(land.stones)}, LAND_FLOWERS = ${land.grass.flowers ? '1.0' : '0.0'};
const vec3 ARID_GRASS_DRY = ${v3(arid.grass.colours.dry)};
const float ARID_COVER = ${f(arid.grass.cover)}, ARID_HEIGHT = ${f(arid.grass.height)}, ARID_STONES = ${f(arid.stones - land.stones)};
const float BANK_STONES = ${f(bank.stones - land.stones)};
const vec3 WATER_SHALLOW = ${v3(water.colours.shallow)}, WATER_DEEP = ${v3(water.colours.deep)};
const float WATER_TILE = ${f(water.floor.tile[0])};
#define LAND_FLOOR ${tex(land.floor)}
#define LAND_FLOOR_TILE ${tile(land.floor)}
#define LAND_PATCHES ${tex(land.patches)}
#define LAND_PATCHES_TILE ${tile(land.patches)}
#define LAND_SLOPES ${tex(land.slopes)}
#define LAND_SLOPES_TILE ${tile(land.slopes)}
#define LAND_CARPET tA${MATERIALS.findIndex((m) => m.id === land.grass.carpet)}
#define LAND_CARPET_N tN${MATERIALS.findIndex((m) => m.id === land.grass.carpet)}
#define ARID_FLOOR ${tex(arid.floor)}
#define ARID_FLOOR_TILE ${tile(arid.floor)}
#define ARID_SPOTS ${tex(arid.spots)}
#define ARID_SPOTS_TILE ${tile(arid.spots)}
#define BANK_FLOOR ${tex(bank.floor)}
#define BANK_FLOOR_TILE ${tile(bank.floor)}

// the library's sandbox: round (x, z) the land is one biome; z of uSand: on, w: which biome (its number in biomes/)
uniform vec4 uSand;
const float SAND_RIVER = ${idx(water)};   // the river's biome: a river of its own meanders through the sandbox
float sandW(vec2 p){ return uSand.z > 0.0 ? 1.0 - smoothstep(220.0, 340.0, length(p - uSand.xy)) : 0.0; }
float sandIs(float i){ return abs(uSand.w - i) < 0.5 ? 1.0 : 0.0; }
float placeArid(vec2 p, float natural){ return mix(natural, sandIs(${idx(arid)}), sandW(p)); }
float placeBank(vec2 p, float natural){ return sandIs(${idx(water)}) > 0.5 ? natural : mix(natural, sandIs(${idx(bank)}), sandW(p)); }   // the river's sandbox has its own banks
float placeOff(vec2 p, float natural){ return natural * (1.0 - sandW(p)); }   // paths, bare patches, outcrops: none in a sandbox
`;
