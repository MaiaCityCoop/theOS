// The growth map (intent 0038, stage 7): what the larger things placed on the land leave for the smaller ones to read,
// after Horizon Zero Dawn's GPU placement (van Muijden, GDC 2017), where each layer of placement writes the maps the next
// one reads. A window of N x N texels, TEXEL metres each, kept round the camera as the land's layer map is
// (src/terrain/layers.js): a texel's place in it is its place on the land modulo N, so as the camera moves only the rows
// and columns the window comes onto are worked out, on the GPU, a layer at a time, the largest first.
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
// took to it. Where it does not reach (past REACH metres from the camera), nothing larger has left anything.
import * as THREE from 'three/webgpu';
import { Fn, If, float, int, uint, vec2, ivec2, uniform, globalId, floor, clamp, round } from 'three/tsl';
import { gpuStorage } from '../core/gpu.js';
import { did } from '../core/work.js';

/** Metres a texel; texels a side; texels the window moves by at once; the most words a texel holds. */
export const TEXEL = 2, N = 1024, SNAP = 8, WORDS = 3;
/** Metres from the camera the window holds, wherever its snap leaves it. */
export const REACH = (N / 2 - SNAP) * TEXEL;

/** A share 0 … 1 as one byte (node code), and byte k of a 32-bit word back as a share: how a word packs four of them
    (this map's, the land's layer map's: src/terrain/layers.js). */
export const byte = (v) => uint(round(clamp(v, 0, 1).mul(255)));
export const un = (w, k) => float(w.shiftRight(uint(8 * k)).bitAnd(uint(255))).mul(1 / 255);

let CURRENT = null;
/** The world's growth map, once the trees' engine has made it (null before, and without WebGPU): what the meadow reads
    too, the smallest layer of all (src/scatter/grass.js). */
export const growthMap = () => CURRENT;

/** The map: its buffer (made with the renderer, on the GPU only, as its passes are built), what reads it, and how it is
    kept round the camera. words: how many the layers that write need. */
export function createGrowth(renderer, words) {
  const W = Math.max(1, Math.min(WORDS, words));
  let B = null, writers = [], places = [], passes = [], fills = [], uRect = uniform(new THREE.Vector4()), uCells = uniform(new THREE.Vector4()), window = null, version = 0, key = '';
  const origin = uniform(new THREE.Vector2(0, 0));   // (the window's first texel on the land: x, z)
  const slot = (ix, iz, w) => uint(ix.bitAnd(int(N - 1)).add(iz.bitAnd(int(N - 1)).mul(int(N)))).mul(uint(W)).add(uint(w));
  const inside = (ix, iz) => ix.greaterThanEqual(int(origin.x)).and(ix.lessThan(int(origin.x).add(N))).and(iz.greaterThanEqual(int(origin.y))).and(iz.lessThan(int(origin.y).add(N)));
  /** What the layers' words say at p (metres), w each of the words asked: { shade, litter } read between the four
      texels round it, and the lead and the feet of the one it lies in; nothing where the window does not reach. */
  const read = (p, w) => {
    const u = p.div(TEXEL).sub(0.5), i = ivec2(floor(u)).toVar(), f = u.sub(floor(u)).toVar(), near = ivec2(floor(p.div(TEXEL))).toVar();
    const out = { shade: float(0).toVar(), feet: float(0).toVar(), litter: float(0).toVar(), lead: uint(0).toVar() };
    If(inside(i.x, i.y).and(inside(i.x.add(1), i.y.add(1))), () => {
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
      its window of cells (where c is one the gather of the texels' window reads: whoever asks keeps to that). */
  const at = (w, c) => { const P = places[w]; return B.element(uint(c.x.bitAnd(int(P.side - 1)).add(c.y.bitAnd(int(P.side - 1)).mul(int(P.side)))).add(uint(P.base))); };
  /** The passes, one a layer that writes, in their order (rule.js writersOf): record(c), what stands in cell c of the
      layer, worked out for the cells the gather of the texels to be worked out reads (cells(x0, w): those along a side
      for the texels x0 … x0 + w; span(n): the most along a side for n texels); gather(q), what the layer leaves at the
      texel's middle q ({ shade, feet, litter, lead }); its word is w; feet(p), whether the ground at p is covered by the
      layer's things (null: none of them covers any). */
  const build = (list) => {
    writers = list;
    // (one buffer for all of it: the texels' words, then each layer's cells; a pass binds few)
    let base = N * N * W;
    places = [];
    for (const { w, span } of writers) { const side = 2 ** Math.ceil(Math.log2(span(N))); places[w] = { side, base }; base += side * side; }
    const buf = gpuStorage('uint', base, 'the growth map'); B = buf.node;
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
        const ix = int(g.x).add(int(uRect.x)), iz = int(g.y).add(int(uRect.y)), q = vec2(float(ix), float(iz)).add(0.5).mul(TEXEL);
        const L = gather(q);
        B.element(slot(ix, iz, w)).assign(byte(L.shade).bitOr(byte(L.feet).shiftLeft(uint(8))).bitOr(byte(L.litter).shiftLeft(uint(16))).bitOr(uint(L.lead).min(uint(255)).shiftLeft(uint(24))));
      });
    })().computeKernel([8, 8, 1]));
  };
  // (each layer over every rectangle before the next layer: what a layer reads of the one before is worked out first; and
  // what stands in its cells before what it leaves at its texels. A cell worked out again is the same: the rule is the rule)
  const run = (rects) => {
    writers.forEach(({ cells }, n) => {
      const pass = passes[n];
      for (const [x0, z0, ww, hh] of rects) {
        const [cx, cx1] = cells(x0, ww), [cz, cz1] = cells(z0, hh), cw = cx1 - cx, ch = cz1 - cz;
        uCells.value.set(cx, cz, cw, ch); renderer.compute(fills[n], [Math.ceil(cw / 8), Math.ceil(ch / 8), 1]);
      }
      for (const [x0, z0, ww, hh] of rects) { uRect.value.set(x0, z0, ww, hh); renderer.compute(pass, [Math.ceil(ww / 8), Math.ceil(hh / 8), 1]); }
    });
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
      if (world !== key) { key = world; window = null; }
      const nx = Math.round((Math.floor(x / TEXEL) - N / 2) / SNAP) * SNAP, nz = Math.round((Math.floor(z / TEXEL) - N / 2) / SNAP) * SNAP, o = window;
      if (o && nx === o[0] && nz === o[1]) return;
      origin.value.set(nx, nz);   // (its new place first: what is read is read where it is now)
      if (!o || Math.abs(nx - o[0]) >= N || Math.abs(nz - o[1]) >= N) { run([[nx, nz, N, N]]); did('land', N * N); }
      else run([...(nx !== o[0] ? [[nx > o[0] ? o[0] + N : nx, nz, Math.abs(nx - o[0]), N]] : []), ...(nz !== o[1] ? [[nx, nz > o[1] ? o[1] + N : nz, N, Math.abs(nz - o[1])]] : [])]);   // (the strips it came onto)
      window = [nx, nz]; version++;
    },
    /** A number that changes whenever the map does: what reads it packs again. */
    version: () => version,
  };
}
