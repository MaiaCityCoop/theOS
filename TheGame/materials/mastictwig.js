// Mastic shoot: one shoot of a mastic's branch end (Pistacia lentiscus), whole, painted once: the branch end's main
// shoot (materials/masticleaf.js) and its compound leaves, nothing beside it, so a card of it can stand anywhere without
// cutting through another's leaves: what a mastic's finest level is made of (assets/kit/tree.js: splayOf), as a holm
// oak's is of its twigs. The same painting as the branch end's, of its main shoot alone (masticleaf.twigs.js).
import { branchOf } from './masticleaf.js';
import { MAIN, LEAF } from './masticleaf.twigs.js';

const MINE = LEAF.filter((F) => F.si === 0);   // (the main shoot's leaves)

export default {
  uid: '419b2f7e-5c2b-484c-ab0e-d3396ab658ac',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Mastic shoot',
  kind: 'foliage',
  about: 'One shoot of compound leaves, whole: the card of the nearest mastic.',
  usedBy: 'mastic bushes, seen close',
  swatch: [0.05, 0.085, 0.035],
  bump: 0.05,
  paint: (uv) => branchOf(uv, [MAIN], MINE),
};
