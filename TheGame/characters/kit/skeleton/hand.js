// The skeleton's hand: the wrist, the palm, the fingers (intent 0033). A first pass, written before the kit (./kit.js): to be rebuilt bone by bone.
import { ball, egg, rod, box, strand, frame, group, plane } from '../field.js';
import * as K0 from './kit.js';
import { PART, JOINTS, HAND, FINGERS, fingerJoints } from './rig.js';
const add = K0.add, sub = K0.sub, mul = K0.mul, dot = K0.dot, norm = K0.norm, lerp = K0.lerp, cross = K0.cross, spline = K0.spline;

export function hand(K) {
  const { put, along } = K.legacy('hand');
  for (const [side, sg] of [['L', 1], ['R', -1]]) handOld(K.X, put, along, K.s, sg, side);
}

// ── the hand: eight wrist bones in two rows, five long bones in the palm, two bones in the thumb and three in each
// finger, each with its base and its head ──────────────────────────────────────────────────────────────────────────────
function handOld(X, put, along, s, sg, side) {
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
