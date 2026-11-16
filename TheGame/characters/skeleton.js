// The skeleton of the library: every bone of a man of 1.80 m, grown from our own code (./kit/skeleton.js: 262 pieces
// against the plates of Gray's Anatomy, each bone a piece of its own, neighbours fitted round one another) and moved
// on a rig of ninety joints set where its bones really meet (./kit/skeleton/pose.js). The first of a body's layers
// (intent 0036): the muscles, the fat and the skin are laid on it. A character is a recipe like any other
// (src/core/registry.js).
import { skeletonOf, MOVES } from './kit/bones.js';

const skeleton = {
  uid: '7b0e2f6c-3a41-4d5e-9c18-5f2a6d0b9e37',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'character',
  name: 'Skeleton',
  kind: 'skeleton',
  about: 'Every bone of a man of 1.80 m, each a piece of its own in its true shape: skull and jaw with thirty-two teeth, twenty-four vertebrae and their discs, ribs and breastbone, the limbs to the last joint of each finger and toe. It moves on ninety joints, each where two bones really meet.',
  made: '262 pieces grown in the page from our own code: 186 of bone (the skull\'s bones as one cranium and a jaw), 32 teeth, 23 discs, 20 rib cartilages and the pubic disc; shaped against the plates of Gray\'s Anatomy (1918).',
  height: 1.8,
  walkRound: 2.4,   // the walk goes round the stage this far from its middle (m)
  moves: MOVES.map((m) => m.id),
  make: (tex, opts) => skeletonOf(tex, skeleton, opts),   // the skeleton, built (characters/kit/bones.js)
};
export default skeleton;
