// The game's address flags, read once, here. Each is a tool that measures, never a dial of the look: how anything is
// drawn is the game's one rule, not the address's (intent 0038). Each flag is said where it acts; this is only how
// they are read. These are all there are:
//   ?bench     the frame timed at the bench's views once the world is loaded, the numbers on the screen (tools/bench.js)
//   ?gputime   the GPU's own time per pass (tools/bench.js)
//   ?draws     every pass and draw a frame asks of the GPU, counted (tools/draws.js)
//   ?flyby     the camera flown by itself, to watch the levels of detail change (tools/flyby.js): `&secs=` the zoom's
//              seconds each way, `&px=` how tall the oak stands on the screen as the camera goes round it
//   ?stress    the stress stand, a test of the engine (src/scatter/stress.js); `?many=N` N more places round the meadow
//              (src/scatter/placed.js), `?herds=N` N herds roaming (src/scatter/herds.js)
//   ?bounds    what is solid round the walker, drawn as lines (src/world/bodies.js)
//   ?ghost     nothing stops the walker (src/world/bodies.js)
//   ?webgl     drawn through WebGL 2 where the browser has WebGPU too
//   ?embed     the page inside another (a film, the dashboard): no weather panel, no walk
//   ?truth     every asset at full detail at any distance, the gate's reference picture (tools/gate.js): everything within
//              `?truth=<metres>` of the eye (600 unless it says) measured as large on screen, so every engine draws its
//              finest; drawn at every pixel the canvas has; slow, offline (src/detail/measure.js)
//   ?light=full  a preview of light not yet cheap enough to be the game's (intent 0038, stage 9b): Hillaire's air in
//              froxels with its sky and shafts, GTAO, the sky probes marched ray by ray and their green bounce
//              (src/world/light/). Not a dial of the look: it goes once 9b is the default
// (The film player, cine/, reads its own address: its scene, its menu.)
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
/** Whether the address names it (`?ghost`). */
export const flag = (name) => Q.has(name);
/** Its value as a number (`?many=1000`), or d where it is not given or not a number. */
export const flagNum = (name, d = 0) => { const v = Q.get(name); return v == null || v === '' || !Number.isFinite(+v) ? d : +v; };
/** Its value as it is written (`?flyby=orbit`), or null. */
export const flagText = (name) => Q.get(name);
/** ?light=full: the light's unfinished parts drawn too (above). */
export const LIGHT_FULL = Q.get('light') === 'full';
