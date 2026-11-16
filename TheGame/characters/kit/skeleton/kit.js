// What a part of the skeleton is built with (intent 0033): a bone is begun, then its solids are put, cut and crossed,
// every point written for the man of reference and for the left side; the kit carries them to the body being made
// (K.X, K.s) and mirrors them for the right.
//
//   K.bone(id, rig, part)      begin a bone: `id` its own name ('femur.L', 'T7', 'tooth.U3.R'), `rig` the rig's bone
//                              that carries it; every solid after it is part of it, blended only with its own
//   K.put(solid, k)            add a solid, blended over k metres;  K.cut(solid, k) carve it out;  K.and(solid, k) keep
//                              only what lies inside it
//   K.ball, egg, rod, box, ring, strand, loft, plate, plane, group     the solids of ../field.js, given in the reference
//                              man's metres on the left side
//   K.along(pts, [w, d], [w, d], out, k)   a band along a curve, its section from one end to the other
//   K.pair((side, sg) => …)    run once for each side ('L', 1 then 'R', -1), mirrored
//   K.both(() => …)            the same inside a bone of the middle (its two halves)
import * as F from '../field.js';
import { PART } from './rig.js';

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1)), lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Points along a smooth curve through P (Catmull-Rom), n a span. */
export function spline(P, n = 3) {
  const out = [], cr = (a, b, c, d, t) => a.map((_, i) => 0.5 * (2 * b[i] + (-a[i] + c[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t * t + (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * t * t * t));
  for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < n; j++) out.push(cr(P[Math.max(0, i - 1)], P[i], P[i + 1], P[Math.min(P.length - 1, i + 2)], j / n));
  out.push(P.at(-1));
  return out;
}

/** The kit for a body: X carries a point of the reference man to it (X.k its lengths). */
export function kitOf(X = (p) => p) {
  const k1 = X.k ?? 1, s = (v) => v * k1, bones = [];
  let cur = null, sg = 1;
  const M = (p) => (sg > 0 ? p : [-p[0], p[1], p[2]]), C = (p) => X(M(p)), D = (v) => M(v);   // a point, a direction
  // a frame given by two of its axes (as field.frame), or as nine numbers already; mirrored with the side
  const FR = (R) => (!R ? undefined : R.length === 2 ? F.frame(D(R[0]), D(R[1])) : sg > 0 ? R : F.frame(D([R[0], R[1], R[2]]), D([R[3], R[4], R[5]])));
  const K = {
    X, s, bones, PART,
    get sg() { return sg; },
    bone(id, rig, part = PART.bone) { cur = { id, rig, part, ops: [] }; bones.push(cur); return K; },
    put(sol, k = 0.002, part) { cur.ops.push({ op: 'add', s: sol, k: k * k1, part: part ?? cur.part }); return K; },
    cut(sol, k = 0.002) { cur.ops.push({ op: 'sub', s: sol, k: k * k1, part: cur.part }); return K; },
    and(sol, k = 0.002) { cur.ops.push({ op: 'and', s: sol, k: k * k1, part: cur.part }); return K; },
    pair(fn) { for (const [side, g] of [['L', 1], ['R', -1]]) { sg = g; fn(side, g); } sg = 1; },
    both(fn) { const was = sg; for (const g of [1, -1]) { sg = g * was; fn(g); } sg = was; },
    P: C,   // a reference point (left side) carried to this body and side
    ball: (c, r) => F.ball(C(c), s(r)),
    /** R: [x axis, y axis] of its own frame (or nothing: the world's) */
    egg: (c, r, R) => F.egg(C(c), r.map(s), FR(R)),
    rod: (a, b, ra, rb = ra) => F.rod(C(a), C(b), s(ra), s(rb)),
    box: (c, h, rr = 0, R) => F.box(C(c), h.map(s), s(rr), FR(R)),
    ring: (c, R0, r, R) => F.ring(C(c), s(R0), s(r), FR(R)),
    plane: (n, at) => F.plane(norm(D(n)), C(at)),
    /** as field.strand; out: the way its depth faces */
    strand: (a, b, o) => {
      const q = { ...o, w: s(o.w), d: s(o.d), bend: s(o.bend ?? 0) };
      if (o.t0) q.t0 = o.t0.map(s); if (o.t1) q.t1 = o.t1.map(s);
      if (o.out) q.out = D(o.out); else if (o.v) { q.v = D(o.v); if (sg < 0) q.bend = -q.bend; }
      return F.strand(C(a), C(b), q);
    },
    /** as field.loft: knots [w+, w-, front, back, cv, cw, nf, nb] (or its short forms), `out` its front (or `v` its width) */
    loft: (a, b, knots, o = {}) => {
      const A = a, B = b, u = norm(sub(B, A));
      // its own axes on the left side: v across, w to the front
      let v = o.out ? cross(o.out, u) : (o.v ?? [1, 0, 0]); v = norm(sub(v, mul(u, dot(v, u)))); const w = cross(u, v);
      let kn = knots.map((k) => (k.length >= 8 ? k.slice(0, 8) : k.length <= 3 ? [k[0], k[0], k[1], k[2] ?? k[1], 0, 0, 2, 2] : [k[0], k[0], k[1], k[2], k[3] ?? 0, 0, k[4] ?? 2, k[4] ?? 2]));
      // mirrored: the front kept (out = the mirrored w), so v runs the other way: its two half-widths change places
      if (sg < 0) kn = kn.map((k) => [k[1], k[0], k[2], k[3], -k[4], k[5], k[6], k[7]]);
      kn = kn.map((k) => [s(k[0]), s(k[1]), s(k[2]), s(k[3]), s(k[4]), s(k[5]), k[6], k[7]]);
      return F.loft(C(A), C(B), kn, { out: D(w), caps: o.caps ?? 0, round: (o.round ?? [0, 0]).map(s) });
    },
    /** as field.plate: R [u axis, v axis] of its plane, the outline in it (metres from c) */
    plate: (c, R, outline, o = {}) => {
      const b = o.bend ?? [0, 0, 0], g = sg < 0 ? -1 : 1;
      return F.plate(C(c), F.frame(D(R[0]), D(R[1])), outline.map((p) => [s(p[0]), s(p[1])]), { tc: s(o.tc ?? 0.003), te: s(o.te ?? o.tc ?? 0.003), ramp: s(o.ramp ?? 0.01), bend: [(g * b[0]) / k1, (g * b[1]) / k1, (g * b[2]) / k1], smooth: o.smooth ?? 1 });
    },
    group: (ops, lo, hi) => F.group(ops, lo, hi),
    /** a band along a curve: its section [wide, thick] from one end to the other, its broad side facing out(p) */
    along(pts, s0, s1, out, k = 0.0015, part) {
      const n = pts.length - 1;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, wa = s0[0] + (s1[0] - s0[0]) * t0, wb = s0[0] + (s1[0] - s0[0]) * t1, da = s0[1] + (s1[1] - s0[1]) * t0, db = s0[1] + (s1[1] - s0[1]) * t1;
        K.put(K.strand(pts[i], pts[i + 1], { w: (wa + wb) / 2, d: (da + db) / 2, t0: [wa, da], t1: [wb, db], out: typeof out === 'function' ? out(lerp(pts[i], pts[i + 1], 0.5)) : out }), k, part);
      }
      return K;
    },
    // (the first pass's bones, written before the kit: solids made by hand, put on a rig bone with no bone of their own)
    legacy(module) {
      const at = new Map(), on = (rig) => { if (!at.has(rig)) { const b = { id: `${module}:${rig}`, rig, part: PART.bone, ops: [] }; bones.push(b); at.set(rig, b); } return at.get(rig); };
      const put = (rig, sol, k, part = PART.bone, op = 'add') => on(rig).ops.push({ op, s: sol, k: k * k1, part });
      const along = (rig, pts, w0, d0, w1, d1, out, k = 0.0015, part = PART.bone) => {
        const n = pts.length - 1;
        for (let i = 0; i < n; i++) {
          const a = X(pts[i]), b = X(pts[i + 1]), t0 = i / n, t1 = (i + 1) / n;
          const wa = s(w0 + (w1 - w0) * t0), wb = s(w0 + (w1 - w0) * t1), da = s(d0 + (d1 - d0) * t0), db = s(d0 + (d1 - d0) * t1);
          put(rig, F.strand(a, b, { w: (wa + wb) / 2, d: (da + db) / 2, t0: [wa, da], t1: [wb, db], out: out(lerp(pts[i], pts[i + 1], 0.5)) }), k, part);
        }
      };
      return { put, along };
    },
  };
  return K;
}
