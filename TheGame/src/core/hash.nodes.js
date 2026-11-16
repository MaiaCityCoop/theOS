// The hashes of src/core/hash.js on the GPU, constant for constant (its numbers are read from there).
import { Fn, uint } from 'three/tsl';
import { HX, HY, HZ, M1, M2, F1, F2 } from './hash.js';

/** A cell (x, y) and a seed to 32 bits: the one integer hash every node noise is built on (the land's, the painters'). */
export const hashI = Fn(([cx, cy, s]) => {
  const h = uint(cx).mul(uint(HX)).bitXor(uint(cy).mul(uint(HY))).bitXor(uint(s).mul(uint(HZ))).toVar();
  h.assign(h.bitXor(h.shiftRight(uint(15)))); h.assign(h.mul(uint(M1)));
  h.assign(h.bitXor(h.shiftRight(uint(12)))); h.assign(h.mul(uint(M2)));
  h.assign(h.bitXor(h.shiftRight(uint(15))));
  return h;
});
/** 32 bits stirred (MurmurHash3's finish), as fmix. */
export const fmixN = (k) => {
  k = k.bitXor(k.shiftRight(uint(16))).mul(uint(F1)); k = k.bitXor(k.shiftRight(uint(13))).mul(uint(F2));
  return k.bitXor(k.shiftRight(uint(16)));
};
