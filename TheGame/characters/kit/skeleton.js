// The skeleton (intent 0033): every bone of the body in its own shape and size, laid out for one man of reference,
// 1.80 m, standing in the neutral pose (arms down, palms to the thighs, every frame turned like the world's). It is the
// first of the body's layers (the bones, then the muscles on them, the fat, the skin: ./body.js) and the rig the person
// moves by: its joints are where these bones meet. Measures from anatomy's textbooks (Gray's Anatomy, 1918, its plates;
// White, Black & Folkens, "Human Osteology", 3rd ed.), for an adult man; a body of other measures is this skeleton
// carried to its own (./body.js).
//
// Coordinates: metres, from the floor between the feet; x to the person's left, y up, z forwards. Points are written
// for the left side (x > 0); the right is their mirror.
//
//   skeletonBones(X) -> [{ id, rig, part, ops }]   every bone by its own name, the rig's bone that carries it, and its
//                                                  solids (./field.js): a field of its own, never blended with another's
//   skeletonParts(X) -> [{ bone, id, s, k, part }]  the same as one list for one field: each bone a group
//   JOINTS, PARENT                                 the rig: where its bones turn, which carries which (./skeleton/rig.js)
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

export { PART, JOINTS, PARENT, FINGERS, fingerJoints } from './skeleton/rig.js';
export { VERTEBRAE } from './skeleton/spine.js';

const REGIONS = { skull, spine, chest, pelvis, arm, hand, leg, foot };

/** The skeleton's bones. X carries a point of the reference man to the body's (X.k its lengths); only: the regions
 *  wanted (all of them when not given). */
export function skeletonBones(X = (p) => p, only = null) {
  const K = kitOf(X);
  for (const [name, make] of Object.entries(REGIONS)) if (!only || only.includes(name)) make(K);
  return K.bones.filter((b) => b.ops.length);
}

/** The bones as one list for one field: each bone a group of its own solids, added to the others with no blend. */
export function skeletonParts(X = (p) => p) {
  return skeletonBones(X).map((b) => ({ bone: b.rig, id: b.id, s: group(b.ops), k: 0, part: b.part, op: 'add', body: true, layer: 'bone' }));
}
