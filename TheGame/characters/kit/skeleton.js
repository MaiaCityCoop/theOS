// The skeleton (intent 0033): every bone of the body in its own shape and size, laid out for one man of reference,
// 1.80 m, standing in the neutral pose (arms down, palms to the thighs, every frame turned like the world's). It is the
// first of the body's layers (the bones, then the muscles on them, the fat, the skin: ./body.js) and the rig the person
// moves by: its joints are where these bones meet. Measures from anatomy's textbooks (Gray's Anatomy, 41st ed.;
// White, Black & Folkens, "Human Osteology", 3rd ed.), as remembered, for an adult man; a body of other measures is this
// skeleton carried to its own (./body.js).
//
// Coordinates: metres, from the floor between the feet; x to the person's left, y up, z forwards. Points are written
// for the left side (x > 0); the right is their mirror.
//
//   skeletonParts() -> [{ bone, s, k, part }]   the bones as solids (./field.js), each on the rig bone that carries it
//   JOINTS, PARENT                             the rig: where its bones turn, which carries which
import { ball, egg, rod, box, strand, tube, frame, group, plane } from './field.js';

export const PART = { skin: 0, nail: 7, lip: 8, mouth: 9, teeth: 10, eye: 11, tongue: 12, bone: 14, cartilage: 15, muscle: 16, tendon: 17, fat: 18 };
const SIDES = [['L', 1], ['R', -1]];

// ── the rig: where the bones turn ────────────────────────────────────────────────────────────────────────────────────
export const JOINTS = {
  root: [0, 0, 0], hips: [0, 0.97, -0.03], spine1: [0, 1.101, -0.034], spine2: [0, 1.236, -0.064], spine3: [0, 1.346, -0.079],
  neck1: [0, 1.507, -0.046], neck2: [0, 1.58, -0.026], head: [0, 1.628, -0.022], jaw: [0, 1.652, 0.0],
  'eye.L': [0.032, 1.677, 0.06], 'lidUp.L': [0.032, 1.677, 0.06], 'lidLo.L': [0.032, 1.677, 0.06],
  'clavicle.L': [0.022, 1.468, 0.058], 'upperArm.L': [0.18, 1.442, -0.026], 'foreArm.L': [0.202, 1.103, -0.045], 'hand.L': [0.226, 0.857, -0.012],
  'thigh.L': [0.088, 0.925, 0.0], 'shin.L': [0.084, 0.502, 0.006], 'foot.L': [0.077, 0.082, -0.016], 'toes.L': [0.094, 0.018, 0.122],
};
export const PARENT = { hips: 'root', spine1: 'hips', spine2: 'spine1', spine3: 'spine2', neck1: 'spine3', neck2: 'neck1', head: 'neck2', jaw: 'head' };
for (const s of ['L', 'R']) Object.assign(PARENT, {
  ['eye.' + s]: 'head', ['lidUp.' + s]: 'head', ['lidLo.' + s]: 'head', ['clavicle.' + s]: 'spine3', ['upperArm.' + s]: 'clavicle.' + s,
  ['upperArmTwist.' + s]: 'upperArm.' + s, ['foreArm.' + s]: 'upperArm.' + s, ['foreArmTwist.' + s]: 'foreArm.' + s, ['hand.' + s]: 'foreArm.' + s,
  ['thigh.' + s]: 'hips', ['thighTwist.' + s]: 'thigh.' + s, ['shin.' + s]: 'thigh.' + s, ['foot.' + s]: 'shin.' + s, ['toes.' + s]: 'foot.' + s,
});

// ── the hand's frame: a down the fingers, b across to the thumb (forwards), c out of its back (outwards), from the wrist
const HAND = {
  knuckles: { index: [0.099, 0.03, 0.006], middle: [0.101, 0.009, 0.007], ring: [0.097, -0.012, 0.006], little: [0.089, -0.031, 0.004] },
  bases: { index: [0.036, 0.014, 0.005], middle: [0.036, 0.004, 0.006], ring: [0.035, -0.007, 0.005], little: [0.033, -0.017, 0.003] },
  lengths: { index: 0.072, middle: 0.08, ring: 0.076, little: 0.06 }, phalanges: [0.5, 0.3, 0.2],
  thumb: { root: [0.026, 0.021, -0.004], dirs: [[0.84, 0.46, -0.28], [0.95, 0.18, -0.26], [0.97, 0.06, -0.24]], lengths: [0.046, 0.032, 0.027] },
};
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'];

/** The joints of a hand in the neutral pose (left hand at wrist w; sg mirrors): { name: [x, y, z] }, tips too. */
export function fingerJoints(w, sg) {
  const at = (a, b, c) => [w[0] + sg * c, w[1] - a, w[2] + b], out = {};
  for (const f of ['index', 'middle', 'ring', 'little']) {
    const [a, b, c] = HAND.knuckles[f], L = HAND.lengths[f];
    let d = 0; for (let j = 0; j < 3; j++) { out[`${f}${j + 1}`] = at(a + d, b, c - d * 0.04); d += L * HAND.phalanges[j]; }
    out[`${f}Tip`] = at(a + d, b, c - d * 0.04);
  }
  const T = HAND.thumb; let p = T.root;
  for (let j = 0; j < 3; j++) { out[`thumb${j + 1}`] = at(...p); const d = T.dirs[j], n = Math.hypot(...d); p = p.map((v, i) => v + (d[i] / n) * T.lengths[j]); }
  out.thumbTip = at(...p);
  return out;
}

// ── small helpers ────────────────────────────────────────────────────────────────────────────────────────────────────
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1)), lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Points along a smooth curve through P (Catmull-Rom), n a span. */
function spline(P, n = 3) {
  const out = [], cr = (a, b, c, d, t) => a.map((_, i) => 0.5 * (2 * b[i] + (-a[i] + c[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t * t + (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * t * t * t));
  for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < n; j++) out.push(cr(P[Math.max(0, i - 1)], P[i], P[i + 1], P[Math.min(P.length - 1, i + 2)], j / n));
  out.push(P.at(-1));
  return out;
}

/**
 * The skeleton's bones as solids, each on the rig bone that carries it. X carries a point of the reference man to the
 * body's (and X.k its lengths).
 */
export function skeletonParts(X = (p) => p) {
  const L = [], k1 = X.k ?? 1, s = (v) => v * k1;
  const put = (bone, sol, k, part = PART.bone) => L.push({ bone, s: sol, k: k * k1, part, body: true, layer: 'bone' });
  // a bone along a curve: its section (wide, thick) from one end to the other, its broad side facing `out(p)`
  const along = (bone, pts, w0, d0, w1, d1, out, k = 0.0015, part = PART.bone) => {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = X(pts[i]), b = X(pts[i + 1]), t0 = i / n, t1 = (i + 1) / n;
      const wa = s(w0 + (w1 - w0) * t0), wb = s(w0 + (w1 - w0) * t1), da = s(d0 + (d1 - d0) * t0), db = s(d0 + (d1 - d0) * t1);
      put(bone, strand(a, b, { w: (wa + wb) / 2, d: (da + db) / 2, t0: [wa, da], t1: [wb, db], out: out(lerp(pts[i], pts[i + 1], 0.5)) }), k, part);
    }
  };
  spine(X, put, along, s);
  for (const [side, sg] of SIDES) {
    const M = (p) => [sg * p[0], p[1], p[2]];   // a left-side point, on this side
    const P = (x, y, z) => X(M([x, y, z])), B = (n) => `${n}.${side}`;
    ribs(X, put, along, s, sg, M);
    shoulder(X, put, along, s, sg, M, P, B);
    arm(X, put, along, s, sg, M, P, B);
    hand(X, put, along, s, sg, side);
    pelvis(X, put, along, s, sg, M, P, L);
    leg(X, put, along, s, sg, M, P, B);
    foot(X, put, along, s, sg, M, P, B);
  }
  sternum(X, put, along, s);
  skull(X, put, along, s);
  L.push(...skeletonCuts());
  return L;
}

// ── the spine: seven vertebrae of the neck, twelve of the chest, five of the loins; the sacrum and the coccyx ─────────
// [name, centre y, centre z, body: wide, deep, high, spinous process: length, how steeply down (rad), transverse: span]
const VERTEBRAE = [
  ['C2', 1.598, -0.024, 0.018, 0.016, 0.017, 0.028, 0.35, 0.022], ['C3', 1.58, -0.026, 0.019, 0.015, 0.013, 0.018, 0.35, 0.024],
  ['C4', 1.563, -0.029, 0.02, 0.015, 0.013, 0.019, 0.4, 0.025], ['C5', 1.545, -0.033, 0.021, 0.016, 0.013, 0.02, 0.45, 0.026],
  ['C6', 1.527, -0.039, 0.023, 0.016, 0.014, 0.024, 0.5, 0.028], ['C7', 1.507, -0.046, 0.025, 0.017, 0.015, 0.034, 0.55, 0.033],
  ['T1', 1.481, -0.055, 0.027, 0.018, 0.016, 0.038, 0.6, 0.036], ['T2', 1.461, -0.062, 0.027, 0.019, 0.017, 0.04, 0.75, 0.035],
  ['T3', 1.44, -0.068, 0.028, 0.02, 0.018, 0.042, 0.9, 0.034], ['T4', 1.418, -0.073, 0.029, 0.021, 0.018, 0.043, 1.0, 0.034],
  ['T5', 1.395, -0.077, 0.03, 0.022, 0.019, 0.044, 1.05, 0.034], ['T6', 1.371, -0.079, 0.031, 0.023, 0.019, 0.044, 1.05, 0.034],
  ['T7', 1.346, -0.079, 0.032, 0.024, 0.02, 0.044, 1.05, 0.034], ['T8', 1.32, -0.077, 0.033, 0.025, 0.02, 0.043, 1.0, 0.034],
  ['T9', 1.293, -0.074, 0.034, 0.026, 0.021, 0.04, 0.9, 0.034], ['T10', 1.265, -0.07, 0.035, 0.027, 0.021, 0.036, 0.75, 0.032],
  ['T11', 1.236, -0.064, 0.037, 0.028, 0.022, 0.034, 0.5, 0.028], ['T12', 1.206, -0.057, 0.039, 0.029, 0.023, 0.032, 0.3, 0.026],
  ['L1', 1.172, -0.048, 0.042, 0.031, 0.025, 0.03, 0.1, 0.034], ['L2', 1.137, -0.04, 0.044, 0.032, 0.026, 0.031, 0.08, 0.038],
  ['L3', 1.101, -0.034, 0.046, 0.033, 0.026, 0.031, 0.06, 0.042], ['L4', 1.066, -0.031, 0.048, 0.034, 0.027, 0.03, 0.08, 0.04],
  ['L5', 1.033, -0.033, 0.05, 0.035, 0.026, 0.026, 0.15, 0.042],
];
const rigOfVertebra = (n) => /^C[2-5]/.test(n) ? 'neck2' : /^(C[67]|T1$)/.test(n) ? 'neck1' : /^T([2-8])$/.test(n) ? 'spine3' : /^(T9|T1[0-2]|L1)$/.test(n) ? 'spine2' : 'spine1';
export const VERTEBRA_AT = Object.fromEntries(VERTEBRAE.map((v) => [v[0], [0, v[1], v[2]]]));

function spine(X, put, along, s) {
  const V = VERTEBRAE;
  V.forEach((v, i) => {
    const [n, y, z, bw, bd, bh, spl, spa, tpl] = v, rig = rigOfVertebra(n), c = [0, y, z];
    const above = V[Math.max(0, i - 1)], below = V[Math.min(V.length - 1, i + 1)];
    const T = norm([0, above[1] - below[1], above[2] - below[2]]), F = [0, -T[2], T[1]];   // up the spine, and forwards across it
    const lumbar = n[0] === 'L', cervical = n[0] === 'C', thoracic = n[0] === 'T';
    // the body: a round-edged drum; the disc under it (a little bluer)
    const rr = Math.min(bd, bw) * 0.32; put(rig, box(X(c), [s(bw / 2 - rr), s(bh / 2 - Math.min(rr, bh * 0.3)), s(bd / 2 - rr)], s(rr), frame([1, 0, 0], T)), 0.0015);
    if (i < V.length - 1) put(rig, box(X(add(c, mul(T, -(bh / 2 + (lumbar ? 0.0045 : 0.0025))))), [s(bw / 2 - 0.005), s(lumbar ? 0.0025 : 0.0012), s(bd / 2 - 0.005)], s(0.004), frame([1, 0, 0], T)), 0.001, PART.cartilage);
    // the arch behind it round the spinal canal: pedicles, laminae; the spinous process from their meeting, back and down
    const canal = cervical ? 0.011 : thoracic ? 0.008 : 0.01, back = add(c, mul(F, -bd / 2));
    const pedEnd = (sg) => add(back, add(mul(F, -canal * 1.15), [sg * (canal + 0.002), 0, 0])), apex = add(back, mul(F, -(canal * 2.2 + 0.004)));
    for (const sg of [1, -1]) {
      put(rig, rod(X(add(back, [sg * bw * 0.3, 0, 0])), X(pedEnd(sg)), s(cervical ? 0.003 : 0.0045), s(cervical ? 0.0035 : 0.005)), 0.002);
      put(rig, rod(X(pedEnd(sg)), X(apex), s(cervical ? 0.0028 : 0.004), s(0.004)), 0.002);
      // the articular processes, above and below
      put(rig, ball(X(add(pedEnd(sg), mul(T, bh * 0.45))), s(cervical ? 0.0045 : lumbar ? 0.006 : 0.004)), 0.004);
      put(rig, ball(X(add(pedEnd(sg), mul(T, -bh * 0.45))), s(cervical ? 0.0045 : lumbar ? 0.006 : 0.004)), 0.004);
      // the transverse processes: out to the sides (back and up in the chest, to meet the ribs)
      const tdir = norm(add([sg, 0, 0], add(mul(F, thoracic ? -0.55 : cervical ? 0.25 : -0.1), mul(T, thoracic ? 0.2 : 0))));
      const tEnd = add(pedEnd(sg), mul(tdir, tpl - canal));
      if (lumbar) put(rig, strand(X(pedEnd(sg)), X(tEnd), { w: s(0.0065), d: s(0.002), t0: [s(0.008), s(0.0035)], t1: [s(0.0045), s(0.002)], out: F }), 0.003);
      else put(rig, rod(X(pedEnd(sg)), X(tEnd), s(0.0045), s(thoracic ? 0.0055 : 0.0035)), 0.0015);
    }
    const sdir = norm(add(mul(F, -Math.cos(spa)), mul(T, -Math.sin(spa))));
    put(rig, strand(X(apex), X(add(apex, mul(sdir, spl))), { w: s(lumbar ? 0.01 : 0.0045), d: s(lumbar ? 0.0035 : 0.003), t0: [s(lumbar ? 0.011 : 0.006), s(0.004)], t1: [s(lumbar ? 0.011 : thoracic ? 0.004 : 0.004), s(lumbar ? 0.004 : 0.003)], out: [1, 0, 0] }), 0.0015);
    if (cervical && n !== 'C7') for (const sg of [1, -1]) put(rig, ball(X(add(apex, add(mul(sdir, spl), [sg * 0.0035, 0, 0]))), s(0.0035)), 0.001);   // the neck's forked tips
    if (n === 'C2') put('neck2', rod(X(add(c, mul(T, bh * 0.4))), X(add(c, add(mul(T, bh * 0.4 + 0.014), mul(F, 0.002)))), s(0.005), s(0.0045)), 0.002);   // the dens, up into the atlas
  });
  // the atlas (C1): a ring with heavy sides and long wings, no body
  const a = [0, 1.617, -0.023];
  put('neck2', rod(X(add(a, [-0.008, 0, 0.012])), X(add(a, [0.008, 0, 0.012])), s(0.004), s(0.004)), 0.002);
  for (const sg of [1, -1]) {
    put('neck2', egg(X(add(a, [sg * 0.019, 0, -0.002])), [s(0.008), s(0.007), s(0.011)]), 0.002);
    put('neck2', rod(X(add(a, [sg * 0.008, 0, 0.012])), X(add(a, [sg * 0.017, 0, 0.004])), s(0.004), s(0.004)), 0.002);
    put('neck2', rod(X(add(a, [sg * 0.022, 0, -0.008])), X(add(a, [sg * 0.008, 0.001, -0.03])), s(0.003), s(0.003)), 0.002);
    put('neck2', rod(X(add(a, [sg * 0.024, 0, -0.002])), X(add(a, [sg * 0.038, -0.002, -0.004])), s(0.004), s(0.004)), 0.002);
  }
  put('neck2', rod(X(add(a, [-0.008, 0.001, -0.03])), X(add(a, [0.008, 0.001, -0.03])), s(0.003), s(0.003)), 0.002);
  // the sacrum: five fused vertebrae curving back and down, wide at the top (its wings meet the hip bones), to a point
  const sac = [[0, 1.012, -0.045], [0, 0.99, -0.06], [0, 0.968, -0.07], [0, 0.948, -0.078], [0, 0.93, -0.083]];
  const sw = [0.054, 0.046, 0.034, 0.024, 0.016];
  for (let i = 0; i < sac.length - 1; i++) {
    const p = sac[i], q = sac[i + 1], u = norm(sub(q, p)), back = norm(cross(u, [1, 0, 0]));
    put('hips', strand(X(p), X(q), { w: s((sw[i] + sw[i + 1]) / 2), d: s(0.013 - i * 0.002), t0: [s(sw[i]), s(0.014 - i * 0.002)], t1: [s(sw[i + 1]), s(0.012 - i * 0.002)], out: back }), 0.003);
    put('hips', rod(X(add(p, mul(back, -0.014))), X(add(q, mul(back, -0.012))), s(0.003), s(0.0025)), 0.002);   // its crest at the back
  }
  for (const sg of [1, -1]) put('hips', egg(X([sg * 0.04, 1.0, -0.055]), [s(0.022), s(0.022), s(0.016)]), 0.004);   // the wings
  // the coccyx: four small pieces curling under
  spline([[0, 0.926, -0.085], [0, 0.912, -0.084], [0, 0.902, -0.078], [0, 0.896, -0.07]], 1).reduce((p, q) => { put('hips', rod(X(p), X(q), s(0.0055), s(0.004)), 0.002); return q; });
}

// ── the ribs: twelve pairs from the spine round to the front, the upper seven joined to the breastbone by their
// cartilage, the next three to the cartilage above, the last two free ────────────────────────────────────────────────
// [half-width, how far the front end falls below the back, the angle's z, the bony rib's front end, the cartilage's end]
const RIBS = [
  [0.058, 0.04, -0.074, [0.04, 1.442, 0.054], [0.024, 1.448, 0.07]],
  [0.086, 0.06, -0.098, [0.056, 1.404, 0.074], [0.024, 1.418, 0.083]],
  [0.104, 0.078, -0.11, [0.074, 1.366, 0.085], [0.022, 1.392, 0.09]],
  [0.118, 0.094, -0.116, [0.086, 1.332, 0.09], [0.021, 1.366, 0.095]],
  [0.128, 0.104, -0.119, [0.096, 1.298, 0.092], [0.02, 1.341, 0.099]],
  [0.135, 0.11, -0.12, [0.106, 1.268, 0.09], [0.018, 1.316, 0.102]],
  [0.14, 0.114, -0.12, [0.114, 1.238, 0.084], [0.016, 1.29, 0.104]],
  [0.143, 0.118, -0.118, [0.123, 1.208, 0.074], [0.04, 1.27, 0.101]],
  [0.144, 0.118, -0.115, [0.13, 1.182, 0.062], [0.064, 1.248, 0.094]],
  [0.142, 0.114, -0.111, [0.134, 1.162, 0.046], [0.086, 1.226, 0.082]],
  [0.13, 0.07, -0.105, [0.13, 1.17, -0.004], null],
  [0.104, 0.04, -0.097, [0.1, 1.17, -0.05], null],
];
function ribs(X, put, along, s, sg, M) {
  RIBS.forEach(([W, drop, za, front, cart], i) => {
    const v = VERTEBRAE.find((q) => q[0] === 'T' + (i + 1)), y = v[1], z = v[2], bw = v[3], rig = i < 7 ? 'spine3' : 'spine2';
    const P0 = [bw / 2 + 0.002, y + 0.002, z - 0.004], P1 = [0.03, y + 0.004, z - 0.03], P2 = [Math.min(W * 0.42, 0.06), y - drop * 0.06, za];
    const P3 = [W * 0.82, y - drop * 0.25, za * 0.72], P4 = [W, y - drop * 0.48, za * 0.12 - 0.008];
    const end = front, P5 = [lerp([W, 0, 0], end, 0.45)[0] + 0.012, y - drop * 0.74, lerp([0, 0, za * 0.12], end, 0.55)[2]];
    let pts = [P0, P1, P2, P3, P4, P5, end];
    if (i === 0) pts = [P0, [0.03, y + 0.004, z - 0.026], [0.048, y - 0.006, z - 0.012], [0.058, y - 0.018, 0.0], [0.054, y - 0.03, 0.03], end];
    if (i >= 10) pts = [P0, P1, P2, P3, end];
    const out = (p) => norm([p[0], 0, p[2] + 0.01]);
    // the rib: round by the spine, flat further round (a tall, thin band), its broad side outwards
    along(rig, spline(pts, 3).map(M), 0.0055, 0.005, i === 0 ? 0.009 : 0.0075, i === 0 ? 0.004 : 0.003, (p) => M(out(M(p))), 0.0012);
    if (cart) {
      // the cartilage: from the rib's end to the breastbone (or up to the cartilage above), curving upwards
      const mid = [lerp(end, cart, 0.5)[0], lerp(end, cart, 0.5)[1] - (i >= 5 ? 0.012 : 0.004), lerp(end, cart, 0.5)[2] + 0.004];
      along(rig, spline([end, mid, cart], 2).map(M), 0.006, 0.0032, 0.005, 0.003, () => M([0.15, 0, 1]), 0.0012, PART.cartilage);
    }
  });
}

function sternum(X, put, along, s) {
  // the handle at the top (with the notch the collarbones sit in), the body, the small sword at its foot
  put('spine3', strand(X([0, 1.462, 0.065]), X([0, 1.415, 0.078]), { w: s(0.026), d: s(0.0055), t0: [s(0.027), s(0.006)], t1: [s(0.017), s(0.005)], out: [0, 0.27, 1] }), 0.0015);
  put('spine3', strand(X([0, 1.414, 0.079]), X([0, 1.29, 0.103]), { w: s(0.017), d: s(0.005), t0: [s(0.014), s(0.005)], t1: [s(0.015), s(0.004)], full: 0.6, out: [0, 0.2, 1] }), 0.0015);
  put('spine3', strand(X([0, 1.29, 0.103]), X([0, 1.255, 0.1]), { w: s(0.008), d: s(0.002), t0: [s(0.008), s(0.0025)], t1: [s(0.003), s(0.0015)], out: [0, 0, 1] }), 0.0015, PART.cartilage);
}

// ── the shoulder: the collarbone's S from the breastbone to the shoulder's tip; the blade with its spine, its tip over
// the joint (acromion), its hook forwards (coracoid), its shallow socket ───────────────────────────────────────────────
function shoulder(X, put, along, s, sg, M, P, B) {
  const cl = 'clavicle.' + (sg > 0 ? 'L' : 'R');
  const cv = [[0.022, 1.468, 0.062], [0.058, 1.471, 0.068], [0.105, 1.474, 0.048], [0.147, 1.477, 0.012], [0.176, 1.48, -0.012]];
  along(cl, spline(cv, 3).map(M), 0.0075, 0.007, 0.011, 0.0045, () => [0, 1, 0], 0.0015);
  // the blade: its three borders, a thin plate between them, curved to the ribs
  const sup = [0.072, 1.468, -0.1], inf = [0.088, 1.292, -0.096], lat = [0.146, 1.42, -0.064], plate = norm([sg * 0.35, 0, -1]);
  along(cl, spline([sup, [0.07, 1.4, -0.108], [0.076, 1.34, -0.105], inf], 2).map(M), 0.004, 0.0035, 0.005, 0.004, () => plate, 0.0012);
  along(cl, spline([inf, [0.11, 1.33, -0.088], [0.135, 1.385, -0.072], lat], 2).map(M), 0.0055, 0.0045, 0.006, 0.006, () => plate, 0.0012);
  along(cl, spline([sup, [0.105, 1.452, -0.088], [0.135, 1.44, -0.072], lat], 2).map(M), 0.003, 0.003, 0.004, 0.0035, () => plate, 0.0012);
  for (const [c, r] of [[[0.088, 1.425, -0.101], [0.024, 0.042]], [[0.096, 1.36, -0.1], [0.022, 0.05]], [[0.117, 1.395, -0.087], [0.026, 0.034]], [[0.13, 1.41, -0.077], [0.016, 0.022]]]) put(cl, egg(P(...c), [s(r[0]), s(r[1]), s(0.0032)], frame(norm([sg, 0, 0.35 * sg]), [0, 1, 0])), 0.006);
  // its spine, standing out of the plate, running up and out to the acromion
  along(cl, spline([[0.072, 1.432, -0.108], [0.12, 1.448, -0.1], [0.165, 1.462, -0.075], [0.188, 1.478, -0.04]], 2).map(M), 0.004, 0.007, 0.006, 0.009, () => norm([sg * 0.2, 0.25, -1]), 0.0015);
  along(cl, spline([[0.18, 1.475, -0.05], [0.195, 1.48, -0.026], [0.197, 1.479, -0.008]], 2).map(M), 0.011, 0.0045, 0.01, 0.0045, () => [0, 1, 0], 0.0015);
  // the coracoid: up and then forwards from the blade's top, a crooked finger
  along(cl, spline([[0.135, 1.432, -0.056], [0.14, 1.452, -0.03], [0.147, 1.448, -0.008], [0.153, 1.44, 0.004]], 2).map(M), 0.006, 0.005, 0.0045, 0.0045, () => [0, 1, 0], 0.0015);
  // the socket: a shallow pear-shaped rim facing out and forwards
  put(cl, egg(P(0.153, 1.428, -0.046), [s(0.008), s(0.019), s(0.013)], frame(norm([sg, 0, 0.4 * sg]), [0, 1, 0])), 0.003);
  void B;
}

// ── the arm: the humerus (its ball, its two knobs, the shaft, the elbow's knuckles); the ulna (the elbow's point, its
// shaft along the back of the forearm to its small head) and the radius (its disc of a head at the elbow, the shaft
// widening to the wrist on the thumb's side) ─────────────────────────────────────────────────────────────────────────
function arm(X, put, along, s, sg, M, P, B) {
  const ua = B('upperArm'), fa = B('foreArm'), ft = B('foreArmTwist');
  put(ua, ball(P(0.18, 1.442, -0.026), s(0.0235)), 0.003);
  put(ua, egg(P(0.2, 1.446, -0.012), [s(0.012), s(0.016), s(0.014)]), 0.004);
  put(ua, ball(P(0.188, 1.432, 0.006), s(0.0075)), 0.003);
  along(ua, spline([[0.192, 1.418, -0.018], [0.2, 1.33, -0.024], [0.205, 1.2, -0.038], [0.204, 1.142, -0.046]], 2).map(M), 0.0125, 0.012, 0.0115, 0.011, () => [sg, 0, 0], 0.002);
  put(ua, egg(P(0.208, 1.31, -0.022), [s(0.006), s(0.018), s(0.007)]), 0.004);   // where the deltoid holds
  put(ua, strand(P(0.204, 1.15, -0.045), P(0.203, 1.112, -0.048), { w: s(0.024), d: s(0.008), t0: [s(0.014), s(0.009)], t1: [s(0.03), s(0.008)], out: [0, 0, 1] }), 0.003);
  put(ua, ball(P(0.233, 1.118, -0.05), s(0.0075)), 0.003);   // the outer epicondyle
  put(ua, ball(P(0.171, 1.116, -0.053), s(0.0095)), 0.003);  // the inner, more prominent
  put(ua, ball(P(0.22, 1.104, -0.04), s(0.0095)), 0.002);    // the capitulum (the radius turns on it)
  put(ua, egg(P(0.194, 1.103, -0.045), [s(0.014), s(0.0115), s(0.0125)]), 0.002);   // the trochlea (the ulna hinges round it)
  // the ulna
  put(fa, egg(P(0.203, 1.124, -0.068), [s(0.011), s(0.016), s(0.011)]), 0.003);   // the olecranon: the elbow's point
  put(fa, egg(P(0.196, 1.094, -0.034), [s(0.008), s(0.006), s(0.008)]), 0.003);   // the coronoid
  along(fa, spline([[0.2, 1.1, -0.056], [0.203, 1.02, -0.05], [0.205, 0.94, -0.04], [0.207, 0.89, -0.033]], 2).map(M), 0.0085, 0.0075, 0.006, 0.0055, () => [sg, 0, 0], 0.002);
  put(ft, ball(P(0.207, 0.878, -0.03), s(0.0075)), 0.002);
  put(ft, rod(P(0.206, 0.876, -0.035), P(0.205, 0.864, -0.036), s(0.003), s(0.0022)), 0.0015);
  // the radius
  put(fa, egg(P(0.224, 1.092, -0.036), [s(0.0115), s(0.0055), s(0.0115)]), 0.002);
  put(fa, egg(P(0.221, 1.071, -0.03), [s(0.006), s(0.009), s(0.006)]), 0.003);
  along(fa, spline([[0.222, 1.072, -0.032], [0.229, 1.0, -0.02], [0.232, 0.94, -0.008], [0.232, 0.9, 0.0]], 2).map(M), 0.007, 0.0065, 0.0105, 0.007, () => [sg, 0, 0], 0.002);
  put(ft, egg(P(0.231, 0.879, 0.0), [s(0.0095), s(0.012), s(0.017)]), 0.003);
  put(ft, rod(P(0.235, 0.874, 0.012), P(0.237, 0.864, 0.018), s(0.0045), s(0.002)), 0.002);
}

// ── the hand: eight wrist bones in two rows, five long bones in the palm, two bones in the thumb and three in each
// finger, each with its base and its head ──────────────────────────────────────────────────────────────────────────────
function hand(X, put, along, s, sg, side) {
  const w0 = JOINTS['hand.L'], wr = [sg * w0[0], w0[1], w0[2]], at = (a, b, c) => X([wr[0] + sg * c, wr[1] - a, wr[2] + b]);
  const hb = 'hand.' + side, J = fingerJoints(wr, sg);
  // the wrist: scaphoid, lunate, triquetrum, pisiform; trapezium, trapezoid, capitate, hamate
  for (const [a, b, c, r] of [[0.009, 0.013, 0.0, [0.0075, 0.007, 0.011]], [0.008, -0.002, 0.001, [0.0075, 0.008, 0.008]], [0.011, -0.014, 0.0, [0.0065, 0.0075, 0.007]], [0.015, -0.017, -0.009, [0.0045, 0.005, 0.005]],
    [0.025, 0.02, -0.003, [0.007, 0.007, 0.0075]], [0.026, 0.01, 0.001, [0.006, 0.0075, 0.006]], [0.024, 0.0, 0.001, [0.0075, 0.011, 0.008]], [0.025, -0.012, 0.0, [0.007, 0.0095, 0.0075]]])
    put(hb, egg(at(a, b, c), r.map(s), frame([sg, 0, 0], [0, -1, 0])), 0.0015);
  for (const f of ['index', 'middle', 'ring', 'little']) {
    const [a0, b0, c0] = HAND.bases[f], k = X(J[`${f}1`]), base = at(a0, b0, c0), head = add(k, X.k ? [0, 0.003 * X.k, 0] : [0, 0.003, 0]);
    put(hb, egg(base, [s(0.004), s(0.005), s(0.006)]), 0.0015);
    put(hb, strand(base, head, { w: s(0.004), d: s(0.004), t0: [s(0.0045), s(0.0045)], t1: [s(0.0042), s(0.0045)], bend: s(0.002), out: [sg, 0, 0] }), 0.0015);
    put(hb, ball(add(head, [0, -0.002 * (X.k ?? 1), 0]), s(f === 'little' ? 0.0055 : 0.0065)), 0.0015);
  }
  for (const f of FINGERS) {
    const pts = [1, 2, 3].map((j) => X(J[`${f}${j}`])).concat([X(J[`${f}Tip`])]), rr = f === 'thumb' ? 1.2 : f === 'little' ? 0.85 : 1;
    for (let j = f === 'thumb' ? 0 : 0; j < 3; j++) {
      const bn = `${f}${j + 1}.${side}`, a = pts[j], b = pts[j + 1], u = norm(sub(b, a)), r = s([0.0042, 0.0035, 0.0028][j] * rr);
      const a1 = add(a, mul(u, s(0.003))), b1 = add(b, mul(u, -s(j === 2 ? 0.0 : 0.003)));
      put(bn, strand(a1, b1, { w: r, d: r * 0.85, t0: [r * 1.3, r * 1.15], t1: [r * (j === 2 ? 1.4 : 1.15), r * (j === 2 ? 0.7 : 1.0)], full: 0.5, out: [sg, 0, 0] }), 0.0012);
      if (j === 2) put(bn, egg(add(b1, mul(u, -s(0.002))), [r * 1.4, s(0.003), r * 0.9]), 0.0012);   // the tip's tuft
    }
  }
}

// ── the pelvis: each hip bone of three grown into one (the ilium's wing with its crest, the ischium the seat rests on,
// the pubis meeting the other in front), round the socket of the hip joint ────────────────────────────────────────────
function pelvis(X, put, along, s, sg, M, P, L) {
  const h = 'hips';
  // the crest: from the spine in front (ASIS) over the top to the spine at the back (PSIS)
  const crest = [[0.115, 1.0, 0.066], [0.136, 1.038, 0.038], [0.149, 1.06, 0.004], [0.14, 1.068, -0.036], [0.112, 1.06, -0.07], [0.068, 1.04, -0.092], [0.045, 1.022, -0.094]];
  along(h, spline(crest, 2).map(M), 0.0095, 0.007, 0.009, 0.008, (p) => norm([p[0], 0.4, p[2] * 1.2]), 0.002);
  // the wing: a thin fan from the body round the socket up to the crest
  // the wing: a slice of a thin bowl opening upwards (the basin the belly rests in), from the joint with the sacrum
  // round to the front, under the crest
  const bowlC = X([0, 1.115, -0.016]), R0 = [s(0.163), s(0.2), s(0.108)], th = s(0.0055);
  put(h, group([
    { op: 'add', k: 0, s: egg(bowlC, R0) },
    { op: 'sub', k: s(0.002), s: egg(bowlC, R0.map((r) => r - th)) },
    { op: 'and', k: s(0.006), s: plane([-sg, 0, 0], X(M([0.05, 1.0, 0]))) },                  // only its side
    { op: 'and', k: s(0.008), s: plane([0, 1, 0.1], X([0, 1.062, 0])) },                        // under the crest
    { op: 'and', k: s(0.01), s: plane(norm([sg * 0.25, -1, 0]), X(M([0.09, 0.952, 0]))) },     // down to the body round the socket
    { op: 'and', k: s(0.008), s: plane([0, 0, 1], X([0, 0, 0.068])) },                         // from the front spine
    { op: 'and', k: s(0.008), s: plane(norm([sg * 0.4, 0, -1]), X(M([0.04, 1.0, -0.092]))) }, // to the back
  ]), s(0.004));
  put(h, strand(P(0.105, 0.975, 0.05), P(0.115, 0.996, 0.062), { w: s(0.006), d: s(0.006), out: [0, 0, 1] }), 0.003);   // the lower front spine
  // round the hip socket, the socket itself (the thigh's ball fits it)
  put(h, egg(P(0.074, 0.93, -0.004), [s(0.02), s(0.03), s(0.029)]), 0.004);
  L.push({ bone: h, s: ball(X(M([0.088, 0.925, 0.0])), s(0.0255)), k: 0.0015 * (X.k ?? 1), part: PART.bone, op: 'sub', layer: 'bone' });   // the socket, cut before the femur is laid
  // the ischium: down and back to the bone one sits on; its spine
  put(h, strand(P(0.074, 0.915, -0.025), P(0.06, 0.872, -0.052), { w: s(0.011), d: s(0.009), t1: [s(0.016), s(0.012)], out: [sg, 0, 0] }), 0.003);
  put(h, egg(P(0.058, 0.872, -0.055), [s(0.012), s(0.018), s(0.014)]), 0.003);
  put(h, rod(P(0.07, 0.932, -0.048), P(0.058, 0.93, -0.066), s(0.004), s(0.0025)), 0.002);
  // the pubis: up and in to meet the other in front; its lower branch back to the ischium (the hole between them)
  along(h, spline([[0.078, 0.928, 0.026], [0.05, 0.918, 0.052], [0.022, 0.905, 0.066], [0.006, 0.898, 0.072]], 2).map(M), 0.007, 0.006, 0.011, 0.007, () => [0, 0.3, 1], 0.002);
  along(h, spline([[0.012, 0.886, 0.066], [0.025, 0.872, 0.04], [0.04, 0.865, 0.0], [0.052, 0.866, -0.04]], 2).map(M), 0.0065, 0.004, 0.006, 0.0045, () => [sg, 0, 0], 0.002);
  // where it meets the sacrum
  put(h, egg(P(0.058, 1.0, -0.072), [s(0.014), s(0.03), s(0.018)]), 0.004);
}

// ── the leg: the femur (its ball on a neck, the great knob at the hip, the long shaft bowed forwards, the two rounded
// knuckles at the knee); the kneecap; the tibia (its plateau, the bump below the knee, its sharp front edge, the inner
// ankle) and the fibula beside it (its head, the outer ankle) ────────────────────────────────────────────────────────
function leg(X, put, along, s, sg, M, P, B) {
  const th = B('thigh'), sh = B('shin');
  put(th, ball(P(0.088, 0.925, 0.0), s(0.0235)), 0.002);
  put(th, strand(P(0.096, 0.921, 0.002), P(0.13, 0.897, -0.002), { w: s(0.012), d: s(0.015), t0: [s(0.012), s(0.014)], t1: [s(0.016), s(0.018)], out: [0, 0, 1] }), 0.004);
  put(th, egg(P(0.146, 0.916, -0.01), [s(0.014), s(0.022), s(0.019)]), 0.004);   // the great trochanter
  put(th, ball(P(0.118, 0.873, -0.018), s(0.0075)), 0.003);                      // the lesser
  along(th, spline([[0.136, 0.89, -0.004], [0.125, 0.78, 0.004], [0.108, 0.66, 0.008], [0.093, 0.565, 0.008]], 3).map(M), 0.0135, 0.0135, 0.0135, 0.013, () => [0, 0, 1], 0.003);
  put(th, strand(P(0.127, 0.83, -0.014), P(0.1, 0.6, -0.008), { w: s(0.003), d: s(0.004), out: [0, 0, -1] }), 0.003);   // its ridge at the back
  put(th, strand(P(0.092, 0.57, 0.006), P(0.084, 0.528, 0.004), { w: s(0.022), d: s(0.016), t0: [s(0.015), s(0.014)], t1: [s(0.04), s(0.02)], out: [0, 0, 1] }), 0.004);
  put(th, egg(P(0.062, 0.515, -0.002), [s(0.017), s(0.022), s(0.028)]), 0.009);   // the inner condyle
  put(th, egg(P(0.106, 0.516, -0.002), [s(0.016), s(0.021), s(0.027)]), 0.009);   // the outer
  put(sh, egg(P(0.087, 0.535, 0.044), [s(0.021), s(0.023), s(0.01)]), 0.003);     // the kneecap
  put(sh, egg(P(0.087, 0.516, 0.04), [s(0.011), s(0.011), s(0.007)]), 0.003);
  put(sh, box(P(0.085, 0.479, 0.004), [s(0.03), s(0.004), s(0.016)], s(0.01)), 0.006);   // the tibia's plateau, flat on top
  put(sh, egg(P(0.085, 0.468, 0.004), [s(0.034), s(0.016), s(0.024)]), 0.01);
  put(sh, egg(P(0.087, 0.452, 0.037), [s(0.011), s(0.016), s(0.008)]), 0.004);    // the bump below the knee
  along(sh, spline([[0.084, 0.468, 0.014], [0.082, 0.36, 0.008], [0.078, 0.22, 0.0], [0.075, 0.115, -0.006]], 3).map(M), 0.0125, 0.012, 0.011, 0.0105, () => [0, 0, 1], 0.003);
  along(sh, spline([[0.086, 0.44, 0.03], [0.082, 0.3, 0.022], [0.077, 0.17, 0.012]], 2).map(M), 0.002, 0.0055, 0.002, 0.004, () => [sg * 0.3, 0, 1], 0.003);   // its sharp front edge
  put(sh, egg(P(0.074, 0.098, -0.008), [s(0.02), s(0.017), s(0.02)]), 0.004);
  put(sh, strand(P(0.06, 0.1, -0.006), P(0.054, 0.07, -0.006), { w: s(0.007), d: s(0.007), t1: [s(0.005), s(0.005)], out: [-sg, 0, 0] }), 0.003);   // the inner ankle
  put(sh, ball(P(0.118, 0.468, -0.016), s(0.0085)), 0.003);
  along(sh, spline([[0.118, 0.46, -0.017], [0.115, 0.3, -0.022], [0.108, 0.12, -0.028]], 2).map(M), 0.0055, 0.0055, 0.006, 0.006, () => [0, 0, 1], 0.003);
  put(sh, egg(P(0.104, 0.07, -0.031), [s(0.008), s(0.016), s(0.01)]), 0.003);    // the outer ankle, lower than the inner
}

// ── the foot: the talus under the shin, the heel bone behind and below it, the navicular, the cuboid and three
// cuneiforms across the arch, five long bones to the ball, the toes (two bones in the great one, three in the rest) ──
function foot(X, put, along, s, sg, M, P, B) {
  const f = B('foot'), t = B('toes'), a0 = JOINTS['foot.L'];
  // the foot points a little outwards: 7° round the ankle
  const turn = (p) => { const dx = p[0] - a0[0], dz = p[2] - a0[2], c = Math.cos(0.12), sn = Math.sin(0.12); return [a0[0] + dx * c + dz * sn, p[1], a0[2] - dx * sn + dz * c]; };
  const Q = (x, y, z) => X(M(turn([x, y, z])));
  const FB = (c, h, rr, yaw = 0, pitch = 0) => box(Q(...c), h.map((v) => s(Math.max(0.001, v - rr * 0.5))), s(rr * 1.5), frame([Math.cos(yaw), 0, -Math.sin(yaw) * sg], [0, Math.cos(pitch), Math.sin(pitch)]));
  put(f, FB([0.077, 0.064, -0.014], [0.012, 0.009, 0.019], 0.007, 0.15), 0.002);          // the talus, its dome under the shin
  put(f, ball(Q(0.07, 0.058, 0.018), s(0.0105)), 0.002);                                     // its head, forwards into the navicular
  put(f, FB([0.077, 0.034, -0.035], [0.013, 0.014, 0.03], 0.009, 0.05, 0.12), 0.003);      // the heel bone, long and deep
  put(f, FB([0.073, 0.028, -0.062], [0.012, 0.015, 0.01], 0.009), 0.003);                   // its back, the heel itself
  put(f, FB([0.066, 0.054, 0.033], [0.013, 0.009, 0.006], 0.005, -0.3), 0.002);            // navicular
  put(f, FB([0.1, 0.033, 0.028], [0.01, 0.011, 0.013], 0.005, 0.2), 0.002);                // cuboid
  for (const [x, y, w] of [[0.059, 0.048, 0.0075], [0.075, 0.047, 0.006], [0.088, 0.043, 0.0065]]) put(f, FB([x, y, 0.05], [w, 0.011, 0.008], 0.004), 0.002);   // cuneiforms
  const bases = [[0.058, 0.048, 0.06], [0.073, 0.046, 0.064], [0.085, 0.041, 0.064], [0.097, 0.035, 0.058], [0.109, 0.027, 0.046]];
  const heads = [[0.063, 0.017, 0.13], [0.083, 0.015, 0.131], [0.097, 0.014, 0.127], [0.109, 0.013, 0.119], [0.12, 0.012, 0.106]];
  const toes = [[0.034, 0.025], [0.026, 0.017, 0.012], [0.024, 0.015, 0.011], [0.021, 0.013, 0.01], [0.018, 0.011, 0.009]];
  for (let i = 0; i < 5; i++) {
    const r = i === 0 ? 0.0085 : 0.0055;
    put(f, strand(Q(...bases[i]), Q(...heads[i]), { w: s(r), d: s(r), t0: [s(r * 1.3), s(r * 1.4)], t1: [s(r * 1.1), s(r * 1.15)], bend: s(0.004), out: [0, 1, 0] }), 0.0015);
    put(t, ball(Q(...heads[i]), s(i === 0 ? 0.011 : 0.0072)), 0.0015);
    let p = heads[i];
    toes[i].forEach((len, j) => {
      const q = [p[0] + 0.001, p[1] - (j === toes[i].length - 1 ? 0.002 : 0.0005), p[2] + len], rr = (i === 0 ? 0.0075 : 0.0045) * [1, 0.85, 0.75][j];
      put(t, strand(Q(...p), Q(...q), { w: s(rr), d: s(rr * 0.9), t0: [s(rr * 1.25), s(rr * 1.15)], t1: [s(rr * 1.1), s(rr)], out: [0, 1, 0] }), 0.0012);
      p = q;
    });
  }
  for (const dx of [-0.006, 0.006]) put(t, ball(Q(0.063 + dx, 0.008, 0.124), s(0.005)), 0.0015);   // the two small bones under the great toe's ball
}

// ── the skull: the vault (forehead, crown, the back of the head, the temples' hollows); the face under its front half
// (the sockets of the eyes and the nose's opening cut into it, the bridge of the nose, the cheekbones and their arches
// back to the ears, the upper jaw with the ridge that holds its teeth, the palate); the lower jaw on its own bone (its
// body round to the chin, its branches up to the hinges before the ears); thirty-two teeth. Points from craniometry's
// means for a man (Howells 1973, "Cranial variation in man"; Farkas 1994), as remembered, measured from the middle
// between the ear canals with the head upright (y up, z forwards) ──────────────────────────────────────────────────
const SK = [0, 1.66, -0.012];   // the middle between the ear canals (the reference man)
function skull(X, put, along, s) {
  const h = 'head', j = 'jaw', P = (x, y, z) => X([SK[0] + x, SK[1] + y, SK[2] + z]), E = (c, r, R) => egg(P(...c), r.map(s), R);
  const Ls = (pts) => pts.map(([x, y, z]) => [SK[0] + x, SK[1] + y, SK[2] + z]);
  const cut = (sol, k) => SKULL_SUB.push(['head', sol, k]);
  // the vault: long and a little wider behind; the forehead rising from the brows; the back of the head and its bump
  put(h, E([0, 0.05, -0.022], [0.071, 0.079, 0.082]), 0.004);   // the crown and the sides, widest behind
  put(h, E([0, 0.056, 0.036], [0.054, 0.066, 0.062]), 0.03);     // the forehead, narrower
  put(h, E([0, 0.03, -0.062], [0.064, 0.05, 0.04]), 0.016);
  put(h, E([0, 0.002, -0.092], [0.013, 0.007, 0.006]), 0.005);
  // the face: the mass under and between the eyes' sockets, the upper jaw below; the brows' bone over them
  put(h, E([0, 0.01, 0.034], [0.055, 0.042, 0.036]), 0.01);    // behind the sockets: their walls are carved from it
  put(h, E([0, 0.012, 0.076], [0.0125, 0.026, 0.02]), 0.008);  // the bridge between the eyes
  put(h, E([0, -0.027, 0.062], [0.04, 0.024, 0.029]), 0.01);   // the upper jaw, ending at the ridge of its teeth
  put(h, E([0, 0.043, 0.084], [0.046, 0.011, 0.018]), 0.01);   // the brows' bone, over the sockets
  put(h, E([0, 0.036, 0.096], [0.016, 0.009, 0.008]), 0.008);   // the glabella between them
  for (const sg of [1, -1]) {
    // each socket's rim, a rounded square facing forwards and out, thick above (the brow), thinner below
    const C = [sg * 0.033, 0.016, 0.075], N = norm([sg * 0.34, -0.08, 1]), U = norm(cross([0, 1, 0], N)), V = cross(N, U);
    const ring = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a), q = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.86);
      ring.push(add(C, add(mul(U, q(c) * 0.0215), mul(V, q(sn) * 0.0185)))); }
    for (let i = 0; i < 16; i++) {
      const a = ring[i], b = ring[i + 1], up = (dot(sub(lerp(a, b, 0.5), C), V) + 0.0185) / 0.037, w = 0.0042 + 0.0032 * up, d = 0.0042 + 0.002 * up;
      put(h, strand(P(...a), P(...b), { w: s(w), d: s(d), t0: [s(w), s(d)], t1: [s(w), s(d)], out: norm(add(N, mul(norm(sub(lerp(a, b, 0.5), C)), 0.6))) }), 0.004);
    }
    SKULL_SUB.push(['head', box(P(...add(C, mul(N, -0.022))), [s(0.0085), s(0.0058), s(0.012)], s(0.0108), frame(U, V)), 0.003]);   // the socket, from its rim back
    SKULL_SUB.push(['head', egg(P(...add(C, mul(N, -0.04))), [s(0.012), s(0.011), s(0.016)], frame(U, V)), 0.006]);   // narrowing to its back
    put(h, E([sg * 0.049, -0.013, 0.062], [0.017, 0.016, 0.012], frame([1, 0, -sg * 0.55], [0, 1, 0])), 0.006);   // the cheekbone
    along(h, Ls([[sg * 0.058, -0.01, 0.05], [sg * 0.066, -0.007, 0.026], [sg * 0.066, -0.003, 0.004]]), 0.006, 0.003, 0.005, 0.003, () => [sg, 0, 0], 0.003);   // its arch back to the ear
    put(h, E([sg * 0.055, -0.03, -0.022], [0.008, 0.013, 0.01]), 0.004);                                       // the mastoid
    cut(E([sg * 0.079, 0.014, 0.034], [0.02, 0.04, 0.04]), 0.018);                                          // the temple's hollow behind the socket's rim
    cut(E([sg * 0.066, 0.0, -0.004], [0.0065, 0.0045, 0.006]), 0.002);                                         // the ear's canal
    cut(E([sg * 0.022, -0.03, 0.094], [0.011, 0.011, 0.008]), 0.008);                                          // the hollow over the canine
  }
  // the nose: the opening (pear-shaped, wider below) and the cavity behind it; its two small bones over the top
  cut(E([0, -0.012, 0.095], [0.0095, 0.017, 0.02]), 0.003);
  cut(E([0, -0.025, 0.095], [0.0125, 0.0085, 0.02]), 0.003);
  cut(E([0, -0.014, 0.066], [0.012, 0.022, 0.03]), 0.004);
  put(h, strand(P(0, 0.024, 0.097), P(0, 0.003, 0.106), { w: s(0.007), d: s(0.0025), t0: [s(0.0055), s(0.003)], t1: [s(0.008), s(0.0018)], out: [0, 0.4, 1] }), 0.004);
  put(h, E([0, -0.049, 0.052], [0.022, 0.004, 0.022]), 0.004);   // the palate, inside the arch of the teeth
  // the lower jaw: a tall plate from each angle round to the chin, a ridge on top for its teeth; its branch up to the
  // hinge before the ear; the coronoid up under the arch
  for (const sg of [1, -1]) {
    along(j, Ls([[sg * 0.048, -0.068, -0.002], [sg * 0.044, -0.082, 0.034], [sg * 0.03, -0.09, 0.066], [sg * 0.006, -0.096, 0.088]]), 0.012, 0.0045, 0.0155, 0.0055, (p) => norm([p[0] - SK[0], 0, p[2] - SK[2] - 0.035]), 0.004);
    along(j, Ls([[sg * 0.048, -0.068, -0.002], [sg * 0.05, -0.04, 0.002], [sg * 0.052, -0.016, 0.006]]), 0.012, 0.003, 0.008, 0.003, () => [sg, 0, 0], 0.003);
    put(j, E([sg * 0.052, -0.008, 0.008], [0.0095, 0.0055, 0.0055]), 0.002);
    along(j, Ls([[sg * 0.048, -0.04, 0.022], [sg * 0.047, -0.024, 0.028], [sg * 0.046, -0.012, 0.03]]), 0.006, 0.0022, 0.002, 0.0018, () => [sg, 0, 0], 0.003);
  }
  put(j, E([0, -0.1, 0.088], [0.016, 0.009, 0.007]), 0.006);                                                   // the chin's point
  // the teeth: incisors, canine, two premolars, three molars a side, above and below, each turned along the arch
  const TEETH = [[0.004, 0.094, 0.0042, 0.0105, 0.0032], [0.012, 0.09, 0.0035, 0.0095, 0.003], [0.019, 0.083, 0.004, 0.011, 0.0042], [0.023, 0.073, 0.0036, 0.0085, 0.0045],
    [0.025, 0.065, 0.0036, 0.0082, 0.0045], [0.027, 0.054, 0.0052, 0.0075, 0.0052], [0.029, 0.043, 0.005, 0.007, 0.005], [0.03, 0.033, 0.0045, 0.0065, 0.0048]];
  for (const [bone, gum, dir, back] of [['head', -0.055, -1, 0], ['jaw', -0.077, 1, 0.002]]) {
    for (const sg of [1, -1]) TEETH.forEach(([x, z, w, tall, d], i) => {
      const nx = TEETH[Math.min(TEETH.length - 1, i + 1)], pv = TEETH[Math.max(0, i - 1)], tan = norm([sg * (nx[0] - pv[0]) || sg, 0, nx[1] - pv[1] || -0.001]);
      const c = P(sg * (x - back * 0.25), gum + dir * tall * 0.5, z - back);
      put(bone, box(c, [s(w * 0.85), s(tall * 0.5), s(d * 0.85)], s(0.0013), frame(tan, [0, 1, 0])), 0.0008, PART.teeth);
    });
    along(bone, Ls([[0.03, gum - dir * 0.004, 0.03], [0.028, gum - dir * 0.004, 0.06], [0.018, gum - dir * 0.004, 0.083], [0, gum - dir * 0.004, 0.093], [-0.018, gum - dir * 0.004, 0.083], [-0.028, gum - dir * 0.004, 0.06], [-0.03, gum - dir * 0.004, 0.03]].map(([x, y, z]) => [x, y, z - back])), 0.0065, 0.0055, 0.0065, 0.0055, (p) => norm([p[0] - SK[0], 0, p[2] - SK[2] - 0.05]), 0.004);
  }
}
const SKULL_SUB = [];

/** What is cut out of the bones (the sockets of the hip and the eyes, the nose's opening, the temples' hollows, the
 *  ears' canals), after the bones are laid: [{ bone, s, k, part, op: 'sub' }]. */
export function skeletonCuts() {
  const out = [];
  for (const [bone, s, k] of SKULL_SUB) out.push({ bone, s, k, part: PART.bone, op: 'sub', layer: 'bone' });
  SKULL_SUB.length = 0;
  return out;
}
void dot;
