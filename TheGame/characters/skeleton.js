// The skeleton of the library: every bone of a man of 1.80 m, grown from our own code (./kit/skeleton.js: 262 pieces
// against the plates of Gray's Anatomy, each bone a piece of its own, neighbours fitted round one another) and moved
// on a rig of ninety joints set where its bones really meet (./kit/skeleton/pose.js). The first of a body's layers
// (intent 0036): the muscles, the fat and the skin are laid on it. A character is a recipe like any other
// (src/core/registry.js).
import { skeletonOf, MOVES } from './kit/bones.js';
import { PERSON } from '../world/scale.js';

const skeleton = {
  uid: '7b0e2f6c-3a41-4d5e-9c18-5f2a6d0b9e37',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'character',
  name: 'Skeleton',
  kind: 'skeleton',
  about: 'Every bone of a man of 1.80 m, moving on ninety joints.',
  made: '262 pieces grown in the page from our own code: 186 of bone (the skull\'s bones as one cranium and a jaw), 32 teeth, 23 discs, 20 rib cartilages and the pubic disc; shaped against the plates of Gray\'s Anatomy (1918).',
  height: 1.8,   // the man its bones are laid for: the body kit's man of reference (./kit/skeleton.js)
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'the skeleton of a grown man, standing as it stands in him: its crown a scalp\'s thickness under his stature',
    typical: [1.6, 1.8],
    most: 2.0,
    source: ['ANSUR II (Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel", NATICK/TR-15/007): mean stature 1.629 m (women), 1.756 m (men)'],
    own: [`the man it is the skeleton of stands 1.80 m, the body kit's man of reference: ${Math.round((1.8 / PERSON.stature - 1) * 100)}% over the reference body (world/scale.js), whose bones a body of other measures carries to its own`],
  },
  walkRound: 2.4,   // the walk goes round the stage this far from its middle (m)
  moves: MOVES.map((m) => m.id),
  make: (tex, opts) => skeletonOf(tex, skeleton, opts),   // the skeleton, built (characters/kit/bones.js)
};
export default skeleton;
