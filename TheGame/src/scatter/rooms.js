// The solids' rooms on the page (intent 0038): what each level of each solid's cluster hierarchy holds (rooms.json,
// measured from the hierarchies themselves: tools/rooms.js), as the drawers make the heap's places from them
// (src/scatter/rocks.js, src/scatter/placed.js). A level's place is as large as what it holds; a recipe changed since its
// rooms were measured is said, once, and its levels are cut down to fit until they are measured again
// (assets/kit/surface.js: trimmed), never left with a hole.
import ROOMS from '../../rooms.json';
import { versionOf } from '../core/registry.js';
import { roomFrom } from '../../assets/kit/surface.js';

const said = new Set();
/** The rooms of recipe uid's shapes at level l, a shape each, as a drawer takes them (per: the elements a vertex is in
    its heap; surface.js roomFrom): [{ tris, verts, clusters }, …]. */
export function roomsOf(uid, l, per) {
  const R = ROOMS[uid];
  if (!R) throw new Error(`rooms: none measured for '${uid}' (rooms.json: node tools/rooms.js)`);
  if (R.version !== versionOf(uid) && !said.has(uid)) { said.add(uid); console.warn(`rooms: '${R.name}' changed since its rooms were measured (rooms.json): its levels are cut down to fit until they are again`); }
  return R.shapes.map((S) => roomFrom(S[l], per, l));
}
/** The room of band l of a zoo family whose kinds bring their bands (assets/zoo/index.js bandOf; rooms.json's `zoo: id`,
    the most of those measured), as a drawer takes it: { tris, verts, clusters }. A family made another way since (its
    print) is said, once, and its bands cut down to fit until it is measured again. */
export function zooRooms(F, l, per) {
  const R = ROOMS[`zoo: ${F.id}`];
  if (!R) throw new Error(`rooms: none measured for the zoo's '${F.id}' (rooms.json: node tools/rooms.js)`);
  if (R.print !== F.print?.() && !said.has(F.id)) { said.add(F.id); console.warn(`rooms: the zoo's '${F.id}' is made another way since its rooms were measured (rooms.json): its bands are cut down to fit until they are again`); }
  return roomFrom(R.shapes[0][l], per, l);
}
/** The largest of rooms, each number its own most: a place any of them fits. */
export const mostOf = (rooms) => ({ tris: Math.max(1, ...rooms.map((r) => r.tris)), verts: Math.max(1, ...rooms.map((r) => r.verts)), clusters: Math.max(0, ...rooms.map((r) => r.clusters)) });
