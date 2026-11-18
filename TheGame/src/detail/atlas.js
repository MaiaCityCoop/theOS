// The far ends' pictures (intent 0038): what an impostor's views misplace, measured as every rung's error is, in metres
// (src/detail/error.js). Plain JS: the crowd kit reads it in the recipes' workers (assets/kit/crowd.js), the made things'
// card on the page (src/detail/index.js). A recipe's version holds it (tools/registry.js SHARED).
//
// An impostor (src/detail/impostor.js) is VIEWS x VIEWS pictures of the thing over the half-sphere above, each pixel the
// three views nearest the eye's way blended, each read with one step of parallax. Two things put what it shows off where
// the thing is, and they are one displacement:
//   - the views' spacing: the eye sees the thing from up to an angle a off the views it reads, so what lies at another
//     depth than the view saw it at shifts by that depth times tan a;
//   - its one step of parallax on one quad: a pixel reads the depth where its ray crosses the thing's middle and shows
//     what the view saw a step away, which can lie anywhere in the thing's depth.
// So what a pixel shows lies at most the thing's depth times tan a from where it is: spacingOf(VIEWS) * depthOf(thing),
// counted once. Its bake's texel comes on top (crowd.js).
const { sqrt, acos, tan, cos, sin, min, max, abs, floor, hypot, PI } = Math;

/** A direction (y up) of the square's point (u, v), each -1 … 1: impostor.js dirOf's twin. */
const dirOf = (u, v) => { const x = (u + v) / 2, z = (u - v) / 2, y = max(1 - abs(x) - abs(z), 1e-4), l = hypot(x, y, z); return [x / l, y / l, z / l]; };
/** The square's point of a direction (one under the horizon read as on it): impostor.js squareOf's twin. */
const squareOf = (d) => { const y = max(d[1], 0), s = max(abs(d[0]) + y + abs(d[2]), 1e-6); return [(d[0] + d[2]) / s, (d[0] - d[2]) / s]; };

const SPACING = new Map();
/** What VIEWS x VIEWS views cost an impostor, at its worst over every way the eye can see the thing from: the blend's sum
    of w tan a over the three views it reads (impostor.js impostorViews: a its angle from the eye's way, w its weight).
    Times the thing's depth (depthOf), how far what the impostor shows lies from where it is. Measured on the views
    themselves, eight eyes a view's step over the whole square: each triangle of views is at its worst near its middle. */
export function spacingOf(views) {
  if (SPACING.has(views)) return SPACING.get(views);
  const at = (i) => (i / (views - 1)) * 2 - 1, D = [];
  for (let j = 0; j < views; j++) for (let i = 0; i < views; i++) D.push(dirOf(at(i), at(j)));
  const n = 8 * (views - 1), last = views - 1 - 1e-4;
  let worst = 0;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const e = dirOf((i / n) * 2 - 1, (j / n) * 2 - 1), s = squareOf(e);
    const gx = min(last, max(0, (s[0] * 0.5 + 0.5) * (views - 1))), gy = min(last, max(0, (s[1] * 0.5 + 0.5) * (views - 1))), cx = floor(gx), cy = floor(gy), fx = gx - cx, fy = gy - cy, up = fx + fy > 1;
    const cells = up ? [[cx + 1, cy + 1, fx + fy - 1], [cx + 1, cy, 1 - fy], [cx, cy + 1, 1 - fx]] : [[cx, cy, 1 - fx - fy], [cx + 1, cy, fx], [cx, cy + 1, fy]];
    let t = 0;
    for (const [a, b, w] of cells) { const d = D[b * views + a]; t += w * tan(acos(min(1, e[0] * d[0] + e[1] * d[1] + e[2] * d[2]))); }
    if (t > worst) worst = t;
  }
  SPACING.set(views, worst);
  return worst;
}

/** How deep a thing is, at its deepest: the most its points reach along any way the eye can see it from (its extent
    along 256 ways over the half-sphere, each with its opposite: its diameter, near enough). P: its points' places
    (x y z), n of them. */
export function depthOf(P, n = P.length / 3) {
  let worst = 0;
  for (let k = 0; k < 256; k++) {
    const y = (k + 0.5) / 256, r = sqrt(1 - y * y), a = k * PI * (3 - sqrt(5)), x = r * cos(a), z = r * sin(a);   // (a golden spiral)
    let lo = Infinity, hi = -Infinity;
    for (let p = 0; p < n * 3; p += 3) { const d = P[p] * x + P[p + 1] * y + P[p + 2] * z; if (d < lo) lo = d; if (d > hi) hi = d; }
    if (hi - lo > worst) worst = hi - lo;
  }
  return worst;
}
