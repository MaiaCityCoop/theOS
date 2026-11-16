// The skeleton's rig (intent 0033): a joint where each pair of bones really meets, which bone hangs from which, and
// the pose: every bone turned about its own joint and carried by the bone it hangs from.
//
//   rigOf()              { name: { at: [x, y, z], parent, axis? } }   the joints of the man of reference, standing
//   rigBoneOf(id)        the rig's bone that carries a bone of the skeleton ('femur.L' -> 'thigh.L', 'T7' -> 'T7')
//   poseOf(rig, turns)   { name: [9 numbers of a turn, 3 of a shift] }  where each rig bone carries its points to:
//                        p' = A·p + t (the standing pose: A the unit turn, t nothing)
//   turnsOf(moves)       turns for poseOf from a few plain moves (a bend of the loins, an arm raised, a knee bent …),
//                        shared out among the joints the way a body shares them
//
// A turn: [x, y, z] radians about the body's own axes, standing (x: to its left, so a positive x turn nods forwards
// and bends a knee backwards; y: up, a positive y turn looks to its left; z: forwards, a positive z turn leans to its
// right), taken z first, then x, then y; or { axis, angle } about a joint's own axis.
import { JOINTS, FINGERS, fingerJoints } from './rig.js';
import { VERTEBRAE, vertebraFrame, SACRAL_BASE, ATLAS } from './spine.js';
import { bladeFrame } from './arm.js';
import { toeJoints } from './foot.js';

const SIDES = [['L', 1], ['R', -1]];

/** The rig's bone that carries a bone of the skeleton, by its name. */
export function rigBoneOf(id) {
  const [n, side] = id.split(/\.(?=[LR]$)/), S = side ? '.' + side : '';
  if (/^[CTL]\d+$/.test(n)) return n;
  if (n.startsWith('disc.')) { const i = VERTEBRAE.findIndex((v) => v[0] === n.slice(5)); return i < 0 ? 'C2' : VERTEBRAE[i + 1] ? VERTEBRAE[i + 1][0] : 'hips'; }   // (the atlas has no disc)
  if (/^rib\d+$/.test(n)) return 'T' + n.slice(3);
  if (/^(cartilage\d+|manubrium|sternum|xiphoid)$/.test(n)) return 'T4';
  if (n === 'cranium' || n.startsWith('tooth.U')) return 'head';
  if (n === 'mandible' || n.startsWith('tooth.L')) return 'jaw';
  if (n === 'hyoid') return 'C3';
  if (/^(sacrum|coccyx|hip|symphysis)$/.test(n)) return 'hips';
  const arm = { clavicle: 'clavicle', scapula: 'scapula', humerus: 'upperArm', ulna: 'foreArm', radius: 'radius', metacarpal1: 'thumb1', femur: 'thigh', patella: 'patella', tibia: 'shin', fibula: 'shin' }[n];
  if (arm) return arm + S;
  if (/^(scaphoid|lunate|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal[2-5])$/.test(n)) return 'hand' + S;
  if (/^(thumb|index|middle|ring|little)[1-3]$/.test(n)) return n + S;
  if (/^(talus|calcaneus|navicular|cuboid|cuneiform\d|metatarsal\d)$/.test(n)) return 'foot' + S;
  if (/^toe\d[abc]$/.test(n)) return 'toe' + n[3] + S;
  if (/^sesamoid\d$/.test(n)) return 'foot' + S;
  return 'hips';
}

/** The rig's joints, standing. */
export function rigOf() {
  const R = { root: { at: [0, 0, 0], parent: null }, hips: { at: JOINTS.hips, parent: 'root' } };
  // the column: each vertebra turns about the middle of the disc under it, a little behind its middle
  const V = VERTEBRAE;
  for (let i = V.length - 1; i >= 0; i--) {
    const v = V[i], f = vertebraFrame(v), below = V[i + 1];
    let at = SACRAL_BASE.at;
    if (below) { const g = vertebraFrame(below), lo = f.at(0, -v[5] / 2, -v[4] * 0.12), up = g.at(0, below[5] / 2, -below[4] * 0.12); at = lo.map((q, k) => (q + up[k]) / 2); }
    R[v[0]] = { at, parent: below ? below[0] : 'hips' };
  }
  R.C1 = { at: ATLAS.at, parent: 'C2' };                                 // the atlas turns on the axis' peg
  R.head = { at: [0, ATLAS.cup[1], ATLAS.cup[2]], parent: 'C1' };        // the skull nods in the atlas' cups
  R.jaw = { at: JOINTS.jaw, parent: 'head', axis: [1, 0, 0] };           // the jaw's hinge, through its two heads
  for (const [s, g] of SIDES) {
    const M = (p) => [g * p[0], p[1], p[2]], J = (n) => M(JOINTS[n + '.L']), B = (n) => n + '.' + s;
    R[B('eye')] = { at: J('eye'), parent: 'head' };
    // the arm: the collarbone on the breastbone; the blade on the collarbone's outer end; the humerus' ball in the
    // blade's socket; the ulna hinged on the humerus; the radius turning about the line from its own head to the
    // ulna's (the forearm's twist); the hand on the radius
    const S = JOINTS['upperArm.L'], E = JOINTS['foreArm.L'], W = JOINTS['hand.L'];
    R[B('clavicle')] = { at: J('clavicle'), parent: 'T2' };
    R[B('scapula')] = { at: M(ARM.ac), parent: B('clavicle') };
    R[B('upperArm')] = { at: M(S), parent: B('scapula') };
    R[B('foreArm')] = { at: M(E), parent: B('upperArm'), axis: M(ARM.elbowAxis) };
    R[B('radius')] = { at: M(ARM.radialHead), parent: B('foreArm'), axis: norm(sub(M(ARM.ulnarHead), M(ARM.radialHead))) };
    R[B('hand')] = { at: M(W), parent: B('radius') };
    const F = fingerJoints(M(W), g);
    for (const f of FINGERS) for (let j = 1; j <= 3; j++) R[B(f + j)] = { at: F[f + j], parent: j === 1 ? B('hand') : B(f + (j - 1)) };
    // the leg: the femur's ball in the hip's socket; the knee; the kneecap riding round the femur's end; the ankle;
    // the toes
    R[B('thigh')] = { at: J('thigh'), parent: 'hips' };
    R[B('shin')] = { at: J('shin'), parent: B('thigh'), axis: [1, 0, 0] };
    R[B('patella')] = { at: J('shin'), parent: B('thigh'), axis: [1, 0, 0] };
    R[B('foot')] = { at: J('foot'), parent: B('shin'), axis: M(LEG.ankleAxis) };
    const TJ = toeJoints();   // each toe turns at its own knuckle, about the line across the foot
    for (let i = 0; i < 5; i++) R[B('toe' + (i + 1))] = { at: M(TJ.at[i]), parent: B('foot'), axis: M(TJ.axis) };
  }
  return R;
}
// Points of the left arm and leg the rig's joints are taken from, where the regions' own files lay the bones (./arm.js:
// the blade's frame and the collarbone's outer end in it; the humerus' and the forearm's frames from the elbow).
const ARM = (() => {
  const S = JOINTS['upperArm.L'], E = JOINTS['foreArm.L'], W = JOINTS['hand.L'], B = bladeFrame(S);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const hy = nrm(dif(S, E)), hx = nrm(dif([1, 0, 0], hy.map((v) => v * hy[0]))), fy = nrm(dif(E, W)), fx = nrm(dif([1, 0, 0], fy.map((v) => v * fy[0]))), fz = cross(fx, fy), L = Math.hypot(...dif(E, W));
  const F = (x, y, z) => [0, 1, 2].map((i) => E[i] + fx[i] * x + fy[i] * y + fz[i] * z); void dot;
  return { ac: B.p(0.0165, 0.0445, 0.0085), elbowAxis: nrm([0, 1, 2].map((i) => hx[i] + 0.1 * hy[i])), radialHead: F(0.0165, -0.0158, 0.0045), ulnarHead: F(0.002, -L + 0.0078, -0.018) };
})();
const LEG = { ankleAxis: [1, -0.14, -0.1] };

function dif(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function nrm(a) { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); }
const sub = dif, norm = nrm;
const mulM = (a, b) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));
const apply = (a, p) => [a[0] * p[0] + a[1] * p[1] + a[2] * p[2], a[3] * p[0] + a[4] * p[1] + a[5] * p[2], a[6] * p[0] + a[7] * p[1] + a[8] * p[2]];
const about = (ax, t) => { const [x, y, z] = norm(ax), c = Math.cos(t), s = Math.sin(t), k = 1 - c; return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k]; };
/** A turn as nine numbers. */
export function turnOf(t, joint) {
  if (!t) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (!Array.isArray(t)) return about(t.axis ?? joint.axis ?? [1, 0, 0], t.angle);
  return mulM(about([0, 1, 0], t[1]), mulM(about([1, 0, 0], t[0]), about([0, 0, 1], t[2])));
}

/** Where each rig bone carries its points in a pose: { name: [A (9), t (3)] }, p' = A·p + t. */
export function poseOf(rig, turns = {}) {
  const out = {}, done = (n) => {
    if (out[n]) return out[n];
    const b = rig[n], P = b.parent ? done(b.parent) : [[1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]], R = turnOf(turns[n], b);
    const A = mulM(P[0], R), j = b.at, rj = apply(R, j), tn = turns[n], sh = tn && !Array.isArray(tn) && tn.shift ? apply(R, tn.shift) : [0, 0, 0];   // (a shift: the bone slid, in its own standing frame)
    const t = apply(P[0], [j[0] - rj[0] + sh[0], j[1] - rj[1] + sh[1], j[2] - rj[2] + sh[2]]).map((v, i) => v + P[1][i]);
    return (out[n] = [A, t]);
  };
  for (const n of Object.keys(rig)) done(n);
  return out;
}

// How a bend of a region of the column is shared among its joints (their sum 1 each).
const SHARE = {
  loins: { bones: ['L5', 'L4', 'L3', 'L2', 'L1'], flex: [0.3, 0.26, 0.18, 0.14, 0.12], side: [0.12, 0.2, 0.26, 0.24, 0.18], twist: [0.2, 0.2, 0.2, 0.2, 0.2] },
  chest: { bones: ['T12', 'T11', 'T10', 'T9', 'T8', 'T7', 'T6', 'T5', 'T4', 'T3', 'T2', 'T1'], flex: [0.16, 0.14, 0.1, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.06, 0.06, 0.06], side: null, twist: [0.03, 0.04, 0.06, 0.09, 0.1, 0.11, 0.11, 0.11, 0.1, 0.09, 0.08, 0.08] },
  neck: { bones: ['C7', 'C6', 'C5', 'C4', 'C3', 'C2'], flex: [0.13, 0.2, 0.22, 0.2, 0.15, 0.1], side: null, twist: [0.14, 0.18, 0.2, 0.2, 0.16, 0.12] },
};
/**
 * Turns from plain moves (radians; each side's taken apart, e.g. { 'knee.L': 1.2 }):
 *   loins, chest, neck: [bend forwards, twist to the left, lean to the right]; head: [nod, turn, tilt] (half of a turn
 *   is the atlas'); jaw: how far it opens
 *   arm.S: [raise forwards, raise sideways, turn the upper arm inwards]; elbow.S; forearm.S (palm turned backwards);
 *   wrist.S: [bend to the palm, to the thumb]; fist.S (0 … 1)
 *   hip.S: [forwards, outwards, turned outwards]; knee.S; ankle.S (toes up); toes.S
 */
export function turnsOf(m = {}) {
  const T = {};
  for (const [name, s] of Object.entries(SHARE)) { const v = m[name]; if (!v) continue; s.bones.forEach((b, i) => { T[b] = [v[0] * s.flex[i], v[1] * s.twist[i], v[2] * (s.side ?? s.flex.map(() => 1 / s.bones.length))[i]]; }); }
  if (m.head) { T.head = [m.head[0], m.head[1] * 0.1, m.head[2]]; T.C1 = [0, m.head[1] * 0.55, 0]; for (const [b, w] of [['C2', 0.07], ['C3', 0.07], ['C4', 0.07], ['C5', 0.07], ['C6', 0.07]]) T[b] = [(T[b]?.[0] ?? 0), (T[b]?.[1] ?? 0) + m.head[1] * w, (T[b]?.[2] ?? 0)]; }
  if (m.jaw) T.jaw = { angle: m.jaw };
  for (const [s, g] of SIDES) {
    const B = (n) => n + '.' + s, a = m[B('arm')];
    if (a) {
      // the arm's raise is shared: two thirds in the shoulder's own joint, one third by the blade turning on the chest,
      // the collarbone's outer end rising with it
      const [fw, sd, tw] = a;
      T[B('clavicle')] = [0, -g * fw * 0.08, g * sd * 0.2];
      T[B('scapula')] = [-fw * 0.12, 0, g * sd * 0.14];
      T[B('upperArm')] = [-fw * 0.8, -g * tw, g * sd * 0.66];
    }
    // (a joint with an axis of its own: the right side's axis is the left's mirrored, so its angle runs the other way)
    if (m[B('elbow')]) T[B('foreArm')] = { angle: -g * m[B('elbow')] };
    if (m[B('forearm')]) T[B('radius')] = { angle: g * m[B('forearm')] };
    if (m[B('wrist')]) T[B('hand')] = [-m[B('wrist')][1], 0, -g * m[B('wrist')][0]];
    const fist = m[B('fist')];
    if (fist) for (const f of FINGERS) for (let j = 1; j <= 3; j++) T[B(f + j)] = f === 'thumb' ? [fist * [0.25, 0.3, 0.5][j - 1], 0, -g * fist * [0.5, 0.35, 0.5][j - 1]] : [0, 0, -g * fist * [1.45, 1.6, 1.0][j - 1]];
    const h = m[B('hip')];
    if (h) T[B('thigh')] = [-h[0], g * h[2], g * h[1]];
    const k = m[B('knee')];
    // (the kneecap rides round the femur's end, held by its tendon to the shin: it turns less than the shin does, and
    // sinks into the groove between the condyles as the knee bends)
    if (k) { T[B('shin')] = { angle: k }; T[B('patella')] = { angle: k * 0.62, shift: [0, -0.004 * Math.min(1, k / 1.2), -0.013 * Math.min(1, k / 1.2)] }; }
    if (m[B('ankle')]) T[B('foot')] = { angle: -g * m[B('ankle')] };
    if (m[B('toes')]) for (let i = 1; i <= 5; i++) T[B('toe' + i)] = { angle: -g * m[B('toes')] };
  }
  return T;
}
