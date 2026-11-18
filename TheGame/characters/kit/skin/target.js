// The body's shape under its skin, and so the skin's (intents 0036, 0039): where the fat and the skin lie over the
// muscles (../muscles/build.js), the bones, the nose's and the ears' gristle and the eyes, as thick as they are place by
// place (./table.js), opened where the eyes and the nostrils are. A shape, not yet a surface: fields a ray can be sent
// through (negative inside, metres), which ./cage.js lays the skin's cage on. Plain JS, no three: it runs in the workers
// that lay the skin (./build.js), or under node.
//
//   targetOf(bones, muscles, { h }) -> { GB, GA, GH, GHand, GFoot, RIG, PARTS, nailAt, nip, handRods, toeRods, … }
//     GB      the trunk's, the legs' and the head's, on cells h a side; GA the arms'; each closed on its own (an arm
//             along the side only touches the trunk)
//     GH, GHand, GFoot   the head, the left hand and the left foot on cells a third as large, each holding its
//             neighbourhood whole (the neck, the wrist, the ankle)
//     a grid: { f, n, lo, h, sample(p) }
//
// How it is made: on a grid of cells h a side over the whole body, piece by piece (the trunk, the head, each arm with
// its hand, each finger, each leg with its foot: so the arm does not grow into the trunk where it lies along it, nor the
// fingers into one another). Each piece's muscles are filled into the grid (their surfaces, by where rows of cells cross
// them), and its small bones; how far each cell is from them is a distance transform, closed by a centimetre or two (a
// groove narrower than that between muscles is filled, as the fat and the fascia fill it) and softened a little; its
// large bones, its fills, the nose's and the ears' gristle and the eyes give their own true distances, blended in. The
// skin is where that is as far out as the fat and the skin are thick there, half way to a man's measured outline
// (./table.js PROFILES), the muscles' relief laid on it as much as the fat lets it through.
import { OUTLINE, TISSUE, TISSUE_DEFAULT, UNDER, OPENINGS, MARKS, NIPPLE, SKIN, FILL, partOf, PROFILES, MASSES, PALM, CARPUS, THENAR, FINGERS, MOUTH, TOES, RELIEF, LIMB_RELIEF, LOWER_FACE } from './table.js';
import { frameAt, slots } from '../muscles/build.js';
import { rigOf } from '../skeleton/pose.js';
import * as F from '../field.js';

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

export function targetOf(bones, M, { h = 0.006, soft: SOFT = 0.005, close: CLOSE = 0.012, only: ONLY = null } = {}) {
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
    const palm = massOf(PALM), thenar = massOf(THENAR), carpus = massOf(CARPUS);
    const rods = handRods;
    for (let k = 0; k < HNn[2]; k++) for (let j = 0; j < HNn[1]; j++) for (let i = 0; i < HNn[0]; i++) {
      const q = [HLo[0] + i * HF, HLo[1] + j * HF, HLo[2] + k * HF];
      let hand = smin(smin(palm(q).E, carpus(q).E, CARPUS.k), thenar(q).E, THENAR.k), best = hand, part = P_.arm;
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
  const handPartAt = (p) => { const q = [Math.abs(p[0]), p[1], p[2]], i = Math.round((q[0] - HLo[0]) / HF), j = Math.round((q[1] - HLo[1]) / HF), k = Math.round((q[2] - HLo[2]) / HF); return handP[Math.max(0, Math.min(HNn[0] - 1, i)) + HNn[0] * (Math.max(0, Math.min(HNn[1] - 1, j)) + HNn[1] * Math.max(0, Math.min(HNn[2] - 1, k)))]; };
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
  return { h, RIG, PARTS, P_, ARMS, GB, GA, GH, GHand, GFoot, nailAt, nip, handRods, toeRods, small };
}
