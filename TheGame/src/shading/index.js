// The shading models: the ways a thing of the heap takes the light (src/scatter/stress.js draws with them). Each is one
// file in this folder, found here by itself; a kind's look names one by its id (assets/zoo/index.js: lookOf's `model`),
// and every kind of every family is then drawn by one shader, the model a branch of it: a new model is a file, not a
// draw call.
//
//   export default {
//     id: 'matte',     its name: what a look says
//     order: 0,        where it stands among the others (a look that gives a number 0 … 1 instead of a name takes the
//                      model at that share of the list: the test herds do)
//     lit(c) -> vec3   the pixel's light, from what the stand hands it (all TSL nodes):
//       c.colour   its colour there, weathered (snow, wet)     c.plain    that colour lit plainly: sky and sun
//       c.tint     its mean colour (rgb)                       c.second   its second tint (rgb)
//       c.normal   its normal                                  c.eye      the way to the eye
//       c.toSun    the way to the sun                          c.half     half way between the two
//       c.sun      the sun's light there (rgb)                 c.sky      the sky's (rgb);  c.skyLight(dir): from a direction
//       c.ndl, c.ndh, c.nv   the usual cosines (normal with sun, half, eye), none under 0
//       c.back     how far the eye looks into the sun (0 … 1)  c.gloss    how it shines (its look's, less where rough or wet)
//       c.glow, c.through    its look's: how it glows, how much light passes through it
//       c.height   its own texture's height there (0 … 1)      c.bare     how much of it is free of snow (0 … 1)
//       c.phase    a number of its own (its kind's)            c.time     the clock, seconds
//   }
const FOUND = import.meta.glob(['./*.js', '!./index.js'], { eager: true, import: 'default' });
export const MODELS = Object.values(FOUND).filter((M) => M?.id && M.lit).sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.id < b.id ? -1 : 1));
/** The number of the model a look names: by its id, or (a number 0 … 1) the one at that share of the list. */
export const modelOf = (m) => (typeof m === 'string' ? Math.max(0, MODELS.findIndex((M) => M.id === m)) : Math.min(MODELS.length - 1, Math.floor((m ?? 0) * MODELS.length)));
