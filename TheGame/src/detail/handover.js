// The one hand-over between levels of detail, for everything in the world: what stands in a stand (src/scatter/trees.js),
// the rocks (src/scatter/rocks.js), what stands at a place and its far card (src/world/place.js, impostor.js). Nothing
// appears or drops out at once, and nothing is dithered:
//   - when: a thing's size on screen now, in pixels through the lens (src/detail/index.js), against its level's pixels
//     (assets/kinds.js: px), with `fade` either side;
//   - between two levels both are drawn. A thing made of parts (a tree's sprigs) changes part by part: the finer level's
//     shrink to their feet one after another as the coarser one's grow from theirs. A thing of one piece (a rock, a
//     tent, a tree's wood) changes over whole, half way: its levels are one outline;
//   - its last level sinks into the ground over its last pixels (kinds.js: sink): lower first, then narrower, to nothing.
// On the GPU as node code (a level's numbers as uniforms: every level of a thing is then one shader), and the same
// reckoning in JS for what is chosen on the CPU.
import { float, vec3, uniform, log, max, clamp, mix, smoothstep, fract, sin, sqrt } from 'three/tsl';

/** A level's numbers as uniforms. Lv: { lo, hi, last } (the pixels it is drawn between; whether it is the farthest). */
export const levelOf = (Lv, fade) => ({ hi: uniform(Number.isFinite(Lv.hi) ? Math.log(Lv.hi) + fade : 1e3), lo: uniform(Math.log(Lv.lo) + fade), px: uniform(Lv.lo), last: uniform(Lv.last ? 1 : 0), fade });

/** How a level shows at px pixels: u, how far it has come in from the finer level (0: not yet); v, how far it has gone
    out to the coarser (1: gone); sunk, 1 … 0 as its last level sinks; there: anything of it shows; whole: a thing of one
    piece shows. Two levels drawn at once reckon the same shares. sink: its kind's (0: none). */
export const handOver = (px, LU, sink = 0) => {
  const L = log(max(px, 1e-6)), u = clamp(LU.hi.sub(L).div(2 * LU.fade), 0, 1), v = clamp(LU.lo.sub(L).div(2 * LU.fade), 0, 1).mul(float(1).sub(LU.last));
  const sunk = sink > 1 ? mix(float(1), smoothstep(LU.px, LU.px.mul(sink), px), LU.last) : float(1);
  return { u, v, sunk, there: u.greaterThan(0).and(v.lessThan(1)).and(sunk.greaterThan(0)), whole: u.greaterThanEqual(0.5).and(v.lessThan(0.5)) };
};

const WIN = 0.4;   // the share of a hand-over one part takes to grow or shrink
/** How grown a part is, 0 … 1: its own moment in the hand-over, from a hash of where it is rooted. body (0 or 1): a
    part that is the thing's one body: the coarser one's there by half way, the finer one's shrinking from then. */
export const partGrown = (H, root, body = float(0)) => {
  const at = fract(sin(root.dot(vec3(12.9898, 78.233, 37.719))).mul(43758.5453)).mul(1 - WIN);
  return mix(smoothstep(at, at.add(WIN), H.u), smoothstep(0, 0.5, H.u), body).mul(float(1).sub(mix(smoothstep(at, at.add(WIN), H.v), smoothstep(0.5, 1, H.v), body)));
};

/** A point of a thing, in its own frame (its foot at 0), as it sinks: lower first, then narrower. */
export const sinkInto = (p, sunk) => p.mul(vec3(sqrt(sunk), sunk, sqrt(sunk)));

/** The same in JS: { whole, sunk } for a level at px pixels. */
export function handOverAt(px, lo, hi, fade, last = false, sink = 0) {
  const L = Math.log(Math.max(px, 1e-6)), c = (x) => Math.min(1, Math.max(0, x)), s = (a, b, x) => { const t = c((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const u = Number.isFinite(hi) ? c((Math.log(hi) + fade - L) / (2 * fade)) : 1, v = last ? 0 : c((Math.log(lo) + fade - L) / (2 * fade));
  const sunk = last && sink > 1 ? s(lo, lo * sink, px) : 1;
  return { whole: u >= 0.5 && v < 0.5 && sunk > 0, sunk };
}
