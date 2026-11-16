// A body grown from anatomy (intent 0033): the skeleton's landmarks, the muscles laid over it from origin to insertion,
// the bones that show and a thin skin over them (./anatomy.js), as one field (./field.js), drawn out as one mesh at
// every level of detail. Plain JS, no three: the human kit (./human.js) makes it a thing that moves; a tool can run it
// under node.
//
//   bodyOf(recipe, { lods }) -> { M, bones: { names, parent, at, bind }, lods: [{ pos, nor, rest, ctr, part, sk, sw, index }] }
//
// The skeleton has two poses: the neutral one (standing, arms down: what a move's angles start from, every bone's frame
// turned like the world's) and the one the skin is drawn in (arms out, fingers spread, legs a little apart, the mouth a
// little open: so that no two parts touch while the surface is drawn out of the field). Every solid is laid down in the
// neutral pose and carried to the drawing pose by its bone; a muscle by both its bones, each end by its own.
//
//   root ─ hips ─ spine1 ─ spine2 ─ spine3 ─ neck1 ─ neck2 ─ head ─ jaw, eye.L/R, lidUp.L/R, lidLo.L/R
//                                      └ clavicle ─ upperArm ─ upperArmTwist, foreArm ─ foreArmTwist, hand ─ fingers
//               └ thigh ─ thighTwist, shin ─ foot ─ toes
import { ball, egg, rod, box, ring, plane, group, strand, fieldOf, meshOf, zip, slope } from './field.js';
import { JOINTS, PARENT, FINGERS, fingerJoints, anatomyOf, PART as P0 } from './anatomy.js';
import { FACE, AGE, BUILD } from './measures.js';
import { hash3 } from '../../assets/kit/blob.js';

export const PART = P0;
const SIDES = [['L', 1], ['R', -1]];
const REF_H = 1.8;   // the reference man's height (./anatomy.js)
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm3 = (a) => mul3(a, 1 / (len3(a) || 1));
const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ── the measures ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The body's measures: its height, sex, age and build, what they make of its fat and muscle, and the walker kind's
    own numbers (the stress stand: assets/kit/creature.js). */
export function measuresOf(R) {
  const kind = R.from?.kind ?? 0, H = R.height ?? 1.8, b = R.body ?? {};
  const s = b.sex ?? 1, age = b.age ?? 30, build = b.build ?? 0.5;
  const r = (i) => hash3(kind, i, 3, 4242);
  const bf = build < 0.5 ? lerp(BUILD.fat[0], BUILD.fat[1], build * 2) : lerp(BUILD.fat[1], BUILD.fat[2], (build - 0.5) * 2);
  const bm = build < 0.5 ? lerp(BUILD.muscle[0], BUILD.muscle[1], build * 2) : lerp(BUILD.muscle[1], BUILD.muscle[2], (build - 0.5) * 2);
  const fat = bf * (1 + AGE.fat * Math.min(4, Math.max(0, (age - 25) / 10)));
  const muscle = (b.muscle ?? 1) * bm * (1 - AGE.muscle * Math.max(0, (age - 35) / 10));
  return { H, s, age, build, fat, muscle, kind, r, k: H / REF_H, eyeR: FACE.eyeball / 2000, corneaR: FACE.cornea / 2000, corneaCurve: FACE.corneaCurve / 1000 };
}

// ── the skeleton ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The bones: { names, parent, at (neutral joint places), bind (the drawing pose's turns, axis-angle per bone), X (the
    reference man's points to this body's) }. */
export function skeletonOf(M) {
  const X = (p) => mul3(p, M.k); X.k = M.k; X.mus = M.muscle; X.fat = M.fat;
  const at = {}, parent = {};
  const mirror = (p) => [-p[0], p[1], p[2]];
  for (const [n, p] of Object.entries(JOINTS)) {
    if (n.endsWith('.L')) { at[n] = X(p); at[n.replace(/\.L$/, '.R')] = X(mirror(p)); }
    else at[n] = X(p);
  }
  for (const n of Object.keys(at)) parent[n] = PARENT[n] ?? null;
  for (const [s, sg] of SIDES) {
    at['upperArmTwist.' + s] = mix3(at['upperArm.' + s], at['foreArm.' + s], 0.35); parent['upperArmTwist.' + s] = 'upperArm.' + s;
    at['foreArmTwist.' + s] = mix3(at['foreArm.' + s], at['hand.' + s], 0.6); parent['foreArmTwist.' + s] = 'foreArm.' + s;
    at['thighTwist.' + s] = mix3(at['thigh.' + s], at['shin.' + s], 0.3); parent['thighTwist.' + s] = 'thigh.' + s;
    const w = JOINTS['hand.L'], J = fingerJoints([w[0] * sg, w[1], w[2]], sg);
    for (const f of FINGERS) {
      for (let j = 1; j <= 3; j++) { at[`${f}${j}.${s}`] = X(J[`${f}${j}`]); parent[`${f}${j}.${s}`] = j === 1 ? 'hand.' + s : `${f}${j - 1}.${s}`; }
      at[`${f}Tip.${s}`] = X(J[`${f}Tip`]);
    }
  }
  // the order: every bone after its parent
  const names = [], seen = new Set(), visit = (n) => { if (seen.has(n) || !(n in parent)) return; if (parent[n]) visit(parent[n]); seen.add(n); names.push(n); };
  for (const n of Object.keys(parent)) if (!n.includes('Tip.')) visit(n);
  // the drawing pose: turns (axis, angle) per bone, from the neutral pose
  const bind = {};
  for (const [s, sg] of SIDES) {
    bind['upperArm.' + s] = [[0, 0, 1], sg * 0.72];           // arms out, 41°
    bind['foreArm.' + s] = [[0, 0, 1], sg * 0.06];
    bind['thigh.' + s] = [[0, 0, 1], sg * 0.08];              // legs apart
    bind['thumb1.' + s] = [[0, 1, 0], -sg * 0.22];
    bind['index1.' + s] = [[1, 0, 0], 0.12]; bind['ring1.' + s] = [[1, 0, 0], -0.09]; bind['little1.' + s] = [[1, 0, 0], -0.19];   // fingers spread
  }
  bind.jaw = [[1, 0, 0], 0.07];                                 // the mouth a little open
  return { names, parent, at, bind, X };
}

// rotations as matrices (rows), and the bones' frames in each pose
const rotAA = (ax, a) => { const [x, y, z] = nrm3(ax), c = Math.cos(a), s = Math.sin(a), t = 1 - c; return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c]; };
const mm3 = (A, B) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
const mv3 = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const tr3 = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Each bone's place and turn in a pose (world), and the map of a neutral point on a bone to that pose. */
export function posed(S, turns = S.bind) {
  const W = {};
  for (const n of S.names) {
    const p = S.parent[n], rel = turns[n] ? rotAA(...turns[n]) : I3;
    if (!p) { W[n] = { R: rel, t: S.at[n] }; continue; }
    const P = W[p], off = sub3(S.at[n], S.at[p]);
    W[n] = { R: mm3(P.R, rel), t: add3(P.t, mv3(P.R, off)) };
  }
  const move = (n, x) => add3(W[n].t, mv3(W[n].R, sub3(x, S.at[n])));
  return { W, move };
}

// ── the drawing pose, and the field ──────────────────────────────────────────────────────────────────────────────────
/** A solid carried from the neutral pose by its bone (a muscle: each end by its own bone). */
function moved(o, P) {
  const s = o.s, A = P.W[o.bone], mv = (p) => P.move(o.bone, p), mvR = (Rs) => mm3(Rs, tr3(A.R));
  switch (s.t) {
    case 0: return ball(mv(s.c), s.r);
    case 1: return egg(mv(s.c), s.r, mvR(s.R));
    case 2: return rod(mv(s.a), mv(s.b), s.ra, s.rb);
    case 3: return box(mv(s.c), s.h, s.rr, mvR(s.R));
    case 4: return ring(mv(s.c), s.R0, s.r, mvR(s.R));
    case 5: { const n = mv3(A.R, s.n); return plane(n, mv(mul3(s.n, -s.d))); }
    case 6: return group(s.ops.map((c) => ({ ...c, s: moved({ ...o, s: c.s, bone2: null }, P) })));
    case 7: { const b2 = o.bone2 ?? o.bone; return strand(mv(s.a), P.move(b2, add3(s.a, mul3(s.u, s.L))), { ...s.opt, out: mv3(A.R, s.w) }); }
  }
  return s;
}

/** The body's field in the drawing pose (or another pose, by turns), each op with its bone(s). */
export function fieldOfBody(M, S, { turns } = {}) {
  const P = posed(S, turns), A = anatomyOf(S.X);
  const ops = A.ops.map((o) => ({ ...o, op: o.op ?? 'add', s: moved(o, P) }));
  // what is cut out is cut after what it is cut from
  const order = [...ops.filter((o) => o.op === 'add'), ...ops.filter((o) => o.op !== 'add')];
  return { field: fieldOf(order), P };
}

// ── the eyes: a ball with its cornea, made as rings (too round to draw out of the field) ────────────────────────────
function eyeball(M, e, nu, nv) {
  const R = M.eyeR, rc = M.corneaCurve, lim = M.corneaR, zl = Math.sqrt(R * R - lim * lim), zc = zl - Math.sqrt(rc * rc - lim * lim), thc = Math.asin(lim / R);
  const pos = [], nor = [], tri = [];
  for (let j = 0; j <= nv; j++) {
    const t = j / nv, th = t < 0.35 ? (t / 0.35) * thc * 1.15 : thc * 1.15 + ((t - 0.35) / 0.65) * (Math.PI - thc * 1.15);
    for (let i = 0; i <= nu; i++) {
      const ph = (i / nu) * 2 * Math.PI, d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      let r = R, n = d;
      if (th < thc) { const ct = Math.cos(th); r = zc * ct + Math.sqrt(zc * zc * ct * ct - zc * zc + rc * rc); n = nrm3(sub3(mul3(d, r), [0, 0, zc])); }
      pos.push(...add3(e, mul3(d, r))); nor.push(...n);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1; tri.push(a, d, c, a, c, b); }
  return { pos, nor, tri };
}

// ── the levels: each drawn region by region, each region at its own fineness, joined where a cut parted them ─────────
const LEVELS = [
  { head: 0.0014, hands: 0.0016, body: 0.006 },
  { head: 0.003, hands: 0.003, body: 0.011 },
  { head: 0.008, body: 0.022 },
  { body: 0.045 },
];

function regionsOf(M, S, P, lv) {
  const at = (n) => P.W[n].t, regions = [];
  const neckAt = mix3(at('neck1'), at('neck2'), 0.75), neckN = nrm3(sub3(at('head'), at('neck1')));
  const neck = { id: 'neck', kind: 'plane', at: neckAt, n: neckN, r: 0.12 * M.k };
  const flip = (c) => ({ ...c, n: mul3(c.n, -1) });
  const wrists = SIDES.map(([s]) => { const w = at('hand.' + s), el = at('foreArm.' + s), d = nrm3(sub3(w, el)); return { id: 'wrist.' + s, kind: 'plane', at: add3(w, mul3(d, 0.012 * M.k)), n: d, r: 0.06 * M.k }; });
  const cuts = [];
  if (lv.head) cuts.push(neck);
  if (lv.hands) cuts.push(...wrists);
  regions.push({ name: 'body', lo: [-1, -0.02, -0.3], hi: [1, lv.head ? neckAt[1] + 0.04 : M.H + 0.04, 0.3], h: lv.body, cuts });
  if (lv.head) regions.push({ name: 'head', lo: [-0.14 * M.k, neckAt[1] - 0.04, -0.16 * M.k], hi: [0.14 * M.k, M.H + 0.03, 0.16 * M.k], h: lv.head, cuts: [flip(neck)] });
  if (lv.hands) for (const [i, [s]] of SIDES.entries()) {
    const w = at('hand.' + s), tip = P.move(`middle3.${s}`, S.at[`middleTip.${s}`]), c = mix3(w, tip, 0.5), e = len3(sub3(tip, w)) * 0.62 + 0.035 * M.k;
    regions.push({ name: 'hand.' + s, lo: sub3(c, [e, e, e]), hi: add3(c, [e, e, e]), h: lv.hands, cuts: [flip(wrists[i])] });
  }
  return regions;
}

// ── the attributes of each point ─────────────────────────────────────────────────────────────────────────────────────
/** Which op the field's value at a point comes from: the last that set it. */
function ownerAt(field, list, x, y, z) {
  let f = 1e9, own = -1;
  for (const i of list) {
    const o = field.ops[i], d = field.d(i, x, y, z), k = o.k;
    if (o.op === 'add') { if (d < f) own = i; const h = k - Math.abs(f - d); f = Math.min(f, d) - (k > 0 && h > 0 ? (h * h) / (4 * k) : 0); }
    else if (o.op === 'sub') { if (-d > f) own = i; const h = k - Math.abs(f + d); f = Math.max(f, -d) + (k > 0 && h > 0 ? (h * h) / (4 * k) : 0); }
  }
  return own;
}

/** The four bones a point follows, and how much: each solid of flesh near it counts by how near it is against the
 *  nearest (the field's own blend, read as weights); a muscle counts for both its bones, by where along it the point is. */
function weightsAt(field, list, boneIx, x, y, z) {
  const near = []; let dmin = 1e9;
  for (const i of list) { const o = field.ops[i]; if (!o.body || o.op !== 'add') continue; const d = field.d(i, x, y, z); near.push([o, d]); if (d < dmin) dmin = d; }
  const w = new Map(), give = (b, v) => w.set(boneIx[b], (w.get(boneIx[b]) || 0) + v);
  for (const [o, d] of near) {
    const kk = Math.max(o.k, 0.004) * 1.6, t = 1 - (d - dmin) / kk; if (t <= 0) continue;
    const v = t * t;
    if (o.s.t === 7 && o.bone2 && o.bone2 !== o.bone) {
      const s = o.s, along = Math.min(1, Math.max(0, ((x - s.a[0]) * s.u[0] + (y - s.a[1]) * s.u[1] + (z - s.a[2]) * s.u[2]) / s.L)), b = sstep(0.15, 0.85, along);
      give(o.bone, v * (1 - b)); give(o.bone2, v * b);
    } else give(o.bone, v);
  }
  if (!w.size) return null;
  return [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
}

/** The twist bones take their share along their segment: the upper arm's and the thigh's near the joint they hang
 *  from, the forearm's near the wrist. */
function twist(bones, S, boneIx, p, P) {
  const out = [];
  for (const [b, w] of bones) {
    const n = S.names[b], m = /^(upperArm|thigh|foreArm)\.(L|R)$/.exec(n);
    if (!m) { out.push([b, w]); continue; }
    const kid = m[1] === 'upperArm' ? 'foreArm' : m[1] === 'thigh' ? 'shin' : 'hand', a = P.W[n].t, c = P.W[`${kid}.${m[2]}`].t, d = sub3(c, a);
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / (len3(d) ** 2)));
    const share = m[1] === 'foreArm' ? 0.85 * sstep(0.25, 0.9, t) : 0.7 * (1 - sstep(0.05, 0.7, t));
    out.push([b, w * (1 - share)]); if (share > 0) out.push([boneIx[`${m[1]}Twist.${m[2]}`], w * share]);
  }
  const merged = new Map(); for (const [b, w] of out) merged.set(b, (merged.get(b) || 0) + w);
  return [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
}

// ── a person, built ──────────────────────────────────────────────────────────────────────────────────────────────────
/** The body of a recipe at the levels asked for (0 the finest … 3 a dot). */
export function bodyOf(R, { lods = [0, 1, 2, 3] } = {}) {
  const M = measuresOf(R), S = skeletonOf(M), boneIx = Object.fromEntries(S.names.map((n, i) => [n, i]));
  const out = { M, bones: { names: S.names, parent: S.names.map((n) => (S.parent[n] ? boneIx[S.parent[n]] : -1)), at: S.names.map((n) => S.at[n]), bind: S.bind, tips: Object.fromEntries(Object.entries(S.at).filter(([n]) => n.includes('Tip.'))) }, lods: [] };
  const built = fieldOfBody(M, S);
  for (const l of lods) out.lods[l] = level(M, S, built, LEVELS[l], boneIx);
  return out;
}

function level(M, S, { field, P }, lv, boneIx) {
  const t0 = Date.now();
  let m = null;
  for (const r of regionsOf(M, S, P, lv)) { const part = meshOf(field, r); m = m ? zip(m, part) : part; }
  const tExtract = Date.now() - t0;
  const A = { pos: [], nor: [], part: [], rest: [], ctr: [], sk: [], sw: [], index: [] };
  const toNeutral = (bone, p) => { const W = P.W[bone]; return add3(S.at[bone], mv3(tr3(W.R), sub3(p, W.t))); };
  const pushPoint = (x, y, z, n, part, bones, ctr) => {
    const lead = S.names[bones[0][0]], q = toNeutral(lead, [x, y, z]), nn = mv3(tr3(P.W[lead].R), n);
    A.pos.push(x, y, z); A.nor.push(...n); A.part.push(part); A.rest.push(...q); A.ctr.push(...(ctr ?? sub3(q, mul3(nn, 0.05))));
    const tot = bones.reduce((a, b) => a + b[1], 0); for (let k = 0; k < 4; k++) { A.sk.push(bones[k] ? bones[k][0] : 0); A.sw.push(bones[k] ? bones[k][1] / tot : 0); }
  };
  for (let i = 0; i < m.pos.length; i += 3) {
    const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2], list = field.nearPoint(x, y, z);
    const g = slope(field, list, x, y, z), gl = Math.hypot(...g) || 1, n = g.map((v) => v / gl);
    const o = field.ops[ownerAt(field, list, x, y, z)];
    let bones = weightsAt(field, list, boneIx, x, y, z) || [[boneIx[o?.bone ?? 'hips'], 1]];
    if (o && o.part === PART.teeth) bones = [[boneIx[o.bone], 1]];
    pushPoint(x, y, z, n, o ? o.part : PART.skin, twist(bones, S, boneIx, [x, y, z], P));
  }
  for (const v of m.tri) A.index.push(v);
  // the eyes (where the level has a head of its own)
  if (lv.head) for (const [s] of SIDES) {
    const e = P.W['eye.' + s].t, b = eyeball(M, e, lv.head < 0.002 ? 36 : 18, lv.head < 0.002 ? 26 : 12), off = A.pos.length / 3;
    for (let i = 0; i < b.pos.length; i += 3) pushPoint(b.pos[i], b.pos[i + 1], b.pos[i + 2], b.nor.slice(i, i + 3), PART.eye, [[boneIx['eye.' + s], 1]], S.at['eye.' + s]);
    for (const v of b.tri) A.index.push(v + off);
  }
  A.ms = Date.now() - t0; A.msExtract = tExtract;
  return A;
}

/** (for tools: the regions of level l) */
export const regionsForTest = (M, S, P, l) => regionsOf(M, S, P, LEVELS[l]);
