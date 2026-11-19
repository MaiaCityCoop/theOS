// The first person of the library: a settler of the meadow in a dyed linen shirt, denim trousers and leather shoes.
// Made from walker kind 26 of the stress stand (assets/kit/creature.js, rig 'walker', the kind with arms and nothing
// grown on it): its legs, build, head and lean are that kind's own numbers; its skeleton and skin are the human kit's
// (./kit/human.js), its cloth the world's own baked materials. A character is a recipe like any other (src/core/registry.js).
import { humanOf, MOVES } from './kit/human.js';
import { PERSON } from '../world/scale.js';

const settler = {
  uid: '944dc52a-5094-480c-9396-5ceedbbf03b1',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'character',
  name: 'Settler',
  kind: 'human',
  about: 'One of the first on the meadow: a shirt of sage-dyed homespun linen, denim trousers with a turned hem, a leather belt and shoes.',
  from: { rig: 'walker', kind: 26 },   // the stress stand's walker it is made from (assets/kit/creature.js: RIGS[0], kind 26)
  height: PERSON.stature,   // the reference body's (world/scale.js)
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'a grown person: the Settler is the reference body, 1.74 m',
    typical: [1.6, 1.8],
    most: 2.0,
    source: ['ANSUR II (Gordon et al. 2014, "2012 Anthropometric Survey of U.S. Army Personnel", NATICK/TR-15/007): mean stature 1.629 m (women), 1.756 m (men); the Settler\'s 1.74 m between them'],
  },
  walkRound: 1.5,   // the walk goes round the stage this far from its middle (m)
  wears: {
    shirt: { material: '3cb68f1f-a92d-4adf-bb8e-838abf352389', dye: [0.62, 0.78, 0.6] },   // linen weave, dyed sage
    trousers: { material: '5f430c04-8942-442c-ac6a-b5c958cc887a' },                         // denim twill
    hair: { material: '60d88699-64f9-4484-9a00-2980f5eeedd5', tint: [0.85, 0.82, 0.8] },    // hair, a shade darker still
    skin: [0.5, 0.33, 0.24],      // linear albedo: a warm, sun-touched tone
    shoes: [0.16, 0.09, 0.055],   // leather (and the belt), linear
  },
  moves: MOVES.map((m) => m.id),
  make: (tex, opts) => humanOf(tex, settler, opts),   // the person, built (characters/kit/human.js)
};
export default settler;
