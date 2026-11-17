// The muscles drawn out (intent 0036): each muscle of the table (./table.js) laid on the skeleton standing, as one or
// more strands from its origin to its insertion, and handed to the page as numbers the rig moves (./flesh.js). Plain JS,
// no three: it runs in the workers that grow the bones (../skeleton/grow.worker.js), or under node.
//
//   musclesOf(bones) -> { rows, muscles, attr, fine, coarse, counts }
//     bones    the skeleton's bones with their fields (../skeleton/mesh.js prepare)
//     rows     one to each strand: its points (each carried by a joint of the rig, in that joint's own frame, with the
//              way its outside faces), whether it closes on itself, its length standing and how much of it is tendon
//     attr     each point of the surface: where it is along its strand and round it (its frame's numbers), how open it
//              stands, how much tendon it is
//     fine, coarse   its triangles at two levels of detail (the coarse one every other ring and every other point round)
//
// A strand is a curve through its points (Catmull-Rom, the same in the shader), with a frame at every place along it:
// along the curve, out (the way the bones round it say is outside), and across. Its section is an oval, full on its
// outside and flatter against what it lies on, as large as its share of the muscle's volume asks, thinning into its
// tendons. Standing, each strand is lifted off the bones and off the layers under it, so a muscle lies on what is under
// it rather than through it. Moving, the shader carries the curve with the joints and swells or thins the belly so the
// volume stays what it was (./flesh.js).
import { MUSCLES } from './table.js';
import { LANDMARKS } from './landmarks.js';
import { rigOf, rigBoneOf } from '../skeleton/pose.js';
import { unionOf } from '../skeleton/mesh.js';
import { slope } from '../field.js';

import { MAXK } from './layout.js';

const AROUND = 10, RING = 0.011, GAP = 0.0008, DEEP = 0.3;
// The man these muscles are laid for is slightly muscular (intent 0036): his muscles the studies' means. They were a
// fifth larger, and with the skin drawn from them the thighs and the hips stood far out of a real man's. A body's build
// will set it later.
export const BUILD = 1.0;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const mirror = (n) => n.replace(/\.L$/, '.R');
// a squarer oval: a point of the unit circle carried onto |x|^e + |y|^e = 1, and that shape's area against its box's
const sup = (c, e) => Math.sign(c) * Math.abs(c) ** (2 / e);
const kappa = (e) => { let a = 0; for (let i = 0; i < 400; i++) { const x = (i + 0.5) / 400; a += (1 - x ** e) ** (1 / e) / 400; } return 4 * a; };

// ── the curve: the same numbers as the shader's (./flesh.js) ────────────────────────────────────────────────────────
/** A strand's points with their ghosts, as the texture holds them (./layout.js): open (a ghost before, one after, and a
 *  spare) or closed (the last before, the first two after). */
export function slots(P, closed) {
  const n = P.length;
  if (closed) return [P[n - 1], ...P, P[0], P[1]];
  return [sub(mul(P[0], 2), P[1]), ...P, sub(mul(P[n - 1], 2), P[n - 2]), P[n - 1]];
}
const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return [0, 1, 2].map((i) => 0.5 * (2 * p1[i] + (p2[i] - p0[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t3)); };
const crd = (p0, p1, p2, p3, t) => [0, 1, 2].map((i) => 0.5 * ((p2[i] - p0[i]) + 2 * (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t + 3 * (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t * t));
/** The place at segment i, t along it: { C, T, O, B } (S: the slots of the points, Q: the slots of their outs). */
export function frameAt(S, Q, i, t) {
  const C = cr(S[i], S[i + 1], S[i + 2], S[i + 3], t), T = norm(crd(S[i], S[i + 1], S[i + 2], S[i + 3], t));
  const o = lerp(Q[i + 1], Q[i + 2], t), O = norm(sub(o, mul(T, dot(o, T)))), B = cross(T, O);
  return { C, T, O, B, o };   // (o: the out as mixed, before it is squared to the curve: two frames are mixed by it, as the shader mixes them)
}

// ── the points: landmarks, points on bones, points passed ──────────────────────────────────────────────────────────
function pointOf(spec) {
  if (typeof spec === 'string') spec = { lm: spec, d: [0, 0, 0] };
  if (spec.lm) { const L = LANDMARKS[spec.lm]; if (!L) throw new Error('no landmark ' + spec.lm); return { on: L[0], p: add(L[1], spec.d) }; }
  return spec;
}
/** The points a band passes: one from each line of the path (spread along it, or one to a band). */
function bandPath(path, j, n) {
  return path.map((step) => {
    if (!step.line) return pointOf(step);
    const L = step.line.map(pointOf);
    if (L.length === n) return L[j];
    if (L.length === 1) return L[0];
    // along the line's points, the band's share of its length (its middle)
    const seg = []; let tot = 0; for (let k = 1; k < L.length; k++) { const d = len(sub(L[k].p, L[k - 1].p)); seg.push(d); tot += d; }
    let want = ((j + 0.5) / n) * tot, k = 0; while (k < seg.length - 1 && want > seg[k]) { want -= seg[k]; k++; }
    const t = seg[k] ? want / seg[k] : 0, a = L[k], b = L[k + 1], near = t < 0.5 ? a : b;
    return { ...(near.on ? { on: near.on } : { by: near.by }), p: lerp(a.p, b.p, t), mixed: true };
  });
}
/** How far apart a band's neighbours are along a line (for a sheet's width), at the line's band j. */
function spacing(step, j, n) {
  if (!step.line || n < 2) return 0;
  const L = step.line.map(pointOf); let tot = 0; for (let k = 1; k < L.length; k++) tot += len(sub(L[k].p, L[k - 1].p));
  return L.length === n ? (tot / (n - 1)) : tot / n;
}

// ── the strands, standing ───────────────────────────────────────────────────────────────────────────────────────────
/** All the muscles, drawn out standing. */
export function musclesOf(bones) {
  const RIG = rigOf(), byId = new Map(bones.map((b) => [b.id, b]));
  const near = unionOf(bones, 0.05), far = unionOf(bones, 0.16);
  const grad = (U, p, e = 0.002) => { const g = [(U(p[0] + e, p[1], p[2]) - U(p[0] - e, p[1], p[2])), (U(p[0], p[1] + e, p[2]) - U(p[0], p[1] - e, p[2])), (U(p[0], p[1], p[2] + e) - U(p[0], p[1], p[2] - e))]; return len(g) > 1e-9 ? norm(g) : null; };
  // a point onto its bone's surface: down the bone's own field
  const snap = (id, p) => {
    const b = byId.get(id); if (!b) throw new Error('no bone ' + id);
    let q = p.slice();
    for (let it = 0; it < 6; it++) { const l = b.F.nearPoint(q[0], q[1], q[2]), f = b.F.ev(l, q[0], q[1], q[2]); if (!l.length || Math.abs(f) < 1e-4) break; const g = slope(b.F, l, q[0], q[1], q[2], 3e-4), gl = Math.hypot(...g) || 1; q = sub(q, mul(g, f / (gl * gl))); }
    return q;
  };
  const rigOf_ = (name) => (RIG[name] ? name : rigBoneOf(name));

  // every band of every muscle, left side, in the order of its layer
  const bands = [];
  for (const m of MUSCLES) {
    const n = m.bands ?? 1;
    for (let j = 0; j < n; j++) {
      const pts = bandPath(m.path, j, n);
      const keys = pts.map((q) => ({ rig: rigOf_(q.on ?? q.by), p: q.on ? snap(q.on, q.p) : q.p, on: !!q.on }));
      const t0 = Array.isArray(m.t?.[0]) ? m.t[0][j] : m.t?.[0] ?? 0.04, t1 = Array.isArray(m.t?.[1]) ? m.t[1][j] : m.t?.[1] ?? 0.1;
      const sp = m.sheet ? [spacing(m.path[0], j, n), spacing(m.path.at(-1), j, n)] : null;
      bands.push({ m, j, n, keys, t0: m.tendon ? 0 : t0, t1: m.tendon ? 0 : t1, sp, layer: m.layer ?? 1 });
    }
  }
  if (bands.some((b) => b.keys.length > MAXK || b.keys.length < 2)) throw new Error('a muscle has more than ' + MAXK + ' points, or fewer than two');
  // (a sheet's bands are drawn with as many rings each, at the same shares of their lengths: the sheet is woven
  // between them, ring to ring)
  const polyLen = (b) => { let l = 0; for (let i = 1; i < b.keys.length; i++) l += len(sub(b.keys[i].p, b.keys[i - 1].p)); return l * 1.08; };
  const ringsFor = new Map();
  for (const b of bands) { const R = Math.min(40, Math.max(6, Math.round(polyLen(b) / RING) + 1)); ringsFor.set(b.m, Math.max(ringsFor.get(b.m) ?? 0, R)); }
  bands.sort((a, b) => a.layer - b.layer);

  // the layers already laid, as a field: how far a point is from the nearest strand's surface (roughly: inside < 0)
  const G = 0.03, grid = new Map(), key = (i, j, k) => i + 4096 * (j + 4096 * k), laid = [];
  const lay = (rings) => { for (const r of rings) { laid.push(r); const e = Math.max(r.a, r.dout, r.din) + r.half + len(r.shift), c = add(r.C, r.shift); for (let i = Math.floor((c[0] - e) / G); i <= Math.floor((c[0] + e) / G); i++) for (let j = Math.floor((c[1] - e) / G); j <= Math.floor((c[1] + e) / G); j++) for (let k = Math.floor((c[2] - e) / G); k <= Math.floor((c[2] + e) / G); k++) { const q = key(i, j, k); let l = grid.get(q); if (!l) grid.set(q, (l = [])); l.push(r); } } };
  const flesh = (p, reach = 0.05) => {
    const l = grid.get(key(Math.floor(p[0] / G), Math.floor(p[1] / G), Math.floor(p[2] / G))); if (!l) return reach;
    let f = reach;
    for (const r of l) {
      const d = sub(p, add(r.C, r.shift)), along = dot(d, r.T); if (Math.abs(along) > r.half * 1.3) continue;
      const x = dot(d, r.B) / r.a, yo = dot(d, r.O), c = yo > 0 ? r.dout : r.din, e = Math.hypot(x, yo / c);
      const v = (e - 1) * Math.min(r.a, c); if (v < f) f = v;
    }
    return f;
  };
  const under = (p) => Math.min(near(p[0], p[1], p[2]), flesh(p));

  // ── each band: its curve, its rings, its section, lifted onto what is under it ───────────────────────────────────
  const out = [];
  for (const B of bands) {
    const { m, keys } = B, closed = !!m.ring, n = keys.length;
    // the way each point's outside faces: away from the bones round it (or the muscle's own say)
    const outs = keys.map((k) => { if (m.out) return norm(m.out); const g = grad(far, k.p) ?? grad(far, add(k.p, [0, 0, 0.01])); return g ?? norm([k.p[0], 0, k.p[2] + 0.02]); });
    let P = keys.map((k) => k.p);
    // (a point on a bone stands off it by the depth its deep side will need: set when the section is known, below)
    const S0 = () => slots(P, closed), Q = slots(outs, closed), segs = closed ? n : n - 1;
    // the curve's length, finely, and where each ring goes: evenly along it
    const lengthTable = () => { const S = S0(), tab = [0]; let L = 0, prev = cr(S[0], S[1], S[2], S[3], 0); for (let i = 0; i < segs; i++) for (let q = 1; q <= 24; q++) { const c = cr(S[i], S[i + 1], S[i + 2], S[i + 3], q / 24); L += len(sub(c, prev)); prev = c; tab.push(L); } return tab; };
    let tab = lengthTable(), L = tab.at(-1);
    const R = closed ? Math.max(16, Math.round(L / RING)) : m.sheet ? ringsFor.get(m) : Math.min(40, Math.max(6, Math.round(L / RING) + 1));
    // the section along it (s: 0 at the origin, 1 at the insertion): its width and depth as shares of the belly's
    const tau = m.tendon ? 1 : m.tau ?? 0.3, ramp = 0.12;
    const prof = (s) => {
      if (closed || m.tendon) return 1;
      const a = smooth((s - B.t0) / ramp + 0.5), b = smooth((1 - B.t1 - s) / ramp + 0.5), g = Math.min(a, b);
      const belly = Math.sin(Math.PI * Math.min(1, Math.max(0, (s - B.t0) / Math.max(0.05, 1 - B.t0 - B.t1))));
      let v = tau + (1 - tau) * g * (0.72 + 0.28 * belly);
      for (const mk of m.marks ?? []) v *= 1 - 0.35 * Math.exp(-(((s - mk) / 0.012) ** 2));
      return v;
    };
    const fleshOf = (s) => (m.tendon ? 0 : closed ? 1 : Math.min(smooth((s - B.t0) / 0.06 + 0.5), smooth((1 - B.t1 - s) / 0.06 + 0.5)) * (1 - Math.max(0, ...(m.marks ?? []).map((mk) => Math.exp(-(((s - mk) / 0.008) ** 2))))));
    // the belly's own width and depth from the volume: π/4 · W(s) · D(s) summed along the length is the band's share
    const vol = (BUILD * m.vol * 1e-6) / B.n;
    // (a sheet's bands overlap their neighbours a little, as wide as the line they come from allows; their section
    // squarer than an oval, so side by side they read as one sheet: |x|^e + |y|^e = 1, its area κ(e)/4 · w · d)
    const widthAt = B.sp ? (s) => Math.max(0.004, (B.sp[0] + (B.sp[1] - B.sp[0]) * s) * 1.45) : null, ex = B.sp ? 2.8 : 2.2, kap = kappa(ex);
    let sum = 0; for (let q = 0; q <= 64; q++) { const s = q / 64, g = prof(s), w = widthAt ? widthAt(s) * Math.sqrt(g) : g; sum += (kap / 4) * w * g * (L / 64) * (q === 0 || q === 64 ? 0.5 : 1); }
    let W0, D0;
    if (widthAt) { let a = 0; for (let q = 0; q <= 64; q++) { const s = q / 64; a += (widthAt(s) / 1.45) * prof(s) * (L / 64) * (q === 0 || q === 64 ? 0.5 : 1); } D0 = vol / a; W0 = 1; } else { const aspect = m.aspect ?? 1.4, k = Math.sqrt(vol / (sum * aspect)); W0 = k * aspect; D0 = k; }
    const secAt = (s) => { const g = prof(s); return widthAt ? { w: widthAt(s) * Math.sqrt(g), d: Math.min(D0 * g, 0.06) } : { w: W0 * g, d: Math.min(D0 * g, 0.07) }; };
    // the ends on a bone stand off it by their deep side, so they lie on it
    if (!closed) for (const [ki, s] of [[0, 0], [n - 1, 1]]) if (keys[ki].on) P[ki] = add(P[ki], mul(outs[ki], secAt(s).d * DEEP + GAP));
    tab = lengthTable(); L = tab.at(-1);
    // each ring at its share of the length: the segment and the place in it
    const places = [];
    for (let r = 0; r < R; r++) {
      const want = closed ? (r / R) * L : (r / (R - 1)) * L; let q = 0; while (q < tab.length - 2 && tab[q + 1] < want) q++;
      const f = (q + (tab[q + 1] - tab[q] > 0 ? (want - tab[q]) / (tab[q + 1] - tab[q]) : 0)) / 24, i = Math.min(segs - 1, Math.floor(f));
      places.push({ i, t: Math.min(1, f - i), s: want / L });
    }
    const S = S0();
    const rings = places.map(({ i, t, s }) => { const F = frameAt(S, Q, i, t), sec = secAt(s); return { i, t, s, ex, ...F, D: sec.d, a: sec.w / 2, dout: sec.d * (1 - DEEP), din: sec.d * DEEP, shift: [0, 0, 0], half: L / Math.max(1, R - 1) / 2, flesh: fleshOf(s) }; });
    // lifted off what is under it: each ring moved out of the bones and the layers laid before it, down the slope of
    // what it is in (and never inwards), a few steps, each a little
    const deep = [Math.PI, 1.25 * Math.PI, 1.5 * Math.PI, 1.75 * Math.PI, 0];
    for (const r of rings) {
      for (let it = 0; it < 12; it++) {
        let worst = 0, at = null;
        for (const th of deep) { const p = add(add(add(r.C, r.shift), mul(r.O, Math.sin(th) * r.din)), mul(r.B, Math.cos(th) * r.a)), f = under(p) - GAP; if (f < worst) { worst = f; at = p; } }
        if (worst >= -1e-4) break;
        let g = grad(under, at, 0.0015) ?? r.O; if (dot(g, r.O) < 0.2) g = norm(add(g, mul(r.O, 0.6)));
        r.shift = add(r.shift, mul(g, Math.min(0.005, -worst + 2e-4)));
        if (len(r.shift) > 0.008) { r.shift = mul(norm(r.shift), 0.008); break; }   // (a little: a strand's path is drawn through its own middle, where it lies over the muscles under it; lifted further, as far as 4.5 cm, the thigh's outer and back muscles stood 2 to 4 cm out of a real thigh)
      }
    }
    // (evened along the strand, so it does not kink where one ring was moved more than the next)
    for (let pass = 0; pass < 4; pass++) { const was = rings.map((r) => r.shift); for (let r = 1; r < rings.length - 1; r++) { const m2 = mul(add(was[r - 1], was[r + 1]), 0.5), keep = len(m2) > len(was[r]) ? 0.3 : 0.5; rings[r].shift = add(mul(was[r], keep), mul(m2, 1 - keep)); } }
    lay(rings);
    out.push({ B, keys, P, outs, rings, closed, L, segs });
  }

  // ── the rows the rig moves, and the surface's points in their frames ───────────────────────────────────────────────
  // A strand of its own is a tube round its curve. A sheet is one surface woven between its bands' curves: a point of
  // it is a share f of the way from one curve to the next, at the same ring of both, and as thick there as the bands
  // round it make it (each band's depth, spread across its width), its edges thinning to nothing.
  // (the right side is the left's mirror, point for point: the same rings in the same order, its own frames; how open a
  // point stands is found on the left and kept for its mirror)
  const rows = [], muscles = new Map(), pos = [], attr = { place: [], pair: [], sec: [], nor: [], look: [] }, fine = [], coarse = [];
  const all = (p) => Math.min(near(p[0], p[1], p[2]), flesh(p)), AO = [0.004, 0.012, 0.028], AW = [0.4, 0.35, 0.25];
  const groups = []; for (const o of out) { const g = groups.at(-1); if (g && g[0].B.m === o.B.m) g.push(o); else groups.push([o]); }
  let nv = 0;
  for (const side of [1, -1]) for (const group of groups) {
    const m = group[0].B.m, M = (p) => (side > 0 ? p : [-p[0], p[1], p[2]]), name = (n) => (side > 0 ? n : mirror(n));
    const first = rows.length, curves = [];
    for (const o of group) {
      const keys = o.keys.map((k, i) => ({ rig: name(k.rig), p: M(o.P[i]), out: M(o.outs[i]) }));
      let L0 = 0; for (let i = 1; i < keys.length; i++) L0 += len(sub(keys[i].p, keys[i - 1].p));
      rows.push({ keys: keys.map((k) => ({ rig: k.rig, at: sub(k.p, RIG[k.rig].at), out: k.out })), closed: o.closed, L0, Lt: L0 * (o.B.t0 + o.B.t1) });
      curves.push({ o, S: slots(keys.map((k) => k.p), o.closed), Q: slots(keys.map((k) => k.out), o.closed) });
    }
    const mid = name(m.id + '.L'); muscles.set(mid, { id: mid, name: m.name, part: m.part, layer: m.layer, vol: m.vol, src: m.src, rows: group.map((_, j) => first + j) });
    const base = nv, P0 = [], FR = [];
    // a point: where it stands, and its place: on one curve (j, ring r) or between two (j and j + 1, f of the way)
    const frameOf = (j, r, f) => {
      const A = curves[j], ra = A.o.rings[r], Fa = frameAt(A.S, A.Q, ra.i, ra.t); if (!f) return Fa;
      const Bc = curves[j + 1], rb = Bc.o.rings[r], Fb = frameAt(Bc.S, Bc.Q, rb.i, rb.t);
      const C = lerp(Fa.C, Fb.C, f), T = norm(lerp(Fa.T, Fb.T, f)), o = lerp(Fa.o, Fb.o, f), O = norm(sub(o, mul(T, dot(o, T))));
      return { C, T, O, B: cross(T, O) };
    };
    const point = (j, r, f, two, p, shift) => {
      const ra = curves[j].o.rings[r], rb = two ? curves[j + 1].o.rings[r] : ra, F = frameOf(j, r, two ? f : 0), rel = sub(p, F.C), lift = dot(shift, F.O), fl = ra.flesh + (rb.flesh - ra.flesh) * Math.min(1, Math.max(0, f));
      P0.push(p); FR.push(F); pos.push(...p);
      attr.place.push(first + j, ra.i, ra.t, fl); attr.pair.push(rb.i, rb.t, two ? f : 0, two ? first + j + 2 : 0);
      attr.sec.push(dot(rel, F.O) - lift, dot(rel, F.B), dot(rel, F.T), lift); attr.look.push(1, 1 - fl, 0, ra.s * curves[j].o.L);
      return nv++;
    };
    const tri = (list, a, b, c) => (side > 0 ? list.push(a, b, c) : list.push(a, c, b));
    const f0 = fine.length, c0 = coarse.length;
    if (!m.sheet || group.length < 2) {
      // tubes
      for (let j = 0; j < curves.length; j++) {
        const { o } = curves[j], rings = o.rings, closed = o.closed, A = AROUND, ringsN = rings.length, b0 = nv;
        for (let r = 0; r < ringsN; r++) { const R = rings[r]; for (let k = 0; k < A; k++) {
          const th = (k / A) * 2 * Math.PI, c = sup(Math.cos(th), R.ex), s = sup(Math.sin(th), R.ex);
          point(j, r, 0, false, M(add(add(add(R.C, R.shift), mul(R.O, s >= 0 ? s * R.dout : s * R.din)), mul(R.B, c * R.a))), M(R.shift));
          attr.look[(nv - 1) * 4 + 2] = c * R.a;   // (across the muscle: where its fibres run)
        } }
        const caps = closed ? [] : [0, ringsN - 1].map((ri) => { const R = rings[ri]; return point(j, ri, 0, false, M(add(add(R.C, R.shift), mul(R.O, (R.dout - R.din) / 2))), M(R.shift)); });
        const v = (ri, k) => b0 + (((ri % ringsN) + ringsN) % ringsN) * A + (k % A);
        const quads = (list, rStep, kStep) => {
          const rs = []; for (let r = 0; r < ringsN; r += rStep) rs.push(r); if (!closed && rs.at(-1) !== ringsN - 1) rs.push(ringsN - 1);
          const span = closed ? rs.length : rs.length - 1;
          for (let q = 0; q < span; q++) { const r0 = rs[q], r1 = closed ? rs[(q + 1) % rs.length] : rs[q + 1]; for (let k = 0; k < A; k += kStep) { const a = v(r0, k), b = v(r0, k + kStep), c = v(r1, k + kStep), d = v(r1, k); tri(list, a, d, c); tri(list, a, c, b); } }
          if (!closed) for (let k = 0; k < A; k += kStep) { tri(list, caps[0], v(0, k), v(0, k + kStep)); tri(list, caps[1], v(ringsN - 1, k + kStep), v(ringsN - 1, k)); }
        };
        quads(fine, 1, 1); quads(coarse, 2, 2);
      }
    } else {
      // a sheet: columns across it (three to a band, its edges half a band beyond the outer curves), a top and an under
      // surface, joined round its rim
      const n = curves.length, R = curves[0].o.rings.length, cols = 3 * n + 1, b0 = nv;
      const thick = (r, v) => {
        let t = 0; for (let j = 0; j < n; j++) { const x = v - j; if (Math.abs(x) < 1) t += curves[j].o.rings[r].D * Math.cos((Math.PI * x) / 2) ** 2; }
        const edge = Math.min(1, (v + 0.5) / 0.45, (n - 0.5 - v) / 0.45);
        return t * (edge <= 0 ? 0 : edge * edge * (3 - 2 * edge)) * 1.15;
      };
      for (const face of [1, -1]) for (let r = 0; r < R; r++) for (let c = 0; c < cols; c++) {
        const v = -0.5 + c / 3, j = Math.min(n - 2, Math.max(0, Math.floor(v))), f = v - j, F = frameOf(j, r, f);
        const shift = M(lerp(curves[j].o.rings[r].shift, curves[j + 1].o.rings[r].shift, Math.min(1, Math.max(0, f))));
        const T = thick(r, v), o = face > 0 ? T * (1 - DEEP) : -T * DEEP;
        point(j, r, f, true, add(add(F.C, shift), mul(F.O, o)), shift);   // (F is already this side's own)
        attr.look[(nv - 1) * 4 + 2] = v * (curves[0].o.rings[r].a * 2 / 1.45);
      }
      const v = (face, r, c) => b0 + (face > 0 ? 0 : R * cols) + r * cols + c;
      const weave = (list, rStep, cStep) => {
        const rs = []; for (let r = 0; r < R; r += rStep) rs.push(r); if (rs.at(-1) !== R - 1) rs.push(R - 1);
        const cs = []; for (let c = 0; c < cols; c += cStep) cs.push(c); if (cs.at(-1) !== cols - 1) cs.push(cols - 1);
        for (let q = 0; q < rs.length - 1; q++) for (let k = 0; k < cs.length - 1; k++) {
          const r0 = rs[q], r1 = rs[q + 1], c0 = cs[k], c1 = cs[k + 1];
          // (the top seen from outside, the under side from inside: wound the other way)
          tri(list, v(1, r0, c0), v(1, r0, c1), v(1, r1, c1)); tri(list, v(1, r0, c0), v(1, r1, c1), v(1, r1, c0));
          tri(list, v(-1, r0, c0), v(-1, r1, c1), v(-1, r0, c1)); tri(list, v(-1, r0, c0), v(-1, r1, c0), v(-1, r1, c1));
        }
        // the rim: its two ends and its two edges, top to under
        for (let k = 0; k < cs.length - 1; k++) { const c0 = cs[k], c1 = cs[k + 1]; tri(list, v(1, 0, c0), v(-1, 0, c0), v(-1, 0, c1)); tri(list, v(1, 0, c0), v(-1, 0, c1), v(1, 0, c1)); const e = R - 1; tri(list, v(1, e, c0), v(1, e, c1), v(-1, e, c1)); tri(list, v(1, e, c0), v(-1, e, c1), v(-1, e, c0)); }
        for (let q = 0; q < rs.length - 1; q++) { const r0 = rs[q], r1 = rs[q + 1], e = cols - 1; tri(list, v(1, r0, 0), v(1, r1, 0), v(-1, r1, 0)); tri(list, v(1, r0, 0), v(-1, r1, 0), v(-1, r0, 0)); tri(list, v(1, r0, e), v(-1, r1, e), v(1, r1, e)); tri(list, v(1, r0, e), v(-1, r0, e), v(-1, r1, e)); }
      };
      weave(fine, 1, 1); weave(coarse, 2, 2);
      // its volume, from its own surface: turned outwards if it was woven inside out, and its depth made what the
      // table asks (the bands' spread across the sheet is only roughly their width)
      let V = 0; for (let t = f0; t < fine.length; t += 3) { const A = P0[fine[t] - base], B = P0[fine[t + 1] - base], C = P0[fine[t + 2] - base]; V += dot(A, cross(B, C)) / 6; }
      if (V < 0) for (const [list, from] of [[fine, f0], [coarse, c0]]) for (let t = from; t < list.length; t += 3) { const x = list[t + 1]; list[t + 1] = list[t + 2]; list[t + 2] = x; }
      const want = (BUILD * m.vol * 1e-6), k = Math.min(2,   /* (no more than twice as deep: thickened as much as three times, the adductor magnus and the sheets on the thigh swelled it) */ Math.max(0.5, want / Math.max(1e-7, Math.abs(V))));
      for (let q = 0; q < P0.length; q++) { const s0 = attr.sec[(base + q) * 4], p = add(P0[q], mul(FR[q].O, s0 * (k - 1))); P0[q] = p; attr.sec[(base + q) * 4] = s0 * k; pos[(base + q) * 3] = p[0]; pos[(base + q) * 3 + 1] = p[1]; pos[(base + q) * 3 + 2] = p[2]; }
    }
    // normals: from the faces round each point, then in its frame
    const N = P0.map(() => [0, 0, 0]);
    for (let t = f0; t < fine.length; t += 3) { const a = fine[t] - base, b = fine[t + 1] - base, c = fine[t + 2] - base, n = cross(sub(P0[b], P0[a]), sub(P0[c], P0[a])); for (const q of [a, b, c]) N[q] = add(N[q], n); }
    N.forEach((n, q) => { const g = norm(n), F = FR[q]; attr.nor.push(dot(g, F.O), dot(g, F.B), dot(g, F.T)); });
    // how open each point stands: the bones and the muscles a little way out along its normal
    if (side > 0) group[0].open = N.map((n, q) => { const g = norm(n), p = P0[q]; let occ = 0; for (let i = 0; i < 3; i++) { const d = AO[i], f = all(add(p, mul(g, d))); occ += AW[i] * Math.max(0, 1 - f / d); } return Math.max(0, 1 - 1.2 * occ); });
    group[0].open.forEach((x, q) => { attr.look[(base + q) * 4] = x; });
  }
  const F32 = (a) => Float32Array.from(a);
  return {
    rows, muscles: [...muscles.values()],
    attr: { place: F32(attr.place), pair: F32(attr.pair), sec: F32(attr.sec), nor: F32(attr.nor), look: F32(attr.look) },
    fine: Uint32Array.from(fine), coarse: Uint32Array.from(coarse), pos: F32(pos),
    counts: { muscles: muscles.size, strands: rows.length, points: nv, fine: fine.length / 3, coarse: coarse.length / 3 },
    // (for the skin laid over them, in the same worker: never handed to the page) the strands, left side
    inner: { strands: out },
  };
}
