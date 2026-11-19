// When the world is complete for the camera as it stands (intent 0038): what the gate waits for before it takes a
// picture, never a timer (tools/gate.js), and what a page waits for before it shows its first view (`ready`). A still
// taken 120 frames and two and a half seconds after a jump to the pine stand, in a browser that had kept nothing,
// showed no tree at all (2026-11-17): the plants were still being made in the workers.
//
// Settled (settle, ready: what the gate waits for) is two things, one after the other:
//   - nothing is still out: every part whose work ends later than the frame that asked for it (a worker builds, the
//     browser reads back what it kept, the GPU compiles a pipeline or reads a map back) says how much of it is out, a
//     count asked once a frame (source: cheap), and every one says none. The first frame drawn so is `complete`: the
//     first the world shows (src/boot.js), whatever that frame put in;
//   - then the picture built over time (src/core/temporal.js) has come to rest on it: as many frames in a row in which
//     nothing changed (nothing packed again, put in or painted; the camera, its lens, the pixels, the detail governor as
//     they were) as it takes for what it kept before to have left the picture (temporal.settles).
// The sources, each said where it is made: every drawer (src/scatter/drawer.js: its kinds' coarse levels, the meshes,
// textures and skeletons asked of the recipes' workers, a level still growing out of the coarser one), the world's
// textures (src/materials/bake.js), the pipelines the GPU is compiling (src/core/compile.js), the ground round the camera
// passing from one map to the next or being read back (src/scatter/ground.js), the stones whose ground has been read back
// since the rocks last looked (src/scatter/rocks.js), the lakes being looked for (src/world/lakes.js), the city's plan
// (src/city/index.js). A source belongs to the part of the world that made it (partOf: what grows on the library's stage,
// src/boot.js); a part not drawn now (leave) holds nothing up, for it does no work meanwhile.
const SOURCES = new Map(), LEFT = new Set();
let part = '';
/** A part whose work ends later than the frame that asks for it: fn(held) -> how much of it is still out (0: none).
    held: the clock stood still since the last frame (a still's; what grows by the clock would never be done). */
export const source = (name, fn) => { let k = name; for (let i = 2; SOURCES.has(k); i++) k = `${name} (${i})`; SOURCES.set(k, { fn, part }); };
/** make(), every source it makes belonging to the part `name`. */
export function partOf(name, make) { const was = part; part = name; try { return make(); } finally { part = was; } }
/** The part `name` not drawn now (left: true), or drawn again (false). */
export const leave = (name, left = true) => void (left ? LEFT.add(name) : LEFT.delete(name));
/** What is still out, by source ({}: nothing). */
export function waiting() { const out = {}; for (const [name, s] of SOURCES) { const n = LEFT.has(s.part) ? 0 : s.fn(false); if (n) out[name] = n; } return out; }

let V = null, clock = NaN, frames = 0, still = 0, need = 32, first = null, whole = null;
const asks = new Set(), seen = new Float64Array(37), broke = new Set();
/** A promise: the world complete for the page's first view, and the picture built over time come to rest on it (what
    the gate waits for). */
export const ready = new Promise((res) => (first = res));
/** A promise: the first frame drawn complete: nothing out while it was drawn (nothing it would draw left out unmade,
    src/core/compile.js; nothing streaming or building). The first frame the world shows (src/boot.js): the picture built
    over time comes to rest on it in the frames after, as on any cut. What a frame puts in it draws, so a frame that put
    something in may be it: a part that keeps putting in never holds the start (2026-11-19: stores held to their class's
    room made again every 100 ms, and the veil stayed up for good, the master's check of main with A). Nor does a part
    that cannot say what it has out: it is said in the console (a still waits for it all the same: settle). */
export const complete = new Promise((res) => (whole = res));
let SHOWN = false; complete.then(() => (SHOWN = true));
/** Whether the first frame has been drawn (complete): what the start does all at once, and the world after it in turn. */
export const shown = () => SHOWN;

/** What a frame's view is compared by: the camera, the renderer (its canvas's pixels), the screen (the inside's pixels:
    the governor's ratio), the picture built over time, the shared uniforms (the clock, the detail governor). */
export function watch({ camera, renderer, screen, temporal, U }) { V = { camera, renderer, screen, temporal, U }; }
// (whether the view differs from the last frame's: the camera's place and turn, its lens, the pixels drawn and shown,
// the detail governor's factor)
function viewChanged() {
  const { camera, renderer, screen, U } = V, m = camera.matrixWorld.elements, p = camera.projectionMatrix.elements, c = renderer.domElement;
  let changed = false, i = 0;
  const is = (v) => { if (seen[i] !== v) { seen[i] = v; changed = true; } i++; };
  for (let k = 0; k < 16; k++) is(m[k]);
  for (let k = 0; k < 16; k++) is(p[k]);
  is(screen.inside); is(c.width); is(c.height); is(U.uLodInv.value);
  return changed;
}

/** After each frame the world was drawn in (src/boot.js), with whether it changed what is drawn besides the view
    (packed a tier again, put meshes or textures in: src/core/work.js changed). */
export function tick(did) {
  if (!V) return;
  frames++;
  const held = V.U.uTime.value === clock; clock = V.U.uTime.value;
  let out = 0, lost = 0;   // (lost: the parts that could not say what they have out: the start waits for them no more, a still does)
  for (const [name, s] of SOURCES) { if (LEFT.has(s.part)) continue; try { out += s.fn(held) || 0; } catch (e) { lost++; if (!broke.has(name)) { broke.add(name); console.warn(`settle: '${name}' could not say what is still out: the start waits for it no more, a still does`, e); } } }   // (a part that cannot say holds the world incomplete, and never stops the frame)
  const moved = viewChanged(), T = V.temporal;
  if (whole && !out) { whole({ frames }); whole = null; }
  still = moved || did || out + lost > 0 || T.age === 0 ? 0 : still + 1;
  need = T.settles;
  if (still < need || T.age < need) return;
  if (first) { first({ frames }); first = null; }
  for (const a of asks) if (frames > a.from) { asks.delete(a); clearTimeout(a.timer); a.res({ frames: frames - a.from, ms: Math.round(performance.now() - a.t0), still }); }
}

/** Whether something waits for the world to settle (a page's first view, a still, the gate): a camera that moves by
    itself (the library's stage circling its subject: src/stage/studio.js) stands still meanwhile, or it never would. */
export const settling = () => asks.size > 0;

/** A promise: the world complete for the camera as it stands now, resolved at a frame drawn after this call, once
    nothing has been out and nothing has changed for as long as the picture built over time takes to come to rest.
    { frames, ms, still }: how long it took, and for how many frames nothing changed. timeout (ms): rejected after it,
    with what is still out. */
export function settle({ timeout = 300000 } = {}) {
  return new Promise((res, rej) => {
    const a = { from: frames, t0: performance.now(), res };
    a.timer = setTimeout(() => { asks.delete(a); rej(new Error(`settle: after ${timeout / 1000} s, still out: ${JSON.stringify(waiting())}; ${still} frames of ${need} unchanged`)); }, timeout);
    asks.add(a);
  });
}
