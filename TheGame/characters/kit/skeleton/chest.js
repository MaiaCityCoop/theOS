// The skeleton's chest (intent 0036): twelve pairs of ribs, their cartilages, the breastbone. Each rib leaves its
// vertebra (its head against the body, its tubercle against the tip of the transverse process), runs back and out to
// its angle, then round the chest and down to its front end; the upper seven reach the breastbone by their own
// cartilage, the next three by the cartilage above (the costal arch), the last two end free. Shapes and proportions from
// Gray's Anatomy (1918, figs. 115, 116, 122), as remembered, for a man of 1.80 m.
import { add, lerp, norm, spline } from './kit.js';
import { ribSeat } from './spine.js';

const deg = Math.PI / 180;
// How far the chest's front (the breastbone, the cartilages, the ribs' front ends) is set back from where the first
// pass and the rig's collarbone joint have it. 0 keeps the rig's joint in the manubrium's notch; the plates and the
// measures (the inlet 5 cm deep, the breastbone some 11 cm before the ninth vertebra) ask for about 0.04, with the
// rig's joint moved as far.
const SET_BACK = 0.04, B = (p) => [p[0], p[1], p[2] - SET_BACK];
// [the cage's half-width at this rib (its outer face), the angle's distance from the middle, the angle's z (outer face),
//  the z where the rib stands furthest out, the front end of the bone, how far its outer face looks upwards (°)]
const RIBS = [
  [0.065, 0, -0.074, -0.035, [0.045, 1.4435, 0.049], 0],
  [0.086, 0.047, -0.098, -0.03, [0.056, 1.404, 0.074], 42],
  [0.104, 0.054, -0.11, -0.024, [0.074, 1.366, 0.085], 28],
  [0.118, 0.06, -0.116, -0.021, [0.086, 1.332, 0.09], 20],
  [0.128, 0.065, -0.119, -0.02, [0.096, 1.298, 0.092], 14],
  [0.135, 0.069, -0.12, -0.02, [0.106, 1.268, 0.09], 10],
  [0.14, 0.072, -0.12, -0.02, [0.114, 1.238, 0.084], 7],
  [0.143, 0.074, -0.118, -0.021, [0.123, 1.205, 0.074], 4],
  [0.144, 0.074, -0.115, -0.022, [0.13, 1.175, 0.062], 1],
  [0.142, 0.072, -0.111, -0.024, [0.134, 1.15, 0.046], -2],
  [0.13, 0.066, -0.105, 0, [0.131, 1.142, 0.0], -6],
  [0.104, 0.055, -0.097, 0, [0.099, 1.156, -0.05], -10],
];
// the points each cartilage passes from its rib's end: to the breastbone's edge (1–7), or up along the lower edge of
// the cartilage above, into which it runs out (8–10: the costal arch)
const CARTILAGE = [
  [[0.039, 1.4438, 0.058], [0.033, 1.4444, 0.0663]],
  [[0.036, 1.4095, 0.079], [0.0145, 1.4145, 0.078]],
  [[0.045, 1.3735, 0.0895], [0.0125, 1.3878, 0.0834]],
  [[0.06, 1.3365, 0.095], [0.036, 1.3495, 0.0935], [0.014, 1.3623, 0.0885]],
  [[0.075, 1.2965, 0.0985], [0.045, 1.317, 0.099], [0.016, 1.3373, 0.0935]],
  [[0.086, 1.2635, 0.0985], [0.05, 1.2865, 0.102], [0.015, 1.3138, 0.0982]],
  [[0.096, 1.2365, 0.0945], [0.07, 1.25, 0.1015], [0.04, 1.276, 0.1045], [0.0105, 1.2946, 0.1021]],
  [[0.106, 1.2075, 0.088], [0.085, 1.2245, 0.0965], [0.0657, 1.2439, 0.1005], [0.0507, 1.2564, 0.103]],
  [[0.116, 1.184, 0.078], [0.1, 1.1995, 0.088], [0.0906, 1.2111, 0.092], [0.0756, 1.2231, 0.0965]],
  [[0.126, 1.161, 0.064], [0.114, 1.1755, 0.0765], [0.1035, 1.1871, 0.083]],
];

// the way the chest's wall faces at a point of it: out from the cage's middle line, turned upwards by `up`
const facing = (up) => (p) => { const r = norm([p[0], 0, p[2] + 0.022]), a = up * deg * Math.min(1, Math.max(0, (p[0] - 0.03) / 0.05)); return [r[0] * Math.cos(a), Math.sin(a), r[2] * Math.cos(a)]; };

// A band of bone along the smooth curve through `ctrl`: m pieces a span, each arched as the curve is between its ends
// (so that they meet without a crease); its section [tall, thick] from s0 to s1, its broad side facing out(p).
function band(K, ctrl, m, s0, s1, out, k = 0.0006) {
  const q = spline(ctrl, 2 * m), n = (q.length - 1) / 2;
  for (let i = 0; i < n; i++) {
    const a = q[2 * i], mid = q[2 * i + 1], b = q[2 * i + 2], t0 = i / n, t1 = (i + 1) / n, o = out(mid);
    const wa = s0[0] + (s1[0] - s0[0]) * t0, wb = s0[0] + (s1[0] - s0[0]) * t1, da = s0[1] + (s1[1] - s0[1]) * t0, db = s0[1] + (s1[1] - s0[1]) * t1;
    // how far the curve's middle stands off the straight piece, along the band's depth
    const u = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), ou = o[0] * u[0] + o[1] * u[1] + o[2] * u[2], d = norm([o[0] - u[0] * ou, o[1] - u[1] * ou, o[2] - u[2] * ou]);
    const off = [mid[0] - (a[0] + b[0]) / 2, mid[1] - (a[1] + b[1]) / 2, mid[2] - (a[2] + b[2]) / 2], bend = off[0] * d[0] + off[1] * d[1] + off[2] * d[2];
    K.put(K.strand(a, b, { w: (wa + wb) / 2, d: (da + db) / 2, t0: [wa, da], t1: [wb, db], bend, out: o }), k);
  }
}

function rib(K, n, side) {
  const [W, xa, za, zl, E0, up] = RIBS[n - 1], seat = ribSeat(n), H = seat.head, Tb = seat.tubercle, out = facing(up), E = n <= 10 ? B(E0) : E0;
  K.bone(`rib${n}.${side}`, n <= 7 ? 'spine3' : 'spine2');
  K.put(K.egg(H, [0.0046, 0.0052, 0.0042]), 0.0015);   // the head, against the vertebra's body
  if (n === 1) {
    // the first rib: short, broad, lying flat (its faces up and down), curving sharply round to the breastbone
    const flat = (p) => norm([0, 1, 0.45 + Math.max(0, p[2] + 0.03) * 4]);
    band(K, [H, lerp(H, Tb, 0.55), Tb], 1, [0.0042, 0.003], [0.0058, 0.0036], flat);
    K.put(K.egg(add(Tb, [0.002, 0.001, -0.003]), [0.0048, 0.004, 0.0046]), 0.002);
    const q = (E[2] - Tb[2]) / (E0[2] - Tb[2]), path = [[0.052, 1.4905, -0.058], [0.0575, 1.478, -0.036], [0.0565, 1.463, -0.008], [0.0515, 1.451, 0.024]].map((p) => [p[0], p[1], Tb[2] + (p[2] - Tb[2]) * q]);
    band(K, [Tb, ...path, E], 3, [0.0062, 0.003], [0.0086, 0.0032], flat);
    return;
  }
  if (n >= 11) {
    // the last two: no tubercle, no angle to speak of; out, down and forwards to a free point
    const mid = n === 11 ? [[0.045, 1.2445, -0.093], [0.068, 1.2325, -0.1015], [0.105, 1.2, -0.076], [0.126, 1.168, -0.036]] : [[0.04, 1.2165, -0.084], [0.057, 1.2045, -0.0935], [0.081, 1.1795, -0.0775]];
    band(K, [H, ...mid, E], 3, [0.0048, 0.003], [0.0036, 0.0022], out);
    return;
  }
  // the neck to the tubercle; the shaft back and out to the angle, then round the chest, falling all the way
  const D = Tb[1] - E[1], x = W - 0.0034, z = za + 0.0034;
  band(K, [H, add(lerp(H, Tb, 0.5), [0, 0.0005, -0.0012]), Tb], 1, [0.0044, 0.003], [0.0056, 0.0036], out);
  K.put(K.egg(add(Tb, [-0.0008, 0, -0.0034]), [0.0044, 0.0044, 0.004]), 0.002);   // the tubercle, on the transverse process's tip
  const A = [xa, Tb[1] - D * 0.07, z];
  const pts = [Tb, A, [x * 0.86, Tb[1] - D * 0.3, z + (zl - z) * 0.56], [x, Tb[1] - D * 0.53, zl], [x + (E[0] - x) * 0.36 + 0.0045, Tb[1] - D * 0.79, zl + (E[2] - zl) * 0.6], E];
  band(K, pts, 4, [0.0056, 0.0036], [0.0069, 0.0036], out);
}

function cartilage(K, n, side) {
  const E = B(RIBS[n - 1][4]), path = CARTILAGE[n - 1].map(B), first = path[0], start = lerp(E, first, -0.12);
  K.bone(`cartilage${n}.${side}`, n <= 7 ? 'spine3' : 'spine2', K.PART.cartilage);
  band(K, [start, ...path], 3, n === 1 ? [0.0072, 0.0036] : [0.0064, 0.0034], n === 1 ? [0.0066, 0.004] : n > 7 ? [0.0034, 0.0025] : [0.0056, 0.0036], facing(n === 1 ? 60 : 8));
}

function sternum(K) {
  const mirror = (half) => half.concat(half.filter((p) => p[0] !== 0).reverse().map((p) => [-p[0], p[1]]));   // an outline from its left half
  // the handle (manubrium): broad above, the notch of the throat between the two seats of the collarbones, the first
  // ribs' cartilages under them, narrowing to the angle where it meets the body
  const mv = norm([0, 0.0425, -0.016]);
  K.bone('manubrium', 'spine3');
  K.put(K.plate(B([0, 1.436, 0.0695]), [[1, 0, 0], mv], mirror([[0.0155, -0.0235], [0.015, -0.017], [0.0175, -0.009], [0.024, -0.002], [0.0315, 0.004], [0.035, 0.009], [0.034, 0.014], [0.032, 0.018], [0.0275, 0.0198], [0.022, 0.02], [0.015, 0.0216], [0.0105, 0.0232], [0.006, 0.0218], [0, 0.02]]), { tc: 0.0052, te: 0.0048, ramp: 0.008, smooth: 2 }), 0.002);
  K.both(() => K.put(K.egg(B([0.022, 1.4515, 0.0625]), [0.0105, 0.0065, 0.0072]), 0.004));   // thick where the collarbone sits
  K.both(() => K.cut(K.egg(B([0.022, 1.468, 0.0582]), [0.0135, 0.0125, 0.0125]), 0.001));   // the collarbone's seat, round the rig's joint
  // the body: long, widest low down (at the fifth cartilage), a little hollowed where each cartilage joins it
  const bv = norm([0, 0.125, -0.025]);
  K.bone('sternum', 'spine3');
  K.put(K.plate(B([0, 1.352, 0.0906]), [[1, 0, 0], bv], mirror([[0.0055, -0.0635], [0.011, -0.0585], [0.0145, -0.051], [0.0158, -0.039], [0.0186, -0.028], [0.017, -0.015], [0.018, -0.005], [0.015, 0.0105], [0.016, 0.022], [0.0132, 0.0365], [0.0144, 0.046], [0.0138, 0.056], [0.0146, 0.0635]]), { tc: 0.0046, te: 0.0042, ramp: 0.007, smooth: 2 }), 0.002);
  for (const v of [0.0365, 0.0105, -0.015]) K.put(K.egg(add(B([0, 1.352, 0.0906]), [0, v * bv[1], v * bv[2]]), [0.0125, 0.0014, 0.0052], [[1, 0, 0], bv]), 0.0025);   // where its pieces grew together
  K.put(K.egg(B([0, 1.4142, 0.0781]), [0.015, 0.0042, 0.0056], [[1, 0, 0], bv]), 0.003);   // the ridge of the angle
  // the little sword at its foot (xiphoid)
  K.bone('xiphoid', 'spine3');
  K.put(K.plate(B([0, 1.274, 0.1012]), [[1, 0, 0], norm([0, 0.032, 0.004])], mirror([[0.0065, 0.017], [0.007, 0.006], [0.0055, -0.006], [0.0025, -0.015], [0, -0.0165]]), { tc: 0.0019, te: 0.0019, ramp: 0.004, smooth: 2 }), 0.0015);
}

export function chest(K) {
  K.pair((side) => { for (let n = 1; n <= 12; n++) rib(K, n, side); });
  K.pair((side) => { for (let n = 1; n <= 10; n++) cartilage(K, n, side); });
  sternum(K);
}
