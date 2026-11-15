// What assets/kit/pack.js writes, read on the GPU, bit for bit the other way: the pieces every make's vertex is unpacked
// with (src/scatter/solid.js, plantvert.js, madevert.js).
import { uint, float, vec3, abs, max } from 'three/tsl';

/** m of the bits of x from bit s (a uint node). */
export const bits = (x, s, m) => x.shiftRight(uint(s)).bitAnd(uint(m));
/** The low and the high 16 bits of x, as floats 0 … 65535. */
export const lo16 = (x) => float(x.bitAnd(uint(0xffff))), hi16 = (x) => float(x.shiftRight(uint(16)));
/** 8 bits of x from bit s as 0 … 1 (pack.js: held(v · 255, 255)); sn8, the same as -1 … 1 (sn(v, 255)). */
export const u8 = (x, s) => float(bits(x, s, 255)).div(255), sn8 = (x, s) => u8(x, s).mul(2).sub(1);
/** A colour channel of 8 bits from bit s (pack.js: c8). */
export const c8 = (x, s) => u8(x, s).mul(u8(x, s)).mul(2);
/** A direction from its octahedral map (u, v: -1 … 1; pack.js: oct), not yet of length 1. */
export const octDir = (u, v) => { const z = float(1).sub(abs(u)).sub(abs(v)), k = max(z.negate(), 0); return vec3(u.add(u.greaterThanEqual(0).select(k.negate(), k)), v.add(v.greaterThanEqual(0).select(k.negate(), k)), z); };
