// The skeleton's pelvis (intent 0036): the two hip bones (each of three grown into one: the ilium's wing with its crest,
// the ischium the seat rests on, the pubis meeting the other in front) round the sockets of the hip joints, the sacrum
// wedged between them, the coccyx under it, the disc between the pubic bones.
//
// A man's, standing: the front upper spines and the front of the pubic bones in one upright plane, the sacrum's base
// tilted 40° forwards, the brim of the basin about 57° from level. Measures (Gray's Anatomy, 1918, figs. 95-97, 235,
// 241; White, Black & Folkens, "Human Osteology"; where the hip joint lies behind and below the front upper spines after
// Seidel et al. 1995, J. Biomech. 28): across the crests 0.287, between the front upper spines 0.238, from the crest's
// top to the seat bone's foot 0.214, from front upper spine to back upper spine 0.17, the brim 0.13 wide and 0.12 from
// the promontory to the pubis, the sacrum 0.112 across its wings and 0.10 long, between the ischia's spines 0.098, the
// arch under the pubis about 65°. The back upper spines lie level with the sacrum's second piece, a little below the
// front ones.
import { add, sub, mul, dot, norm, cross, spline } from './kit.js';
import { JOINTS } from './rig.js';

export function pelvis(K) {
  sacrum(K);
  coccyx(K);
  K.pair((side) => hip(K, side));
  K.bone('symphysis', 'hips', K.PART.cartilage);
  K.put(K.egg([0, PUBIS.c[1], PUBIS.c[2]], [0.0036, PUBIS.r[1] - 0.001, PUBIS.r[2] - 0.0008], PUBIS.R), 0.001);
}

// ── the sacrum and the coccyx ────────────────────────────────────────────────────────────────────────────────────────
// Five bodies grown into one, down a curve: each leans back from straight down by `lean` degrees (the first as the
// base's tilt, the last already forwards) and is `long`; then the coccyx's four pieces, curling on forwards.
const BASE = [0, 1.014, -0.040], LEAN = [40, 30, 14, -6, -24, -38, -52, -62, -68], LONG = [0.030, 0.026, 0.022, 0.018, 0.016, 0.011, 0.008, 0.006, 0.005];
const rad = (d) => (d * Math.PI) / 180, down = (a) => [0, -Math.cos(rad(a)), -Math.sin(rad(a))], fore = (a) => [0, -Math.sin(rad(a)), Math.cos(rad(a))];
/** The middles of the joints between the bodies, from the base down: J[0] the base, J[5] the sacrum's tip, J[9] the coccyx's. */
const J = LEAN.reduce((P, a, i) => P.concat([add(P[i], mul(down(a), LONG[i]))]), [BASE]);
/** A value along a table of [at, value] pairs (straight between them). */
const along = (T, s) => { if (s <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (s <= T[i][0]) return T[i - 1][1] + ((T[i][1] - T[i - 1][1]) * (s - T[i - 1][0])) / (T[i][0] - T[i - 1][0]); return T.at(-1)[1]; };

function sacrum(K) {
  K.bone('sacrum', 'hips');
  // the whole of it as one shape down the straight line from base to tip: at each place along that line how wide it is,
  // how far its front lies before the bodies' middle and its back behind it, and how far the bodies' middle bows back
  // from the line (the hollow of its front)
  const U = norm(sub(J[5], J[0])), Wf = norm(sub([0, 0, 1], mul(U, U[2]))), len = Math.hypot(...sub(J[5], J[0]));
  const at = J.slice(0, 6).map((p) => dot(sub(p, J[0]), U)), bow = J.slice(0, 6).map((p) => dot(sub(p, J[0]), Wf));
  const mid = (i) => (at[i] + at[i + 1]) / 2;
  const WIDE = [[-0.014, 0.050], [0, 0.0555], [mid(0), 0.0565], [at[1], 0.0535], [mid(1), 0.049], [at[2], 0.0445], [mid(2), 0.040], [at[3], 0.0355], [mid(3), 0.031], [at[4], 0.027], [mid(4), 0.021], [at[5], 0.0155], [len + 0.003, 0.013]];
  const FRONT = [[-0.014, 0.0165], [0, 0.0165], [at[1], 0.0135], [at[2], 0.0105], [at[3], 0.008], [at[4], 0.0065], [at[5], 0.0055]];
  const BACK = [[-0.014, 0.034], [0, 0.036], [at[1], 0.030], [at[2], 0.024], [at[3], 0.018], [at[4], 0.0125], [at[5], 0.008]];
  const BOW = [[-0.014, 0.0062], ...at.map((s, i) => [s, bow[i]]), [len + 0.003, 0.001]];
  const N = 12, a0 = -0.014, a1 = len + 0.003, knots = [];
  for (let i = 0; i < N; i++) { const s = a0 + ((a1 - a0) * i) / (N - 1); knots.push([along(WIDE, s), along(WIDE, s), along(FRONT, s), along(BACK, s), 0, along(BOW, s), 3.2, 1.6]); }
  K.put(K.loft(add(J[0], mul(U, a0)), add(J[0], mul(U, a1)), knots, { out: Wf, caps: 0.5 }), 0.002);
  // a place on it: i the joint between bodies (or between two, by halves), x from the middle, f before (+) or behind (−)
  // the bodies' middle
  const lean = (i) => { const j = Math.floor(i), t = i - j; return t ? LEAN[Math.min(4, j)] : (LEAN[Math.max(0, j - 1)] + LEAN[Math.min(4, j)]) / 2; };
  const spot = (i, x, f) => { const j = Math.floor(i); return add(add(lerp3(J[j], J[Math.min(5, j + 1)], i - j), mul(fore(lean(i)), f)), [x, 0, 0]); };
  const front = (i) => along(FRONT, at[Math.floor(i)] + (i % 1) * (at[Math.min(5, Math.floor(i) + 1)] - at[Math.floor(i)])), back = (i) => along(BACK, at[Math.floor(i)] + (i % 1) * (at[Math.min(5, Math.floor(i) + 1)] - at[Math.floor(i)]));
  // its base: flat, tilted forwards (the last disc of the loins rests on it); its tip, cut square for the coccyx
  const up = fore(LEAN[0] - 90), back0 = mul(fore(LEAN[0]), -1);
  K.and(K.plane(up, J[0]), 0.003);
  K.and(K.plane(down(LEAN[4]), add(J[5], mul(down(LEAN[4]), 0.0005))), 0.002);
  // its sides, slanting, where the hip bones hold it: the ear-shaped faces of the joints stand a little proud of them
  K.both(() => K.and(K.plane(SI.n, add(SI.p, mul(SI.n, -0.003))), 0.004));
  K.both(() => K.put(K.plate(add(SI.p, mul(SI.n, -0.0062)), [SI.back, SI.up], EAR, { tc: 0.005, te: 0.0015, ramp: 0.006, smooth: 3 }), 0.004));
  // the wings beside the body, hollowed a little on top
  K.both(() => K.cut(K.egg(add(add(J[0], mul(up, 0.0085)), add([0.046, 0, 0], mul(back0, 0.003))), [0.0165, 0.0115, 0.03], [[1, 0, 0], up]), 0.007));
  // the two processes that hold the last vertebra of the loins from behind, either side of the canal's mouth
  K.both(() => {
    K.put(K.egg(add(add(J[0], mul(back0, 0.0295)), add([0.0245, 0, 0], mul(up, -0.002))), [0.0125, 0.0075, 0.0105], [[1, 0, 0], up]), 0.005);
    K.put(K.egg(add(add(J[0], mul(back0, 0.0305)), add([0.0245, 0, 0], mul(up, 0.0045))), [0.0085, 0.0115, 0.0075], [[1, 0, 0.35], up]), 0.005);
    K.cut(K.egg(add(add(J[0], mul(back0, 0.0385)), add([0.0205, 0, 0], mul(up, 0.0095))), [0.0062, 0.0072, 0.0032], [[1, 0, -0.55], up]), 0.002);   // its facet, facing back and in
  });
  // down its back: the crest of the grown-together spines (a ridge with three knobs), the low knobs of the grown-together
  // joints beside it, the outer row beyond the holes
  K.put(K.group(spline([0.3, 1, 2, 3, 3.6].map((i) => [...spot(i, 0, -back(i)), 0.0028, 0.0026]), 4).map((q, n, P) => n ? { op: 'add', k: K.s(0.0008), s: K.strand(P[n - 1], q, { w: 0.0028, d: 0.0026, t0: [0.0028, 0.0026], t1: [0.0028, 0.0026], out: [0, 0.5, -1] }) } : null).filter(Boolean)), 0.004);
  for (let i = 0; i < 3; i++) K.put(K.egg(spot(i + 0.62, 0, -(back(i + 0.62) + 0.0005)), [0.0036 - i * 0.0003, 0.0095 - i * 0.001, 0.0052 - i * 0.0007], [[1, 0, 0], down(lean(i + 0.5))]), 0.004);
  for (let i = 0; i < 4; i++) K.both(() => {
    K.put(K.egg(spot(i + 1, 0.0125 - i * 0.0012, -back(i + 1) * 0.84), [0.0038, 0.005, 0.003]), 0.004);
    K.put(K.egg(spot(i + 0.55, along(WIDE, mid(i)) * 0.72, -back(i + 0.55) * 0.5), [0.0032, 0.0055, 0.003]), 0.004);
  });
  // the lines across its front where the bodies grew together
  for (let i = 1; i < 5; i++) { const w = HOLES[i - 1][0] - 0.0075; K.put(K.rod(spot(i, -w, front(i) - 0.0004), spot(i, w, front(i) - 0.0004), 0.0016), 0.003); }
  // the holes for the nerves, four a side: funnels in front, small behind, each pair meeting beside the canal
  HOLES.forEach(([x, rf, rb], i) => {
    const meet = spot(i + 1, x * 0.66, -(front(i + 1) + 0.004));
    K.both(() => {
      K.cut(K.rod(spot(i + 1, x, front(i + 1) + 0.003), spot(i + 1, x * 0.97, front(i + 1) - 0.006), rf * 1.5, rf), 0.002);
      K.cut(K.rod(spot(i + 1, x * 0.97, front(i + 1) - 0.006), meet, rf, rf * 0.75), 0.002);
      K.cut(K.rod(spot(i + 1, x * 0.84, -(back(i + 1) + 0.004)), meet, rb, rb), 0.0015);
      K.cut(K.egg(spot(i + 1, x + rf * 1.7, front(i + 1) + 0.0012), [rf * 2.2, rf * 0.85, rf * 0.62], [[1, 0, 0], down(lean(i + 1))]), 0.003);   // the groove the nerve leaves by
    });
  });
  // the canal down it behind the bodies: its three-cornered mouth at the base, its open end low on the back
  for (let i = 0; i < 4; i++) {
    const c = (j) => spot(j, 0, -(front(j) + 0.0075 - j * 0.0012)), p = i === 0 ? add(c(0), mul(down(LEAN[0]), -0.014)) : c(i);
    K.cut(K.strand(p, c(i + 1), { w: 0.012 - i * 0.002, d: 0.0055 - i * 0.0008, t0: [0.0122 - i * 0.002, 0.0058 - i * 0.0008], t1: [0.0102 - i * 0.002, 0.0048 - i * 0.0008], full: 0.4, out: fore(LEAN[i]) }), 0.002);
  }
  K.cut(K.egg(spot(4.35, 0, -0.011), [0.0058, 0.015, 0.008], [[1, 0, 0], down(LEAN[4])]), 0.003);
  K.both(() => K.put(K.rod(spot(4, 0.009, -0.0105), spot(5, 0.0085, -0.0065), 0.0032, 0.0024), 0.002));   // its two horns
}
// the holes: [how far from the middle, their radius in front, behind]
const HOLES = [[0.0265, 0.0052, 0.0036], [0.0222, 0.0047, 0.0032], [0.019, 0.0041, 0.0028], [0.0148, 0.0033, 0.0024]];
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// the joint between sacrum and hip bone: a plane a side, slanting (the sacrum wider above and in front); n faces out of the sacrum
const SI = { n: norm([0.92, -0.2, -0.3]), p: [0.052, 0.985, -0.045] };
// … and on it the ear-shaped face each bone meets the other by, drawn in the plane (back along it, up along it): its long
// limb running back, its short one up, the hollow of the ear behind and above
SI.back = norm(sub([0, 0, -1], mul(SI.n, -SI.n[2]))); SI.up = cross(SI.n, SI.back);
const EAR = [[-0.0100, 0.0195], [0.0061, 0.0340], [0.017, 0.030], [0.022, 0.018], [0.020, 0.008], [0.026, 0.0], [0.032, -0.008], [0.0315, -0.0145], [0.027, -0.021], [0.0225, -0.017], [0.016, -0.009], [0.0095, 0.0005], [-0.001, 0.010]];

function coccyx(K) {
  K.bone('coccyx', 'hips');
  const R = [[0.0115, 0.0062, 0.005], [0.0072, 0.0046, 0.004], [0.005, 0.0036, 0.0034], [0.0036, 0.003, 0.003]];
  for (let i = 0; i < 4; i++) {
    const a = LEAN[5 + i], p = add(J[5 + i], mul(down(a), 0.0008)), q = J[6 + i];
    K.put(K.egg(lerp3(p, q, 0.5), [R[i][0], LONG[5 + i] / 2 + 0.0006, R[i][2]], [[1, 0, 0], down(a)]), 0.0016);
  }
  K.both(() => {
    K.put(K.rod(add(lerp3(J[5], J[6], 0.3), [0.0085, 0, -0.002]), add(J[5], add(mul(down(LEAN[4]), -0.004), [0.0088, 0, -0.0045])), 0.0026, 0.002), 0.002);   // its horns, up to the sacrum's
    K.put(K.egg(add(lerp3(J[5], J[6], 0.45), [0.0125, 0, 0]), [0.006, 0.0038, 0.0034]), 0.002);                                                              // its stubs of wings
  });
}

// ── the hip bone ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Two bent sheets and what is thick on them: the wing, and the plate of pubis and ischium round the great hole between
// them. A sheet: a plane (its middle c, u and v along it, so that u × v faces in, to the belly) and how the sheet curves
// off that plane. Landmarks are written where they are in the body and laid onto their sheet.
const sheet = (c, u0, v0, bend) => {
  const u = norm(u0), v = norm(v0), n = cross(u, v), flat = (p) => { const d = sub(p, c); return [dot(d, u), dot(d, v)]; };
  const at = ([a, b], off = 0) => add(c, add(add(mul(u, a), mul(v, b)), mul(n, bend[0] * a * a + bend[1] * b * b + bend[2] * a * b + off)));
  return { c, u, v, n, bend, flat, at, on: (p, off = 0) => at(flat(p), off) };
};
const WING = sheet([0.1001, 0.9912, -0.0123], [0.3353, 0, 0.9421], [0.4062, 0.9023, -0.1445], [2.4382, 0.1148, -1.3388]);
const LOWER = sheet([0.0319, 0.8941, 0.036], [-0.7992, 0, 0.6011], [0.2672, 0.8958, 0.3552], [5, 0.0324, -1.0002]);
// the wall of the true pelvis inside the socket, from the brim's line down to the ischium's spine and the seat bone
const INNER = sheet([0.0548, 0.9264, -0.0158], [0.0327, 0, 0.9995], [0.1253, 0.9921, -0.0041], [-2.9118, -0.9999, -0.1093]);
const WALL = [[0.060, 0.972, -0.032], [0.0635, 0.955, -0.004], [0.062, 0.938, 0.022], [0.056, 0.915, 0.010], [0.054, 0.892, -0.006], [0.052, 0.868, -0.018], [0.050, 0.880, -0.040], [0.054, 0.897, -0.047], [0.056, 0.912, -0.044], [0.058, 0.940, -0.040], [0.062, 0.956, -0.040]];
// the crest from the front upper spine over the top (its knob the widest of the pelvis, its top level with the fourth
// vertebra of the loins) to the back upper spine
const CREST = [[0.116, 1.001, 0.052], [0.1275, 1.021, 0.036], [0.1345, 1.043, 0.012], [0.135, 1.0585, -0.010], [0.127, 1.0655, -0.030], [0.108, 1.0605, -0.056], [0.085, 1.040, -0.076], [0.063, 1.012, -0.087], [0.047, 0.988, -0.091]];
// the rest of the wing's edge: the back lower spine, the great notch, its root in the body, the front lower spine
const EDGE = [[0.050, 0.966, -0.086], [0.058, 0.960, -0.062], [0.066, 0.956, -0.038], [0.080, 0.946, -0.012], [0.094, 0.946, 0.016], [0.100, 0.966, 0.038], [0.106, 0.984, 0.046]];
// the plate of pubis and ischium, round its edge: the pubic bone's top by the middle, its knob, the brim's line up to the
// socket, through the socket, down the ischium's outer edge to the seat bone, forwards along the lower branch
const RING = [
  [0.0035, 0.9055, 0.0520], [0.0150, 0.9085, 0.0545], [0.0265, 0.9080, 0.0535], [0.0420, 0.9165, 0.0445], [0.0570, 0.9300, 0.0305], [0.0700, 0.9350, 0.0150], [0.0740, 0.9150, 0.0020],
  [0.0660, 0.8950, -0.0120], [0.0640, 0.8760, -0.0260], [0.0590, 0.8590, -0.0300], [0.0490, 0.8565, -0.0160], [0.0370, 0.8570, 0.0040], [0.0250, 0.8610, 0.0210], [0.0130, 0.8670, 0.0330], [0.0035, 0.8710, 0.0345],
];
// the great hole in it, round its edge
const HOLE = [
  [0.0241, 0.8869, 0.0404], [0.029, 0.8972, 0.0432], [0.0397, 0.903, 0.0393], [0.0513, 0.9063, 0.0315], [0.0611, 0.9062, 0.0209], [0.0649, 0.8989, 0.0114],
  [0.0624, 0.8859, 0.0052], [0.0566, 0.874, 0.0029], [0.0468, 0.8656, 0.0071], [0.0365, 0.8651, 0.0169], [0.0289, 0.8704, 0.027], [0.0242, 0.8784, 0.0352],
];
// the pubic bone's body by the middle: its middle, half its width, height and thickness, tilted (its top forwards)
const PUBIS = { c: [0.0135, 0.8885, 0.0440], r: [0.0105, 0.0205, 0.0078], R: [[1, 0, 0], [0, 0.878, 0.479]] };

function hip(K, side) {
  K.bone('hip.' + side, 'hips');
  const A = JOINTS['thigh.L'], NA = norm([0.676, -0.676, 0.292]);   // the socket's middle, the way it faces (out, down, forwards)
  const low = norm(sub([0, -1, 0], mul(NA, -NA[1]))), fwd = cross(low, NA), notch = norm(add(mul(low, 0.94), mul(fwd, 0.34)));   // the rim's lowest way, forwards along it, the notch's way
  // the wing and its crest
  K.put(K.plate(WING.c, [WING.u, WING.v], CREST.concat(EDGE).map(WING.flat), { tc: 0.002, te: 0.0052, ramp: 0.026, bend: WING.bend, smooth: 3 }), 0.003);
  // (the crest: a thick strip of the same sheet along its upper edge, its lips standing over the wing's two faces)
  const rim = CREST.map(WING.flat), mid = rim.reduce((a, q) => [a[0] + q[0] / rim.length, a[1] + q[1] / rim.length - 0.03 / rim.length], [0, 0]);
  const inner = rim.map((q, i) => { const a = rim[Math.max(0, i - 1)], b = rim[Math.min(rim.length - 1, i + 1)], t = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...t), nn = [-t[1] / l, t[0] / l], sg = (mid[0] - q[0]) * nn[0] + (mid[1] - q[1]) * nn[1] > 0 ? 1 : -1; return [q[0] + nn[0] * sg * 0.0125, q[1] + nn[1] * sg * 0.0125]; });
  K.put(K.plate(WING.c, [WING.u, WING.v], rim.concat(inner.reverse()), { tc: 0.0068, te: 0.0068, bend: WING.bend, smooth: 3 }), 0.006);
  K.put(K.egg(add(WING.on(CREST[0]), [0.0012, -0.003, 0.0006]), [0.0056, 0.0085, 0.0058], [[1, 0, 0], [0.2, 1, 0.3]]), 0.005);   // the front upper spine
  K.put(K.egg(add(WING.on(CREST[2]), mul(WING.n, -0.0022)), [0.006, 0.0072, 0.0125], [WING.n, WING.v]), 0.009);                  // the crest's knob
  K.put(K.egg(add(WING.on(CREST[8]), [0.001, -0.002, 0.003]), [0.007, 0.0085, 0.006]), 0.004);                                   // the back upper spine
  K.put(K.egg(add(WING.on(EDGE[0]), [0, 0.001, -0.001]), [0.0055, 0.0065, 0.0055]), 0.004);                                      // the back lower spine
  K.put(K.egg([0.100, 0.966, 0.038], [0.0064, 0.0105, 0.0072], [[1, 0, 0], [0.1, 1, 0.35]]), 0.008);                             // the front lower spine
  // behind, the thick of it against the sacrum: the same sheet made very thick inwards (its outer half taken off, so
  // the wing's outer face stays as it is), cut flat a little short of the joint's plane, and sloped off forwards in one
  // plane to the wing's hollow; on its flat the ear-shaped face of the joint stands a hair proud
  const post = [CREST[4], CREST[5], CREST[6], CREST[7], CREST[8], EDGE[0], EDGE[1], EDGE[2]].map(WING.flat).concat([[-0.006, -0.050], [0.030, -0.040], [0.036, 0.0], [0.030, 0.050], [0.012, 0.074]]);
  const slope = norm(cross(sub([0.060, 0.970, -0.031], [0.062, 1.010, -0.028]), sub([0.104, 1.0, 0.006], [0.062, 1.010, -0.028])));
  const roof = norm(cross(sub([0.110, 1.012, 0.002], [0.060, 1.020, -0.040]), sub([0.094, 1.056, -0.054], [0.060, 1.020, -0.040])));   // above the joint it slopes away, up to the crest and forwards to the wing
  K.put(K.group([{ op: 'add', k: 0, s: K.plate(WING.c, [WING.u, WING.v], post, { tc: 0.05, te: 0.05, bend: WING.bend, smooth: 3 }) },
    { op: 'sub', k: K.s(0.001), s: K.plate(add(WING.c, mul(WING.n, -0.062)), [WING.u, WING.v], [[-0.16, -0.11], [0.09, -0.11], [0.09, 0.14], [-0.16, 0.14]], { tc: 0.06, te: 0.06, bend: WING.bend }) },
    { op: 'and', k: K.s(0.004), s: K.plane(mul(SI.n, -1), add(SI.p, mul(SI.n, 0.003))) },
    { op: 'and', k: K.s(0.006), s: K.plane(slope, [0.062, 1.010, -0.028]) },
    { op: 'and', k: K.s(0.008), s: K.plane(roof, [0.060, 1.020, -0.040]) },
    { op: 'sub', k: K.s(0.004), s: K.ball(add([0.0872, 0.996, -0.0084], mul(slope, 0.065)), 0.07) }]), 0.004);   // (the slope hollowed: the back of the wing's hollow)
  K.put(K.plate(add(SI.p, mul(SI.n, 0.0070)), [SI.back, SI.up], EAR, { tc: 0.0058, te: 0.0015, ramp: 0.006, smooth: 3 }), 0.005);
  // the body over the socket (the brim's line down its inside to the pubis is the edge the inner wall makes with the
  // wing's hollow)
  K.put(K.egg([0.090, 0.948, -0.002], [0.017, 0.016, 0.034], [[1, 0, 0.12], [0, 1, 0]]), 0.012);
  // the socket's cup: a shell round the thigh's ball, open out, down and forwards; what holds it behind and in front
  K.put(K.group([{ op: 'add', k: 0, s: K.ball(add(A, mul(NA, -0.0045)), 0.0325) }, { op: 'and', k: K.s(0.003), s: K.plane(NA, add(A, mul(NA, -0.0012))) }, { op: 'and', k: K.s(0.004), s: K.plane(INNER.n, add(INNER.c, mul(INNER.n, -0.002))) }]), 0.007);
  K.put(K.egg([0.074, 0.930, -0.0265], [0.016, 0.034, 0.011]), 0.008);
  K.put(K.egg([0.071, 0.938, 0.020], [0.011, 0.012, 0.012]), 0.006);
  K.put(K.plate(add(INNER.c, mul(INNER.n, -0.005)), [INNER.u, INNER.v], WALL.map(INNER.flat), { tc: 0.0055, te: 0.0055, bend: INNER.bend, smooth: 3 }), 0.008);   // the wall of the true pelvis inside the socket
  // the ischium: its body down from the socket, the long knob the seat rests on (facing back and down), its spine
  K.put(K.loft([0.076, 0.912, -0.024], [0.059, 0.864, -0.033], [[0.015, 0.013, 0.013], [0.014, 0.012, 0.013], [0.013, 0.011, 0.012], [0.011, 0.009, 0.010]], { out: [0, 0, -1], caps: 0.5 }), 0.008);
  K.put(K.strand([0.0665, 0.899, -0.0465], [0.0535, 0.8585, -0.0265], { w: 0.0145, d: 0.0085, t0: [0.0105, 0.006], t1: [0.0095, 0.006], belly: 0.45, full: 0.6, out: [0.25, -0.45, -0.86] }), 0.006);
  K.put(K.strand([0.067, 0.917, -0.036], [0.0495, 0.9075, -0.0585], { w: 0.0075, d: 0.003, t0: [0.011, 0.0045], t1: [0.0016, 0.0013], belly: 0.3, full: 0.7, out: [0.6, 0, -0.8] }), 0.004);
  // the plate of pubis and ischium; the pubic bone's body, its knob, its upper branch (the brim's sharp line on it)
  K.put(K.plate(LOWER.c, [LOWER.u, LOWER.v], RING.map(LOWER.flat), { tc: 0.0045, te: 0.0045, bend: LOWER.bend, smooth: 3 }), 0.005);
  K.put(K.egg(PUBIS.c, PUBIS.r, PUBIS.R), 0.005);
  K.put(K.egg([0.0262, 0.9065, 0.0528], [0.005, 0.004, 0.0042]), 0.003);
  K.put(K.loft([0.070, 0.9385, 0.021], [0.022, 0.9025, 0.0505], [[0.010, 0.010, 0.010, 0.010, 0, 0, 1.6, 2.2], [0.008, 0.008, 0.0072, 0.0075, 0, 0, 1.5, 2.2], [0.008, 0.008, 0.007, 0.008, 0, 0, 1.5, 2.2], [0.0085, 0.0085, 0.0065, 0.010, 0, 0, 1.6, 2.2]], { out: [0.1, 1, 0.25], caps: 0.4 }), 0.005);
  // the face that meets the other pubic bone (a disc between them)
  K.and(K.plane([-1, 0, 0], [0.0032, 0, 0]), 0.001);
  // cut out of it: the socket (the thigh's ball fits it), its pit, the gap in its rim below; the great hole between pubis
  // and ischium; the lesser notch under the spine
  K.cut(K.ball(A, 0.0255), 0.0012);
  K.cut(K.group([{ op: 'add', k: 0, s: K.ball(A, 0.0282) }, { op: 'and', k: K.s(0.003), s: K.egg(add(A, add(mul(NA, -0.019), mul(notch, 0.0085))), [0.0165, 0.0115, 0.03], [notch, cross(NA, notch)]) }]), 0.002);
  K.cut(K.egg(add(A, mul(notch, 0.029)), [0.010, 0.011, 0.007], [notch, cross(NA, notch)]), 0.003);
  K.cut(K.plate(LOWER.c, [LOWER.u, LOWER.v], HOLE.map(LOWER.flat), { tc: 0.012, te: 0.012, bend: LOWER.bend, smooth: 4 }), 0.003);
  K.cut(K.egg([0.0505, 0.8965, -0.0575], [0.012, 0.0105, 0.010]), 0.004);
}
