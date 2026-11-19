// What a thing's far ends show, on the whole (intent 0038): the albedo its impostor's pictures show (their mean,
// src/detail/impostor.worker.js seenOf), each of its shapes alike, its leaves tinted as its plants are drawn, on the
// whole (src/scatter/trees.js). The colour the land wears where a stand of it is no longer drawn (src/terrain/layers.js
// standColours): measured from the pictures as they are baked, or as the browser kept them.
// A shape's pictures are baked once its finest level has come (a plant of it near: src/scatter/trees.js farOf), or read
// back as the browser kept them; so an asset shows what its first shape in shows, then, once all are, their mean (its
// shapes are its ages and its variants, alike in colour: two changes at most, each laying the far land again).
//
//   shows(asset, shape, shapes, rgb)   shape `shape` of an asset's `shapes` shows rgb (linear albedo)
//   seenOf(asset)                      what the asset shows, the mean of its shapes in ([r, g, b]; null while none is)
//   seenVersion()                      how many times what the assets show has changed
const SHAPES = new Map(), SEEN = new Map();
let version = 0;

/** Shape `shape` of an asset's `shapes` shows rgb ([r, g, b], linear albedo): the asset's, its first shape's, then, once
    every one of them is in, their mean. */
export function shows(asset, shape, shapes, rgb) {
  let S = SHAPES.get(asset);
  if (!S) SHAPES.set(asset, (S = new Map()));
  if (S.has(shape)) return;
  S.set(shape, rgb);
  if (S.size !== 1 && S.size !== shapes) return;
  SEEN.set(asset, [0, 1, 2].map((c) => [...S.values()].reduce((s, v) => s + v[c], 0) / S.size));
  version++;
}
/** What an asset shows far off ([r, g, b], linear albedo; null while none of its shapes is in). */
export const seenOf = (asset) => SEEN.get(asset) ?? null;
/** How many times what the assets show has changed. */
export const seenVersion = () => version;
