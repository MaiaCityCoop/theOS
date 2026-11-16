// The kit's arithmetic, said once. It is plain JS with no three: the recipes' workers use it, and so do the land, the
// city and the trailer on the page. Points and ways are arrays [x, y, z].
export const add = (a, b) => a.map((x, i) => x + b[i]), sub = (a, b) => a.map((x, i) => x - b[i]), mul = (a, s) => a.map((x) => x * s);
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(...a), norm = (a) => mul(a, 1 / (len(a) || 1));
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** t of the way from a to b (a point, or a colour). */
export const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
/** A curved limb through a, bent towards c, to b: n + 1 points. */
export const bez = (a, c, b, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return add(add(mul(a, (1 - t) ** 2), mul(c, 2 * t * (1 - t))), mul(b, t * t)); });
/** x held between lo and hi. */
export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
/** 0 below a, 1 above b, and smooth between (as the GPU's smoothstep). */
export const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
