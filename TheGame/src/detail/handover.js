// The one hand-over between levels of detail, for everything in the world: what stands in a stand (src/scatter/trees.js;
// its impostor's own: meshShare), the rocks (src/scatter/rocks.js), what stands at a place and its far card
// (src/world/place.js, impostor.js). Nothing
// appears or drops out at once, and nothing is dithered:
//   - when: a thing's size on screen now, in pixels through the lens (src/detail/index.js), against its level's pixels
//     (where its rung's own error is the one ERROR_PX: src/detail/error.js), `fade` either side (error.js FADE: BAND
//     from end to end);
//   - between two levels both are drawn. A thing of one piece (a rock, a tent) changes over whole, half way: its levels
//     are one outline (a plant's levels are first shares of one build, the same where they meet: assets/kit/crowd.js);
//   - its last level sinks into the ground over the BAND under where it is gone (`sink`, error.js goneAt: its lo is a
//     BAND under that), lower first, then narrower, to nothing.
// On the GPU as node code (a level's numbers as uniforms: every level of a thing is then one shader), and the same
// reckoning in JS for what is chosen on the CPU. Every size on screen here is in the dial's pixels (src/detail/error.js:
// a level's numbers hold at every turn of the dial; a measured size meets them over the dial, measure.js dialPxAt).
import { float, vec3, uniform, log, max, clamp, mix, smoothstep, sqrt } from 'three/tsl';

/** A level's numbers as uniforms. Lv: { lo, hi, last } (the dial pixels it is drawn between; whether it is the farthest). */
export const levelOf = (Lv, fade) => ({ hi: uniform(Number.isFinite(Lv.hi) ? Math.log(Lv.hi) + fade : 1e3), lo: uniform(Math.log(Lv.lo) + fade), px: uniform(Lv.lo), last: uniform(Lv.last ? 1 : 0), fade });

/** A level's numbers as the mesh drawing it tells them (mesh.userData.Lv: { lo, hi, last }), read at each draw: every
    level of a thing drawn alike is then one material, not one a level (src/scatter/drawer.js). And how far the mesh has
    come since it could first be drawn (userData.arrived, 0 … 1, the screen's ramp after the first view: absent, all of
    it): what comes later rises out of the ground as its last level sinks into it, never at once (handOver's sunk). */
const ofLv = (f) => uniform(0).onObjectUpdate(({ object }) => { const Lv = object?.userData?.Lv; return Lv ? f(Lv) : 0; });
/** How far the mesh drawing it has come since it could first be drawn, as it tells it at each draw (userData.arrived:
    above), for any material whose meshes rise out of the ground as they come (sinkInto by it: the meadow's rings too,
    src/scatter/grass.js). */
export const ARRIVED = uniform(1).onObjectUpdate(({ object }) => object?.userData?.arrived ?? 1);
export const levelOfMesh = (fade) => ({ hi: ofLv((Lv) => (Number.isFinite(Lv.hi) ? Math.log(Lv.hi) + fade : 1e3)), lo: ofLv((Lv) => Math.log(Lv.lo) + fade), px: ofLv((Lv) => Lv.lo), last: ofLv((Lv) => (Lv.last ? 1 : 0)), fade,
  arrived: ARRIVED });

/** How far the camera may move before an engine's cells of P cells of `cell` metres are packed again, and a little: the
    margin a level's packing keeps a thing either side of its band, so it is there when the camera has moved. */
export const padOf = (cell, P) => ((cell * P) / 16) * 1.8;

/** A level's band, for an engine that packs what stands in its cells: which things the level's packing holds, and
    how far it reaches. Its numbers are uniforms too. pad: padOf's (0: none).
      holds(dist, span)   node: a thing `span` dial pixels across on screen at one metre (the measure's spanAt over the
                          dial: its size times pxK over ERROR_PX), `dist` away, is this level's to pack (its band, its
                          hand-over, and the pad)
      reach(sLo, sHi, K)  [near, far] metres: where a thing between sLo and sHi metres across can be of this level (K: dial
                          pixels a metre covers at a metre, measure.js dialK, or pxKMost for the most) */
export const bandOf = (Lv, fade, pad = 0) => {
  const e = Math.exp(fade), B = { pad: uniform(pad), to: uniform(e / Lv.lo), from: uniform(Number.isFinite(Lv.hi) ? 1 / (Lv.hi * e) : 0), margin: pad };
  B.holds = (dist, span) => dist.lessThan(span.mul(B.to).add(B.pad)).and(dist.greaterThanEqual(span.mul(B.from).sub(B.pad)));
  B.reach = (sLo, sHi, K) => [Number.isFinite(Lv.hi) ? Math.max(0, (sLo * K) / (Lv.hi * e) - pad) : 0, (sHi * K * e) / Lv.lo + pad];
  return B;
};

/** How a level shows at px dial pixels: u, how far it has come in from the finer level (0: not yet); v, how far it has gone
    out to the coarser (1: gone); sunk, 1 … 0 as its last level sinks; there: anything of it shows; whole: a thing of one
    piece shows. Two levels drawn at once reckon the same shares. sink: its kind's (0: none). */
export const handOver = (px, LU, sink = 0) => {
  const L = log(max(px, 1e-6)), u = clamp(LU.hi.sub(L).div(2 * LU.fade), 0, 1), v = clamp(LU.lo.sub(L).div(2 * LU.fade), 0, 1).mul(float(1).sub(LU.last));
  const sunk0 = sink > 1 ? mix(float(1), smoothstep(LU.px, LU.px.mul(sink), px), LU.last) : float(1), sunk = LU.arrived ? sunk0.mul(LU.arrived) : sunk0;   // (arrived: a mesh's, levelOfMesh)
  return { u, v, sunk, there: u.greaterThan(0).and(v.lessThan(1)).and(sunk.greaterThan(0)), whole: u.greaterThanEqual(0.5).and(v.lessThan(0.5)) };
};

/** A point of a thing, in its own frame (its foot at 0), as it sinks: lower first, then narrower. */
export const sinkInto = (p, sunk) => p.mul(vec3(sqrt(sunk), sunk, sqrt(sunk)));

/** The same in JS: { whole, sunk } for a level at px dial pixels. */
export function handOverAt(px, lo, hi, fade, last = false, sink = 0) {
  const L = Math.log(Math.max(px, 1e-6)), c = (x) => Math.min(1, Math.max(0, x)), s = (a, b, x) => { const t = c((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const u = Number.isFinite(hi) ? c((Math.log(hi) + fade - L) / (2 * fade)) : 1, v = last ? 0 : c((Math.log(lo) + fade - L) / (2 * fade));
  const sunk = last && sink > 1 ? s(lo, lo * sink, px) : 1;
  return { whole: u >= 0.5 && v < 0.5 && sunk > 0, sunk };
}
