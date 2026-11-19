// The growth map (intent 0038, stage 7): what the larger things placed on the land leave for the smaller ones to read,
// after Horizon Zero Dawn's GPU placement (van Muijden, GDC 2017), where each layer of placement writes the maps the next
// one reads. For each layer that writes, a window of N x N texels kept round the camera as the land's layer map is
// (src/terrain/layers.js): a texel's place in it is its place on the land modulo N, so as the camera moves only the rows
// and columns the window comes onto are worked out, on the GPU, a layer at a time, the largest first. Its texel is the
// layer's band limit (rule.js layersOf: half its smallest crown; a finer one holds nothing more), its side N the fewest
// texels (a power of two) that reach as far as what reads it is drawn (its `far`), within the room the geometry's class
// has left (src/core/gpu.js roomOf), else the most that fits there, and said.
//
// For every layer that writes (src/scatter/rule.js: those whose things are as large as a texel) it keeps two things:
//   - what stands in each of the layer's own cells, a word a cell (rule.js recordOf: which of its things, which of its
//     shapes, how tall), placed once by the rule (which reads what the layers before it left). What reads the layer
//     reads this instead of placing its things again: the layer's gather below, and whatever tests itself against the
//     ground its things really cover (their feet: rule.js footAt). Its own window of cells, kept as the texels' is,
//     modulo its side (a power of two, as many cells as the gather of the texels' window reads);
//   - a word a texel, four bytes:
//       shade    how much of the light coming down its crowns take here, 0..1: each crown as large as it is drawn, the
//                light through it Beer–Lambert's, the texel's mean (rule.js: the light under the crowns)
//       feet     whether the feet of any of its things may reach into this texel (1, else 0): where none may, what reads
//                the ground here asks no further (rule.js footAt). What a thing covers is never drawn into the map: a
//                trunk, a stone or a branch is far smaller than a texel
//       litter   how much it drops here (needles, leaves, cones, branches), 0..1
//       lead     whose litter that most is: the dropping thing's number + 1 (rule.js), 0 none
// A layer's word is worked out by gathering what stands in its cells round the texel: what a placed thing writes is
// worked out where it is written, so no two things write one texel, and the map is the same whatever path the camera
// took to it. Where a layer's window does not reach, nothing of that layer has left anything.
import * as THREE from 'three/webgpu';
import { Fn, If, float, int, uint, vec2, ivec2, uniform, globalId, floor, clamp, round } from 'three/tsl';
import { gpuStorage, roomOf } from '../core/gpu.js';
import { did } from '../core/work.js';
import { ownGpuMs, pace, frameShare } from '../core/pace.js';
import { SUBMIT_MS } from '../core/budget.js';
import { source } from '../core/settle.js';

/** Texels a window moves by at once; the most layers that write (a word each). */
export const SNAP = 8, WORDS = 3;

/** A share 0 … 1 as one byte (node code), and byte k of a 32-bit word back as a share: how a word packs four of them
    (this map's, the land's layer map's: src/terrain/layers.js). */
export const byte = (v) => uint(round(clamp(v, 0, 1).mul(255)));
export const un = (w, k) => float(w.shiftRight(typeof k === 'number' ? uint(8 * k) : uint(k).mul(uint(8))).bitAnd(uint(255))).mul(1 / 255);   // (k: a number, or a node: a loop's)

let CURRENT = null;
/** The world's growth map, once the trees' engine has made it (null before, and without WebGPU): what the meadow reads
    too, the smallest layer of all (src/scatter/grass.js). */
export const growthMap = () => CURRENT;

/** The map: its buffer (made with the renderer, on the GPU only, as its passes are built), what reads it, and how it is
    kept round the camera. fields: a word's each, in its order ({ band: its texel, metres (the layer's band limit:
    rule.js layersOf), far: metres its farthest reader is drawn to at the most }). */
export function createGrowth(renderer, fields) {
  // (each word's texel, side and first texel as uniforms besides (uT, uN, uBase): every layer's passes and readers are
  // code alike, the words differing only in them)
  const W = Math.max(1, Math.min(WORDS, fields.length)), words = fields.slice(0, W).map(({ band, far }) => ({ T: band, far, N: 4 * SNAP, base: 0, origin: uniform(new THREE.Vector2(0, 0)), window: null, uT: uniform(band), uN: uniform(4 * SNAP, 'int'), uBase: uniform(0, 'uint') }));
  for (const Wd of words) while ((Wd.N / 2 - SNAP) * Wd.T < Wd.far) Wd.N *= 2;   // (the fewest texels that reach its `far` from where its snap leaves it)
  let B = null, writers = [], passes = [], fills = [], uRect = uniform(new THREE.Vector4()), uCells = uniform(new THREE.Vector4()), version = 0, key = '';
  const slot = (ix, iz, w) => { const Wd = words[w], n = Wd.uN; return uint(ix.bitAnd(n.sub(1)).add(iz.bitAnd(n.sub(1)).mul(n))).add(Wd.uBase); };
  const inside = (ix, iz, w) => { const o = words[w].origin, n = words[w].uN; return ix.greaterThanEqual(int(o.x)).and(ix.lessThan(int(o.x).add(n))).and(iz.greaterThanEqual(int(o.y))).and(iz.lessThan(int(o.y).add(n))); };
  /** What the layers' words say at p (metres), w each of the words asked: { shade, litter } read between the four
      texels round it, and the lead and the feet of the one it lies in; nothing where its window does not reach. */
  const read = (p, w) => {
    const T = words[w].uT, u = p.div(T).sub(0.5), i = ivec2(floor(u)).toVar(), f = u.sub(floor(u)).toVar(), near = ivec2(floor(p.div(T))).toVar();
    const out = { shade: float(0).toVar(), feet: float(0).toVar(), litter: float(0).toVar(), lead: uint(0).toVar() };
    If(inside(i.x, i.y, w).and(inside(i.x.add(1), i.y.add(1), w)), () => {
      for (const [dx, dz, k] of [[0, 0, float(1).sub(f.x).mul(float(1).sub(f.y))], [1, 0, f.x.mul(float(1).sub(f.y))], [0, 1, float(1).sub(f.x).mul(f.y)], [1, 1, f.x.mul(f.y)]]) {
        const v = B.element(slot(i.x.add(dx), i.y.add(dz), w)).toVar();
        out.shade.addAssign(un(v, 0).mul(k)); out.litter.addAssign(un(v, 2).mul(k));
      }
      const v = B.element(slot(near.x, near.y, w)).toVar();
      out.lead.assign(v.shiftRight(uint(24))); out.feet.assign(un(v, 1));
    });
    return out;
  };
  /** What stands in cell c (ivec2) of the layer whose word is w, as its record (rule.js recordOf): a node, read from
      its window of cells (where c is one the gather of its texels' window reads: whoever asks keeps to that). */
  const places = [], placeOf = (w) => (places[w] ||= { side: uniform(1, 'int'), base: uniform(0, 'uint') });   // (each layer's cells' window: its side and its first, uniforms set as it is built)
  const at = (w, c) => { const P = placeOf(w); return B.element(uint(c.x.bitAnd(P.side.sub(1)).add(c.y.bitAnd(P.side.sub(1)).mul(P.side))).add(P.base)); };
  // (while it all holds more than the geometry's room, the largest word halved, and said: its words and the cells its
  // gather reads, 4 bytes each)
  const sides = (list) => {
    const bytes = () => words.reduce((b, Wd, w) => { const L = list.find((x) => x.w === w); return b + 4 * (Wd.N * Wd.N + (L ? 2 ** (2 * Math.ceil(Math.log2(L.span(Wd.N)))) : 0)); }, 0);
    const held = words.map((Wd) => Wd.N);
    while (bytes() > roomOf('geometry')) { const Wd = words.reduce((a, b) => (b.N > a.N ? b : a)); if (Wd.N <= 4 * SNAP) break; Wd.N /= 2; }
    words.forEach((Wd, w) => { if (Wd.N < held[w]) console.warn(`the growth map, word ${w}: ${held[w]} texels a side reach its readers (${Math.round(Wd.far)} m); ${Wd.N} fit the geometry's room: ${Math.round((Wd.N / 2 - SNAP) * Wd.T)} m`); });
  };
  /** The passes, one a layer that writes, in their order (rule.js writersOf): record(c), what stands in cell c of the
      layer, worked out for the cells the gather of the texels to be worked out reads (cells(x0, w): those along a side
      for the texels x0 … x0 + w; span(n): the most along a side for n texels); gather(q), what the layer leaves at the
      texel's middle q ({ shade, feet, litter, lead }); its word is w; feet(p), whether the ground at p is covered by the
      layer's things (null: none of them covers any). */
  const build = (list) => {
    writers = list; sides(list);
    // (one buffer for all of it: each word's texels, then each layer's cells; a pass binds few)
    let base = 0;
    for (const Wd of words) { Wd.base = base; base += Wd.N * Wd.N; Wd.uN.value = Wd.N; Wd.uBase.value = Wd.base; }
    for (const { w, span } of writers) { const side = 2 ** Math.ceil(Math.log2(span(words[w].N))), P = placeOf(w); P.side.value = side; P.base.value = base; base += side * side; }
    const buf = gpuStorage('uint', base, 'the growth map', 'geometry'); B = buf.node;
    P = pace(writers.reduce((n, { w, span }) => n + Math.ceil(span(words[w].N) / 8) ** 2 + Math.ceil(words[w].N / 8) ** 2, 0));   // (its unit: a whole window, above)
    fills = writers.map(({ w, record }) => Fn(() => {
      const g = globalId.xy;
      If(g.x.lessThan(uint(uCells.z)).and(g.y.lessThan(uint(uCells.w))), () => {
        const c = ivec2(int(g.x).add(int(uCells.x)), int(g.y).add(int(uCells.y))).toVar();
        at(w, c).assign(record(c));
      });
    })().computeKernel([8, 8, 1]));
    passes = writers.map(({ w, gather }) => Fn(() => {
      const g = globalId.xy;
      If(g.x.lessThan(uint(uRect.z)).and(g.y.lessThan(uint(uRect.w))), () => {
        const ix = int(g.x).add(int(uRect.x)), iz = int(g.y).add(int(uRect.y)), q = vec2(float(ix), float(iz)).add(0.5).mul(words[w].uT);
        const L = gather(q);
        B.element(slot(ix, iz, w)).assign(byte(L.shade).bitOr(byte(L.feet).shiftLeft(uint(8))).bitOr(byte(L.litter).shiftLeft(uint(16))).bitOr(uint(L.lead).min(uint(255)).shiftLeft(uint(24))));
      });
    })().computeKernel([8, 8, 1]));
  };
  // (each layer over every rectangle of its window before the next layer: what a layer reads of the one before is
  // worked out first (a later layer's window within an earlier one's: its readers are nearer); and what stands in its
  // cells before what it leaves at its texels. A cell worked out again is the same: the rule is the rule)
  const run = (n, rects) => {
    const { cells } = writers[n];
    for (const [x0, z0, ww, hh] of rects) { const [cx, cx1] = cells(x0, ww), [cz, cz1] = cells(z0, hh); jobs.push({ n, fill: true, x: cx, z: cz, w: cx1 - cx, h: cz1 - cz, r: 0, c: 0 }); }
    for (const [x0, z0, ww, hh] of rects) jobs.push({ n, fill: false, x: x0, z: z0, w: ww, h: hh, r: 0, c: 0 });
  };
  // ---- the work, a piece at a time ----
  // (in that order, in pieces of whole workgroups, each its own submission: as many workgroups a frame as fit the frame's
  // share for geometry (frameShare: behind the veil, till the first view is shown, the whole frame's), by each
  // piece's own time on the GPU (src/core/pace.js), so no submission holds the GPU long. A window come onto whole (the
  // first time, a jump, the rule changed) was one dispatch of all of it, 256 workgroups of a layer's gather: 2 s in
  // WebKit after the first view, 2026-11-19. What reads the map packs again once all of it is worked out (version); the
  // world is not complete before (settle). Without the GPU's clock to ask (the CPU's stand-in), all of it at once)
  // (its unit: a whole window a frame, every writer's fill and gather, set as the writers are (build): a time heard on the
  // page's thread never takes it under that (src/core/pace.js), so a stall charged to it never starves it, nor the
  // world's Ready, which waits for it; and a piece never more than SUBMIT_MS by what a workgroup last took (each))
  const jobs = [], each = { ms: 0 };   // (a job: writer n's rectangle of cells (fill) or texels, x z w h; r, c: its workgroups' rows done, and of the next row)
  let P = pace(1);
  source('the growth map', () => jobs.length);
  /** Its next k workgroups at most, as a rectangle: whole rows where k holds one, else part of a row. -> [x, z, w, h, k] */
  const take = (J, k) => {
    const cols = Math.ceil(J.w / 8), rows = Math.ceil(J.h / 8);
    if (J.c === 0 && k >= cols) { const m = Math.min(rows - J.r, Math.floor(k / cols)), R = [J.x, J.z + J.r * 8, J.w, Math.min(m * 8, J.h - J.r * 8), m * cols]; J.r += m; return R; }
    const m = Math.min(cols - J.c, k), R = [J.x + J.c * 8, J.z + J.r * 8, Math.min(m * 8, J.w - J.c * 8), Math.min(8, J.h - J.r * 8), m];
    J.c += m; if (J.c === cols) { J.c = 0; J.r++; }
    return R;
  };
  const work = () => {
    P.tick();
    let clocked = true;
    while (jobs.length && (P.left > 0 || !clocked)) {
      if (!(jobs[0].w > 0 && jobs[0].h > 0)) { jobs.shift(); continue; }   // (nothing to work out)
      const most = each.ms > 0 ? Math.max(1, Math.floor(SUBMIT_MS / each.ms)) : Infinity;   // (a piece's own time no more than SUBMIT_MS)
      const J = jobs[0], [x0, z0, ww, hh, k] = take(J, clocked ? Math.min(P.left, most) : Infinity), kernel = J.fill ? fills[J.n] : passes[J.n], u = J.fill ? uCells : uRect;
      const ms = ownGpuMs(renderer, () => { u.value.set(x0, z0, ww, hh); renderer.compute(kernel, [Math.ceil(ww / 8), Math.ceil(hh / 8), 1]); });
      if (ms) { P.left -= k; ms.then((t) => { each.ms = t / k; P.measured(k, t, frameShare('geometry')); }).catch(() => {}); } else clocked = false;
      if (J.r >= Math.ceil(J.h / 8)) jobs.shift();
    }
    if (!jobs.length && pending) { pending = false; version++; }
  };
  let pending = false;
  /** The rectangles word w's window comes onto as it is kept round (x, z) (all of it the first time or after a jump),
      its new place set; null where it has not moved. */
  const moved = (Wd, x, z) => {
    const N = Wd.N, nx = Math.round((Math.floor(x / Wd.T) - N / 2) / SNAP) * SNAP, nz = Math.round((Math.floor(z / Wd.T) - N / 2) / SNAP) * SNAP, o = Wd.window;
    if (o && nx === o[0] && nz === o[1]) return null;
    Wd.origin.value.set(nx, nz); Wd.window = [nx, nz];   // (its new place first: what is read is read where it is now)
    if (!o || Math.abs(nx - o[0]) >= N || Math.abs(nz - o[1]) >= N) { did('land', N * N); return [[nx, nz, N, N]]; }
    return [...(nx !== o[0] ? [[nx > o[0] ? o[0] + N : nx, nz, Math.abs(nx - o[0]), N]] : []), ...(nz !== o[1] ? [[nx, nz > o[1] ? o[1] + N : nz, N, Math.abs(nz - o[1])]] : [])];   // (the strips it came onto)
  };
  /** What every layer that writes left at p: the light that comes through all their crowns; and foot(), whether the
      ground at p is covered by any of their things (1, else 0: their feet, each its own, rule.js footAt), worked out
      where it is called (what asks it first asks the cheap things: whether anything would grow there at all). */
  const all = (p) => {
    const light = float(1).toVar(), ws = [];
    for (let w = 0; w < W; w++) { const v = read(p, w); light.mulAssign(float(1).sub(v.shade)); ws.push(v); }
    const foot = () => { const on = float(0).toVar(); for (const r of writers) if (r.feet) If(on.lessThan(0.5).and(ws[r.w].feet.greaterThan(0.5)), () => { on.assign(r.feet(p)); }); return on; };
    return { light, foot };
  };
  return CURRENT = {
    read, at, all, build, words: W,
    compile: () => (passes.length ? renderer.compileComputeAsync([...fills, ...passes]) : Promise.resolve()),
    /** The window kept round (x, z): the rows and columns it comes onto worked out (all of it the first time, after a
        jump, or when what the rule reads changed: `world`). Before anything that reads it packs. */
    update(x, z, world = '') {
      if (!passes.length) return;
      if (world !== key) { key = world; jobs.length = 0; for (const Wd of words) Wd.window = null; }   // (what was left to work out of the windows before: worked out whole again)
      writers.forEach(({ w }, n) => { const rects = moved(words[w], x, z); if (rects) { run(n, rects); pending = true; } });
      work();
    },
    /** A number that changes whenever the map does: what reads it packs again. */
    version: () => version,
  };
}
