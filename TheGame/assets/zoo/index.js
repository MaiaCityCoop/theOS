// The zoo: every kind of thing the heap draws (src/scatter/heap.js), each brought by a FAMILY: one file in this folder,
// found here by itself (no list kept by hand). A family is a recipe for many kinds at once (ten thousand test shapes,
// a thousand creatures) or for one (a real tree: its few shapes); nobody modelled its kinds and no file holds them.
// To add kinds to the world, add a file here that keeps the contract; nothing of the engine changes.
//
//   export default {
//     id: 'blobs',            its name: stable, its own
//     count: 8000,            how many kinds it brings (numbered 0 … count - 1 inside it)
//     meshOf(i, l)            kind i's mesh at level l of the ladder (assets/kit/ladder.js): { index: Uint32Array,
//                             verts: Uint32Array }, packed as assets/kit/solid.js says: every vertex with its place on
//                             the next coarser level's mesh (a level turns into the next with nothing to see) and the
//                             two bones that move it; no larger than the level's room (ladder.js: roomOf)
//     skinOf(i, size)         its own texture: { levels: [Uint8Array rgba (colours as their square roots, height in
//                             a), … down to one pixel] }, painted to the mean colour its look says
//     lookOf(i)               plain numbers the page reads: { model (a shading model's id, src/shading/*.js, or a
//                             number 0 … 1: any of them), mean and c2 (its two tints, rgb), relief (0 … 1: which of the
//                             world's textures it takes its relief from), scale (metres a tile), gloss, sway (how far it
//                             bends in the wind; 0: stiff), snow, glow, through, size (its largest side, metres),
//                             leaf (cut out as a leaf of so many lobes; 0 or none: solid) }
//     bonesOf?(i)             its skeleton: Float32Array, BONES bones of three rows of four (assets/kit/creature.js
//                             says what a bone is); without: nothing in it moves by itself
//     fullTris?(i)            how many triangles its full mesh has (for the readout)
//     roams?: [{ name, share, speed: [from, to] (m/s), size: [from, to] (m), ring (it keeps to the roads), fly: [from,
//               to] (metres over the ground), stride (of its size, a radian of its gait), first, count }]
//                             its herds: how its kinds move about (kinds first … first + count of it are one herd; share:
//                             how many of a place's movers are of it). Without: its kinds stand.
//   }
//
// What a family makes is the same on every machine at every start: it is made in a worker
// (src/scatter/recipes.worker.js) and kept in the browser under the zoo's fingerprint (src/core/kept.js), so a second
// start builds nothing. Plain JS, no three: the worker reads it and the page reads it.
const FOUND = import.meta.glob(['./*.js', '!./index.js'], { eager: true, import: 'default' });
/** The families: what stands first, then what roams, each by its id; `first`: the number of its first kind. */
export const FAMILIES = (() => {
  let at = 0;
  return Object.values(FOUND).filter((F) => F?.id && F.count > 0).sort((a, b) => (a.roams ? 1 : 0) - (b.roams ? 1 : 0) || (a.id < b.id ? -1 : 1)).map((F) => { const E = { F, id: F.id, first: at, count: F.count, roams: !!F.roams }; at += F.count; return E; });
})();
export const KINDS = FAMILIES.reduce((n, E) => n + E.count, 0), STAND = FAMILIES.reduce((n, E) => n + (E.roams ? 0 : E.count), 0), MOVING = KINDS - STAND;   // (what stands is numbered 0 … STAND - 1, what moves after it)
const of = (k) => { for (const E of FAMILIES) if (k < E.first + E.count) return E; throw new Error(`zoo: no kind ${k}`); };
export const familyOf = (k) => of(k).id;
export const meshOf = (k, l) => { const E = of(k); return E.F.meshOf(k - E.first, l); };
export const skinOf = (k, size) => { const E = of(k); return E.F.skinOf(k - E.first, size); };
export const lookOf = (k) => { const E = of(k); return E.F.lookOf(k - E.first); };
export const bonesOf = (k) => { const E = of(k); return E.F.bonesOf?.(k - E.first) ?? null; };
export const fullTris = (k) => { const E = of(k); return E.F.fullTris?.(k - E.first) ?? 0; };
/** Every herd of every family that roams: its numbers, `first` the number of its first kind, `upTo` where its share
    of a place's movers ends (0 … 1: a number under a herd's upTo and not under the one before's is of it). */
export const HERDS = (() => {
  const all = FAMILIES.filter((E) => E.roams).flatMap((E) => E.F.roams.map((R) => ({ ...R, family: E.id, first: E.first + R.first }))), total = all.reduce((s, R) => s + R.share, 0); let at = 0;
  return all.map((R) => ({ ...R, ring: !!R.ring, fly: R.fly ?? [0, 0], upTo: (at += R.share / total) }));
})();
const REV = 1;   // (raised by hand when a kit changes what it makes in a way the samples below would not show)
/** What the families make, as a word: a few kinds' coarse meshes of each, a small texture, a skeleton, read into one
    number. A recipe changed, it is another word, and what the browser kept under the old one is not read. */
export function fingerprint() {
  let h = 0x811c9dc5 ^ REV;
  const eat = (a) => { for (let i = 0; i < a.length; i++) h = Math.imul(h ^ (a[i] | 0), 0x01000193); };
  for (const E of FAMILIES) {
    eat([E.first, E.count, ...E.id].map((c) => (typeof c === 'string' ? c.charCodeAt(0) : c)));
    for (const i of [0, Math.floor(E.count * 0.43), E.count - 1]) { for (const l of [3, 4, 5]) { const m = E.F.meshOf(i, l); eat(m.index); eat(m.verts); } eat([E.F.fullTris?.(i) ?? 0]); const B = E.F.bonesOf?.(i); if (B) eat(new Int32Array(B.buffer)); }
    eat(E.F.skinOf(Math.floor(E.count / 2), 8).levels[0]);
  }
  return (h >>> 0).toString(36);
}
