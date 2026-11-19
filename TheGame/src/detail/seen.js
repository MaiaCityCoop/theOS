// What a thing's far ends show, on the whole (intent 0038): the albedo its impostor's pictures show, their mean as the
// bake gives them (their least level: src/scatter/trees.js farOf seenIn), each of its shapes alike, its leaves tinted as
// its plants are drawn, on the whole. The colour the land wears where a stand of it is no longer drawn (src/terrain/layers.js
// standColours): measured from the pictures as they are baked, or as the browser kept them.
// A shape's pictures are baked once its finest level has come (a plant of it near: src/scatter/trees.js farOf), or read
// back as the browser kept them; so an asset shows what its first shape in shows, then, once all are, their mean (its
// shapes are its ages and its variants, alike in colour: two changes at most, each laying the far land again).
//
// And how much of its own round its crown covers, seen from straight above (its shapes' mean, as its colour): what a
// metre of its crowns takes of the light (src/terrain/layers.js crownsAt).
//
//   shows(asset, shape, shapes, rgb, cover)   shape `shape` of an asset's `shapes` shows rgb (linear albedo), its crown
//                                             covering `cover` of its round from above (0 … 1; null: no crown seen)
//   seenOf(asset)                             what the asset shows, the mean of its shapes in ([r, g, b]; null while none is)
//   crownOf(asset)                            how much of its round its crown covers, the mean of its shapes in (null: none)
//   seenVersion()                             how many times what the assets show has changed
const SHAPES = new Map(), SEEN = new Map(), CROWN = new Map();
let version = 0;

/** Shape `shape` of an asset's `shapes` shows rgb ([r, g, b], linear albedo), its crown covering `cover` of its round
    from above: the asset's, its first shape's, then, once every one of them is in, their mean. */
export function shows(asset, shape, shapes, rgb, cover = null) {
  let S = SHAPES.get(asset);
  if (!S) SHAPES.set(asset, (S = new Map()));
  if (S.has(shape)) return;
  S.set(shape, { rgb, cover });
  if (S.size !== 1 && S.size !== shapes) return;
  const all = [...S.values()], covers = all.map((v) => v.cover).filter((c) => c != null);
  SEEN.set(asset, [0, 1, 2].map((c) => all.reduce((s, v) => s + v.rgb[c], 0) / all.length));
  if (covers.length) CROWN.set(asset, covers.reduce((s, c) => s + c, 0) / covers.length);
  version++;
}
/** How much of its own round an asset's crown covers seen from straight above (0 … 1; null while none of its shapes is in). */
export const crownOf = (asset) => CROWN.get(asset) ?? null;
/** What an asset shows far off ([r, g, b], linear albedo; null while none of its shapes is in). */
export const seenOf = (asset) => SEEN.get(asset) ?? null;
/** How many times what the assets show has changed. */
export const seenVersion = () => version;
