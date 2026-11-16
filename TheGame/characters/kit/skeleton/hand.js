// The skeleton's hand (intent 0033): the wrist's eight bones in two rows, the five metacarpals, the fourteen phalanges,
// each a bone of its own, written once for the left hand with the kit (./kit.js). The fingers' bones are laid between
// the rig's joints (./rig.js, fingerJoints) and follow them if they are moved; the wrist's bones are laid from the
// wrist joint, the capitate in line with the middle finger. Shapes from Gray's Anatomy (1918), plates 219–234; lengths
// follow the joints.
//
// The hand's own frame, from the wrist: a down the fingers, b across to the thumb (forwards, the arm hanging), c out of
// the hand's back (outwards). The palm's side of the wrist is hollow: its bones stand in an arch.
import { add, sub, mul, dot, norm, cross } from './kit.js';
import { JOINTS, fingerJoints } from './rig.js';

export function hand(K) {
  K.pair((side) => {
    const w = JOINTS['hand.L'], J = fingerJoints(w, 1);
    const at = (a, b, c = 0) => [w[0] + c, w[1] - a, w[2] + b], dir = (a, b, c = 0) => norm([c, -a, b]);
    const A = [0, -1, 0], B = [0, 0, 1], C = [1, 0, 0];   // the hand's axes in the world: down the fingers, to the thumb, out of its back
    const H = 'hand.' + side;

    // ── the wrist ──────────────────────────────────────────────────────────────────────────────────────────────────────
    const capHead = at(0.017, 0.0045, 0), capR = 0.0068;
    // first row. The scaphoid: a boat lying aslant, from under the radius out and palmwards to its knob below the thumb
    K.bone('scaphoid.' + side, H);
    const sAx = dir(0.0135, 0.0135, -0.0075);
    K.put(K.egg(at(0.0112, 0.0172, -0.0022), [0.0132, 0.0063, 0.0072], [sAx, C]), 0.002);
    K.put(K.ball(at(0.0172, 0.0238, -0.0072), 0.0042), 0.003);
    K.cut(K.ball(capHead, capR + 0.0008), 0.001);
    // the lunate: a crescent, round towards the radius, hollowed below for the capitate's head
    K.bone('lunate.' + side, H);
    K.put(K.egg(at(0.0075, 0.0008, 0.0005), [0.0093, 0.0074, 0.0078]), 0.002);
    K.cut(K.ball(capHead, capR + 0.0008), 0.001);
    // the triquetrum: a small pyramid on the little finger's side; the pisiform, a pea on its palm side
    K.bone('triquetrum.' + side, H);
    K.put(K.box(at(0.0115, -0.0135, -0.002), [0.0036, 0.003, 0.0028], 0.0038, [dir(0.35, -1, 0), dir(0, -0.3, 0.95)]), 0.002);
    K.put(K.egg(at(0.0155, -0.015, -0.0024), [0.0052, 0.0045, 0.005]), 0.003);
    K.bone('pisiform.' + side, H);
    K.put(K.egg(at(0.0128, -0.0158, -0.0122), [0.0054, 0.0064, 0.0056]), 0.002);
    // second row. The trapezium under the thumb, its saddle facing down, out and palmwards, a ridge on its palm side
    K.bone('trapezium.' + side, H);
    const tz = at(0.0293, 0.0295, -0.0073), tDir = norm(sub(J.thumb2, tz));
    const tUp = norm(sub(dir(0, 0.72, 0.69), mul(tDir, dot(dir(0, 0.72, 0.69), tDir))));   // out of the thumb's back
    K.put(K.box(tz, [0.0038, 0.0042, 0.004], 0.0038, [tDir, dir(0, 0.45, 0.9)]), 0.002);
    K.put(K.egg(at(0.0285, 0.0265, -0.0136), [0.003, 0.005, 0.003]), 0.003);
    K.cut(K.egg(add(tz, mul(tDir, 0.0138)), [0.0072, 0.02, 0.0072], [tDir, tUp]), 0.0008);   // the saddle: hollow from side to side, round from back to palm
    // the trapezoid: small, wedged between its neighbours, broader on the hand's back
    K.bone('trapezoid.' + side, H);
    K.put(K.box(at(0.0285, 0.0172, 0.0015), [0.0046, 0.0038, 0.002], 0.0036), 0.002);
    K.put(K.egg(at(0.0285, 0.0172, 0.0062), [0.0036, 0.0058, 0.0052]), 0.003);
    // the capitate: the largest, its round head up in the hollow of the first row, its body down to the middle finger
    K.bone('capitate.' + side, H);
    K.put(K.ball(capHead, capR), 0.002);
    K.put(K.box(at(0.0286, 0.005, 0.0005), [0.0054, 0.0046, 0.0032], 0.0038), 0.005);
    K.put(K.egg(at(0.0225, 0.0048, 0.0002), [0.0068, 0.006, 0.0056]), 0.004);
    // the hamate: a wedge on the little finger's side, its hook standing out of the palm
    K.bone('hamate.' + side, H);
    K.put(K.box(at(0.029, -0.0088, -0.0012), [0.005, 0.0038, 0.0028], 0.0038, [dir(0, -0.3, 0.95), A]), 0.002);
    K.put(K.egg(at(0.0212, -0.0062, -0.0006), [0.0062, 0.0062, 0.0044], [dir(0.4, 0.92, 0), C]), 0.005);
    K.put(K.rod(at(0.027, -0.0098, -0.0072), at(0.0285, -0.0092, -0.013), 0.0033, 0.0028), 0.003);
    K.put(K.rod(at(0.0285, -0.0092, -0.013), at(0.0298, -0.007, -0.0164), 0.0028, 0.0022), 0.001);

    // ── a long bone of the hand: a shaft from its base to its head, hollowed along the palm's side, with its head ───────
    // p0 … p1: its base's face and its head's middle; up: out of the hand's back there; base, mid, head: its section
    // there, [half-width, to the back, to the palm]; bow: how far its middle arches towards the back; flat: how square
    // its palm side is (less than 2: a ridge)
    const shaft = (p0, p1, up, base, mid, head, bow, flat = 3.2) => {
      const u = norm(sub(p1, p0)), o = norm(sub(up, mul(u, dot(up, u))));
      const q = (t) => [0, 1, 2].map((i) => (t < 0.5 ? base[i] + (mid[i] - base[i]) * Math.min(1, t / 0.42) ** 0.62 : mid[i] + (head[i] - mid[i]) * Math.max(0, (t - 0.66) / 0.34) ** 1.5));
      const kn = []; for (let i = 0; i < 8; i++) { const t = i / 7, s = q(t); kn.push([s[0], s[0], s[1], s[2], 0, bow * 4 * t * (1 - t), 2.3, t > 0.15 && t < 0.85 ? flat : 2.4]); }
      return K.loft(add(p0, mul(u, Math.min(base[1], base[2]) * 0.35)), add(p1, mul(u, head[0] * 0.2)), kn, { out: o, caps: 0.4 });
    };

    // ── the palm: four metacarpals, each a squarish base on the wrist's second row, a shaft bowed towards the hand's back,
    // a round head (the knuckle), larger on the palm's side ──────────────────────────────────────────────────────────────
    const MC = { index: [at(0.0372, 0.0165, 0.002), 1, 2], middle: [at(0.0378, 0.005, 0.003), 1.03, 3], ring: [at(0.0372, -0.0055, 0.0012), 0.92, 4], little: [at(0.0366, -0.0152, -0.0015), 0.86, 5] };
    const headR = {};
    for (const [f, [p0, s, n]] of Object.entries(MC)) {
      K.bone(`metacarpal${n}.${side}`, H);
      const k = J[f + '1'], r = 0.0068 * s; headR[f] = r;
      K.put(shaft(p0, k, C, [0.0068 * s, 0.007 * s, 0.0074 * s], [0.0044 * s, 0.0048 * s, 0.0046 * s], [0.006 * s, 0.0052 * s, 0.0062 * s], 0.0022, 1.7), 0.002);
      K.put(K.egg(k, [r * 1.02, r, r * 0.97]), 0.002);                                         // the knuckle
      K.put(K.egg(add(k, mul(C, -r * 0.42)), [r * 0.72, r * 0.8, r * 1.05]), 0.002);            // … broader towards the palm
    }

    // ── the fingers: three phalanges each. A phalanx: a base hollowed to the head before it, a shaft round on the back and
    // flat on the palm's side, a head of two small condyles (a pulley); the last one ends in a flat tuft ──────────────────
    const phalanx = (a, b, up, across, s, prevR, last) => {
      const u = norm(sub(b, a));
      if (!last) {
        K.put(shaft(add(a, mul(u, prevR * 0.45)), b, up, [0.0072 * s, 0.0056 * s, 0.006 * s], [0.0045 * s, 0.004 * s, 0.003 * s], [0.005 * s, 0.0034 * s, 0.0034 * s], 0.0009), 0.0015);
        for (const g of [1, -1]) K.put(K.egg(add(b, mul(across, g * 0.0026 * s)), [0.0036 * s, 0.0037 * s, 0.0028 * s], [up, u]), 0.0012);
      } else {
        // the last one: a broad base, a shaft narrowing, then its flat tuft, the whole ending at the finger's tip
        const o = norm(sub(up, mul(u, dot(up, u)))), kn = [[0.006, 0.004, 0.0046], [0.005, 0.0034, 0.0036], [0.004, 0.0029, 0.0027], [0.0034, 0.0026, 0.0023], [0.0031, 0.0023, 0.0021], [0.0034, 0.0021, 0.0021], [0.0043, 0.002, 0.0022], [0.0042, 0.0019, 0.0021]]
          .map(([w, d, p]) => [w * s, w * s, d * s, p * s, 0, 0, 2.3, 2.8]);
        K.put(K.loft(add(a, mul(u, prevR * 0.45)), add(b, mul(u, -0.0011 * s)), kn, { out: o, caps: 0.6 }), 0.0015);
      }
      K.cut(K.egg(a, [prevR + 0.0005, prevR + 0.0005, prevR * 1.5], [up, u]), 0.0008);                      // the base's hollow
    };
    const SC = { index: 1, middle: 1.05, ring: 0.96, little: 0.82 };
    for (const f of ['index', 'middle', 'ring', 'little']) {
      const s = SC[f], p = [1, 2, 3].map((j) => J[f + j]).concat([J[f + 'Tip']]);
      K.bone(`${f}1.${side}`, `${f}1.${side}`); phalanx(p[0], p[1], C, B, s, headR[f], false);
      K.bone(`${f}2.${side}`, `${f}2.${side}`); phalanx(p[1], p[2], C, B, s * 0.86, 0.0037 * s, false);
      K.bone(`${f}3.${side}`, `${f}3.${side}`); phalanx(p[2], p[3], C, B, s * 0.84, 0.0032 * s, true);
    }

    // ── the thumb: its metacarpal short and thick, on the trapezium's saddle, turned so that its back faces out and
    // forwards; two phalanges ───────────────────────────────────────────────────────────────────────────────────────────
    const t2 = J.thumb2, t3 = J.thumb3, tt = J.thumbTip, tu = tDir, tAcross = cross(tu, tUp);
    K.bone('metacarpal1.' + side, 'thumb1.' + side);
    K.put(shaft(add(tz, mul(tu, 0.0082)), t2, tUp, [0.0078, 0.0068, 0.0074], [0.0054, 0.0052, 0.005], [0.0068, 0.0056, 0.0066], 0.0012), 0.002);
    K.put(K.egg(t2, [0.0066, 0.0066, 0.0072], [tUp, tu]), 0.002);
    for (const g of [1, -1]) K.put(K.ball(add(add(t2, mul(tUp, -0.0072)), mul(tAcross, g * 0.0036)), 0.0021), 0.0008);   // the two seed bones under its head
    const u2 = norm(sub(t3, t2)), up2 = norm(sub(tUp, mul(u2, dot(tUp, u2)))), ac2 = cross(u2, up2);
    K.bone('thumb2.' + side, 'thumb2.' + side); phalanx(t2, t3, up2, ac2, 1.18, 0.0066, false);
    const u3 = norm(sub(tt, t3)), up3 = norm(sub(tUp, mul(u3, dot(tUp, u3)))), ac3 = cross(u3, up3);
    K.bone('thumb3.' + side, 'thumb3.' + side); phalanx(t3, tt, up3, ac3, 1.22, 0.0043, true);
  });
}
