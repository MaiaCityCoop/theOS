// The hashes every part of the game shares, in plain JS (no three: the recipes' workers use them too). Each is written
// once, here; src/core/hash.nodes.js is the same on the GPU, constant for constant, where the GPU needs one.
//
//   hashI(x, y, s)        a cell (x, y) and a seed to 32 bits: what every noise of the land and the painters is built on
//   hash4(x, y, z, s)     the same for a cell in space (the rocks' and blobs' noise: assets/kit/blob.js)
//   rnd(x, y, s)          hashI as a number 0 … 1 (24 bits)
//   fmix(h)               32 bits stirred (MurmurHash3's finish): a thing's key (src/world/things.js)
//   fnv(h, v), fnvOf(s)   FNV-1a, a step (32-bit numbers into h, from FNV) and a word: fingerprints of what was made
//   rng(seed)             a stream of numbers 0 … 1 from a seed (mulberry32): a recipe's own dice
//   lcg(seed)             an older stream (a linear congruence): the fire pit's and its flame's, kept so they stand as
//                         they always have

export const HX = 0x9E3779B1, HY = 0x85EBCA77, HZ = 0xC2B2AE3D, HW = 0x27D4EB2F, M1 = 0x2C1B3C6D, M2 = 0x297A2D39;
/** The land's finish: 32 bits stirred. */
export const mix32 = (h) => { h ^= h >>> 15; h = Math.imul(h, M1); h ^= h >>> 12; h = Math.imul(h, M2); return (h ^ (h >>> 15)) >>> 0; };
export const hashI = (x, y, s) => mix32(Math.imul(x, HX) ^ Math.imul(y, HY) ^ Math.imul(s, HZ));
export const hash4 = (x, y, z, s) => mix32(Math.imul(x, HX) ^ Math.imul(y, HY) ^ Math.imul(z, HZ) ^ Math.imul(s, HW));
export const rnd = (x, y, s) => (hashI(x, y, s) >>> 8) / 16777216;

export const F1 = 0x85ebca6b, F2 = 0xc2b2ae35;
export const fmix = (h) => { h ^= h >>> 16; h = Math.imul(h, F1); h ^= h >>> 13; h = Math.imul(h, F2); return (h ^ (h >>> 16)) >>> 0; };

export const FNV = 0x811c9dc5;
/** One step of FNV-1a: v (a 32-bit number) into h. The caller ends with `>>> 0`. */
export const fnv = (h, v) => Math.imul(h ^ v, 0x01000193);
/** A word to 32 bits (FNV-1a over its characters). */
export const fnvOf = (s, h = FNV) => { for (let i = 0; i < s.length; i++) h = fnv(h, s.charCodeAt(i)); return h >>> 0; };

/** A stream of numbers 0 … 1 from a seed (mulberry32): each call the next. */
export const rng = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/** The older stream of numbers 0 … 1 from a seed (a linear congruence: assets/firepit.js, assets/flame.js). */
export const lcg = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
