// The fat and the skin drawn out (intent 0036): one surface over the whole body, standing, laid at the fat's and the
// skin's thickness (./table.js) over the muscles (../muscles/build.js), the bones, the nose's and the ears' gristle and
// the eyes, and opened where the eyes and the nostrils are; then each of its points fastened to the four bones nearest
// under it, so the rig carries it as a game's skin is carried (../muscles/flesh.js). Plain JS, no three: it runs in the
// workers that grow the bones (../skeleton/grow.worker.js), or under node.
//
//   skinOf(bones, muscles, { h }) -> { rows, attr, rest, pos, fine, coarse, soles, counts }
//     muscles  what ../muscles/build.js laid, with its `inner` (the strands)
//     rows     the rows the skin adds to the muscles' (each bone a point of it hangs on: a row carried whole by that
//              bone)
//     attr     its points: the four rows each hangs on and its share on each, its normal standing, how open it stands,
//              how much of it is a lip, a nail, an areola
//     rest     each of those rows' frame standing (its middle, along it, out, across: four times four numbers a row)
//     fine, coarse   two levels of detail, each its own points: `pos` and `attr` hold the fine level's, then the coarse's
//     soles    where the feet meet the ground: the lowest points of the soles, each with the joint that carries it
//
// How it is drawn out: on a grid of cells h a side over the whole body, piece by piece (the trunk, the head, each arm
// with its hand, each finger, each leg with its foot: so the arm does not grow into the trunk where it lies along it, nor
// the fingers into one another). Each piece's muscles are filled into the grid (their surfaces, by where rows of cells
// cross them), and its small bones; how far each cell is from them is a distance transform, closed by a centimetre or
// two (a groove narrower than that between muscles is filled, as the fat and the fascia fill it) and softened a little;
// its large bones, its fills, the nose's and the ears' gristle and the eyes give their own true distances, blended in.
// The skin is where that is as far out as the fat and the skin are thick there, half way to a man's measured outline
// (./table.js PROFILES), the muscles' relief laid on it as much as the fat lets it through; the surface is drawn out of the grid (surface nets) and smoothed along itself: two surfaces,
// the arms' with their hands, and the rest's, each closed (an arm along the side only touches the trunk).
import { OUTLINE, TISSUE, TISSUE_DEFAULT, UNDER, OPENINGS, MARKS, NIPPLE, SKIN, FILL, partOf, PROFILES, MASSES, PALM, THENAR, FINGERS, MOUTH, TOES, RELIEF, LIMB_RELIEF, LOWER_FACE } from './table.js';
import { frameAt, slots } from '../muscles/build.js';
import { rigOf } from '../skeleton/pose.js';
import * as F from '../field.js';

/** How the skin is drawn out, as a number: another, and a kept drawing is drawn again. */
export const MADE = 6;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const mirror = (n) => n.replace(/\.L$/, '.R');
const solidOf = ([kind, ...a]) => kind === 'rod' ? F.rod(...a) : kind === 'ball' ? F.ball(...a) : F.egg(a[0], a[1], a[2] ? F.frame(...a[2]) : undefined);

/** The fat's and the skin's thickness at a point of the left side (m). */
export function tissueAt(q) {
  let w = 0.015, t = 0.015 * TISSUE_DEFAULT;
  for (const [, at, mm, cm] of TISSUE) { const d = Math.hypot(q[0] - at[0], q[1] - at[1], q[2] - at[2]) / (cm / 100), k = Math.exp(-d * d); w += k; t += k * mm; }
  return (t / w) / 1000;
}

export function skinOf(bones, M, { h = 0.006, soft: SOFT = 0.005, close: CLOSE = 0.012, only: ONLY = null } = {}) {
  const RIG = rigOf();
  const MUSCLE_PART = new Map(M.inner.strands.map((o) => [o.B.m.id, /^(arm|forearm|hand)$/.test(o.B.m.part) || o.B.m.id === 'deltoid' ? 'arm' : /^(thigh|leg|foot)$/.test(o.B.m.part) ? 'leg' : o.B.m.part === 'face' ? 'head' : 'trunk']));
  // ── what is under the skin, piece by piece, in a grid of cells h a side ────────────────────────────────────────
  // Each piece (the trunk with the neck and the head, each arm with its hand, each finger, each leg with its foot) is
  // filled into the grid from what it is made of: its bones (their own fields), its muscles (their surfaces, filled
  // between where a row of cells enters and leaves them), its fills and gristle and eyes. Then for each piece how far
  // each cell is from its surface (a distance transform), softened a little (fat rounds what is under it); the skin is
  // where that is as far out as the fat and the skin are thick there, the nearest piece's.
  const PARTS = ['trunk', 'arm', 'leg', 'thumb', 'index', 'middle', 'ring', 'little', 'head'], P_ = Object.fromEntries(PARTS.map((p, i) => [p, i]));
  const musclePart = (m) => (/^(arm|forearm|hand)$/.test(m.part) || m.id === 'deltoid' ? 'arm' : /^(thigh|leg|foot)$/.test(m.part) ? 'leg' : m.part === 'face' ? 'head' : 'trunk');
  const LO = [-0.34, -0.04, -0.23], HI = [0.34, 1.84, 0.27];
  const nx = Math.ceil((HI[0] - LO[0]) / h) + 1, ny = Math.ceil((HI[1] - LO[1]) / h) + 1, nz = Math.ceil((HI[2] - LO[2]) / h) + 1, NV = nx * ny * nz;
  const I = (i, j, k) => i + nx * (j + ny * k), X = (i) => LO[0] + i * h, Y = (j) => LO[1] + j * h, Z = (k) => LO[2] + k * h;
  const occ = new Uint16Array(NV);   // a bit for each piece the cell is inside
  const fillBox = (lo, hi, inside, bit) => {
    const i0 = Math.max(0, Math.floor((lo[0] - LO[0]) / h)), i1 = Math.min(nx - 1, Math.ceil((hi[0] - LO[0]) / h)), j0 = Math.max(0, Math.floor((lo[1] - LO[1]) / h)), j1 = Math.min(ny - 1, Math.ceil((hi[1] - LO[1]) / h)), k0 = Math.max(0, Math.floor((lo[2] - LO[2]) / h)), k1 = Math.min(nz - 1, Math.ceil((hi[2] - LO[2]) / h));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inside(X(i), Y(j), Z(k))) occ[I(i, j, k)] |= bit;
  };
  // the bones, the fills, the gristle and the eyes as their own fields (smooth, as true as their solids): for each cell
  // the nearest of them within a few centimetres, and its piece
  const exact = new Float32Array(NV).fill(0.05), exactPart = new Uint8Array(NV).fill(255), REACH = 0.035;   // (beyond the thickest pad: the field is true wherever the skin can be)
  const fillExact = (lo, hi, fn, part) => {
    const i0 = Math.max(0, Math.floor((lo[0] - REACH - LO[0]) / h)), i1 = Math.min(nx - 1, Math.ceil((hi[0] + REACH - LO[0]) / h)), j0 = Math.max(0, Math.floor((lo[1] - REACH - LO[1]) / h)), j1 = Math.min(ny - 1, Math.ceil((hi[1] + REACH - LO[1]) / h)), k0 = Math.max(0, Math.floor((lo[2] - REACH - LO[2]) / h)), k1 = Math.min(nz - 1, Math.ceil((hi[2] + REACH - LO[2]) / h));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const g = I(i, j, k), v = fn(X(i), Y(j), Z(k)); if (v < exact[g]) { exact[g] = v; exactPart[g] = part; } }
  };
  // (a small bone, a toe's or a finger's, a wrist's or an ankle's, is true only very near itself: it is filled into the
  // grid as the muscles are, and measured from there)
  const small = (b) => Math.min(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) < 0.03;
  for (const b of bones) { if (/^tooth/.test(b.id)) continue; if (small(b)) fillBox(b.lo, b.hi, (x, y, z) => b.F.f(x, y, z) < 0, 1 << P_[partOf(b.rig)]); else fillExact(b.lo, b.hi, (x, y, z) => b.F.f(x, y, z), P_[partOf(b.rig)]); }
  const mirrored = (fn) => (x, y, z) => fn(Math.abs(x), y, z);
  for (const [list, partOfIt] of [[FILL, (f) => f.part], [UNDER, () => 'head']]) for (const f of list) { const s2 = solidOf(f.solid), fd = F.fieldOf([{ op: 'add', k: 0, s: s2 }]); for (const sg of [1, -1]) fillExact([sg > 0 ? s2.lo[0] : -s2.hi[0], s2.lo[1], s2.lo[2]], [sg > 0 ? s2.hi[0] : -s2.lo[0], s2.hi[1], s2.hi[2]], mirrored((x, y, z) => fd.f(x, y, z)), P_[partOfIt(f)]); }
  // the muscles: each a closed surface; a row of cells along an axis is inside it between where it enters and leaves
  // (each muscle on its own, by how many times the row has gone in and come out); along all three axes, so a thin
  // sheet lying along one is still caught by the others, and at least the cell nearest a crossing pair is marked
  {
    // (each closed surface on its own: a strand's tube, or a broad muscle's one sheet)
    const SHEET = new Set(M.inner.strands.filter((o) => o.B.m.sheet && o.B.n > 1).map((o) => o.B.m.id));
    const rowMuscle = new Int32Array(M.rows.length).fill(-1), surfacePart = [];
    M.muscles.forEach((m, n) => { const id = m.id.replace(/\.[LR]$/, ''), part = P_[MUSCLE_PART.get(id) ?? 'trunk']; if (SHEET.has(id)) { for (const r of m.rows) rowMuscle[r] = surfacePart.length; surfacePart.push(part); } else for (const r of m.rows) { rowMuscle[r] = surfacePart.length; surfacePart.push(part); } });
    const partOfMuscle = surfacePart;
    // (a point of a strand that hangs on a finger's joint is in that finger's piece: the tendons along the fingers)
    // (and the long tendons over the ankle and the foot are left out of the skin: thinner than its cells, they come out as
    // spikes and cones; the ankle's and the foot's shape under the skin is their bones', the foot's own short muscles'
    // and its pads', and the Achilles tendon's)
    const SHORT = new Set(['extensorDigitorumBrevis', 'abductorHallucis', 'abductorDigitiMinimi', 'flexorDigitorumBrevis']);
    const triPart = (v) => { const row = M.attr.place[v * 4], r = M.rows[row], k = Math.min(r.keys.length - 1, Math.round(M.attr.place[v * 4 + 1] + M.attr.place[v * 4 + 2])), rig = r.keys[k].rig, p = partOf(rig); if ((/^(foot|toe\d)\./.test(rig) || (M.pos[v * 3 + 1] < 0.17 && M.attr.place[v * 4 + 3] < 0.35 && !/^(gastrocnemius|soleus)/.test(rowName[row]))) && !SHORT.has(rowName[row])) return -2; return /^(thumb|index|middle|ring|little)$/.test(p) ? P_[p] : -1; };
    const rowName = []; M.muscles.forEach((m) => { for (const r of m.rows) rowName[r] = m.id.replace(/\.[LR]$/, ''); });
    const P = M.pos, T = M.fine, n3 = [nx, ny, nz], jit = [0.93e-5, 1.37e-5, 2.11e-5];
    for (const ax of [0, 1, 2]) {
      const u = (ax + 1) % 3, w = (ax + 2) % 3, cross = new Map();
      for (let t = 0; t < T.length; t += 3) {
        const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3, m = rowMuscle[M.attr.place[T[t] * 4]], tp = triPart(T[t]);
        const au = P[a + u], aw = P[a + w], bu = P[b + u], bw = P[b + w], cu = P[c + u], cw = P[c + w];
        const det = (bu - au) * (cw - aw) - (cu - au) * (bw - aw); if (Math.abs(det) < 1e-14) continue;
        const sgn = det > 0 ? 1 : -1;
        const j0 = Math.max(0, Math.ceil((Math.min(au, bu, cu) - LO[u] - jit[u]) / h)), j1 = Math.min(n3[u] - 1, Math.floor((Math.max(au, bu, cu) - LO[u] - jit[u]) / h));
        const k0 = Math.max(0, Math.ceil((Math.min(aw, bw, cw) - LO[w] - jit[w]) / h)), k1 = Math.min(n3[w] - 1, Math.floor((Math.max(aw, bw, cw) - LO[w] - jit[w]) / h));
        for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
          const pu = LO[u] + j * h + jit[u], pw = LO[w] + k * h + jit[w], w1 = ((pu - au) * (cw - aw) - (cu - au) * (pw - aw)) / det, w2 = ((bu - au) * (pw - aw) - (pu - au) * (bw - aw)) / det, w0 = 1 - w1 - w2;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const x = w0 * P[a + ax] + w1 * P[b + ax] + w2 * P[c + ax], q = j + n3[u] * k; let l = cross.get(q); if (!l) cross.set(q, (l = [])); l.push(x, tp, m);
        }
      }
      const cell = [0, 0, 0];
      for (const [q, l] of cross) {
        cell[u] = q % n3[u]; cell[w] = Math.floor(q / n3[u]); const by = new Map();
        for (let n = 0; n < l.length; n += 3) { let e = by.get(l[n + 2]); if (!e) by.set(l[n + 2], (e = [])); e.push([l[n], l[n + 1]]); }
        for (const [m, e] of by) {
          // (in at one crossing, out at the next: however its faces are wound)
          e.sort((p1, p2) => p1[0] - p2[0]); let inside = false, from = 0, bit = 0;
          for (const [x, tp] of e) {
            inside = !inside;
            if (inside) { from = x; bit = tp === -2 ? 0 : 1 << (tp >= 0 ? tp : partOfMuscle[m]); }
            else { let i0 = Math.ceil((from - LO[ax]) / h), i1 = Math.floor((x - LO[ax]) / h); if (i0 > i1) i0 = i1 = Math.round(((from + x) / 2 - LO[ax]) / h); for (let i = Math.max(0, i0); i <= Math.min(n3[ax] - 1, i1); i++) { cell[ax] = i; occ[I(cell[0], cell[1], cell[2])] |= bit; } }
          }
        }
      }
    }
  }
  // each piece's distance (signed, m), softened; the skin's field the nearest piece's less the tissue's thickness
  // (two skins: the arms' with their hands and fingers, and the rest's, the trunk's, the legs' and the head's; each closed on
  // its own, the arm's into the trunk at the shoulder: an arm along the side only touches the trunk, and its own skin
  // goes round it there, so that raised it leaves the trunk's whole)
  const ARMS = (p) => p === P_.arm || (p >= P_.thumb && p <= P_.little);
  const field = new Float32Array(NV).fill(1), fieldPart = new Uint8Array(NV).fill(255), fieldA = new Float32Array(NV).fill(1), fieldPartA = new Uint8Array(NV).fill(255), tissue = new Float32Array(NV).fill(NaN), MARGIN = Math.ceil((0.035 + 0.012) / h);
  const edt1 = (f, n, s, o, d, v, z) => {   // Felzenszwalb's squared distance along one line
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) { let sx; do { const p = v[k]; sx = ((f[o + q * s] + q * q) - (f[o + p * s] + p * p)) / (2 * q - 2 * p); if (sx <= z[k]) k--; else break; } while (k >= 0); k++; v[k] = q; z[k] = sx; z[k + 1] = Infinity; }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[o + p * s]; }
    for (let q = 0; q < n; q++) f[o + q * s] = d[q];
  };
  const edt = (f, dims) => {
    const [a, b, c] = dims, nmax = Math.max(a, b, c), v = new Int32Array(nmax), z = new Float64Array(nmax + 1), d = new Float64Array(nmax);
    for (let kk = 0; kk < c; kk++) for (let jj = 0; jj < b; jj++) edt1(f, a, 1, a * (jj + b * kk), d, v, z);
    for (let kk = 0; kk < c; kk++) for (let ii = 0; ii < a; ii++) edt1(f, b, a, ii + a * b * kk, d, v, z);
    for (let jj = 0; jj < b; jj++) for (let ii = 0; ii < a; ii++) edt1(f, c, a * b, ii + a * jj, d, v, z);
  };
  const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  // the outline of a piece (./table.js PROFILES): at a point, how far out of it the point is (m, along the ray from the
  // section's middle: true enough near it), and how much the outline holds there (0 where it fades into a hand, a foot,
  // the head; past a closed end it rounds over as a dome)
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  const profileOf = (e) => {
    const u = norm(sub(e.b, e.a)), L = len(sub(e.b, e.a)), f0 = norm(sub(e.front, mul(u, dot(e.front, u)))), sd = cross(u, f0), S = e.sections.map((k) => k.map((v, i) => (i === 5 ? v : v / 100))), n = S.length;
    const at = (t) => { const x = Math.min(n - 1, Math.max(0, t * (n - 1))), i = Math.min(n - 2, Math.floor(x)), f = x - i; return S[0].map((_, c) => cr(S[Math.max(0, i - 1)][c], S[i][c], S[i + 1][c], S[Math.min(n - 1, i + 2)][c], f)); };
    return (q) => {
      const t = dot(sub(q, e.a), u) / L, tc = Math.min(1, Math.max(0, t)), [cz, ao, ai, bf, bb, ex] = at(tc), along = (t - tc) * L;
      const d = sub(sub(q, e.a), add(mul(u, tc * L), mul(f0, cz))), x = dot(d, sd), z = dot(d, f0), r = Math.hypot(x, z);
      const end = t < 0 ? 0 : 1, joined = along !== 0 && !!e.joins?.[end], closed = along !== 0 && !e.fade[end] && !joined;   // (a limb's piece runs on past an end where the next piece takes it over, straight)
      let ax = x >= 0 ? ao : ai, bz = z >= 0 ? bf : bb, extra = 0;
      if (closed) { const cap = 0.7 * Math.min(ax, bz), a2 = Math.abs(along); if (a2 >= cap) return { E: Math.hypot(r, a2 - cap), w: 1, limb: e.limb, along: 0 }; const k = Math.sqrt(1 - (a2 / cap) ** 2); ax *= k; bz *= k; extra = 0; }
      const rho = (Math.abs(x / ax) ** ex + Math.abs(z / bz) ** ex) ** (1 / ex), E = r > 1e-9 ? r * (1 - 1 / rho) + extra : -Math.min(ax, bz);
      const w = closed ? 1 : Math.min(e.fade[0] ? smooth01((t + 0.02) / 0.12) : 1, e.fade[1] ? smooth01((1.02 - t) / 0.12) : 1);
      // (the limb's relief here: ./table.js LIMB_RELIEF)
      let rel = 0;
      if (e.name) for (const R of LIMB_RELIEF) {
        if (R.piece !== e.name) continue;
        const ang = (Math.atan2(x, z) * 180) / Math.PI, da = ((ang - R.ang + 540) % 360) - 180, rho = Math.hypot((t - R.t) / R.dt, da / R.da);
        if (rho < 1) rel += (R.h / 1000) * (1 - smooth01((rho - 0.3) / 0.7));
      }
      return { E: E - rel, w, limb: e.limb, along: joined ? along : 0 };
    };
  };
  const massOf = (m) => (q) => {
    if (m.a) {   // (a ridge along a line: from a to b, its radius from ra to rb)
      const ab = sub(m.b, m.a), t = Math.max(0, Math.min(1, dot(sub(q, m.a), ab) / dot(ab, ab)));
      return { E: len(sub(q, add(m.a, mul(ab, t)))) - (m.ra + (m.rb - m.ra) * t), w: 0, k: m.k };
    }
    const x = q[0] - m.at[0], y = q[1] - m.at[1], z = q[2] - m.at[2] + (m.arch ?? 0) * (q[0] - m.at[0]) ** 2 + (m.lean ?? 0) * Math.max(0, q[1] - m.at[1]), r = Math.hypot(x, y, z), [ro, ri, ru, rd, rf, rb] = m.r;
    const rho = (Math.abs(x / (x >= 0 ? ro : ri)) ** m.n + Math.abs(y / (y >= 0 ? ru : rd)) ** m.n + Math.abs(z / (z >= 0 ? rf : rb)) ** m.n) ** (1 / m.n);
    return { E: r > 1e-9 ? r * (1 - 1 / rho) : -Math.min(...m.r), w: 0, k: m.k };
  };
  const EYE = (({ solid: [, at, r] }) => ({ at: [at[0], at[1], at[2] + 0.002], r }))(UNDER.find((u) => u.rig === 'eye'));
  // (the head's own features over its softened shape: the nose's and the ears' gristle and the eyes sharp, the lips and
  // the chin, the eye's socket hollowed in front of the ball and the lids round it their own thickness, 1.5 mm)
  const features = (v, qq, t) => {
    let fe = Infinity; for (const u of underFields) fe = Math.min(fe, u.f(qq[0], qq[1], qq[2]));
    v = smin(v, fe - Math.min(t, 0.003), 0.004);
    for (const m of headMasses) { const o = m(qq); v = smin(v, o.E, o.k); }
    const e = sub(qq, EYE.at), cav = Math.hypot(e[0] / 0.019, e[1] / 0.0135, e[2] / 0.0165) - 1;
    if (cav < 0.5) { v = -smin(-v, Math.max(cav * 0.011, -e[2] - 0.002), 0.006); v = smin(v, Math.hypot(...e) - EYE.r - 0.0015, 0.007); }   // (only in front of the ball's middle)
    // (the lips part: a slit between them, round the teeth's arch, its corners closing)
    const mx = qq[0] / MOUTH.half;
    if (mx < 1.2) { const zc = MOUTH.at[2] - MOUTH.arch * qq[0] ** 2, depth = MOUTH.deep * Math.max(0, 1 - mx * mx), slit = Math.max(Math.abs(qq[1] - MOUTH.at[1]) - MOUTH.gap * Math.max(0.3, 1 - mx * mx), zc - depth - qq[2]); v = Math.max(v, -slit); }
    return v;
  };
  const headMasses = MASSES.filter((m) => m.part === 'head').map((m) => massOf(m));
  const underFields = UNDER.map((u) => F.fieldOf([{ op: 'add', k: 0, s: solidOf(u.solid) }]));
  // (the trunk's relief, ./table.js RELIEF: how far its skin stands out of the outline at a point of its front or back,
  // m; blocks rounded at their corners and soft at their edges, lines along a segment, each as high as it is)
  const reliefAt = (q) => {
    let d = 0; const front = smooth01((q[2] + 0.02) / 0.06), back = smooth01((-q[2] - 0.02) / 0.06);
    for (const r of RELIEF) {
      const side = r.side === 'back' ? back : front; if (side <= 0) continue;
      let rho;
      if (r.a) { const ab = [r.b[0] - r.a[0], r.b[1] - r.a[1]], t = Math.max(0, Math.min(1, ((q[0] - r.a[0]) * ab[0] + (q[1] - r.a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2))); rho = Math.hypot(q[0] - r.a[0] - ab[0] * t, q[1] - r.a[1] - ab[1] * t) / r.w; }
      else { const n = r.n ?? 2; rho = (Math.abs((q[0] - r.at[0]) / r.r[0]) ** n + Math.abs((q[1] - r.at[1]) / r.r[1]) ** n) ** (1 / n); }
      if (rho >= 1) continue;
      d += side * (r.h / 1000) * (1 - smooth01((rho - (1 - (r.soft ?? 0.5))) / (r.soft ?? 0.5)));
    }
    return d;
  };
  const profilesOf = PARTS.map((p) => p === 'head' ? [] : [...PROFILES.filter((e) => e.part === p).map(profileOf), ...MASSES.filter((m) => m.part === p).map(massOf)]);
  // (a field softened a long way, in place: three running means of 2r+1 cells along each axis)
  const blurBox = (f, dims, r) => {
    const n = f.length, t = new Float32Array(n);
    for (let pass = 0; pass < 3; pass++) for (const [s, m] of [[1, dims[0]], [dims[0], dims[1]], [dims[0] * dims[1], dims[2]]]) {
      for (let q0 = 0; q0 < n; q0++) {
        if (Math.floor(q0 / s) % m !== 0) continue;   // (each line once, from its first cell)
        let acc = 0, cnt = 0; for (let e = 0; e <= r && e < m; e++) { acc += f[q0 + e * s]; cnt++; }
        for (let c = 0; c < m; c++) { t[q0 + c * s] = acc / cnt; const out = c - r, inn = c + r + 1; if (out >= 0) { acc -= f[q0 + out * s]; cnt--; } if (inn < m) { acc += f[q0 + inn * s]; cnt++; } }
      }
      for (let q = 0; q < n; q++) f[q] = t[q];
    }
  };
  // (the bones softened by a centimetre and a half: on the top of the shoulder the acromion and the collarbone's end
  // show through the skin as one smooth rise, not as their own ridges and knobs)
  const exactSoft = Float32Array.from(exact, (v) => Math.min(0.03, v)); blurBox(exactSoft, [nx, ny, nz], 2);
  const headBase = new Float32Array(NV).fill(1); let restField = null;
  for (let p = 0; p < PARTS.length; p++) {
    if (p === P_.head) restField = Float32Array.from(field);   // (all but the head: the neck the head's fine skin runs into)
    if (ONLY && !ONLY.includes(PARTS[p])) continue;
    const bit = 1 << p; let lo = [nx, ny, nz], hi = [-1, -1, -1];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if ((occ[I(i, j, k)] & bit) || (exactPart[I(i, j, k)] === p && exact[I(i, j, k)] < 0)) { if (i < lo[0]) lo[0] = i; if (j < lo[1]) lo[1] = j; if (k < lo[2]) lo[2] = k; if (i > hi[0]) hi[0] = i; if (j > hi[1]) hi[1] = j; if (k > hi[2]) hi[2] = k; }
    if (hi[0] < 0) continue;
    lo = lo.map((v) => Math.max(0, v - MARGIN)); hi = [Math.min(nx - 1, hi[0] + MARGIN), Math.min(ny - 1, hi[1] + MARGIN), Math.min(nz - 1, hi[2] + MARGIN)];
    const dims = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1], n = dims[0] * dims[1] * dims[2], BIG = 1e12;
    const out = new Float64Array(n), inn = new Float64Array(n), at = (i, j, k) => (i - lo[0]) + dims[0] * ((j - lo[1]) + dims[1] * (k - lo[2]));
    for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) { const ins = occ[I(i, j, k)] & bit, q = at(i, j, k); out[q] = ins ? 0 : BIG; inn[q] = ins ? BIG : 0; }
    // (closed: grown by CLOSE and shrunk back by as much, so a groove narrower than twice that between two muscles is
    // filled, as the fat and the fascia fill it, and nothing that stands out is worn away. Over the trunk, the legs and
    // the arms by 3.7 and 2.6 cm: the fascia wraps each limb's muscles and the trunk's into one, as a stocking does, so
    // the skin drawn from them is one surface, not the ropes and gaps of the strands under it)
    edt(out, dims);
    const close = CLOSE * ({ trunk: 3.1, leg: 3.1, arm: 2.2, head: 0.35 }[PARTS[p]] ?? 0.66), r2 = (close / h + 0.5) ** 2;   // (in cells from cell to cell: a cell is half one beyond its middle)
    for (let q = 0; q < n; q++) { const ins = out[q] <= r2; out[q] = ins ? 0 : BIG; inn[q] = ins ? BIG : 0; }
    edt(out, dims); edt(inn, dims);
    let sd = new Float32Array(n); for (let q = 0; q < n; q++) sd[q] = Math.min(0.06, (out[q] > 0 ? Math.sqrt(out[q]) - 0.5 : 0.5 - Math.sqrt(inn[q])) * h + close);

    // (about SOFT metres: the fat over a lean man rounds the muscles' edges and fills the grooves between them)
    const W = [1, 4, 6, 4, 1].map((x) => x / 16), passes = Math.max(1, Math.round((SOFT / h) ** 2));
    for (let pass = 0; pass < passes; pass++) for (const [s, len_] of [[1, dims[0]], [dims[0], dims[1]], [dims[0] * dims[1], dims[2]]]) {
      const t = new Float32Array(n);
      for (let q = 0; q < n; q++) { const c = Math.floor(q / s) % len_; let acc = 0, ws = 0; for (let e = -2; e <= 2; e++) { if (c + e < 0 || c + e >= len_) continue; acc += W[e + 2] * sd[q + e * s]; ws += W[e + 2]; } t[q] = acc / ws; }
      sd = t;
    }
    // (the muscles' relief: how far their surface stands out of itself softened over four centimetres: a pectoral's,
    // a rectus's, a deltoid's own shape, not only their edges)
    const pro = profilesOf[p], head = p === P_.head;
    // (the head: its skull, its muscles, its gristle and its eyes as one field, softened over two centimetres as the
    // scalp and the face's fat soften what is under them; a little of what stands out of that laid back on, and the
    // nose's and the ears' gristle and the eyes sharp again over it)
    const whole = head ? new Float32Array(n) : null;
    if (head) for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) { const g = I(i, j, k), q = at(i, j, k); whole[q] = exactPart[g] === p ? smin(sd[q], exact[g], 0.005) : sd[q]; }
    const far = pro.length ? Float32Array.from(sd) : head ? Float32Array.from(whole) : null; if (far) blurBox(far, dims, Math.round((head ? 0.014 : 0.04) / h));
    // (and softened a little: the skin bridges what is narrower than a centimetre between two bellies)
    const mid = pro.length ? Float32Array.from(sd) : null; if (mid) blurBox(mid, dims, 1);
    for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
      // (the muscles' and the bones' and the rest's blended over a few millimetres)
      const g = I(i, j, k), d = exactPart[g] === p ? smin(sd[at(i, j, k)], exact[g], 0.005) : sd[at(i, j, k)]; if (d > 0.055) continue;
      if (Number.isNaN(tissue[g])) tissue[g] = tissueAt([Math.abs(X(i)), Y(j), Z(k)]);
      let v = d - tissue[g];
      if (head) {
        // (only the face's front, the brow, the nose's root, the lips' and the chin's ground, keeps a little of what stands
        // out: over the cheeks and the jaw's side what the muscles under them leave is bumps the fat smooths away)
        const q2 = at(i, j, k), qq = [Math.abs(X(i)), Y(j), Z(k)];
        v = far[q2] + 0.12 * smooth01((qq[2] - 0.07) / 0.03) * (whole[q2] - far[q2]) - tissue[g];
        headBase[g] = v; v = features(v, qq, tissue[g]);
      }
      // (each leg on its own side of the middle: where the knees or the thighs touch, standing, the skin goes round
      // each, and does not bridge them to be torn as they part)
      if (p === P_.leg) v = Math.max(v, 0.003 - Math.abs(X(i)), 0.0005 - Y(j));   // (and its sole flat on the ground, as a sole stood on is)
      // (where the piece has an outline: the skin on it, with the muscles' relief laid on as much as the fat there lets
      // it through (all of it under 3 mm of fat, a third under 9: a slightly muscular man's muscles show), and never
      // under a bone near the skin: the collarbone, the elbow, the knee, the shin, the crest of the pelvis stand out of
      // it as they do)
      if (pro.length) {
        const q = [Math.abs(X(i)), Y(j), Z(k)]; let E = Infinity, w = 0;
        // (the pieces of one limb, the upper arm and the forearm, the thigh and the leg, are one outline: at the joint
        // between them each holds as much as the point is within it, over four centimetres either side, and the outline is
        // their mean, so the knee is no fuller than either piece makes it. The rest, the trunk and the masses on it, run
        // into one another softly)
        let lw = 0, le = 0;
        for (const P of pro) {
          const o = P(q);
          if (o.limb) { const s = 1 - smooth01(Math.abs(o.along) / 0.05); if (s > 0) { lw += s; le += s * o.E; w = Math.max(w, o.w * Math.min(1, lw)); } continue; }
          E = E === Infinity ? o.E : smin(E, o.E, o.k ?? 0.012); w = Math.max(w, o.w);   // (a mass holds no weight of its own: it adds to the outline where the outline holds)
        }
        if (lw > 0) E = E === Infinity ? le / lw : smin(E, le / lw, 0.012);
        if (w > 0) {
          const g2 = at(i, j, k), keep = Math.min(1, Math.max(0.3, 1.3 - tissue[g] / 0.009)) * (Y(j) < 0.13 ? 0.3 + 0.7 * smooth01((Y(j) - 0.09) / 0.04) : 1);   // (the foot's bones and tendons, under little fat, damped: its outline is its shape)
          let s2 = E - (p === P_.trunk ? reliefAt(q) : 0) + keep * Math.max(p === P_.trunk ? -0.005 : -0.002, mid[g2] - far[g2]) * (p === P_.trunk ? 2.0 : 1.2);   // (what stands out shows; a groove between two muscles the fat fills, but for two millimetres (four over the trunk, where the pectoral's edge, the rectus's lines and the serratus show))
          if (exactPart[g] === p) { const sh = p === P_.trunk && Y(j) > 1.4 && Math.abs(X(i)) > 0.13, cap = sh ? 0.008 : 0.0025; s2 = smin(s2, (sh ? exactSoft[g] : exact[g]) - Math.max(cap, 0.4 * tissue[g]), 0.02); }   // (the acromion and the collarbone's end under the deltoid's tendon and the trapezius: 13 mm under the skin, deeper than other bones near it; held 7 mm under, they stood as knobs)
          v = v + w * OUTLINE * (s2 - v);
        }
      }
      const fl = ARMS(p) ? fieldA : field, fp = ARMS(p) ? fieldPartA : fieldPart;
      // (the trunk and a leg, or the trunk and the head, run into one another softly, the groin and the neck a fold,
      // not a seam)
      const was = fp[g], soft = was !== 255 && was !== p && (was === P_.trunk || p === P_.trunk) ? 0.03 : 0;
      const old = fl[g], u = soft ? smin(old, v, soft) : Math.min(old, v); if (u < old) { fl[g] = u; if (v < old) fp[g] = p; }
      // (the top of the arm, the deltoid, is in the trunk's skin too, so the shoulder is one surface from the neck over
      // it; below it, as the arm's own skin takes over, it sinks under that skin, a millimetre and a half at once (so the
      // two are not drawn in the same place, each showing through the other in patches) and a millimetre and a half more
      // for each centimetre below the shoulder's top: slowly, so the trunk's skin slides under the arm's rather than
      // ending in an edge. Above it the arm's sinks as fast: the top of the shoulder is the trunk's own)
      if (p === P_.arm && Y(j) > 1.3) {
        const vb = v + 0.0015 * smooth01((1.445 - Y(j)) / 0.015) + Math.max(0, 1.43 - Y(j)) * 0.15 + Math.max(0, Y(j) - 1.455) * 0.8, ob = field[g], ub = smin(ob, vb, 0.045);   // (softly, wherever the trunk's own skin is: no crease where it ends)
        if (ub < ob) { field[g] = ub; if (vb < ob) fieldPart[g] = p; }
      }
    }
  }
  // the openings carved, the nipples raised
  const open = F.fieldOf(OPENINGS.map((u) => ({ op: 'add', k: 0.001, s: solidOf(u.solid) })));
  for (const u of OPENINGS) { const s2 = solidOf(u.solid); for (const sg of [1, -1]) { const lo = [sg > 0 ? s2.lo[0] : -s2.hi[0], s2.lo[1], s2.lo[2]], hi = [sg > 0 ? s2.hi[0] : -s2.lo[0], s2.hi[1], s2.hi[2]]; for (let k = Math.max(0, Math.floor((lo[2] - LO[2]) / h)); k <= Math.min(nz - 1, Math.ceil((hi[2] - LO[2]) / h)); k++) for (let j = Math.max(0, Math.floor((lo[1] - LO[1]) / h)); j <= Math.min(ny - 1, Math.ceil((hi[1] - LO[1]) / h)); j++) for (let i = Math.max(0, Math.floor((lo[0] - LO[0]) / h)); i <= Math.min(nx - 1, Math.ceil((hi[0] - LO[0]) / h)); i++) { const g = I(i, j, k); field[g] = Math.max(field[g], -open.f(Math.abs(X(i)), Y(j), Z(k))); } } }
  const sample = (p, fl = field) => { const fi = (p[0] - LO[0]) / h, fj = (p[1] - LO[1]) / h, fk = (p[2] - LO[2]) / h, i = Math.floor(fi), j = Math.floor(fj), k = Math.floor(fk), u = fi - i, v = fj - j, w = fk - k; let s = 0; for (let n = 0; n < 8; n++) { const a = n & 1, b = (n >> 1) & 1, c = (n >> 2) & 1; s += (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w) * fl[I(i + a, j + b, k + c)]; } return s; };
  let nip = null;
  { let z0 = 0, z1 = 0.2; for (let it = 0; it < 30; it++) { const zz = (z0 + z1) / 2; if (sample([NIPPLE.at[0], NIPPLE.at[1], zz]) < 0) z0 = zz; else z1 = zz; } nip = [NIPPLE.at[0], NIPPLE.at[1], z0 - NIPPLE.r * 0.4]; }
  for (const sg of [1, -1]) { const c = [sg * nip[0], nip[1], nip[2]], R = Math.ceil(0.012 / h), ci = Math.round((c[0] - LO[0]) / h), cj = Math.round((c[1] - LO[1]) / h), ck = Math.round((c[2] - LO[2]) / h); for (let k = ck - R; k <= ck + R; k++) for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) { const g = I(i, j, k); field[g] = smin(field[g], Math.hypot(X(i) - c[0], Y(j) - c[1], Z(k) - c[2]) - NIPPLE.r, 0.002); } }

  // (a grid: its field, its cells' count along each axis, its first corner, its cell)
  const gridOf = (f, n, lo, hc) => ({ f, n, lo, h: hc, I: (i, j, k) => i + n[0] * (j + n[1] * k), sample: (p) => { const fi = (p[0] - lo[0]) / hc, fj = (p[1] - lo[1]) / hc, fk = (p[2] - lo[2]) / hc, i = Math.max(0, Math.min(n[0] - 2, Math.floor(fi))), j = Math.max(0, Math.min(n[1] - 2, Math.floor(fj))), k = Math.max(0, Math.min(n[2] - 2, Math.floor(fk))), u = fi - i, v = fj - j, w = fk - k; let s = 0; for (let m = 0; m < 8; m++) { const a = m & 1, b = (m >> 1) & 1, c = (m >> 2) & 1; s += (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w) * f[i + a + n[0] * (j + b + n[1] * (k + c))]; } return s; } });
  // ── the head drawn finer: its features (the lids, the lips, the nostrils, the ears) are a few millimetres, finer than
  // the body's cells. On cells a third as large, over the head and the top of the neck: its softened shape read from
  // the body's grid (smooth: it reads true between the cells), its features laid on again, the openings carved, run
  // into the neck as the body's grid runs it
  const GB = gridOf(field, [nx, ny, nz], LO, h), GA = gridOf(fieldA, [nx, ny, nz], LO, h);
  const HF = h / 3, HLO = [-0.105, 1.51, -0.135], HN = [Math.ceil(0.21 / HF) + 1, Math.ceil(0.32 / HF) + 1, Math.ceil(0.3 / HF) + 1];
  // (the lower face set back, ./table.js LOWER_FACE: its shape read from further forward, so it stands further back)
  const warpFace = (q) => {
    const W = LOWER_FACE, y = q[1], ax = Math.abs(q[0]);
    const wy = y > W.top ? 0 : y > W.mouth ? (W.lips / W.chin) * smooth01((W.top - y) / (W.top - W.mouth)) : y > W.chinAt ? W.lips / W.chin + (1 - W.lips / W.chin) * smooth01((W.mouth - y) / (W.mouth - W.chinAt)) : 1;
    const w = wy * (1 - smooth01((ax - W.half) / (W.side - W.half))) * smooth01((q[2] - W.back) / (W.front - W.back));
    // (and the jaw's front curved round from the chin: set back the more the further from the middle, to the jaw's side)
    const jw = smooth01((ax - W.jawIn) / (W.jawOut - W.jawIn)) * (1 - smooth01((ax - W.jawOut) / (W.jawFade - W.jawOut))) * smooth01((W.jawTop - y) / (W.jawTop - W.jawLow)) * smooth01((q[2] - 0.02) / 0.03);
    const dz = W.chin * w + W.jaw * jw;
    return dz > 0 ? [q[0], q[1], q[2] + dz] : q;
  };
  const hfield = new Float32Array(HN[0] * HN[1] * HN[2]).fill(1), hpart = new Uint8Array(hfield.length).fill(P_.trunk), hnear = new Uint8Array(hfield.length);
  {
    const Hb = gridOf(headBase, [nx, ny, nz], LO, h), Rf = gridOf(restField ?? field, [nx, ny, nz], LO, h), Tf = gridOf(Float32Array.from(tissue, (t) => (Number.isNaN(t) ? 0.003 : t)), [nx, ny, nz], LO, h);
    for (let k = 0; k < HN[2]; k++) for (let j = 0; j < HN[1]; j++) for (let i = 0; i < HN[0]; i++) {
      const q0 = [HLO[0] + i * HF, HLO[1] + j * HF, HLO[2] + k * HF], q = warpFace(q0), hb = Hb.sample(q), rest = Rf.sample(q0); let v = hb;
      if (hb < 0.025) { const qq = [Math.abs(q[0]), q[1], q[2]]; v = features(hb, qq, Tf.sample(q)); v = Math.max(v, -open.f(qq[0], qq[1], qq[2])); }
      const g = i + HN[0] * (j + HN[1] * k); hfield[g] = smin(v, rest, 0.022); hpart[g] = v < rest ? P_.head : P_.trunk; hnear[g] = v < rest + 0.003 ? 2 : v < rest + 0.01 ? 1 : 0;   // (kept a centimetre into the neck: the two skins lie together there, no gap between)
    }
  }
  const GH = gridOf(hfield, HN, HLO, HF);
  const hcell = (p) => { const i = Math.round((p[0] - HLO[0]) / HF), j = Math.round((p[1] - HLO[1]) / HF), k = Math.round((p[2] - HLO[2]) / HF); return Math.max(0, Math.min(HN[0] - 1, i)) + HN[0] * (Math.max(0, Math.min(HN[1] - 1, j)) + HN[1] * Math.max(0, Math.min(HN[2] - 1, k))); };
  const hpartAt = (p) => hpart[hcell(p)], hnearAt = (p) => hnear[hcell(p)];

  // ── the hands drawn finer: a finger is two centimetres across, a few of the body's cells. The left hand on cells a
  // third as large: its palm and the ball of its thumb, each finger three tapering rods from its knuckle to its tip
  // (./table.js), the fingers apart but webbed to the palm, the wrist run into the forearm's skin; the right its mirror
  let handRods = null;
  const HLo = [0.165, 0.635, -0.09], HHi = [0.275, 0.905, 0.075], HNn = [0, 1, 2].map((a) => Math.ceil((HHi[a] - HLo[a]) / HF) + 1);
  const handF = new Float32Array(HNn[0] * HNn[1] * HNn[2]).fill(1), handP = new Uint8Array(handF.length).fill(P_.arm);
  {
    handRods = Object.entries(FINGERS).map(([f, [r1, r2, r3, r4, len]]) => {
      const j = [1, 2, 3].map((i) => RIG[f + i + '.L'].at), tip = add(j[2], mul(norm(sub(j[2], j[1])), len));
      return { part: P_[f], segs: [[j[0], j[1], r1, r2], [j[1], j[2], r2, r3], [j[2], tip, r3, r4]] };
    });
    const rod = (q, [a, b, ra, rb]) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(q, a), ab) / dot(ab, ab))), c = add(a, mul(ab, t)), d = sub(q, c); return Math.hypot(d[0] / 0.86, d[1], d[2]) - (ra + (rb - ra) * t); };
    const palm = massOf(PALM), thenar = massOf(THENAR);
    const rods = handRods;
    for (let k = 0; k < HNn[2]; k++) for (let j = 0; j < HNn[1]; j++) for (let i = 0; i < HNn[0]; i++) {
      const q = [HLo[0] + i * HF, HLo[1] + j * HF, HLo[2] + k * HF];
      let hand = smin(palm(q).E, thenar(q).E, THENAR.k), best = hand, part = P_.arm;
      // (the forearm: a fifth of a millimetre outside the arm's own skin where the two lie together: the hand's fine edge
      // lies over the arm's, which dives under it)
      const fore = GA.sample(q) + Math.max(0, 0.878 - q[1]) * 0.3 - 0.0002; hand = smin(hand, fore, 0.0005 + 0.02 * smooth01((0.872 - q[1]) / 0.03)); if (fore < best) best = fore;   // (softly into the palm, but at the wrist itself no fuller than the forearm: no cuff)
      let v = hand;
      // (the fingers side by side, touching where a relaxed hand's do and parting into a crease, not a slit thinner than
      // the cells can draw; all of them webbed to the palm at once: one web, not one for each finger cutting into its
      // neighbour's)
      let all = Infinity;
      for (const R of rods) { let f = Infinity; for (const sg of R.segs) f = f === Infinity ? rod(q, sg) : smin(f, rod(q, sg), 0.003); if (f < best) { best = f; part = R.part; } all = all === Infinity ? f : smin(all, f, 0.0025); }
      v = Math.min(v, smin(hand, all, 0.011));
      const g = i + HNn[0] * (j + HNn[1] * k); handF[g] = v; handP[g] = part;
    }
  }
  const GHand = gridOf(handF, HNn, HLo, HF);
  // (and the arm's own skin dives under the hand's from the wrist down, so where it ends no edge shows: it is under the
  // hand's skin there. Only near, where the fine hand is drawn)
  const fieldA2 = Float32Array.from(fieldA);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const y = Y(j); if (y > 0.89) continue; for (let i = 0; i < nx; i++) if (Math.abs(X(i)) > 0.15) fieldA2[I(i, j, k)] += (0.89 - y) * 1.5; }
  const GA2 = gridOf(fieldA2, [nx, ny, nz], LO, h);
  const handPartAt = (p) => { const q = [Math.abs(p[0]), p[1], p[2]], i = Math.round((q[0] - HLo[0]) / HF), j = Math.round((q[1] - HLo[1]) / HF), k = Math.round((q[2] - HLo[2]) / HF); return handP[Math.max(0, Math.min(HNn[0] - 1, i)) + HNn[0] * (Math.max(0, Math.min(HNn[1] - 1, j)) + HNn[1] * Math.max(0, Math.min(HNn[2] - 1, k)))]; };
  // (what stands round a point of a skin: the skins as fine as its own, the trunk's and the arms' together)
  const occluder = (piece, o) => piece === 2 ? Math.min(GH.sample(o), GA.sample(o)) : piece === 3 || piece === 4 ? Math.min(GHand.sample([Math.abs(o[0]), o[1], o[2]]), GB.sample(o)) : piece >= 5 ? Math.min(GFoot.sample([Math.abs(o[0]), o[1], o[2]]), GB.sample(o)) : Math.min(GB.sample(o), GA.sample(o));
  // ── the feet likewise: the heel, the arch and the instep the body's own skin, cut off at the ball of the foot; each
  // toe a flattened tapering rod from its knuckle to its tip (./table.js TOES), the toes apart but webbed to the ball
  const FLo = [0.02, -0.004, -0.13], FHi = [0.165, 0.115, 0.215], FNn = [0, 1, 2].map((a) => Math.ceil((FHi[a] - FLo[a]) / HF) + 1);
  const footF = new Float32Array(FNn[0] * FNn[1] * FNn[2]).fill(1), footP = new Uint8Array(footF.length).fill(P_.leg);
  const FOOT_BLUR = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0.7, 0, 0.7], [-0.7, 0, -0.7], [0, 0.7, 0.7], [0, -0.7, -0.7]];
  const toeRods = Object.entries(TOES).map(([t, [r0, r1, tip, flat]]) => ({ a: RIG[t + '.L'].at, b: tip, r0, r1, flat }));
  const toeRod = (q, R) => { const ab = sub(R.b, R.a), t = Math.max(0, Math.min(1, dot(sub(q, R.a), ab) / dot(ab, ab))), c = add(R.a, mul(ab, t)), d = sub(q, c); return Math.hypot(d[0], d[1] / R.flat, d[2]) - (R.r0 + (R.r1 - R.r0) * t); };
  {
    // (the line of the knuckles, across the foot: the old toes are cut a centimetre and a half before it)
    const kn = toeRods.map((R) => R.a), ball = (x) => { let i = 0; while (i < kn.length - 2 && x > kn[i + 1][0]) i++; const f = Math.max(0, Math.min(1, (x - kn[i][0]) / (kn[i + 1][0] - kn[i][0]))); return kn[i][2] + (kn[i + 1][2] - kn[i][2]) * f; };
    for (let k = 0; k < FNn[2]; k++) for (let j = 0; j < FNn[1]; j++) for (let i = 0; i < FNn[0]; i++) {
      const q = [FLo[0] + i * HF, FLo[1] + j * HF, FLo[2] + k * HF], soft = smooth01((0.085 - q[1]) / 0.02) * 0.007;
      let body = GB.sample(q); if (soft > 0) { let a = 0; for (const o of FOOT_BLUR) a += GB.sample([q[0] + o[0] * soft, q[1] + o[1] * soft, q[2] + o[2] * soft]); body = a / FOOT_BLUR.length; }
      body += 0.0003 * smooth01((q[1] - 0.06) / 0.02);   // (the foot's own: its tendons and the gaps between its long bones under the fat smoothed away; inside the leg's skin at the ankle)
      const cut = -smin(-body, -(q[2] - ball(q[0]) - 0.004), 0.02);   // (the foot without its old toes, its front rounded off: the ball falls away into the toes)
      let v = Math.max(cut, -q[1] + 0.0005), best = v, part = P_.leg;
      for (const R of toeRods) { const f = toeRod(q, R); v = smin(v, f, 0.012); }
      v = Math.max(v, 0.0005 - q[1]);   // (its sole flat on the ground)
      footF[i + FNn[0] * (j + FNn[1] * k)] = v; footP[i + FNn[0] * (j + FNn[1] * k)] = part;
    }
  }
  const GFoot = gridOf(footF, FNn, FLo, HF);
  // (the nails: on the back of a finger's last joint and the top of a toe's, from a little past its middle to its tip,
  // as broad as two thirds of it; the thumb's nail faces out and forward, as the thumb turns)
  const nailAt = (p, nrm) => {   // (how much of a nail a point is: 0 to 1, its edge soft over a millimetre or so)
    const q = [Math.abs(p[0]), p[1], p[2]], n = [Math.sign(p[0]) * nrm[0], nrm[1], nrm[2]], ss = (x) => smooth01(x);
    let w = 0;
    for (const [f, R] of handRods.entries()) {
      const [a, b, ra, rb] = R.segs[2], ab = sub(b, a), t = dot(sub(q, a), ab) / dot(ab, ab); if (t < 0.15 || t > 1.2) continue;
      const c = add(a, mul(ab, Math.min(1, t))), d = sub(q, c), back = f === 0 ? norm([0.55, 0, 0.83]) : [1, 0, 0], side = len(sub(d, mul(back, dot(d, back))));
      if (len(d) > (ra + rb) * 0.8) continue;
      w = Math.max(w, ss((t - 0.28) / 0.12) * ss((dot(n, back) - 0.35) / 0.25) * ss((0.66 * ra - side) / (0.18 * ra)));
    }
    for (const R of toeRods) {
      const ab = sub(R.b, R.a), t = dot(sub(q, R.a), ab) / dot(ab, ab); if (t < 0.5 || t > 1.15) continue;
      const c = add(R.a, mul(ab, Math.min(1, t))), d = sub(q, c);
      if (len(d) > R.r0 * 1.4) continue;
      w = Math.max(w, ss((t - 0.64) / 0.08) * ss((n[1] - 0.45) / 0.25) * ss((0.66 * R.r1 - Math.abs(d[0])) / (0.18 * R.r1)));
    }
    return w;
  };
  const mirrorMesh = (M) => ({ pos: M.pos.map((v, i) => (i % 3 === 0 ? -v : v)), tri: M.tri.map((v, i) => (i % 3 === 1 ? M.tri[i + 1] : i % 3 === 2 ? M.tri[i - 1] : v)), nb: M.nb });

  // ── drawn out: surface nets on the grid (and on a grid twice as coarse, for the far level) ──────────────────────
  const nets = (lvl, Gr) => {
    const fl = Gr.f, [nx, ny, nz] = Gr.n, LO = Gr.lo, h = Gr.h, I = Gr.I, sample = (p) => Gr.sample(p);
    const s = lvl, gx = Math.floor((nx - 1) / s), gy = Math.floor((ny - 1) / s), gz = Math.floor((nz - 1) / s), hh = h * s;
    const val = (i, j, k) => { if (s === 1) return fl[I(i, j, k)]; let a = 0; for (let n = 0; n < 8; n++) a += fl[I(Math.min(nx - 1, i * s + (n & 1)), Math.min(ny - 1, j * s + ((n >> 1) & 1)), Math.min(nz - 1, k * s + ((n >> 2) & 1)))]; return a / 8; };
    const V = new Float32Array((gx + 1) * (gy + 1) * (gz + 1)), J = (i, j, k) => i + (gx + 1) * (j + (gy + 1) * k);
    for (let k = 0; k <= gz; k++) for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) V[J(i, j, k)] = val(i, j, k);
    const vert = new Int32Array((gx + 1) * (gy + 1) * (gz + 1)).fill(-1), pos = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (let k = 0; k < gz; k++) for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      let neg = 0; const v = []; for (let n = 0; n < 8; n++) { const x = V[J(i + (n & 1), j + ((n >> 1) & 1), k + ((n >> 2) & 1))]; v.push(x); if (x < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      let sx = 0, sy = 0, sz = 0, m = 0;
      for (const [a, b] of E) if ((v[a] < 0) !== (v[b] < 0)) { const t = v[a] / (v[a] - v[b]); sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; m++; }
      vert[J(i, j, k)] = pos.length / 3; pos.push(LO[0] + (i + sx / m) * hh, LO[1] + (j + sy / m) * hh, LO[2] + (k + sz / m) * hh);
    }
    const tri = [];
    for (let k = 1; k < gz; k++) for (let j = 1; j < gy; j++) for (let i = 1; i < gx; i++) {
      const v0 = V[J(i, j, k)];
      for (const a of [0, 1, 2]) {
        const v1 = a === 0 ? V[J(i + 1, j, k)] : a === 1 ? V[J(i, j + 1, k)] : V[J(i, j, k + 1)]; if ((v0 < 0) === (v1 < 0)) continue;
        const o = (db, dc) => { const e = [i, j, k]; e[(a + 1) % 3] -= db; e[(a + 2) % 3] -= dc; return vert[J(e[0], e[1], e[2])]; };
        const A = o(0, 0), B = o(1, 0), C = o(1, 1), D = o(0, 1); if (A < 0 || B < 0 || C < 0 || D < 0) continue;
        if (v0 < 0) tri.push(A, B, C, A, C, D); else tri.push(A, C, B, A, D, C);
      }
    }
    // only the body itself: the largest piece the surface makes, and pieces nearly as large (no bubbles)
    const parent = new Int32Array(pos.length / 3).map((_, i) => i), root = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
    for (let t = 0; t < tri.length; t += 3) { const a = root(tri[t]), b = root(tri[t + 1]), c = root(tri[t + 2]); parent[b] = a; parent[root(c)] = a; }
    const size = new Map(); for (let v = 0; v < parent.length; v++) { const r = root(v); size.set(r, (size.get(r) ?? 0) + 1); }
    const big = Math.max(...size.values()), keep = new Set([...size].filter(([, n]) => n > big * 0.02).map(([r]) => r));
    const map = new Int32Array(parent.length).fill(-1), P = []; let n = 0;
    for (let v = 0; v < parent.length; v++) if (keep.has(root(v))) { map[v] = n++; P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); }
    const T = []; for (let t = 0; t < tri.length; t += 3) if (map[tri[t]] >= 0) T.push(map[tri[t]], map[tri[t + 1]], map[tri[t + 2]]);
    // (smoothed a little along the surface, then set back onto it: the grid's steps taken out)
    const nb = Array.from({ length: n }, () => []); for (let t = 0; t < T.length; t += 3) for (let e = 0; e < 3; e++) { nb[T[t + e]].push(T[t + (e + 1) % 3]); }
    for (let it = 0; it < 2; it++) {
      const Q = P.slice();
      for (let v = 0; v < n; v++) { if (!nb[v].length) continue; let s = [0, 0, 0]; for (const u of nb[v]) s = add(s, [P[u * 3], P[u * 3 + 1], P[u * 3 + 2]]); s = mul(s, 1 / nb[v].length); Q[v * 3] = P[v * 3] * 0.4 + s[0] * 0.6; Q[v * 3 + 1] = P[v * 3 + 1] * 0.4 + s[1] * 0.6; Q[v * 3 + 2] = P[v * 3 + 2] * 0.4 + s[2] * 0.6; }
      for (let v = 0; v < n; v++) { const p = [Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2]], e = h * 0.5, f0 = sample(p), g = norm([sample(add(p, [e, 0, 0])) - f0, sample(add(p, [0, e, 0])) - f0, sample(add(p, [0, 0, e])) - f0]), r = sub(p, mul(g, Math.max(-h * 0.6, Math.min(h * 0.6, f0)))); P[v * 3] = r[0]; P[v * 3 + 1] = r[1]; P[v * 3 + 2] = r[2]; }
    }
    return { pos: P, tri: T, nb };
  };

  // ── each point fastened: to the four bones nearest under it ──────────────────────────────────────────────────────
  // Each bone is a row of its own, carried whole by that bone's joint (rigid: it does not swell); a point among several
  // is carried by each, the nearer more, as a game's skin is by its bones (linear blend skinning, four bones a point:
  // over the loins the pelvis, two vertebrae and a thigh all pull at the same point).
  // (the muscles under it would swell it as they shorten, but they move each its own way and pull the skin into folds
  // and strings where a limb bends far: the bones carry it smoothly)
  const rows = [], first = M.rows.length, rigid = new Map(), key = (i, j, k) => i + 4096 * (j + 4096 * k);
  const rigidRow = (rig) => {
    if (!rigid.has(rig)) { rigid.set(rig, first + rows.length); rows.push({ keys: [{ rig, at: [0, 0, 0], out: [0, 0, 1] }, { rig, at: [0, -0.05, 0], out: [0, 0, 1] }], closed: false, rigid: true, L0: 0.05, Lt: 0 }); }
    return rigid.get(rig);
  };
  const allRows = (r) => (r < first ? M.rows[r] : rows[r - first]);
  const curveOf = new Map();
  const curve = (r) => { let c = curveOf.get(r); if (!c) { const R = allRows(r), P = R.keys.map((k) => add(k.at, RIG[k.rig].at)); c = { S: slots(P, R.closed), Q: slots(R.keys.map((k) => k.out), R.closed) }; curveOf.set(r, c); } return c; };
  // the bones' surfaces as points (a bone's own field is true only near it; the trunk's skin lies a hand's breadth
  // from its spine), both sides' (the left's mirrored: a point by the middle hangs on both thighs, not on one), in a
  // grid; with each its joint and its piece. The gristle and the eyes too.
  const BG = 0.02, raw = [], rigs = [], rigIndex = new Map();
  const put = (x, y, z, rig) => { if (!rigIndex.has(rig)) { rigIndex.set(rig, rigs.length); rigs.push(rig); } raw.push(x, y, z, rigIndex.get(rig)); };
  const surface = (f, lo, hi, rig) => {
    const e = small({ lo, hi }) ? 0.004 : 0.009;   // (as close as the weights need: they are soft over centimetres)
    for (let x = Math.max(-e, lo[0]); x <= hi[0]; x += e) for (let y = lo[1]; y <= hi[1]; y += e) for (let z = lo[2]; z <= hi[2]; z += e) if (Math.abs(f(x, y, z)) < e * 0.7) { const ax = Math.abs(x); put(ax, y, z, rig); if (ax > e) put(-ax, y, z, mirror(rig)); }
  };
  for (const b of bones) if (!b.id.endsWith('.R') && !/^(tooth|patella)/.test(b.id) && b.hi[0] > -0.01) surface((x, y, z) => b.F.f(x, y, z), b.lo, b.hi, b.rig);
  for (const u of UNDER) { const f = F.fieldOf([{ op: 'add', k: 0, s: solidOf(u.solid) }]), c = u.solid[1], e = 0.032; surface((x, y, z) => f.f(x, y, z), sub(c, [e, e, e]), add(c, [e, e, e]), u.rig === 'eye' ? 'eye.L' : u.rig); }
  // (in a grid of cells BG a side, each cell's points together)
  const G0 = [-0.36, -0.06, -0.25], gn = [Math.ceil(0.72 / BG) + 1, Math.ceil(1.92 / BG) + 1, Math.ceil(0.54 / BG) + 1], NP = raw.length / 4;
  const cellOf = (x, y, z) => { const i = Math.floor((x - G0[0]) / BG), j = Math.floor((y - G0[1]) / BG), k = Math.floor((z - G0[2]) / BG); return i < 0 || j < 0 || k < 0 || i >= gn[0] || j >= gn[1] || k >= gn[2] ? -1 : i + gn[0] * (j + gn[1] * k); };
  const start = new Int32Array(gn[0] * gn[1] * gn[2] + 1), px = new Float32Array(NP * 3), prig = new Int16Array(NP);
  for (let n = 0; n < NP; n++) { const c = cellOf(raw[n * 4], raw[n * 4 + 1], raw[n * 4 + 2]); if (c >= 0) start[c + 1]++; }
  for (let c = 0; c < start.length - 1; c++) start[c + 1] += start[c];
  { const fill = start.slice(0, -1); for (let n = 0; n < NP; n++) { const c = cellOf(raw[n * 4], raw[n * 4 + 1], raw[n * 4 + 2]); if (c < 0) continue; const m = fill[c]++; px.set([raw[n * 4], raw[n * 4 + 1], raw[n * 4 + 2]], m * 3); prig[m] = raw[n * 4 + 3]; } }
  // (a point of an arm's skin hangs only on the arm's bones and the shoulder girdle's, never on the ribs beside it; a
  // finger's on its own and the hand's; a point of the other skin on any of its bones, the trunk's, the legs' and the
  // head's, the nearest; and a limb's on its own side's alone: the left knee's skin never on the right thigh)
  const may = (own, rig, x, shoulder) => {
    const part = P_[partOf(rig)];
    if (own === 255) return true;
    if (own === P_.trunk && shoulder && /^upperArm\./.test(rig)) return rig.endsWith(x > 0 ? '.L' : '.R');   // (the trunk's skin over the shoulder's cap rides on the arm too)
    if ((own === P_.leg || ARMS(own)) && rig.endsWith(x > 0 ? '.R' : '.L')) return false;
    return ARMS(own) ? (own === P_.arm ? ARMS(part) || /^(scapula|clavicle)\./.test(rig) : part === own || /^hand\./.test(rig)) : !ARMS(part);
  };
  const mayTable = new Map(), mayOf = (own, x, sh) => { const k = own * 4 + (x > 0 ? 1 : 0) + (sh ? 2 : 0); let t = mayTable.get(k); if (!t) mayTable.set(k, (t = Uint8Array.from(rigs, (r) => (may(own, r, x, sh) ? 1 : 0)))); return t; };
  const partAt = (p, arms) => {
    const fl = arms ? fieldA : field, fp = arms ? fieldPartA : fieldPart;
    const i = Math.round((p[0] - LO[0]) / h), j = Math.round((p[1] - LO[1]) / h), k = Math.round((p[2] - LO[2]) / h); let best = 255, bv = Infinity;
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const g = I(i + di, j + dj, k + dk), v = Math.abs(fl[g]); if (fp[g] !== 255 && v < bv) { bv = v; best = fp[g]; } }
    return best;
  };
  const best = new Float32Array(rigs.length);
  const fasten = (p, own) => {
    const q = p, ok = mayOf(own, q[0], q[1] > 1.27 && Math.abs(q[0]) > 0.13);
    // the nearest point of each joint's bones, looked for in ever wider shells: an arm's, a hand's, a finger's until the
    // five nearest are sure, or all within 16 cm (a finger's skin has its own three joints and the hand's); the trunk's,
    // the legs' and the head's always as far as 16 cm, so that two points side by side weigh their bones alike (one
    // that stopped looking sooner than its neighbour would make a crease between them as the body bends)
    const ci = Math.floor((q[0] - G0[0]) / BG), cj = Math.floor((q[1] - G0[1]) / BG), ck = Math.floor((q[2] - G0[2]) / BG);
    best.fill(Infinity);
    let r0 = -1;
    for (const r of [2, 4, 8, 16, 24]) {
      for (let k = Math.max(0, ck - r); k <= Math.min(gn[2] - 1, ck + r); k++) for (let j = Math.max(0, cj - r); j <= Math.min(gn[1] - 1, cj + r); j++) {
        const inner = Math.abs(k - ck) <= r0 && Math.abs(j - cj) <= r0;
        for (let i = Math.max(0, ci - r); i <= Math.min(gn[0] - 1, ci + r); i++) {
          if (inner && Math.abs(i - ci) <= r0) { i = Math.min(gn[0] - 1, ci + r0); continue; }
          const c = i + gn[0] * (j + gn[1] * k);
          for (let m = start[c]; m < start[c + 1]; m++) { const g = prig[m]; if (!ok[g]) continue; const dx = px[m * 3] - q[0], dy = px[m * 3 + 1] - q[1], dz = px[m * 3 + 2] - q[2], d = dx * dx + dy * dy + dz * dz; if (d < best[g]) best[g] = d; }
        }
      }
      r0 = r;
      let sure = 0; const lim = (r * BG) ** 2; for (let g = 0; g < rigs.length; g++) if (best[g] <= lim) sure++;
      if ((ARMS(own) && sure >= 5) || (r >= 8 && sure >= 1)) break;   // (within 16 cm, all there are; beyond, the nearest)
    }
    const near = new Map(); for (let g = 0; g < rigs.length; g++) if (best[g] < Infinity) near.set(rigs[g], Math.sqrt(best[g]));
    const FAR = Math.max(8, r0) * BG, cand = [...near].map(([rig, d]) => ({ rig, d })).filter((c) => c.d < FAR).sort((a, b) => a.d - b.d);
    const row = (c) => rigidRow(c.rig);
    if (!cand.length) return [{ row: rigidRow('hips'), w: 1 }];
    // the weights: each falls with the distance, the fifth's taken from all four (so that where the fourth and the
    // fifth change places the point does not jump; and none beyond the farthest looked at); softer over the trunk and the
    // legs, whose skin lies far from the bones and bends with the whole spine
    const soft = ARMS(own) ? 0.04 : 0.06, w = (c) => 1 / (c.d + soft) ** 2, w5 = w(cand[4] ?? { d: FAR });
    const out = cand.slice(0, 4).map((c) => ({ row: row(c), w: w(c) - w5 })), all = out.reduce((a, c) => a + c.w, 0), kept = out.filter((c) => c.w > 0.004 * all), sum = kept.reduce((a, c) => a + c.w, 0);
    return kept.map((c) => ({ row: c.row, w: c.w / sum }));
  };

  // ── both levels: their points fastened, in their frames ──────────────────────────────────────────────────────────
  const attr = { bone: [], weight: [], nor: [], look: [] }, pos = [], idx = [];
  const lips = MARKS[0], areola = MARKS[1], within = (q, m) => Math.sqrt(((q[0] - m.at[0]) / m.r[0]) ** 2 + ((q[1] - m.at[1]) / m.r[1]) ** 2 + ((q[2] - m.at[2]) / m.r[2]) ** 2);
  let soles = null;
  for (const [L, cell, lv] of [['fine', h, 1], ['coarse', h * 2, 2]]) {
    const S = (() => {   // (the skins as one list of points and faces, each point with the piece it is of)
      const pt = (M, v) => [M.pos[v * 3], M.pos[v * 3 + 1], M.pos[v * 3 + 2]];
      const pieces = [[nets(lv, GB), (p) => partAt(p, false)], [nets(lv, lv === 1 ? GA2 : GA), (p) => partAt(p, true)]];
      if (lv === 1) { pieces.push([nets(1, GH), hpartAt]); const L = nets(1, GHand); pieces.push([L, handPartAt], [mirrorMesh(L), handPartAt]); const Fo = nets(1, GFoot); pieces.push([Fo, () => P_.leg], [mirrorMesh(Fo), () => P_.leg]); }
      const out = { pos: [], tri: [], nb: [], part: [], piece: [] };
      for (const [k, [M, partOf_]] of pieces.entries()) {
        const n0 = out.pos.length / 3, nv = M.pos.length / 3, part = Array.from({ length: nv }, (_, v) => partOf_(pt(M, v))), near = k <= 2 ? Array.from({ length: nv }, (_, v) => hnearAt(pt(M, v))) : null;
        // (near, the head is the fine one's)
        // (and the arms' own hands likewise: the fine hands' from just under the wrist, the arms' from just over it)
        // (the feet likewise, from the ankle down)
        // (the fine head's grid holds the neck under it and the tops of the shoulders as the body's does, the same field
        // drawn finer: so the two give way to one another a centimetre inside its edge, where they are one surface)
        const inHead = (v, m) => { for (let a = 0; a < 3; a++) { const x = M.pos[v * 3 + a]; if (x < HLO[a] + m || x > HLO[a] + (HN[a] - 1) * HF - m) return false; } return true; };
        const y = (v) => M.pos[v * 3 + 1], inHand = (v) => y(v) < 0.855 && Math.abs(M.pos[v * 3]) > 0.15, inFoot = (v) => y(v) < 0.085 && M.pos[v * 3 + 2] > -0.14;
        const keepT = lv !== 1 ? () => true : k === 0 ? (a, b, c) => (part[a] !== P_.head || part[b] !== P_.head || part[c] !== P_.head) && !(inHead(a, 0.015) && inHead(b, 0.015) && inHead(c, 0.015)) && (!inFoot(a) || !inFoot(b) || !inFoot(c))
          : k === 1 ? (a, b, c) => !inHand(a) || !inHand(b) || !inHand(c) : k === 2 ? (a, b, c) => inHead(a, 0.008) || inHead(b, 0.008) || inHead(c, 0.008)
          : k <= 4 ? (a, b, c) => y(a) < 0.905 || y(b) < 0.905 || y(c) < 0.905 : (a, b, c) => y(a) < 0.095 || y(b) < 0.095 || y(c) < 0.095;
        for (let v = 0; v < nv; v++) { out.pos.push(...pt(M, v)); out.part.push(part[v]); out.piece.push(k); out.nb.push(M.nb[v].map((u) => u + n0)); }
        for (let t = 0; t < M.tri.length; t += 3) { const a = M.tri[t], b = M.tri[t + 1], c = M.tri[t + 2]; if (keepT(a, b, c)) out.tri.push(a + n0, b + n0, c + n0); }
      }
      return out;
    })(), n = S.pos.length / 3, base = pos.length / 3;
    // (two fingers that only touch, standing, are bridged by the surface; the bridge is taken out, or it would stretch
    // into strings as they part. The trunk, the legs and the head are one skin, the arms with their hands another)
    {
      const part = S.part;
      const finger = (a) => a >= P_.thumb && a <= P_.little, joined = (a, b) => a === b || !finger(a) || !finger(b);
      const kept = []; for (let t = 0; t < S.tri.length; t += 3) { const a = S.tri[t], b = S.tri[t + 1], c = S.tri[t + 2]; if (joined(part[a], part[b]) && joined(part[b], part[c]) && joined(part[a], part[c])) kept.push(a, b, c); }
      S.tri = kept;
    }
    // normals from the faces round each point
    const N = Array.from({ length: n }, () => [0, 0, 0]);
    for (let t = 0; t < S.tri.length; t += 3) { const [a, b, c] = [S.tri[t], S.tri[t + 1], S.tri[t + 2]], pa = [S.pos[a * 3], S.pos[a * 3 + 1], S.pos[a * 3 + 2]], nn = cross(sub([S.pos[b * 3], S.pos[b * 3 + 1], S.pos[b * 3 + 2]], pa), sub([S.pos[c * 3], S.pos[c * 3 + 1], S.pos[c * 3 + 2]], pa)); for (const v of [a, b, c]) N[v] = add(N[v], nn); }
    const low = new Map();
    // (each point's bones, then evened out over the skin round it: where a bone lies near the skin, the crest of the
    // pelvis, the ribs' edge, a point's share of it would change within a centimetre or two, and as the body bends the
    // skin would crumple there; spread over a few centimetres it bends smoothly. The trunk's and the thighs' skin only,
    // away from where the finer head, hands and feet lie with it)
    const holds = Array.from({ length: n }, (_, v) => fasten([S.pos[v * 3], S.pos[v * 3 + 1], S.pos[v * 3 + 2]], S.part[v]));
    {
      const free = (v) => S.piece[v] === 0 && !ARMS(S.part[v]) && S.pos[v * 3 + 1] > 0.6 && S.pos[v * 3 + 1] < 1.42;
      for (let it = 0; it < (lv === 1 ? 60 : 15); it++) {
        const next = holds.slice();
        for (let v = 0; v < n; v++) {
          if (!free(v) || !S.nb[v].length) continue;
          const m = new Map(); const add_ = (h, k) => { for (const { row, w } of h) m.set(row, (m.get(row) ?? 0) + w * k); };
          add_(holds[v], 0.5); for (const u of S.nb[v]) add_(holds[u], 0.5 / S.nb[v].length);
          const top = [...m].sort((a, b) => b[1] - a[1]), w5 = top[4]?.[1] ?? 0, four = top.slice(0, 4).map(([row, w]) => ({ row, w: w - w5 })).filter((c) => c.w > 1e-4), sum = four.reduce((a, c) => a + c.w, 0);
          next[v] = four.map((c) => ({ row: c.row, w: c.w / sum }));
        }
        for (let v = 0; v < n; v++) holds[v] = next[v];
      }
    }
    for (let v = 0; v < n; v++) {
      const p = [S.pos[v * 3], S.pos[v * 3 + 1], S.pos[v * 3 + 2]], nrm = norm(N[v]), held = holds[v], A = held[0];
      // (each bone's row and its share; the point and its normal as they stand, the bones' frames standing kept apart)
      for (let j = 0; j < 4; j++) { attr.bone.push(held[j]?.row ?? 0); attr.weight.push(held[j]?.w ?? 0); }
      attr.nor.push(...nrm);
      // what it is: how much of a lip, of a nail, of an areola
      const q = [Math.abs(p[0]), p[1], p[2]], rigA = allRows(A.row).keys[0].rig;
      // (each a share, soft at its edge: the lips' red over a millimetre or two, the areola's over a little more)
      const lip = 1 - smooth01((within(q, lips) - 0.88) / 0.14), are = q[2] > nip[2] - 0.012 ? 1 - smooth01((Math.hypot(q[0] - nip[0], q[1] - nip[1]) / areola.r[0] - 0.8) / 0.3) : 0;
      const nail = lv === 1 ? (S.piece[v] >= 3 ? nailAt(p, nrm) : 0) : allRows(A.row).rigid && ((/^(index3|middle3|ring3|little3|thumb3)\./.test(rigA) && Math.abs(nrm[0]) > 0.6 && Math.sign(nrm[0]) === Math.sign(p[0])) || (/^toe\d\./.test(rigA) && nrm[1] > 0.6 && p[2] > 0.13)) ? 1 : 0;
      // how open it stands: how much of the body is round it, looked for a centimetre and a half and four centimetres
      // out of it, straight out and slanting (the trunk's and the arms' skins both: under the arm, between the thighs)
      let occ = 0, ws = 0; const t1 = norm(cross(nrm, Math.abs(nrm[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(nrm, t1);
      for (let qd = 0; qd < 5; qd++) {
        const a = (qd / 4) * 2 * Math.PI, dir = qd === 4 ? nrm : norm(add(mul(nrm, 0.7), add(mul(t1, Math.cos(a) * 0.71), mul(t2, Math.sin(a) * 0.71))));
        for (const d of [0.015, 0.04]) { const o = add(p, mul(dir, d)), f = occluder(S.piece[v], o); occ += 0.5 * Math.max(0, 1 - f / (d * 0.7)); ws += 0.5; }
      }
      attr.look.push(Math.max(0.45, Math.min(1, 1 - (1.3 * occ) / ws)), lip, nail, are);
      pos.push(...p);
      // the soles: under each foot and toe, the lowest point every two centimetres
      if (L === 'fine' && allRows(A.row).rigid && /^(foot|toe\d)\./.test(rigA) && p[1] < 0.03) { const k2 = rigA + ':' + Math.round(p[2] / 0.02) + ':' + Math.round(p[0] / 0.03); const was = low.get(k2); if (!was || p[1] < was.p[1]) low.set(k2, { rig: rigA, p }); }
    }
    if (L === 'fine') soles = [...low.values()].map(({ rig, p }) => ({ rig, at: sub(p, RIG[rig].at) }));
    idx.push(Uint32Array.from(S.tri, (t) => t + base));
  }
  const F32 = (a) => Float32Array.from(a);
  // the frame of each bone's row as the body stands (its middle, along it, out, across), each four of a row's texels
  const rest = new Float32Array((first + rows.length) * 16);
  for (const r of rigid.values()) { const c = curve(r), Fr = frameAt(c.S, c.Q, 0, 0.5); [Fr.C, Fr.T, Fr.O, Fr.B].forEach((v, j) => rest.set([...v, 0], r * 16 + j * 4)); }
  return {
    rows, soles, pos: F32(pos), fine: idx[0], coarse: idx[1],
    attr: { bone: F32(attr.bone), weight: F32(attr.weight), nor: F32(attr.nor), look: F32(attr.look) }, rest,
    counts: { points: pos.length / 3, fine: idx[0].length / 3, coarse: idx[1].length / 3, bonesHeld: rigid.size },
    skin: SKIN / 1000,
  };
}
