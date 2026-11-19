// Compiling, one at a time. A material is compiled for the target it will be drawn into (its pipeline is that
// target's: compiled for the canvas, a material drawn into a target is compiled again as it is first drawn), and three
// keeps the state of the compile it is working through in the renderer itself, so two compiles at once can trip over
// each other. So every compile goes through here: in turn, each with its own target set for as long as it runs. Inside
// one compile the GPU compiles side by side all the same (three keeps up to sixteen in flight); what packs (compute)
// reads no target. A pipeline of the same make as one made is that one (sharePipelines).
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

let last = Promise.resolve(), turns = 0, ended = 0, active = 0;   // (turns: what the world waits for, waiting its turn here or being made; ended: turns over, of any kind; active: one being made now)

/** Run `fn` (it may be async) when its turn comes: after everything asked for here before it, and before anything asked
    after it (drawing what was just compiled, say, so that it does not draw while the next compile is half done).
    counted: whether the world waits for it (what is made ahead of need does not hold it up: src/boot.js). A promise of
    what it gives. */
export function inTurn(fn, counted = true) {
  if (counted) turns++;
  const go = () => { active++; return fn(); }, done = last.then(go, go), over = () => { active--; ended++; if (counted) turns--; };   // (in turn, whether the one before it went well or not)
  done.then(over, over);
  last = done.catch(() => {});   // (never two at once: three keeps the running compile's state in the renderer)
  return done;
}

/** One pipeline for whatever asks for one of the same make. three makes a compute pipeline for every node that runs a
    program, and a render pipeline for every material and target its key tells apart, and the GPU compiles each it is
    asked for, one at a time (2026-11-19, the master's Chrome probe: 189 compute pipelines in the start's first minute,
    of 82 programs in the whole world). Here each is kept by what it is made of: its code (each shader module by its
    WGSL), entry points and constants, its layout (each bind group by what it binds: layouts of equal entries are one to
    the GPU), and for drawing its vertex buffers, targets and their blending, primitive, depth and stencil, and samples;
    one asked for again of the same make is given the one made, or being made. What is laid out 'auto', or made of what
    was made before this (unknown here), is its own, never shared. On the renderer's device, once, before anything is
    compiled on it. */
export function sharePipelines(renderer) {
  const dev = renderer.backend?.device;
  if (!dev?.createComputePipelineAsync || dev.__sharing) return;
  dev.__sharing = true;
  const keys = new WeakMap(), codes = new Map(), made = new Map();   // (a module or a layout -> what it is made of; a WGSL -> its number; a make -> { promise, pipeline })
  const known = (fn, keyOf) => { const f = dev[fn]; dev[fn] = function (d) { const o = f.call(this, d), k = keyOf(d); if (k != null) keys.set(o, k); return o; }; };
  known('createShaderModule', (d) => { let n = codes.get(d.code); if (n == null) codes.set(d.code, (n = codes.size)); return `wgsl ${n}`; });
  known('createBindGroupLayout', (d) => JSON.stringify(d.entries));
  known('createPipelineLayout', (d) => (d.bindGroupLayouts.every((g) => keys.has(g)) ? d.bindGroupLayouts.map((g) => keys.get(g)).join(' | ') : null));
  // (a pipeline's make, as a string: its descriptor with each module and its layout by what they are made of, its label
  // left out; none where any of them is unknown, or its layout 'auto')
  const makeOf = (kind, d) => {
    if (!keys.has(d?.layout)) return null;
    let unknown = false;
    const s = JSON.stringify(d, (k, v) => { if (k === 'label') return undefined; if (k !== 'module' && k !== 'layout') return v; if (!keys.has(v)) unknown = true; return keys.get(v); });
    return unknown ? null : `${kind} ${s}`;
  };
  const later = (fn, kind) => { const f = dev[fn]; dev[fn] = function (d) {
    const k = makeOf(kind, d), had = k != null && made.get(k);
    if (k == null || had) return k == null ? f.call(this, d) : had.promise;
    const e = { promise: f.call(this, d), pipeline: null }; made.set(k, e);
    e.promise.then((p) => { e.pipeline = p; }, () => { if (made.get(k) === e) made.delete(k); });   // (one that failed is asked for again as it is next wanted)
    return e.promise;
  }; };
  later('createComputePipelineAsync', 'compute'); later('createRenderPipelineAsync', 'render');
  // (made at once: given the one made, else made and kept; one still being made cannot be waited for here)
  const now = (fn, kind) => { const f = dev[fn]; dev[fn] = function (d) {
    const k = makeOf(kind, d), had = k != null && made.get(k);
    if (had?.pipeline) return had.pipeline;
    const p = f.call(this, d); if (k != null && !had) made.set(k, { promise: Promise.resolve(p), pipeline: p });
    return p;
  }; };
  now('createComputePipeline', 'compute'); now('createRenderPipeline', 'render');
}

// ---- what the GPU is asked to compile, timed (__game.compiles(): src/boot.js) ----
// (2026-11-19: in Chrome the first view's 312 asks took minutes, about one a second. Whether they are as many pipelines,
// whether a turn's pipelines are compiled side by side or one slow one holds the rest, and whether the page's thread
// (three building their code) or the GPU's compiler takes the time: said here, at every start)
const PIPES = [], TURNS = [];
// (the turn being made: made one at a time, so a pipeline asked meanwhile is its, however late in the turn three asks
// it: three builds a compile's objects one after another, awaiting each, and yields to the page between them)
let running = null;
let modules = 0, moduleBytes = 0;   // (the shader modules asked for: distinct code, and its size)
/** Every pipeline and shader module the renderer's device is asked to make, kept with how long it took (compiles). On
    the renderer's device, once, after sharePipelines: a pipeline's time is from three's ask to its pipeline, and one
    given the one of its make (shared) is said so. */
export function watchCompiles(renderer) {
  const dev = renderer.backend?.device;
  if (!dev?.createRenderPipelineAsync || dev.__watched) return;
  dev.__watched = true;
  const given = new WeakSet();   // (what the device gave: given again, it was shared)
  const timed = (fn, kind) => { const make = dev[fn]; dev[fn] = function (d) { const p = { kind, name: d?.label ?? '', at: performance.now(), ms: null }; PIPES.push(p); running?.pipes.push(p); const r = make.call(this, d); if (given.has(r)) p.shared = true; else given.add(r); r.then(() => { p.ms = performance.now() - p.at; }, () => { p.ms = performance.now() - p.at; p.failed = true; }); return r; }; };
  timed('createRenderPipelineAsync', 'render'); timed('createComputePipelineAsync', 'compute');
  // (made at once: a pipeline first used in a frame, which waits for it)
  const now = (fn, kind) => { const make = dev[fn]; dev[fn] = function (d) { const p = { kind, name: d?.label ?? '', at: performance.now(), ms: 0, sync: true }; PIPES.push(p); running?.pipes.push(p); const r = make.call(this, d); if (given.has(r)) p.shared = true; else given.add(r); return r; }; };
  now('createRenderPipeline', 'render'); now('createComputePipeline', 'compute');
  const mod = dev.createShaderModule; dev.createShaderModule = function (d) { modules++; moduleBytes += d?.code?.length ?? 0; return mod.call(this, d); };
}
// (a pipeline by what it draws: three labels it by its material's name and id, a compute one by its node's name)
const familyOf = (p) => p.name.replace(/^(render|compute)Pipeline_(compute_)?/, '').replace(/_\d+$/, '');
const sum = (L, f) => L.reduce((s, x) => s + f(x), 0);
/** Read a turn's pipelines in the order it asked them: each one's own time (from when it was asked, or when the one
    before it was ready if that was later, to when it was ready: what the GPU took for it, where they went one at a
    time), and how many were ready before one asked earlier (none, of several: one at a time, each after those asked
    before it; many: side by side). */
function readTurn(t) {
  let last = t.at, overtook = 0;
  for (const p of t.pipes) {
    if (p.ms == null || p.shared) continue;   // (one shared is the one it was given: no compile of its own)
    const ready = p.at + p.ms;
    if (ready < last) overtook++;
    p.own = Math.max(0, ready - Math.max(p.at, last)); last = Math.max(last, ready);
  }
  return overtook;
}
/** What the GPU was asked to compile since the start (__game.compiles()):
      firstView   the first view's asks (the snapshot its first frame waits for), the turns that made any of them, the
                  pipelines those turns asked of the GPU (fewer than the asks: what three had made before, shared), the
                  time from the first of those turns to the last, and the GPU's own time in it (readTurn)
      pipelines   how many three asked for, render and compute; shared: given the one of their make (sharePipelines),
                  the GPU compiled the rest; sync: made as a frame first drew it; waiting: not made yet; the shader
                  modules (distinct code) and their size
      parallel    of the pipelines that turns asked after another, how many were ready before one asked earlier: none,
                  the GPU compiles one at a time (a slow one holds every one asked after it)
      turns       each turn of made-by-need: { name, asks, inView, pipes (the GPU compiled), shared, issued (ms from its start to the last pipeline
                  it asked: three building the code, the page's frames between), ms, gpu (its pipelines' own times:
                  near ms, the turn was the GPU's; far under, it waited on the page's thread), overtook, slowest (its
                  pipeline of the longest own time), failed (its compile threw: each of its asks made alone after it) }
      slowest     the pipelines of the longest own time (ms: from asked to ready, the wait for those before it in it);
                  byName: each material's or pass's pipelines, each one's own time
      open        what is asked and not made yet, each { name, pass, near (0: the first view waits for it), counted,
                  first (in the first view's snapshot), what } (tools/census.js counts the first view by it) */
export function compiles() {
  const ms = (t) => t.ms ?? performance.now() - t.at, issued = (t) => Math.max(0, ...t.pipes.map((p) => p.at - t.at)), gpu = (t) => sum(t.pipes, (p) => p.own ?? 0), compiled = (L) => L.filter((p) => !p.shared);
  const inView = (t) => (t.list && view ? t.list.filter((e) => view.has(e)).length : t.inView), read = TURNS.map((t) => ({ t, overtook: readTurn(t) })), first = TURNS.filter(inView), byName = {};
  const own = (p) => p.own ?? p.ms, top = (L) => L.reduce((a, p) => (own(p) > own(a) ? p : a));
  for (const p of PIPES) (byName[familyOf(p)] ||= []).push(Math.round(own(p) ?? -1));
  return {
    firstView: { asks: view?.size ?? null, turns: first.length, pipes: sum(first, (t) => compiled(t.pipes).length), ms: first.length ? Math.round(Math.max(...first.map((t) => t.at + ms(t))) - first[0].at) : 0, gpu: Math.round(sum(first, gpu)) },
    pipelines: { render: PIPES.filter((p) => p.kind === 'render').length, compute: PIPES.filter((p) => p.kind === 'compute').length, shared: PIPES.filter((p) => p.shared).length, sync: PIPES.filter((p) => p.sync).length, waiting: PIPES.filter((p) => p.ms == null).length, modules, kb: Math.round(moduleBytes / 1024) },
    parallel: { overtook: sum(read, (r) => r.overtook), of: sum(TURNS, (t) => Math.max(0, compiled(t.pipes).filter((p) => p.ms != null).length - 1)) },
    turns: read.map(({ t, overtook }) => ({ name: t.name, asks: t.asks, inView: inView(t), pipes: compiled(t.pipes).length, shared: t.pipes.length - compiled(t.pipes).length, issued: Math.round(issued(t)), ms: Math.round(ms(t)), gpu: Math.round(gpu(t)), overtook, ...(compiled(t.pipes).some((p) => p.ms != null) ? { slowest: ((p) => ({ name: familyOf(p), own: Math.round(own(p)) }))(top(compiled(t.pipes).filter((p) => p.ms != null))) } : {}), ...(t.failed ? { failed: true } : {}) })),
    slowest: compiled(PIPES).filter((p) => p.ms != null).sort((a, b) => own(b) - own(a)).slice(0, 20).map((p) => ({ name: familyOf(p), kind: p.kind, own: Math.round(own(p)), ms: Math.round(p.ms) })),
    byName,
    open: [...open].map((e) => ({ name: e.name, pass: e.pass, near: e.near, counted: e.counted, first: view ? view.has(e) : needed(e), what: e.what })),
  };
}

/** The world's source `compiling`: what it waits for to be compiled (src/core/settle.js): the turns it waits for, and
    what a frame asked to be made and is not yet (asked in the frame just drawn, its turn comes after it). */
export const countCompiles = () => {
  source('compiling', () => turns + asked - done);
  // (the first frame shown waits for what the first frame asked for, a snapshot taken as it was drawn: what streams in
  // after it, its asks with it, does not hold it: 2026-11-19, the veil waited for the whole running count, 460 and more
  // in Chrome for minutes, the master's registry reads)
  // (and only what the first view needs, asked as near (0): what may come after it, the far cascades' casters, the
  // canopy's probes, is made after it, nearest first, and fades in as it comes: ask)
  source('the first view', (held, frame) => { if (frame) view ??= new Set([...open].filter(needed)); if (!view) return [...open].filter(needed).length; let n = 0; for (const e of view) if (open.has(e)) n++; return n; }, { first: true });
};

// ---- made by need ----
const STATE = new WeakMap(), SAME = new WeakMap();   // what -> Map(pass -> 'asked' | 'made' | 'failed'); a copy -> what it is drawn as
const asking = new Map();   // a maker -> what was asked of it since the last flush ([{ what, pass, name, counted, near }])
const ASKED = new WeakMap();   // what -> Map(pass -> its ask), while it is asked (a later ask of it may say it is nearer)
let asked = 0, done = 0, now = '', flushing = false, view = null;
const open = new Set();   // (what was asked, counted, and is not made yet, nor failed: each { what, pass, name, counted, near })
const queued = new Map(), due = new Set();   // (a maker -> what waits for its turn; the makers with a turn waiting)
const own = (what) => SAME.get(what) ?? what;
const stateOf = (what) => { let S = STATE.get(what); if (!S) STATE.set(what, (S = new Map())); return S; };
// (an ask's rank: what the first view waits for, 0; then how near it is, metres from the eye; what is made ahead of
// need, after all of it)
const rank = (e) => (e.counted ? e.near : Infinity), needed = (e) => rank(e) === 0;
let reach = Infinity;   // (how far round the eye the first view waits for what is drawn: firstReach; until then all of it)
/** How far round the eye the first view waits for what is drawn, metres (src/boot.js: the near cascade's reach). */
export const firstReach = (m) => { reach = m; };
/** An ask's near (ask) for what is drawn from `m` metres from the eye on (where its band begins): 0 within the first
    view's reach, what it waits for; past it m, made after it (a tier's packing, src/scatter/tier.js; what the screen
    draws, src/core/screen.js) */
export const nearFrom = (m = 0) => (m < reach ? 0 : m);
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
// queued were minutes, 2026-11-19; the GPU compiles what it is asked at once side by side, 28 pipelines 1.9 s where
// one at a time took 5.1, B's on the M2)
function flush() {
  flushing = false;
  for (const [maker, list] of asking) {
    asking.delete(maker);
    let q = queued.get(maker); if (!q) queued.set(maker, (q = [])); q.push(...list);
    if (!due.has(maker)) { due.add(maker); inTurn(turn, list.some((e) => e.counted)); }
  }
}
// A turn: of the makers with a turn coming (each has one), the one whose asks rank first as it comes, not the first
// that was asked (2026-11-19: the far cascades' rocks and the canopy's probes were made before the plants' prepass,
// which the first frame needs most, as a frame draws them first). What the first view waits for before anything else,
// then the nearest first, what is made ahead of need last. A maker asked for some of what the first view waits for and
// some not makes the first view's now, and the rest in a turn of its own after
function turn() {
  let best = null, top = Infinity;
  for (const m of due) { const r = Math.min(...queued.get(m).map(rank)); if (!best || r < top) { best = m; top = r; } }
  if (!best) return null;
  const q = queued.get(best), list = top === 0 ? q.filter(needed) : q, rest = top === 0 ? q.filter((e) => !needed(e)) : [];
  if (rest.length) { queued.set(best, rest); inTurn(turn, rest.some((e) => e.counted)); } else { queued.delete(best); due.delete(best); }
  return made1(best, list);
}
function made1(maker, list) {
  const names = [...new Set(list.map((e) => e.name))], over = (L) => { done += L.filter((e) => e.counted).length; for (const e of L) { open.delete(e); ASKED.get(own(e.what))?.delete(e.pass); } };
  now = names.length > 1 ? `${names[0]} and ${names.length - 1} more` : names[0];
  // (the turn timed, compiles: the pipelines it asks of the GPU while it runs)
  const t = { name: now, asks: list.length, inView: 0, list, at: performance.now(), ms: null, pipes: [] };   // (list: while it runs, for its share of the first view as it is read)
  TURNS.push(t); running = t;
  return Promise.resolve(maker(list.map((e) => e.what)))
    .finally(() => { t.ms = performance.now() - t.at; t.inView = view ? list.filter((e) => view.has(e)).length : 0; t.list = null; if (running === t) running = null; })
    .then((got) => { for (const e of list) { const S = stateOf(own(e.what)); if (!got || got.has(e.what)) S.set(e.pass, 'made'); else S.delete(e.pass); } over(list); },
      (err) => {
        t.failed = true;
        if (list.length > 1) { console.warn(`compile: one of ${list.length} (${names[0]}, …) could not be compiled: each made alone`); return list.reduce((p, e) => p.then(() => made1(maker, [e])), Promise.resolve()); }
        stateOf(own(list[0].what)).set(list[0].pass, 'failed'); console.warn(`compile: ${names[0]} could not be compiled, and is not drawn`, err); over(list);
      })
    .finally(() => { now = ''; });
}
/** Ask `maker` (make(list): a promise, see flush) for `what` to be made for `pass`, unless it is made, being made, or
    could not be: with all else asked of it before this frame is over, in turn. name: what it is, for the veil and the
    console. counted: whether the world waits for it (made ahead of need, src/boot.js: not). near: 0, what the first
    view waits for (the screen's own passes, the packing that feeds them, the near cascade's casters); else metres from
    the eye, made after it, the nearest first, and faded in as it comes (src/world/shadow.js, light/canopy.js). Asked
    again, nearer or counted, it is taken so. What could not be made is never drawn, and the console says what it was. */
export function ask(what, pass, maker, name = '', counted = true, near = 0) {
  const S = stateOf(own(what));
  if (S.has(pass)) {
    const e = S.get(pass) === 'asked' && ASKED.get(own(what))?.get(pass);
    if (e && counted && !e.counted) { e.counted = true; asked++; open.add(e); }
    if (e && near < e.near) e.near = near;
    return;
  }
  S.set(pass, 'asked'); if (counted) asked++;
  let list = asking.get(maker); if (!list) asking.set(maker, (list = []));
  const e = { what, pass, name, counted, near }; list.push(e); if (counted) open.add(e);
  let A = ASKED.get(own(what)); if (!A) ASKED.set(own(what), (A = new Map())); A.set(pass, e);
  if (!flushing) { flushing = true; queueMicrotask(flush); }
}
/** Whether `what` may be drawn or run for `pass` now: once it is made. Else it is asked for (ask) and left out until
    it is. */
export function ready(what, pass, maker, name = '', near = 0) { if (made(what, pass)) return true; ask(what, pass, maker, name, true, near); return false; }
/** Each of `groups` (a function that asks for something, not counted) in order, each once what the one before asked has
    been made: what is made ahead of need, a little at a time, so that what a frame asks for meanwhile waits for little. */
export async function ahead(groups) { for (const g of groups) { g(); await Promise.resolve(); await last; } }   // (its flush is queued before the turn it waits for)
/** The name of `material` as it draws `object`: its own, else what it draws (the object's name, or its parent's, and
    the pass a twin of it draws in), which it is then given: three labels a pipeline by its material's name, and the
    veil says it (making). */
export const labelled = (material, object, pass = '') => (material.name ||= [object.name || object.parent?.name || material.type, pass].filter(Boolean).join(' '));
/** What frames asked to be made: how many, how many are, and what is being made now (the veil: src/boot.js); ended:
    how many turns are over, of any kind (what was made since a frame: src/boot.js draws again behind the veil only
    then); active: whether a turn is being made now. */
export const making = () => ({ asked, done, now, ended, active: active > 0 });
const computeMakers = new WeakMap();
const ownMakers = new WeakMap();
/** Draw `mesh` (a pass of its own: a quad drawn straight into the renderer's target as `camera` sees it, not an object of
    a scene) once it is made for its target, and say whether it drew. Until it is made, it is made aside, for the target
    set now (always of one kind: the same formats), and nothing is drawn: a pipeline first used in a frame is compiled
    there, at once, and the frame waits for the GPU to compile it (2026-11-19: the start's first frames in WebKit, 0.9
    to 1 s each, the master's own-time trace). name: what it is, for the veil and the console; near: as ask's. */
export function drawMade(renderer, mesh, camera, name, near = 0) {
  let maker = ownMakers.get(mesh);
  if (!maker) { const target = renderer.getRenderTarget(); ownMakers.set(mesh, (maker = (list) => compileList(renderer, target, list, camera, mesh))); }
  if (!ready(mesh, 'own', maker, (mesh.material.name ||= name), near)) return false;
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
