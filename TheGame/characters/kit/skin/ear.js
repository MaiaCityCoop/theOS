// The ear (intent 0040): the auricle as a form of its own, a thin folded plate standing off the head's side, and its
// surface drawn out of it as a closed mesh. Before, an ear was a low relief in the head's skin (an egg of gristle under
// it and a bowl carved in): a skin laid in level rings round the head cannot go round behind an ear. So the ear is its
// own surface: it stands with its root inside the head, and the head's skin runs on under it. Plain JS, no three: it
// runs in the workers that lay the skin (./build.js), or under bun.
//
// How it is laid out: in the ear's own plane, as an ear is drawn seen from the side: p backwards, q up its long axis,
// w out of the plane towards whoever looks at it (all mm; EAR.frame turns that plane to where an ear stands on a head).
// The auricle is a plate of gristle with skin on both sides, so it is written as one: its outline in the plane; where
// its middle sheet lies over each point of the plane (the bowl of the concha deep, the antihelix a ridge, the scapha a
// groove, the fold of the helix's root across the bowl, the notch under the tragus); how thick it is there (the lobe,
// which holds no gristle, the thickest). On that plate the helix's roll along its rim, the tragus as a flap over the
// ear's canal, and under it the root: what joins the bowl's back and the ear's front edge to the head. Each of those
// maps is worked out once, on a quarter-millimetre grid of the plane; the field reads them.
//
//   EAR            the table below
//   earFieldOf()   -> (p) => m    how far a point of the LEFT side ([x > 0, y, z], the body at rest, m) is outside the
//                  auricle alone (negative inside); near its surface it changes by about a metre a metre
//   earOf({ h })   -> { levels: [fine, middle, far] }, the surface on cells h, 2h and 4h a side (surface nets), each
//                  { pos, nor, tri, open, thick }: its points (m), their normals (outwards), its triangles; how open
//                  to the sky each point stands (0 … 1, the head beside it counted); how much of the ear, or of the
//                  head it stands on, lies behind the point along its normal (m, 0.02 at most): the plate is thin
//                  enough for the sun to come through, its root is not. Each level is closed: no open edge, none of
//                  more than two faces.
import { headFormOf } from './head.js';

// The ear's measures (mm in its own plane unless said). Where they are from, as remembered, none read for this:
//   its size: Farkas 1994, "Anthropometry of the Head and Face": a man's ear 62.7 mm long and 35.4 broad; its long
//     axis leaning back some 10 to 15 degrees from the upright; it stands off the head by 20 to 30 degrees, its rim 15
//     to 20 mm from the skull behind it;
//   its parts and their sizes: the anatomy books' auricle (Gray 1918, fig. 904; Tolleth 1978, "Artistic anatomy,
//     dimensions, and proportions of the external ear"): the concha about 15 by 20 mm and a centimetre deep, the helix's
//     roll 4 to 5 mm across, the lobe 15 to 18 mm long and 5 to 6 thick, the plate between them 3.
//
//   canal      where the ear canal opens, in the world (the left side; m), and where that is in the ear's plane
//   lean, off, tip   the frame, degrees: the long axis leaning back; the plane turned off the head round that axis
//              (its rear rim outwards); its top tipped outwards
//   outline    the plate's rim, round it from the front edge over the top and down the back to the lobe ([p, q])
//   seam       the line along which the ear's front edge runs into the cheek and the temple; `dive`: from how near
//              that line the plate begins to sink into the head (mm), and how far under the head's skin it ends
//   root       the outline of what joins the ear to the head under the bowl; `under`: how far inside the head it ends;
//              `flare`: how much broader it grows for each mm towards the head; `soft`: how softly it runs into the plate
//   concha     the bowl: its middle, half-breadths, squareness, depth; `wall`: from where to where (shares of its
//              half-breadth) its wall rises
//   pit        the canal's own pit in the bowl's floor: middle, radius, depth
//   crus       the helix's root, a fold running back across the bowl: from a to b, its half-breadth, how high its
//              crest stands at each end
//   antihelix  the ridge inside the rim: its stem and its two upper legs ([p, q] each), its height and half-breadth
//   scapha     the groove between helix and antihelix: how far inside the rim, its half-breadth and depth, between
//              which angles round the ear it runs (degrees: 0 backwards, 90 up)
//   fossa      the hollow between the antihelix's two legs
//   antitragus, notch   the small rise at the bowl's lower rim; the notch between it and the tragus, a channel out of
//              the bowl from a to b, its half-breadth, how deep it lies at each end
//   helix      the roll along the rim: how far inside the outline its middle runs, its radius, how far it stands out
//              of the plate, and at least `over` the head's skin (where it rises out of the temple); `arc`: the angles between which it grows from nothing (towards the lobe) and ends (at
//              its root in front)
//   front      before the bowl the plate lies low, near the cheek, not at the rim's level: how far under it, between
//              which p it falls there, between which heights q (rising from and to nothing)
//   tragus     the flap before the canal: a rise of the plate out of that low ground: its middle, its half-breadths
//              (forwards, a long ramp from the cheek; backwards, its free edge over the canal; up and down), how
//              high its crest stands, how far it has fallen at their ends
//   even       over how much the whole form is evened before its surface is drawn (mm): a form put together of
//              parts has creases where they meet, and an ear has none
//   plate, lobe   the plate's thickness; the lobe's: below `from` to `to` (q) it grows to `thick` and lies flat
export const EAR = {
  canal: { at: [0.07, 1.66, -0.012], in: [3, -0.5, -10.5] },
  lean: 12, off: 9, tip: 4,
  outline: [[-6, 6], [-6.5, 14], [-5.5, 22], [-3, 29], [2, 34], [9, 36.3], [16.5, 35.5], [23, 31.5], [27, 25], [29, 16], [29, 7], [27.5, -2],
    [24.5, -10], [21, -16], [18.5, -21], [14, -25.5], [9, -27], [4, -25.5], [0.5, -21], [-1.5, -15], [-4, -9], [-6, -2]],
  seam: { line: [[-1.5, -15], [-4, -9], [-6, -2], [-6, 6], [-6.5, 14], [-5.5, 22], [-3.5, 27]], dive: [1, 6], under: 3 },
  root: { outline: [[-8, -10], [-8.5, 2], [-8, 14], [-5.5, 23], [-1, 27], [4, 25], [8.5, 19], [11.5, 10], [12.2, 1], [10.5, -8], [6.5, -14.5], [1, -17], [-4.5, -15.5]], under: 2.5, flare: 0.45, soft: 3 },
  concha: { at: [8.2, 1.5], r: [8.2, 11.8], n: 2.3, deep: 10.5, wall: [0.55, 1.05] },
  front: { deep: 8.5, p: [4, -2], q: [-17, -11, 6, 11] },
  pit: { at: [3.4, -0.5], r: 2.8, deep: 4.5 },
  crus: { a: [-2.5, 9.5], b: [8.5, 5], half: 2.4, high: [-1.5, -9.5] },
  antihelix: { stem: [[12, -10], [17.5, -4], [19.5, 4], [19, 11], [16.5, 17]], upper: [[16.5, 17], [13, 23], [8, 28.5]], lower: [[16.5, 17], [10, 18.5], [3, 19.5]], high: 2.2, half: 2.6 },
  scapha: { in: 5.6, half: 1.8, deep: 1.8, arc: [-45, -25, 115, 135] },
  fossa: { at: [9.5, 22.5], r: [4.5, 3.2], deep: 2 },
  antitragus: { at: [11.5, -10.5], r: 3.2, high: 1 },
  notch: { a: [6.5, -6.5], b: [2.5, -12.5], half: 2.6, deep: [10, 7.5] },
  helix: { in: 2.3, r: 2.4, out: 1, over: 0.3, arc: [-62, -38, 160, 174] },
  tragus: { at: [1, -1.5], r: [6, 2, 5], high: -2.5, fall: 6.5 },
  plate: 3, lobe: { from: -12, to: -18, thick: 5.5, level: -1 }, even: 0.5,
};

const D2R = Math.PI / 180;
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The ear's frame: where its plane's middle is in the world (m) and its three axes there: backwards along its
    breadth, up its long axis, out of its plane. */
export function earFrame() {
  const L = EAR.lean * D2R, F = EAR.off * D2R, T = EAR.tip * D2R;
  const V0 = [0, Math.cos(L), -Math.sin(L)], U0 = [0, -Math.sin(L), -Math.cos(L)], N0 = [1, 0, 0];
  const U = U0.map((u, i) => u * Math.cos(F) + N0[i] * Math.sin(F)), N1 = N0.map((n, i) => n * Math.cos(F) - U0[i] * Math.sin(F));
  const V = V0.map((v, i) => v * Math.cos(T) + N1[i] * Math.sin(T)), N = N1.map((n, i) => n * Math.cos(T) - V0[i] * Math.sin(T));
  const c = EAR.canal, O = c.at.map((x, i) => x - (U[i] * c.in[0] + V[i] * c.in[1] + N[i] * c.in[2]) / 1000);
  return { O, U, V, N };
}

// ── curves in the ear's plane ───────────────────────────────────────────────────────────────────────────────
// (a smooth curve through points, `per` drawn for each given)
const through = (pts, closed, per = 8) => {
  const n = pts.length, at = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.min(n - 1, Math.max(0, i))]), out = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) for (let j = 0; j < per; j++) {
    const t = j / per, a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    out.push([0, 1].map((k) => 0.5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t * t * t)));
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
};
// (how far a point is from a line drawn through points; for a closed one, negative inside)
const farFrom = (line, closed) => (p, q) => {
  let best = Infinity, inside = false; const n = line.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = line[i], b = line[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], wx = p - a[0], wy = q - a[1], t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-9))), dx = wx - ex * t, dy = wy - ey * t, d = dx * dx + dy * dy;
    if (d < best) best = d;
    if (closed && (a[1] > q) !== (b[1] > q) && p < a[0] + ((q - a[1]) / (b[1] - a[1])) * ex) inside = !inside;
  }
  return (inside ? -1 : 1) * Math.sqrt(best);
};

// ── the plane's maps ────────────────────────────────────────────────────────────────────────────────────────
const P0 = -16, Q0 = -34, PW = 51, QW = 77, STEP = 0.25, NP = Math.round(PW / STEP) + 1, NQ = Math.round(QW / STEP) + 1;
let made = null;
function mapsOf() {
  if (made) return made;
  const E = EAR, { O, U, V, N } = earFrame(), head = headFormOf();
  const rim = farFrom(through(E.outline, true), true), seam = farFrom(through(E.seam.line, false), false), rootIn = farFrom(through(E.root.outline, true, 6), true);
  const ah = [E.antihelix.stem, E.antihelix.upper, E.antihelix.lower].map((l) => farFrom(through(l, false), false));
  // (where the head's skin lies under each point of the plane: along the plane's own outward axis; coarser, it is smooth)
  const HS = 1, HP = Math.round(PW / HS) + 1, HQ = Math.round(QW / HS) + 1, WHc = new Float32Array(HP * HQ);
  const headAt = (p, q, w) => head([Math.abs(O[0] + (U[0] * p + V[0] * q + N[0] * w) / 1000), O[1] + (U[1] * p + V[1] * q + N[1] * w) / 1000, O[2] + (U[2] * p + V[2] * q + N[2] * w) / 1000]);
  for (let j = 0; j < HQ; j++) for (let i = 0; i < HP; i++) {
    const p = P0 + i * HS, q = Q0 + j * HS; let a = 12, b = -45;
    if (headAt(p, q, a) < 0) { WHc[i + HP * j] = a; continue; } if (headAt(p, q, b) > 0) { WHc[i + HP * j] = b; continue; }
    for (let it = 0; it < 14; it++) { const m = (a + b) / 2; if (headAt(p, q, m) > 0) a = m; else b = m; } WHc[i + HP * j] = (a + b) / 2;
  }
  const headUnder = (p, q) => { const fi = Math.min(HP - 1.001, Math.max(0, (p - P0) / HS)), fj = Math.min(HQ - 1.001, Math.max(0, (q - Q0) / HS)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j; return (WHc[i + HP * j] * (1 - u) + WHc[i + 1 + HP * j] * u) * (1 - v) + (WHc[i + HP * (j + 1)] * (1 - u) + WHc[i + 1 + HP * (j + 1)] * u) * v; };
  const n = NP * NQ, M = new Float32Array(n), G = new Float32Array(n), T = new Float32Array(n), DO = new Float32Array(n), HR = new Float32Array(n), DA = new Float32Array(n), WH = new Float32Array(n);
  const between = (a, [f0, f1, t0, t1]) => smooth01((a - f0) / (f1 - f0)) * (1 - smooth01((a - t0) / (t1 - t0)));
  for (let j = 0; j < NQ; j++) for (let i = 0; i < NP; i++) {
    const p = P0 + i * STEP, q = Q0 + j * STEP, g = i + NP * j, dO = rim(p, q), wh = headUnder(p, q), round = Math.atan2(q - 5, p - 10) / D2R;
    // the bowl, its floor flat and its wall rising to its rim; the canal's pit in its floor
    const c = E.concha, rc = (Math.abs((p - c.at[0]) / c.r[0]) ** c.n + Math.abs((q - c.at[1]) / c.r[1]) ** c.n) ** (1 / c.n);
    let m = -c.deep * (1 - smooth01((rc - c.wall[0]) / (c.wall[1] - c.wall[0])));
    // (before the bowl the plate lies low: the bowl stands open forwards, only the tragus before it)
    m = smin(m, -E.front.deep * smooth01((E.front.p[0] - p) / (E.front.p[0] - E.front.p[1])) * between(q, E.front.q), 2);
    m -= E.pit.deep * Math.exp(-(((p - E.pit.at[0]) ** 2 + (q - E.pit.at[1]) ** 2) / E.pit.r ** 2));
    // the antihelix's ridge; the scapha's groove inside the rim; the hollow between the antihelix's legs
    const da = Math.min(ah[0](p, q), ah[1](p, q), ah[2](p, q)); m += E.antihelix.high * Math.exp(-((da / E.antihelix.half) ** 2));
    m -= E.scapha.deep * Math.exp(-(((dO + E.scapha.in) / E.scapha.half) ** 2)) * between(round, E.scapha.arc);
    m -= E.fossa.deep * Math.exp(-(((p - E.fossa.at[0]) / E.fossa.r[0]) ** 2 + ((q - E.fossa.at[1]) / E.fossa.r[1]) ** 2));
    // the helix's root, a fold across the bowl, falling away backwards; the antitragus; the notch before it
    { const k = E.crus, ex = k.b[0] - k.a[0], ey = k.b[1] - k.a[1], t = Math.min(1, Math.max(0, ((p - k.a[0]) * ex + (q - k.a[1]) * ey) / (ex * ex + ey * ey))), d = Math.hypot(p - k.a[0] - ex * t, q - k.a[1] - ey * t); m = smax(m, k.high[0] + (k.high[1] - k.high[0]) * t - 3.5 * (d / k.half) ** 2, 1.5); }
    m = smax(m, E.antitragus.high - 4 * (((p - E.antitragus.at[0]) ** 2 + (q - E.antitragus.at[1]) ** 2) / E.antitragus.r ** 2), 1.5);
    m = smax(m, E.tragus.high - E.tragus.fall * (((p - E.tragus.at[0]) / (p < E.tragus.at[0] ? E.tragus.r[0] : E.tragus.r[1])) ** 2 + ((q - E.tragus.at[1]) / E.tragus.r[2]) ** 2), 1.5);
    { const k = E.notch, ex = k.b[0] - k.a[0], ey = k.b[1] - k.a[1], t = Math.min(1, Math.max(0, ((p - k.a[0]) * ex + (q - k.a[1]) * ey) / (ex * ex + ey * ey))), d = Math.hypot(p - k.a[0] - ex * t, q - k.a[1] - ey * t); m = smin(m, -(k.deep[0] + (k.deep[1] - k.deep[0]) * t) + 3.5 * (d / k.half) ** 2, 1.5); }
    // the lobe: flat, thick; and along the seam the plate sinks under the head's skin
    const lobe = smooth01((E.lobe.from - q) / (E.lobe.from - E.lobe.to)); m += (E.lobe.level - m) * lobe;
    const sink = 1 - smooth01((seam(p, q) - E.seam.dive[0]) / (E.seam.dive[1] - E.seam.dive[0])); m += (wh - E.seam.under - m) * sink;
    M[g] = m; T[g] = E.plate + (E.lobe.thick - E.plate) * lobe; DO[g] = dO; DA[g] = Math.max(rootIn(p, q), dO + 1); WH[g] = wh;   // (the root only under the plate itself)
    HR[g] = E.helix.r * between(round, E.helix.arc) ** 0.7;
  }
  // (the middle sheet evened over three quarters of a millimetre: where two of its forms meet it has a crease, and a
  // plate as thick as this cannot follow one; then how steeply it lies: the plate's thickness is measured square to it)
  { const sg = 0.75 / STEP, R = Math.ceil(2.5 * sg), K = Array.from({ length: 2 * R + 1 }, (_, e) => Math.exp(-0.5 * ((e - R) / sg) ** 2)), ks = K.reduce((x, y) => x + y, 0), B = new Float32Array(n);
    for (let j = 0; j < NQ; j++) for (let i = 0; i < NP; i++) { let acc = 0; for (let e = -R; e <= R; e++) acc += K[e + R] * M[Math.min(NP - 1, Math.max(0, i + e)) + NP * j]; B[i + NP * j] = acc / ks; }
    for (let j = 0; j < NQ; j++) for (let i = 0; i < NP; i++) { let acc = 0; for (let e = -R; e <= R; e++) acc += K[e + R] * B[i + NP * Math.min(NQ - 1, Math.max(0, j + e))]; M[i + NP * j] = acc / ks; } }
  for (let j = 0; j < NQ; j++) for (let i = 0; i < NP; i++) { const a = Math.max(0, i - 1), b = Math.min(NP - 1, i + 1), c = Math.max(0, j - 1), d = Math.min(NQ - 1, j + 1); G[i + NP * j] = Math.hypot((M[b + NP * j] - M[a + NP * j]) / ((b - a) * STEP), (M[i + NP * d] - M[i + NP * c]) / ((d - c) * STEP)); }
  const R = new Float64Array(7), CH = [M, G, T, DO, HR, DA, WH];
  const read = (p, q) => { const fi = Math.min(NP - 1.001, Math.max(0, (p - P0) / STEP)), fj = Math.min(NQ - 1.001, Math.max(0, (q - Q0) / STEP)), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, g = i + NP * j; for (let c = 0; c < 7; c++) { const A = CH[c]; R[c] = (A[g] * (1 - u) + A[g + 1] * u) * (1 - v) + (A[g + NP] * (1 - u) + A[g + NP + 1] * u) * v; } return R; };
  // the field in the ear's own plane (mm): the plate, rounded at its rim; the helix's roll; the tragus; the root
  const raw = (p, q, w) => {
    const [m, g, t, dO, hr, dA, wh] = read(p, q), r = t / 2, up = (w - m) / Math.hypot(1, g);
    const a = dO + r, b = Math.abs(up); let f = Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0)) - r;
    if (hr > 0.05) f = smin(f, Math.hypot(dO + E.helix.in, w - Math.max(m + E.helix.out, wh + E.helix.over)) - hr, 1);
    return smin(f, Math.max(dA - E.root.flare * Math.min(6, Math.max(0, m - w)) + 1.2 * Math.max(0, wh - w), w - m, Math.min(wh - E.root.under, m - 2.5) - w), E.root.soft);
  };
  // (read once on a grid of half a millimetre and evened there, each cell with its neighbours: what the surface is
  // drawn out of, and what earFieldOf gives)
  const C = 0.5, LO = [P0 + 1, Q0 + 1, -29], n3 = [Math.round((PW - 2) / C) + 1, Math.round((QW - 2) / C) + 1, Math.round(39 / C) + 1], NA = n3[0], NB = n3[1], NC = n3[2];
  let F3 = new Float32Array(NA * NB * NC);
  for (let k = 0; k < NC; k++) for (let j = 0; j < NB; j++) for (let i = 0; i < NA; i++) F3[i + NA * (j + NB * k)] = raw(LO[0] + i * C, LO[1] + j * C, LO[2] + k * C);
  { const sg = E.even / C, R = Math.max(1, Math.ceil(2.5 * sg)), K = Array.from({ length: 2 * R + 1 }, (_, e) => Math.exp(-0.5 * ((e - R) / sg) ** 2)), ks = K.reduce((x, y) => x + y, 0);
    for (const [st, len] of [[1, NA], [NA, NB], [NA * NB, NC]]) { const T3 = new Float32Array(F3.length); for (let g = 0; g < F3.length; g++) { const c = Math.floor(g / st) % len; let acc = 0; for (let e = -R; e <= R; e++) acc += K[e + R] * F3[g + (Math.min(len - 1, Math.max(0, c + e)) - c) * st]; T3[g] = acc / ks; } F3 = T3; } }
  const local = (p, q, w) => {
    const fi = (p - LO[0]) / C, fj = (q - LO[1]) / C, fk = (w - LO[2]) / C, over = Math.max(-fi, fi - (NA - 1), -fj, fj - (NB - 1), -fk, fk - (NC - 1), 0) * C;
    const ci = Math.min(NA - 1.001, Math.max(0, fi)), cj = Math.min(NB - 1.001, Math.max(0, fj)), ck = Math.min(NC - 1.001, Math.max(0, fk)), i = Math.floor(ci), j = Math.floor(cj), k = Math.floor(ck), u = ci - i, v = cj - j, t = ck - k, g = i + NA * (j + NB * k), x = NA, y = NA * NB;
    const f = ((F3[g] * (1 - u) + F3[g + 1] * u) * (1 - v) + (F3[g + x] * (1 - u) + F3[g + x + 1] * u) * v) * (1 - t) + ((F3[g + y] * (1 - u) + F3[g + y + 1] * u) * (1 - v) + (F3[g + y + x] * (1 - u) + F3[g + y + x + 1] * u) * v) * t;
    return over > 0 ? Math.max(f, 1) + over : f;   // (past the grid: at least as far as its edge is)
  };
  return (made = { O, U, V, N, local, box: { lo: LO, hi: [LO[0] + (NA - 1) * C, LO[1] + (NB - 1) * C, LO[2] + (NC - 1) * C] } });
}

export function earFieldOf() {
  const { O, U, V, N, local } = mapsOf();
  return (x) => { const d = [x[0] - O[0], x[1] - O[1], x[2] - O[2]]; return local(dot(d, U) * 1000, dot(d, V) * 1000, dot(d, N) * 1000) / 1000; };
}

// ── its surface ─────────────────────────────────────────────────────────────────────────────────────────────
// Surface nets on a grid of the ear's own plane: a point in every cell the surface crosses, at the middle of where it
// crosses the cell's edges and then set onto the surface along the field's slope; a four-sided face round every edge
// of the grid that crosses it. Where a face of the grid has its corners inside and outside by turns the surface could
// pass either way and an edge would get four faces: of its two outside corners the one nearer the surface is taken
// inside first.
function netsOf(local, box, hc, fat = 0) {
  const lo = [box.lo[0] + 0.5, box.lo[1] + 0.5, box.lo[2] + 0.5], n = [0, 1, 2].map((a) => Math.floor((box.hi[a] - 0.5 - lo[a]) / hc) + 1), NX = n[0], NY = n[1], NZ = n[2], id = (i, j, k) => i + NX * (j + NY * k);
  const val = new Float32Array(NX * NY * NZ), rimOf = new Uint8Array(NX * NY * NZ);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let v = local(lo[0] + i * hc, lo[1] + j * hc, lo[2] + k * hc) - fat; if (v === 0) v = 1e-6; if (i === 0 || j === 0 || k === 0 || i === NX - 1 || j === NY - 1 || k === NZ - 1) { v = Math.max(v, 0.01); rimOf[id(i, j, k)] = 1; } val[id(i, j, k)] = v; }
  for (let pass = 0; pass < 60; pass++) {
    let turned = 0;
    for (let axis = 0; axis < 3; axis++) { const a = (axis + 1) % 3, b = (axis + 2) % 3, st = [1, NX, NX * NY];
      for (let k = 0; k < NZ - (axis === 2 ? 0 : 1); k++) for (let j = 0; j < NY - (axis === 1 ? 0 : 1); j++) for (let i = 0; i < NX - (axis === 0 ? 0 : 1); i++) {
        const g = id(i, j, k), c = [g, g + st[a], g + st[a] + st[b], g + st[b]], s = c.map((q) => val[q] < 0);
        if (s[0] === s[2] && s[1] === s[3] && s[0] !== s[1]) { const o = s[0] ? [1, 3] : [0, 2], w = rimOf[c[o[0]]] ? o[1] : rimOf[c[o[1]]] ? o[0] : val[c[o[0]]] < val[c[o[1]]] ? o[0] : o[1]; if (rimOf[c[w]]) continue; val[c[w]] = -1e-4; turned++; }   // (only ever filled, so it ends)
      } }
    if (!turned) break;
  }
  const cell = new Int32Array(NX * NY * NZ).fill(-1), pos = [], at = [];
  const CORN = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], EDGE = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const v = CORN.map(([a, b, c]) => val[id(i + a, j + b, k + c)]); let neg = 0; for (const x of v) if (x < 0) neg++; if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (const [a, b] of EDGE) { if ((v[a] < 0) === (v[b] < 0)) continue; const t = v[a] / (v[a] - v[b]); sx += CORN[a][0] + (CORN[b][0] - CORN[a][0]) * t; sy += CORN[a][1] + (CORN[b][1] - CORN[a][1]) * t; sz += CORN[a][2] + (CORN[b][2] - CORN[a][2]) * t; m++; }
    cell[id(i, j, k)] = pos.length / 3; pos.push(lo[0] + (i + sx / m) * hc, lo[1] + (j + sy / m) * hc, lo[2] + (k + sz / m) * hc); at.push(lo[0] + i * hc, lo[1] + j * hc, lo[2] + k * hc);
  }
  const quads = [], ST = [1, NX, NX * NY], N3 = [NX, NY, NZ];
  for (let axis = 0; axis < 3; axis++) { const ua = (axis + 1) % 3, wa = (axis + 2) % 3, u = ST[ua], w = ST[wa], from = [0, 0, 0], to = [NX - 1, NY - 1, NZ - 1]; from[ua] = 1; from[wa] = 1;
    for (let k = from[2]; k < to[2]; k++) for (let j = from[1]; j < to[1]; j++) for (let i = from[0]; i < to[0]; i++) {
      const g = id(i, j, k), a = val[g] < 0, b = val[g + ST[axis]] < 0; if (a === b) continue;
      const q = [cell[g], cell[g - u], cell[g - u - w], cell[g - w]]; quads.push(a ? q : q.reverse());
    } }
  // (one piece: whatever small crumb the grid left beside it is dropped)
  const par = Int32Array.from({ length: pos.length / 3 }, (_, i) => i), find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (const q of quads) { const a = find(q[0]); for (let i = 1; i < 4; i++) par[find(q[i])] = a; }
  const size = new Map(); for (let v = 0; v < par.length; v++) { const r = find(v); size.set(r, (size.get(r) ?? 0) + 1); }
  let most = -1; for (const [r, c] of size) if (most < 0 || c > size.get(most)) most = r;
  const to = new Int32Array(par.length).fill(-1), P2 = [], A2 = []; for (let v = 0; v < par.length; v++) if (find(v) === most) { to[v] = P2.length / 3; P2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); A2.push(at[v * 3], at[v * 3 + 1], at[v * 3 + 2]); }
  return { pos: P2, at: A2, quads: quads.filter((q) => to[q[0]] >= 0).map((q) => q.map((v) => to[v])) };
}

export function earOf({ h = 0.00112 } = {}) {
  const { O, U, V, N, local, box } = mapsOf(), head = headFormOf();
  const slope = (p, q, w, e = 0.3) => [local(p + e, q, w) - local(p - e, q, w), local(p, q + e, w) - local(p, q - e, w), local(p, q, w + e) - local(p, q, w - e)].map((x) => x / (2 * e));
  const world = (p, q, w) => [O[0] + (U[0] * p + V[0] * q + N[0] * w) / 1000, O[1] + (U[1] * p + V[1] * q + N[1] * w) / 1000, O[2] + (U[2] * p + V[2] * q + N[2] * w) / 1000];
  // (the ear and the head it stands on, as one: what hides the sky from a point, what lies behind it; mm in the ear's plane)
  const both = (p, q, w) => { const x = world(p, q, w); return Math.min(local(p, q, w), head([Math.abs(x[0]), x[1], x[2]]) * 1000); };
  // (rays over the half of the world a point faces, by its own normal: six round at 55 degrees and one along it)
  const RAYS = [[0, 0, 1], ...[0, 1, 2, 3, 4, 5].map((i) => [Math.sin(55 * D2R) * Math.cos((i * Math.PI) / 3), Math.sin(55 * D2R) * Math.sin((i * Math.PI) / 3), Math.cos(55 * D2R)])], REACH = [1.5, 3.5, 7, 13, 22];
  const levels = [1, 2, 4].map((mul, lv) => {
    const hc = h * 1000 * mul, { pos, at, quads } = netsOf(local, box, hc, lv === 0 ? 0 : 0.12 * hc), n = pos.length / 3;   // (a coarser level a little fuller: a plate thinner than its cells would come out in holes)
    const nor = new Float32Array(n * 3), P = new Float32Array(n * 3), open = new Float32Array(n), thick = new Float32Array(n), fat = lv === 0 ? 0 : 0.12 * hc;
    for (let v = 0; v < n; v++) {
      let p = pos[v * 3], q = pos[v * 3 + 1], w = pos[v * 3 + 2];
      // (set onto the surface along the field's slope, and kept in its own cell: a point that left it would fold its faces)
      for (let it = 0; it < 3; it++) { const f = local(p, q, w) - fat, g = slope(p, q, w), g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] || 1, s = f / g2; p = Math.min(at[v * 3] + hc, Math.max(at[v * 3], p - g[0] * s)); q = Math.min(at[v * 3 + 1] + hc, Math.max(at[v * 3 + 1], q - g[1] * s)); w = Math.min(at[v * 3 + 2] + hc, Math.max(at[v * 3 + 2], w - g[2] * s)); }
      const g = slope(p, q, w), l = Math.hypot(...g) || 1, nl = [g[0] / l, g[1] / l, g[2] / l];
      pos[v * 3] = p; pos[v * 3 + 1] = q; pos[v * 3 + 2] = w;
      // how open: along each ray, how near the ear or the head comes to it, against how near an open plane would
      const t1 = Math.abs(nl[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], a = [nl[1] * t1[2] - nl[2] * t1[1], nl[2] * t1[0] - nl[0] * t1[2], nl[0] * t1[1] - nl[1] * t1[0]], al = Math.hypot(...a), ax = a.map((x) => x / al), bx = [nl[1] * ax[2] - nl[2] * ax[1], nl[2] * ax[0] - nl[0] * ax[2], nl[0] * ax[1] - nl[1] * ax[0]];
      let sum = 0, wsum = 0;
      for (const r of RAYS) { const d = [ax[0] * r[0] + bx[0] * r[1] + nl[0] * r[2], ax[1] * r[0] + bx[1] * r[1] + nl[1] * r[2], ax[2] * r[0] + bx[2] * r[1] + nl[2] * r[2]]; let seen = 1; for (const t of REACH) seen = Math.min(seen, Math.max(0, both(p + d[0] * t, q + d[1] * t, w + d[2] * t)) / (t * r[2])); sum += seen * r[2]; wsum += r[2]; }
      open[v] = Math.min(1, sum / wsum);
      // how much lies behind it: inwards along its normal until the ear and the head both end
      let t = 0.4; for (; t < 20; t += 0.4) if (both(p - nl[0] * t, q - nl[1] * t, w - nl[2] * t) > 0) break; thick[v] = Math.min(20, t) / 1000;
      P.set(world(p, q, w), v * 3); nor.set([U[0] * nl[0] + V[0] * nl[1] + N[0] * nl[2], U[1] * nl[0] + V[1] * nl[1] + N[1] * nl[2], U[2] * nl[0] + V[2] * nl[1] + N[2] * nl[2]], v * 3);
    }
    // (each four-sided face as two triangles, parted along its shorter diagonal)
    const tri = new Uint32Array(quads.length * 6), d2 = (a, b) => (pos[a * 3] - pos[b * 3]) ** 2 + (pos[a * 3 + 1] - pos[b * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[b * 3 + 2]) ** 2;
    quads.forEach(([a, b, c, d], i) => tri.set(d2(a, c) <= d2(b, d) ? [a, b, c, a, c, d] : [a, b, d, b, c, d], i * 6));
    return { pos: P, nor, tri, open, thick };
  });
  return { levels };
}
