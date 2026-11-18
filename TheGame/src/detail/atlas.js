// The far ends' pictures (intent 0038): what an impostor's views misplace, measured as every rung's error is, in metres
// (src/detail/error.js), and how large the atlases that hold them are. Plain JS: the crowd kit reads it in the recipes'
// workers (assets/kit/crowd.js), the page sizes its atlases by it (src/detail/impostor.js ATLAS). A recipe's version
// holds it (tools/registry.js SHARED).
//
// An impostor (src/detail/impostor.js) is VIEWS x VIEWS pictures of the thing over the half-sphere above, each pixel the
// three views nearest its own ray's way blended, each read with one step of parallax. Two things put what it shows off
// where the thing is, and they are one displacement:
//   - the views' spacing: the eye sees the thing from up to an angle a off the views it reads, so what lies at another
//     depth than the view saw it at shifts by that depth times tan a;
//   - its one step of parallax on one quad: a pixel reads the depth where its ray crosses the thing's middle and shows
//     what the view saw a step away, which can lie anywhere in the thing's depth.
// So what a pixel shows lies at most the thing's depth times tan a from where it is: spacingOf(VIEWS) * depthOf(thing),
// counted once. Its bake's texel comes on top (crowd.js).
//
// How large the atlases are follows from that error, the share of memory they are given and the limits every device
// grants (atlasesOf): the views and their texels are chosen where the impostor's error is least for the bytes a far end
// has; a clump's plane is the least picture an atlas keeps.
const { sqrt, acos, tan, cos, sin, min, max, abs, floor, hypot, PI } = Math;

/** A direction (y up) of the square's point (u, v), each -1 … 1: impostor.js dirOf's twin. */
const dirOf = (u, v) => { const x = (u + v) / 2, z = (u - v) / 2, y = max(1 - abs(x) - abs(z), 1e-4), l = hypot(x, y, z); return [x / l, y / l, z / l]; };
/** The square's point of a direction (one under the horizon read as on it): impostor.js squareOf's twin. */
const squareOf = (d) => { const y = max(d[1], 0), s = max(abs(d[0]) + y + abs(d[2]), 1e-6); return [(d[0] + d[2]) / s, (d[0] - d[2]) / s]; };

const SPACING = new Map();
/** What VIEWS x VIEWS views cost an impostor, at its worst over every way the eye can see the thing from: the blend's sum
    of w tan a over the three views it reads (impostor.js impostorViews: a its angle from the eye's way, w its weight).
    Times the thing's depth (depthOf), how far what the impostor shows lies from where it is. Measured on the views
    themselves: from 8 views on, a triangle of views is at its worst at the middle of its long side, a cell's middle,
    where the two views at its ends weigh half each (eight and twenty-four eyes a view's step find no worse, up to 128
    views), so every cell's middle, corner and sides' middles are its eyes; fewer views are coarse enough that their
    worst lies off it, and are looked at with 24 eyes a step. */
export function spacingOf(views) {
  if (SPACING.has(views)) return SPACING.get(views);
  const at = (i) => (i / (views - 1)) * 2 - 1, D = [];
  for (let j = 0; j < views; j++) for (let i = 0; i < views; i++) D.push(dirOf(at(i), at(j)));
  const n = (views < 8 ? 24 : 2) * (views - 1), last = views - 1 - 1e-4;
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

// ---- the atlases: what they are made of, and how large ----
/** A texel's bytes: two RGBA8 textures, its colour and cover, its way, depth and light (impostor.js createAtlas); MIPS:
    its smaller pictures under it, a third more. */
const TEXEL = 8, MIPS = 4 / 3;
/** The least picture an atlas keeps, texels a side: its smaller pictures go down to it (impostor.worker.js), and one read
    at any of its levels stays inside its own cell (impostor.js inCell). */
export const LEAST = 4;
/** Samples a side a texel is baked from: what it covers is the share of them covered, its leaves' cut-outs read at their
    finest (impostor.js createBaker). */
export const SS = 4;
/** An atlas' bytes: `layers` layers of side x side texels, with their smaller pictures. */
export const atlasBytes = (side, layers) => side * side * layers * TEXEL * MIPS;
/** The smaller pictures a picture of `cell` texels a side has down to the least (its levels after the first). */
export const levelsUnder = (cell) => floor(Math.log2(cell / LEAST) + 1e-9);

/** The plants' far ends' atlases, sized from what they are given and what every device grants:
      layers   how many far ends the stands bake, a layer of each atlas each (src/scatter/rule.js farLayers)
      bytes    the share they are given, their views and their clumps together (src/core/classes.js SHARE_MB)
      limits   the limits every WebGPU device grants (src/core/gpu.js PORTABLE): what is baked is kept by its key and
               drawn on any device, so its size is the same on every one
      tiles    how many tiles a plane's uv can name (assets/kit/plant.js UV_TILES: what the heap packs it in)
    -> { VIEWS, CELL, TILE, TILES, CLUMPS, key }
    - a clump's plane is a tile of the least picture, TILE = LEAST: where the clumps stand in their error is within the
      dial, and it counts their texel, a chunk's side over TILE; so a chunk is never more pixels drawn across than its
      tile has texels, and a finer picture of it would never be read;
    - the chunks: as many as the tiles a plane's uv can name hold, three planes each, and the bake's uniforms hold (a
      chunk's cell and box, four vec4: src/scatter/trees.js farOf);
    - the views: what is left of a far end's share once its clumps have theirs, as VIEWS x VIEWS views of CELL texels a
      side, where the impostor's error is least: its texel, 2r / CELL, and its views' spacing, at most spacingOf(VIEWS)
      times its depth (at most 2r: r its sphere's radius). A view halves to the least picture (CELL = LEAST to 2 LEAST,
      times a power of two); VIEWS is even (no view looks straight down), and a row of views, baked at SS samples a
      texel, is no wider than every device draws. */
export function atlasesOf({ layers, bytes, limits, tiles }) {
  const TILE = LEAST, TILES = tiles, CLUMPS = min(floor((TILES * TILES) / 3), floor(limits.maxUniformBufferBindingSize / 64));
  const views = bytes / max(1, layers) - atlasBytes(TILES * TILE, 1), side = min(floor(sqrt(views / (TEXEL * MIPS))), floor(limits.maxTextureDimension2D / SS));
  const cells = [];
  for (let k = 1; LEAST * k <= side / 2; k *= 2) for (let c = LEAST; c < 2 * LEAST; c++) cells.push(c * k);
  let best = null;
  for (const CELL of cells.sort((a, b) => b - a)) {   // (fewest views first: a texel's error alone, 1 / CELL, then says where none can do better)
    if (best && 1 / CELL >= best.e) break;
    const VIEWS = floor(side / CELL / 2) * 2; if (VIEWS < 2) continue;
    const e = 1 / CELL + spacingOf(VIEWS);
    if (!best || e < best.e) best = { e, VIEWS, CELL };
  }
  if (!best) throw new Error(`atlases: ${(bytes / 2 ** 20).toFixed(0)} MiB for ${layers} far ends hold no views`);
  const { VIEWS, CELL } = best;
  return { VIEWS, CELL, TILE, TILES, CLUMPS, key: `${VIEWS}x${CELL}|${TILES}x${TILE}|${CLUMPS}` };
}
