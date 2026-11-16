// A body grown from anatomy (intent 0033): bones as landmarks, muscles and fat as volumes blended into one another, the
// skin as the surface over them (./field.js), drawn out as one mesh at every level of detail. Plain JS, no three: the
// human kit (./human.js) makes it a thing that moves; a tool can run it under node.
//
//   bodyOf(recipe, { lods }) -> { M, bones, lods: [{ pos, nor, rest, part, uv, ctr, sk, sw, index, eyes }] }
//     recipe: a character (characters/*.js): its walker kind (individual proportions), height, and body { age, sex,
//     build }; what it wears (only which shells there are: the cloth's look is the material's).
//
// The skeleton is named as below, each bone at its joint. It has two poses: the neutral one (standing, arms down: what
// a move's angles start from, every bone's frame turned like the world's) and the one the skin is drawn in (arms out,
// fingers spread, the mouth a little open, the legs a little apart: so that no two parts of the body touch while the
// surface is drawn out of the field, and every opening is one). Every solid is set down in the neutral pose on its bone
// and carried to the drawing pose by its bone.
//
//   root ─ hips ─ spine1 ─ spine2 ─ spine3 ─ neck1 ─ neck2 ─ head ─ jaw, eye.L/R, lidUp.L/R, lidLo.L/R
//                                      └ clavicle ─ upperArm ─ upperArmTwist, foreArm ─ foreArmTwist, hand ─ fingers
//               └ thigh ─ thighTwist, shin ─ foot ─ toes
import { ball, egg, rod, box, ring, plane, group, frame, fieldOf, meshOf, zip, slope, dist } from './field.js';
import { SEGMENTS, ADULTS, FACE, HAND, AGE, BUILD } from './measures.js';
import { hash3 } from '../../assets/kit/blob.js';

const SIDES = [['L', 1], ['R', -1]];
const E = egg;
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'];
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm3 = (a) => mul3(a, 1 / (len3(a) || 1));
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** What each point of the skin is (the shader's look: characters/kit/human.js). */
export const PART = { skin: 0, shirt: 1, trousers: 2, belt: 3, shoe: 4, sole: 5, hair: 6, nail: 7, lip: 8, mouth: 9, teeth: 10, eye: 11, tongue: 12, brow: 13 };

// ── the measures ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The body's measures (metres): the survey's female and male means mixed by sex, scaled to the height, moved by age and
    build and by the walker kind's own numbers (the stress stand: assets/kit/creature.js). */
export function measuresOf(R) {
  const kind = R.from?.kind ?? 0, H = R.height ?? 1.74, b = R.body ?? {};
  const s = b.sex ?? 0.5, age = b.age ?? 32, build = b.build ?? 0.5;
  const r = (i) => hash3(kind, i, 3, 4242);   // the walker kind's numbers (the old kit's: legs 1, chest 3, head 9, stout 70, lean 6)
  const A = (k) => lerp(ADULTS[k][0], ADULTS[k][1], s) / 1000, st = A('stature'), sc = H / st;   // a survey's measure, at this height
  const F = (k) => lerp(FACE[k][0], FACE[k][1], s) / 1000;
  const headSc = Math.pow(sc, 0.35);   // heads grow less than bodies do with height
  // fat and muscle: the build, then the years
  const bf = build < 0.5 ? lerp(BUILD.fat[0], BUILD.fat[1], build * 2) : lerp(BUILD.fat[1], BUILD.fat[2], (build - 0.5) * 2);
  const bm = build < 0.5 ? lerp(BUILD.muscle[0], BUILD.muscle[1], build * 2) : lerp(BUILD.muscle[1], BUILD.muscle[2], (build - 0.5) * 2);
  const fat = bf * (1 + AGE.fat * Math.min(4, Math.max(0, (age - 25) / 10))) * lerp(1.25, 0.85, s);
  const muscle = bm * (1 - AGE.muscle * Math.max(0, (age - 35) / 10)) * lerp(0.82, 1.12, s) * (0.92 + 0.16 * r(70));
  const legK = 1 + 0.035 * (r(1) - 0.5), shK = 1 + 0.06 * (r(3) - 0.5), hipK = 1 + 0.06 * (r(5) - 0.5), headK = 1 + 0.05 * (r(9) - 0.5);
  const M = { H, s, age, build, fat, muscle, kind, r, headSc: headSc * headK };
  // heights (the share of the survey's stature, at this height; the legs a little longer or shorter by the kind)
  M.ankleY = 0.043 * H; M.kneeY = (A('kneeHeight') * sc - 0.012) * legK; M.hipY = (A('trochanterionHeight') * sc - 0.006) * legK;
  M.crotchY = A('crotchHeight') * sc * legK; M.waistY = lerp(M.hipY, A('waistHeight') * sc, 1) + (legK - 1) * 0.3;
  M.chestY = SEGMENTS.chest * H; M.axillaY = A('axillaHeight') * sc; M.acromionY = A('acromialHeight') * sc; M.c7Y = A('cervicaleHeight') * sc;
  // the head, from the top down (its size grows less than the body's)
  const hh = 0.13 * st * M.headSc;   // vertex to chin
  M.headH = hh; M.tragionY = H - A('tragionTop') * M.headSc; M.chinY = H - hh; M.eyeY = M.tragionY + 0.013 * M.headSc;
  M.headLen = A('headLength') * M.headSc; M.headBr = A('headBreadth') * M.headSc;
  // breadths
  M.shX = (A('biacromial') / 2) * sc * shK; M.deltX = (A('bideltoid') / 2) * sc * shK;
  M.hipBr = (A('hipBreadth') / 2) * sc * hipK; M.hipX = M.hipBr * 0.52; M.chestBr = (A('chestBreadth') / 2) * sc * shK; M.chestDp = (A('chestDepth') / 2) * sc;
  M.waistBr = (A('waistBreadth') / 2) * sc; M.waistDp = (A('waistDepth') / 2) * sc; M.buttDp = (A('buttockDepth') / 2) * sc;
  M.neckR = (A('neckCirc') / (2 * Math.PI)) * sc;
  M.thighR = (A('thighCirc') / (2 * Math.PI)) * sc; M.calfR = (A('calfCirc') / (2 * Math.PI)) * sc; M.ankleR = (A('ankleCirc') / (2 * Math.PI)) * sc;
  M.armR = (A('bicepsCirc') / (2 * Math.PI)) * sc * 0.93; M.foreR = (A('forearmCirc') / (2 * Math.PI)) * sc * 0.95; M.wristR = (A('wristCirc') / (2 * Math.PI)) * sc;
  M.upperArm = A('upperArm') * sc; M.foreArm = A('foreArm') * sc; M.handL = A('handLength') * sc; M.handB = A('handBreadth') * sc;
  M.footL = A('footLength') * sc; M.footB = A('footBreadth') * sc;
  // the face (Farkas), at the head's scale
  M.ipd = F('interpupillary') * M.headSc; M.fissure = ((F('biocular') - F('intercanthal')) / 2) * M.headSc; M.fissureH = F('fissureHeight') * M.headSc;
  M.noseW = F('noseWidth') * M.headSc; M.noseH = F('noseHeight') * M.headSc; M.noseTip = F('noseTip') * M.headSc;
  M.mouthW = F('mouthWidth') * M.headSc; M.upperLip = F('upperLip') * M.headSc; M.lowerFace = F('lowerFace') * M.headSc;
  M.faceW = F('faceWidth') * M.headSc; M.jawW = F('jawWidth') * M.headSc; M.earL = (F('earLength') + (AGE.ear / 1000) * Math.max(0, (age - 20) / 10)) * M.headSc; M.earW = F('earWidth') * M.headSc;
  M.eyeR = FACE.eyeball / 2000; M.corneaR = FACE.cornea / 2000; M.corneaCurve = FACE.corneaCurve / 1000;
  // the years in the posture: the upper back rounds, the head comes forward
  M.kyphosis = (Math.max(0, (age - 40) / 10) * AGE.kyphosis * Math.PI) / 180;
  M.sag = AGE.sag * Math.max(0, (age - 40) / 10);
  M.lean = 0.05 * (r(6) - 0.4);
  return M;
}

// ── the skeleton ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The bones: { names, parent, at (neutral joint places), bind (the drawing pose's turns, as axis-angle per bone) }. */
export function skeletonOf(M) {
  const { H } = M, at = {}, parent = {};
  const bone = (n, p, pos) => { at[n] = pos; parent[n] = p; };
  // the trunk: the spine behind the belly and the chest, the neck forward of it
  bone('root', null, [0, 0, 0]);
  bone('hips', 'root', [0, M.hipY + 0.03, -0.01]);
  bone('spine1', 'hips', [0, M.waistY - 0.02, -0.04]);
  bone('spine2', 'spine1', [0, lerp(M.waistY, M.chestY, 0.55), -0.05]);
  bone('spine3', 'spine2', [0, M.chestY + 0.03, -0.055]);
  bone('neck1', 'spine3', [0, M.c7Y - 0.005, -0.045]);
  bone('neck2', 'neck1', [0, lerp(M.c7Y, M.tragionY, 0.55), -0.022]);
  bone('head', 'neck2', [0, M.tragionY - 0.03, -0.008]);
  const hs = M.headSc;
  bone('jaw', 'head', [0, M.tragionY - 0.006 * hs, 0.012 * hs]);
  for (const [s, sg] of SIDES) {
    const e = [sg * M.ipd / 2, M.eyeY, 0.07 * hs];
    bone('eye.' + s, 'head', e); bone('lidUp.' + s, 'head', e); bone('lidLo.' + s, 'head', e);
  }
  for (const [s, sg] of SIDES) {
    const sh = [sg * (M.shX - 0.024), M.acromionY - 0.035, -0.022], el = [sg * (M.shX - 0.004), M.acromionY - 0.035 - M.upperArm, -0.042], wr = [sg * (M.shX + 0.012), el[1] - M.foreArm, -0.012];
    bone('clavicle.' + s, 'spine3', [sg * 0.022, M.c7Y - 0.035, 0.045]);
    bone('upperArm.' + s, 'clavicle.' + s, sh);
    bone('upperArmTwist.' + s, 'upperArm.' + s, mix3(sh, el, 0.35));
    bone('foreArm.' + s, 'upperArm.' + s, el);
    bone('foreArmTwist.' + s, 'foreArm.' + s, mix3(el, wr, 0.6));
    bone('hand.' + s, 'foreArm.' + s, wr);
    // the hand hangs palm to the thigh, the thumb forward: its fingers down (-y), across it +z (to the thumb), its back out (sg x)
    const L = M.handL, Bw = M.handB, palm = L * HAND.palm;
    const knuckle = (k) => [wr[0] - sg * 0.002, wr[1] - palm * [1, 1, 0.985, 0.955, 0.92][k], wr[2] + Bw * [0, 0.36, 0.12, -0.12, -0.35][k]];
    for (let k = 1; k < 5; k++) {
      const f = FINGERS[k], len = L * HAND.fingers[f], ph = HAND.phalanges; let p = knuckle(k), par = 'hand.' + s;
      for (let j = 0; j < 3; j++) { const nm = `${f}${j + 1}.${s}`; bone(nm, par, p); par = nm; p = [p[0], p[1] - len * ph[j], p[2]]; }
      at[`${f}Tip.${s}`] = p;
    }
    // the thumb: from its root at the wrist's front, out along the hand and forward
    const t0 = [wr[0] - sg * 0.012, wr[1] - 0.022, wr[2] + Bw * 0.3], tl = L * HAND.fingers.thumb, tm = L * HAND.thumbMeta;
    const tdir = nrm3([-sg * 0.25, -0.75, 0.55]);
    let p = t0, par = 'hand.' + s; const tl3 = [tm, tl * 0.55, tl * 0.45];
    for (let j = 0; j < 3; j++) { const nm = `thumb${j + 1}.${s}`; bone(nm, par, p); par = nm; p = add3(p, mul3(tdir, tl3[j])); }
    at[`thumbTip.${s}`] = p;
    // the leg: the knee a little in from the hip, the ankle under it
    const hp = [sg * M.hipX, M.hipY, 0], kn = [sg * (M.hipX - 0.008), M.kneeY, 0.012], an = [sg * (M.hipX - 0.006), M.ankleY, -0.018];
    bone('thigh.' + s, 'hips', hp); bone('thighTwist.' + s, 'thigh.' + s, mix3(hp, kn, 0.3)); bone('shin.' + s, 'thigh.' + s, kn);
    bone('foot.' + s, 'shin.' + s, an);
    // the foot points a little out; its ball 0.72 of its length from the heel
    const out = sg * 0.12, fwd = [Math.sin(out), 0, Math.cos(out)], heel = -0.24 * M.footL;
    bone('toes.' + s, 'foot.' + s, [an[0] + fwd[0] * (heel + 0.73 * M.footL), 0.022, an[2] + fwd[2] * (heel + 0.73 * M.footL)]);
    at[`toeTip.${s}`] = [an[0] + fwd[0] * (heel + M.footL), 0.02, an[2] + fwd[2] * (heel + M.footL)];
    at[`heel.${s}`] = [an[0] + fwd[0] * heel, 0.03, an[2] + fwd[2] * heel];
  }
  const names = Object.keys(parent);
  // the drawing pose: turns (axis, angle) per bone, from the neutral pose
  const bind = {};
  for (const [s, sg] of SIDES) {
    bind['upperArm.' + s] = [[0, 0, 1], sg * 0.72];           // arms out, 41°
    bind['foreArm.' + s] = [[0, 0, 1], sg * 0.05];
    bind['thigh.' + s] = [[0, 0, 1], sg * 0.09];              // legs apart
    bind['thumb1.' + s] = [[0, 1, 0], -sg * 0.25];
    bind['index1.' + s] = [[1, 0, 0], 0.13]; bind['ring1.' + s] = [[1, 0, 0], -0.1]; bind['little1.' + s] = [[1, 0, 0], -0.2];   // fingers spread
  }
  bind.jaw = [[1, 0, 0], 0.07];                                 // the mouth a little open
  return { names, parent, at, bind };
}

// rotations as matrices (rows), and the bones' frames in each pose
const rotAA = (ax, a) => { const [x, y, z] = nrm3(ax), c = Math.cos(a), s = Math.sin(a), t = 1 - c; return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c]; };
const mm3 = (A, B) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
const mv3 = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const tr3 = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Each bone's place and turn in the drawing pose (world), and the map of a neutral point on it to the drawing pose. */
export function posed(S, turns = S.bind) {
  const W = {};
  for (const n of S.names) {
    const p = S.parent[n], rel = turns[n] ? rotAA(...turns[n]) : I3;
    if (!p) { W[n] = { R: rel, t: S.at[n] }; continue; }
    const P = W[p], off = sub3(S.at[n], S.at[p]);
    W[n] = { R: mm3(P.R, rel), t: add3(P.t, mv3(P.R, off)) };
  }
  // a neutral point x on bone n goes to W.R (x - at) + W.t
  const move = (n, x) => add3(W[n].t, mv3(W[n].R, sub3(x, S.at[n])));
  return { W, move };
}

// ── the anatomy ──────────────────────────────────────────────────────────────────────────────────────────────────────
// The solids of the body, each on its bone, set down in the neutral pose: { bone, s, k, part, body } (body: what is
// flesh, read for the skin's weights; cloth, hair and shoes are not). Carried to the drawing pose by place().
function anatomy(M, S) {
  const L = [], { H, fat, muscle } = M, at = S.at, hs = M.headSc;
  const put = (bone, s, k, part = PART.skin, extra = {}) => L.push({ bone, s, k, part, body: part === PART.skin || part === PART.nail || part === PART.lip, ...extra });

  const fz = (v) => v * Math.sqrt(fat);   // a fat-scaled length (fat as a volume: its thickness goes as its root)
  // the pelvis and the hips
  const hY = M.hipY, wY = M.waistY, bf = Math.sqrt(fat);
  put('hips', E([0, hY + 0.035, -0.012], [M.hipBr * 0.9, 0.1, M.buttDp * 0.82]), 0.06);
  put('hips', E([0, hY - 0.015, -0.012], [M.hipBr * 0.93, 0.07, M.buttDp * 0.78]), 0.05);
  put('hips', E([0, lerp(hY, wY, 0.55), 0.035], [M.hipBr * 0.72, 0.075, fz(0.075)]), 0.06);   // the lower belly
  for (const [s, sg] of SIDES) {
    put('hips', E([sg * M.hipBr * 0.42, hY - 0.03, -M.buttDp * 0.62], [0.078 * (0.9 + 0.2 * bf), 0.09, 0.062 * (0.85 + 0.25 * bf)], frame([1, 0, 0], [sg * 0.15, 1, -0.2])), 0.045);   // the buttock
    put('hips', E([sg * M.hipBr * 0.82, hY + 0.0, -0.01], [0.05 * bf, 0.07, 0.07]), 0.06);   // over the hip joint
  }
  // the belly and the waist
  put('spine1', E([0, wY, 0.002], [M.waistBr * 0.94, 0.1, M.waistDp * 0.92]), 0.07);
  put('spine1', E([0, wY - 0.01, 0.045], [M.waistBr * 0.72, 0.09, fz(0.055)]), 0.07);   // the belly's fat
  for (const [s, sg] of SIDES) put('spine1', E([sg * M.waistBr * 0.72, wY + 0.01, -0.012], [fz(0.045), 0.065, 0.07]), 0.05);   // the flanks
  // the chest and the ribs
  const cY = M.chestY;
  put('spine2', E([0, lerp(wY, cY, 0.55), -0.008], [M.chestBr * 0.93, 0.12, M.chestDp * 0.93]), 0.07);
  put('spine3', E([0, cY + 0.02, -0.018], [M.chestBr * 0.98, 0.15, M.chestDp * 0.97]), 0.06);
  put('spine3', E([0, M.axillaY + 0.03, -0.03], [M.chestBr * 0.92, 0.09, M.chestDp * 0.82]), 0.06);
  for (const [s, sg] of SIDES) {
    // the chest's muscle, and the breast (more of it the more female and the more fat)
    put('spine3', E([sg * 0.062, cY + 0.045, M.chestDp * 0.66], [0.07, 0.05, 0.03 * Math.sqrt(muscle)], frame([1, -0.15 * sg, 0], [0.1 * sg, 1, 0.15])), 0.04);
    const br = (1 - M.s) * (0.6 + 0.6 * bf);
    if (br > 0.05) put('spine3', E([sg * 0.085, cY - 0.005, M.chestDp * 0.68 + 0.012 * br], [0.062 * Math.sqrt(br), 0.06 * Math.sqrt(br), 0.05 * br], frame([1, 0, 0.25 * sg], [0, 1, -0.25])), 0.035);
    // the back: the broad muscles, the shoulder blades, the long muscles beside the spine
    put('spine2', E([sg * 0.095, cY - 0.04, -M.chestDp * 0.62], [0.06 * muscle, 0.13, 0.05], frame([1, 0, -0.3 * sg], [0, 1, 0])), 0.05);
    put('clavicle.' + s, E([sg * 0.085, M.axillaY + 0.045, -M.chestDp * 0.95], [0.055, 0.07, 0.016], frame([1, 0, -0.35 * sg], [0.25 * sg, 1, 0])), 0.035);
    put('spine2', rod([sg * 0.028, wY - 0.02, -M.waistDp * 0.95], [sg * 0.03, cY + 0.06, -M.chestDp * 1.0], 0.026, 0.02), 0.035);
    // the collarbone, the slope of the shoulder (the trapezius), the deltoid
    const cl0 = [sg * 0.022, M.c7Y - 0.04, 0.052], cl1 = [sg * (M.shX - 0.012), M.acromionY - 0.008, -0.005];
    put('clavicle.' + s, rod(cl0, cl1, 0.0105, 0.009), 0.012);
    put('spine3', rod([sg * 0.02, M.c7Y + 0.02, -0.055], [sg * (M.shX - 0.04), M.acromionY + 0.004, -0.03], 0.04, 0.018), 0.04);
    const sh = at['upperArm.' + s];
    put('upperArm.' + s, E([sg * (M.shX + 0.004), sh[1] - 0.03, -0.018], [0.045 * Math.sqrt(muscle), 0.072, 0.05], frame([1, 0, 0], [sg * 0.25, 1, 0])), 0.035);
  }
  // the neck: its column, the muscles from behind the ear to the breastbone, the larynx
  const n1 = at.neck1, hd = at.head;
  put('neck1', rod([0, M.c7Y - 0.035, -0.012], [0, lerp(M.c7Y, M.chinY, 0.6), -0.008], M.neckR * 1.02, M.neckR * 0.94), 0.04);
  put('neck2', rod([0, lerp(M.c7Y, M.chinY, 0.4), -0.01], [0, M.tragionY - 0.03 * hs, -0.012], M.neckR * 0.94, M.neckR * 0.9), 0.04);
  for (const [s, sg] of SIDES) put('neck2', rod([sg * 0.045 * hs, M.tragionY - 0.03 * hs, -0.018 * hs], [sg * 0.014, M.c7Y - 0.045, 0.052], 0.011, 0.009), 0.02);
  if (M.s > 0.3) put('neck1', E([0, M.chinY - 0.045, M.neckR * 0.85], [0.011, 0.014 * M.s, 0.009 * M.s]), 0.015);
  put('neck1', ball([0, M.c7Y - 0.03, 0.058], 0.012), 0.012, PART.skin, { op: 'sub' });   // the notch over the breastbone
  // the arms
  for (const [s, sg] of SIDES) {
    const sh = at['upperArm.' + s], el = at['foreArm.' + s], wr = at['hand.' + s], ua = 'upperArm.' + s, fa = 'foreArm.' + s;
    const ax = nrm3(sub3(el, sh)), fx = nrm3(sub3(wr, el)), along = (a, b, t) => mix3(a, b, t);
    put(ua, rod(sh, el, M.armR * 0.78, M.armR * 0.62), 0.03);
    put(ua, E(add3(along(sh, el, 0.56), [0, 0, 0.016]), [M.armR * 0.6 * muscle, M.upperArm * 0.26, M.armR * 0.62 * muscle], frame([1, 0, 0], ax)), 0.03);   // biceps
    put(ua, E(add3(along(sh, el, 0.42), [sg * 0.004, 0, -0.018]), [M.armR * 0.66 * muscle, M.upperArm * 0.3, M.armR * 0.62], frame([1, 0, 0], ax)), 0.03);   // triceps
    put(ua, E(add3(along(sh, el, 0.5), [sg * 0.004, 0, 0]), [fz(M.armR * 0.55), M.upperArm * 0.3, fz(M.armR * 0.55)], frame([1, 0, 0], ax)), 0.035);   // its fat
    put(fa, ball(add3(el, [0, 0.004, -0.024]), 0.014), 0.012);   // the point of the elbow
    put(ua, E(add3(el, [sg * 0.024, 0.006, -0.008]), [0.012, 0.02, 0.014]), 0.015);   // the outer bump of the elbow
    put(fa, rod(el, wr, M.foreR * 0.8, M.wristR * 0.95), 0.03);
    put(fa, E(add3(along(el, wr, 0.28), [-sg * 0.008, 0, 0.012]), [M.foreR * 0.62 * muscle, M.foreArm * 0.3, M.foreR * 0.58], frame([1, 0, 0], fx)), 0.03);   // flexors
    put(fa, E(add3(along(el, wr, 0.24), [sg * 0.012, 0, -0.006]), [M.foreR * 0.55 * muscle, M.foreArm * 0.28, M.foreR * 0.6], frame([1, 0, 0], fx)), 0.03);   // extensors
    put('foreArmTwist.' + s, E(add3(wr, [0, 0.012, 0]), [M.wristR * 0.75, 0.018, M.wristR * 1.12], frame([1, 0, 0], fx)), 0.02);   // the wrist, wider than deep
    put('foreArmTwist.' + s, ball(add3(wr, [sg * 0.008, 0.012, -0.016]), 0.006), 0.01);   // the knob of the ulna
    hand(M, S, s, sg, put);
  }
  // the legs
  for (const [s, sg] of SIDES) {
    const hp = at['thigh.' + s], kn = at['shin.' + s], an = at['foot.' + s], th = 'thigh.' + s, sn = 'shin.' + s;
    const ax = nrm3(sub3(kn, hp)), lx = nrm3(sub3(an, kn)), along = (a, b, t) => mix3(a, b, t);
    put(th, rod(add3(hp, [-sg * 0.01, 0.03, 0]), kn, M.thighR * 0.78, M.thighR * 0.5), 0.05);
    put(th, E(add3(along(hp, kn, 0.42), [0, 0, 0.03]), [M.thighR * 0.52 * muscle, 0.15, M.thighR * 0.48 * muscle], frame([1, 0, 0], ax)), 0.04);   // front of the thigh
    put(th, E(add3(along(hp, kn, 0.4), [sg * 0.03, 0, -0.005]), [M.thighR * 0.42 * muscle, 0.16, M.thighR * 0.55], frame([1, 0, 0], ax)), 0.04);   // its outer side
    put(th, E(add3(along(hp, kn, 0.78), [-sg * 0.02, 0, 0.015]), [0.035 * muscle, 0.06, 0.035], frame([1, 0, 0], ax)), 0.03);   // the inner bulge over the knee
    put(th, E(add3(along(hp, kn, 0.45), [0, 0, -0.03]), [M.thighR * 0.5, 0.15, M.thighR * 0.45], frame([1, 0, 0], ax)), 0.04);   // the back of the thigh
    put(th, E(add3(along(hp, kn, 0.25), [-sg * 0.035, 0, 0]), [M.thighR * 0.45, 0.12, M.thighR * 0.55], frame([1, 0, 0], ax)), 0.045);   // the inner thigh
    put(th, E(add3(along(hp, kn, 0.3), [sg * 0.03, 0, -0.01]), [fz(M.thighR * 0.4) * (1.3 - 0.6 * M.s), 0.13, fz(M.thighR * 0.4)], frame([1, 0, 0], ax)), 0.05);   // its fat (more on a woman's hips)
    put(sn, E(add3(kn, [0, 0.008, 0.045]), [0.024, 0.028, 0.012]), 0.015);   // the kneecap
    for (const sd of [-1, 1]) put(sn, E(add3(kn, [sd * 0.034, 0.01, 0.008]), [0.022, 0.03, 0.035]), 0.02);   // the knee's sides
    put(sn, rod(kn, an, M.calfR * 0.62, M.ankleR * 0.82), 0.03);
    put(sn, E(add3(along(kn, an, 0.3), [-sg * 0.012, 0, -0.035]), [M.calfR * 0.48 * muscle, 0.1, M.calfR * 0.5 * muscle], frame([1, 0, 0], lx)), 0.03);   // the calf, its inner head lower
    put(sn, E(add3(along(kn, an, 0.24), [sg * 0.014, 0, -0.03]), [M.calfR * 0.42 * muscle, 0.085, M.calfR * 0.45 * muscle], frame([1, 0, 0], lx)), 0.03);
    put(sn, E(add3(along(kn, an, 0.3), [sg * 0.016, 0, 0.025]), [0.022, 0.12, 0.022], frame([1, 0, 0], lx)), 0.03);   // the shin's muscle
    put(sn, rod(add3(along(kn, an, 0.55), [0, 0, -0.035]), add3(an, [0, -0.01, -0.045]), 0.012, 0.009), 0.02);   // the heel's tendon
    for (const sd of [-1, 1]) put(sn, ball(add3(an, [sd * 0.028, sd === -sg ? 0.004 : -0.006, sd === -sg ? 0.004 : -0.006]), 0.012), 0.012);   // the ankle bones
    foot(M, S, s, sg, put);
  }
  head(M, S, put);
  return L;
}

/** The hand: palm, knuckles, five fingers of three bones each, their pads and nails. */
function hand(M, S, s, sg, put) {
  const at = S.at, wr = at['hand.' + s], Bw = M.handB, out = sg;   // the back of the hand faces out (sg x)
  const hb = 'hand.' + s, palmL = M.handL * HAND.palm, th = 0.026 * (M.handB / 0.089);
  // the palm: a rounded slab, thicker at its heel; the ball of the thumb; the knuckles
  put(hb, box(add3(wr, [0, -palmL * 0.52, Bw * 0.03]), [th * 0.42, palmL * 0.44, Bw * 0.4], 0.012), 0.02);
  put(hb, E(add3(wr, [-out * 0.006, -palmL * 0.3, Bw * 0.24]), [0.016, 0.03, 0.022]), 0.02);   // the ball of the thumb
  put(hb, E(add3(wr, [-out * 0.004, -palmL * 0.42, -Bw * 0.3]), [0.013, 0.035, 0.016]), 0.02);   // the edge of the palm
  for (let k = 1; k < 5; k++) {
    const f = FINGERS[k], j1 = at[`${f}1.${s}`];
    put(hb, ball(add3(j1, [out * 0.006, 0.003, 0]), 0.0085 * (M.handB / 0.089)), 0.012);   // the knuckle
  }
  for (const f of FINGERS) {
    const w = Bw * HAND.width[f] * 0.5, ps = [1, 2, 3].map((j) => at[`${f}${j}.${s}`]).concat([at[`${f}Tip.${s}`]]);
    for (let j = 0; j < 3; j++) {
      const r0 = w * [1, 0.86, 0.78][j], r1 = w * [0.86, 0.78, 0.66][j], b = `${f}${j + 1}.${s}`;
      put(b, rod(ps[j], ps[j + 1], r0, r1), 0.006);
      if (j < 2) put(b, ball(add3(ps[j + 1], [out * r1 * 0.12, 0, 0]), r1 * 1.03), 0.004);   // the joint
    }
    // the pad of the fingertip, and the nail on its back
    const tip = ps[3], d3 = ps[2], ax = nrm3(sub3(tip, d3)), b3 = `${f}3.${s}`;
    const backOf = f === 'thumb' ? nrm3([out * 0.6, 0.0, 0.8]) : [out, 0, 0];
    put(b3, E(add3(mix3(d3, tip, 0.6), mul3(backOf, -w * 0.25)), [w * 0.82, len3(sub3(tip, d3)) * 0.42, w * 0.78], frame(cross3(ax, backOf), ax)), 0.004);
    const nailC = add3(mix3(d3, tip, 0.62), mul3(backOf, w * 0.7));
    put(b3, box(nailC, [w * 0.62, len3(sub3(tip, d3)) * 0.34, 0.0007], 0.0012, frame(cross3(ax, backOf), ax)), 0.0015, PART.nail);
  }
}

/** The foot inside the shoe: heel, arch, ball, toes. */
function foot(M, S, s, sg, put) {
  const at = S.at, an = at['foot.' + s], heel = at[`heel.${s}`], ball0 = at['toes.' + s], tip = at[`toeTip.${s}`], fb = M.footB / 2;
  const f = 'foot.' + s, t = 'toes.' + s, fwd = nrm3([tip[0] - heel[0], 0, tip[2] - heel[2]]), side = [fwd[2] * sg, 0, -fwd[0] * sg];   // side: outwards
  put(f, E([heel[0], 0.035, heel[2] + 0.012], [fb * 0.62, 0.035, 0.04]), 0.02);   // the heel
  put(f, rod([an[0], an[1] - 0.012, an[2]], [ball0[0], 0.028, ball0[2]], 0.032, 0.024), 0.025);
  put(f, E(add3(mix3(heel, ball0, 0.55), add3([0, 0.015, 0], mul3(side, fb * 0.25))), [fb * 0.65, 0.022, M.footL * 0.28], frame(side, [0, 1, 0])), 0.02);   // the outer arch
  put(f, E([ball0[0], 0.022, ball0[2] - 0.005], [fb * 0.95, 0.02, 0.028], frame(side, [0, 1, 0])), 0.02);   // the ball of the foot
  for (let k = 0; k < 5; k++) {
    const o = mul3(side, fb * (-0.62 + k * 0.33)), len = M.footL * [0.2, 0.17, 0.155, 0.14, 0.12][k], r = [0.012, 0.0085, 0.008, 0.0075, 0.007][k];
    const a = add3([ball0[0], 0.018, ball0[2]], add3(o, mul3(fwd, -0.005))), b = add3(add3(a, mul3(fwd, len)), [0, -0.004, 0]);
    put(t, rod(a, b, r, r * 0.85), 0.006);
  }
}

/** The head: the skull, the face over it (brow, cheekbones, nose, lips, chin, jaw), the eyes in their sockets with
 *  their lids, the mouth that opens, the ears; hair over the crown. Measures from Farkas (FACE). */
function head(M, S, put) {
  const hs = M.headSc, at = S.at, T = M.tragionY;
  const P = (x, y, z) => [x * hs, T + y * hs, z * hs];   // a point of the head, from the ear canals' middle (metres at the mean head's scale)
  const h = 'head', j = 'jaw', fat = Math.sqrt(M.fat), sag = M.sag, male = M.s;
  const W = M.faceW / 0.137, Jw = M.jawW / 0.104;   // the face's width and the jaw's, as shares of the mean man's
  // the skull: the vault, the forehead, the back of the head, the temples
  put(h, egg(P(0, 0.048, -0.008), [M.headBr / 2 * 0.98 / hs, 0.095, M.headLen / 2 * 0.98 / hs].map((v) => v * hs)), 0.03);
  put(h, egg(P(0, 0.06, 0.035), [0.064, 0.07, 0.065].map((v) => v * hs)), 0.03);
  put(h, egg(P(0, 0.012, -0.045), [0.062, 0.06, 0.055].map((v) => v * hs)), 0.03);
  // the brow ridge (stronger in a man), the cheekbones and their arches, the upper jaw under the nose
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    put(h, rod(P(sg * 0.006, 0.03, 0.094), P(sg * 0.05, 0.03, 0.078), 0.0095 + 0.003 * male, 0.008), 0.02);
    put(h, egg(P(sg * 0.054 * W, -0.004, 0.058), [0.022, 0.016, 0.02].map((v) => v * hs), frame([1, 0, -0.3 * sg], [0, 1, 0])), 0.025);
    put(h, rod(P(sg * 0.06 * W, -0.002, 0.045), P(sg * 0.066, 0.002, 0.0), 0.009 * hs, 0.008 * hs), 0.02);
    put(h, egg(P(sg * 0.038, -0.03 - 0.01 * sag, 0.064), [0.024, 0.024, 0.02].map((v) => v * hs * (0.85 + 0.25 * fat))), 0.03);   // the cheek's fat
  }
  put(h, egg(P(0, -0.024, 0.066), [0.034, 0.03, 0.03].map((v) => v * hs)), 0.03);   // the upper jaw's front
  // the jaw: its angles, its body to the chin, the chin (on the jaw's bone, so the mouth opens)
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    const go = P(sg * 0.05 * Jw, -0.062, -0.006), ch = P(sg * 0.013, -0.094, 0.074), cd = P(sg * 0.058, -0.008, -0.004);
    put(j, rod(go, ch, (0.012 + 0.004 * male) * hs, 0.013 * hs), 0.025);
    put(j, rod(cd, go, 0.011 * hs, (0.013 + 0.003 * male) * hs), 0.025);
    put(j, egg(mix3(go, ch, 0.35 + 0.0), [0.018, 0.02, 0.022].map((v) => v * hs * (0.8 + 0.3 * fat))), 0.03);   // the jowl
  }
  put(j, egg(P(0, -0.088, 0.08), [0.019, 0.016, 0.013].map((v) => v * hs)), 0.02);   // the chin
  put(j, egg(P(0, -0.07, 0.072), [0.024, 0.016, 0.014].map((v) => v * hs)), 0.025);
  // the mouth: the lips (the upper on the head, the lower on the jaw), the opening between them, the inside, the teeth
  const mw = M.mouthW / hs / 2, sto = -0.052;
  put(h, egg(P(0, sto + 0.009, 0.084), [mw * 0.92, 0.0085, 0.0085].map((v) => v * hs), frame([1, 0, 0], [0, 1, -0.25])), 0.01, PART.lip);
  for (const sg of [1, -1]) put(h, egg(P(sg * 0.0055, sto + 0.0115, 0.0865), [0.0085, 0.006, 0.006].map((v) => v * hs)), 0.006, PART.lip);   // the bow of the upper lip
  put(j, egg(P(0, sto - 0.009, 0.0815), [mw * 0.86, 0.0085, 0.0095].map((v) => v * hs), frame([1, 0, 0], [0, 1, 0.3])), 0.01, PART.lip);
  put(h, egg(P(0, sto + 0.004, 0.072), [mw * 1.15, 0.024, 0.018].map((v) => v * hs)), 0.02);   // round the mouth, over the teeth
  for (const sg of [1, -1]) put(h, rod(P(sg * 0.0045, -0.03, 0.088), P(sg * 0.0055, sto + 0.012, 0.089), 0.0022 * hs, 0.0026 * hs), 0.006);   // the ridges under the nose
  put(h, box(P(0, sto, 0.08), [mw * 0.98, 0.0012, 0.02].map((v) => v * hs), 0.0004, frame([1, 0, 0], [0, 1, 0])), 0.004, PART.mouth, { op: 'sub' });   // the opening
  put(h, egg(P(0, sto - 0.004, 0.058), [0.026, 0.017, 0.03].map((v) => v * hs)), 0.008, PART.mouth, { op: 'sub' });   // the inside
  put(h, egg(P(0, sto + 0.006, 0.068), [0.021, 0.006, 0.012].map((v) => v * hs), frame([1, 0, 0], [0, 1, 0])), 0.003, PART.teeth);
  put(j, egg(P(0, sto - 0.008, 0.066), [0.019, 0.0055, 0.011].map((v) => v * hs)), 0.003, PART.teeth);
  put(j, egg(P(0, sto - 0.012, 0.05), [0.017, 0.006, 0.022].map((v) => v * hs)), 0.006, PART.tongue);
  // the nose: its bridge, its sides, its tip, the wings and the nostrils
  const nt = M.noseTip / hs, nw = M.noseW / hs / 2;
  put(h, rod(P(0, 0.024, 0.091), P(0, -0.012, 0.093 + nt * 0.55), 0.0055 * hs, 0.0075 * hs), 0.012);
  for (const sg of [1, -1]) put(h, egg(P(sg * 0.009, 0.0, 0.086), [0.008, 0.022, 0.012].map((v) => v * hs), frame([1, 0, 0.3 * sg], [0, 1, 0.35])), 0.012);
  put(h, ball(P(0, -0.017, 0.086 + nt), 0.0098 * hs), 0.009);
  for (const sg of [1, -1]) {
    put(h, egg(P(sg * nw * 0.72, -0.025, 0.088), [0.0075, 0.0065, 0.009].map((v) => v * hs), frame([1, 0, 0.4 * sg], [0, 1, 0])), 0.007);
    put(h, egg(P(sg * 0.0068, -0.0285, 0.093), [0.0034, 0.0026, 0.0055].map((v) => v * hs), frame([1, 0, 0], [0, 1, -0.6])), 0.003, PART.skin, { op: 'sub' });
  }
  put(h, rod(P(0, -0.02, 0.094 + nt * 0.6), P(0, -0.029, 0.088), 0.0042 * hs, 0.0035 * hs), 0.004);   // the columella
  // the eyes: the socket, the lids as shells round the ball with the opening between them, the brow's soft part over it
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    const e = at['eye.' + s], R = M.eyeR;
    put(h, egg(add3(e, [sg * 0.004, 0.02 * hs, 0.012 * hs]), [0.024, 0.009, 0.012].map((v) => v * hs)), 0.012);   // the brow's soft part
    put(h, egg(add3(e, [sg * 0.003, -0.016 * hs, 0.008 * hs]), [0.02, 0.009, 0.011].map((v) => v * hs * (0.9 + 0.2 * fat))), 0.012);   // under the eye
    put(h, ball(add3(e, [0, 0.002, 0.004]), R + 0.0042), 0.004, PART.skin, { op: 'sub' });   // room for the ball and its lids
    put('lidUp.' + s, lid(e, R, sg, M, 1), 0.0035);
    put('lidLo.' + s, lid(e, R, sg, M, -1), 0.0035);
    put(h, ball(e, R + 0.0004), 0.0015, PART.skin, { op: 'sub' });   // the ball's own room
  }
  // the hair: a shell over the crown, thinning to nothing at its line
  put(h, hairShell(M, P), 0.006, PART.hair, { body: false });
  // the ears (in the head's field below the finest level; the finest draws them on their own: ears())
  for (const [s, sg] of [['L', 1], ['R', -1]]) put(h, earOf(M, sg, P), 0.004, PART.skin, { ear: s });
}

/** An eyelid: a shell round the eyeball, the opening between the lids cut out of it (an almond: Farkas' fissure). */
function lid(e, R, sg, M, up) {
  const t = 0.0026, gap = 0.0006, hs = M.headSc;
  const outer = ball(e, R + gap + t), inner = ball(e, R + gap);
  // the opening: its half-height at the middle, its ends at the corners; the outer corner a little higher (the tilt)
  const half = M.fissureH / 2, len = M.fissure / 2;
  const open = group([
    { op: 'add', k: 0, s: egg(add3(e, [sg * 0.0015, up > 0 ? 0.0012 : 0.0006, R]), [len * 1.02, half * (up > 0 ? 1.05 : 0.95), R * 1.4], frame([1, 0.05 * sg, 0], [0, 1, 0])) },
  ]);
  // only the upper or the lower half of the shell, and only its front
  const halfPlane = plane([0, up > 0 ? -1 : 1, 0], add3(e, [0, 0.0005, 0]));
  const front = plane([0, 0, -1], add3(e, [0, 0, -R * 0.15]));
  return group([
    { op: 'add', k: 0, s: outer },
    { op: 'sub', k: 0.0006, s: inner },
    { op: 'sub', k: 0.0012, s: open },
    { op: 'and', k: 0.002, s: halfPlane },
    { op: 'and', k: 0.004, s: front },
  ], add3(e, [-R - 0.006, -R - 0.006, -R]), add3(e, [R + 0.006, R + 0.006, R + 0.006]));
}

/** The hair as a shell over the skull (until it is grown as strands: round 3 of intent 0033). */
function hairShell(M, P) {
  const hs = M.headSc;
  const crown = egg(P(0, 0.05, -0.008), [M.headBr / 2 * 1.02 + 0.016 * hs, 0.104 * hs, M.headLen / 2 * 1.0 + 0.018 * hs]);
  const face = egg(P(0, -0.045, 0.07), [0.08, 0.135, 0.11].map((v) => v * hs), frame([1, 0, 0], [0, 1, -0.35]));   // where no hair grows: the face and down
  const nape = plane([0, -1, -0.25], P(0, -0.045, -0.06));
  const ears = [1, -1].map((sg) => ball(P(sg * 0.072, -0.004, -0.008), 0.026 * hs));
  return group([
    { op: 'add', k: 0, s: crown },
    { op: 'sub', k: 0.012, s: face },
    { op: 'and', k: 0.012, s: nape },
    { op: 'sub', k: 0.008, s: ears[0] }, { op: 'sub', k: 0.008, s: ears[1] },
  ]);
}

/** An ear: the rim (helix), the ridge inside it (antihelix), the bowl (concha), the flap before the canal (tragus), the
 *  lobe; set out from the side of the head and tilted back. */
function earOf(M, sg, P) {
  const hs = M.headSc, L = M.earL / hs, Wd = M.earW / hs;
  // the ear's own frame: x out from the head, y up the ear (tilted back 18°), z forward
  const tilt = 0.32, up = [0, Math.cos(tilt), -Math.sin(tilt)], out = [sg, 0, 0], fwd = cross3(out, up).map((v) => v * sg);
  const c = P(sg * 0.07, -0.002 + L * 0.06, -0.016), at = (x, y, z) => add3(c, add3(mul3(out, x * hs), add3(mul3(up, y * hs), mul3(fwd, z * hs))));
  const R = frame(out, up);
  const ops = [
    { op: 'add', k: 0, s: egg(at(0.006, 0.0, -0.002), [0.006, L * 0.48, Wd * 0.45].map((v) => v * hs), R) },   // the body of the ear
    { op: 'add', k: 0.004, s: egg(at(0.002, -L * 0.36, 0.001), [0.006, L * 0.16, Wd * 0.3].map((v) => v * hs), R) },   // the lobe
    { op: 'add', k: 0.003, s: rod(at(0.008, L * 0.22, Wd * 0.3), at(0.011, L * 0.44, -Wd * 0.05), 0.0035 * hs, 0.004 * hs) },   // the rim, over the top
    { op: 'add', k: 0.003, s: rod(at(0.011, L * 0.44, -Wd * 0.05), at(0.012, L * 0.1, -Wd * 0.46), 0.004 * hs, 0.0042 * hs) },
    { op: 'add', k: 0.003, s: rod(at(0.012, L * 0.1, -Wd * 0.46), at(0.009, -L * 0.22, -Wd * 0.3), 0.0042 * hs, 0.0038 * hs) },
    { op: 'add', k: 0.003, s: rod(at(0.008, L * 0.22, Wd * 0.3), at(0.004, L * 0.05, Wd * 0.38), 0.0034 * hs, 0.003 * hs) },
    { op: 'sub', k: 0.004, s: egg(at(0.016, -L * 0.02, Wd * 0.05), [0.009, L * 0.17, Wd * 0.22].map((v) => v * hs), R) },   // the bowl
    { op: 'add', k: 0.003, s: rod(at(0.01, L * 0.25, Wd * 0.05), at(0.011, -L * 0.12, -Wd * 0.25), 0.0028 * hs, 0.003 * hs) },   // the inner ridge
    { op: 'add', k: 0.003, s: egg(at(0.006, -L * 0.1, Wd * 0.42), [0.004, 0.006, 0.004].map((v) => v * hs), R) },   // the tragus
    { op: 'add', k: 0.01, s: egg(at(-0.006, 0.0, 0.0), [0.008, L * 0.3, Wd * 0.3].map((v) => v * hs), R) },   // its root in the head
  ];
  return group(ops);
}

// ── the clothes, as shells over the body (until round 3 of intent 0033 makes them garments of their own) ───────────
function clothes(M, S, wears) {
  const L = [], at = S.at, { H } = M;
  const put = (bone, s, k, part, extra = {}) => L.push({ bone, s, k, part, body: false, ...extra });
  const ease = 0.012 + 0.006 * Math.sqrt(M.fat), wY = M.waistY, beltY = wY - 0.005;
  // the shirt: over the chest and the belly, hanging straight from the chest, its collar open; its sleeves to below the
  // elbow, rolled. It is tucked in under the belt.
  if (wears.shirt) {
    const shirt = [];
    const sc = (bone, s, k) => shirt.push({ bone, s, k });
    sc('spine3', egg([0, M.chestY + 0.02, -0.016], [M.chestBr * 1.0 + ease, 0.17, M.chestDp * 1.0 + ease]), 0);
    sc('spine2', egg([0, lerp(wY, M.chestY, 0.45), -0.006], [Math.max(M.chestBr, M.waistBr) * 1.0 + ease, 0.16, Math.max(M.chestDp, M.waistDp * 1.05) + ease]), 0.06);
    sc('spine1', egg([0, wY + 0.02, 0.006], [M.waistBr * 1.02 + ease, 0.08, M.waistDp * 1.04 + ease * 1.2]), 0.06);
    sc('spine3', egg([0, M.axillaY + 0.04, -0.03], [M.chestBr * 0.98 + ease, 0.1, M.chestDp * 0.88 + ease]), 0.06);
    for (const [s, sg] of SIDES) {
      const sh = at['upperArm.' + s], el = at['foreArm.' + s], wr = at['hand.' + s], cuff = mix3(el, wr, 0.3);
      sc('spine3', rod([sg * 0.025, M.c7Y + 0.01, -0.045], [sg * (M.shX - 0.03), M.acromionY + 0.008, -0.03], 0.045, 0.024 + ease), 0.04);
      sc('upperArm.' + s, rod(add3(sh, [sg * 0.006, 0.01, 0.0]), el, M.armR * 0.95 + ease + 0.008, M.armR * 0.75 + ease + 0.006), 0.04);
      sc('foreArm.' + s, rod(el, cuff, M.armR * 0.75 + ease + 0.004, M.foreR * 0.82 + ease), 0.02);
      sc('foreArm.' + s, ring(cuff, M.foreR * 0.8 + ease * 0.6, 0.009, frame([1, 0, 0], nrm3(sub3(wr, el)))), 0.008);   // the rolled cuff
    }
    // what the shirt leaves open: the neck, and down the front in a V; below the belt it is tucked away
    const vee = group([{ op: 'add', k: 0, s: egg([0, M.c7Y + 0.01, 0.03], [0.07, 0.11, 0.11]) }]);
    // the collar: a band round the neck's root standing up at the back, open at the front, its points on the chest
    const collar = group([
      { op: 'add', k: 0, s: ring([0, M.c7Y + 0.0, -0.006], M.neckR + 0.012, 0.007, frame([1, 0, 0], [0, 1, -0.45])) },
      { op: 'sub', k: 0.004, s: egg([0, M.c7Y - 0.02, 0.08], [0.035, 0.06, 0.06]) },
    ]);
    // one shirt (each piece on its own bone, so it moves as the body under it): placed as the body's solids are
    for (const o of shirt) put(o.bone, group([{ op: 'add', k: 0, s: o.s }, { op: 'sub', k: 0.006, s: vee }, { op: 'and', k: 0.004, s: plane([0, -1, 0], [0, beltY, 0]) }]), Math.max(0.03, o.k), PART.shirt);
    put('spine3', collar, 0.006, PART.shirt);
  }
  // the trousers: from the waist over the hips and the seat, down each leg, straight from the knee, a turned hem
  if (wears.trousers) {
    const hem = 0.085;
    put('hips', egg([0, M.hipY + 0.02, -0.012], [M.hipBr * 0.97 + ease, 0.14, M.buttDp * 0.95 + ease]), 0.05, PART.trousers);
    put('spine1', group([{ op: 'add', k: 0, s: egg([0, wY - 0.01, 0.004], [M.waistBr * 1.0 + ease * 1.2, 0.07, M.waistDp * 1.0 + ease * 1.3]) }, { op: 'and', k: 0.004, s: plane([0, 1, 0], [0, beltY + 0.01, 0]) }]), 0.04, PART.trousers);
    for (const [s, sg] of SIDES) {
      const hp = at['thigh.' + s], kn = at['shin.' + s], an = at['foot.' + s], bottom = [an[0], hem, an[2] - 0.004];
      put('thigh.' + s, rod(add3(hp, [-sg * 0.012, 0.02, -0.01]), kn, M.thighR * 1.0 + ease, M.calfR * 0.98 + ease + 0.01), 0.05, PART.trousers);
      put('shin.' + s, rod(kn, bottom, M.calfR * 0.98 + ease + 0.01, M.calfR * 0.9 + ease + 0.006), 0.03, PART.trousers);
      put('shin.' + s, ring(add3(bottom, [0, 0.014, 0]), M.calfR * 0.9 + ease + 0.002, 0.0065, frame([1, 0, 0], [0, 1, 0])), 0.006, PART.trousers);   // the turned hem
    }
  }
  // the belt: a band round the waist, its buckle in front
  if (wears.belt) {
    put('spine1', group([{ op: 'add', k: 0, s: egg([0, beltY + 0.016, 0.004], [M.waistBr + ease * 1.25 + 0.005, 0.2, M.waistDp + ease * 1.35 + 0.005]) },
      { op: 'and', k: 0.003, s: plane([0, 1, 0], [0, beltY + 0.034, 0]) }, { op: 'and', k: 0.003, s: plane([0, -1, 0], [0, beltY, 0]) }]), 0.003, PART.belt);
    put('spine1', box([0, beltY + 0.016, M.waistDp + ease * 1.3 + 0.006], [0.025, 0.02, 0.004], 0.002), 0.003, PART.belt);
  }
  // the shoes: round the foot, a little room at the toes, the sole under it and a low heel
  if (wears.shoes) {
    for (const [s, sg] of SIDES) {
      const heel = at[`heel.${s}`], b0 = at['toes.' + s], tip = at[`toeTip.${s}`], an = at['foot.' + s], fb = M.footB / 2;
      const fwd = nrm3([tip[0] - heel[0], 0, tip[2] - heel[2]]), side = [fwd[2] * sg, 0, -fwd[0] * sg], Rf = frame(side, [0, 1, 0]);
      const mid = mix3(heel, tip, 0.5), toe = add3(tip, mul3(fwd, 0.012));
      const upper = group([
        { op: 'add', k: 0, s: egg([heel[0] + fwd[0] * 0.02, 0.05, heel[2] + fwd[2] * 0.02], [fb * 0.78, 0.05, 0.055], Rf) },
        { op: 'add', k: 0.03, s: rod([an[0], 0.06, an[2]], [b0[0], 0.035, b0[2]], 0.04, 0.034) },
        { op: 'add', k: 0.03, s: egg([b0[0], 0.032, b0[2]], [fb * 1.08, 0.032, 0.05], Rf) },
        { op: 'add', k: 0.03, s: egg(add3(toe, mul3(fwd, -0.035)), [fb * 0.9, 0.026, 0.045], Rf) },
        { op: 'and', k: 0.006, s: plane(nrm3([0, 1, -0.28]), [an[0], 0.085, an[2]]) },   // its opening round the ankle
      ]);
      put('foot.' + s, upper, 0.004, PART.shoe);
      const sole = group([
        { op: 'add', k: 0, s: box([mid[0], 0.009, mid[2]], [fb * 1.0, 0.009, (M.footL + 0.03) / 2], 0.006, Rf) },
        { op: 'add', k: 0.002, s: box([heel[0] + fwd[0] * 0.03, 0.016, heel[2] + fwd[2] * 0.03], [fb * 0.85, 0.016, 0.04], 0.005, Rf) },
      ]);
      put('foot.' + s, sole, 0.003, PART.sole);
    }
  }
  return L;
}

// ── the drawing pose, and the field ──────────────────────────────────────────────────────────────────────────────────
/** A solid moved from the neutral pose by a turn R (rows, world) about the bone's joint and on to the bone's place. */
function moved(s, move, R) {
  const mvp = (p) => move(p), mvR = (Rs) => mm3(Rs, tr3(R));
  switch (s.t) {
    case 0: return ball(mvp(s.c), s.r);
    case 1: return egg(mvp(s.c), s.r, mvR(s.R));
    case 2: return rod(mvp(s.a), mvp(s.b), s.ra, s.rb);
    case 3: return box(mvp(s.c), s.h, s.rr, mvR(s.R));
    case 4: return ring(mvp(s.c), s.R0, s.r, mvR(s.R));
    case 5: { const n = mv3(R, s.n), p = mvp(mul3(s.n, -s.d)); return plane(n, p); }
    case 6: return group(s.ops.map((o) => ({ ...o, s: moved(o.s, move, R) })));
  }
  return s;
}

/** The field of the body in the drawing pose (or, with turns, in another pose), each op with its bone. */
export function fieldOfBody(M, S, wears, { ears = true, turns } = {}) {
  const P = posed(S, turns);
  const list = [...anatomy(M, S), ...clothes(M, S, wears)].filter((o) => ears || !o.ear);
  const ops = list.map((o) => ({ ...o, op: o.op ?? 'add', s: moved(o.s, (p) => P.move(o.bone, p), P.W[o.bone].R) }));
  // what is cut out (the mouth, the nostrils, the eyes' room) is cut after what it is cut from: subtractions last but
  // before the shells that sit over the skin (clothes, hair) and the lids
  const isShell = (o) => o.part === PART.hair || (o.part >= PART.shirt && o.part <= PART.sole) || o.bone.startsWith('lid') || o.part === PART.teeth || o.part === PART.tongue;
  const order = [...ops.filter((o) => o.op === 'add' && !isShell(o)), ...ops.filter((o) => o.op !== 'add' && o.s.r !== M.eyeR + 0.0004), ...ops.filter((o) => isShell(o)), ...ops.filter((o) => o.op !== 'add' && o.s.r === M.eyeR + 0.0004)];
  return { field: fieldOf(order), P };
}

// ── the eyes: a ball with its cornea, made as rings (not drawn out of the field: they are too round for it) ────────────
/** An eyeball at e (looking +z): the white of the ball, and in front the clearer, more curved cornea that bulges out of
 *  it over the iris (FACE: 24 mm across, the cornea 11.7 mm across on a curve of 7.8 mm). */
function eyeball(M, e, nu, nv) {
  const R = M.eyeR, rc = M.corneaCurve, lim = M.corneaR, zl = Math.sqrt(R * R - lim * lim), zc = zl - Math.sqrt(rc * rc - lim * lim), thc = Math.asin(lim / R);
  const pos = [], nor = [], tri = [];
  for (let j = 0; j <= nv; j++) {
    // rings from the front (j = 0) to the back, denser over the cornea
    const t = j / nv, th = t < 0.35 ? (t / 0.35) * thc * 1.15 : thc * 1.15 + ((t - 0.35) / 0.65) * (Math.PI - thc * 1.15);
    for (let i = 0; i <= nu; i++) {
      const ph = (i / nu) * 2 * Math.PI, d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      let r = R, n = d;
      if (th < thc) { const ct = Math.cos(th); r = zc * ct + Math.sqrt(zc * zc * ct * ct - zc * zc + rc * rc); const p = mul3(d, r); n = nrm3(sub3(p, [0, 0, zc])); }
      pos.push(...add3(e, mul3(d, r))); nor.push(...n);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1; tri.push(a, d, c, a, c, b); }
  return { pos, nor, tri };
}

// ── the regions each level is drawn from ─────────────────────────────────────────────────────────────────────────────
// A level is drawn out of the field region by region, each at its own fineness, and the regions joined where a cut
// parted them: the face finest (where the eye looks first), the hands next, the rest of the head, then the body.
const LEVELS = [
  { face: 0.0012, head: 0.003, hands: 0.0018, body: 0.007, ears: 0.001, eye: [36, 26] },
  { head: 0.0034, hands: 0.0036, body: 0.012, eye: [18, 12] },
  { head: 0.008, body: 0.022, eye: [10, 7] },
  { body: 0.045 },
];

function regionsOf(M, S, P, lv) {
  const hs = M.headSc, at = (n) => P.W[n].t, regions = [];
  const neckAt = mix3(at('neck1'), at('head'), 0.42), neckN = nrm3(sub3(at('head'), at('neck1')));
  const neck = { id: 'neck', kind: 'plane', at: neckAt, n: neckN, r: 0.16 };
  const flip = (c) => ({ ...c, n: mul3(c.n, -1) });
  const wrists = SIDES.map(([s]) => { const w = at('hand.' + s), el = at('foreArm.' + s), d = nrm3(sub3(w, el)); return { id: 'wrist.' + s, kind: 'plane', at: add3(w, mul3(d, 0.004)), n: d, r: 0.09 }; });
  const T = M.tragionY, face = { id: 'face', kind: 'ball', at: [0, T - 0.03 * hs, 0.068 * hs], r: 0.078 * hs, side: 1, axis: [0, 0, 1] };
  const bodyCuts = [], headBox = { lo: [-0.14 * hs, neckAt[1] - 0.05, -0.15 * hs], hi: [0.14 * hs, M.H + 0.04, 0.16 * hs] };
  if (lv.head) bodyCuts.push(neck);
  if (lv.hands) bodyCuts.push(...wrists);
  regions.push({ name: 'body', lo: [-0.95, -0.02, -0.32], hi: [0.95, lv.head ? neckAt[1] + 0.05 : M.H + 0.04, 0.36], h: lv.body, cuts: bodyCuts });
  if (lv.head) {
    const cuts = [flip(neck)]; if (lv.face) cuts.push({ ...face, side: -1 });
    regions.push({ name: 'head', ...headBox, h: lv.head, cuts });
    if (lv.face) regions.push({ name: 'face', lo: sub3(face.at, [face.r, face.r, face.r]), hi: add3(face.at, [face.r, face.r, face.r]), h: lv.face, cuts: [face] });
  }
  if (lv.hands) for (const [i, [s]] of SIDES.entries()) {
    const w = at('hand.' + s), tip = P.move(`middle3.${s}`, S.at[`middleTip.${s}`]), c = mix3(w, tip, 0.5), e = len3(sub3(tip, w)) * 0.6 + 0.04;
    regions.push({ name: 'hand.' + s, lo: sub3(c, [e, e, e]), hi: add3(c, [e, e, e]), h: lv.hands, cuts: [flip(wrists[i])] });
  }
  return regions;
}

// ── the attributes of each point ─────────────────────────────────────────────────────────────────────────────────────
/** Which op the field's value at a point comes from: the last that set it (a solid it lies on, or a cut it lies in). */
function ownerAt(field, list, x, y, z) {
  let f = 1e9, own = -1;
  for (const i of list) {
    const o = field.ops[i], d = field.d(i, x, y, z), k = o.k;
    if (o.op === 'add') { if (d < f) own = i; const h = k - Math.abs(f - d); f = Math.min(f, d) - (k > 0 && h > 0 ? (h * h) / (4 * k) : 0); }
    else if (o.op === 'sub') { if (-d > f) own = i; const h = k - Math.abs(f + d); f = Math.max(f, -d) + (k > 0 && h > 0 ? (h * h) / (4 * k) : 0); }
  }
  return own;
}

/** The four bones a point follows, and how much: each flesh solid near it counts for its bone by how near it is, against
 *  the nearest (the field's own blend, read as weights). */
function weightsAt(field, list, boneIx, x, y, z) {
  const near = []; let dmin = 1e9;
  for (const i of list) { const o = field.ops[i]; if (!o.body || o.op !== 'add') continue; const d = field.d(i, x, y, z); near.push([o, d]); if (d < dmin) dmin = d; }
  const w = new Map();
  for (const [o, d] of near) { const kk = Math.max(o.k, 0.004) * 1.5, t = 1 - (d - dmin) / kk; if (t <= 0) continue; const b = boneIx[o.bone]; w.set(b, (w.get(b) || 0) + t * t); }
  if (!w.size) return null;
  return [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
}

/** The cloth's coordinates: whole tiles round a limb or the trunk (so the weave meets itself), along it in tiles. */
const TILE = 0.1;
function chartOf(bone) {
  const side = bone.endsWith('.L') ? 'L' : bone.endsWith('.R') ? 'R' : '';
  if (/^(upperArm|clavicle)/.test(bone)) return 'upperArm.' + side;
  if (/^foreArm|^hand|^thumb|^index|^middle|^ring|^little/.test(bone)) return 'foreArm.' + side;
  if (/^thigh/.test(bone)) return 'thigh.' + side;
  if (/^shin|^foot|^toes/.test(bone)) return 'shin.' + side;
  if (/^head|^jaw|^eye|^lid|^neck2/.test(bone)) return 'head';
  return 'trunk';
}
function chartAxes(M, S) {
  const at = S.at, C = { trunk: { o: [0, 0, -0.01], a: [0, 1, 0], r0: [0, 0, -1], circ: 2 * Math.PI * (M.chestBr + M.chestDp) / 2 }, head: { o: [0, 0, -0.01], a: [0, 1, 0], r0: [0, 0, -1], circ: Math.PI * (M.headBr + M.headLen) / 2 } };
  for (const [s, sg] of SIDES) {
    const seg = (a, b, circ, inner) => ({ o: at[a], a: nrm3(sub3(at[b], at[a])), r0: inner, circ });
    C['upperArm.' + s] = seg('upperArm.' + s, 'foreArm.' + s, 2 * Math.PI * (M.armR + 0.02), [-sg, 0, 0]);
    C['foreArm.' + s] = seg('foreArm.' + s, 'hand.' + s, 2 * Math.PI * (M.foreR + 0.015), [-sg, 0, 0]);
    C['thigh.' + s] = seg('thigh.' + s, 'shin.' + s, 2 * Math.PI * (M.thighR + 0.02), [sg, 0, 0]);   // the seam on the outside, as trousers have it
    C['shin.' + s] = seg('shin.' + s, 'foot.' + s, 2 * Math.PI * (M.calfR + 0.022), [sg, 0, 0]);
  }
  for (const c of Object.values(C)) { c.n = Math.max(1, Math.round(c.circ / TILE)); const d = c.r0, a = c.a, k = d[0] * a[0] + d[1] * a[1] + d[2] * a[2]; c.r0 = nrm3(sub3(d, mul3(a, k))); c.r1 = cross3(a, c.r0); }
  return C;
}
const uvIn = (c, p) => { const d = sub3(p, c.o), along = d[0] * c.a[0] + d[1] * c.a[1] + d[2] * c.a[2], ang = Math.atan2(d[0] * c.r1[0] + d[1] * c.r1[1] + d[2] * c.r1[2], d[0] * c.r0[0] + d[1] * c.r0[1] + d[2] * c.r0[2]); return [((ang + Math.PI) / (2 * Math.PI)) * c.n, along / TILE]; };

// ── a person, built ──────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The body of a recipe at the levels asked for (0 the finest … 3 a dot): for each, its points and triangles with
 * everything the human kit draws them with. Bones: names, parents, neutral places, the drawing pose's turns.
 */
export function bodyOf(R, { lods = [0, 1, 2, 3] } = {}) {
  const M = measuresOf(R), S = skeletonOf(M), wears = { shirt: !!R.wears?.shirt, trousers: !!R.wears?.trousers, belt: !!R.wears?.trousers, shoes: R.wears?.shoes != null };
  const boneIx = Object.fromEntries(S.names.map((n, i) => [n, i]));
  const charts = chartAxes(M, S);
  const out = { M, bones: { names: S.names, parent: S.names.map((n) => (S.parent[n] ? boneIx[S.parent[n]] : -1)), at: S.names.map((n) => S.at[n]), bind: S.bind }, lods: [] };
  for (const l of lods) out.lods[l] = level(M, S, wears, LEVELS[l], boneIx, charts);
  return out;
}

function level(M, S, wears, lv, boneIx, charts) {
  const t0 = Date.now();
  const { field, P } = fieldOfBody(M, S, wears, { ears: !lv.ears });
  let m = null;
  for (const r of regionsOf(M, S, P, lv)) { const part = meshOf(field, r); m = m ? zip(m, part) : part; }
  const tExtract = Date.now() - t0;
  // the ears on their own, finest
  const extra = [];
  if (lv.ears) {
    const { field: ef } = fieldOfBody(M, S, wears);
    for (const o of ef.ops.filter((o) => o.ear)) {
      const F = fieldOf([o]), e = meshOf(F, { lo: sub3(o.s.lo, [0.004, 0.004, 0.004]), hi: add3(o.s.hi, [0.004, 0.004, 0.004]), h: lv.ears });
      extra.push({ ...e, F });
    }
  }
  // every point: its normal, what it is, its bones, where it stood in the neutral pose, its cloth coordinates
  const A = { pos: [], nor: [], part: [], rest: [], ctr: [], sk: [], sw: [], chart: [], index: [] };
  const toNeutral = (bone, p) => { const W = P.W[bone]; return add3(S.at[bone], mv3(tr3(W.R), sub3(p, W.t))); };
  const pushPoint = (x, y, z, n, part, bones) => {
    const lead = S.names[bones[0][0]], q = toNeutral(lead, [x, y, z]), nn = mv3(tr3(P.W[lead].R), n);
    A.pos.push(x, y, z); A.nor.push(...n); A.part.push(part); A.rest.push(...q); A.ctr.push(...sub3(q, mul3(nn, 0.05)));
    const tot = bones.reduce((a, b) => a + b[1], 0); for (let k = 0; k < 4; k++) { A.sk.push(bones[k] ? bones[k][0] : 0); A.sw.push(bones[k] ? bones[k][1] / tot : 0); }
    A.chart.push(chartOf(lead));
  };
  // (the flesh's field gives the weights: an ear drawn on its own takes the head's)
  const addMesh = (mesh, F, wF) => {
    const off = A.pos.length / 3;
    for (let i = 0; i < mesh.pos.length; i += 3) {
      const x = mesh.pos[i], y = mesh.pos[i + 1], z = mesh.pos[i + 2], list = F.nearPoint(x, y, z);
      const g = slope(F, list, x, y, z), gl = Math.hypot(...g) || 1, n = g.map((v) => v / gl);
      const own = ownerAt(F, list, x, y, z), o = F.ops[own];
      const part = o ? o.part : PART.skin;
      let bones = weightsAt(wF, wF.nearPoint(x, y, z), boneIx, x, y, z) || [[boneIx[o?.bone ?? 'hips'], 1]];
      if (o && o.part === PART.hair) bones = [[boneIx.head, 1]];
      if (o && o.part === PART.teeth) bones = [[boneIx[o.bone], 1]];
      pushPoint(x, y, z, n, part, twist(bones, S, boneIx, [x, y, z], P));
    }
    for (const v of mesh.tri) A.index.push(v + off);
  };
  addMesh(m, field, field);
  for (const e of extra) addMesh(e, e.F, field);
  // the eyes
  if (lv.eye) for (const [s] of SIDES) {
    const e = P.W['eye.' + s].t, b = eyeball(M, e, lv.eye[0], lv.eye[1]), off = A.pos.length / 3;
    for (let i = 0; i < b.pos.length; i += 3) { pushPoint(b.pos[i], b.pos[i + 1], b.pos[i + 2], b.nor.slice(i, i + 3), PART.eye, [[boneIx['eye.' + s], 1]]); A.ctr.splice(A.ctr.length - 3, 3, ...S.at['eye.' + s]); }
    for (const v of b.tri) A.index.push(v + off);
  }
  const lod = seams(A, charts, M);
  lod.ms = Date.now() - t0; lod.msExtract = tExtract;
  return lod;
}

/** The twist bones take their share of the weight along their segment: the upper arm's and the thigh's near the joint
 *  they hang from (they turn back part of the segment's own twist), the forearm's near the wrist (it takes part of the
 *  hand's). */
function twist(bones, S, boneIx, p, P) {
  const out = [];
  for (const [b, w] of bones) {
    const n = S.names[b], m = /^(upperArm|thigh|foreArm)\.(L|R)$/.exec(n);
    if (!m) { out.push([b, w]); continue; }
    const kid = m[1] === 'upperArm' ? 'foreArm' : m[1] === 'thigh' ? 'shin' : 'hand', a = P.W[n].t, c = P.W[`${kid}.${m[2]}`].t, d = sub3(c, a);
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / (len3(d) ** 2)));
    const share = m[1] === 'foreArm' ? 0.85 * sstep(0.25, 0.9, t) : 0.7 * (1 - sstep(0.05, 0.7, t));
    const tw = boneIx[`${m[1]}Twist.${m[2]}`];
    out.push([b, w * (1 - share)]); if (share > 0) out.push([tw, w * share]);
  }
  const merged = new Map(); for (const [b, w] of out) merged.set(b, (merged.get(b) || 0) + w);
  return [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
}

/** Every triangle drawn in one chart of the cloth's coordinates: where its points' charts differ, or the angle round
 *  wraps, the points are made again with the triangle's own (a seam, where a garment has one). */
function seams(A, charts, M) {
  const n = A.pos.length / 3, out = { pos: [], nor: [], part: [], rest: [], ctr: [], sk: [], sw: [], uv: [], index: [] }, made = new Map();
  const copy = (v, uv) => { for (const k of ['pos', 'nor', 'rest', 'ctr']) out[k].push(A[k][v * 3], A[k][v * 3 + 1], A[k][v * 3 + 2]); out.part.push(A.part[v]); for (let q = 0; q < 4; q++) { out.sk.push(A.sk[v * 4 + q]); out.sw.push(A.sw[v * 4 + q]); } out.uv.push(...uv); return out.pos.length / 3 - 1; };
  const rest = (v) => [A.rest[v * 3], A.rest[v * 3 + 1], A.rest[v * 3 + 2]];
  for (let t = 0; t < A.index.length; t += 3) {
    const v = [A.index[t], A.index[t + 1], A.index[t + 2]], ch = v.map((i) => A.chart[i]);
    const c = ch[0] === ch[1] || ch[0] === ch[2] ? ch[0] : ch[1] === ch[2] ? ch[1] : ch[0], C = charts[c];
    let uv = v.map((i) => uvIn(C, rest(i)));
    const us = uv.map((q) => q[0]); if (Math.max(...us) - Math.min(...us) > C.n / 2) uv = uv.map((q) => (q[0] < C.n / 2 ? [q[0] + C.n, q[1]] : q));
    for (let q = 0; q < 3; q++) {
      const key = `${v[q]}|${c}|${uv[q][0] >= C.n ? 1 : 0}`;
      let id = made.get(key); if (id == null) { id = copy(v[q], uv[q]); made.set(key, id); }
      out.index.push(id);
    }
  }
  void n; void M;
  return out;
}

/** (for tools: the regions of level l) */
export const regionsForTest = (M, S, P, l) => regionsOf(M, S, P, LEVELS[l]);
