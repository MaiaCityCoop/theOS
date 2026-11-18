// The muscles of the library (intent 0036): the body's second layer, laid on the skeleton (./skeleton.js). Every major
// muscle of a man of 1.80 m, each from its origin on one bone to its insertion on another (./kit/muscles/table.js),
// as large as a real one, drawn out by our own code and carried by the skeleton's rig: a muscle that shortens swells,
// one that lengthens thins, its volume kept. A character is a recipe like any other (src/core/registry.js).
import { skeletonOf, MOVES } from './kit/bones.js';
import { PERSON } from '../world/scale.js';

const muscles = {
  uid: '7e571b19-a173-474a-b271-65cf86be6c47',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'character',
  name: 'Muscles',
  kind: 'anatomy',
  about: 'The muscles of a man on his skeleton, origin to insertion.',
  made: 'Over a hundred muscles a side, from the trunk, the shoulders, the arms, the hands, the hips, the legs, the feet, the neck and the face, laid on the skeleton\'s bones from Gray\'s Anatomy (1918) and sized by the volumes measured in living men by MRI (Handsfield et al. 2014, Holzbaur et al. 2007); grown in the page from our own code.',
  layers: ['bones', 'muscles'],
  height: 1.8,   // the man its muscles are laid for: the body kit's man of reference (./kit/skeleton.js)
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'the skeleton of a grown man with his muscles on it, standing: measured by its bones, its crown a scalp\'s thickness under his stature (the scalp\'s tendon sheet lies on the crown, a millimetre or two)',
    typical: [1.6, 1.8],
    most: 2.0,
    source: ['ANSUR II (Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel", NATICK/TR-15/007): mean stature 1.629 m (women), 1.756 m (men)'],
    own: [`the man it is the muscles of stands 1.80 m, the body kit's man of reference: ${Math.round((1.8 / PERSON.stature - 1) * 100)}% over the reference body (world/scale.js), whose bones and muscles a body of other measures carries to its own`],
  },
  walkRound: 2.4,   // the walk goes round the stage this far from its middle (m)
  moves: MOVES.map((m) => m.id),
  make: (tex, opts) => skeletonOf(tex, muscles, opts),   // the skeleton, with its muscles on it (characters/kit/bones.js)
};
export default muscles;
