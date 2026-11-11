// The material library: every texture the world is drawn with, one file each in this folder, in one recipe:
//
//   id, name, about     what it is
//   usedBy              where the world uses it, in words
//   swatch              its colour at a glance, [r, g, b]
//   bump                how deep its relief reads: larger is flatter
//   paint               GLSL that paints one tile of it from uv (sets h, col, rough), baked once at the start
//
// The baker (src/materials/bake.js) bakes every material listed here, in this order, into an albedo and a normal
// texture each; the world asks for them by id (tex.of('rock')). A new material: a file here and a line below.
import meadow from './meadow.js';
import dryearth from './dryearth.js';
import sand from './sand.js';
import path from './path.js';
import rock from './rock.js';
import water from './water.js';
import grasscarpet from './grasscarpet.js';
import noise from './noise.js';

// the order is the texture's number in the land's shaders (tA0 … tA7); new materials go at the end
export const MATERIALS = [meadow, dryearth, sand, path, rock, water, grasscarpet, noise];
export const MATERIAL = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));
