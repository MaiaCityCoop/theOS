// The frame's classes (intent 0038): what the hard gates are shared out by, one table for the time and the memory. Plain
// JS, no three: the game reads it (src/core/gpu.js: every pool's memory is noted under its class), and so do the tools
// that measure it (tools/bench.js, tools/gate.js: each pass's time under the class its name is in).
//
//   CLASSES      each class's passes, by the names their code marks them with (src/core/gpu.js mark), in the frame's
//                order: a pass no class names is 'other', the slack
//   classOf(name)        the class a pass is in
// What the hard gates are and how much of each a class may take (the frame's ms, the GPU's memory) is the intent's
// requirement, src/core/budget.js.
export const CLASSES = {
  geometry: ['packing', 'occlusion', 'prepass', 'prepass, late', 'colour'],   // what is drawn: the tiers' packing and the surfaces' cut (src/scatter), the culling's pass one, the prepass, then the depth pyramid, pass two and what it finds (src/core/occlusion.js), the colour
  light: ['clouds', 'shadow map'],   // the clouds' shadow map (src/world/weather/clouds.js), the casters' (src/world/shadow.js)
  ground: ['ground map', 'pages, laid', 'relief', 'pages'],   // the ground under the camera (src/scatter/ground.js); the land's pages laid, the relief's points near the eye (src/terrain/relief.js), and the pages asked for after the prepass (src/terrain/pages.js)
  'upscale/post': ['lens', 'upscale'],   // the virtual camera's lens (src/camera/post.js), the upscale to the screen (src/core/temporal.js)
};
/** Every class, 'other' last. */
export const CLASS_NAMES = [...Object.keys(CLASSES), 'other'];
const CLASS = new Map(Object.entries(CLASSES).flatMap(([c, names]) => names.map((k) => [k, c])));
/** The class a pass is in ('other': none's). */
export const classOf = (name) => CLASS.get(name) ?? 'other';
