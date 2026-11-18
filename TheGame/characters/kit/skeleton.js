// The skeleton (intent 0036): every bone of the body in its own shape and size, laid out for one man of reference,
// 1.80 m, standing in the neutral pose (arms down, palms to the thighs, every frame turned like the world's). It is the
// first of the body's layers (the bones, then the muscles on them, the fat, the skin: ./bones.js) and the rig the person
// moves by: its joints are where these bones meet. Measures from anatomy's textbooks (Gray's Anatomy, 1918, its plates;
// White, Black & Folkens, "Human Osteology", 3rd ed.), for an adult man; a body of other measures is this skeleton
// carried to its own.
//
// Coordinates: metres, from the floor between the feet; x to the person's left, y up, z forwards. Points are written
// for the left side (x > 0); the right is their mirror.
//
//   skeletonBones(X) -> [{ id, rig, part, ops }]   every bone by its own name, the rig's bone that carries it, and its
//                                                  solids (./field.js): a field of its own, never blended with another's
//   rigOf(), poseOf(rig, turns), turnsOf(moves)    the rig (a joint where each pair of bones meets) and the pose: every
//                                                  bone carried whole by its joint (./skeleton/pose.js)
//   skeletonParts(X) -> [{ bone, id, s, k, part }]  the same as one list for one field: each bone a group
//   JOINTS, PARENT                                 the few joints the bones are laid from (./skeleton/rig.js)
//
// Each region of the body is written in its own file (./skeleton/), with the kit they share (./skeleton/kit.js).
import { group } from './field.js';
import { kitOf } from './skeleton/kit.js';
import { skull } from './skeleton/skull.js';
import { spine } from './skeleton/spine.js';
import { chest } from './skeleton/chest.js';
import { pelvis } from './skeleton/pelvis.js';
import { arm } from './skeleton/arm.js';
import { hand } from './skeleton/hand.js';
import { leg } from './skeleton/leg.js';
import { foot } from './skeleton/foot.js';

import { rigBoneOf } from './skeleton/pose.js';

export { PART, JOINTS, PARENT, FINGERS, fingerJoints } from './skeleton/rig.js';
export { VERTEBRAE } from './skeleton/spine.js';
export { rigOf, rigBoneOf, poseOf, turnsOf, turnOf, LIMITS } from './skeleton/pose.js';

const REGIONS = { skull, spine, chest, pelvis, arm, hand, leg, foot };

// Where two bones meet, one of them fits round the other: the hollow side of a joint is carved by the round side (its
// surface pushed out by the gristle's thickness), so neighbours touch instead of standing in one another. Each line:
// [the bone that gives way, the bone it fits round] (by their names, \1 a number or a side taken from the first);
// a bone gives way to a neighbour's shape as it was laid, before that one was itself carved.
const GRISTLE = 0.0005;
const SEATS = [
  [/^hip\.([LR])$/, 'femur.$1'], [/^(patella|tibia)\.([LR])$/, 'femur.$2'], [/^fibula\.([LR])$/, 'tibia.$1'], [/^(tibia|fibula|calcaneus|navicular)\.([LR])$/, 'talus.$2'],
  [/^cuboid\.([LR])$/, 'calcaneus.$1'], [/^cuneiform\d\.([LR])$/, 'navicular.$1'], [/^cuboid\.([LR])$/, 'cuneiform3.$1'], [/^cuneiform2\.([LR])$/, ['cuneiform1.$1', 'cuneiform3.$1']],
  [/^metatarsal1\.([LR])$/, 'cuneiform1.$1'], [/^metatarsal2\.([LR])$/, ['cuneiform1.$1', 'cuneiform2.$1', 'cuneiform3.$1']], [/^metatarsal3\.([LR])$/, ['cuneiform3.$1', 'metatarsal2.$1']],
  [/^metatarsal4\.([LR])$/, ['cuboid.$1', 'cuneiform3.$1', 'metatarsal3.$1']], [/^metatarsal5\.([LR])$/, ['cuboid.$1', 'metatarsal4.$1']],
  [/^toe(\d)a\.([LR])$/, 'metatarsal$1.$2'], [/^toe(\d)b\.([LR])$/, 'toe$1a.$2'], [/^toe(\d)c\.([LR])$/, 'toe$1b.$2'], [/^sesamoid\d\.([LR])$/, 'metatarsal1.$1'],
  [/^scapula\.([LR])$/, ['humerus.$1', 'clavicle.$1']], [/^(ulna|radius)\.([LR])$/, 'humerus.$2'], [/^ulna\.([LR])$/, 'radius.$1'], [/^manubrium$/, ['clavicle.L', 'clavicle.R']],
  [/^radius\.([LR])$/, ['scaphoid.$1', 'lunate.$1']], [/^(scaphoid|lunate|hamate|trapezoid)\.([LR])$/, 'capitate.$2'], [/^(lunate|trapezium|trapezoid)\.([LR])$/, 'scaphoid.$2'], [/^triquetrum\.([LR])$/, ['lunate.$1', 'hamate.$1']],
  [/^pisiform\.([LR])$/, 'triquetrum.$1'], [/^trapezoid\.([LR])$/, 'trapezium.$1'], [/^metacarpal1\.([LR])$/, 'trapezium.$1'], [/^metacarpal2\.([LR])$/, ['trapezoid.$1', 'trapezium.$1', 'capitate.$1']],
  [/^metacarpal3\.([LR])$/, ['capitate.$1', 'metacarpal2.$1']], [/^metacarpal4\.([LR])$/, ['hamate.$1', 'capitate.$1', 'metacarpal3.$1']], [/^metacarpal5\.([LR])$/, ['hamate.$1', 'metacarpal4.$1']],
  [/^thumb2\.([LR])$/, 'metacarpal1.$1'], [/^thumb3\.([LR])$/, 'thumb2.$1'], [/^(index|middle|ring|little)1\.([LR])$/, (m) => `metacarpal${{ index: 2, middle: 3, ring: 4, little: 5 }[m[1]]}.${m[2]}`],
  [/^(index|middle|ring|little)2\.([LR])$/, '$11.$2'], [/^(index|middle|ring|little)3\.([LR])$/, '$12.$2'],
  [/^cranium$/, 'mandible'], [/^C1$/, ['cranium', 'C2']], [/^sternum$/, 'manubrium'], [/^xiphoid$/, 'sternum'], [/^hip\.([LR])$/, 'sacrum'], [/^coccyx$/, 'sacrum'], [/^L5$/, 'sacrum'],
  // each vertebra gives way to the one under it (its lower joints fit the lower one's upper), and to the ribs' heads
  [/^([CTL])(\d+)$/, (m) => { const col = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5'], i = col.indexOf(m[0]); return i >= 0 && col[i + 1] ? [col[i + 1]] : []; }],
  [/^T(\d+)$/, (m) => [`rib${m[1]}.L`, `rib${m[1]}.R`, `rib${+m[1] + 1}.L`, `rib${+m[1] + 1}.R`]],
];
function seat(bones) {
  const by = new Map(bones.map((b) => [b.id, b])), laid = new Map(bones.map((b) => [b.id, b.ops.slice()])), box = (ops) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const o of ops) if (o.op === 'add') for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], o.s.lo[i]); hi[i] = Math.max(hi[i], o.s.hi[i]); } return { lo, hi }; };
  const boxes = new Map(bones.map((b) => [b.id, box(b.ops)]));
  for (const b of bones) for (const [re, to] of SEATS) {
    const m = b.id.match(re); if (!m) continue;
    const names = typeof to === 'function' ? [to(m)].flat() : [to].flat().map((t) => t.replace(/\$(\d)/g, (_, i) => m[+i]));
    for (const n of names) {
      const a = by.get(n); if (!a || a === b) continue;
      const A = boxes.get(n), B = boxes.get(b.id); if (A.lo.some((v, i) => v - 0.002 > B.hi[i] || A.hi[i] + 0.002 < B.lo[i])) continue;
      b.ops.push({ op: 'sub', k: 0.0004, part: b.part, s: group(laid.get(n), undefined, undefined, GRISTLE) });
    }
  }
}

/** The skeleton's bones. X carries a point of the reference man to the body's (X.k its lengths); only: the regions
 *  wanted (all of them when not given). */
export function skeletonBones(X = (p) => p, only = null) {
  const K = kitOf(X);
  for (const [name, make] of Object.entries(REGIONS)) if (!only || only.includes(name)) make(K);
  for (const b of K.bones) b.rig = rigBoneOf(b.id);   // the rig's bone that carries it (./skeleton/pose.js)
  const bones = K.bones.filter((b) => b.ops.length);
  seat(bones);
  return bones;
}

/** The bones as one list for one field: each bone a group of its own solids, added to the others with no blend. */
export function skeletonParts(X = (p) => p) {
  return skeletonBones(X).map((b) => ({ bone: b.rig, id: b.id, s: group(b.ops), k: 0, part: b.part, op: 'add', body: true, layer: 'bone' }));
}
