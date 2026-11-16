// The skeleton's leg: femur, kneecap, tibia, fibula (intent 0033). A first pass, written before the kit (./kit.js): to be rebuilt bone by bone.
import { ball, egg, rod, box, strand, frame, group, plane } from '../field.js';
import * as K0 from './kit.js';
import { PART, JOINTS, HAND, FINGERS, fingerJoints } from './rig.js';
const add = K0.add, sub = K0.sub, mul = K0.mul, dot = K0.dot, norm = K0.norm, lerp = K0.lerp, cross = K0.cross, spline = K0.spline;

export function leg(K) {
  const { put, along } = K.legacy('leg'), X = K.X, s = K.s;
  for (const [side, sg] of [['L', 1], ['R', -1]]) {
    const M = (p) => [sg * p[0], p[1], p[2]], P = (x, y, z) => X(M([x, y, z])), B = (n) => `${n}.${side}`;
    legOld(X, put, along, s, sg, M, P, B);
  }
}

// ── the leg: the femur (its ball on a neck, the great knob at the hip, the long shaft bowed forwards, the two rounded
// knuckles at the knee); the kneecap; the tibia (its plateau, the bump below the knee, its sharp front edge, the inner
// ankle) and the fibula beside it (its head, the outer ankle) ────────────────────────────────────────────────────────
function legOld(X, put, along, s, sg, M, P, B) {
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
