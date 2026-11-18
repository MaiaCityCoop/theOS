// What the skin's light is read from (intent 0041), worked out once as the skin is laid (./build.js) and kept with it:
// two small pictures, made by this code from published numbers, none drawn or scanned. Plain JS, no three.
//
//   scatterMap() -> { w, h, data }   how much light a point of skin gives back, by how it faces the light (across:
//       the cosine of the angle between its normal and the light, -1 … 1) and how sharply the surface curves there
//       (down: sqrt(curvature / CURVE_MOST), flat at the top). Light that enters skin comes out again a little way
//       off, red furthest; on a flat place that changes nothing, round a finger or the nose's wing it carries red
//       light past the edge of the shade (Penner & Borshukov 2011, "Pre-integrated skin shading"). Three numbers a
//       cell (red, green, blue), 0 … 255 for 0 … 1.
//   microMap() -> { w, h, span, data }   the skin's fine relief on a tile `span` metres a side that repeats: the
//       furrows between its small fields and the pores where they meet. Red and green its slope (128: level), blue how
//       deep it lies (255: the fields' tops).
//   noise3(x, y, z) -> -1 … 1   a smooth noise of a place, for what varies over the body (./build.js: its tone)
import { CURVE_MOST } from './art.js';

/** How far light spreads under skin: six bells (variance in mm², and each colour's share), the fit to light measured
    through skin's three layers (d'Eon, Luebke & Enderton 2007, GPU Gems 3 ch. 14), as it stands in the shaders that
    ship it (Jimenez's SeparableSSS.h; Godot 4). Red's shares spread 1.18 mm on the whole, green's 0.26, blue's 0.16. */
const SCATTER = [
  [0.0064, [0.233, 0.455, 0.649]], [0.0484, [0.100, 0.336, 0.344]], [0.187, [0.118, 0.198, 0.000]],
  [0.567, [0.113, 0.007, 0.007]], [1.99, [0.358, 0.004, 0.000]], [7.41, [0.078, 0.000, 0.000]],
];

export function scatterMap(w = 64, h = 32) {
  const data = new Uint8Array(w * h * 4), NA = 40, NB = 20;
  for (let j = 0; j < h; j++) {
    const k = (j / (h - 1)) ** 2 * CURVE_MOST, r = k > 1e-6 ? 1 / k : Infinity, row = new Float64Array(w * 3);
    for (const [v, share] of SCATTER) {
      // On a ball r mm round, the light gathered at a point from all round it: each place weighed by how far off it
      // lies through the skin (the bell), lit by how it faces the light. Places an angle a off, as far as four
      // widths of the bell; b round the point.
      const amax = r === Infinity ? 0 : 2 * Math.asin(Math.min(1, (4 * Math.sqrt(v)) / (2 * r)));
      for (let i = 0; i < w; i++) {
        const c = -1 + (2 * i) / (w - 1), s = Math.sqrt(1 - c * c); let sum = 0, all = 0;
        if (amax < 1e-4) { sum = Math.max(0, c); all = 1; } else for (let ia = 0; ia < NA; ia++) {
          const a = ((ia + 0.5) / NA) * amax, d = 2 * r * Math.sin(a / 2), g = Math.exp(-(d * d) / (2 * v)) * Math.sin(a), ca = Math.cos(a), sa = Math.sin(a);
          for (let ib = 0; ib < NB; ib++) { const b = ((ib + 0.5) / NB) * Math.PI; sum += g * Math.max(0, c * ca + s * sa * Math.cos(b)); all += g; }
        }
        const lit = sum / all; for (let ch = 0; ch < 3; ch++) row[i * 3 + ch] += share[ch] * lit;
      }
    }
    for (let i = 0; i < w; i++) { for (let ch = 0; ch < 3; ch++) data[(j * w + i) * 4 + ch] = Math.round(255 * Math.min(1, row[i * 3 + ch])); data[(j * w + i) * 4 + 3] = 255; }
  }
  return { w, h, data };
}

// a number 0 … 1 of a whole-numbered place
const hash = (x, y, z = 0) => { let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const ease = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), u = ease(x - i), v = ease(y - j), w = ease(z - k);
  let s = 0; for (let n = 0; n < 8; n++) { const a = n & 1, b = (n >> 1) & 1, c = (n >> 2) & 1; s += (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w) * hash(i + a, j + b, k + c); }
  return s * 2 - 1;
}

/** The skin's fine relief: its surface is small fields, half a millimetre to a millimetre across, between fine
    furrows, and finer ones inside them; a pore where furrows meet. Drawn as cells round scattered points (the tile
    repeats): the furrows where a place is as near a second point as its first. */
export function microMap(n = 256, span = 0.024) {
  const height = new Float32Array(n * n);
  // (cells of `cells` a side, a point in each; a place's distance to its nearest and second nearest point, across the tile's edge too)
  const layer = (cells, seed, depth, width, pores) => {
    const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells);
    for (let c = 0; c < cells * cells; c++) { px[c] = hash(c, seed, 1) * 0.8 + 0.1; py[c] = hash(c, seed, 2) * 0.8 + 0.1; }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = (x / n) * cells, fy = (y / n) * cells, cx = Math.floor(fx), cy = Math.floor(fy); let d1 = 9, d2 = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j, c = (((gx % cells) + cells) % cells) + cells * (((gy % cells) + cells) % cells), dx = gx + px[c] - fx, dy = gy + py[c] - fy, d = Math.hypot(dx, dy);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1, furrow = 1 - ease(Math.min(1, edge / width));   // (1 in a furrow's bed)
      height[y * n + x] -= depth * furrow + (pores ? pores * ease(Math.max(0, 1 - d1 / 0.16)) : 0);   // (and a pore at a field's own point, here and there by its depth)
    }
  };
  layer(28, 11, 0.6, 0.22, 0.25); layer(72, 23, 0.4, 0.3, 0);
  let lo = Infinity, hi = -Infinity; for (const v of height) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const data = new Uint8Array(n * n * 4), at = (x, y) => height[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) / 2, dy = (at(x, y + 1) - at(x, y - 1)) / 2, o = (y * n + x) * 4;
    data[o] = Math.max(0, Math.min(255, Math.round(128 - dx * 300))); data[o + 1] = Math.max(0, Math.min(255, Math.round(128 - dy * 300)));
    data[o + 2] = Math.round(255 * ((at(x, y) - lo) / (hi - lo))); data[o + 3] = 255;
  }
  return { w: n, h: n, span, data };
}
