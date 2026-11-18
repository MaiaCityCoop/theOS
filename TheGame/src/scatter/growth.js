// The growth map (intent 0038, stage 7): what the larger things placed on the land leave for the smaller ones to read,
// after Horizon Zero Dawn's GPU placement (van Muijden, GDC 2017), where each layer of placement writes the maps the next
// one reads. Windows of N x N texels round the camera, one a level: level 0's texels as fine as what writes it holds
// detail (its band limit: half the smallest crown that writes it, src/scatter/rule.js layersOf), each level's twice the
// one before's, as many levels as reach as far as anything that reads it is drawn (its farthest reader: where that is
// gone by the one measure, src/scatter/trees.js), so nothing that reads it ever stands past it. N: the fewest texels
// with which every level, where it is first read, is no coarser than that band limit or a dial pixel there, whichever
// is coarser (createGrowth). A texel's place in its
// window is its place on the land modulo N, so as the camera moves only the rows and columns a window comes onto are
// worked out, on the GPU, a layer at a time, the largest first; a layer at a level only as far as what reads it is drawn
// (a small thing's shade is not worked out where only large things read it). What reads it reads the finest level that
// holds the point, going over into the next over that window's outer part.
//
// A texel holds a word for every layer that writes (src/scatter/rule.js: those whose cells are as large as a texel),
// four bytes:
//   shade    how much of the light coming down its crowns take here, 0..1: each crown as large as it is drawn, the
//            light through it Beer–Lambert's, the texel's mean (rule.js: the light under the crowns)
//   foot     how much of the ground its feet and bodies take here, 0..1
//   litter   how much it drops here (needles, leaves, cones, branches), 0..1
//   lead     whose litter that most is: the dropping thing's number + 1 (rule.js), 0 none
// A layer's word is worked out by gathering its own cells round the texel, each placed by the rule (which reads the
// words of the layers before it): what a placed thing writes is worked out where it is written, so no two things write
// one texel, nothing is kept of a placed thing, and the map is the same whatever path the camera took to it. Where it
// does not reach (past the last level's window), nothing larger has left anything: nothing that reads it stands there.
import * as THREE from 'three/webgpu';
import { Fn, If, float, int, uint, vec2, ivec2, uniform, uniformArray, globalId, floor, clamp, round, max, abs } from 'three/tsl';
import { gpuStorage, roomOf } from '../core/gpu.js';
import { pxKMost } from '../detail/measure.js';
import { did } from '../core/work.js';

/** Texels a window moves by at once; the most words a texel holds. */
export const SNAP = 8, WORDS = 3;

const byte = (v) => uint(round(clamp(v, 0, 1).mul(255)));
const un = (w, k) => float(w.shiftRight(uint(8 * k)).bitAnd(uint(255))).mul(1 / 255);

let CURRENT = null;
/** The world's growth map, once the trees' engine has made it (null before, and without WebGPU): what the meadow reads
    too, the smallest layer of all (src/scatter/grass.js). */
export const growthMap = () => CURRENT;

/** The map: its buffer (made with the renderer, on the GPU only), what reads it, and how it is kept round the camera.
    fields: a word's each, in its order ({ band: its band limit, metres (half the smallest crown of the layer that writes
    it: rule.js layersOf), far: metres its farthest reader is drawn to at the most }). Each word its own window (its own
    texel, side and levels), all in one buffer: level 0's texel its band limit (a finer one holds nothing more); its side
    N the fewest texels (a power of two) with which every level, where it is first read (where the one before it ends),
    is no coarser than its band limit or a dial pixel there at the most (src/detail/measure.js pxKMost), whichever is
    coarser, its levels reaching its `far`; within the room the geometry's class has left (src/core/gpu.js roomOf), else
    the most that fits there, and said. */
export function createGrowth(renderer, fields) {
  const K = pxKMost(), words = fields.slice(0, WORDS).map(({ band, far }) => {
    const reach0 = (n) => (n / 2 - SNAP) * band, levelsOf = (n) => Math.max(1, Math.ceil(Math.log2(Math.max(far, reach0(n)) / reach0(n))) + 1);
    const holds = (n) => { for (let t = band, r = reach0(n); r < far; t *= 2, r *= 2) if (2 * t > Math.max(band, r / K)) return false; return true; };
    let N = 4 * SNAP; while (!holds(N)) N *= 2;
    return { band, far, N, levelsOf };
  });
  const bytes = () => words.reduce((b, Wd) => b + Wd.N * Wd.N * Wd.levelsOf(Wd.N) * 4, 0), held = words.map((Wd) => Wd.N);
  while (bytes() > roomOf('geometry')) { const Wd = words.reduce((a, b) => (b.N * b.N * b.levelsOf(b.N) > a.N * a.N * a.levelsOf(a.N) ? b : a)); if (Wd.N <= 4 * SNAP) break; Wd.N /= 2; }   // (the largest halved first)
  words.forEach((Wd, w) => { if (Wd.N < held[w]) console.warn(`the growth map, word ${w}: ${held[w]} texels a side hold its band limit (${Wd.band.toFixed(2)} m) out to ${Math.round(Wd.far)} m; ${Wd.N} fit the geometry's room: its far levels coarser than a dial pixel`); });
  let at = 0;
  for (const Wd of words) {   // (each word's window: its side, its levels' texels and reaches, where it begins in the buffer)
    Wd.LV = Wd.levelsOf(Wd.N); Wd.REACH = (Wd.N / 2 - SNAP) * Wd.band; Wd.TX = Array.from({ length: Wd.LV }, (_, l) => Wd.band * 2 ** l); Wd.at = at; at += Wd.N * Wd.N * Wd.LV;
    Wd.origin = uniformArray(Array.from({ length: Wd.LV }, () => new THREE.Vector2()), 'vec2'); Wd.windows = Array(Wd.LV).fill(null);
  }
  const W = words.length, buf = gpuStorage('uint', Math.max(1, at), 'the growth map', 'geometry'), B = buf.node;
  const slot = (Wd, l, ix, iz) => uint(ix.bitAnd(int(Wd.N - 1)).add(iz.bitAnd(int(Wd.N - 1)).mul(int(Wd.N)))).add(uint(Wd.at + l * Wd.N * Wd.N));
  const inside = (Wd, l, ix, iz) => { const o = ivec2(Wd.origin.element(l)), N = Wd.N; return ix.greaterThanEqual(o.x).and(ix.lessThan(o.x.add(N))).and(iz.greaterThanEqual(o.y)).and(iz.lessThan(o.y.add(N))); };
  /** What word w says at p (metres): { shade, foot, litter } read between the four texels round it, and the lead of the
      nearest; from the finest of its levels that holds p, going over into the next over the outer eighth of its window;
      nothing where none does. */
  const read = (p, w) => {
    const Wd = words[w], N = Wd.N, out = { shade: float(0).toVar(), foot: float(0).toVar(), litter: float(0).toVar(), lead: uint(0).toVar() }, left = float(1).toVar();
    for (let l = 0; l < Wd.LV; l++) {
      const T = Wd.TX[l], u = p.div(T).sub(0.5), i = ivec2(floor(u)).toVar(), f = u.sub(floor(u)).toVar(), near = ivec2(floor(p.div(T))).toVar();
      If(left.greaterThan(0).and(inside(Wd, l, i.x, i.y)).and(inside(Wd, l, i.x.add(1), i.y.add(1))), () => {
        // (how far out in its window: the last eighth goes over into the next level; the last level holds all it has)
        const c = vec2(Wd.origin.element(l)).add(N / 2), e = max(abs(vec2(i).add(0.5).sub(c)).x, abs(vec2(i).add(0.5).sub(c)).y).div(N / 2 - 1);
        const k = l < Wd.LV - 1 ? left.mul(float(1).sub(clamp(e.sub(7 / 8).mul(8), 0, 1))) : left;
        for (const [dx, dz, b] of [[0, 0, float(1).sub(f.x).mul(float(1).sub(f.y))], [1, 0, f.x.mul(float(1).sub(f.y))], [0, 1, float(1).sub(f.x).mul(f.y)], [1, 1, f.x.mul(f.y)]]) {
          const v = B.element(slot(Wd, l, i.x.add(dx), i.y.add(dz))), m = b.mul(k);
          out.shade.addAssign(un(v, 0).mul(m)); out.foot.addAssign(un(v, 1).mul(m)); out.litter.addAssign(un(v, 2).mul(m));
        }
        If(out.lead.equal(uint(0)), () => { out.lead.assign(B.element(slot(Wd, l, near.x, near.y)).shiftRight(uint(24))); });
        left.subAssign(k);
      });
    }
    return out;
  };
  let passes = [], uRect = uniform(new THREE.Vector4()), uLevel = uniform(0, 'uint'), uTexel = uniform(1), version = 0, key = '';
  /** The passes, one a layer that writes, in their order: gather(q, texel) (rule.js) says at a texel's middle q (its side
      `texel` metres, a node) what the layer leaves there ({ shade, foot, litter, lead }); its word is w (its window's). */
  const build = (writers) => {
    passes = writers.filter(({ w }) => words[w]).map(({ w, gather }) => {
      const Wd = words[w];
      return { w, kernel: Fn(() => {
        const g = globalId.xy;
        If(g.x.lessThan(uint(uRect.z)).and(g.y.lessThan(uint(uRect.w))), () => {
          const ix = int(g.x).add(int(uRect.x)), iz = int(g.y).add(int(uRect.y)), q = vec2(float(ix), float(iz)).add(0.5).mul(uTexel);
          const L = gather(q, uTexel);
          B.element(slot(Wd, 0, ix, iz).add(uLevel.mul(uint(Wd.N * Wd.N)))).assign(byte(L.shade).bitOr(byte(L.foot).shiftLeft(uint(8))).bitOr(byte(L.litter).shiftLeft(uint(16))).bitOr(uint(L.lead).min(uint(255)).shiftLeft(uint(24))));
        });
      })().computeKernel([8, 8, 1]) };
    });
  };
  // (a word's level over every rectangle of it; the words in their order: what a layer reads of the one before is
  // worked out first)
  const run = (P, Wd, l, rects) => { uLevel.value = l; uTexel.value = Wd.TX[l]; for (const [x0, z0, w, h] of rects) { uRect.value.set(x0, z0, w, h); renderer.compute(P.kernel, [Math.ceil(w / 8), Math.ceil(h / 8), 1]); } };
  /** What every layer that writes left at p: the light that comes through all their crowns, and how much of the ground
      their feet take. */
  const all = (p) => { const light = float(1).toVar(), foot = float(0).toVar(); for (let w = 0; w < W; w++) { const v = read(p, w); light.mulAssign(float(1).sub(v.shade)); foot.assign(foot.max(v.foot)); } return { light, foot }; };
  return CURRENT = {
    read, all, build, words: W, sides: words.map((Wd) => Wd.N), texels: words.map((Wd) => Wd.band),
    compile: () => (passes.length ? renderer.compileComputeAsync(passes.map((P) => P.kernel)) : Promise.resolve()),
    /** Every level's window kept round (x, z): the rows and columns it comes onto worked out (all of it the first time,
        after a jump, or when what the rule reads changed: `world`). Before anything that reads it packs. */
    update(x, z, world = '') {
      if (!passes.length) return;
      if (world !== key) { key = world; for (const Wd of words) Wd.windows.fill(null); }
      let moved = false;
      for (const P of passes) {
        const Wd = words[P.w], N = Wd.N;
        for (let l = 0; l < Wd.LV; l++) {
          const T = Wd.TX[l], nx = Math.round((Math.floor(x / T) - N / 2) / SNAP) * SNAP, nz = Math.round((Math.floor(z / T) - N / 2) / SNAP) * SNAP, o = Wd.windows[l];
          if (o && nx === o[0] && nz === o[1]) continue;
          Wd.origin.array[l].set(nx, nz);   // (its new place first: what is read is read where it is now)
          if (!o || Math.abs(nx - o[0]) >= N || Math.abs(nz - o[1]) >= N) { run(P, Wd, l, [[nx, nz, N, N]]); did('land', N * N); }
          else run(P, Wd, l, [...(nx !== o[0] ? [[nx > o[0] ? o[0] + N : nx, nz, Math.abs(nx - o[0]), N]] : []), ...(nz !== o[1] ? [[nx, nz > o[1] ? o[1] + N : nz, N, Math.abs(nz - o[1])]] : [])]);   // (the strips it came onto)
          Wd.windows[l] = [nx, nz]; moved = true;
        }
      }
      if (moved) version++;
    },
    /** A number that changes whenever the map does: what reads it packs again. */
    version: () => version,
  };
}
