// A woman brought in whole (intent 0041): with the Man (./man.js) the first pair of figures that are not grown from our
// own numbers. One of VALID's (the Validated Avatar Library for Inclusion and Diversity), kept as the file its makers
// gave, stood in the world by the figure kit (./kit/figure.js): its light, its moves, its face's expressions.
import { figureOf, MOVES, EXPRESSIONS } from './kit/figure.js';

const woman = {
  uid: '672220f1-4a72-4154-b3a6-ce0f8d1cff20',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'character',
  name: 'Woman',
  kind: 'figure',
  about: 'A woman brought in whole from VALID: 84 bones, 65 face shapes.',
  made: 'VALID, the Validated Avatar Library for Inclusion and Diversity (Do, Zelenty, Gonzalez-Franco & McMahan 2023, University of Central Florida and Google; MIT licence, characters/figures/LICENSE): its figure White_F_1 in its casual clothes, as converted to glTF by c-frame/valid-avatars-glb. The file is kept unchanged; the light, the moves and the expressions are ours (characters/kit/figure.js).',
  figure: 'White_F_1_Casual',
  file: new URL('./figures/White_F_1_Casual.glb', import.meta.url).href,
  sha256: '15b5ab009788906fd8e45011fd2f599b368e104691a8201e07cd23bf3e030732',   // the file's own: a changed file is a changed recipe
  from: { library: 'VALID', by: 'c-frame/valid-avatars-glb', at: 'c4719df7a2b60a96cc7f56d67e247674b68c4ea7', licence: 'MIT' },
  height: 1.738,   // as the file stands, in its shoes, to the top of its hair (the kit measures it when it is read)
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'a grown woman standing in her shoes, measured from her soles to the top of her hair',
    typical: [1.52, 1.8],
    most: 2.0,
    source: ['ANSUR II (Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel", NATICK/TR-15/007): women\'s stature, mean 1.629 m, standard deviation 0.064 m (5th to 95th of a hundred: 1.52 to 1.74 m); a shoe\'s sole and the hair some 30 to 50 mm more'],
    own: ['the figure stands as its makers made it: 1.738 m with its shoes and its hair, a tall woman'],
  },
  walkRound: 1.5,   // the walk goes round the stage this far from its middle (m)
  moves: MOVES.map((m) => m.id),
  expressions: EXPRESSIONS.map((e) => e.id),
  make: (tex, opts) => figureOf(tex, woman, opts),   // the figure, read and stood (characters/kit/figure.js)
};
export default woman;
