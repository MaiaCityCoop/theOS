// The hashes of src/core/hash.js on the GPU, constant for constant (its numbers are read from there).
import { Fn, uint } from 'three/tsl';
import { HX, HY, HZ, M1, M2, F1, F2 } from './hash.js';

/** A cell (x, y) and a seed to 32 bits: the one integer hash every node noise is built on (the land's, the painters').
    A function of the shader's own (its layout), written once in each shader that hashes, not again at every call: the
    land's noises call it hundreds of times (intent 0038). (int and uint pass as each other's bits: the same hash.) */
export const hashI = Fn(([cx, cy, s]) => {
  const h = uint(cx).mul(uint(HX)).bitXor(uint(cy).mul(uint(HY))).bitXor(uint(s).mul(uint(HZ))).toVar();
  h.assign(h.bitXor(h.shiftRight(uint(15)))); h.assign(h.mul(uint(M1)));
  h.assign(h.bitXor(h.shiftRight(uint(12)))); h.assign(h.mul(uint(M2)));
  h.assign(h.bitXor(h.shiftRight(uint(15))));
  return h;
}).setLayout({ name: 'hashI', type: 'uint', inputs: [{ name: 'cx', type: 'int' }, { name: 'cy', type: 'int' }, { name: 's', type: 'uint' }] });
/** 32 bits stirred (MurmurHash3's finish), as fmix. */
export const fmixN = (k) => {
  k = k.bitXor(k.shiftRight(uint(16))).mul(uint(F1)); k = k.bitXor(k.shiftRight(uint(13))).mul(uint(F2));
  return k.bitXor(k.shiftRight(uint(16)));
};
