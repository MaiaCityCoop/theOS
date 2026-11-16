// The skeleton's foot (intent 0033): the seven bones of the ankle and the arch (talus, heel bone, navicular, cuboid,
// three cuneiforms), the five long bones to the ball of the foot, the toes' fourteen and the two small bones under the
// great toe's ball, each a bone of its own, written for the left side (the kit mirrors it). Their forms from Gray's
// Anatomy (1918), figs. 268 and 269 (the foot from above and from below) and 290 (from its inner side); their sizes the
// usual ones of a grown man's (White, Black & Folkens, "Human Osteology", 3rd ed.): the bony foot 262 mm long and
// 82 mm across the ball, the heel bone 82 mm long.
//
// The foot is written in its own frame, from the ankle (the rig's joint): a across it to the outer side, y up from the
// floor, b forwards along it (through the second toe); it points 7° outwards. The sole's flesh lies under the bones:
// the heel bone comes no lower than 16 mm, the balls of the foot 9 mm.
import { JOINTS } from './rig.js';

const kn = (wo, wi, f, b, cv = 0, cw = 0, nf = 2, nb = 2) => [wo, wi, f, b, cv, cw, nf, nb];
const A0 = JOINTS['foot.L'], OUT = 0.12;
/** A point of the foot's frame (a out, y up, b forwards) in the reference man's. */
const Q = (a, y, b) => [A0[0] + a * Math.cos(OUT) + b * Math.sin(OUT), y, A0[2] - a * Math.sin(OUT) + b * Math.cos(OUT)];
/** The foot's own directions, turned a further `yaw` outwards: forwards, across (to the outer side). */
const fwd = (yaw = 0, pitch = 0) => [Math.sin(OUT + yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(OUT + yaw) * Math.cos(pitch)];
const across = (yaw = 0) => [Math.cos(OUT + yaw), 0, -Math.sin(OUT + yaw)];
const UP = [0, 1, 0];

export function foot(K) {
  K.pair((side) => { talus(K, side); calcaneus(K, side); midfoot(K, side); metatarsals(K, side); toes(K, side); });
}

// ── the talus: its body under the shin, a pulley on top (wider in front), the neck running forwards and in to its
// round head ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function talus(K, side) {
  const s = K.s, yaw = 0.1;
  K.bone('talus.' + side, 'foot.' + side);
  K.put(K.box(Q(0.001, 0.0752, -0.0035), [0.008, 0.0035, 0.0105], 0.0075, [across(yaw), UP]), 0.003);
  // the pulley: a drum lying across, cut by the two faces the ankle's knobs bear on, a little wider in front
  const ax = across(yaw), fw = fwd(yaw), c = Q(0.001, 0.0745, -0.002), at = (d, e) => [c[0] + ax[0] * d + fw[0] * e, c[1], c[2] + ax[2] * d + fw[2] * e];
  K.put(K.group([
    { op: 'add', k: 0, s: K.rod(at(-0.02, 0), at(0.02, 0), 0.0195) },
    { op: 'and', k: s(0.004), s: K.plane([ax[0] - fw[0] * 0.09, 0, ax[2] - fw[2] * 0.09], at(0.0158, 0)) },
    { op: 'and', k: s(0.004), s: K.plane([-ax[0] - fw[0] * 0.09, 0, -ax[2] - fw[2] * 0.09], at(-0.0138, 0)) },
  ]), 0.004);
  K.put(K.egg(Q(0.0152, 0.0655, -0.004), [0.005, 0.0095, 0.008]), 0.005);    // the process under the outer knob
  K.put(K.egg(Q(0.0, 0.0685, -0.0235), [0.009, 0.007, 0.0065]), 0.005);      // the process behind
  // the neck and the head
  K.put(K.strand(Q(-0.002, 0.069, 0.01), Q(-0.008, 0.063, 0.031), { w: 0.0125, d: 0.0098, t0: [0.013, 0.0105], t1: [0.0125, 0.0098], out: UP }), 0.007);
  K.put(K.egg(Q(-0.0095, 0.061, 0.0362), [0.0155, 0.012, 0.0105], [across(-0.25), [0.2, 1, 0]]), 0.004);
}

// ── the heel bone: long, tall behind where it meets the floor on two knobs, highest under the talus, a shelf on its
// inner side holding the talus's neck, its front end meeting the cuboid ─────────────────────────────────────────────
function calcaneus(K, side) {
  K.bone('calcaneus.' + side, 'foot.' + side);
  K.put(K.loft(Q(0.0025, 0.0385, -0.0438), Q(0.02, 0.0435, 0.019), [
    kn(0.0135, 0.0135, 0.019, 0.0195, 0, 0, 2.2, 2.3), kn(0.016, 0.016, 0.0215, 0.022, 0, 0, 2.2, 2.3), kn(0.015, 0.0152, 0.021, 0.0215, -0.001, 0, 2.2, 2.3), kn(0.013, 0.014, 0.0205, 0.0195, -0.002, 0, 2.2, 2.3),
    kn(0.0125, 0.0145, 0.0225, 0.018, -0.003, 0, 2.2, 2.3), kn(0.0118, 0.0125, 0.0155, 0.0165, -0.002, 0, 2.3, 2.3), kn(0.0115, 0.0115, 0.0125, 0.0155, 0, 0, 2.5, 2.5),
  ], { out: UP, caps: 0.9 }), 0.004);
  K.put(K.egg(Q(-0.004, 0.0228, -0.035), [0.009, 0.0065, 0.013]), 0.007);      // the two knobs it stands on: the inner, the larger
  K.put(K.egg(Q(0.011, 0.0235, -0.037), [0.006, 0.0055, 0.009]), 0.006);
  K.put(K.egg(Q(-0.0105, 0.047, 0.007), [0.0095, 0.0062, 0.0115]), 0.007);    // the shelf under the talus
  K.put(K.egg(Q(0.0245, 0.037, 0.0), [0.003, 0.0035, 0.007]), 0.007);          // the small knob on its outer face
  K.put(K.egg(Q(0.0165, 0.031, 0.02), [0.008, 0.005, 0.008]), 0.006);         // the knob under its front end
  K.cut(K.egg(Q(0.01, 0.0095, -0.009), [0.022, 0.0135, 0.02]), 0.008);         // hollow underneath, between the knobs and the front
}

// ── the arch's five: the navicular before the talus's head (its knob on the inner side), the three wedges before it
// (the inner tall and long, the middle one short), the cuboid on the outer side before the heel bone ─────────────────
function midfoot(K, side) {
  const box3 = [0, 0, 2.8, 2.8];
  K.bone('navicular.' + side, 'foot.' + side);
  K.put(K.egg(Q(-0.0085, 0.0575, 0.0535), [0.0215, 0.0135, 0.009], [across(-0.2), UP]), 0.003);
  K.put(K.egg(Q(-0.0295, 0.049, 0.0495), [0.0075, 0.0085, 0.0085]), 0.007);
  K.cut(K.egg(Q(-0.0095, 0.061, 0.0362), [0.0168, 0.0132, 0.012], [across(-0.25), [0.2, 1, 0]]), 0.002);   // hollowed for the talus's head
  // the cuneiforms, each drawn from its back face to its front: the inner tall, thick below; the two others wedges,
  // their edge downwards (the arch across the foot)
  K.bone('cuneiform1.' + side, 'foot.' + side);
  K.put(K.loft(Q(-0.0212, 0.047, 0.0655), Q(-0.0222, 0.0455, 0.0855), [kn(0.0092, 0.0092, 0.0135, 0.0135, 0, 0, 2.2, 3), kn(0.0095, 0.0095, 0.0145, 0.0145, 0, 0, 2.2, 3), kn(0.0095, 0.0098, 0.014, 0.015, 0, 0, 2.2, 3)], { out: UP, caps: 0.35 }), 0.002);
  K.bone('cuneiform2.' + side, 'foot.' + side);
  K.put(K.loft(Q(-0.0042, 0.0545, 0.0655), Q(-0.0042, 0.0535, 0.0768), [kn(0.0077, 0.0077, 0.0095, 0.0125, 0, 0, 3, 1.5), kn(0.0077, 0.0077, 0.0095, 0.0125, 0, 0, 3, 1.5)], { out: UP, caps: 0.35 }), 0.002);
  K.bone('cuneiform3.' + side, 'foot.' + side);
  K.put(K.loft(Q(0.0113, 0.0505, 0.0645), Q(0.0118, 0.049, 0.0808), [kn(0.0077, 0.0077, 0.0105, 0.013, 0, 0, 3, 1.6), kn(0.0077, 0.0077, 0.0105, 0.013, 0, 0, 3, 1.6)], { out: UP, caps: 0.35 }), 0.002);
  // the cuboid: longer on its inner side, a ridge and a groove under it
  K.bone('cuboid.' + side, 'foot.' + side);
  K.put(K.loft(Q(0.024, 0.0385, 0.037), Q(0.031, 0.0355, 0.061), [kn(0.0115, 0.0105, 0.0125, 0.012, ...box3), kn(0.0125, 0.011, 0.0122, 0.012, ...box3), kn(0.0125, 0.0115, 0.0108, 0.0115, ...box3)], { out: UP, caps: 0.6 }), 0.002);
  K.put(K.egg(Q(0.031, 0.0265, 0.045), [0.0095, 0.004, 0.0055], [across(-0.5), UP]), 0.004);
}

// ── the five long bones: a blocky base, a slender shaft arched upwards, a round head on the floor (the first short and
// thick, on its two small bones; the fifth with a knob at its base, out to the side) ────────────────────────────────
// [base (a, y, b), head (a, y, b), base's half-width and half-height, shaft's, head's]
const MT = [
  [[-0.0225, 0.043, 0.0905], [-0.024, 0.0255, 0.143], [0.0105, 0.013], [0.0072, 0.0075], [0.0112, 0.0105]],
  [[-0.004, 0.05, 0.08], [-0.003, 0.0152, 0.148], [0.0078, 0.0092], [0.0042, 0.0046], [0.006, 0.0068]],
  [[0.0115, 0.0465, 0.084], [0.0125, 0.0152, 0.142], [0.0075, 0.009], [0.0041, 0.0045], [0.0058, 0.0066]],
  [[0.0245, 0.039, 0.068], [0.027, 0.0152, 0.133], [0.0072, 0.0082], [0.004, 0.0044], [0.0056, 0.0064]],
  [[0.037, 0.03, 0.066], [0.041, 0.0148, 0.121], [0.0075, 0.007], [0.0042, 0.0042], [0.0054, 0.006]],
];
function metatarsals(K, side) {
  MT.forEach(([b, h, [bw, bh], [sw, sh], [hw, hh]], i) => {
    K.bone(`metatarsal${i + 1}.${side}`, 'foot.' + side);
    K.put(K.loft(Q(...b), Q(...h), [
      kn(bw, bw, bh, bh, 0, 0, 2.5, 2.5), kn(bw * 0.86, bw * 0.86, bh * 0.8, bh * 0.82, 0, 0.0005, 2.2, 2.2), kn(sw * 1.05, sw * 1.05, sh * 1.05, sh, 0, 0.0018), kn(sw, sw, sh, sh, 0, 0.002),
      kn(sw * 1.1, sw * 1.1, sh * 1.1, sh * 1.1, 0, 0.001), kn(hw * 0.9, hw * 0.9, hh * 0.85, hh * 0.92),
    ], { out: UP, caps: 0.3 }), 0.002);
    K.put(K.egg(Q(...h), [hw, hh, hh * 1.05], [across(), UP]), 0.003);
  });
  // (the fifth's knob is added to its own bone: the last begun)
  K.put(K.egg(Q(0.0435, 0.0245, 0.0545), [0.0058, 0.0058, 0.011], [across(0.35), UP]), 0.005);
}

// ── the toes: two bones in the great one, three in the others; each flared at its base, waisted, a small pulley at
// its head; the last a flat tuft. And the two small bones under the great toe's ball ────────────────────────────────
// [first joint (a, y, b), the bones' lengths, base half-width]
const TOES = [
  [[-0.0245, 0.0225, 0.1515], [0.028, 0.022], 0.0098],
  [[-0.003, 0.0152, 0.1545], [0.026, 0.0125, 0.0095], 0.0058],
  [[0.0128, 0.0148, 0.1485], [0.0245, 0.0115, 0.0095], 0.0055],
  [[0.0275, 0.0145, 0.1395], [0.0225, 0.0095, 0.009], 0.0052],
  [[0.0418, 0.014, 0.1272], [0.0205, 0.0075, 0.0085], 0.005],
];
function toes(K, side) {
  TOES.forEach(([p0, lens, bw], i) => {
    let p = p0;
    lens.forEach((len, j) => {
      const last = j === lens.length - 1, drop = i === 0 ? (j === 0 ? 0.0075 : 0.002) : (j === 0 ? 0.0045 : j === 1 ? 0.002 : 0.001);
      const q = [p[0] + (i === 0 ? 0.0015 : 0) * (j + 1), p[1] - drop, p[2] + len], w = bw * [1, 0.86, 0.8][j], hgt = w * (i === 0 ? 0.82 : 0.9);
      K.bone(`toe${i + 1}${'abc'[j]}.${side}`, 'toes.' + side);
      if (!last) K.put(K.loft(Q(...p), Q(...q), [kn(w, w, hgt, hgt), kn(w * 0.7, w * 0.7, hgt * 0.72, hgt * 0.66), kn(w * 0.62, w * 0.62, hgt * 0.62, hgt * 0.58), kn(w * 0.84, w * 0.84, hgt * 0.74, hgt * 0.74, 0, 0, 2.6, 2.6)], { out: UP, caps: 0.5 }), 0.0015);
      else K.put(K.loft(Q(...p), Q(...q), [kn(w, w, hgt * 0.9, hgt * 0.9), kn(w * 0.62, w * 0.62, hgt * 0.6, hgt * 0.55), kn(w * 0.86, w * 0.86, hgt * 0.5, hgt * 0.5, 0, -0.0005, 2.6, 2.6)], { out: UP, caps: 0.6 }), 0.0015);
      p = [q[0], q[1], q[2] + (i === 0 ? 0.0018 : 0.0012)];
    });
  });
  for (const [n, a] of [[1, -0.0297], [2, -0.0183]]) { K.bone(`sesamoid${n}.${side}`, 'toes.' + side); K.put(K.egg(Q(a, 0.0125, 0.142), [0.0048, 0.0036, 0.0064]), 0.001); }
}
