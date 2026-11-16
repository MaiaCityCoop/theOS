// The skeleton's shoulder and arm (intent 0033): the collarbone, the shoulder blade, the humerus, the ulna and the
// radius, each a bone of its own, written once for the left side with the kit (./kit.js). Every bone is laid between the
// rig's joints (./rig.js: where the collarbone meets the breastbone, the shoulder, the elbow, the wrist), so it follows
// them if they are moved. Shapes and proportions from Gray's Anatomy (1918), plates 200–213, and its text.
//
// The pose: arms down, palms to the thighs, thumbs forwards. The forearm is then half turned: at the elbow the radius
// lies outside the ulna, at the wrist in front of it.
import { add, sub, mul, dot, norm, cross, spline } from './kit.js';
import { JOINTS } from './rig.js';

const rad = (d) => (d * Math.PI) / 180;
/** A band along a curve as one solid: its section [wide, thick] from one end to the other, its thickness facing `out`.
 *  (Its links are joined with almost no blend, so they do not swell where they overlap.) */
const band = (K, pts, s0, s1, out) => K.group(pts.slice(1).map((p, i) => {
  const n = pts.length - 1, t0 = i / n, t1 = (i + 1) / n, wa = s0[0] + (s1[0] - s0[0]) * t0, wb = s0[0] + (s1[0] - s0[0]) * t1, da = s0[1] + (s1[1] - s0[1]) * t0, db = s0[1] + (s1[1] - s0[1]) * t1;
  return { op: 'add', k: 0.0003 * K.s(1), s: K.strand(pts[i], p, { w: (wa + wb) / 2, d: (da + db) / 2, t0: [wa, da], t1: [wb, db], out: typeof out === 'function' ? out(pts[i], p) : out }) };
}));
/** A direction square to a. */
const perp = (a) => norm(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));

/** A frame at o: x, y, z its axes; p(x, y, z) a point in it, d(x, y, z) a direction. */
const frameAt = (o, x, y, z) => ({ o, x, y, z, p: (a, b, c = 0) => [o[0] + x[0] * a + y[0] * b + z[0] * c, o[1] + x[1] * a + y[1] * b + z[1] * c, o[2] + x[2] * a + y[2] * b + z[2] * c], d: (a, b, c = 0) => norm([x[0] * a + y[0] * b + z[0] * c, x[1] * a + y[1] * b + z[1] * c, x[2] * a + y[2] * b + z[2] * c]) });

// ── the shoulder blade's own frame: from the middle of its socket, x along the blade out to the socket, y up the blade,
// z out of its front (the side that faces the ribs). In the body the blade stands 35° forwards of the frontal plane, its
// top tipped 12° forwards, its socket facing level: its inner border 7.5 cm from the spine at the root of its own spine,
// its lower angle 10 cm, its front 1 cm off the ribs where it lies nearest (along the inner border, over ribs 5 and 6).
// The blade's measures: 16 cm from its upper angle to its lower, 10.5 cm from the socket to its inner border ─────────
const HEAD_R = 0.0235;                    // the humerus' ball
const HEAD_IN_BLADE = [0.0224, 0.001, -0.001];   // its middle, from the socket's
const BLADE_TURN = [35, 12, 0];   // degrees: forwards of the frontal plane, its top tipped forwards, its socket turned up
export function bladeFrame(S = JOINTS['upperArm.L'], turn = BLADE_TURN) {
  const th = rad(turn[0]), tilt = rad(turn[1]), up = rad(turn[2]);
  let X = [Math.cos(th), 0, Math.sin(th)], Y = [0, 1, 0], Z = cross(X, Y);
  Y = norm(add(mul(Y, Math.cos(tilt)), mul(Z, Math.sin(tilt)))); Z = cross(X, Y);
  const X2 = norm(add(mul(X, Math.cos(up)), mul(Y, Math.sin(up)))); Y = norm(add(mul(X, -Math.sin(up)), mul(Y, Math.cos(up)))); X = X2;
  const h = HEAD_IN_BLADE, o = sub(S, add(add(mul(X, h[0]), mul(Y, h[1])), mul(Z, h[2])));
  return frameAt(o, X, Y, Z);
}
// the blade's sheet: its middle, and how far it bows backwards there (its front is hollow)
const BLADE_C = [-0.052, -0.022], BLADE_BEND = [2.3, 0.75, 0], BLADE_Z0 = -0.0075;
export const bladeZ = (x, y) => BLADE_Z0 + BLADE_BEND[0] * (x - BLADE_C[0]) ** 2 + BLADE_BEND[1] * (y - BLADE_C[1]) ** 2;

// where things are on these bones, in their own frames (the bones below and the rig's joints read the same numbers)
const AC = [0.0165, 0.0445, 0.0085];          // the collarbone's outer end on the acromion, in the blade's frame
const HINGE = [1, 0.1, 0];                    // the elbow's hinge in the humerus' frame, its inner end a little lower
const RADIAL_HEAD = [0.0165, -0.0158, 0.0045];                    // the middle of the radius' head, in the forearm's frame
const ulnarHead = (L) => [0.002, -L + 0.0078, -0.018];           // the middle of the ulna's head (L: elbow to wrist)

/** The left arm's own frames, standing: the blade's; the humerus' (from the elbow, y up to the middle of its ball, x
 *  outwards along the elbow, z forwards); the forearm's (from the elbow, y up, the wrist at -Lf, x outwards, z forwards). */
function armFrames() {
  const S = JOINTS['upperArm.L'], E = JOINTS['foreArm.L'], W = JOINTS['hand.L'];
  const hy = norm(sub(S, E)), hx = norm(sub([1, 0, 0], mul(hy, hy[0]))), fy = norm(sub(E, W)), fx = norm(sub([1, 0, 0], mul(fy, fy[0])));
  return { B: bladeFrame(S), H: frameAt(E, hx, hy, cross(hx, hy)), Lh: Math.hypot(...sub(S, E)), F: frameAt(E, fx, fy, cross(fx, fy)), Lf: Math.hypot(...sub(E, W)) };
}
/** The points of the left arm a rig turns its bones about: where the collarbone meets the acromion, the elbow's hinge,
 *  the middles of the radius' head and of the ulna's (the forearm turns about the line through them). */
export function armPoints() {
  const { B, H, F, Lf } = armFrames();
  return { ac: B.p(...AC), elbowAxis: H.d(...HINGE), radialHead: F.p(...RADIAL_HEAD), ulnarHead: F.p(...ulnarHead(Lf)) };
}

export function arm(K) {
  K.pair((side) => {
    const { B, H, Lh, F, Lf } = armFrames();
    scapula(K, side, B);
    clavicle(K, side, B, JOINTS['clavicle.L']);
    humerus(K, side, H, Lh);
    forearm(K, side, H, F, Lf);
  });
}

// ── the shoulder blade (Gray 202, 203): a thin three-cornered blade, hollow in front, thick along its outer border; its
// spine rising across the back to the acromion, the flat hook over the joint; the coracoid, a bent finger forwards; the
// shallow pear-shaped socket ─────────────────────────────────────────────────────────────────────────────────────────
function scapula(K, side, B) {
  K.bone('scapula.' + side, 'clavicle.' + side);
  const bp = (x, y, dz = 0) => B.p(x, y, bladeZ(x, y) + dz);   // a point on the blade's sheet (dz: off it, forwards)
  // the blade, by its outline (from the socket's neck over the top, down the inner border, round the lower angle, up
  // the outer border), measured from its middle
  const O = [[-0.014, 0.026], [-0.026, 0.033], [-0.034, 0.0335], [-0.044, 0.041], [-0.06, 0.047], [-0.08, 0.0535], [-0.095, 0.034], [-0.104, 0.01], [-0.1035, -0.025], [-0.099, -0.065],
    [-0.0895, -0.105], [-0.082, -0.1095], [-0.071, -0.099], [-0.057, -0.075], [-0.034, -0.045], [-0.016, -0.024], [-0.006, -0.012], [-0.008, 0.012]].map(([x, y]) => [x - BLADE_C[0], y - BLADE_C[1]]);
  K.put(K.plate(B.p(BLADE_C[0], BLADE_C[1], BLADE_Z0), [B.x, B.y], O, { tc: 0.0016, te: 0.003, ramp: 0.013, bend: BLADE_BEND, smooth: 3 }), 0.002);
  K.cut(K.ball(bp(-0.0318, 0.0372), 0.0046), 0.001);   // the notch in its upper border, at the coracoid's foot
  // its outer border, a thick rounded bar from under the socket to the lower angle; the lower angle's knob
  K.put(band(K, spline([[-0.005, -0.02], [-0.016, -0.028], [-0.034, -0.048], [-0.056, -0.077], [-0.071, -0.097], [-0.083, -0.106]], 3).map(([x, y]) => bp(x + 0.001, y + 0.001, 0.0008)), [0.0062, 0.0056], [0.0042, 0.0036], B.z), 0.003);
  K.put(K.egg(bp(-0.0845, -0.1035), [0.0072, 0.008, 0.004], [B.x, B.y]), 0.004);
  // the inner border's lip, a little thicker where the spine's root meets it
  K.put(K.egg(bp(-0.1, 0.01), [0.006, 0.014, 0.0042], [B.x, B.y]), 0.005);
  // the neck and the socket: a pear-shaped dish facing out, hollowed to the humerus' ball; the knobs above and below it
  // (the neck: [below, above, front, back] from the socket in to the blade, thinning as it goes)
  K.put(K.loft(B.p(-0.003, 0, -0.0005), B.p(-0.038, 0.001, bladeZ(-0.038, 0.001)), [[0.0188, 0.0184, 0.013, 0.013], [0.0168, 0.0164, 0.0098, 0.01], [0.0158, 0.0154, 0.0074, 0.0078], [0.0158, 0.0154, 0.0056, 0.006], [0.0162, 0.0158, 0.0044, 0.0046], [0.0165, 0.016, 0.0036, 0.0038]].map((k) => [...k, 0, 0, 2, 2]), { out: B.z, round: [0.002, 0.014] }), 0.004);
  const pear = [[0, 0.019], [0.0078, 0.0155], [0.0118, 0.006], [0.0138, -0.005], [0.0108, -0.0148], [0, -0.0192], [-0.0108, -0.0148], [-0.0138, -0.005], [-0.0118, 0.006], [-0.0078, 0.0155]];
  K.put(K.plate(B.p(-0.0028, 0, -0.0005), [B.z, B.y], pear, { tc: 0.0028, te: 0.002, ramp: 0.005, smooth: 3 }), 0.003);
  K.put(K.egg(B.p(-0.003, 0.0205, 0.002), [0.004, 0.0035, 0.004]), 0.003);
  K.put(K.egg(B.p(-0.0055, -0.0215, -0.002), [0.0045, 0.0055, 0.0045]), 0.003);
  K.cut(K.ball(B.p(HEAD_IN_BLADE[0] + 0.0022, HEAD_IN_BLADE[1], HEAD_IN_BLADE[2]), 0.0268), 0.0012);
  // the spine: a three-cornered plate standing out of the back, low at its root on the inner border, high where it
  // leaves the blade for the acromion; its foot follows the blade's bow; its crest a broad flat band, widening outwards
  const root = bp(-0.104, 0.01), su = B.d(0.994, 0.105, 0), sv = B.d(0, 0.15, -0.989);
  const foot = (u) => { const x = -0.104 + 0.994 * u, y = 0.01 + 0.105 * u; return -(bladeZ(x, y) - bladeZ(-0.104, 0.01)) / 0.989 + 0.0006; };   // the blade's sheet under the spine
  const spineO = [[-0.004, foot(0)], [0.012, 0.0035], [0.03, 0.0105], [0.05, 0.02], [0.07, 0.0295], [0.088, 0.036], [0.104, 0.0395], [0.1165, 0.0395], [0.1195, 0.033], [0.112, 0.0235], [0.1005, 0.0135], [0.0935, 0.006],
    [0.091, foot(0.091)], [0.07, foot(0.07)], [0.05, foot(0.05)], [0.03, foot(0.03)], [0.012, foot(0.012)]];
  K.put(K.plate(root, [su, sv], spineO, { tc: 0.0019, te: 0.003, ramp: 0.008, smooth: 3 }), 0.002);
  const sp2 = (u, v) => add(root, add(mul(su, u), mul(sv, v)));
  // [below, above, behind (its flat face), in front, across, backwards, how square behind, in front]
  const crest = [[0.0035, 0.0035, 0.0026, 0.0026, 0, 0, 3, 2], [0.0048, 0.0045, 0.003, 0.003, 0, 0.0012, 3.2, 2], [0.0058, 0.0054, 0.0033, 0.003, 0, 0.003, 3.4, 2], [0.0066, 0.006, 0.0036, 0.003, 0, 0.0048, 3.4, 2],
    [0.0072, 0.0066, 0.0038, 0.003, 0, 0.0055, 3.4, 2], [0.0072, 0.007, 0.0038, 0.003, 0, 0.0045, 3.4, 2], [0.008, 0.0082, 0.0038, 0.0032, 0, 0.0025, 3.4, 2], [0.0095, 0.011, 0.0038, 0.0035, 0, 0.0005, 3.2, 2]];
  const c0 = sp2(0.01, 0.002), c1 = sp2(0.108, 0.0325), cu = norm(sub(c1, c0));
  K.put(K.loft(c0, c1, crest, { out: norm(sub(sv, mul(cu, dot(sv, cu)))), caps: 0.6 }), 0.003);
  // the acromion: a broad flat plate from the spine's end, running forwards (and so outwards from the blade) over the
  // joint and rising to its tip; the collarbone meets its inner edge near the front
  const au = B.d(0.618, 0.299, 0.727), av = norm(sub(B.d(-0.77, 0.06, 0.63), mul(au, dot(B.d(-0.77, 0.06, 0.63), au)))), ac = B.p(0.0171, 0.0363, -0.0125);
  const acO = [[-0.026, -0.012], [-0.012, -0.0138], [0.006, -0.0138], [0.02, -0.0115], [0.027, -0.004], [0.026, 0.006], [0.016, 0.013], [0, 0.0145], [-0.014, 0.014], [-0.026, 0.0105], [-0.029, 0]];
  K.put(K.plate(ac, [au, av], acO, { tc: 0.0037, te: 0.0034, ramp: 0.006, bend: [2, 2.6, 0], smooth: 3 }), 0.005);
  // the coracoid: up from the neck's top, then bent forwards and outwards, flattened from above
  K.put(band(K, spline([[-0.0135, 0.019, 0.002], [-0.0165, 0.0295, 0.0075], [-0.0135, 0.0375, 0.017], [-0.005, 0.0385, 0.028], [0.005, 0.0345, 0.0365], [0.0115, 0.029, 0.041]], 3).map((p) => B.p(...p)), [0.0082, 0.0062], [0.0066, 0.0042], B.y), 0.003);
}

// ── the collarbone (Gray 200, 201): an S from the breastbone to the acromion, its inner two thirds bowed forwards, its
// outer third back; thick and three-sided at the breastbone, round in the middle, flat at the shoulder ────────────────
function clavicle(K, side, B, C0) {
  K.bone('clavicle.' + side, 'clavicle.' + side);
  const end = B.p(...AC);   // on the acromion's inner edge, near its front
  // [above, below, front, back, up, forwards, how square in front, behind] at twelve places along it
  const kn = [[0.0118, 0.0125, 0.0105, 0.0105, 0, 0.001, 2.4, 2.4], [0.0098, 0.0102, 0.0092, 0.0092, 0.0005, 0.0045, 2.2, 2.2], [0.0078, 0.008, 0.0075, 0.0075, 0.001, 0.0085, 2, 2], [0.0067, 0.0069, 0.0067, 0.0067, 0.0015, 0.0115, 2, 2],
    [0.0062, 0.0064, 0.0063, 0.0063, 0.002, 0.0125, 2, 2], [0.006, 0.0061, 0.0062, 0.0062, 0.002, 0.0105, 2, 2], [0.0058, 0.006, 0.0066, 0.0066, 0.002, 0.0055, 2, 2], [0.0056, 0.0058, 0.0076, 0.0076, 0.0015, -0.002, 2.1, 2.1],
    [0.0053, 0.0057, 0.0092, 0.0096, 0.001, -0.0085, 2.3, 2.3], [0.005, 0.0055, 0.0106, 0.011, 0.0005, -0.0105, 2.5, 2.5], [0.0049, 0.0052, 0.011, 0.011, 0, -0.0065, 2.6, 2.6], [0.0047, 0.005, 0.0098, 0.0098, 0, -0.001, 2.4, 2.4]];
  K.put(K.loft(C0, end, kn, { out: [0, 0, 1], caps: 0.45 }), 0.002);
  // the knob underneath where the ligament to the coracoid holds (conoid tubercle), at the back of the outer bend
  const u = norm(sub(end, C0)), at = (t, dy, dz) => add(add(C0, mul(u, t * Math.hypot(...sub(end, C0)))), [0, dy, dz]);
  K.put(K.egg(at(0.77, -0.0045, -0.0165), [0.005, 0.0035, 0.0045]), 0.004);
  // the roughness underneath by the breastbone, where the ligament to the first rib holds
  K.put(K.egg(at(0.1, -0.0085, 0.004), [0.009, 0.004, 0.006]), 0.005);
}

// ── the humerus (Gray 207, 208): the half ball facing in, up and back; the greater tubercle outside it and the lesser in
// front, the groove between them; the shaft round above, three-sided below, flat and wide at the elbow; the inner
// epicondyle standing out, the outer smaller; the spool the ulna hinges on and the ball the radius turns on; the pits
// above them, the deep one behind for the elbow's point ───────────────────────────────────────────────────────────────
function humerus(K, side, H, L) {
  K.bone('humerus.' + side, 'upperArm.' + side);
  // the shaft: [inwards, outwards, front, back, …] at sixteen places from the foot of the elbow's flare (flat and wide
  // between the epicondyles, bent a little forwards) up to under the ball: three-sided below, round above
  const kn = [[0.019, 0.0185, 0.0085, 0.0052, 0, 0.003, 2, 2.2], [0.0296, 0.0248, 0.0075, 0.008, 0, 0.0008, 1.8, 2.5], [0.0172, 0.0166, 0.0085, 0.0084, 0, 0, 1.7, 2.5], [0.0132, 0.013, 0.0096, 0.0092, 0, 0, 1.7, 2.4],
    [0.0118, 0.0118, 0.0103, 0.0098, 0, 0, 1.7, 2.4], [0.011, 0.0111, 0.0109, 0.0103, 0, 0, 1.8, 2.3], [0.0106, 0.0108, 0.0112, 0.0107, 0, 0, 1.9, 2.2], [0.0104, 0.011, 0.0114, 0.011, 0, 0, 2, 2.2],
    [0.0105, 0.0116, 0.0115, 0.0112, 0, 0, 2, 2.1], [0.0106, 0.0115, 0.0115, 0.0113, 0, 0, 2, 2], [0.0109, 0.0112, 0.0116, 0.0114, 0, 0, 2, 2], [0.0113, 0.0113, 0.0118, 0.0116, 0, 0, 2, 2],
    [0.012, 0.0118, 0.0122, 0.012, 0, 0, 2, 2], [0.013, 0.0127, 0.013, 0.0128, 0, 0, 2, 2], [0.0152, 0.015, 0.015, 0.015, 0.0005, 0, 2, 2], [0.0178, 0.0174, 0.0165, 0.0168, 0.001, 0, 2, 2]];
  K.put(K.loft(H.p(0, -0.001, -0.004), H.p(0.009, L - 0.012, 0.002), kn, { out: H.z, caps: 0.4 }), 0.003);
  // the ball, and the shallow groove round its foot (the anatomical neck)
  const ax = H.d(-0.62, 0.7, -0.36);
  K.put(K.ball(H.p(0, L, 0), HEAD_R), 0.004);
  // the greater tubercle (outside, a broad mass, its top below the ball's) and its crest down the shaft; the lesser
  // (in front, a rounded eminence) and its crest
  K.put(K.egg(H.p(0.0188, L - 0.0095, -0.002), [0.0108, 0.0205, 0.0165]), 0.005);
  K.put(K.egg(H.p(0.0045, L - 0.0135, 0.0158), [0.0092, 0.0128, 0.0078]), 0.006);
  K.put(K.strand(H.p(0.0185, L - 0.03, 0.0125), H.p(0.0148, L - 0.085, 0.0098), { w: 0.0032, d: 0.0034, out: H.z }), 0.005);
  K.put(K.strand(H.p(0.0035, L - 0.028, 0.0155), H.p(0.004, L - 0.075, 0.0112), { w: 0.003, d: 0.003, out: H.z }), 0.005);
  K.cut(K.ring(add(H.p(0, L, 0), mul(ax, 0.0035)), 0.0246, 0.0022, [perp(ax), ax]), 0.0015);
  // the groove between the tubercles, running down the front of the shaft
  K.cut(K.rod(H.p(0.0125, L + 0.008, 0.0218), H.p(0.0105, L - 0.08, 0.0172), 0.0042, 0.003), 0.003);
  // the roughness the deltoid holds, on the outside at mid-shaft
  K.put(K.strand(H.p(0.0108, L * 0.53 - 0.03, 0.003), H.p(0.0102, L * 0.53 + 0.03, 0.0025), { w: 0.0078, d: 0.0052, t0: [0.004, 0.003], t1: [0.004, 0.003], out: H.x }), 0.006);
  // the epicondyles: the inner one a blunt knob standing well out and a little back, the outer one smaller
  K.put(K.egg(H.p(-0.0285, 0.0118, -0.0058), [0.0088, 0.0082, 0.0072], [H.d(1, 0.22, 0.25), H.y]), 0.005);
  K.put(K.egg(H.p(0.0245, 0.0108, -0.0042), [0.0058, 0.008, 0.007]), 0.005);
  // the spool the ulna hinges on (trochlea): round the hinge, waisted, its inner rim the larger; the ball beside it for
  // the radius (capitulum), on the front and underside only
  const tx = H.d(...HINGE), tc = H.p(-0.0075, 0, 0.002), tp = (x) => add(tc, mul(tx, x));
  K.put(K.loft(tp(-0.0125), tp(0.0122), [[0.0098, 0.0098, 0.0098], [0.0128, 0.0128, 0.0128], [0.0114, 0.0114, 0.0114], [0.0092, 0.0092, 0.0092], [0.0086, 0.0086, 0.0086], [0.0094, 0.0094, 0.0094], [0.0106, 0.0106, 0.0106], [0.0096, 0.0096, 0.0096]], { out: H.z, caps: 0.3 }), 0.0025);
  K.put(K.ball(H.p(0.0162, -0.0008, 0.0048), 0.0098), 0.0025);
  // the pits: in front for the ulna's beak and the radius' head, behind (deep) for the elbow's point
  K.cut(K.egg(H.p(-0.0075, 0.0195, 0.0062), [0.0085, 0.0072, 0.0062]), 0.003);
  K.cut(K.egg(H.p(0.0148, 0.0185, 0.0064), [0.0062, 0.0052, 0.0048]), 0.003);
  K.cut(K.egg(H.p(-0.004, 0.0188, -0.0138), [0.0125, 0.0092, 0.0102]), 0.003);
}

// ── the forearm (Gray 212–214): the ulna (the elbow's point, the deep notch that grips the spool, the beak in front; its
// three-sided shaft tapering to a small head with a styloid at the wrist) and the radius (a disc of a head, a neck, the
// tuberosity; the shaft bowed away from the ulna with a sharp edge towards it; the wide lower end with its styloid, the
// knob on its back, the notch for the ulna's head) ───────────────────────────────────────────────────────────────────
function forearm(K, side, H, F, L) {
  const troch = H.p(-0.0075, 0, 0.002), rHead = F.p(...RADIAL_HEAD), uHead = F.p(...ulnarHead(L));
  K.bone('ulna.' + side, 'foreArm.' + side);
  // the upper end: the olecranon behind and above the spool (the elbow's point, its top rough and blunt), the beak
  // (coronoid) forwards under it
  // ([out, in, behind (its flat back, under the skin), in front] from the shaft up to its top)
  K.put(K.loft(F.p(-0.0078, -0.012, -0.0148), F.p(-0.0078, 0.0205, -0.0164), [[0.011, 0.011, 0.0102, 0.0102, 0, 0, 2.6, 2], [0.0117, 0.0117, 0.0102, 0.0105, 0, 0, 2.8, 2], [0.0122, 0.0122, 0.0098, 0.0106, 0, 0, 2.8, 2], [0.0116, 0.0116, 0.009, 0.0098, 0, 0, 2.8, 2.2]], { out: F.d(0, 0, -1), caps: 0.3, round: [0, 0.0075] }), 0.004);
  K.put(K.egg(F.p(-0.0082, -0.0162, 0.0008), [0.0108, 0.0088, 0.0138]), 0.005);
  K.put(K.strand(F.p(-0.008, -0.018, 0.0045), F.p(-0.0074, -0.042, -0.0075), { w: 0.0085, d: 0.0058, t0: [0.009, 0.006], t1: [0.007, 0.004], out: F.z }), 0.006);   // its buttress down the front of the shaft
  // the shaft: [back, front, outwards (its sharp edge, to the radius), inwards, …], thick under the notch, tapering
  const kn = [[0.0132, 0.0108, 0.0112, 0.0105, 0.0005, 0, 2, 2.2], [0.0118, 0.0102, 0.0104, 0.0094, 0.001, 0, 1.7, 2.3], [0.0102, 0.009, 0.0096, 0.0084, 0.0016, 0, 1.5, 2.3], [0.009, 0.0078, 0.0088, 0.0075, 0.0018, 0, 1.4, 2.3], [0.008, 0.007, 0.0081, 0.0068, 0.0016, 0, 1.4, 2.3],
    [0.0071, 0.0064, 0.0074, 0.0062, 0.0012, 0, 1.4, 2.3], [0.0064, 0.0059, 0.0067, 0.0057, 0.0008, 0, 1.5, 2.3], [0.0058, 0.0055, 0.0061, 0.0054, 0.0004, 0, 1.6, 2.2], [0.0053, 0.0052, 0.0056, 0.0052, 0, 0, 1.8, 2.1],
    [0.005, 0.005, 0.0052, 0.005, 0, 0, 2, 2], [0.0056, 0.0056, 0.0058, 0.0056, 0, 0, 2, 2]];
  K.put(K.loft(F.p(-0.0078, -0.012, -0.0135), F.p(0.002, -L + 0.014, -0.018), kn, { out: F.x, caps: 0.5 }), 0.004);
  // the notch for the spool, cut round the hinge; the small notch on its outer side for the radius' head
  K.cut(K.egg(troch, [0.03, 0.0122, 0.0122], [H.d(...HINGE), H.y]), 0.0015);
  K.cut(K.ball(rHead, 0.0122), 0.001);
  // the head at the wrist and its styloid, behind and inside
  K.put(K.egg(uHead, [0.0082, 0.0068, 0.0084]), 0.003);
  K.put(K.rod(F.p(-0.0018, -L + 0.0075, -0.0238), F.p(-0.0028, -L - 0.0018, -0.0252), 0.0042, 0.0025), 0.003);

  K.bone('radius.' + side, 'foreArmTwist.' + side);
  // the head: a thick disc, its top dished for the humerus' small ball; the neck under it
  K.put(K.loft(F.p(RADIAL_HEAD[0], -0.0108, RADIAL_HEAD[2]), F.p(0.0163, -0.0212, 0.0046), [[0.0106, 0.0106, 0.0106], [0.0117, 0.0117, 0.0117], [0.0117, 0.0117, 0.0117], [0.0104, 0.0104, 0.0104]], { out: F.z, caps: 0.22 }), 0.0015);
  K.cut(K.ball(F.p(RADIAL_HEAD[0], -0.0108 + 0.0165, RADIAL_HEAD[2]), 0.0182), 0.001);
  // the shaft: [outwards (the wrist's back), inwards (the palm's side), front (the thumb's side), back (to the ulna), …]
  // at sixteen places from the neck to past the wrist: bowed forwards and outwards, away from the ulna, its edge
  // towards the ulna sharp; then widening to the wrist, flat towards the palm
  const rk = [[0.0068, 0.0068, 0.0068, 0.0068, 0, 0, 2, 2], [0.0066, 0.0066, 0.0067, 0.0068, 0.0006, 0.001, 2, 2], [0.007, 0.007, 0.007, 0.008, 0.0014, 0.0022, 2, 1.8], [0.0072, 0.0072, 0.007, 0.0077, 0.0022, 0.0034, 2.1, 1.6],
    [0.0073, 0.0073, 0.007, 0.0077, 0.0028, 0.0044, 2.2, 1.5], [0.0075, 0.0074, 0.0071, 0.0079, 0.0032, 0.005, 2.2, 1.5], [0.0076, 0.0075, 0.0073, 0.0081, 0.0033, 0.0052, 2.2, 1.5], [0.0078, 0.0076, 0.0076, 0.0083, 0.0031, 0.0049, 2.2, 1.5],
    [0.008, 0.0077, 0.008, 0.0086, 0.0027, 0.0042, 2.2, 1.6], [0.0083, 0.0078, 0.0086, 0.009, 0.0021, 0.0033, 2.3, 1.8], [0.0087, 0.0081, 0.0094, 0.0096, 0.0014, 0.0022, 2.4, 2.2], [0.0092, 0.0086, 0.0108, 0.0108, 0.0008, 0.0012, 2.5, 2.4],
    [0.0097, 0.009, 0.0128, 0.0126, 0.0003, 0.0005, 2.6, 2.5], [0.0103, 0.0095, 0.015, 0.0144, 0, 0, 2.8, 2.7], [0.0108, 0.0098, 0.0167, 0.0156, 0, 0, 2.8, 2.8], [0.009, 0.008, 0.016, 0.0152, 0, 0, 2.5, 2.7]];
  K.put(K.loft(F.p(0.0163, -0.021, 0.0046), F.p(0.0003, -L - 0.0105, 0.0092), rk, { out: F.z, caps: 0.3 }), 0.003);
  // the tuberosity the biceps holds, below the neck on the side towards the ulna
  K.put(K.egg(F.p(0.0102, -0.0435, 0.0008), [0.0046, 0.011, 0.0056], [F.d(0.8, 0, 0.6), F.y]), 0.004);
  // the lower end: cut aslant, so that the thumb's side reaches further down as the styloid; hollowed there for the
  // wrist's first row; a knob on its back (Lister's); a shallow notch for the ulna's head
  K.put(K.egg(F.p(0.0108, -L + 0.0125, 0.0105), [0.003, 0.0075, 0.0032]), 0.003);
  // (the slant: from 1.5 mm above the wrist's middle on the ulna's side to 9 mm below it at the styloid's tip, the back
  // edge a little lower than the palm's)
  const sd = F.d(0, -0.312, 0.95), se = F.d(0.995, -0.0995, 0), sn = cross(se, sd);   // along the slant, across it, out of the bone
  K.cut(K.box(add(F.p(0, -L - 0.00375, 0.009), mul(sn, 0.02)), [0.03, 0.02, 0.045], 0, [se, sn]), 0.0018);
  K.cut(K.egg(add(F.p(0, -L - 0.0025, 0.0065), mul(sn, 0.0142)), [0.0125, 0.0162, 0.0165], [se, sn]), 0.002);
  K.cut(K.ball(uHead, 0.0096), 0.001);
}
