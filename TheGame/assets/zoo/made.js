// The made things (intent 0029): every asset that stands at a spot of its own (assets/kit/made.js: isMade), each a kind
// of the heap at its own levels of detail. Found by itself among the assets: a new building is a new file there, and
// nothing here changes. The list placer draws them (src/scatter/placed.js, engine `placed`), the drawer's other make of
// vertex: its levels are the asset's own, not the ladder's, so meshOf(i, l) is its level l.
import { madeKinds, madeMesh, madeLook } from '../kit/made.js';

const FOUND = import.meta.glob(['../*.js', '!../index.js', '!../kinds.js'], { eager: true, import: 'default' });
const MADE = madeKinds(Object.values(FOUND));

export default {
  id: 'made',
  placed: 'placed',
  count: MADE.length,
  made: MADE,   // (the assets themselves, in their kinds' order: what the list placer reads of them)
  meshOf: (i, l) => madeMesh(MADE[i], l),
  lookOf: (i) => madeLook(MADE[i]),
  fullTris: (i) => MADE[i].detail.levels[0].faces.length,
};
