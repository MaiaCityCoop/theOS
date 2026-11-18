// The footpaths as decals laid into the land's pages (intent 0038, stage 6c; Call of Duty's 2023 terrain lays its roads
// and paths into the virtual texture the same way). A path (world/paths.js) is a curve through its points, cut into
// straight pieces as long as it is wide; a texel of a page finds how far it lies from the nearest, and as a page is laid
// (src/terrain/pages.js), what lies within the path's width is worn: packed earth in the middle, cracked where feet go
// most, crumbs and pebbles towards its edges, a lip of soil pushed up along them, no grass. The height goes into the
// page with the rest, so the relief near the eye (src/terrain/relief.js) and the parallax further out show the path
// sunk into the meadow. The paths are ways too (src/world/ways.js): the grass, the stones and the trees keep off them.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, float, int, uint, vec2, vec3, uniformArray, min, max, clamp, smoothstep, step, length, dot, mix } from 'three/tsl';
import { PATHS } from '../../world/paths.js';
import { addWays } from '../world/ways.js';
import { vnoise } from '../world/noise.nodes.js';
import { WALKER } from '../../world/scale.js';
import { noiseAt } from '../world/land.js';

// (its verge, where feet stray from it: as wide as a step keeps off anything, the walker's round, its edge going over
// from worn to grass across it; and the edge wandering either way by half of that: src/world/scale.js)
const SOFT = WALKER.round, WANDER = SOFT / 2, STRAY = WANDER * 1.5;   // (STRAY: the most it wanders, its two noises' amplitudes together)
const DIRT = '082f0183-5d92-4ac8-821c-14408d3ee056' /* dry earth: the trodden middle */, CRUMBS = '0db6a039-9f7f-4a58-8137-c3348dfb922e' /* path: towards the edges */;

// a curve through the points (Catmull-Rom, centripetal: no loops where they bunch), a point every `step` metres (the
// path's width: its pieces then miss the curve by under a centimetre where a footpath bends, well within its verge)
function curve(P, step) {
  const ends = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]], [2 * P.at(-1)[0] - P.at(-2)[0], 2 * P.at(-1)[1] - P.at(-2)[1]]], Q = [ends[0], ...P, ends[1]], out = [P[0]];
  for (let k = 1; k + 2 < Q.length; k++) {
    const [p0, p1, p2, p3] = [Q[k - 1], Q[k], Q[k + 1], Q[k + 2]], d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5 || 1e-4;
    const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 1; s <= n; s++) {
      const t = t1 + ((t2 - t1) * s) / n, L = (a, b, ta, tb) => a.map((v, c) => ((tb - t) * v + (t - ta) * b[c]) / (tb - ta));
      const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3), B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  return out;
}
// every path: its pieces (a, b: x, z) in one list, and where its own begin, how many, its box, its half width
const SEGS = [], RUNS = PATHS.map((path) => {
  const pts = curve(path.points, path.width), first = SEGS.length, half = path.width / 2;
  for (let k = 0; k + 1 < pts.length; k++) SEGS.push([pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]]);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { first, n: pts.length - 1, half, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
});
const SEG = SEGS.length ? uniformArray(SEGS.map((s) => new THREE.Vector4(...s)), 'vec4') : null;

/** How far p (vec2, metres) lies past the edge of the nearest path (negative within it), and that path's half width:
    vec2 (node code; 1e6 where no path comes within `reach` metres of its edge). */
const pathNear = Fn(([p0, reach]) => {
  const p = vec2(p0).toVar(), best = float(1e6).toVar(), half = float(1).toVar();
  for (const R of RUNS) {
    const m = R.half + STRAY;
    If(p.x.greaterThan(float(R.box[0] - m).sub(reach)).and(p.x.lessThan(float(R.box[2] + m).add(reach))).and(p.y.greaterThan(float(R.box[1] - m).sub(reach))).and(p.y.lessThan(float(R.box[3] + m).add(reach))), () => {
      Loop({ start: int(R.first), end: int(R.first + R.n), type: 'int', condition: '<' }, ({ i }) => {
        const s = SEG.element(i), a = s.xy, ab = s.zw.sub(a), t = clamp(dot(p.sub(a), ab).div(max(dot(ab, ab), 1e-6)), 0, 1);
        const e = length(p.sub(a.add(ab.mul(t)))).sub(R.half);
        If(e.lessThan(best), () => { best.assign(e); half.assign(R.half); });
      });
    });
  }
  // (its edge wanders: a worn path is never drawn with a ruler)
  return vec2(best.sub(vnoise(p.mul(1 / 2.3), uint(611)).sub(0.5).mul(2).add(vnoise(p.mul(1 / 0.7), uint(612)).sub(0.5)).mul(WANDER)), half);
});

/** The same in JS: how far (x, z) lies past the edge of the nearest path, its wander the same (land.js noiseAt: the
    nodes' noise; Infinity where none comes within `reach`). */
function pathNearJS(x, z, reach = 0) {
  let best = Infinity;
  for (const R of RUNS) {
    const m = R.half + STRAY + reach;
    if (x < R.box[0] - m || x > R.box[2] + m || z < R.box[1] - m || z > R.box[3] + m) continue;
    for (let k = R.first; k < R.first + R.n; k++) {
      const [ax, az, bx, bz] = SEGS[k], ex = bx - ax, ez = bz - az, t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / Math.max(ex * ex + ez * ez, 1e-6)));
      best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t) - R.half);
    }
  }
  return best === Infinity ? best : best - ((noiseAt(x / 2.3, z / 2.3, 611) - 0.5) * 2 + (noiseAt(x / 0.7, z / 0.7, 612) - 0.5)) * WANDER;
}

// the paths are ways: a thing is kept off one where its base (`margin`: how far round its middle what is solid of it
// stands on the ground, assets/kinds.js baseOf) reaches onto the trodden width, its edge wandering as the worn ground's
// does; nothing else of it (a crown over the path, a shrub's leaves) is a reason. The grass and the stones by the same
// rule at their own size (a blade's point, a stone's half side). The same in JS, for what is solid of them.
if (RUNS.length) addWays({
  node: (p, margin) => float(1).sub(step(margin, pathNear(p, margin).x)),
  at: (x, z, margin) => pathNearJS(x, z, margin) < margin,
});

/** A texel of a page worn by a path (node code, in the page's kernel: src/terrain/pages.js): p its point, s its size
    (metres), M what laid() laid there ({ c, h, n, cv, shade }: changed here), read(material, tile) a ground's material
    read at p as laid() reads it ({ c, h, n }). As much of the texel as the path covers (its width against the texel's,
    so a path far off, thinner than a texel, is a line of its share and never a row of dots). */
export function wear(p, s, M, read) {
  if (!RUNS.length) return;
  const W = pathNear(p, s.mul(0.5).add(0.6)).toVar(), e = W.x, half = W.y;
  If(e.lessThan(s.mul(0.5).add(SOFT)), () => {
    // the share of the texel the path covers: the path [-half, half] across, its edge itself soft over SOFT metres, so
    // seen through the texel (s wide round its point) a box SOFT and s together wide (near, the soft edge; far, a line
    // of its share)
    const d = e.add(half), box = s.mul(s).add(SOFT * SOFT).sqrt(), worn = clamp(min(d.add(box.mul(0.5)), half).sub(max(d.sub(box.mul(0.5)), half.negate())).div(box), 0, 1).toVar();
    const c = clamp(d.div(half), 0, 1.4);   // across it: 0 its middle, 1 its edge
    // packed, cracked earth where feet go most, crumbs and pebbles towards the edges, in patches
    const mid = float(1).sub(smoothstep(0.25, 0.75, c.add(vnoise(p.mul(1 / 1.9), uint(613)).sub(0.5).mul(0.6)))).toVar();
    // (the dry earth's plates small and half worn away: trodden, not paved)
    const A = read(DIRT, 0.7), B = read(CRUMBS, 2.0), dirt = mid.mul(0.6);
    const col = mix(B.c, mix(B.c, A.c, 0.7).mul(vec3(1.08, 1.04, 1)), dirt), nrm = mix(B.n, A.n.mul(0.6), dirt);
    // its height: trodden down in the middle (its own grain kept, flatter), a lip of soil pushed up along each edge
    const lip = smoothstep(0.55, 0.95, c).mul(float(1).sub(smoothstep(1.0, 1.35, c))).mul(0.22);
    const h = mix(B.h.mul(0.8), A.h.mul(0.6).add(0.08), dirt).add(lip);
    M.c.assign(mix(M.c, col, worn)); M.n.assign(mix(M.n, nrm, worn)); M.h.assign(mix(M.h, h, worn));
    // no carpet on it, and a thinner one along its edge (trampled)
    M.cv.assign(M.cv.mul(float(1).sub(worn)).mul(mix(0.55, 1, smoothstep(0.1, 0.9, e))));
  });
}
