// The growth map (intent 0038, stage 7): what the larger things placed on the land leave for the smaller ones to read,
// after Horizon Zero Dawn's GPU placement (van Muijden, GDC 2017), where each layer of placement writes the maps the next
// one reads. A window of N x N texels, TEXEL metres each, kept round the camera as the land's layer map is
// (src/terrain/layers.js): a texel's place in it is its place on the land modulo N, so as the camera moves only the rows
// and columns the window comes onto are worked out, on the GPU, a layer at a time, the largest first.
//
// A texel holds a word for every layer that writes (src/scatter/rule.js: those whose things are as large as a texel),
// four bytes:
//   shade    how much of the light coming down its crowns take here, 0..1: each crown as large as it is drawn, the
//            light through it Beer–Lambert's, the texel's mean (rule.js: the light under the crowns)
//   foot     how much of the ground its feet and bodies take here, 0..1
//   litter   how much it drops here (needles, leaves, cones, branches), 0..1
//   lead     whose litter that most is: the dropping thing's number + 1 (rule.js), 0 none
// A layer's word is worked out by gathering its own cells round the texel, each placed by the rule (which reads the
// words of the layers before it): what a placed thing writes is worked out where it is written, so no two things write
// one texel, nothing is kept of a placed thing, and the map is the same whatever path the camera took to it. Where it
// does not reach (past REACH metres from the camera), nothing larger has left anything.
import * as THREE from 'three/webgpu';
import { Fn, If, float, int, uint, vec2, ivec2, uniform, globalId, floor, clamp, round } from 'three/tsl';
import { gpuStorage } from '../core/gpu.js';
import { did } from '../core/work.js';

/** Metres a texel; texels a side; texels the window moves by at once; the most words a texel holds. */
export const TEXEL = 2, N = 1024, SNAP = 8, WORDS = 3;
/** Metres from the camera the window holds, wherever its snap leaves it. */
export const REACH = (N / 2 - SNAP) * TEXEL;

const byte = (v) => uint(round(clamp(v, 0, 1).mul(255)));
const un = (w, k) => float(w.shiftRight(uint(8 * k)).bitAnd(uint(255))).mul(1 / 255);

let CURRENT = null;
/** The world's growth map, once the trees' engine has made it (null before, and without WebGPU): what the meadow reads
    too, the smallest layer of all (src/scatter/grass.js). */
export const growthMap = () => CURRENT;

/** The map: its buffer (made with the renderer, on the GPU only), what reads it, and how it is kept round the camera.
    words: how many the layers that write need. */
export function createGrowth(renderer, words) {
  const W = Math.max(1, Math.min(WORDS, words)), buf = gpuStorage('uint', N * N * W, 'the growth map'), B = buf.node;
  const origin = uniform(new THREE.Vector2(0, 0));   // (the window's first texel on the land: x, z)
  const slot = (ix, iz, w) => uint(ix.bitAnd(int(N - 1)).add(iz.bitAnd(int(N - 1)).mul(int(N)))).mul(uint(W)).add(uint(w));
  const inside = (ix, iz) => ix.greaterThanEqual(int(origin.x)).and(ix.lessThan(int(origin.x).add(N))).and(iz.greaterThanEqual(int(origin.y))).and(iz.lessThan(int(origin.y).add(N)));
  /** What the layers' words say at p (metres), w each of the words asked: { shade, foot, litter } read between the
      four texels round it, and the lead of the nearest; nothing where the window does not reach. */
  const read = (p, w) => {
    const u = p.div(TEXEL).sub(0.5), i = ivec2(floor(u)).toVar(), f = u.sub(floor(u)).toVar(), near = ivec2(floor(p.div(TEXEL))).toVar();
    const out = { shade: float(0).toVar(), foot: float(0).toVar(), litter: float(0).toVar(), lead: uint(0).toVar() };
    If(inside(i.x, i.y).and(inside(i.x.add(1), i.y.add(1))), () => {
      for (const [dx, dz, k] of [[0, 0, float(1).sub(f.x).mul(float(1).sub(f.y))], [1, 0, f.x.mul(float(1).sub(f.y))], [0, 1, float(1).sub(f.x).mul(f.y)], [1, 1, f.x.mul(f.y)]]) {
        const v = B.element(slot(i.x.add(dx), i.y.add(dz), w));
        out.shade.addAssign(un(v, 0).mul(k)); out.foot.addAssign(un(v, 1).mul(k)); out.litter.addAssign(un(v, 2).mul(k));
      }
      out.lead.assign(B.element(slot(near.x, near.y, w)).shiftRight(uint(24)));
    });
    return out;
  };
  let passes = [], uRect = uniform(new THREE.Vector4()), window = null, version = 0, key = '';
  /** The passes, one a layer that writes, in their order: gather(q) (rule.js) says at the texel's middle q what the
      layer leaves there ({ shade, foot, litter, lead }); its word is w. */
  const build = (writers) => {
    passes = writers.map(({ w, gather }) => Fn(() => {
      const g = globalId.xy;
      If(g.x.lessThan(uint(uRect.z)).and(g.y.lessThan(uint(uRect.w))), () => {
        const ix = int(g.x).add(int(uRect.x)), iz = int(g.y).add(int(uRect.y)), q = vec2(float(ix), float(iz)).add(0.5).mul(TEXEL);
        const L = gather(q);
        B.element(slot(ix, iz, w)).assign(byte(L.shade).bitOr(byte(L.foot).shiftLeft(uint(8))).bitOr(byte(L.litter).shiftLeft(uint(16))).bitOr(uint(L.lead).min(uint(255)).shiftLeft(uint(24))));
      });
    })().computeKernel([8, 8, 1]));
  };
  // (each layer over every rectangle before the next layer: what a layer reads of the one before is worked out first)
  const run = (rects) => { for (const p of passes) for (const [x0, z0, w, h] of rects) { uRect.value.set(x0, z0, w, h); renderer.compute(p, [Math.ceil(w / 8), Math.ceil(h / 8), 1]); } };
  /** What every layer that writes left at p: the light that comes through all their crowns, and how much of the ground
      their feet take. */
  const all = (p) => { const light = float(1).toVar(), foot = float(0).toVar(); for (let w = 0; w < W; w++) { const v = read(p, w); light.mulAssign(float(1).sub(v.shade)); foot.assign(foot.max(v.foot)); } return { light, foot }; };
  return CURRENT = {
    read, all, build, words: W,
    compile: () => (passes.length ? renderer.compileComputeAsync(passes) : Promise.resolve()),
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
