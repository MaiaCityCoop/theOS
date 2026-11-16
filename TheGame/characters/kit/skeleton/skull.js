// The skeleton's skull (intent 0033). A first pass, written before the kit (./kit.js): to be rebuilt bone by bone.
import { ball, egg, rod, box, strand, frame, group, plane } from '../field.js';
import * as K0 from './kit.js';
import { PART, JOINTS } from './rig.js';
const add = K0.add, sub = K0.sub, mul = K0.mul, dot = K0.dot, norm = K0.norm, lerp = K0.lerp, cross = K0.cross, spline = K0.spline;

export function skull(K) {
  const { put, along } = K.legacy('skull');
  SKULL_SUB.length = 0; skullOld(K.X, put, along, K.s);
  for (const [bone, s, k] of SKULL_SUB) put(bone, s, k, PART.bone, 'sub');
}

const SKULL_SUB = [];
// ── the skull: the vault (forehead, crown, the back of the head, the temples' hollows); the face under its front half
// (the sockets of the eyes and the nose's opening cut into it, the bridge of the nose, the cheekbones and their arches
// back to the ears, the upper jaw with the ridge that holds its teeth, the palate); the lower jaw on its own bone (its
// body round to the chin, its branches up to the hinges before the ears); thirty-two teeth. Points from craniometry's
// means for a man (Howells 1973, "Cranial variation in man"; Farkas 1994), as remembered, measured from the middle
// between the ear canals with the head upright (y up, z forwards) ──────────────────────────────────────────────────
const SK = [0, 1.66, -0.012];   // the middle between the ear canals (the reference man)
function skullOld(X, put, along, s) {
  const h = 'head', j = 'jaw', P = (x, y, z) => X([SK[0] + x, SK[1] + y, SK[2] + z]), E = (c, r, R) => egg(P(...c), r.map(s), R);
  const Ls = (pts) => pts.map(([x, y, z]) => [SK[0] + x, SK[1] + y, SK[2] + z]);
  const cut = (sol, k) => SKULL_SUB.push(['head', sol, k]);
  // the vault: long and a little wider behind; the forehead rising from the brows; the back of the head and its bump
  put(h, E([0, 0.05, -0.022], [0.071, 0.079, 0.082]), 0.004);   // the crown and the sides, widest behind
  put(h, E([0, 0.056, 0.036], [0.054, 0.066, 0.062]), 0.03);     // the forehead, narrower
  put(h, E([0, 0.03, -0.062], [0.064, 0.05, 0.04]), 0.016);
  put(h, E([0, 0.002, -0.092], [0.013, 0.007, 0.006]), 0.005);
  // the face: the mass under and between the eyes' sockets, the upper jaw below; the brows' bone over them
  put(h, E([0, 0.01, 0.034], [0.055, 0.042, 0.036]), 0.01);    // behind the sockets: their walls are carved from it
  put(h, E([0, 0.012, 0.076], [0.0125, 0.026, 0.02]), 0.008);  // the bridge between the eyes
  put(h, E([0, -0.027, 0.062], [0.04, 0.024, 0.029]), 0.01);   // the upper jaw, ending at the ridge of its teeth
  put(h, E([0, 0.043, 0.084], [0.046, 0.011, 0.018]), 0.01);   // the brows' bone, over the sockets
  put(h, E([0, 0.036, 0.096], [0.016, 0.009, 0.008]), 0.008);   // the glabella between them
  for (const sg of [1, -1]) {
    // each socket's rim, a rounded square facing forwards and out, thick above (the brow), thinner below
    const C = [sg * 0.033, 0.016, 0.075], N = norm([sg * 0.34, -0.08, 1]), U = norm(cross([0, 1, 0], N)), V = cross(N, U);
    const ring = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a), q = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.86);
      ring.push(add(C, add(mul(U, q(c) * 0.0215), mul(V, q(sn) * 0.0185)))); }
    for (let i = 0; i < 16; i++) {
      const a = ring[i], b = ring[i + 1], up = (dot(sub(lerp(a, b, 0.5), C), V) + 0.0185) / 0.037, w = 0.0042 + 0.0032 * up, d = 0.0042 + 0.002 * up;
      put(h, strand(P(...a), P(...b), { w: s(w), d: s(d), t0: [s(w), s(d)], t1: [s(w), s(d)], out: norm(add(N, mul(norm(sub(lerp(a, b, 0.5), C)), 0.6))) }), 0.004);
    }
    SKULL_SUB.push(['head', box(P(...add(C, mul(N, -0.022))), [s(0.0085), s(0.0058), s(0.012)], s(0.0108), frame(U, V)), 0.003]);   // the socket, from its rim back
    SKULL_SUB.push(['head', egg(P(...add(C, mul(N, -0.04))), [s(0.012), s(0.011), s(0.016)], frame(U, V)), 0.006]);   // narrowing to its back
    put(h, E([sg * 0.049, -0.013, 0.062], [0.017, 0.016, 0.012], frame([1, 0, -sg * 0.55], [0, 1, 0])), 0.006);   // the cheekbone
    along(h, Ls([[sg * 0.058, -0.01, 0.05], [sg * 0.066, -0.007, 0.026], [sg * 0.066, -0.003, 0.004]]), 0.006, 0.003, 0.005, 0.003, () => [sg, 0, 0], 0.003);   // its arch back to the ear
    put(h, E([sg * 0.055, -0.03, -0.022], [0.008, 0.013, 0.01]), 0.004);                                       // the mastoid
    cut(E([sg * 0.079, 0.014, 0.034], [0.02, 0.04, 0.04]), 0.018);                                          // the temple's hollow behind the socket's rim
    cut(E([sg * 0.066, 0.0, -0.004], [0.0065, 0.0045, 0.006]), 0.002);                                         // the ear's canal
    cut(E([sg * 0.022, -0.03, 0.094], [0.011, 0.011, 0.008]), 0.008);                                          // the hollow over the canine
  }
  // the nose: the opening (pear-shaped, wider below) and the cavity behind it; its two small bones over the top
  cut(E([0, -0.012, 0.095], [0.0095, 0.017, 0.02]), 0.003);
  cut(E([0, -0.025, 0.095], [0.0125, 0.0085, 0.02]), 0.003);
  cut(E([0, -0.014, 0.066], [0.012, 0.022, 0.03]), 0.004);
  put(h, strand(P(0, 0.024, 0.097), P(0, 0.003, 0.106), { w: s(0.007), d: s(0.0025), t0: [s(0.0055), s(0.003)], t1: [s(0.008), s(0.0018)], out: [0, 0.4, 1] }), 0.004);
  put(h, E([0, -0.049, 0.052], [0.022, 0.004, 0.022]), 0.004);   // the palate, inside the arch of the teeth
  // the lower jaw: a tall plate from each angle round to the chin, a ridge on top for its teeth; its branch up to the
  // hinge before the ear; the coronoid up under the arch
  for (const sg of [1, -1]) {
    along(j, Ls([[sg * 0.048, -0.068, -0.002], [sg * 0.044, -0.082, 0.034], [sg * 0.03, -0.09, 0.066], [sg * 0.006, -0.096, 0.088]]), 0.012, 0.0045, 0.0155, 0.0055, (p) => norm([p[0] - SK[0], 0, p[2] - SK[2] - 0.035]), 0.004);
    along(j, Ls([[sg * 0.048, -0.068, -0.002], [sg * 0.05, -0.04, 0.002], [sg * 0.052, -0.016, 0.006]]), 0.012, 0.003, 0.008, 0.003, () => [sg, 0, 0], 0.003);
    put(j, E([sg * 0.052, -0.008, 0.008], [0.0095, 0.0055, 0.0055]), 0.002);
    along(j, Ls([[sg * 0.048, -0.04, 0.022], [sg * 0.047, -0.024, 0.028], [sg * 0.046, -0.012, 0.03]]), 0.006, 0.0022, 0.002, 0.0018, () => [sg, 0, 0], 0.003);
  }
  put(j, E([0, -0.1, 0.088], [0.016, 0.009, 0.007]), 0.006);                                                   // the chin's point
  // the teeth: incisors, canine, two premolars, three molars a side, above and below, each turned along the arch
  const TEETH = [[0.004, 0.094, 0.0042, 0.0105, 0.0032], [0.012, 0.09, 0.0035, 0.0095, 0.003], [0.019, 0.083, 0.004, 0.011, 0.0042], [0.023, 0.073, 0.0036, 0.0085, 0.0045],
    [0.025, 0.065, 0.0036, 0.0082, 0.0045], [0.027, 0.054, 0.0052, 0.0075, 0.0052], [0.029, 0.043, 0.005, 0.007, 0.005], [0.03, 0.033, 0.0045, 0.0065, 0.0048]];
  for (const [bone, gum, dir, back] of [['head', -0.055, -1, 0], ['jaw', -0.077, 1, 0.002]]) {
    for (const sg of [1, -1]) TEETH.forEach(([x, z, w, tall, d], i) => {
      const nx = TEETH[Math.min(TEETH.length - 1, i + 1)], pv = TEETH[Math.max(0, i - 1)], tan = norm([sg * (nx[0] - pv[0]) || sg, 0, nx[1] - pv[1] || -0.001]);
      const c = P(sg * (x - back * 0.25), gum + dir * tall * 0.5, z - back);
      put(bone, box(c, [s(w * 0.85), s(tall * 0.5), s(d * 0.85)], s(0.0013), frame(tan, [0, 1, 0])), 0.0008, PART.teeth);
    });
    along(bone, Ls([[0.03, gum - dir * 0.004, 0.03], [0.028, gum - dir * 0.004, 0.06], [0.018, gum - dir * 0.004, 0.083], [0, gum - dir * 0.004, 0.093], [-0.018, gum - dir * 0.004, 0.083], [-0.028, gum - dir * 0.004, 0.06], [-0.03, gum - dir * 0.004, 0.03]].map(([x, y, z]) => [x, y, z - back])), 0.0065, 0.0055, 0.0065, 0.0055, (p) => norm([p[0] - SK[0], 0, p[2] - SK[2] - 0.05]), 0.004);
  }
}
