// The body's anatomy (intent 0036): a skeleton's landmarks, the muscles laid from their origin to their insertion over
// it, the bones that show under the skin, a thin skin over all of it. Written for one man, 1.80 m and muscular, in the
// neutral pose (standing, arms down, palms to the thighs, every bone's frame turned like the world's); a body of other
// measures is the same anatomy carried to its own (./body.js). Plain numbers: no mesh, no scan.
//
// Coordinates: metres, from the floor between the feet; x to the person's left, y up, z forwards. A point on the left
// side is written with x > 0; the right side is its mirror.
//
//   anatomyOf(sx) -> { joints: { bone: [x, y, z] }, ops: [{ bone, bone2, s, k, part, body }] }
//     sx: a point of the reference man to the body's own (positions; lengths go by its scale sx.k)
import { ball, egg, rod, box, strand, frame, group, plane } from './field.js';

export const PART = { skin: 0, nail: 7, lip: 8, mouth: 9, teeth: 10, eye: 11, tongue: 12 };
const SIDES = [['L', 1], ['R', -1]];

/** The reference man's joints, left side (the right mirrors them). */
export const JOINTS = {
  root: [0, 0, 0], hips: [0, 0.95, -0.02], spine1: [0, 1.07, -0.065], spine2: [0, 1.2, -0.075], spine3: [0, 1.33, -0.075],
  neck1: [0, 1.495, -0.055], neck2: [0, 1.575, -0.032], head: [0, 1.645, -0.014], jaw: [0, 1.664, 0.012],
  'eye.L': [0.0315, 1.684, 0.07], 'lidUp.L': [0.0315, 1.684, 0.07], 'lidLo.L': [0.0315, 1.684, 0.07],
  'clavicle.L': [0.024, 1.468, 0.048], 'upperArm.L': [0.182, 1.44, -0.022], 'foreArm.L': [0.205, 1.11, -0.048], 'hand.L': [0.226, 0.855, -0.012],
  'thigh.L': [0.088, 0.925, 0.0], 'shin.L': [0.084, 0.505, 0.012], 'foot.L': [0.077, 0.082, -0.018], 'toes.L': [0.094, 0.024, 0.118],
};
export const PARENT = { hips: 'root', spine1: 'hips', spine2: 'spine1', spine3: 'spine2', neck1: 'spine3', neck2: 'neck1', head: 'neck2', jaw: 'head' };
for (const s of ['L', 'R']) Object.assign(PARENT, {
  ['eye.' + s]: 'head', ['lidUp.' + s]: 'head', ['lidLo.' + s]: 'head', ['clavicle.' + s]: 'spine3', ['upperArm.' + s]: 'clavicle.' + s,
  ['upperArmTwist.' + s]: 'upperArm.' + s, ['foreArm.' + s]: 'upperArm.' + s, ['foreArmTwist.' + s]: 'foreArm.' + s, ['hand.' + s]: 'foreArm.' + s,
  ['thigh.' + s]: 'hips', ['thighTwist.' + s]: 'thigh.' + s, ['shin.' + s]: 'thigh.' + s, ['foot.' + s]: 'shin.' + s, ['toes.' + s]: 'foot.' + s,
});

// the hand, in its own frame: a down the fingers, b across to the thumb, c out of its back (metres, left hand)
const HAND = {
  knuckles: { index: [0.098, 0.029, 0.004], middle: [0.1, 0.008, 0.005], ring: [0.096, -0.013, 0.004], little: [0.088, -0.032, 0.002] },
  lengths: { index: 0.072, middle: 0.08, ring: 0.076, little: 0.06 }, phalanges: [0.5, 0.3, 0.2],
  widths: { index: 0.0092, middle: 0.0096, ring: 0.009, little: 0.008, thumb: 0.0105 },   // half-width at the first joint
  thumb: { root: [0.026, 0.026, -0.006], dir: [0.62, 0.62, -0.48], lengths: [0.044, 0.032, 0.028] },
};
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'];

/** The finger joints of a hand (left, mirrored for the right) in the neutral pose: { name: [x, y, z] }, tips too. */
export function fingerJoints(wrist, sg) {
  const at = (a, b, c) => [wrist[0] + sg * c, wrist[1] - a, wrist[2] + b], out = {};
  for (const f of ['index', 'middle', 'ring', 'little']) {
    const [a, b, c] = HAND.knuckles[f], L = HAND.lengths[f];
    let d = 0; for (let j = 0; j < 3; j++) { out[`${f}${j + 1}`] = at(a + d, b, c); d += L * HAND.phalanges[j]; }
    out[`${f}Tip`] = at(a + d, b, c);
  }
  const T = HAND.thumb, n = Math.hypot(...T.dir), dir = T.dir.map((v) => v / n); let p = T.root;
  for (let j = 0; j < 3; j++) { out[`thumb${j + 1}`] = at(...p); p = p.map((v, i) => v + dir[i] * T.lengths[j]); }
  out.thumbTip = at(...p);
  return out;
}

/**
 * The anatomy as ops, in the neutral pose, for a body whose reference points are carried by X (a point of the reference
 * man to the body's; lengths by X.k, the body's scale, and the muscles' bulk by X.mus).
 */
export function anatomyOf(X) {
  const ops = [], k1 = X.k, mus = X.mus ?? 1, fat = X.fat ?? 0.4;
  const put = (bone, s, k, extra = {}) => ops.push({ bone, s, k: k * k1, part: PART.skin, body: true, ...extra });
  const L = (v) => v * k1, M = (v) => v * k1 * mus;
  for (const [s, sg] of SIDES) {
    const P = (x, y, z) => X([sg * x, y, z]), out = (x, y, z) => { const l = Math.hypot(x, y, z); return [sg * x / l, y / l, z / l]; };
    // a muscle: from a point on one bone to a point on another, its depth facing `o` (outwards)
    const mu = (b1, a, b2, b, o, opt, k = 0.012) => put(b1, strand(a, b, { ...opt, w: M(opt.w), d: M(opt.d), t0: (opt.t0 ?? [opt.w * 0.3, opt.d * 0.3]).map(M), t1: (opt.t1 ?? [opt.w * 0.3, opt.d * 0.3]).map(M), bend: L(opt.bend ?? 0), out: out(...o) }), k, { bone2: b2 });
    const B = (n) => n + '.' + s;
    // ── the chest: the great chest muscle in three bands, fanning from the collarbone and breastbone to the arm
    mu('clavicle.' + s, P(0.05, 1.462, 0.07), B('upperArm'), P(0.175, 1.39, 0.018), [0.1, 0.6, 1], { w: 0.026, d: 0.016, belly: 0.4, bend: 0.006 });
    mu('spine3', P(0.018, 1.405, 0.1), B('upperArm'), P(0.172, 1.383, 0.022), [0, 0.1, 1], { w: 0.038, d: 0.024, belly: 0.42, bend: 0.012, t0: [0.02, 0.01] });
    mu('spine3', P(0.03, 1.3, 0.112), B('upperArm'), P(0.168, 1.375, 0.018), [0.15, -0.3, 1], { w: 0.034, d: 0.022, belly: 0.38, bend: 0.01, t0: [0.02, 0.012] });
    // the six packets of the belly's straight muscle, either side of the white line, and below them the lower belly
    [[1.232, 1.168, 'spine2'], [1.158, 1.096, 'spine1'], [1.086, 1.03, 'spine1']].forEach(([y0, y1, b]) =>
      mu(b, P(0.031, y0, 0.11 - (1.23 - y0) * 0.05), b, P(0.031, y1, 0.112 - (1.23 - y1) * 0.06), [0, 0, 1], { w: 0.027, d: 0.011, t0: [0.025, 0.006], t1: [0.025, 0.006], full: 0.5 }, 0.006));
    mu('hips', P(0.028, 1.02, 0.106), 'hips', P(0.018, 0.905, 0.078), [0, -0.2, 1], { w: 0.03, d: 0.012, t1: [0.014, 0.006], belly: 0.3 }, 0.01);
    // the flank: the oblique over the hip bone, the saw-toothed muscle on the ribs under the arm
    mu('spine1', P(0.128, 1.19, 0.05), 'hips', P(0.135, 1.04, 0.025), [1, 0, 0.3], { w: 0.04, d: 0.024, belly: 0.6, full: 0.7 }, 0.016);
    mu('spine2', P(0.12, 1.24, 0.085), 'spine1', P(0.09, 1.07, 0.1), [0.5, 0, 1], { w: 0.03, d: 0.012 }, 0.014);
    for (const [y, z] of [[1.33, 0.072], [1.295, 0.075], [1.26, 0.074], [1.225, 0.07]]) mu('spine3', P(0.112, y, z), B('clavicle'), P(0.145, y + 0.045, -0.04), [1, 0, 0.4], { w: 0.011, d: 0.006, belly: 0.35 }, 0.006);
    // ── the back: the broad back muscle from the spine and the hip to the arm, wrapping the ribs; the long muscles beside
    // the spine; the trapezius in three parts; the muscles on the shoulder blade
    mu('spine2', P(0.03, 1.3, -0.118), B('upperArm'), P(0.15, 1.385, -0.04), [0.3, 0, -1], { w: 0.05, d: 0.016, belly: 0.55, bend: 0.012, t1: [0.015, 0.008] }, 0.016);
    mu('spine1', P(0.04, 1.14, -0.112), B('upperArm'), P(0.152, 1.378, -0.036), [0.7, 0, -1], { w: 0.055, d: 0.02, belly: 0.6, bend: 0.025, t1: [0.014, 0.008] }, 0.016);
    mu('hips', P(0.11, 1.055, -0.06), B('upperArm'), P(0.155, 1.372, -0.03), [1, 0, -0.5], { w: 0.04, d: 0.018, belly: 0.55, bend: 0.03, t1: [0.012, 0.008] }, 0.016);
    mu('hips', P(0.032, 0.99, -0.112), 'spine3', P(0.034, 1.36, -0.118), [0, 0, -1], { w: 0.026, d: 0.026, belly: 0.3, t1: [0.014, 0.008] }, 0.012);
    mu('head', P(0.012, 1.62, -0.07), B('clavicle'), P(0.165, 1.484, -0.018), [0.4, 1, -0.6], { w: 0.03, d: 0.022, belly: 0.45, bend: 0.01 }, 0.016);
    mu('neck1', P(0.01, 1.505, -0.098), B('clavicle'), P(0.15, 1.468, -0.062), [0, 0.5, -1], { w: 0.04, d: 0.012 }, 0.012);
    mu('spine2', P(0.008, 1.22, -0.118), B('clavicle'), P(0.075, 1.43, -0.118), [0, 0, -1], { w: 0.04, d: 0.009, t0: [0.006, 0.004] }, 0.012);
    mu(B('clavicle'), P(0.085, 1.4, -0.122), B('upperArm'), P(0.17, 1.425, -0.058), [0.2, 0, -1], { w: 0.034, d: 0.013, belly: 0.4 }, 0.012);
    mu(B('clavicle'), P(0.095, 1.31, -0.112), B('upperArm'), P(0.155, 1.392, -0.035), [0.5, -0.3, -1], { w: 0.02, d: 0.016 }, 0.012);
    // ── the shoulder: the deltoid in three heads over the joint, from the collarbone, the shoulder's tip and the blade
    mu(B('clavicle'), P(0.145, 1.472, 0.035), B('upperArm'), P(0.212, 1.3, -0.006), [0.6, 0.2, 1], { w: 0.026, d: 0.02, belly: 0.4, bend: 0.012 }, 0.012);
    mu(B('clavicle'), P(0.195, 1.48, -0.018), B('upperArm'), P(0.218, 1.305, -0.014), [1, 0.3, 0], { w: 0.028, d: 0.022, belly: 0.38, bend: 0.016 }, 0.012);
    mu(B('clavicle'), P(0.165, 1.465, -0.07), B('upperArm'), P(0.212, 1.305, -0.022), [0.6, 0.2, -1], { w: 0.026, d: 0.018, belly: 0.4, bend: 0.01 }, 0.012);
    // ── the arm: biceps and the brachialis beside it; the triceps' long and outer heads; the forearm's three masses
    mu(B('upperArm'), P(0.172, 1.375, 0.004), B('foreArm'), P(0.208, 1.085, 0.004), [0, 0, 1], { w: 0.021, d: 0.024, belly: 0.56, full: 0.75, t1: [0.008, 0.006] }, 0.01);
    mu(B('upperArm'), P(0.214, 1.26, -0.012), B('foreArm'), P(0.213, 1.085, -0.012), [1, 0, 0.3], { w: 0.016, d: 0.012, belly: 0.55 }, 0.01);
    mu(B('upperArm'), P(0.17, 1.39, -0.052), B('foreArm'), P(0.206, 1.13, -0.078), [-0.2, 0, -1], { w: 0.021, d: 0.022, belly: 0.4, t1: [0.016, 0.006] }, 0.01);
    mu(B('upperArm'), P(0.214, 1.36, -0.04), B('foreArm'), P(0.212, 1.14, -0.074), [1, 0, -0.8], { w: 0.019, d: 0.018, belly: 0.42, t1: [0.014, 0.005] }, 0.01);
    mu(B('upperArm'), P(0.226, 1.18, -0.022), B('foreArmTwist'), P(0.24, 0.875, 0.008), [1, 0, 0.6], { w: 0.019, d: 0.018, belly: 0.25, t1: [0.006, 0.004] }, 0.01);
    mu(B('upperArm'), P(0.232, 1.115, -0.05), B('foreArmTwist'), P(0.23, 0.875, -0.025), [1, 0, -0.5], { w: 0.019, d: 0.012, belly: 0.3, t1: [0.009, 0.004] }, 0.01);
    mu(B('upperArm'), P(0.176, 1.112, -0.045), B('foreArmTwist'), P(0.212, 0.875, 0.008), [-0.6, 0, 0.6], { w: 0.022, d: 0.016, belly: 0.3, t1: [0.012, 0.005] }, 0.01);
    // ── the hip and the thigh: the gluteus over the seat and its middle part on the side; the four of the quadriceps
    // (the inner one a drop over the knee); the strap across the thigh; the inner thigh; the hamstrings
    mu('hips', P(0.035, 1.025, -0.112), B('thigh'), P(0.142, 0.84, -0.03), [0.4, -0.1, -1], { w: 0.06, d: 0.042, belly: 0.45, full: 0.7, bend: 0.018 }, 0.018);
    mu('hips', P(0.025, 0.95, -0.098), B('thigh'), P(0.13, 0.82, -0.04), [0.2, -0.4, -1], { w: 0.045, d: 0.034, belly: 0.4, full: 0.7, bend: 0.012 }, 0.018);
    mu('hips', P(0.138, 1.055, -0.025), B('thigh'), P(0.152, 0.925, 0.002), [1, 0.2, 0], { w: 0.036, d: 0.02, belly: 0.45 }, 0.016);
    mu('hips', P(0.112, 1.0, 0.065), B('thigh'), P(0.152, 0.86, 0.03), [0.8, 0, 1], { w: 0.016, d: 0.014, belly: 0.4 }, 0.012);
    mu('hips', P(0.1, 0.975, 0.062), 'shin.' + s, P(0.087, 0.57, 0.062), [0, 0, 1], { w: 0.028, d: 0.026, belly: 0.45, t1: [0.016, 0.006] }, 0.012);
    mu(B('thigh'), P(0.142, 0.89, 0.018), 'shin.' + s, P(0.112, 0.565, 0.04), [1, 0, 0.3], { w: 0.034, d: 0.03, belly: 0.5, bend: 0.012, t1: [0.014, 0.006] }, 0.014);
    mu(B('thigh'), P(0.06, 0.78, 0.028), 'shin.' + s, P(0.062, 0.55, 0.05), [-0.6, 0, 1], { w: 0.026, d: 0.026, belly: 0.72, full: 0.8, t1: [0.012, 0.006] }, 0.012);
    mu('hips', P(0.112, 1.0, 0.066), 'shin.' + s, P(0.052, 0.49, -0.012), [-0.2, 0, 1], { w: 0.012, d: 0.006, bend: 0.008 }, 0.008);
    mu('hips', P(0.028, 0.885, 0.04), B('thigh'), P(0.066, 0.62, 0.0), [-1, 0, 0.2], { w: 0.034, d: 0.03, belly: 0.35 }, 0.016);
    mu('hips', P(0.06, 0.875, -0.056), 'shin.' + s, P(0.12, 0.49, -0.03), [0.5, 0, -1], { w: 0.022, d: 0.024, belly: 0.5, t1: [0.008, 0.006] }, 0.012);
    mu('hips', P(0.048, 0.875, -0.056), 'shin.' + s, P(0.058, 0.48, -0.028), [-0.4, 0, -1], { w: 0.026, d: 0.026, belly: 0.5, t1: [0.008, 0.006] }, 0.012);
    // ── the lower leg: the calf's two heads (the inner lower) over the soleus, the shin's muscle, the outer pair, the
    // tendon to the heel
    mu(B('thigh'), P(0.066, 0.53, -0.04), 'shin.' + s, P(0.074, 0.19, -0.055), [-0.4, 0, -1], { w: 0.028, d: 0.03, belly: 0.3, full: 0.8, bend: 0.006, t1: [0.009, 0.004] }, 0.012);
    mu(B('thigh'), P(0.104, 0.53, -0.04), 'shin.' + s, P(0.084, 0.24, -0.052), [0.5, 0, -1], { w: 0.024, d: 0.024, belly: 0.28, full: 0.8, t1: [0.008, 0.004] }, 0.012);
    mu('shin.' + s, P(0.085, 0.43, -0.03), 'shin.' + s, P(0.076, 0.12, -0.05), [0, 0, -1], { w: 0.036, d: 0.02, belly: 0.5, t1: [0.009, 0.005] }, 0.014);
    mu('shin.' + s, P(0.1, 0.45, 0.028), 'foot.' + s, P(0.068, 0.095, 0.045), [0.6, 0, 1], { w: 0.017, d: 0.016, belly: 0.28, t1: [0.004, 0.003] }, 0.01);
    mu('shin.' + s, P(0.118, 0.45, -0.008), 'shin.' + s, P(0.104, 0.105, -0.034), [1, 0, 0], { w: 0.014, d: 0.012, belly: 0.3, t1: [0.004, 0.003] }, 0.01);
    put('shin.' + s, rod(P(0.075, 0.2, -0.055), P(0.072, 0.045, -0.072), L(0.0065), L(0.0085)), 0.008);
    // ── the bones that show: collarbone, the shoulder's tip, the blade's spine, the elbow, the ulna along the forearm,
    // the wrist's knobs, the hip bone's front, the knee (cap, its tendon, the bumps either side), the shin bone, the ankle
    put(B('clavicle'), rod(P(0.024, 1.468, 0.058), P(0.09, 1.474, 0.058), L(0.0085), L(0.0075)), 0.008);
    put(B('clavicle'), rod(P(0.09, 1.474, 0.058), P(0.188, 1.484, -0.012), L(0.0075), L(0.0085)), 0.008);
    put(B('clavicle'), ball(P(0.196, 1.478, -0.022), L(0.012)), 0.01);
    put(B('clavicle'), rod(P(0.072, 1.432, -0.118), P(0.19, 1.476, -0.04), L(0.006), L(0.008)), 0.008);
    put(B('clavicle'), box(P(0.1, 1.38, -0.112), [L(0.045), L(0.075), L(0.007)], L(0.006), frame([sg * 1, 0, -sg * 0.35], [0, 1, 0])), 0.016);
    put(B('foreArm'), ball(P(0.206, 1.12, -0.072), L(0.011)), 0.01);
    put(B('upperArm'), ball(P(0.23, 1.115, -0.05), L(0.009)), 0.01);
    put(B('upperArm'), ball(P(0.177, 1.112, -0.052), L(0.009)), 0.01);
    put(B('foreArm'), rod(P(0.206, 1.11, -0.07), P(0.21, 0.88, -0.03), L(0.009), L(0.0085)), 0.012);
    put(B('foreArm'), rod(P(0.226, 1.07, -0.03), P(0.236, 0.88, 0.002), L(0.01), L(0.012)), 0.014);
    put(B('foreArmTwist'), egg(P(0.224, 0.868, -0.012), [L(0.016), L(0.014), L(0.024)]), 0.012);
    put(B('foreArmTwist'), ball(P(0.208, 0.868, -0.034), L(0.0065)), 0.006);
    put('hips', ball(P(0.112, 1.005, 0.07), L(0.012)), 0.012);
    put('hips', rod(P(0.112, 1.005, 0.068), P(0.142, 1.06, -0.005), L(0.012), L(0.014)), 0.016);
    put('hips', rod(P(0.142, 1.06, -0.005), P(0.085, 1.065, -0.09), L(0.014), L(0.014)), 0.016);
    put(B('thigh'), egg(P(0.148, 0.925, 0.0), [L(0.022), L(0.03), L(0.03)]), 0.016);
    put('shin.' + s, egg(P(0.087, 0.528, 0.058), [L(0.022), L(0.026), L(0.012)]), 0.008);
    put('shin.' + s, rod(P(0.087, 0.51, 0.06), P(0.085, 0.455, 0.05), L(0.009), L(0.011)), 0.008);
    for (const x of [0.054, 0.118]) put(B('thigh'), egg(P(x, 0.52, 0.006), [L(0.02), L(0.028), L(0.034)]), 0.014);
    put('shin.' + s, egg(P(0.085, 0.47, 0.012), [L(0.042), L(0.03), L(0.04)]), 0.016);
    put('shin.' + s, ball(P(0.12, 0.47, -0.012), L(0.011)), 0.01);
    put('shin.' + s, rod(P(0.084, 0.455, 0.048), P(0.056, 0.1, 0.0), L(0.012), L(0.011)), 0.012);
    put('shin.' + s, rod(P(0.1, 0.44, -0.01), P(0.098, 0.1, -0.03), L(0.012), L(0.012)), 0.014);
    put('shin.' + s, ball(P(0.054, 0.088, -0.004), L(0.012)), 0.01);
    put('shin.' + s, ball(P(0.103, 0.074, -0.03), L(0.011)), 0.01);
    hand(X, s, sg, put, L);
    foot(X, s, sg, put, L);
  }
  // ── the trunk's frame: the ribcage, the breastbone, the pelvis, the sacrum, the spine's knob at the neck's root; the
  // neck's column, the muscle from behind the ear to the breastbone, the larynx
  const P = (x, y, z) => X([x, y, z]);
  put('spine2', egg(P(0, 1.215, -0.008), [L(0.142), L(0.12), L(0.108)]), 0.03);
  put('spine3', egg(P(0, 1.35, -0.018), [L(0.132), L(0.13), L(0.104)]), 0.03);
  put('spine3', box(P(0, 1.36, 0.098), [L(0.018), L(0.1), L(0.008)], L(0.008), frame([1, 0, 0], [0, 1, 0.12])), 0.02);
  put('spine1', egg(P(0, 1.08, -0.008), [L(0.122), L(0.1), L(0.095)]), 0.03);
  put('hips', egg(P(0, 0.985, -0.012), [L(0.135), L(0.085), L(0.1)]), 0.03);
  put('hips', box(P(0, 0.985, -0.1), [L(0.045), L(0.05), L(0.012)], L(0.012), frame([1, 0, 0], [0, 1, -0.35])), 0.02);
  put('neck1', ball(P(0, 1.515, -0.088), L(0.012)), 0.012);
  put('neck1', rod(P(0, 1.47, -0.008), P(0, 1.6, -0.012), L(0.052), L(0.05)), 0.02);
  for (const [s, sg] of SIDES) put('neck2', strand(P(sg * 0.048, 1.655, -0.02), P(sg * 0.016, 1.466, 0.062), { w: L(0.014), d: L(0.011), t0: [L(0.008), L(0.006)], t1: [L(0.008), L(0.006)], out: [sg * 0.6, 0, 0.8] }), 0.012, { bone2: 'spine3' });
  put('neck1', egg(P(0, 1.535, 0.042), [L(0.012), L(0.016), L(0.01)]), 0.01);
  put('neck1', ball(P(0, 1.468, 0.07), L(0.011)), 0.012, { op: 'sub', body: false });   // the notch over the breastbone
  head(X, put, L);
  return { ops, fat };
}

/** The hand: the palm, the balls of the thumb and of the little finger, the knuckles, three bones a finger, the thumb's
 *  two and its long one in the palm, the pads, the nails. */
function hand(X, s, sg, put, L) {
  const w0 = JOINTS['hand.L'], at = (a, b, c) => X([sg * (w0[0] + c), w0[1] - a, w0[2] + b]), J = fingerJoints([w0[0] * sg, w0[1], w0[2]], sg);
  const hb = 'hand.' + s, back = [sg, 0, 0], palmF = frame([0, 0, 1], [0, -1, 0]);
  put(hb, box(at(0.055, 0.0, -0.002), [L(0.012), L(0.042), L(0.039)], L(0.008), frame([sg, 0, 0], [0, -1, 0])), 0.012);
  put(hb, egg(at(0.035, 0.022, -0.014), [L(0.022), L(0.016), L(0.016)], frame([0, -0.6, 0.8], [sg * 0.2, 0.8, 0.6])), 0.012);
  put(hb, egg(at(0.06, -0.03, -0.01), [L(0.026), L(0.012), L(0.012)], palmF), 0.012);
  put(hb, egg(at(0.012, 0.0, -0.002), [L(0.018), L(0.03), L(0.016)]), 0.012);
  for (const f of ['index', 'middle', 'ring', 'little']) put(hb, ball(add(J[`${f}1`], [sg * 0.007, 0.004, 0]), L(0.0085)), 0.008);
  for (const f of FINGERS) {
    const w = HAND.widths[f], pts = [1, 2, 3].map((j) => J[`${f}${j}`]).concat([J[`${f}Tip`]]).map((p) => X(p));
    for (let j = 0; j < 3; j++) {
      const r0 = L(w * [1, 0.88, 0.8][j]), r1 = L(w * [0.88, 0.8, 0.72][j]), bn = `${f}${j + 1}.${s}`;
      put(bn, strand(pts[j], pts[j + 1], { w: r0, d: r0 * 0.88, t0: [r0 * 0.95, r0 * 0.82], t1: [r1, r1 * 0.85], full: 0.4, out: f === 'thumb' ? [sg * 0.6, 0, 0.8] : back }), 0.004);
      if (j < 2) put(bn, ball(add(pts[j + 1], [sg * L(0.002), 0, 0]), r1 * 1.02), 0.003);
    }
    const tip = pts[3], d3 = pts[2], ax = norm(sub(tip, d3)), bk = f === 'thumb' ? norm([sg * 0.6, 0, 0.8]) : back;
    const side = norm(cross(ax, bk)), len = Math.hypot(...sub(tip, d3)), w3 = L(w * 0.76);
    put(`${f}3.${s}`, egg(add(lerp(d3, tip, 0.62), mul(bk, -w3 * 0.2)), [w3 * 1.02, len * 0.42, w3 * 0.86], frame(side, ax)), 0.003);   // the pad
    put(`${f}3.${s}`, box(add(lerp(d3, tip, 0.64), mul(bk, w3 * 0.78)), [w3 * 0.72, len * 0.36, L(0.0006)], L(0.0016), frame(side, ax)), 0.0012, { part: PART.nail });
  }
}

/** The foot: the heel, the arch (high inside, on the ground outside), the ball, five toes with their nails. */
function foot(X, s, sg, put, L) {
  const P = (x, y, z) => X([sg * x, y, z]), f = 'foot.' + s, t = 'toes.' + s, side = [sg, 0, 0], up = [0, 1, 0];
  put(f, egg(P(0.073, 0.036, -0.058), [L(0.03), L(0.034), L(0.04)]), 0.014);
  put(f, strand(P(0.074, 0.06, -0.03), P(0.09, 0.03, 0.105), { w: L(0.03), d: L(0.026), t0: [L(0.026), L(0.026)], t1: [L(0.04), L(0.018)], out: up }), 0.016);
  put(f, strand(P(0.1, 0.022, -0.04), P(0.118, 0.018, 0.1), { w: L(0.014), d: L(0.016), out: side }), 0.012);
  put(f, egg(P(0.093, 0.022, 0.112), [L(0.046), L(0.02), L(0.024)], frame([1, 0, -0.12 * sg], up)), 0.012);
  const toes = [[0.066, 0.05, 0.012], [0.088, 0.043, 0.0085], [0.103, 0.038, 0.008], [0.116, 0.032, 0.0075], [0.128, 0.026, 0.007]];
  toes.forEach(([x, len, r], i) => {
    const a = P(x, 0.02, 0.122 - i * 0.006), b = P(x + 0.004, 0.015, 0.122 - i * 0.006 + len);
    put(t, strand(a, b, { w: L(r), d: L(r * 0.85), t0: [L(r), L(r * 0.85)], t1: [L(r * 0.92), L(r * 0.75)], full: 0.4, out: up }), 0.004);
    put(t, box(add(lerp(a, b, 0.8), [0, L(r * 0.72), 0]), [L(r * 0.7), L(0.0006), L(len * 0.16)], L(0.0012)), 0.001, { part: PART.nail });
  });
}

/** The head (to be rebuilt from the skull up): its vault, the face, the jaw. */
function head(X, put, L) {
  const P = (x, y, z) => X([x, y, z]);
  put('head', egg(P(0, 1.72, -0.012), [L(0.076), L(0.095), L(0.1)]), 0.02);
  put('head', egg(P(0, 1.66, 0.04), [L(0.06), L(0.07), L(0.055)]), 0.03);
  put('jaw', egg(P(0, 1.6, 0.04), [L(0.05), L(0.045), L(0.05)]), 0.03);
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); }, lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
void plane; void group;
