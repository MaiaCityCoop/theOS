// A man brought in whole (intent 0043): the first figure of the library that is not grown from our own numbers. One of
// VALID's (the Validated Avatar Library for Inclusion and Diversity), kept as the file its makers gave, stood in the
// world by the figure kit (./kit/figure.js): its light, its moves, its face's expressions. A first pair, he and the
// Woman (./woman.js), to see the way working; which figures become the base is still to be chosen.
import { figureOf, MOVES, EXPRESSIONS } from './kit/figure.js';

const man = {
  uid: '175c0572-91a4-4f04-ab66-618cc24d4cb6',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'character',
  name: 'Man',
  kind: 'figure',
  about: 'A man brought in whole from VALID: 84 bones, 65 face shapes.',
  made: 'VALID, the Validated Avatar Library for Inclusion and Diversity (Do, Zelenty, Gonzalez-Franco & McMahan 2023, University of Central Florida and Google; MIT licence, characters/figures/LICENSE): its figure White_M_1 in its casual clothes, as converted to glTF by c-frame/valid-avatars-glb. The file is kept unchanged; the light, the moves and the expressions are ours (characters/kit/figure.js).',
  figure: 'White_M_1_Casual',
  file: new URL('./figures/White_M_1_Casual.glb', import.meta.url).href,
  sha256: 'ece0275f5583f5021a71f3df57b3b5e2f142fdd56130a05e91b19085d5e8dc7f',   // the file's own: a changed file is a changed recipe
  from: { library: 'VALID', by: 'c-frame/valid-avatars-glb', at: 'c4719df7a2b60a96cc7f56d67e247674b68c4ea7', licence: 'MIT' },
  height: 1.815,   // as the file stands, in its shoes (the kit measures it when it is read)
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'a grown man standing in his shoes, measured from his soles to the top of his hair',
    typical: [1.65, 1.9],
    most: 2.1,
    source: ['ANSUR II (Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel", NATICK/TR-15/007): men\'s stature, mean 1.756 m, standard deviation 0.069 m (5th to 95th of a hundred: 1.64 to 1.87 m); a shoe\'s heel some 25 mm more'],
    own: ['the figure stands as its makers made it: 1.815 m'],
  },
  walkRound: 1.5,   // the walk goes round the stage this far from its middle (m)
  moves: MOVES.map((m) => m.id),
  expressions: EXPRESSIONS.map((e) => e.id),
  make: (tex, opts) => figureOf(tex, man, opts),   // the figure, read and stood (characters/kit/figure.js)
};
export default man;
