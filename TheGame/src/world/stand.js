// A biome's stand of trees, as every part of the world that asks reads it: which kinds of tree grow there, and each
// one's slice of the stand (its cells are shared out: one tree a cell, a kind leading where a slow noise falls in its
// slice: src/world/noise.nodes.js leadAt). The trees' engine places by it; the land lays each kind's litter by it.
import { mix } from 'three/tsl';
import { recipes, recipe } from '../core/registry.js';

/** The kinds of tree that grow in a biome's stand (assets the trees' engine places there; `stand`: which of the biome's
    stands, its `trees` unless a kind's placement names another), in the order of their uids, each with its slice
    [from, to) of 0..1 (its placement's `share` of the whole). */
export function kindsOf(biomeUid, stand = 'trees') {
  const kin = recipes('asset').filter((o) => o.placement?.engine === 'trees' && o.placement.biome === biomeUid && (o.placement.stand ?? 'trees') === stand).sort((x, y) => (x.uid < y.uid ? -1 : 1));
  const total = Math.max(1, kin.reduce((t, o) => t + (o.placement.share ?? 1), 0));
  let at = 0;
  return kin.map((asset) => { const from = at / total; at += asset.placement.share ?? 1; return { asset, slice: [from, at / total] }; });
}

/** Where in its stand a kind likes to grow, as node code (({ p }) -> 0..1), or null: everywhere. Its placement says it
    in numbers, { field, from, to }: `from` where its biome's field of that name is 0, `to` where it is 1 (biomes/*.js:
    `fields`; the pine forest's `glade`, how open the wood is). Numbers, not node code: an asset's file is read by the
    recipes' workers too, where nothing of the page is. */
export const whereOf = (asset) => {
  const W = asset.placement?.where; if (!W) return null;
  if (typeof W === 'function') return W;
  const f = recipe(asset.placement.biome)?.fields?.[W.field]; if (!f) throw new Error(`${asset.name}: its biome has no field '${W.field}'`);
  return ({ p }) => mix(W.from, W.to, f(p));
};
