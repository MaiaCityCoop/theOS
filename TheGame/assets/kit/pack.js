// How a vertex is written into whole numbers, said once. It is plain JS with no three: the kits pack with it (solid.js,
// plant.js, made.js), the store packs a thing's colour with it (src/world/things.js), and the GPU reads it back bit for
// bit the other way (src/scatter/unpack.js).
//
//   held(v, n)          v rounded to a whole number and held in 0 … n
//   sn(v, n)            a number -1 … 1 as 0 … n
//   sc(v, h)            a number -1 … 1 as 0 … 2h, 0 exactly h (a way that must keep its middle: none, exactly)
//   q16(v, lo, ext)     a place along lo … lo + ext in 16 bits
//   c8(v)               a colour channel 0 … 2 in 8 bits: the square root of half of it (a tint over a material may be
//                       over 1, and dark colours keep their steps)
//   oct(x, y, z)        a direction as two numbers -1 … 1, its octahedral map, folded over where z < 0: into OCT
//   unoct(u, v)         and back, as [x, y, z] of length 1 (for tests; the GPU's is src/scatter/unpack.js)
export const held = (v, n) => Math.max(0, Math.min(n, Math.round(v)));
export const sn = (v, n) => held((v * 0.5 + 0.5) * n, n);
export const sc = (v, h) => Math.max(-h, Math.min(h, Math.round(v * h))) + h;
export const q16 = (v, lo, ext) => held(((v - lo) / ext) * 65535, 65535);
export const c8 = (v) => held(Math.sqrt(Math.max(0, Math.min(2, v)) / 2) * 255, 255);
/** What oct wrote last: [u, v] (one pair for every call, so a kit packing millions makes no litter). */
export const OCT = [0, 0];
export const oct = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1, m = (Math.abs(x) + Math.abs(y) + Math.abs(z)) / l || 1; let u = x / l / m, v = y / l / m;
  if (z < 0) { const u0 = u; u = (1 - Math.abs(v)) * (u0 >= 0 ? 1 : -1); v = (1 - Math.abs(u0)) * (v >= 0 ? 1 : -1); }
  OCT[0] = u; OCT[1] = v; return OCT;
};
export const unoct = (u, w) => { const z = 1 - Math.abs(u) - Math.abs(w), k = Math.max(-z, 0), x = u + (u >= 0 ? -k : k), y = w + (w >= 0 ? -k : k), l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
