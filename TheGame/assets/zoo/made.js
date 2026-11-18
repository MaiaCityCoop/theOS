// The made things (intent 0029): every asset that stands at a spot of its own (assets/kit/made.js: isMade), each a kind
// of the heap at its own levels of detail. Found by itself among the assets: a new building is a new file there, and
// nothing here changes. The list placer draws them (src/scatter/placed.js, engine `placed`), the drawer's other make of
// vertex: meshOf(i, l) is level l of its cluster hierarchy, built from its faces alone (assets/kit/made.js).
import { madeKinds, madeMesh, madeLook } from '../kit/made.js';

const FOUND = import.meta.glob(['../*.js', '!../index.js', '!../kinds.js'], { eager: true, import: 'default' });
const MADE = madeKinds(Object.values(FOUND));

export default {
  id: 'made',
  placed: 'placed',
  count: MADE.length,
  made: MADE,   // (the assets themselves, in their kinds' order: what the list placer reads of them)
  meshOf: (i, l, room) => madeMesh(MADE[i], l, room),
  lookOf: (i) => madeLook(MADE[i]),
  fullTris: (i) => MADE[i].faces.length,
};
