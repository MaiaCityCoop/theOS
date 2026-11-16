// The skeleton's leg (intent 0033): the femur, the kneecap, the tibia and the fibula, each a bone of its own, written
// for the left side (the kit mirrors it). Their forms from Gray's Anatomy (1918), figs. 244 and 245 (the femur from the
// front and from behind), 257 (the tibia from above) and 258 (the tibia and the fibula from the front); their sizes the
// usual ones of a grown man's bones (White, Black & Folkens, "Human Osteology", 3rd ed.), carried to the rig's joints:
// the femur's ball 47 mm across on a neck 125° to the shaft and turned 12° forwards, the knee 83 mm across its
// epicondyles, the tibia's plateau 78 mm wide, the ankle 67 mm across its two knobs.
//
// x to the person's left (the leg's outer side), y up, z forwards. The hip, the knee and the ankle are the rig's
// (./rig.js): the middle of the femur's ball, the line through the knee's two condyles, the line through the ankle's knobs.
import { JOINTS } from './rig.js';

// a loft's knot, named: half-widths out and in, reach to the front and the back, the middle's shift (out, forwards),
// how square the front and the back are (2 round, less a ridge, more a flat)
const kn = (wo, wi, f, b, cv = 0, cw = 0, nf = 2, nb = 2) => [wo, wi, f, b, cv, cw, nf, nb];

export function leg(K) {
  K.pair((side) => { femur(K, side); patella(K, side); tibia(K, side); fibula(K, side); });
}

// ── the femur: its ball on a neck, the great knob beside it and the lesser behind, the long shaft bowed forwards with
// its ridge behind, running in to the knee, where it widens into two condyles with the kneecap's groove between them in
// front and a deep notch behind ───────────────────────────────────────────────────────────────────────────────────────
function femur(K, side) {
  const H = JOINTS['thigh.L'], F = [0, 0, 1];
  K.bone('femur.' + side, 'thigh.' + side);
  // the shaft: round, wider from side to side under the knobs, a ridge down its back (the linea aspera); from a third
  // above the knee it widens (more on the inner side) and flattens behind, down to the epicondyles
  K.put(K.loft([0.1285, 0.895, -0.008], [0.0845, 0.515, 0.012], [
    kn(0.019, 0.019, 0.016, 0.017), kn(0.017, 0.017, 0.014, 0.015, 0, 0.003), kn(0.015, 0.015, 0.0136, 0.015, 0, 0.006, 2, 1.8),
    kn(0.0147, 0.0147, 0.014, 0.0162, 0, 0.008, 2, 1.6), kn(0.0144, 0.0144, 0.014, 0.0166, 0, 0.0095, 2, 1.45), kn(0.0144, 0.0144, 0.014, 0.0166, 0, 0.0095, 2, 1.45),
    kn(0.0147, 0.0147, 0.014, 0.0162, 0, 0.0085, 2, 1.6), kn(0.0156, 0.016, 0.0145, 0.0155, 0, 0.007, 2, 2), kn(0.018, 0.0192, 0.0158, 0.0148, 0, 0.0045, 2.1, 2.6),
    kn(0.0245, 0.0275, 0.0185, 0.0145, 0, 0.002, 2.2, 3), kn(0.0375, 0.0405, 0.021, 0.016, 0, 0, 2.3, 3),
  ], { out: F, caps: 0.8 }), 0.004);
  // the ball, with the small pit where its ligament holds
  K.put(K.ball(H, 0.0235), 0.003);
  K.cut(K.egg([H[0] - 0.0222, H[1] - 0.0062, H[2] - 0.0027], [0.0035, 0.005, 0.005]), 0.002);
  // the neck: narrowest just outside the ball, taller than it is deep, flaring down to the shaft
  K.put(K.loft(H, [0.128, 0.888, -0.0085], [
    kn(0.017, 0.017, 0.014, 0.014), kn(0.0165, 0.0165, 0.0135, 0.0135), kn(0.016, 0.0165, 0.0128, 0.0132), kn(0.018, 0.021, 0.014, 0.0145), kn(0.021, 0.029, 0.016, 0.017),
  ], { out: F }), 0.006);
  // the great trochanter: a tall four-sided knob outside and above the neck's root, broad on its outer face, its tip
  // leaning in and back over a pit
  K.put(K.egg([0.1405, 0.9, -0.008], [0.0145, 0.0305, 0.021], [[1, 0.22, 0], [-0.22, 1, 0.08]]), 0.009);
  K.put(K.egg([0.1465, 0.893, -0.007], [0.0075, 0.024, 0.018]), 0.008);
  K.put(K.egg([0.1355, 0.921, -0.0165], [0.0105, 0.0095, 0.0115]), 0.007);
  // the crest between the two knobs behind, and the lesser trochanter at its foot, behind and inside
  K.put(K.strand([0.1375, 0.917, -0.0195], [0.1175, 0.876, -0.0185], { w: 0.011, d: 0.0065, t0: [0.009, 0.006], t1: [0.011, 0.007], out: [0, 0, -1] }), 0.01);
  K.put(K.egg([0.1135, 0.868, -0.019], [0.0092, 0.0105, 0.0092], [[1, 0.5, 0.4], [-0.5, 1, 0]]), 0.008);
  // the line between them in front
  K.put(K.strand([0.14, 0.912, 0.007], [0.1165, 0.862, 0.006], { w: 0.0055, d: 0.0035, out: F }), 0.008);
  K.cut(K.egg([0.1262, 0.9165, -0.0235], [0.0065, 0.009, 0.0055]), 0.006);   // the pit behind the neck, under the tip
  // the inner condyle (longer from front to back, set a little further back) and the outer (more forward in front):
  // each round behind, flatter below, rising in front into the kneecap's surface, the outer lip the higher
  K.put(K.egg([0.0595, 0.5015, 0.0015], [0.0135, 0.0215, 0.0215]), 0.006);
  K.put(K.egg([0.0635, 0.5075, 0.0155], [0.0155, 0.0275, 0.0255]), 0.006);
  K.put(K.egg([0.1085, 0.5015, 0.003], [0.013, 0.0215, 0.0205]), 0.006);
  K.put(K.egg([0.1045, 0.5085, 0.019], [0.016, 0.0285, 0.027]), 0.006);
  K.put(K.egg([0.0845, 0.513, 0.0175], [0.02, 0.025, 0.0195]), 0.014);   // the kneecap's surface between them: one broad groove
  // the notch between them, open behind and below
  K.cut(K.egg([0.0842, 0.486, -0.0145], [0.0118, 0.028, 0.0245]), 0.004);
  // the epicondyles (the inner the stronger, the adductor's small knob above it); the hollow under the outer one
  K.put(K.egg([0.0495, 0.513, 0.004], [0.0075, 0.012, 0.013]), 0.005);
  K.put(K.ball([0.0505, 0.531, 0.002], 0.005), 0.008);
  K.put(K.egg([0.1195, 0.512, 0.002], [0.0062, 0.01, 0.011]), 0.005);
  K.cut(K.egg([0.1255, 0.502, -0.006], [0.003, 0.004, 0.008], [[1, 0, 0], [0, 1, 0.6]]), 0.002);
}

// ── the kneecap: a thick rounded triangle, point down, its back in two facets either side of a ridge ───────────────
function patella(K, side) {
  K.bone('patella.' + side, 'shin.' + side);
  K.put(K.egg([0.086, 0.517, 0.0605], [0.0225, 0.0195, 0.0105]), 0.003);
  K.put(K.egg([0.086, 0.5015, 0.0585], [0.0115, 0.0125, 0.008]), 0.008);
  K.put(K.strand([0.0862, 0.529, 0.0525], [0.0862, 0.502, 0.0525], { w: 0.007, d: 0.0045, out: [0, 0, -1] }), 0.006);
}

// ── the tibia: the wide head with its two shallow condyles and the ridge between them, the bump below the knee, the
// three-sided shaft with its sharp front edge, the inner ankle ───────────────────────────────────────────────────────
function tibia(K, side) {
  const F = [0, 0, 1];
  K.bone('tibia.' + side, 'shin.' + side);
  // the shaft, from the head down: wide under the knee and drawn to a point in front where the kneecap's tendon holds,
  // then three-sided, a sharp edge in front (the shin) with a flat face either side of it, round behind; thinnest two
  // thirds of the way down, four-sided and wide again at the ankle
  K.put(K.loft([0.084, 0.482, 0.004], [0.0712, 0.094, -0.014], [
    kn(0.037, 0.0375, 0.0215, 0.026, 0, 0, 2.5, 2.6), kn(0.0345, 0.0355, 0.0235, 0.0245, 0, 0, 2.2, 2.5), kn(0.0225, 0.0245, 0.0275, 0.0195, 0.001, 0, 1.6, 2.3), kn(0.016, 0.0172, 0.0235, 0.0152, 0.0015, 0.0005, 1.28, 2.3),
    kn(0.0135, 0.014, 0.021, 0.013, 0.0015, 0.001, 1.16, 2.4), kn(0.0122, 0.0126, 0.0196, 0.0121, 0.001, 0.001, 1.14, 2.4), kn(0.0118, 0.012, 0.0188, 0.0118, 0.001, 0.0005, 1.14, 2.4), kn(0.0113, 0.0115, 0.018, 0.0115, 0.001, 0, 1.16, 2.4),
    kn(0.0108, 0.011, 0.017, 0.011, 0.001, 0, 1.22, 2.4), kn(0.0108, 0.0112, 0.016, 0.011, 0.0005, 0, 1.4, 2.4), kn(0.013, 0.0145, 0.0158, 0.0128, 0, 0, 1.8, 2.5), kn(0.0228, 0.0242, 0.018, 0.018, 0, 0, 2.6, 2.8),
  ], { out: F, caps: 0.25 }), 0.004);
  // the two condyles of the head: the inner an oval, the larger; the outer rounder; both reaching back over the shaft
  K.put(K.egg([0.0655, 0.462, -0.001], [0.0205, 0.016, 0.0265]), 0.008);
  K.put(K.egg([0.1035, 0.462, 0.0], [0.0195, 0.016, 0.0225]), 0.008);
  // cut level on top, falling a little to the back; the notch between the condyles behind
  K.and(K.plane([0, 0.99, -0.13], [0.084, 0.4755, 0.0]), 0.0035);
  K.cut(K.egg([0.0845, 0.472, -0.0265], [0.0075, 0.016, 0.0095]), 0.005);
  // the ridge between the condyles: two small peaks, long from front to back
  K.put(K.egg([0.0798, 0.4772, -0.001], [0.004, 0.0062, 0.0085]), 0.004);
  K.put(K.egg([0.0888, 0.4765, -0.002], [0.004, 0.0058, 0.008]), 0.004);
  // the bump the kneecap's tendon holds, in front below the head; the small knob on the outer condyle's front
  K.put(K.egg([0.087, 0.4365, 0.0282], [0.008, 0.0175, 0.004]), 0.011);
  K.put(K.egg([0.107, 0.456, 0.019], [0.006, 0.007, 0.005]), 0.009);
  // the ankle's end, hollowed below for the talus; the inner knob reaching down beside it, its inner face one with the shaft's
  K.cut(K.egg([0.0785, 0.0742, -0.0165], [0.03, 0.0215, 0.0225], [[0.976, 0, -0.218], [0, 1, 0]]), 0.003);
  K.put(K.egg([0.0548, 0.092, -0.012], [0.0085, 0.0135, 0.0135]), 0.007);
}

// ── the fibula: its head under the tibia's outer condyle, behind; a slender shaft; the outer ankle, lower and further
// back than the inner ────────────────────────────────────────────────────────────────────────────────────────────────
function fibula(K, side) {
  K.bone('fibula.' + side, 'shin.' + side);
  K.put(K.egg([0.1235, 0.449, -0.0215], [0.0095, 0.0125, 0.0105]), 0.004);
  K.put(K.egg([0.1248, 0.4625, -0.0245], [0.004, 0.0055, 0.004]), 0.004);   // its point
  // the shaft: slender, edged, widening and flattening into the outer ankle, a pointed knob
  K.put(K.loft([0.122, 0.442, -0.021], [0.1012, 0.078, -0.0275], [
    kn(0.0075, 0.0075, 0.008, 0.008), kn(0.0058, 0.0058, 0.0062, 0.0062, 0, 0, 1.6, 1.8), kn(0.0058, 0.0058, 0.0065, 0.0065, 0.001, 0, 1.4, 1.6), kn(0.006, 0.006, 0.007, 0.0068, 0.0015, 0, 1.4, 1.6),
    kn(0.006, 0.006, 0.007, 0.0068, 0.0015, 0, 1.4, 1.6), kn(0.006, 0.006, 0.0068, 0.0065, 0.001, 0, 1.5, 1.7), kn(0.0062, 0.0062, 0.007, 0.007, 0.0005, 0, 1.7, 1.9), kn(0.0068, 0.0066, 0.0085, 0.0085, 0, 0, 2, 2),
    kn(0.0092, 0.0072, 0.0115, 0.0115, 0, 0, 2, 2), kn(0.009, 0.0068, 0.0105, 0.0105, 0, 0, 2, 2),
  ], { out: [0, 0, 1], caps: 0.9 }), 0.004);
}
