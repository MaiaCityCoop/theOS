// The skeleton's pelvis: the two hip bones, the sacrum between them, the coccyx (intent 0033). A first pass, written before the kit (./kit.js): to be rebuilt bone by bone.
import { ball, egg, rod, box, strand, frame, group, plane } from '../field.js';
import * as K0 from './kit.js';
import { PART, JOINTS, HAND, FINGERS, fingerJoints } from './rig.js';
const add = K0.add, sub = K0.sub, mul = K0.mul, dot = K0.dot, norm = K0.norm, lerp = K0.lerp, cross = K0.cross, spline = K0.spline;

export function pelvis(K) {
  const { put, along } = K.legacy('pelvis'), X = K.X, s = K.s;
  sacrum(X, put, along, s);
  for (const sg of [1, -1]) { const M = (p) => [sg * p[0], p[1], p[2]], P = (x, y, z) => X(M([x, y, z])); pelvisOld(X, put, along, s, sg, M, P); }
}

function sacrum(X, put, along, s) {
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

// ── the pelvis: each hip bone of three grown into one (the ilium's wing with its crest, the ischium the seat rests on,
// the pubis meeting the other in front), round the socket of the hip joint ────────────────────────────────────────────
function pelvisOld(X, put, along, s, sg, M, P) {
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
  put(h, ball(X(M([0.088, 0.925, 0.0])), s(0.0255)), 0.0015, PART.bone, 'sub');   // the socket, cut before the femur is laid
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
