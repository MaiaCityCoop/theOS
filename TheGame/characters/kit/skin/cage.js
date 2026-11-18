// The skin's cage (intent 0041): the body as one closed surface of a few thousand four-sided faces, laid the way a
// modeller lays a body's faces: in rings round the trunk, the neck and the head, round each arm and leg, each finger
// and toe, a ring dividing in two where the body does (the armpits, the crotch, the thumb, between the fingers and the
// toes). Its points are found on the body's shape (./target.js: the fat and the skin over the muscles and the bones),
// each along a ray from its ring's middle; the cage is then made smooth (./subdiv.js). Nothing here is drawn by hand:
// the rings' heights and counts are this file's tables, their places the rig's joints and the shape itself.
// Plain JS, no three: it runs in the workers that lay the skin (./build.js), or under node.
//
//   cageOf(T) -> { pos, faces, part, mid, rings }
//     T      the shape (./target.js targetOf): its fields and the rig
//     pos    Float64Array, three numbers a point; faces: arrays of point numbers, wound to face outwards
//     part   Uint8Array: the piece each point is of (PARTS' number: what its bones may be, ./weights.js)
//     side   Int8Array: +1 a point of the left side, -1 of the right, 0 on the middle
//
// The body stands as the rig stands at rest: upright, the arms hanging, the palms to the thighs. So nearly every ring
// is level; only the foot's turn forwards from the leg and the thumb lie otherwise. x is the body's left, y up, z its
// front. A ring's points are counted from its front round by its left, its back and its right.
import { refine, limit } from './subdiv.js';
import { gapAt } from './table.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const D = Math.PI / 180;

/** How many points a ring has: the head's, the neck's and the shoulders' (H), the trunk's (T), an arm's (A), a leg's
    (L); how many edges cross under an armpit (KA) and under the crotch (KC). They fit: H = T + 2A - 4KA, L = T/2 + KC. */
const COUNT = { H: 48, T: 32, A: 20, L: 20, KA: 6, KC: 4 };

/** The shape as solids a ray can be sent through (each negative inside, metres): `body` the trunk, the legs and the
    head; `arm` the arms with their hands; `both` the two as one (the shoulders); `leg` the left leg alone; `any` the
    nearer of the first two, as they stand. The fine grids (the head's, a hand's, a foot's) hold their neighbourhood
    whole, so inside one its field is the shape; it gives way to the body's coarser one over a centimetre at its edge. */
export function solidsOf(T) {
  const { GB, GA, GH, GHand, GFoot } = T;
  const within = (p, lo, hi, m) => Math.min(smooth01((p[0] - lo[0]) / m), smooth01((hi[0] - p[0]) / m), smooth01((p[1] - lo[1]) / m), smooth01((hi[1] - p[1]) / m), smooth01((p[2] - lo[2]) / m), smooth01((hi[2] - p[2]) / m));
  const hi3 = (G) => [G.lo[0] + (G.n[0] - 1) * G.h, G.lo[1] + (G.n[1] - 1) * G.h, G.lo[2] + (G.n[2] - 1) * G.h];
  const headHi = hi3(GH), handHi = hi3(GHand), footHi = hi3(GFoot);
  const body = (p) => {
    let v = GB.sample(p);
    const wh = within(p, GH.lo, headHi, 0.012); if (wh > 0) v += wh * (GH.sample(p) - v);
    const q = [Math.abs(p[0]), p[1], p[2]], wf = within(q, GFoot.lo, footHi, 0.012); if (wf > 0) v += wf * (GFoot.sample(q) - v);
    return v;
  };
  const arm = (p) => { let v = GA.sample(p); const q = [Math.abs(p[0]), p[1], p[2]], w = within(q, GHand.lo, handHi, 0.012); if (w > 0) v += w * (GHand.sample(q) - v); return v; };
  const both = (p) => smin(body(p), arm(p), 0.02);   // (the shoulders: the trunk and the arms as one)
  const leg = (p) => -smin(-body(p), p[0] - gapAt(p[1]), 0.02);   // (the left leg alone: its own side of the middle, as far from it as a standing man's inner thigh is, ./table.js LEG_GAP)
  return { body, arm, both, leg, any: (p) => Math.min(body(p), arm(p)) };
}

export function cageOf(T, { only = null } = {}) {
  const { RIG } = T, J = (n) => RIG[n].at, { body, arm, both, leg } = solidsOf(T);
  // ── a ray from a ring's middle to the skin ─────────────────────────────────────────────────────────────────────
  // Out along d from c: where the ray leaves the solid; a hollow narrower than `gap` it crosses (the dip over a
  // collarbone), a wider one ends it (the other leg, the trunk beside an arm).
  const exit = (S, c, d, far, gap = 0, step = 0.003) => {
    let inside = S(c) < 0, last = -1, f0 = 0, t0 = 0;
    for (let t = step; t <= far + step; t += step) {
      const f = S([c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t]), now = f < 0;
      if (inside && !now) { let a = t - step, b = t; for (let i = 0; i < 7; i++) { const m = (a + b) / 2; if (S([c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m]) < 0) a = m; else b = m; } last = (a + b) / 2; }
      inside = now;
      if (!inside && last >= 0 && t - last > gap) break;
    }
    return last < 0 ? 0 : last;
  };
  // The same from outside in: the outermost skin along the ray, whatever hollows lie inside it (the mouth, the nose's
  // cavity, the bowl of an ear: the head is not solid). Only where nothing else of the solid lies further out.
  const enter = (S, c, d, far, step = 0.003) => {
    for (let t = far; t > 0; t -= step) {
      if (S([c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t]) < 0) { let a = t, b = t + step; for (let i = 0; i < 7; i++) { const m = (a + b) / 2; if (S([c[0] + d[0] * m, c[1] + d[1] * m, c[2] + d[2] * m]) < 0) a = m; else b = m; } return (a + b) / 2; }
    }
    return 0;
  };
  // A ring's outline: the skin's distance from the middle every half degree, front (e1) round by the left (e2); evened
  // a little along itself and with the outlines just before and behind it (`thick` along `along`), so that a ring of a
  // few points stands for the skin round it, not for the dent or the knob one ray happens to meet.
  const outline = (S, c, e1, e2, { far = 0.4, gap = 0, half = false, soft = 0, thick = 0, along = null, step = 0.003, outer = false } = {}) => {
    const n = half ? 361 : 720, r = new Float64Array(n), levels = thick > 0 ? [[-thick, 0.25], [0, 0.5], [thick, 0.25]] : [[0, 1]];
    for (const [o, w] of levels) { const cc = o ? add(c, mul(along, o)) : c; for (let i = 0; i < n; i++) { const a = i * 0.5 * D, d = add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a))); r[i] += w * (outer ? enter(S, cc, d, far, step) : exit(S, cc, d, far, gap, step)); } }
    if (soft > 0) {   // (soft: degrees, a bell's width)
      const k = Math.ceil(soft * 2 * 2), W = []; for (let j = -k; j <= k; j++) W.push(Math.exp(-0.5 * (j / (soft * 2)) ** 2));
      const at = (i) => (half ? r[i < 0 ? -i : i >= n ? 2 * (n - 1) - i : i] : r[((i % n) + n) % n]), out = new Float64Array(n);
      for (let i = 0; i < n; i++) { let s = 0, ws = 0; for (let j = -k; j <= k; j++) { s += W[j + k] * at(i + j); ws += W[j + k]; } out[i] = s / ws; }
      r.set(out);
    }
    const pt = (i) => { const a = i * 0.5 * D, x = Math.cos(a) * r[i], y = Math.sin(a) * r[i]; return [c[0] + e1[0] * x + e2[0] * y, c[1] + e1[1] * x + e2[1] * y, c[2] + e1[2] * x + e2[2] * y]; };
    const P = Array.from({ length: n }, (_, i) => pt(i)), L = new Float64Array(n + (half ? 0 : 1));
    for (let i = 1; i < L.length; i++) L[i] = L[i - 1] + len(sub(P[i % n], P[i - 1]));
    const total = L[L.length - 1];
    /** the point at an angle (degrees from the front) */
    const atAngle = (deg) => { const f = ((((deg % 360) + 360) % 360) * 2), i = Math.floor(f), t = f - i; return lerp(P[i % n], P[(i + 1) % n], t); };
    /** how far along the outline (0 … 1) the point at an angle lies */
    const fracOf = (deg) => { const f = Math.min(L.length - 1, (((deg % 360) + 360) % 360) * 2), i = Math.floor(f), t = f - i; return (L[i] + (L[Math.min(L.length - 1, i + 1)] - L[i]) * t) / total; };
    /** the point a share of the way along it */
    const atFrac = (s) => { const want = Math.min(1, Math.max(0, s)) * total; let lo = 0, hi = L.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= want) lo = m; else hi = m; } const t = (want - L[lo]) / Math.max(1e-12, L[hi] - L[lo]); return lerp(P[lo % n], P[hi % n], t); };
    const middle = () => { let s = [0, 0, 0], w = 0; for (let i = 0; i < n; i++) { const k = r[i] * r[i]; s = add(s, mul(P[i], k)); w += k; } return mul(s, 1 / w); };   // (weighed by the area each ray sweeps)
    return { r, P, total, atAngle, fracOf, atFrac, middle };
  };

  // ── the cage as it is laid: points, and faces of the left side and of the whole ────────────────────────────────
  const P = [], part = [], side = [], twin = [], whole = [], left = [];
  const PARTS = T.PARTS ?? ['trunk', 'arm', 'leg', 'thumb', 'index', 'middle', 'ring', 'little', 'head'], P_ = Object.fromEntries(PARTS.map((p, i) => [p, i]));
  const point = (p, of, mid = false) => { P.push(mid ? [0, p[1], p[2]] : [p[0], p[1], p[2]]); part.push(P_[of]); side.push(mid ? 0 : 1); twin.push(mid ? P.length - 1 : -1); return P.length - 1; };
  const mir = (v) => { if (twin[v] < 0) { P.push([-P[v][0], P[v][1], P[v][2]]); part.push(part[v]); side.push(-1); twin.push(v); twin[v] = P.length - 1; } return twin[v]; };
  /** a ring across the middle of the body, from the points of its left half (the first and the last on the middle) */
  const across = (pts, of) => { const n = (pts.length - 1) * 2, ids = new Array(n); for (let i = 0; i < pts.length; i++) ids[i] = point(pts[i], typeof of === 'function' ? of(i) : of, i === 0 || i === pts.length - 1); for (let i = 1; i < pts.length - 1; i++) ids[n - i] = mir(ids[i]); return ids; };
  const ring = (pts, of) => pts.map((p) => point(p, of));
  /** the faces between two rings of as many points, a before b along the way */
  const band = (a, b, into) => { const n = a.length; if (b.length !== n) throw new Error(`cage: a ring of ${n} points meets one of ${b.length}`); for (let i = 0; i < n; i++) into.push([a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]]); };

  // ── the trunk, the neck and the head: rings across the middle, level ───────────────────────────────────────────
  const { H, T: NT, A: NA, L: NL, KA, KC } = COUNT, front = [0, 0, 1], leftward = [1, 0, 0], down = [0, -1, 0];
  // (the middle of a level ring across the body: on the middle plane, half way between its front and its back there)
  const centreAt = (S, y, z0 = -0.03) => { const c = [0, y, z0], f = enter(S, c, [0, 0, 1], 0.3), b = enter(S, c, [0, 0, -1], 0.3); return [0, y, z0 + (f - b) / 2]; };
  // The heights (m). The crown's cap, then the head a ring every centimetre and a bit where the face is; the neck; the
  // shoulders, close together where the skin lies nearly flat over them; the chest to the armpits.
  const crown = (() => { let y = 1.9; while (y > 1.6 && body([0, y, -0.01]) > 0) y -= 0.0005; return y; })();
  const armpit = J('upperArm.L')[1] - 0.105;   // (the armpit's top: a hand's breadth under the shoulder's joint)
  const crotch = J('thigh.L')[1] - 0.105;   // (the crotch: a hand's breadth under the hips' joints; below it each leg is its own, on its own side of the middle)
  const levels = (from, to, stepAt) => { const out = []; for (let y = from; y > to + 1e-6; y -= stepAt(y)) out.push(y); return out; };
  const headYs = levels(crown - 0.016, 1.555, (y) => (y > crown - 0.06 ? 0.016 : y > 1.728 ? 0.018 : 0.0066));   // (the face's rings 6.6 mm apart: its features are finer than the body's)
  const neckYs = levels(headYs.at(-1) - 0.0125, 1.525, () => 0.0125);
  const shoulderYs = [1.52, 1.51, 1.50, 1.49, 1.48, 1.47, 1.46, 1.445, 1.425, 1.40, 1.37].filter((y) => y < neckYs.at(-1) - 0.004 && y > armpit + 0.02);
  const trunkYs = levels(armpit - 0.03, crotch + 0.012, (y) => (y > crotch + 0.09 ? 0.03 : 0.025));

  // where a ring's points lie along its outline: evenly, or held at the armpits' folds (P before, Q behind): a share
  // of the way from the front to the back for each of the half ring's points
  const even = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);
  const held = (O, n, marks) => {   // marks: [[index, angle]], between them evenly along the outline
    const out = new Array(n + 1), M = [[0, 0], ...marks.map(([i, a]) => [i, O.fracOf(a)]), [n, 1]];
    for (let m = 0; m < M.length - 1; m++) { const [i0, s0] = M[m], [i1, s1] = M[m + 1]; for (let i = i0; i <= i1; i++) out[i] = s0 + ((s1 - s0) * (i - i0)) / (i1 - i0); }
    return out;
  };
  const halfRing = (S, y, n, shares, of, opts = {}) => {
    const c = centreAt(S, y, opts.z0), O = outline(S, c, front, leftward, { half: true, far: 0.36, outer: true, soft: opts.soft ?? 2, thick: opts.thick ?? 0.006, along: down });
    const s = typeof shares === 'function' ? shares(O) : shares;
    return across(s.map((f) => O.atFrac(f)), of);
  };
  // The folds of the armpit at the level where the arm leaves the trunk: where the skin of the shoulders' ring goes
  // from the trunk's to the arm's (P, before) and back (Q, behind), as angles round the ring's middle.
  const split = (() => {
    const c = centreAt(both, armpit), O = outline(both, c, front, leftward, { half: true, far: 0.36, outer: true, soft: 1.5, thick: 0.006, along: down });
    let p = -1, q = -1; for (let i = 0; i < 361; i++) { const isArm = arm(O.P[i]) < body(O.P[i]); if (isArm && p < 0) p = i; if (isArm) q = i; }
    return { c, O, P: p / 2, Q: q / 2 };
  })();
  const iP = (NT / 2 - KA) / 2, iQ = H / 2 - iP;   // (on a ring of H: the fold before the arm, the fold behind it)
  // (round the head the points stand nearer together in front, where the face is: each gap a little wider than the one
  // before it, from 5 mm at the nose to 2 cm at the back of the head; down the neck they come to stand evenly)
  const evenH = even(H / 2), faceH = evenH.map((u) => (Math.exp(1.6 * u) - 1) / (Math.exp(1.6) - 1)), headShares = (y) => { const k = smooth01((y - 1.49) / 0.07); return evenH.map((s, i) => s + (faceH[i] - s) * k); };
  const foldShares = (O, t, y) => { const h = held(O, H / 2, [[iP, split.P], [iQ, split.Q]]), base = headShares(y); return h.map((s, i) => base[i] + (s - base[i]) * t); };
  const rows = [];   // (the rings from the crown down, each a list of H points)
  if (!only || only.includes('body')) {
    for (const y of headYs) rows.push(halfRing(body, y, H / 2, headShares(y), 'head', { soft: 1.2, thick: 0.0033, z0: -0.01 }));
    for (const y of neckYs) rows.push(halfRing(body, y, H / 2, headShares(y), 'head', { soft: 3, thick: 0.005 }));
    // (over the shoulders the points go from evenly spaced, at the neck, to held at the armpit's folds)
    for (const y of shoulderYs) { const t = smooth01((neckYs.at(-1) - y) / (neckYs.at(-1) - armpit)); rows.push(halfRing(both, y, H / 2, (O) => foldShares(O, t, y), (i) => (i > iP && i < iQ && y < 1.47 ? 'arm' : 'trunk'), { soft: 2, thick: 0.004 })); }
    const S0 = across(held(split.O, H / 2, [[iP, split.P], [iQ, split.Q]]).map((f) => split.O.atFrac(f)), (i) => (i > iP && i < iQ ? 'arm' : 'trunk'));
    rows.push(S0);
    // Under the chin: the jaw overhangs the throat, and level rings cannot draw an overhang: the ring under the chin
    // would stand five centimetres behind the one above it, the faces between them one long ledge with a crease at
    // each end. So before the throat and under the jaw's sides a ring's points stand back from the ring above by no more than six
    // times the height between them: the floor of the mouth a shallow slope from the chin's foot to the throat (a man's
    // is near level; at 2.2 times, as it was, the chin ran into the throat as a wedge and the neck measured 45 cm round). (Round to behind the jaw's angle; only where the lower ring
    // stands inside the upper.)
    for (let r = 1; r < rows.length; r++) {
      const y = P[rows[r][0]][1]; if (y > 1.585 || y < 1.5) continue;
      for (const i of [...Array(Math.round(H / 3.4) + 1).keys()]) { const a = P[rows[r - 1][i]], b = P[rows[r][i]], dx = b[0] - a[0], dz = b[2] - a[2], d = Math.hypot(dx, dz), most = 6 * (a[1] - b[1]); if (d > most && Math.hypot(b[0], b[2] + 0.02) < Math.hypot(a[0], a[2] + 0.02)) { b[0] = a[0] + (dx * most) / d; b[2] = a[2] + (dz * most) / d; if (i > 0) { const t = P[twin[rows[r][i]]]; t[0] = -b[0]; t[2] = b[2]; } } }
    }
    for (let i = 0; i < rows.length - 1; i++) band(rows[i], rows[i + 1], whole);
    // the crown: the first ring closed by a patch of squares, H/4 a side, its points on the scalp over them
    {
      const R0 = rows[0], m = H / 4, c = [0, 0, 0]; for (const v of R0) { c[0] += P[v][0] / H; c[1] += P[v][1] / H; c[2] += P[v][2] / H; }
      // (the ring's points taken as the patch's rim: its four sides from the front's right corner round)
      const rim = (k) => R0[(((k - m / 2) % H) + H) % H], grid = [];
      const top = (x, z) => { let y = crown + 0.02; while (y > c[1] - 0.01 && body([x, y, z]) > 0) y -= 0.0005; return y; };
      for (let j = 0; j <= m; j++) {
        grid.push([]);
        for (let i = 0; i <= m; i++) {
          // (j from the front edge to the back, i from the right to the left: the rim runs front-right … front-left (k = 0 … m), down the left to the back-left (m … 2m), along the back to the back-right (2m … 3m), up the right (3m … 4m))
          if (j === 0) grid[j].push(rim(i)); else if (j === m) grid[j].push(rim(3 * m - i)); else if (i === m) grid[j].push(rim(m + j)); else if (i === 0) grid[j].push(rim(4 * m - j));
          else if (i < m / 2) grid[j].push(-1); else {
            const a = P[rim(i)], b = P[rim(3 * m - i)], l = P[rim(4 * m - j)], r = P[rim(m + j)], u = i / m, v = j / m;
            const x = (l[0] * (1 - u) + r[0] * u + a[0] * (1 - v) + b[0] * v) / 2 * 0.86, z = c[2] + ((l[2] * (1 - u) + r[2] * u + a[2] * (1 - v) + b[2] * v) / 2 - c[2]) * 0.86;   // (drawn in a little: the rim's own squares are not left the longest)
            grid[j].push(point([x, top(x, z), z], 'head', i === m / 2));
          }
        }
      }
      for (let j = 1; j < m; j++) for (let i = 1; i < m / 2; i++) grid[j][i] = mir(grid[j][m - i]);
      for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) whole.push([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]);
    }

    // ── under the armpits the ring divides: the trunk's, and an arm's either side ──────────────────────────────
    // The armpit's floor is a row of points from the fold before the arm to the fold behind it; the trunk's ring is
    // the shoulders' less the arms' arcs, closed by those rows, an arm's its arc closed by its row.
    const under = [];
    for (let k = 1; k < KA; k++) { const p = lerp(P[S0[iP]], P[S0[iQ]], k / KA); under.push(point([p[0], p[1] + 0.012 * Math.sin((Math.PI * k) / KA), p[2]], 'trunk')); }
    const trunk0 = [...S0.slice(0, iP + 1), ...under, ...S0.slice(iQ, H - iQ + 1), ...under.map(mir).reverse(), ...S0.slice(H - iP)];
    const arm0 = [S0[iP], ...S0.slice(iP + 1, iQ), S0[iQ], ...under.slice().reverse()];
    // the trunk: its points held at the folds just under the armpit, evenly spaced by the waist
    const evenT = even(NT / 2), tP = iP, tQ = iP + KA;
    const trunkRows = [trunk0];
    for (const y of trunkYs) { const t = 1 - smooth01((armpit - y) / 0.16); trunkRows.push(halfRing(body, y, NT / 2, (O) => { const h = held(O, NT / 2, [[tP, split.P], [tQ, split.Q]]); return h.map((s, i) => evenT[i] + (s - evenT[i]) * t); }, 'trunk', { soft: 5.5, thick: 0.014 })); }
    for (let i = 0; i < trunkRows.length - 1; i++) band(trunkRows[i], trunkRows[i + 1], whole);

    // ── the crotch: the trunk's last ring divides into the two legs', a row of points under the body between them ──
    const R1 = trunkRows.at(-1), F = P[R1[0]], B = P[R1[NT / 2]], between = [];
    const floor = (z) => { let y = crotch - 0.05; while (y < crotch + 0.05 && body([0, y, z]) > -0.003) y += 0.0005; return y; };
    for (let k = 1; k < KC; k++) { const z = F[2] + ((B[2] - F[2]) * k) / KC; between.push(point([0, Math.min(floor(z), Math.min(F[1], B[1]) - 0.004), z], 'trunk', true)); }
    const leg0 = [R1[0], ...R1.slice(1, NT / 2), R1[NT / 2], ...between.slice().reverse()];

    // ── a limb: rings round its own middle ─────────────────────────────────────────────────────────────────────
    // A ring lies in a plane: e1 its front, u the way the limb goes on (down an arm or a leg, forwards along a foot).
    // Its middle is found on the shape (the middle of its outline), its points at the angles given, from the front
    // round by the left.
    const frameOf = (e1, u) => { const f = norm(sub(e1, mul(u, dot(e1, u)))); return [f, cross(f, u)]; };
    const planeRing = (S, c0, e1, u, angles, of, { soft = 8, thick = 0.014, far = 0.2, step = 0.003, centre = true } = {}) => {
      const [f, l] = frameOf(e1, u); let c = c0, O = null;
      if (centre) for (let it = 0; it < 2; it++) { O = outline(S, c, f, l, { far, soft, thick, along: u, step }); const m = O.middle(); c = add(c0, add(mul(f, dot(sub(m, c0), f)), mul(l, dot(sub(m, c0), l)))); }
      O = outline(S, c, f, l, { far, soft, thick, along: u, step });
      return { ids: ring(angles.map((a) => O.atAngle(a)), of), c, O, f, l };
    };
    const evenly = (n, first) => Array.from({ length: n }, (_, j) => first + (360 / n) * j);
    // (a limb's middle at a height: on the line through its joints)
    const along = (names) => { const A = names.map(J); return (y) => { for (let i = 0; i < A.length - 1; i++) if (y >= A[i + 1][1] || i === A.length - 2) { const t = (A[i][1] - y) / (A[i][1] - A[i + 1][1]); return lerp(A[i], A[i + 1], t); } }; };
    const legAt = along(['thigh.L', 'shin.L', 'foot.L']), armAt = along(['upperArm.L', 'foreArm.L', 'hand.L']);
    const knee = J('shin.L')[1], elbow = J('foreArm.L')[1], wrist = J('hand.L')[1];
    // (where a point lies round an axis, degrees from e1 towards e2; and a row of such angles made to run on upwards)
    const angleOf = (p, c, f, l) => Math.atan2(dot(sub(p, c), l), dot(sub(p, c), f)) / D;
    const unwrap = (a) => { const out = [a[0]]; for (let i = 1; i < a.length; i++) { let x = a[i]; while (x < out[i - 1]) x += 360; while (x - out[i - 1] > 360) x -= 360; out.push(x); } return out; };
    const seg = (p, a, b) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab))); return len(sub(p, add(a, mul(ab, t)))); };
    // A finger or a toe: from the ring it leaves the hand or the foot by (its points as they lie there), rings across
    // its own line at the shares of its length given, the points coming to stand evenly round it; closed at its tip.
    const digit = (S, loop, a, b, e1, shares, of, into) => {
      const u = norm(sub(b, a)), [f, l] = frameOf(e1, u), n = loop.length, c0 = add(a, mul(u, dot(sub(P[loop[0]], a), u)));
      const from = unwrap(loop.map((v) => angleOf(P[v], c0, f, l))), mean = from.reduce((x, y, i) => x + (y - (360 / n) * i), 0) / n;
      let prev = loop;
      shares.forEach((sh, k) => {
        const t = Math.min(1, (k + 1) / 2), angles = from.map((x, i) => x + (mean + (360 / n) * i - x) * t);
        const R = planeRing(S, lerp(a, b, sh), f, u, angles, of, { soft: 8, thick: 0.002, far: 0.03, step: 0.001, centre: false });
        band(prev, R.ids, into); prev = R.ids;
      });
      into.push(prev.slice().reverse());   // (its tip: one face, rounded by the smoothing)
    };

    // ── the arm, and the hand on it ────────────────────────────────────────────────────────────────────────────
    const firstA = -90 + (KA / 2) * (360 / NA), armRows = [arm0];
    const armYs = levels(armpit - 0.03, wrist + 0.03, (y) => (Math.abs(y - elbow) < 0.07 ? 0.02 : 0.03));
    for (const y of armYs) armRows.push(planeRing(arm, armAt(y), front, down, evenly(NA, firstA), 'arm').ids);
    // the wrist and the heel of the hand: level rings still, closer together
    const thumbRoot = J('thumb2.L'), thumbTip = add(J('thumb3.L'), mul(norm(sub(J('thumb3.L'), J('thumb2.L'))), 0.026 + 0.006));
    const handMid = (y) => [J('hand.L')[0], y, J('hand.L')[2]];
    for (const y of levels(wrist + 0.008, thumbRoot[1] + 0.012, () => 0.019)) armRows.push(planeRing(arm, handMid(y), front, down, evenly(NA, firstA), 'arm', { soft: 3, thick: 0.004, step: 0.0015, far: 0.09 }).ids);
    for (let i = 0; i < armRows.length - 1; i++) band(armRows[i], armRows[i + 1], left);
    {
      // The thumb leaves the hand: a ring at its root, six of its points round the thumb, held where the thumb's skin
      // meets the palm's (the web's two ends); the other sixteen go on round the palm.
      const y = thumbRoot[1] + 0.001, nearThumb = (p) => seg(p, J('thumb1.L'), thumbTip) < 0.0175 && p[2] > J('index1.L')[2] + 0.004;
      const [f, l] = frameOf(front, down); let c = handMid(y), O = outline(arm, c, f, l, { far: 0.09, soft: 2, thick: 0.002, along: down, step: 0.001 });
      { const m = O.middle(); c = [m[0], y, m[2]]; O = outline(arm, c, f, l, { far: 0.09, soft: 2, thick: 0.002, along: down, step: 0.001 }); }
      // (the thumb's arc of the outline: from its first sample to its last, going round by the front)
      let a0 = null, a1 = null; for (let i = 0; i < 720; i++) { const deg = -180 + i * 0.5, is = nearThumb(O.atAngle(deg)); if (is && a0 == null) a0 = deg; if (is) a1 = deg; }
      const s0 = O.fracOf(a0), s1 = O.fracOf(a1), span = (((s1 - s0) % 1) + 1) % 1, rest = 1 - span, T0 = NA - 2, pts = new Array(NA);
      for (let k = 0; k <= 5; k++) pts[(T0 + k) % NA] = O.atFrac((((s0 + (span * k) / 5) % 1) + 1) % 1);   // (the thumb's six: T0 … T0 + 5)
      for (let k = 1; k < NA - 5; k++) pts[(T0 + 5 + k) % NA] = O.atFrac((((s1 + (rest * k) / (NA - 5)) % 1) + 1) % 1);
      const R = ring(pts, 'arm'); band(armRows.at(-1), R, left);
      const thumbLoop = [0, 1, 2, 3, 4, 5].map((k) => R[(T0 + k) % NA]), palmLoop = Array.from({ length: NA - 4 }, (_, k) => R[(T0 + 5 + k) % NA]);
      for (const v of thumbLoop.slice(1, 5)) part[v] = P_.thumb;
      const thumbS = (p) => Math.max(arm(p), seg(p, thumbRoot, thumbTip) - 0.019);
      digit(thumbS, thumbLoop, thumbRoot, thumbTip, front, [0.3, 0.52, 0.72, 0.9, 0.975], 'thumb', left);
      // the palm below the thumb: a ring round it, then the ring the fingers leave by. Of its sixteen points: one at
      // its front end and one at its back, and along its back and along its palm a point on each finger's middle
      // and one in each web between two fingers.
      const palmS = (p) => Math.max(arm(p), 0.0165 - seg(p, thumbRoot, thumbTip)), NP = NA - 4;
      const F4 = ['index', 'middle', 'ring', 'little'].map((n) => ({ n, a: J(n + '1.L'), j2: J(n + '2.L'), j3: J(n + '3.L') }));
      for (const g of F4) g.tip = add(g.j3, mul(norm(sub(g.j3, g.j2)), T.handRods?.find((r) => r.part === P_[g.n])?.segs[2][1] ? len(sub(T.handRods.find((r) => r.part === P_[g.n]).segs[2][1], g.j3)) + 0.007 : 0.03));
      const webY = Math.min(...F4.map((g) => g.a[1])) - 0.014, yMid = (y + webY) / 2;
      const first = palmLoop.map((v) => P[v]), cP = [0, 0, 0]; for (const q of first) { cP[0] += q[0] / NP; cP[2] += q[2] / NP; }
      // (a ring between: its points a share of the way from the thumb's ring to the fingers', on the palm's skin)
      const out = (o, d, far = 0.05) => add(o, mul(d, exit(palmS, o, d, far, 0, 0.001)));
      const xs = F4[0].a[0], at = (z, yy) => [xs, yy, z], zOf = F4.map((g) => g.a[2]), zWeb = [0, 1, 2].map((i) => (zOf[i] + zOf[i + 1]) / 2);
      const roles = (yy) => {
        const d = (z) => out(at(z, yy), [1, 0, 0]), p = (z) => out(at(z, yy), [-1, 0, 0]);
        return [out(at(zOf[0], yy), [0, 0, 1]), d(zOf[0]), d(zWeb[0]), d(zOf[1]), d(zWeb[1]), d(zOf[2]), d(zWeb[2]), d(zOf[3]), out(at(zOf[3], yy), [0, 0, -1]), p(zOf[3]), p(zWeb[2]), p(zOf[2]), p(zWeb[1]), p(zOf[1]), p(zWeb[0]), p(zOf[0])];
      };
      const midRing = ring(roles(yMid), 'arm'), webRing = ring(roles(webY), 'arm');
      band(palmLoop, midRing, left); band(midRing, webRing, left);
      const W = webRing, loops = [[W[0], W[1], W[2], W[14], W[15]], [W[2], W[3], W[4], W[12], W[13], W[14]], [W[4], W[5], W[6], W[10], W[11], W[12]], [W[6], W[7], W[8], W[9], W[10]]];
      F4.forEach((g, i) => {
        const near = Math.min(...zOf.filter((_, k) => k !== i).map((z) => Math.abs(z - zOf[i]))) / 2 + 0.0004, S = (p) => Math.max(arm(p), seg(p, g.a, g.tip) - near), L = len(sub(g.tip, g.a));
        const pip = len(sub(g.j2, g.a)) / L, web = (g.a[1] - webY) / L, sh = [web + (pip - web) * 0.5, pip, (len(sub(g.j2, g.a)) + len(sub(g.j3, g.j2)) / 2) / L, (len(sub(g.j2, g.a)) + len(sub(g.j3, g.j2))) / L, 0.86, 0.95, 0.985];
        digit(S, loops[i], g.a, g.tip, front, sh, g.n, left);
      });
    }

    // ── the leg, and the foot on it ────────────────────────────────────────────────────────────────────────────
    // The leg's rings are level down to the ankle; there the foot goes on forwards: five rings fanned about a line
    // across the front of the ankle, the last upright; then upright rings to the ball of the foot, and the toes.
    const firstL = -90 + (KC / 2) * (360 / NL), legRows = [leg0], hinge = [J('foot.L')[0], 0.115, 0.075];
    const legYs = [...levels(crotch - 0.022, hinge[1] + 0.012, (y) => (Math.abs(y - knee) < 0.09 ? 0.02 : 0.03)), hinge[1]];
    for (const y of legYs) legRows.push(planeRing(leg, legAt(y), front, down, evenly(NL, firstL), 'leg').ids);
    const footOpts = { soft: 3, thick: 0.004, step: 0.002, far: 0.16 };
    for (const deg of [18, 36, 54, 72, 90]) { const a = deg * D, e1 = [0, Math.sin(a), Math.cos(a)], u = [0, -Math.cos(a), Math.sin(a)]; legRows.push(planeRing(leg, sub(hinge, mul(e1, 0.085)), e1, u, evenly(NL, firstL), 'leg', footOpts).ids); }
    const toes = T.toeRods ?? [], up = [0, 1, 0], fore = [0, 0, 1];
    if (toes.length === 5) {
      const zc = toes.map((R) => R.a[2] + 0.34 * (R.b[2] - R.a[2])), xc = toes.map((R, i) => R.a[0] + 0.34 * (R.b[0] - R.a[0])), ball = Math.min(...zc) - 0.02;
      for (const z of [hinge[2] + (ball - hinge[2]) * 0.5, ball]) legRows.push(planeRing(leg, [hinge[0], 0.03, z], up, fore, evenly(NL, firstL), 'leg', footOpts).ids);
      // the ring the toes leave by: across the foot where its webs are, a point over and under each web and each small
      // toe's middle, three over and under the big toe, one at each end
      const yMid = 0.02, o = (x, z, d, far = 0.06) => { const c = [x, yMid, z]; return add(c, mul(d, exit(leg, c, d, far, 0, 0.001))); };
      const xw = [0, 1, 2, 3].map((i) => (xc[i] + xc[i + 1]) / 2), zw = [0, 1, 2, 3].map((i) => (zc[i] + zc[i + 1]) / 2), r1 = toes[0].r0;
      const dn = [0, -1, 0], roles = new Array(NL);
      // (counted as the leg's rings are: 18 the inner end, on over the top to 9 the outer end, back under the sole)
      roles[18] = o(xc[0], zc[0], [-1, 0, 0]); roles[19] = o(xc[0] - 0.45 * r1, zc[0], up); roles[0] = o(xc[0] + 0.3 * r1, zc[0], up);
      roles[1] = o(xw[0], zw[0], up); roles[2] = o(xc[1], zc[1], up); roles[3] = o(xw[1], zw[1], up); roles[4] = o(xc[2], zc[2], up); roles[5] = o(xw[2], zw[2], up); roles[6] = o(xc[3], zc[3], up); roles[7] = o(xw[3], zw[3], up); roles[8] = o(xc[4], zc[4], up);
      roles[9] = o(xc[4], zc[4], [1, 0, 0]); roles[10] = o(xc[4], zc[4], dn); roles[11] = o(xw[3], zw[3], dn); roles[12] = o(xw[2], zw[2], dn); roles[13] = o(xw[1], zw[1], dn); roles[14] = o(xw[0], zw[0], dn);
      roles[15] = o(xc[0] + 0.5 * r1, zc[0], dn); roles[16] = o(xc[0], zc[0], dn); roles[17] = o(xc[0] - 0.5 * r1, zc[0], dn);
      const W = ring(roles, 'leg'); legRows.push(W);
      for (let i = 0; i < legRows.length - 1; i++) band(legRows[i], legRows[i + 1], left);
      const loops = [[W[18], W[19], W[0], W[1], W[14], W[15], W[16], W[17]], [W[1], W[2], W[3], W[13], W[14]], [W[3], W[4], W[5], W[12], W[13]], [W[5], W[6], W[7], W[11], W[12]], [W[7], W[8], W[9], W[10], W[11]]];
      toes.forEach((R, i) => { const tip = add(R.b, mul(norm(sub(R.b, R.a)), R.r1 * 0.8)), S = (p) => Math.max(leg(p), seg(p, R.a, tip) - (R.r0 + 0.0006)); digit(S, loops[i], R.a, tip, up, [0.56, 0.76, 0.92, 0.985], 'leg', left); });
    } else { for (let i = 0; i < legRows.length - 1; i++) band(legRows[i], legRows[i + 1], left); left.push(legRows.at(-1).slice().reverse()); }
  }
  return finish();

  function finish() {
    for (const f of left) { whole.push(f); whole.push(f.map(mir).reverse()); }
    return { pos: Float64Array.from(P.flat()), faces: whole, part: Uint8Array.from(part), side: Int8Array.from(side), levels: { crown, armpit, crotch }, PARTS };
  }
}

/** The cage moved so that the smooth surface it makes passes through the places its points were found at (a smooth
    surface lies inside its cage: a finger of six points round comes out a sixth thinner than it was measured). */
export function fitted(cage, rounds = 2, most = 0.006) {
  // (two rounds, each point moved by no more than `most`: a slim part comes out within a few hundredths of its
  // measure, and a ring that happens to stand off its neighbours is not driven further off them, as an exact fit would)
  const want = Float64Array.from(cage.pos), pos = Float64Array.from(cage.pos), nv = pos.length / 3;
  for (let it = 0; it < rounds; it++) {
    const L = limit(refine({ pos, faces: cage.faces }));
    for (let v = 0; v < nv; v++) {
      const d = [want[v * 3] - L.pos[v * 3], want[v * 3 + 1] - L.pos[v * 3 + 1], want[v * 3 + 2] - L.pos[v * 3 + 2]], l = Math.hypot(d[0], d[1], d[2]), k = l > most ? most / l : 1;
      pos[v * 3] += d[0] * k; pos[v * 3 + 1] += d[1] * k; pos[v * 3 + 2] += d[2] * k;
    }
  }
  return { ...cage, pos };
}
