// The head's own form (intent 0040): the shape the skin of the head and the face is laid on (./target.js), written out
// as a draughtsman lays a head out: its outline seen from the front and its profile seen from the side, level by level
// from the chin to the crown (./table.js HEAD.sections), and on that ground the forms that stand out of it or lie in
// it: the nose's ridge, tip and wings, the lips, the chin, the brow, the hollow over each eye and the lids over the
// globe (HEAD.masses, HEAD.hollows, EYE). Every number is a published measure of the adult man's head or the skull's
// own (../skeleton/skull.js) with the flesh's thickness over it; none is read off a scan. Plain JS, no three.
//
// Before, the head's shape was its skull's and its face's muscles' softened over two centimetres: every measure stood
// near its norm and nothing between them was a face: the forehead fell back, the cheeks were a mask's, the mouth sat a
// centimetre under the teeth's line and the jaw ran into the throat.
//
//   headFormOf() -> (q) => m   how far a point of the left side ([x >= 0, y, z], m) is outside the head's form
//       (negative: inside). The ears' gristle, the nostrils and the neck are ./target.js's to add.
import { HEAD, EYE } from './table.js';

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

export function headFormOf() {
  const S = HEAD.sections, n = S.length, Y = S.map((s) => s[0]), yb = HEAD.chin, yv = HEAD.crown;
  // (a level's outline: its numbers between the written levels, each on a smooth curve through them, read every quarter
  // of a millimetre and evened over four: a curve through points bends smoothly but not evenly, and where its bending
  // jumps the light shows a band)
  const tang = (c, i) => (i === 0 ? (S[1][c] - S[0][c]) / (Y[1] - Y[0]) : i === n - 1 ? (S[n - 1][c] - S[n - 2][c]) / (Y[n - 1] - Y[n - 2]) : (S[i + 1][c] - S[i - 1][c]) / (Y[i + 1] - Y[i - 1]));
  const T = S.map((_, i) => [1, 2, 3, 4, 5, 6].map((c) => tang(c, i)));
  const STEP = 0.00025, NT = Math.ceil((yv - yb) / STEP) + 1, raw = new Float64Array(NT * 6), tab = new Float64Array(NT * 6);
  for (let q = 0; q < NT; q++) {
    const y = Math.min(yv, yb + q * STEP); let i = 0; while (i < n - 2 && y > Y[i + 1]) i++;
    const d = Y[i + 1] - Y[i], t = Math.min(1, Math.max(0, (y - Y[i]) / d)), t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    for (let c = 0; c < 6; c++) raw[q * 6 + c] = h00 * S[i][c + 1] + h10 * d * T[i][c] + h01 * S[i + 1][c + 1] + h11 * d * T[i + 1][c];
  }
  { const R = Math.round((3 * HEAD.even) / STEP), W = Array.from({ length: 2 * R + 1 }, (_, e) => Math.exp(-0.5 * (((e - R) * STEP) / HEAD.even) ** 2)), sum = W.reduce((a, b) => a + b, 0);
    for (let q = 0; q < NT; q++) for (let c = 0; c < 6; c++) { let acc = 0; for (let e = -R; e <= R; e++) acc += W[e + R] * raw[Math.min(NT - 1, Math.max(0, q + e)) * 6 + c]; tab[q * 6 + c] = acc / sum; } }
  const out = new Float64Array(6);
  const level = (y) => {
    const fq = Math.min(NT - 1.0001, Math.max(0, (y - yb) / STEP)), q = Math.floor(fq), u = fq - q;
    for (let c = 0; c < 6; c++) out[c] = tab[q * 6 + c] + (tab[q * 6 + 6 + c] - tab[q * 6 + c]) * u;
    // (the crown rounds over as a dome, the chin's foot as a smaller one)
    const s = y > yv - HEAD.dome ? (y - (yv - HEAD.dome)) / HEAD.dome : y < yb + HEAD.foot ? (yb + HEAD.foot - y) / HEAD.foot : 0;
    if (s > 0) { const k = Math.sqrt(Math.max(1e-6, 1 - Math.min(1, s) ** 2)); out[1] *= k; out[2] *= k; out[3] *= k; }
    return out;
  };
  // (how far outside a level's outline, measured in its own plane, mm)
  const flat = (x, y, z) => {
    const L = level(Math.min(yv - 0.0002, Math.max(yb + 0.0002, y))), dz = z * 1000 - L[0], xm = x * 1000, a = L[1], b = dz >= 0 ? L[2] : L[3], e = dz >= 0 ? L[4] : L[5];
    const r = Math.hypot(xm, dz); if (r < 1e-6) return -Math.min(a, b);
    return r * (1 - 1 / (Math.abs(xm / a) ** e + Math.abs(dz / b) ** e) ** (1 / e));
  };
  // (and truly: a level's own measure is too long where the surface lies flat, the crown's top and the chin's foot;
  // divided by how fast it changes with height, it is the distance)
  const ground = (x, y, z) => {
    const yc = Math.min(yv - 0.001, Math.max(yb + 0.001, y)), f = flat(x, yc, z), e = 0.0008, g = (flat(x, yc + e, z) - flat(x, yc - e, z)) / (2 * e * 1000), l = Math.hypot(1, g);
    return f / l / 1000 + ((y - yc) * g) / l;   // (past the crown's top and the chin's foot: on, as it ran there)
  };
  const mass = (m, x, y, z) => {
    if (m.a) {   // (a ridge along a line: from a to b, its radius from ra to rb)
      const ax = m.b[0] - m.a[0], ay = m.b[1] - m.a[1], az = m.b[2] - m.a[2], t = Math.max(0, Math.min(1, ((x - m.a[0]) * ax + (y - m.a[1]) * ay + (z - m.a[2]) * az) / (ax * ax + ay * ay + az * az)));
      return Math.hypot(x - m.a[0] - ax * t, y - m.a[1] - ay * t, z - m.a[2] - az * t) - (m.ra + (m.rb - m.ra) * t);
    }
    const dx = x - m.at[0], dy = y - m.at[1], dz = z - m.at[2] + (m.arch ?? 0) * dx * dx, r = Math.hypot(dx, dy, dz), R = m.r, e = m.n ?? 2;
    if (r < 1e-9) return -Math.min(...R);
    return r * (1 - 1 / (Math.abs(dx / (dx >= 0 ? R[0] : R[1])) ** e + Math.abs(dy / (dy >= 0 ? R[2] : R[3])) ** e + Math.abs(dz / (dz >= 0 ? R[4] : R[5])) ** e) ** (1 / e));
  };
  return (q) => {
    const x = q[0], y = q[1], z = q[2]; let v = ground(x, y, z);
    if (v > 0.06) return v;
    for (const m of HEAD.masses) v = smin(v, mass(m, x, y, z), m.k);
    for (const m of HEAD.hollows) v = smax(v, -mass(m, x, y, z), m.k);
    // (the lids: the skin over the globe, as thick as a lid is)
    v = smin(v, Math.hypot(x - EYE.at[0], y - EYE.at[1], z - EYE.at[2]) - EYE.r - EYE.lid, HEAD.lids);
    return v;
  };
}
