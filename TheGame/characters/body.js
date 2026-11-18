// The body of the library (intents 0036, 0039): the skeleton (./skeleton.js), the muscles on it (./muscles.js), and over
// them the fat and the skin: a man of 1.80 m as he stands, naked. One layer outermost at a time (skin, fat, muscles,
// bones), all of them on the skeleton's rig and moving with it. The skin is one closed surface, made as a film's or a
// game's body is: a cage of four-sided faces wrapped on the shape the anatomy gives and made smooth (./kit/skin/), each
// of its points carried by the joints nearest under it (it does not yet swell with the muscles). Grown in the page from
// our own code. A character is a recipe like any other (src/core/registry.js).
import { skeletonOf, MOVES } from './kit/bones.js';
import { PERSON } from '../world/scale.js';

const body = {
  uid: 'f2d908f8-3c01-411d-a561-ef27148ba557',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'character',
  name: 'Body',
  kind: 'anatomy',
  about: 'A man of 1.80 m as he stands, naked: his skin over his fat, over his muscles, over his bones, each a layer that can be shown outermost. The skin is one smooth, closed surface, as far over the muscles and the bones as the fat and the skin are thick there, and rides on the joints as they move. His head is laid out as a draughtsman lays one out, from its measured outline and profile; his eyes are globes behind lids cut along their edges, with lashes and brows.',
  made: 'The skeleton and its muscles (see Skeleton and Muscles); the fat\'s and the skin\'s thickness place by place from skinfold and soft-tissue depth tables (Jackson & Pollock 1978, Durnin & Womersley 1974, Stephan & Simpson 2008); the body\'s outline from the US Army\'s survey of men (ANSUR II, 2012); the nose\'s and the ears\' gristle and the eyes; the head\'s form from its skull\'s own levels and the face\'s measured profile and breadths (Arnett et al. 1999, Farkas 1994). The skin a cage of about 5 000 four-sided faces wrapped on that shape and made smooth (Catmull & Clark 1978), lit as skin is: light spreading under it as measured (d\'Eon, Luebke & Enderton 2007), two lobes of gloss. Grown in the page from our own code.',
  layers: ['bones', 'muscles', 'fat', 'skin'],
  height: 1.8,   // the man of reference (./kit/skeleton.js)
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'a grown man standing, naked: measured by his bones (the run grows only their quick surface), his crown a scalp\'s thickness under his stature, which his skin reaches',
    typical: [1.6, 1.8],
    most: 2.0,
    source: ['ANSUR II (Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel", NATICK/TR-15/007): mean stature 1.629 m (women), 1.756 m (men)'],
    own: [`the man stands 1.80 m, the body kit's man of reference: ${Math.round((1.8 / PERSON.stature - 1) * 100)}% over the reference body (world/scale.js), whose bones, muscles and skin a body of other measures carries to its own`],
  },
  walkRound: 2.4,   // the walk goes round the stage this far from its middle (m)
  moves: MOVES.map((m) => m.id),
  make: (tex, opts) => skeletonOf(tex, body, opts),   // the skeleton, its muscles, its fat and its skin (characters/kit/bones.js)
};
export default body;
