// The skeleton's chest: the ribs, their cartilage, the breastbone (intent 0033). A first pass, written before the kit (./kit.js): to be rebuilt bone by bone.
import { ball, egg, rod, box, strand, frame, group, plane } from '../field.js';
import * as K0 from './kit.js';
import { PART, JOINTS, HAND, FINGERS, fingerJoints } from './rig.js';
const add = K0.add, sub = K0.sub, mul = K0.mul, dot = K0.dot, norm = K0.norm, lerp = K0.lerp, cross = K0.cross, spline = K0.spline;
import { VERTEBRAE } from './spine.js';

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
export function chest(K) {
  const { put, along } = K.legacy('chest'), X = K.X, s = K.s;
  for (const sg of [1, -1]) ribs(X, put, along, s, sg, (p) => [sg * p[0], p[1], p[2]]);
  sternum(X, put, along, s);
}

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
