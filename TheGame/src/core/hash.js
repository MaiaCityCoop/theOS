// The one integer hash every node noise is built on (the land's, the painters'): a cell (x, y) and a seed to 32 bits.
// The same in JS for the CPU's land (src/world/land.js), constant for constant.
import { Fn, uint } from 'three/tsl';

export const hashI = Fn(([cx, cy, s]) => {
  const h = uint(cx).mul(uint(0x9E3779B1)).bitXor(uint(cy).mul(uint(0x85EBCA77))).bitXor(uint(s).mul(uint(0xC2B2AE3D))).toVar();
  h.assign(h.bitXor(h.shiftRight(uint(15)))); h.assign(h.mul(uint(0x2C1B3C6D)));
  h.assign(h.bitXor(h.shiftRight(uint(12)))); h.assign(h.mul(uint(0x297A2D39)));
  h.assign(h.bitXor(h.shiftRight(uint(15))));
  return h;
});
