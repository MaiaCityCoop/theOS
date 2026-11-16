// The skeleton's spine: seven vertebrae of the neck, twelve of the chest, five of the loins (intent 0033). A first pass, written before the kit (./kit.js): to be rebuilt bone by bone.
import { ball, egg, rod, box, strand, frame, group, plane } from '../field.js';
import * as K0 from './kit.js';
import { PART, JOINTS, HAND, FINGERS, fingerJoints } from './rig.js';
const add = K0.add, sub = K0.sub, mul = K0.mul, dot = K0.dot, norm = K0.norm, lerp = K0.lerp, cross = K0.cross, spline = K0.spline;

// ── the spine: seven vertebrae of the neck, twelve of the chest, five of the loins; the sacrum and the coccyx ─────────
// [name, centre y, centre z, body: wide, deep, high, spinous process: length, how steeply down (rad), transverse: span]
export const VERTEBRAE = [
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
export const rigOfVertebra = (n) => /^C[2-5]/.test(n) ? 'neck2' : /^(C[67]|T1$)/.test(n) ? 'neck1' : /^T([2-8])$/.test(n) ? 'spine3' : /^(T9|T1[0-2]|L1)$/.test(n) ? 'spine2' : 'spine1';
export const VERTEBRA_AT = Object.fromEntries(VERTEBRAE.map((v) => [v[0], [0, v[1], v[2]]]));

export function spine(K) {
  const { put, along } = K.legacy('spine');
  spineOld(K.X, put, along, K.s);
}

function spineOld(X, put, along, s) {
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
}
