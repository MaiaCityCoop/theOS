// The skeleton's spine (intent 0033): the atlas and the axis, five more vertebrae of the neck, twelve of the chest, five
// of the loins, and the discs between their bodies. The column is laid from the sacrum's base upwards by each body's
// height, the disc under it and its lean, so that it curves as it does: forwards in the neck, backwards in the chest,
// forwards again in the loins; the rig's joints lie in the back third of the bodies they turn. Each vertebra is built in
// its own frame of its parts: the body (waisted, its two end plates), the pedicles and laminae round the canal, the
// spinous process, the transverse processes, the four articular processes. Shapes from Gray's Anatomy (1918, figs.
// 82–94); sizes from the vertebral measures of Panjabi et al. (Spine 16–17, 1991–92), as remembered, for a man of 1.80 m.
import { add, mul } from './kit.js';

const deg = Math.PI / 180;
// [name, body's middle y, z, body: wide, deep, high, spinous process: long, how far below level it points (rad),
//  transverse process: its tip's distance from the middle, the vertebra's lean forwards (rad), canal: wide, deep]
export const VERTEBRAE = [
  ['C2', 1.602, -0.0212, 0.0175, 0.0155, 0.0213, 0.014, 0.3, 0.0265, 1.5 * deg, 0.023, 0.017],
  ['C3', 1.5798, -0.0224, 0.0165, 0.0155, 0.0132, 0.012, 0.4, 0.0245, 5.5 * deg, 0.023, 0.015],
  ['C4', 1.5614, -0.0248, 0.017, 0.0155, 0.0127, 0.012, 0.4, 0.025, 9.5 * deg, 0.0235, 0.015],
  ['C5', 1.5435, -0.0285, 0.0175, 0.016, 0.0127, 0.013, 0.4, 0.0255, 13.5 * deg, 0.024, 0.0155],
  ['C6', 1.5257, -0.0334, 0.019, 0.0165, 0.0132, 0.019, 0.32, 0.027, 17.5 * deg, 0.0245, 0.0155],
  ['C7', 1.5072, -0.0399, 0.022, 0.017, 0.0147, 0.03, 0.2, 0.035, 21 * deg, 0.024, 0.0155],
  ['T1', 1.4878, -0.0475, 0.028, 0.0175, 0.0167, 0.034, 0.26, 0.038, 21.5 * deg, 0.02, 0.016],
  ['T2', 1.4673, -0.0548, 0.0275, 0.0185, 0.0178, 0.036, 0.44, 0.035, 18 * deg, 0.0175, 0.0155],
  ['T3', 1.4461, -0.0609, 0.027, 0.0205, 0.0183, 0.038, 0.61, 0.033, 14 * deg, 0.0165, 0.0155],
  ['T4', 1.424, -0.0656, 0.0265, 0.0225, 0.0188, 0.04, 0.79, 0.032, 10 * deg, 0.016, 0.0155],
  ['T5', 1.4012, -0.0688, 0.027, 0.024, 0.0193, 0.043, 0.93, 0.0315, 6 * deg, 0.016, 0.0155],
  ['T6', 1.3776, -0.0704, 0.028, 0.0255, 0.0198, 0.045, 1.01, 0.031, 2 * deg, 0.016, 0.0155],
  ['T7', 1.353, -0.0704, 0.029, 0.027, 0.0203, 0.046, 1.05, 0.0305, -2 * deg, 0.016, 0.0155],
  ['T8', 1.328, -0.0687, 0.03, 0.0285, 0.0208, 0.045, 1.01, 0.03, -5.5 * deg, 0.016, 0.0155],
  ['T9', 1.3023, -0.0655, 0.0315, 0.0295, 0.0218, 0.041, 0.87, 0.029, -9 * deg, 0.0165, 0.016],
  ['T10', 1.2754, -0.0605, 0.0335, 0.0305, 0.0228, 0.036, 0.66, 0.0275, -12 * deg, 0.017, 0.016],
  ['T11', 1.2472, -0.0539, 0.0365, 0.031, 0.0239, 0.027, 0.36, 0.024, -14 * deg, 0.0185, 0.0165],
  ['T12', 1.217, -0.0461, 0.04, 0.0315, 0.0254, 0.026, 0.16, 0.021, -15 * deg, 0.021, 0.017],
  ['L1', 1.1846, -0.0376, 0.042, 0.031, 0.0264, 0.028, 0.09, 0.037, -14.5 * deg, 0.022, 0.017],
  ['L2', 1.15, -0.0295, 0.044, 0.0325, 0.0274, 0.03, 0.09, 0.041, -12 * deg, 0.0225, 0.016],
  ['L3', 1.1132, -0.0233, 0.0465, 0.034, 0.0279, 0.03, 0.09, 0.046, -7 * deg, 0.023, 0.016],
  ['L4', 1.0748, -0.022, 0.049, 0.035, 0.0279, 0.029, 0.1, 0.043, 3 * deg, 0.024, 0.0165],
  ['L5', 1.0365, -0.0297, 0.052, 0.035, 0.0274, 0.022, 0.16, 0.046, 20 * deg, 0.026, 0.0175],
];
export const rigOfVertebra = (n) => /^C[1-5]/.test(n) ? 'neck2' : /^(C[67]|T1$)/.test(n) ? 'neck1' : /^T([2-8])$/.test(n) ? 'spine3' : /^(T9|T1[0-2]|L1)$/.test(n) ? 'spine2' : 'spine1';
// where the column stands on the pelvis: the middle of the sacrum's base, and the way that base faces (up and forwards)
export const SACRAL_BASE = { at: [0, 1.014, -0.04], lean: 40 * deg };
// the atlas: the middle of its ring (where the dens stands), its two cups for the skull's condyles ± ATLAS.cup[0]
export const ATLAS = { at: [0, 1.6205, -0.021], cup: [0.019, 1.626, -0.021] };

/** A vertebra's own frame: c its body's middle, T up its axis, F forwards across it; at(x, t, f) a point in it, dir(x,
 *  t, f) a direction. */
export function vertebraFrame(v) {
  const a = v[9], c = [0, v[1], v[2]], T = [0, Math.cos(a), Math.sin(a)], F = [0, -Math.sin(a), Math.cos(a)];
  return { c, T, F, at: (x, t, f) => [x, c[1] + t * T[1] + f * F[1], c[2] + t * T[2] + f * F[2]], dir: (x, t, f) => [x, t * T[1] + f * F[1], t * T[2] + f * F[2]] };
}
export const vertebra = (name) => VERTEBRAE.find((v) => v[0] === name);

// how far back of the canal's back wall each chest vertebra's transverse process reaches at its tip (T1 … T12)
const TP_BACK = [0.007, 0.009, 0.0095, 0.01, 0.01, 0.01, 0.01, 0.0095, 0.009, 0.008, 0.005, 0.004];
/** Where a rib sits on its vertebra (n: 1 … 12): its head against the body, its tubercle against the tip of the
 *  transverse process (none for the last two). */
export function ribSeat(n) {
  const v = vertebra('T' + n), fr = vertebraFrame(v), [, , , bw, bd, bh, , , tpx, , , cd] = v, i = n - 1;
  const own = n === 1 || n >= 10, cf = -bd / 2 - cd, pt = bh * 0.2;
  const head = fr.at(bw / 2 + 0.0005, own ? bh * 0.24 : bh / 2 + 0.0012, -bd / 2 + 0.0045);
  const tip = fr.at(tpx, pt + 0.005, cf + 0.002 - TP_BACK[i]);
  return { head, tip, tubercle: n <= 10 ? add(tip, fr.dir(0.0015, 0.0005, 0.0068)) : null, fr };
}

// how far behind its middle a body is widest (a part of its half-depth): the chest's bodies are heart-shaped
const heartOf = (n) => (/^T([2-9]|10)$/.test(n) ? 0.2 : /^T1[12]$/.test(n) ? 0.08 : 0);

// ── the parts every vertebra has ─────────────────────────────────────────────────────────────────────────────────────
// the body: a short column, waisted, its two end plates flat with a rounded rim (laid a little long, then cut to them);
// nf, nb: how square its front and back are; wedge: how much taller it is in front (rad); foot: how much wider below
function body(K, fr, bw, bd, bh, nf, nb, { wedge = 0, foot = 0, heart = 0 } = {}) {
  const { at, dir } = fr, e = 0.0025, w = bw / 2, d = bd / 2, g = Math.min(0.0026, bw * 0.065), q = heart * d;   // (heart: how far behind its middle it is widest)
  const kn = [[w + foot, d, d], [w + foot, d, d], [w - g * 0.75 + foot * 0.5, d - g * 0.8, d - g * 0.25], [w - g, d - g, d - g * 0.35], [w - g * 0.75 - foot * 0.3, d - g * 0.8, d - g * 0.25], [w - foot * 0.5, d, d], [w - foot * 0.5, d, d]];
  K.put(K.loft(at(0, -bh / 2 - e, 0), at(0, bh / 2 + e, 0), kn.map((k) => [k[0], k[0], k[1] + q, k[2] - q, 0, -q, nf, nb]), { out: fr.F }), 0.001);
  const c = Math.cos(wedge / 2), s = Math.sin(wedge / 2);
  K.and(K.plane(dir(0, c, -s), at(0, bh / 2, 0)), 0.0013);
  K.and(K.plane(dir(0, -c, -s), at(0, -bh / 2, 0)), 0.0013);
}
// the canal the cord runs in: cut through the arch along the vertebra's axis; nf, nb: its front and back's squareness
function canal(K, fr, bd, bh, cw, cd, nf, nb) {
  const f = -bd / 2 - cd / 2 + 0.0008;
  K.cut(K.loft(fr.at(0, -bh * 1.6, f), fr.at(0, bh * 1.6, f), [[cw / 2, cw / 2, cd / 2, cd / 2, 0, 0, nf, nb], [cw / 2, cw / 2, cd / 2, cd / 2, 0, 0, nf, nb]], { out: fr.F }), 0.0012);
}
// a spinous process as a blade (the loins', the last two of the chest): a hatchet in the middle plane, thick at its
// back edge. root: where it leaves the arch; down: how far below level it points; long, tall: its size
function hatchet(K, root, down, long, tall) {
  const u = [0, -Math.sin(down), -Math.cos(down)], v = [0, Math.cos(down), -Math.sin(down)], L = long, h = tall / 2;
  K.put(K.plate(root, [u, v], [[-0.005, h * 0.75], [0.3 * L, h * 0.85], [0.75 * L, h], [L - 0.002, h * 0.75], [L, 0], [L - 0.001, -h * 0.85], [0.8 * L, -h * 1.3], [0.45 * L, -h * 1.15], [0.12 * L, -h * 1.05], [-0.005, -h * 0.9]], { tc: 0.0028, te: 0.0032, ramp: 0.006, smooth: 3 }), 0.0025);
  K.put(K.egg(add(root, add(mul(u, L - 0.003), mul(v, -h * 0.2))), [0.0042, h * 1.08, 0.0034], [[1, 0, 0], v]), 0.003);
}

// an articular pillar of the neck: a rounded column at (x, t, f), cut aslant by its two faces (45°), `half` between them,
// its two sharp ends blunted
function pillar(K, fr, x, t, f, half) {
  const { at, dir } = fr, c = Math.SQRT1_2;
  return K.group([
    { op: 'add', k: 0, s: K.box(at(x, t, f), [0.0022, 0.0115, 0.0024], 0.003, [[1, 0, 0], fr.T]) },
    { op: 'and', k: 0.0036, s: K.plane(dir(0, c, -c), at(x, t + half, f)) },
    { op: 'and', k: 0.0036, s: K.plane(dir(0, -c, c), at(x, t - half, f)) },
    { op: 'and', k: 0.003, s: K.plane(dir(0, 1, 0), at(x, t + half + 0.0022, f)) },
    { op: 'and', k: 0.003, s: K.plane(dir(0, -1, 0), at(x, t - half - 0.0022, f)) },
  ]);
}

// ── a vertebra of the chest (i: 0 … 11) ──────────────────────────────────────────────────────────────────────────────
function thoracic(K, v, i) {
  const [n, , , bw, bd, bh, spl, spa, , , cw, cd] = v, fr = vertebraFrame(v), { at, dir } = fr;
  K.bone(n, rigOfVertebra(n));
  body(K, fr, bw, bd, bh, i === 0 ? 2.5 : i > 9 ? 2.15 : 1.95, 3.5, { heart: heartOf(n), wedge: (i > 1 && i < 10 ? -3 : 0) * deg });
  // the hollows the ribs' heads sit in: half of one at the upper and the lower edge (a whole one on the first and the last three)
  K.both(() => {
    if (i === 0 || i > 8) K.cut(K.egg(at(bw / 2 + 0.0014, bh * 0.24, -bd / 2 + 0.0045), [0.003, 0.0042, 0.0042]), 0.0008);
    else { K.cut(K.egg(at(bw / 2 + 0.0014, bh / 2 - 0.0004, -bd / 2 + 0.0045), [0.003, 0.0036, 0.0042]), 0.0008); K.cut(K.egg(at(bw / 2 + 0.0014, -bh / 2 + 0.0004, -bd / 2 + 0.0045), [0.003, 0.003, 0.004]), 0.0008); }
  });
  const b = -bd / 2, cf = b - cd, pt = bh * 0.2, pw = [0.004, 0.003, 0.0027, 0.0026, 0.0026, 0.0026, 0.0026, 0.0027, 0.0028, 0.0032, 0.004, 0.0045][i], ph = 0.0055 + i * 0.00024;
  const px = cw / 2 + pw + 0.0004, seat = ribSeat(i + 1);
  K.both(() => {
    // the pedicle, from the upper half of the body straight back; the lamina from it to the middle, a broad tile
    K.put(K.loft(at(px - 0.0008, pt, b + 0.007), at(px, pt, cf + 0.003), [[pw + 0.0008, ph + 0.0006, ph + 0.0006], [pw, ph, ph], [pw + 0.0005, ph + 0.0004, ph + 0.0012]], { out: fr.T, round: [0.004, 0.003] }), 0.0025);
    const lh = i === 0 ? 0.0085 : i > 9 ? 0.0115 : 0.0105;
    K.put(K.strand(at(cw / 2 + 0.003, -0.002, cf + 0.0012), at(0, -0.0055, cf - 0.0024), { w: lh, d: 0.0027, t0: [lh, 0.0027], t1: [lh, 0.003], out: dir(0.45, 0, -1) }), 0.0022);
    // the articular processes: thin plates standing up from the arch (their faces back) and hanging under it (forwards)
    K.put(K.egg(at(cw / 2 + 0.0038, bh / 2 + 0.0032, cf + 0.003), [0.0048, 0.0064, 0.0024], [[1, 0, 0], dir(0, 1, -0.25)]), 0.002);
    if (i < 11) K.put(K.egg(at(cw / 2 + 0.0022, -bh / 2 - 0.0032, cf - 0.0016), [0.0045, 0.006, 0.0024], [[1, 0, 0], dir(0, 1, -0.25)]), 0.002);
    else { K.put(K.strand(at(cw / 2 + 0.002, 0, cf), at(0.0115, -bh / 2 - 0.005, cf - 0.002), { w: 0.0042, d: 0.0034, t0: [0.0042, 0.0034], t1: [0.004, 0.0038], out: dir(0, 0, -1) }), 0.002); K.put(K.egg(at(0.0115, -bh / 2 - 0.0065, cf - 0.0022), [0.004, 0.0075, 0.0045]), 0.002); }
    // the transverse process: stout, out, back and a little up, clubbed where the rib's tubercle rests
    const root = at(cw / 2 + 0.0045, pt, cf + 0.002), tip = seat.tip;
    if (i < 10) { const r = i < 3 ? 0.0046 : 0.005; K.put(K.rod(root, tip, r, r + 0.0002), 0.0025); K.put(K.egg(tip, [r + 0.0008, r + 0.0006, r + 0.0005]), 0.002); }
    else K.put(K.rod(root, tip, 0.0046, i === 10 ? 0.0038 : 0.0034), 0.0025);
  });
  // the spinous process: long, three-sided, pointing down over the vertebra below (the last two: short blades)
  const root = at(0, -0.006, cf - 0.003), dS = [0, -Math.sin(spa), -Math.cos(spa)];
  if (i > 9) hatchet(K, at(0, -0.005, cf - 0.002), spa, spl, i === 10 ? 0.015 : 0.017);
  else K.put(K.loft(add(root, mul(dS, -0.005)), add(root, mul(dS, spl)), [[0.0046, 0.0062, 0.0092], [0.0038, 0.0052, 0.0082], [0.0033, 0.0044, 0.0072], [0.0031, 0.004, 0.0058], [0.0038, 0.0044, 0.005]].map((k) => [k[0], k[0], k[1], k[2], 0, 0, 1.5, 2.4]), { out: [0, Math.cos(spa), -Math.sin(spa)], caps: 0.9 }), 0.003);
  canal(K, fr, bd, bh, cw, cd, 2.2, 2);
}

// ── a vertebra of the loins (j: 0 … 4) ───────────────────────────────────────────────────────────────────────────────
const L_UP = [0.0145, 0.0165, 0.0175, 0.019, 0.0215], L_DOWN = [0.0125, 0.0135, 0.015, 0.0175, 0.022];   // the upper and lower articular processes' distance from the middle
function lumbar(K, v, j) {
  const [n, , , bw, bd, bh, spl, spa, tpx, , cw, cd] = v, fr = vertebraFrame(v), { at, dir } = fr;
  K.bone(n, rigOfVertebra(n));
  body(K, fr, bw, bd, bh, 2.25, 4.5, { wedge: [0, 0, 2, 4, 9][j] * deg });
  const b = -bd / 2, cf = b - cd, pt = bh * 0.17, pw = [0.0042, 0.0045, 0.005, 0.006, 0.008][j], ph = 0.0072, px = cw / 2 + pw + 0.0004;
  K.both(() => {
    // the pedicle: short and thick; the lamina: short, broad, strong
    K.put(K.loft(at(px - 0.0015, pt, b + 0.009), at(px + (j === 4 ? 0.002 : 0), pt, cf + 0.004), [[pw + 0.001, ph + 0.0008, ph + 0.0008], [pw, ph, ph], [pw + 0.0006, ph, ph + 0.001]], { out: fr.T, round: [0.005, 0.004] }), 0.003);
    K.put(K.strand(at(cw / 2 + 0.002, -0.001, cf + 0.0015), at(0, -0.004, cf - 0.003), { w: 0.0085, d: 0.0033, t0: [0.0085, 0.0033], t1: [0.0085, 0.0036], out: dir(0.45, 0, -1) }), 0.0025);
    // the upper articular process: a stout post, its cupped face inwards and back, a knob (mammillary) on its back
    const ux = L_UP[j];
    K.put(K.egg(at(ux, bh / 2 + 0.0035, cf + 0.0025), [0.0048, 0.0088, 0.0058]), 0.003);
    K.put(K.ball(at(ux + 0.004, bh / 2 + 0.003, cf - 0.0022), 0.0031), 0.0025);
    // between the two processes (the pars), and the lower one hanging from the lamina, its face outwards and forwards
    const dx = L_DOWN[j];
    K.put(K.strand(at(ux - 0.0015, 0.006, cf + 0.001), at(dx, -bh / 2 - 0.004, cf - 0.002), { w: 0.0046, d: 0.0036, t0: [0.0046, 0.0036], t1: [0.0042, 0.004], out: dir(0, 0, -1) }), 0.0025);
    K.put(K.egg(at(dx, -bh / 2 - 0.0065, cf - 0.0025), [0.0042, 0.008, 0.0048]), 0.0025);
    // the transverse process: long, thin, flat (the fifth's: short, thick, a pyramid from the body's side)
    if (j < 4) K.put(K.strand(at(cw / 2 + 0.005, pt - 0.001, cf + 0.005), at(tpx, pt + 0.003, cf - 0.003), { w: 0.0048, d: 0.003, t0: [0.006, 0.0038], t1: [0.0038, 0.0025], out: dir(0, 0.15, 1) }), 0.003);
    else K.put(K.strand(at(cw / 2 + 0.006, pt - 0.001, b - 0.003), at(tpx, pt + 0.006, cf + 0.004), { w: 0.0068, d: 0.0048, t0: [0.0088, 0.0062], t1: [0.0042, 0.0034], out: dir(0, 0.2, 1) }), 0.004);
  });
  K.both(() => K.cut(K.egg(at(L_UP[j] - 0.0062, bh / 2 + 0.0052, cf - 0.0042), [0.0046, 0.008, 0.0046]), 0.001));   // the cup of each upper face
  hatchet(K, at(0, -0.0045, cf - 0.002), spa, spl, j === 4 ? 0.016 : 0.02);
  canal(K, fr, bd, bh, cw, cd, 3, 1.5);
}

// ── a vertebra of the neck, the third to the seventh (q: 0 … 4) ──────────────────────────────────────────────────────
function cervical(K, v, q) {
  const [n, , , bw, bd, bh, spl, spa, tpx, , cw, cd] = v, fr = vertebraFrame(v), { at, dir } = fr;
  K.bone(n, rigOfVertebra(n));
  body(K, fr, bw, bd, bh, 2.8, 3, { foot: 0.0011 });
  K.put(K.egg(at(0, -bh / 2 - 0.0002, bd / 2 - 0.0018), [bw * 0.3, 0.0019, 0.0018]), 0.0015);   // its lip in front, over the body below
  const b = -bd / 2, cf = b - cd;
  K.both(() => {
    K.put(K.egg(at(bw / 2 - 0.0011, bh / 2 + 0.0011, -0.0015), [0.0016, 0.003, 0.005]), 0.0012);   // the lip along each side of the top (uncinate)
    K.put(K.rod(at(bw / 2 - 0.002, 0.001, b + 0.0015), at(cw / 2 + 0.0045, 0.001, b - 0.0055), 0.0028), 0.002);   // the pedicle, back and out
    // the articular pillar: a column cut aslant above and below, its upper face up and back, its lower down and forwards
    K.put(pillar(K, fr, cw / 2 + 0.006, 0, b - 0.0086, 0.0084), 0.002);
    K.put(K.strand(at(cw / 2 + 0.0035, -0.001, cf + 0.001), at(0, -0.0035, cf - 0.003), { w: 0.0052, d: 0.0019, t0: [0.0052, 0.0019], t1: [0.0052, 0.0022], out: dir(0.45, 0.25, -1) }), 0.002);   // the lamina
    if (q < 4) {
      // the transverse process: short, a gutter for the nerve: a root from the body to the tubercle in front, a root from
      // the pillar to the tubercle behind, the bar joining them outside the artery's hole
      K.put(K.rod(at(bw / 2 - 0.0015, 0.0005, 0.0008), at(bw / 2 + 0.0085, -0.002, 0.0026), 0.0021, 0.0022), 0.0015);
      K.put(K.egg(at(bw / 2 + 0.0105, -0.003, 0.003), [0.0028, 0.003, 0.0024]), 0.0015);
      K.put(K.rod(at(bw / 2 + 0.0078, -0.0022, 0.002), at(bw / 2 + 0.0082, -0.003, b - 0.0005), 0.002), 0.0015);
      K.put(K.rod(at(cw / 2 + 0.0055, -0.0005, b - 0.005), at(bw / 2 + 0.0125, -0.004, b + 0.0005), 0.0024, 0.0026), 0.0015);
      K.put(K.egg(at(bw / 2 + 0.014, -0.0045, b + 0.001), [0.0028, 0.003, 0.003]), 0.0015);
    } else {
      K.put(K.rod(at(cw / 2 + 0.006, 0, b - 0.005), at(tpx - 0.003, -0.002, b - 0.0045), 0.0036, 0.0032), 0.002);
      K.put(K.egg(at(tpx - 0.002, -0.0022, b - 0.0045), [0.0036, 0.0036, 0.004]), 0.002);
      K.put(K.rod(at(bw / 2 - 0.001, 0.001, 0), at(bw / 2 + 0.0105, -0.002, b + 0.0035), 0.0016), 0.0015);
    }
  });
  // the spinous process: short and forked (the sixth's less so; the seventh's long, a single knob)
  const root = at(0, -0.0035, cf - 0.0025), dS = [0, -Math.sin(spa), -Math.cos(spa)], end = add(root, mul(dS, spl));
  K.put(K.loft(add(root, mul(dS, -0.003)), end, [[0.003, 0.0046, 0.0056], [0.0027, 0.004, 0.0048], [0.0028, 0.0036, 0.0042]], { out: [0, Math.cos(spa), -Math.sin(spa)], caps: 0.8 }), 0.002);
  if (q < 4) { const fork = q === 3 ? 0.0026 : 0.0044; K.both(() => K.put(K.rod(add(end, mul(dS, -0.002)), add(add(end, mul(dS, 0.0035)), [fork, -0.001, 0]), 0.0024, 0.0027), 0.0015)); }
  else K.put(K.egg(end, [0.0042, 0.0046, 0.0046]), 0.002);
  canal(K, fr, bd, bh, cw, cd, 3, 1.5);
  K.both(() => K.cut(K.rod(at(bw / 2 + 0.0034, -0.012, -0.0032), at(bw / 2 + 0.0034, 0.012, -0.0032), q < 4 ? 0.0026 : 0.002), 0.0008));   // the artery's hole
}

// ── the axis: the second of the neck, with the peg (dens) the atlas turns round ─────────────────────────────────────
function axis(K, v) {
  const [n, , , bw, bd, bh, spl, spa, , , cw, cd] = v, fr = vertebraFrame(v), { at, dir } = fr;
  K.bone(n, rigOfVertebra(n));
  body(K, fr, bw, bd, bh, 2.8, 3, { foot: 0.0012 });
  K.put(K.egg(at(0, -bh / 2 - 0.0002, bd / 2 - 0.0018), [bw * 0.3, 0.002, 0.0018]), 0.0015);
  // the dens: a peg from the body's top, waisted at its neck, leaning back a little, its tip a blunt point
  K.put(K.loft(at(0, bh / 2 - 0.0035, 0.0012), at(0, bh / 2 + 0.0148, -0.0012), [[0.0062, 0.0058, 0.0058], [0.005, 0.005, 0.005], [0.0054, 0.0056, 0.0054], [0.0052, 0.0054, 0.0052], [0.0038, 0.0038, 0.0038]], { out: fr.F, caps: 0.75 }), 0.003);
  const b = -bd / 2, cf = b - cd;
  K.both(() => {
    // the shoulders the atlas rides on: broad, a little domed, sloping down and out
    K.put(K.egg(at(0.0145, bh / 2 - 0.0048, -0.001), [0.0085, 0.004, 0.0088], [dir(1, -0.22, 0), dir(0.22, 1, 0)]), 0.003);
    K.put(K.rod(at(0.0135, 0.003, b + 0.002), at(0.018, -0.0045, b - 0.007), 0.0042, 0.004), 0.003);   // back and down to the lower joint
    K.put(pillar(K, fr, cw / 2 + 0.006, -bh / 2 + 0.0035, b - 0.0086, 0.0078), 0.002);
    K.put(K.strand(at(cw / 2 + 0.0035, -0.002, cf + 0.0015), at(0, -0.004, cf - 0.0038), { w: 0.0068, d: 0.0028, t0: [0.0068, 0.0028], t1: [0.007, 0.0032], out: dir(0.45, 0.2, -1) }), 0.0025);   // the lamina, thick
    // the transverse process: small, down and out, on two roots
    K.put(K.rod(at(0.012, 0.0015, 0.001), at(0.0245, -0.004, -0.0055), 0.0019, 0.0021), 0.0015);
    K.put(K.rod(at(0.0165, -0.001, b - 0.0015), at(0.0255, -0.0045, -0.0075), 0.0021, 0.0023), 0.0015);
    K.put(K.ball(at(0.0258, -0.0046, -0.0066), 0.0027), 0.0012);
  });
  // the spinous process: large, deep, forked wide
  const root = at(0, -0.004, cf - 0.0035), dS = [0, -Math.sin(spa), -Math.cos(spa)], end = add(root, mul(dS, spl));
  K.put(K.loft(add(root, mul(dS, -0.004)), end, [[0.0042, 0.0052, 0.0062], [0.004, 0.0048, 0.0058], [0.0042, 0.0046, 0.0052]], { out: [0, Math.cos(spa), -Math.sin(spa)], caps: 0.7 }), 0.0025);
  K.both(() => K.put(K.rod(add(end, mul(dS, -0.003)), add(add(end, mul(dS, 0.005)), [0.0066, -0.0025, 0]), 0.0033, 0.0035), 0.002));
  canal(K, fr, bd, bh, cw, cd, 3, 1.6);
  K.both(() => K.cut(K.rod(at(0.0178, -0.012, -0.0045), at(0.0195, 0.006, -0.0038), 0.0025), 0.0008));
}

// ── the atlas: the first of the neck, a ring with no body, the skull's condyles in its two cups ──────────────────────
function atlas(K) {
  const A = ATLAS.at, at = (x, t, f) => [x, A[1] + t, A[2] + f];
  K.bone('C1', 'neck2');
  // the front arch (a flat bow before the dens) and its tubercle; the back arch (half a ring) and its tubercle
  K.put(K.group([{ op: 'add', k: 0, s: K.ring(at(0, -0.0008, -0.0165), 0.027, 0.0026) }, { op: 'and', k: 0.001, s: K.plane([0, 0, -1], at(0, 0, 0.0052)) }]), 0.0015);
  K.put(K.egg(at(0, -0.0012, 0.0116), [0.0036, 0.0044, 0.0026]), 0.002);
  K.put(K.group([{ op: 'add', k: 0, s: K.ring(at(0, -0.0013, -0.0112), 0.0184, 0.0029) }, { op: 'and', k: 0.001, s: K.plane([0, 0, 1], at(0, 0, -0.0085)) }]), 0.0015);
  K.put(K.egg(at(0, -0.0012, -0.0304), [0.0036, 0.0038, 0.0026]), 0.002);
  K.both(() => {
    // the lateral mass, longer than wide, its front end nearer the middle; the transverse process on two roots, long
    K.put(K.egg(at(0.0192, 0, -0.0004), [0.0072, 0.008, 0.0116], [[1, 0, 0.38], [0, 1, 0]]), 0.0025);
    K.put(K.rod(at(0.0245, -0.0008, 0.0032), at(0.0352, -0.0024, 0.0008), 0.0023, 0.0024), 0.0018);
    K.put(K.rod(at(0.0245, -0.0008, -0.0062), at(0.0352, -0.0024, -0.0052), 0.0025, 0.0026), 0.0018);
    K.put(K.egg(at(0.0372, -0.0028, -0.0024), [0.0034, 0.003, 0.0054]), 0.0018);
  });
  K.both(() => {
    // the cups: the upper for the skull's condyle (up and inwards), the lower flat for the axis's shoulder
    K.cut(K.egg(at(0.0156, 0.0128, 0.0002), [0.0092, 0.0074, 0.013], [[1, 0, 0.38], [-0.32, 1, 0]]), 0.001);
    K.cut(K.egg(at(0.0152, -0.0122, -0.001), [0.0105, 0.0048, 0.0105], [[1, 0.22, 0], [-0.22, 1, 0]]), 0.001);
    K.cut(K.rod(at(0.0296, -0.012, -0.0016), at(0.0296, 0.012, -0.0016), 0.0031), 0.0008);   // the artery's hole
  });
}

// ── the discs between the bodies (each named for the vertebra it lies under) ─────────────────────────────────────────
function discs(K) {
  const V = VERTEBRAE;
  for (let i = 0; i < V.length; i++) {
    const up = V[i], fu = vertebraFrame(up), n = up[0], neck = n[0] === 'C', nf = neck ? 2.8 : n[0] === 'T' ? 1.9 : 2.25, e = 0.0012;
    // from the top of the body below (the sacrum's base under the last) to the underside of the body above, each end
    // cut flat a little inside the bone it meets
    let a, wl, dl, Tl, Fl;
    if (i < V.length - 1) { const lo = V[i + 1], fl = vertebraFrame(lo); a = fl.at(0, lo[5] / 2, 0); wl = lo[3]; dl = lo[4]; Tl = fl.T; Fl = fl.F; }
    else { const c = Math.cos(SACRAL_BASE.lean), s = Math.sin(SACRAL_BASE.lean); a = SACRAL_BASE.at; wl = 0.05; dl = 0.033; Tl = [0, c, s]; Fl = [0, -s, c]; }
    const b = fu.at(0, -up[5] / 2, 0), w = (up[3] + wl) / 4 - (neck ? 0.0022 : 0.0005), d = (up[4] + dl) / 4 - 0.0005, F = add(fu.F, Fl), ax = add(fu.T, Tl);
    const q = ((heartOf(n) + heartOf(V[i + 1]?.[0] ?? '')) / 2) * d;   // (between two heart-shaped bodies: widest behind its middle, as they are)
    K.bone('disc.' + n, rigOfVertebra(n), K.PART.cartilage);
    K.put(K.loft(add(a, mul(ax, -0.004)), add(b, mul(ax, 0.004)), [[w, d, d - 0.0004], [w + 0.0005, d + 0.0005, d - 0.0002], [w, d, d - 0.0004]].map((k) => [k[0], k[0], k[1] + q, k[2] - q, 0, -q, nf, n[0] === 'T' ? 3.5 : n[0] === 'L' ? 4.5 : 2.8]), { out: F }), 0.001);
    K.and(K.plane(fu.T, add(b, mul(fu.T, e))), 0.0006);
    K.and(K.plane(mul(Tl, -1), add(a, mul(Tl, -e))), 0.0006);
  }
}

export function spine(K) {
  atlas(K);
  VERTEBRAE.forEach((v, i) => { const n = v[0]; if (n === 'C2') axis(K, v); else if (n[0] === 'C') cervical(K, v, i - 1); else if (n[0] === 'T') thoracic(K, v, i - 6); else lumbar(K, v, i - 18); });
  discs(K);
}
