// The frame's classes (intent 0038): what the hard gates are shared out by, one table for the time and the memory. Plain
// JS, no three: the game reads it (src/core/gpu.js: every pool's memory is noted under its class), and so do the tools
// that measure it (tools/bench.js, tools/gate.js: each pass's time under the class its name is in).
//
//   CLASSES      each class's passes, by the names their code marks them with (src/core/gpu.js mark), in the frame's
//                order: a pass no class names is 'other', the slack
//   classOf(name)        the class a pass is in
//   MEMORY       the hard gate: the whole browser within 8 GB (every process: the page, the GPU's, the browser's own;
//                tools/gate.js paths measures it so)
//   BUDGET_MB    the GPU's pools a class, at most, by what each class must hold (below). What a pool is sized by, where
//                it may be larger or smaller (an atlas, the land's pages, the shadows' cascades, the culling's arenas
//                and pyramid), is the room its class has left (src/core/gpu.js roomOf), with the device's own limits
//                what they leave of the gate (about 3.7 GB) is the page's own heap and arrays and the browser's processes
//                (as they were measured, tools/gate.js paths: the renderer about 2 GB, the browser and its helpers 0.1 GB,
//                the GPU process's own beyond what it holds for the page)
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


/** The hard gate on memory: the whole browser, every process of it, bytes (8 GB). */
export const MEMORY = 8e9;
/** The GPU's pools a class may hold, MB: what each must hold, and room for it to grow, the whole what the gate leaves.
    geometry: the plants' and the rocks' meshes, their far ends' atlases (417 MB of views and 131 of clumps at stage 5),
      what the tiers pack and what the culling keeps of it, the growth map the placing reads, the picture drawn inside
      (its colour, motion and depth);
    ground: the land's pages (about 250 MB), the world's materials they are laid from, the relief near the eye, the
      ground's maps round the camera;
    light: the shadows' cascades (16 MB a cascade of 2048², depth only), the canopy map and its probes, the air's
      froxels and tables, the clouds' map;
    upscale/post: the picture kept over time at the screen's own pixels (two of it), the lens's targets;
    other: whatever no pool notes: three's own buffers, what the device makes beside them (src/core/gpu.js counts it) */
export const BUDGET_MB = { geometry: 2048, ground: 1024, light: 256, 'upscale/post': 256, other: 512 };
