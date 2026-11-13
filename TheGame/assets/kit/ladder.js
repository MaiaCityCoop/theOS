// The ladder: the levels of detail every solid kind of the heap brings (src/scatter/heap.js), finest first. A level is
// drawn while the thing is larger on screen than its `px` (and no larger than the level before's); its mesh is no larger
// than its room (roomOf: what the heap's slot of that level holds). Plain numbers, no three: the recipes read them in
// their worker, the stand on the page.
//
//   n      the squares along a cube's edge a ball of that level is cut into (12 n² triangles: the room's measure);
//          FULLN: the kind's own full mesh (50 000 to 200 000 triangles); DOTN: its dot, one triangle
//   px     the size on screen it is drawn down to
//   delta  how far, at most, a vertex of it lies from its place on the next coarser level's mesh (of the thing's own
//          size, 1): the range its packed way there is kept in (assets/kit/solid.js); 0: it has none
export const FULLN = -1, DOTN = -2, FULL = 129;   // FULL: the most squares an edge a full mesh has
export const LADDER = [
  { n: FULLN, px: 400, delta: 0.07 },
  { n: 32, px: 128, delta: 0.08 },
  { n: 16, px: 64, delta: 0.28 },
  { n: 8, px: 32, delta: 0.3 },
  { n: 4, px: 16, delta: 0.5 },
  { n: 2, px: 8, delta: 0.5 },
  { n: 1, px: 4, delta: 0 },
  { n: DOTN, px: 1.15, delta: 0 },
];
/** triangles and vertices of a ball of n squares an edge (under 1: a dot) */
export const trisOf = (n) => (n > 0 ? 12 * n * n : 1), vertsOf = (n) => (n > 0 ? 6 * n * n + 2 : 3);
/** The most a level's mesh may be: { tris, verts }. */
export const roomOf = (l) => { const n = LADDER[l].n === FULLN ? FULL : LADDER[l].n; return { tris: trisOf(n), verts: vertsOf(n) }; };
/** The next coarser level a level turns into (its mesh's `n`), or 0: none (a cube turns into nothing, a dot is a dot). */
export const underOf = (l) => (l + 1 < LADDER.length && LADDER[l + 1].n > 0 ? LADDER[l + 1].n : 0);
