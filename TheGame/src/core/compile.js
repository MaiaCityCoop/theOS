// Compiling, one at a time. A material is compiled for the target it will be drawn into (its pipeline is that
// target's: compiled for the canvas, a material drawn into a target is compiled again as it is first drawn), and three
// keeps the state of the compile it is working through in the renderer itself, so two compiles at once can trip over
// each other. So every compile before the first frame, and the city's whenever its plan comes, goes through here: in
// turn, each with its own target set for as long as it runs. Inside one compile the GPU compiles side by side all the
// same (three keeps up to sixteen in flight); what packs (compute) reads no target and compiles beside any of these,
// each of its shaders once (shareComputeCompiles). What the GPU is compiling at any moment is counted (countCompiles): a
// pipeline asked for aside is not drawn with until it has come, so the world is not complete before (src/core/settle.js).
import { source } from './settle.js';

let last = Promise.resolve(), turns = 0, aside = 0;   // (turns: compiles waiting their turn here or running; aside: pipelines the GPU is compiling)

/** Run `fn` (it may be async) when its turn comes: after everything asked for here before it, and before anything asked
    after it (drawing what was just compiled, say, so that it does not draw while the next compile is half done). A
    promise of what it gives. */
export function inTurn(fn) {
  turns++; const done = last.then(fn, fn);   // (in turn, whether the one before it went well or not)
  done.then(() => turns--, () => turns--);
  // (and the next one's turn comes when this one is done or after 20 s, whichever is first: a compile the GPU never
  // answers held every one after it, and the page with them)
  last = Promise.race([done.catch(() => {}), new Promise((res) => setTimeout(res, 20000))]);
  return done;
}

/** A compute pipeline asked for while another of the same shader is being compiled waits for that one, and is then
    asked for itself: the browser keeps a compiled pipeline by what it is made of and gives it again at once. three makes
    a pipeline for every compute node whatever its code (the tiers' 63 packing passes are 26 shaders), and asked for side
    by side each was compiled in full (2026-11-15: ten of them again shaders of 120 to 150 KB). On the renderer's
    device, once. */
export function shareComputeCompiles(renderer) {
  const dev = renderer.backend?.device;
  if (!dev?.createComputePipelineAsync || dev.__sharing) return;
  dev.__sharing = true;
  const make = dev.createComputePipelineAsync, going = new WeakMap();   // a shader module: the compile of it running
  dev.createComputePipelineAsync = function (d) {
    const m = d?.compute?.module, first = m && going.get(m);
    if (first) {
      const copy = { label: d.label, layout: d.layout, compute: d.compute };   // (three empties the descriptor it hands over once this returns)
      return first.then(() => make.call(this, copy), () => make.call(this, copy));
    }
    const p = make.call(this, d);
    if (m) { going.set(m, p); const done = () => { if (going.get(m) === p) going.delete(m); }; p.then(done, done); }
    return p;
  };
}

/** Count what the GPU compiles aside (a render or compute pipeline asked for with a promise: what three's compileAsync
    and compileComputeAsync ask for), and every compile waiting its turn here: the world's source `compiling`. On the
    renderer's device, once. */
export function countCompiles(renderer) {
  const dev = renderer.backend?.device;
  if (dev && !dev.__counting) {
    dev.__counting = true;
    for (const k of ['createRenderPipelineAsync', 'createComputePipelineAsync']) {
      const make = dev[k]; if (!make) continue;
      dev[k] = function (d) { const p = make.call(this, d); aside++; p.then(() => aside--, () => aside--); return p; };
    }
  }
  source('compiling', () => aside + turns);
}

/** Compile what `camera` sees of `object` (a scene, or a part of one standing in `scene`) for `target` (a render
    target, or a function giving it when its turn comes; null: the canvas), in turn. What is visible is read when its
    turn comes. route: what a pass draws of each object (src/core/screen.js: the pass's twin of its material), as the
    renderer's render object function is for a frame (three's compile reads none). A promise. */
export const compileFor = (renderer, target, object, camera, scene = null, route = null) => inTurn(async () => {
  const was = renderer.getRenderTarget(), to = typeof target === 'function' ? target() : target, depth = renderer.depth;
  renderer.setRenderTarget(to);
  // (three r187 compiles for a target as if it had the canvas's depth: one without depth, a painter's tile, got
  // pipelines its passes never use, and each pass compiled again as it was first drawn. The renderer's own setting is
  // read as the compile begins, and is put back at once; as is the route, which three reads only as the compile begins)
  let done; try { if (to && !to.depthBuffer) renderer.depth = false; if (route) renderer.renderObject = route; done = renderer.compileAsync(object, camera, scene); } finally { renderer.depth = depth; if (route) delete renderer.renderObject; }
  try { await done; } finally { renderer.setRenderTarget(was); }
});
