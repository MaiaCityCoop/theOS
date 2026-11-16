// The skeleton's shoulder and arm: collarbone, shoulder blade, humerus, ulna, radius (intent 0033). A first pass, written before the kit (./kit.js): to be rebuilt bone by bone.
import { ball, egg, rod, box, strand, frame, group, plane } from '../field.js';
import * as K0 from './kit.js';
import { PART, JOINTS, HAND, FINGERS, fingerJoints } from './rig.js';
const add = K0.add, sub = K0.sub, mul = K0.mul, dot = K0.dot, norm = K0.norm, lerp = K0.lerp, cross = K0.cross, spline = K0.spline;

export function arm(K) {
  const { put, along } = K.legacy('arm'), X = K.X, s = K.s;
  for (const [side, sg] of [['L', 1], ['R', -1]]) {
    const M = (p) => [sg * p[0], p[1], p[2]], P = (x, y, z) => X(M([x, y, z])), B = (n) => `${n}.${side}`;
    shoulder(X, put, along, s, sg, M, P, B); armOld(X, put, along, s, sg, M, P, B);
  }
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
function armOld(X, put, along, s, sg, M, P, B) {
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
