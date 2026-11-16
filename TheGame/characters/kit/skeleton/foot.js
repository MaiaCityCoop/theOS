// The skeleton's foot: the ankle bones, the arch, the toes (intent 0033). A first pass, written before the kit (./kit.js): to be rebuilt bone by bone.
import { ball, egg, rod, box, strand, frame, group, plane } from '../field.js';
import * as K0 from './kit.js';
import { PART, JOINTS, HAND, FINGERS, fingerJoints } from './rig.js';
const add = K0.add, sub = K0.sub, mul = K0.mul, dot = K0.dot, norm = K0.norm, lerp = K0.lerp, cross = K0.cross, spline = K0.spline;

export function foot(K) {
  const { put, along } = K.legacy('foot'), X = K.X, s = K.s;
  for (const [side, sg] of [['L', 1], ['R', -1]]) {
    const M = (p) => [sg * p[0], p[1], p[2]], P = (x, y, z) => X(M([x, y, z])), B = (n) => `${n}.${side}`;
    footOld(X, put, along, s, sg, M, P, B);
  }
}

// ── the foot: the talus under the shin, the heel bone behind and below it, the navicular, the cuboid and three
// cuneiforms across the arch, five long bones to the ball, the toes (two bones in the great one, three in the rest) ──
function footOld(X, put, along, s, sg, M, P, B) {
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
