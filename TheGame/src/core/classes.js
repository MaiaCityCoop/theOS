// The frame's classes (intent 0038): what the hard gates are shared out by. Plain JS, no three: the game reads it, and
// so do the recipes' workers.
//
//   SHARE_MB     a share of a class's memory, MB, that a pool is sized by alone (below)
/** A pool a class gives a share of its memory, MB, where the pool's size must follow from that share alone, the same on
    every device and in the recipes' workers: geometry's plants' far ends, the two atlases of their impostors' views and
    their clumps (src/detail/atlas.js atlasesOf). */
export const SHARE_MB = { geometry: { atlases: 512 } };
