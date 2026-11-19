// Compiling, one at a time. A material is compiled for the target it will be drawn into (its pipeline is that
// target's: compiled for the canvas, a material drawn into a target is compiled again as it is first drawn), and three
// keeps the state of the compile it is working through in the renderer itself, so two compiles at once can trip over
// each other. So every compile goes through here: in turn, each with its own target set for as long as it runs. Inside
// one compile the GPU compiles side by side all the same (three keeps up to sixteen in flight); what packs (compute)
// reads no target, each of its shaders compiled once (shareComputeCompiles).
//
// Made by need (intent 0038, the cold start): nothing is drawn or run before it is made. A frame asks for what it draws
// and runs (the passes' routes: src/core/screen.js, src/world/shadow.js; a tier's packing: src/scatter/tier.js), and what
// is not made yet is left out of that frame and made here, aside, in turn: first asked, first made. Three would
// otherwise make it as it is first drawn, at once, and the frame would wait for the GPU to compile it (2026-11-18:
// Samuel's Safari, three minutes on "Lighting the world", where the start compiled everything the world could ever draw,
// gave each part 20 s, and then drew what had not come). What a frame asked for and is not made yet is out (the source
// `compiling`): the world is not complete before (src/core/settle.js). Nothing is given up on by a clock: a compile the
// GPU never answers holds the ones after it, and the veil says which it is (making: src/boot.js).
import { source } from './settle.js';

let last = Promise.resolve(), turns = 0;   // (turns: what the world waits for, waiting its turn here or being made)

/** Run `fn` (it may be async) when its turn comes: after everything asked for here before it, and before anything asked
    after it (drawing what was just compiled, say, so that it does not draw while the next compile is half done).
    counted: whether the world waits for it (what is made ahead of need does not hold it up: src/boot.js). A promise of
    what it gives. */
export function inTurn(fn, counted = true) {
  if (counted) turns++;
  const done = last.then(fn, fn);   // (in turn, whether the one before it went well or not)
  if (counted) done.then(() => turns--, () => turns--);
  last = done.catch(() => {});   // (never two at once: three keeps the running compile's state in the renderer)
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

/** The world's source `compiling`: what it waits for to be compiled (src/core/settle.js): the turns it waits for, and
    what a frame asked to be made and is not yet (asked in the frame just drawn, its turn comes after it). */
export const countCompiles = () => {
  source('compiling', () => turns + asked - done);
  // (the first frame shown waits for what the first frame asked for, a snapshot taken as it was drawn: what streams in
  // after it, its asks with it, does not hold it: 2026-11-19, the veil waited for the whole running count, 460 and more
  // in Chrome for minutes, the master's registry reads)
  source('the first view', (held, frame) => { if (frame) view ??= new Set(open); if (!view) return open.size; let n = 0; for (const e of view) if (open.has(e)) n++; return n; }, { first: true });
};

// ---- made by need ----
const STATE = new WeakMap(), SAME = new WeakMap();   // what -> Map(pass -> 'asked' | 'made' | 'failed'); a copy -> what it is drawn as
const asking = new Map();   // a maker -> what was asked of it since the last flush ([{ what, pass, name, counted }])
let asked = 0, done = 0, now = '', flushing = false, view = null;
const open = new Set();   // (what was asked, counted, and is not made yet, nor failed: each { what, pass, name, counted })
const queued = new Map(), due = new Set();   // (a maker -> what waits for its turn; the makers with a turn waiting)
const own = (what) => SAME.get(what) ?? what;
const stateOf = (what) => { let S = STATE.get(what); if (!S) STATE.set(what, (S = new Map())); return S; };
/** Whether `what` (a mesh, or a list of compute passes) is made for `pass`. */
export const made = (what, pass) => STATE.get(own(what))?.get(pass) === 'made';
/** Whether `what` was asked to be made for `pass` and is not yet (neither made nor failed). */
export const pending = (what, pass) => STATE.get(own(what))?.get(pass) === 'asked';
/** `copy` (another mesh of the same material and geometry: one pipeline) is made whenever `what` is (src/core/occlusion.js). */
export const sameAs = (copy, what) => void SAME.set(copy, what);
// what was asked of each maker since the last flush, made in one turn, side by side: a frame's asks of one pass are one
// compile (three keeps up to sixteen pipelines in flight), not one at a time. A maker's promise gives the set of what it
// reached (none: all of it); what it did not reach is asked again when it is next drawn. One of them that cannot be
// made fails the whole compile: then each is made alone, so that only it is left out, and the console names it and says
// why (2026-11-19: one pipeline WebKit would not make left every stand's and the meadow's prepass out, the game never
// ready, and the line named them all). Alone, in the order asked, in that same turn: each asked again at the back of
// the queue waited for everything asked since, and the first view for them (2026-11-19, the master)
// (a maker's turn takes all that waits for it when the turn comes, not what one frame asked: the frames' asks of one
// pass are one compile, as large as they have come to, side by side, not one small compile after another: 460 asks
// queued were minutes, 2026-11-19)
function flush() {
  flushing = false;
  for (const [maker, list] of asking) {
    asking.delete(maker);
    let q = queued.get(maker); if (!q) queued.set(maker, (q = [])); q.push(...list);
    if (!due.has(maker)) { due.add(maker); turnOf(maker, list.some((e) => e.counted)); }
  }
}
const turnOf = (maker, counted) => inTurn(() => {
  const list = queued.get(maker) ?? []; queued.delete(maker); due.delete(maker);
  return list.length ? made1(maker, list) : null;
}, counted);
function made1(maker, list) {
  const names = [...new Set(list.map((e) => e.name))], over = (L) => { done += L.filter((e) => e.counted).length; for (const e of L) open.delete(e); };
  now = names.length > 1 ? `${names[0]} and ${names.length - 1} more` : names[0];
  return Promise.resolve(maker(list.map((e) => e.what)))
    .then((got) => { for (const e of list) { const S = stateOf(own(e.what)); if (!got || got.has(e.what)) S.set(e.pass, 'made'); else S.delete(e.pass); } over(list); },
      (err) => {
        if (list.length > 1) { console.warn(`compile: one of ${list.length} (${names[0]}, …) could not be compiled: each made alone`); return list.reduce((p, e) => p.then(() => made1(maker, [e])), Promise.resolve()); }
        stateOf(own(list[0].what)).set(list[0].pass, 'failed'); console.warn(`compile: ${names[0]} could not be compiled, and is not drawn`, err); over(list);
      })
    .finally(() => { now = ''; });
}
/** Ask `maker` (make(list): a promise, see flush) for `what` to be made for `pass`, unless it is made, being made, or
    could not be: with all else asked of it before this frame is over, in turn. name: what it is, for the veil and the
    console. counted: whether the world waits for it (made ahead of need, src/boot.js: not). What could not be made is
    never drawn, and the console says what it was. */
export function ask(what, pass, maker, name = '', counted = true) {
  const S = stateOf(own(what));
  if (S.has(pass)) return;
  S.set(pass, 'asked'); if (counted) asked++;
  let list = asking.get(maker); if (!list) asking.set(maker, (list = []));
  const e = { what, pass, name, counted }; list.push(e); if (counted) open.add(e);
  if (!flushing) { flushing = true; queueMicrotask(flush); }
}
/** Whether `what` may be drawn or run for `pass` now: once it is made. Else it is asked for (ask) and left out until
    it is. */
export function ready(what, pass, maker, name = '') { if (made(what, pass)) return true; ask(what, pass, maker, name); return false; }
/** Each of `groups` (a function that asks for something, not counted) in order, each once what the one before asked has
    been made: what is made ahead of need, a little at a time, so that what a frame asks for meanwhile waits for little. */
export async function ahead(groups) { for (const g of groups) { g(); await Promise.resolve(); await last; } }   // (its flush is queued before the turn it waits for)
/** The name of `material` as it draws `object`: its own, else what it draws (the object's name, or its parent's, and
    the pass a twin of it draws in), which it is then given: three labels a pipeline by its material's name, and the
    veil says it (making). */
export const labelled = (material, object, pass = '') => (material.name ||= [object.name || object.parent?.name || material.type, pass].filter(Boolean).join(' '));
/** What frames asked to be made: how many, how many are, and what is being made now (the veil: src/boot.js). */
export const making = () => ({ asked, done, now });
const computeMakers = new WeakMap();
const ownMakers = new WeakMap();
/** Draw `mesh` (a pass of its own: a quad drawn straight into the renderer's target as `camera` sees it, not an object of
    a scene) once it is made for its target, and say whether it drew. Until it is made, it is made aside, for the target
    set now (always of one kind: the same formats), and nothing is drawn: a pipeline first used in a frame is compiled
    there, at once, and the frame waits for the GPU to compile it (2026-11-19: the start's first frames in WebKit, 0.9
    to 1 s each, the master's own-time trace). name: what it is, for the veil and the console. */
export function drawMade(renderer, mesh, camera, name) {
  let maker = ownMakers.get(mesh);
  if (!maker) { const target = renderer.getRenderTarget(); ownMakers.set(mesh, (maker = (list) => compileList(renderer, target, list, camera, mesh))); }
  if (!ready(mesh, 'own', maker, (mesh.material.name ||= name))) return false;
  renderer.render(mesh, camera); return true;
}
/** What makes compute passes (lists of them) on `renderer`, side by side: a maker for ask. */
export const computeMaker = (renderer) => { let m = computeMakers.get(renderer); if (!m) computeMakers.set(renderer, (m = (lists) => renderer.compileComputeAsync(lists.flat()).then(() => null))); return m; };

// ---- compiling: a part of the world for a target, now (whoever calls it is in its turn) ----
// (three r187 compiles for a target as if it had the canvas's depth: one without depth, a painter's tile, got pipelines
// its passes never use, and each pass compiled again as it was first drawn. The renderer's own setting is read as the
// compile begins, and is put back at once; as is draw, the render object function three reads only as it begins; and
// so are shown's visibility and frustum test: three takes what it compiles as the call begins)
async function compiling(renderer, target, root, camera, scene, draw, shown = []) {
  const was = renderer.getRenderTarget(), to = typeof target === 'function' ? target() : target, depth = renderer.depth, held = shown.map((o) => [o, o.visible, o.frustumCulled]);
  const own = Object.hasOwn(renderer, 'renderObject') ? renderer.renderObject : null;   // (one a tool set on the renderer itself: put back as it was)
  renderer.setRenderTarget(to);
  let compiled;
  try {
    if (to) renderer.depth = !!to.depthBuffer;
    renderer.renderObject = draw;
    for (const o of shown) { o.visible = true; o.frustumCulled = false; }
    compiled = renderer.compileAsync(root, camera, scene);
  } finally { renderer.depth = depth; if (own) renderer.renderObject = own; else delete renderer.renderObject; for (const [o, v, f] of held) { o.visible = v; o.frustumCulled = f; } }
  try { await compiled; } finally { renderer.setRenderTarget(was); }
}
const drawn = (renderer, route) => route ?? Object.getPrototypeOf(renderer).renderObject;
/** Compile `list` (meshes standing in `scene`) for `target` (a render target, or a function giving it now) as `camera`
    sees them, whether they are drawn now or not, side by side; route: what the pass draws of each (src/core/screen.js:
    the pass's twin of its material; none: as it is). A promise of the set of those three compiled. */
export async function compileList(renderer, target, list, camera, scene, route = null) {
  const want = new Set(list), seen = new Set(), draw = drawn(renderer, route);
  await compiling(renderer, target, list.length === 1 ? list[0] : scene, camera, scene, function (o, ...a) { if (!want.has(o)) return; seen.add(o); draw.call(this, o, ...a); }, list);
  return seen;
}
/** Compile what `camera` sees of `object` (a scene, or a part of one standing in `scene`) for `target` (null: the canvas)
    as `pass` draws it (route: as for compileList), in turn: what is compiled ahead of the frames that draw it (a subject
    the library shows, the city's plan, a painter's tile). Each object three compiles is then made for `pass`. A
    promise. */
export const compileFor = (renderer, target, object, camera, scene = null, route = null, pass = '') => inTurn(async () => {
  const seen = [], draw = drawn(renderer, route);
  await compiling(renderer, target, object, camera, scene, function (o, ...a) { seen.push(o); draw.call(this, o, ...a); });
  for (const o of seen) stateOf(own(o)).set(pass, 'made');
});
