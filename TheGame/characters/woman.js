// A woman brought in whole (intent 0043): with the Man (./man.js) the first pair of figures that are not grown from our
// own numbers. One of VALID's (the Validated Avatar Library for Inclusion and Diversity), kept as the file its makers
// gave, stood in the world by the figure kit (./kit/figure.js): its light, its moves, its face's expressions.
import { figure } from './kit/figure.js';

export default figure({
  uid: '672220f1-4a72-4154-b3a6-ce0f8d1cff20',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'character',
  name: 'Woman',
  sex: 'woman',   // whose stature it is measured against (src/world/physics.js STATURE)
  about: 'A woman brought in whole from VALID: 84 bones, 65 face shapes.',
  made: 'VALID, the Validated Avatar Library for Inclusion and Diversity (Do, Zelenty, Gonzalez-Franco & McMahan 2023, University of Central Florida and Google; MIT licence, characters/figures/LICENSE): its figure White_F_1 in its casual clothes, as converted to glTF by c-frame/valid-avatars-glb. The file is kept unchanged; the light, the moves and the expressions are ours (characters/kit/figure.js).',
  figure: 'White_F_1_Casual',
  file: new URL('./figures/White_F_1_Casual.glb', import.meta.url).href,
  sha256: '15b5ab009788906fd8e45011fd2f599b368e104691a8201e07cd23bf3e030732',   // the file's own: a changed file is a changed recipe
  from: { library: 'VALID', by: 'c-frame/valid-avatars-glb', at: 'c4719df7a2b60a96cc7f56d67e247674b68c4ea7', licence: 'MIT' },
  // what a real one measures, and where that is known from (world/scale.js: the scale it is read against; the numbers the kit's, from the survey's)
  measure: {
    real: 'a grown woman standing in her shoes, measured from her soles to the top of her hair',
    source: ['ANSUR II (Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel", NATICK/TR-15/007): the stature of grown women, from the first to the last of a hundred (src/world/physics.js STATURE)'],
    own: ['the figure stands as its makers made it: 1.738 m with its shoes and its hair, a tall woman'],
  },
});
