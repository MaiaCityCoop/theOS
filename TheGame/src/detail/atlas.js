// The far ends' pictures (intent 0038): what an impostor's views misplace, measured as every rung's error is, in metres
// (src/detail/error.js), and how large the atlases that hold them are. Plain JS: the crowd kit reads it in the recipes'
// workers (assets/kit/crowd.js), the page sizes its atlases by it (src/detail/impostor.js ATLAS). A recipe's version
// holds it (tools/registry.js SHARED).
//
// An impostor (src/detail/impostor.js) is VIEWS x VIEWS pictures of the thing over the half-sphere above, each pixel the
// three views nearest its own ray's way blended, each read where that ray crosses the view's plane through the thing's
// middle (its sphere's). What it shows is off where the thing is by the views' spacing: the eye sees the thing from up to
// an angle a off the views it reads, so what the view saw at z from that plane shows z tan a from where it is, and z is
// at most the sphere's radius r (the farthest any of it lies from the middle, every way). So what a pixel shows lies at
// most r times tan a from where it is: spacingOf(VIEWS) * r. Its bake's texel comes on top (crowd.js). (Until 2026-11-19
// a pixel read the depth where its ray crossed the middle and took one step of parallax by it: what it then showed could
// lie anywhere in the thing's depth, twice that, so the impostor came a third nearer, about 11 px for a 20 m tree
// instead of about 15, the crowd drawn whole the while.)
//
// How large the atlases are follows from that error, the share of memory they are given and the limits every device
// grants (atlasesOf): the views and their texels are chosen where the impostor's error is least for the bytes a far end
// has; a clump's plane is the least picture an atlas keeps.
const { sqrt, acos, tan, cos, sin, min, max, abs, floor, hypot, PI } = Math;

/** A direction (y up) of the square's point (u, v), each -1 … 1: impostor.js dirOf's twin. */
const dirOf = (u, v) => { const x = (u + v) / 2, z = (u - v) / 2, y = max(1 - abs(x) - abs(z), 1e-4), l = hypot(x, y, z); return [x / l, y / l, z / l]; };
/** The square's point of a direction (one under the horizon read as on it): impostor.js squareOf's twin. */
const squareOf = (d) => { const y = max(d[1], 0), s = max(abs(d[0]) + y + abs(d[2]), 1e-6); return [(d[0] + d[2]) / s, (d[0] - d[2]) / s]; };

// ---- a picture's normals (impostor.js facingEnc, facingIn: their twins, for the impostors' worker) ----
/** A way facing its picture (x, y, z: in the picture's frame, z along its way, z ≥ 0) as its texel keeps it, two numbers
    0 … 1, into out: Lambert's equal-area map of the half-sphere, the disc (its filtered texels within a few degrees of
    the mean of their ways where those are near: no fold). */
export const facingCode = (x, y, z, out) => { const l = Math.hypot(x, y, z) || 1, k = 1 / Math.sqrt(1 + max(z / l, 0)); out[0] = (x / l) * k * 0.5 + 0.5; out[1] = (y / l) * k * 0.5 + 0.5; };
/** A texel's two numbers back as its way, into out (facingCode's). */
export const facingWay = (u, v, out) => {
  const X = (u * 2 - 1) * Math.SQRT2, Y = (v * 2 - 1) * Math.SQRT2, r2 = min(X * X + Y * Y, 2), k = sqrt(1 - r2 / 4), x = X * k, y = Y * k, z = 1 - r2 / 2, l = hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
};

const SPACING = new Map();
/** What VIEWS x VIEWS views cost an impostor, at its worst over every way the eye can see the thing from: the blend's sum
    of w tan a over the three views it reads (impostor.js impostorViews: a its angle from the eye's way, w its weight).
    Times the thing's sphere's radius (the farthest any of it lies from the plane each view is read on), how far what
    the impostor shows lies from where it is. Measured on the views
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

// ---- the atlases: what they are made of, and how large ----
/** What an atlas keeps of a texel: three pictures, each a texture of its own so each is filtered as it is
    (impostor.js createAtlas), by its channels, eight bits each: its colour and cover; its data, its way (facingCode),
    depth and light; how much of it is leaf. What its textures are made as, what the worker writes (impostor.worker.js)
    and what a texel costs, all from here. */
export const PICTURES = [{ name: 'colour', channels: 'rgba' }, { name: 'data', channels: 'rgba' }, { name: 'leaf', channels: 'r' }];
/** A texel's bytes: its pictures' channels; MIPS: its smaller pictures under it, a third more. */
const TEXEL = PICTURES.reduce((s, p) => s + p.channels.length, 0), MIPS = 4 / 3;
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

/** What is kept of a view baked at `cell` texels a side: its level under where it has one (atlasesOf, below). */
const storedOf = (cell) => (levelsUnder(cell) ? cell / 2 : cell);
/** The plants' far ends' atlases, sized from what they are given and what every device grants:
      layers   how many far ends the stands bake, a layer of each atlas each (src/scatter/entries.js farLayers)
      bytes    the share they are given, their views and their clumps together (src/core/classes.js SHARE_MB)
      limits   the limits every WebGPU device grants (src/core/gpu.js PORTABLE): what is baked is kept by its key and
               drawn on any device, so its size is the same on every one
      tiles    how many tiles a plane's uv can name (assets/kit/plant.js UV_TILES: what the heap packs it in)
    -> { VIEWS, CELL, STORED, TILE, TILES, CLUMPS, key }
    - a clump's plane is a tile of the least picture, TILE = LEAST: where the clumps stand in their error is within the
      dial, and it counts their texel, a chunk's side over TILE; so a chunk is never more pixels drawn across than its
      tile has texels, and a finer picture of it would never be read;
    - the chunks: as many as the tiles a plane's uv can name hold, three planes each, and the bake's uniforms hold (a
      chunk's cell and box, four vec4: src/scatter/trees.js farOf);
    - the views: what is left of a far end's share once its clumps have theirs, as VIEWS x VIEWS views of CELL texels a
      side, where the impostor's error is least: its texel, 2r / CELL, and its views' spacing, spacingOf(VIEWS) times r
      (r its sphere's radius: half of 2r). A view halves to the least picture (CELL = LEAST to 2 LEAST,
      times a power of two); VIEWS is even (no view looks straight down), and a row of views, baked at SS samples a
      texel, is no wider than every device draws. The share holds what is kept of them, STORED texels a view (below): it
      was planned at CELL, and kept a quarter of that (#230), three quarters of it standing empty. */
export function atlasesOf({ layers, bytes, limits, tiles }) {
  const TILE = LEAST, TILES = tiles, CLUMPS = min(floor((TILES * TILES) / 3), floor(limits.maxUniformBufferBindingSize / 64));
  // (texels a side its kept views may take, of its share; and a row of views as baked, SS samples a texel, as wide as
  // every device draws)
  const views = bytes / max(1, layers) - atlasBytes(TILES * TILE, 1), kept = floor(sqrt(views / (TEXEL * MIPS))), wide = floor(limits.maxTextureDimension2D / SS);
  const cells = [];
  for (let k = 1; LEAST * k <= wide / 2; k *= 2) for (let c = LEAST; c < 2 * LEAST; c++) cells.push(c * k);
  let best = null;
  for (const CELL of cells.sort((a, b) => b - a)) {   // (fewest views first: a texel's error alone, 1 / CELL, then says where none can do better)
    if (best && 1 / CELL >= best.e) break;
    const VIEWS = min(floor(kept / storedOf(CELL) / 2), floor(wide / CELL / 2)) * 2; if (VIEWS < 2) continue;
    const e = 1 / CELL + spacingOf(VIEWS) / 2;   // (in the sphere's widths, 2r: its texel's 1 / CELL, its views' r of it)
    if (!best || e < best.e) best = { e, VIEWS, CELL };
  }
  if (!best) throw new Error(`atlases: ${(bytes / 2 ** 20).toFixed(0)} MiB for ${layers} far ends hold no views`);
  // what is kept of a view, STORED texels a side: the level an impostor is read at where it comes in, and under it. It
  // stands in where its error, its texel's and its views' together, is a dial pixel, and is read a texel a drawn pixel
  // (its texels' level by its size on screen), so there its views' share being about its texel's (as they are chosen
  // above, the least error for the bytes) it reads the level under the bake's: the bake's own finest is never read, and
  // is not kept (three quarters of the bytes). The bake is still CELL texels a side (its level under: a mean of four)
  const { VIEWS, CELL } = best, STORED = storedOf(CELL);
  return { VIEWS, CELL, STORED, TILE, TILES, CLUMPS, key: `${VIEWS}x${CELL}|${TILES}x${TILE}|${CLUMPS}` };
}
