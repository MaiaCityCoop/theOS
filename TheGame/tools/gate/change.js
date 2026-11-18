// The change detail made in one frame of a path (tools/gate.js motion), in a worker of its own: check 4 of intent 0038,
// ((LOD − truth) now) − ((LOD − truth) a frame before), seen as FLIP sees it.
//
// The frame as the game drew it now, L, is held against what it would have been had it changed only as the truth did:
// B = L before + (truth now − truth before). L − B is then exactly the difference of the two differences, and FLIP of L
// against B is how visible that is, in the picture as it was drawn (its light, its colours and edges masking it). What the
// camera's move did to the picture, the wind, the clouds and the clock, the truth did too, so it falls out of B; what is
// left is what detail did: a level that switched, a page that came, a crowd thinned, a hand-over. B is held to the bytes'
// range, so a change past it is counted as far as it goes.
//
// A message: { i, w, h, L, Lb, R, Rb } (RGBA bytes, SharedArrayBuffers: L and R this frame's, Lb and Rb the frame before's).
// The answer: { i, mean, p99, worst: { value, x, y, size }, look } – the error map's mean, its 32-pixel tiles' 99th
// percentile and worst – and, for the filmstrip, `look`: the frame small (THUMB wide), and the 128-pixel squares round
// its worst tile at full size: LOD before, LOD now, truth before, truth now, and FLIP's heat map of the change.
import { parentPort } from 'node:worker_threads';
import { flip, tiles, heat } from './flip.js';

export const THUMB = 640, CROP = 128;

parentPort?.on('message', ({ i, w, h, L, Lb, R, Rb }) => {
  try {
    const n = w * h, l = new Uint8Array(L), lb = new Uint8Array(Lb), r = new Uint8Array(R), rb = new Uint8Array(Rb), b = new Uint8Array(n * 3);
    for (let p = 0, q = 0; p < n * 4; p += 4, q += 3) for (let c = 0; c < 3; c++) { const v = lb[p + c] + r[p + c] - rb[p + c]; b[q + c] = v < 0 ? 0 : v > 255 ? 255 : v; }
    const err = flip({ width: w, height: h, data: b, channels: 3 }, { width: w, height: h, data: l, channels: 4 }), t = tiles(err, w, h);
    parentPort.postMessage({ i, mean: t.mean, p99: t.p99, worst: t.worst, look: look(w, h, t.worst, { l, lb, r, rb, err }) });
  } catch (e) { parentPort.postMessage({ i, error: String(e?.stack ?? e) }); }
});

/** What the filmstrip shows of a frame: the frame THUMB wide (an average of each block of the picture's pixels), and
    the CROP-pixel squares round the worst tile, RGB bytes each. */
function look(w, h, worst, { l, lb, r, rb, err }) {
  const k = w / THUMB, tw = THUMB, th = Math.round(h / k), small = new Uint8Array(tw * th * 3);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.floor((x + 1) * k)), y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.floor((y + 1) * k));
    let s0 = 0, s1 = 0, s2 = 0, m = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = 4 * (yy * w + xx); s0 += l[o]; s1 += l[o + 1]; s2 += l[o + 2]; m++; }
    const o = 3 * (y * tw + x); small[o] = s0 / m; small[o + 1] = s1 / m; small[o + 2] = s2 / m;
  }
  const cx = Math.max(0, Math.min(w - CROP, worst.x + worst.size / 2 - CROP / 2)), cy = Math.max(0, Math.min(h - CROP, worst.y + worst.size / 2 - CROP / 2));
  const crop = (src) => { const out = new Uint8Array(CROP * CROP * 3); for (let y = 0; y < CROP; y++) for (let x = 0; x < CROP; x++) { const o = 4 * ((cy + y) * w + cx + x), d = 3 * (y * CROP + x); out[d] = src[o]; out[d + 1] = src[o + 1]; out[d + 2] = src[o + 2]; } return out; };
  const e = new Float32Array(CROP * CROP); for (let y = 0; y < CROP; y++) e.set(err.subarray((cy + y) * w + cx, (cy + y) * w + cx + CROP), y * CROP);
  const tile = { x: worst.x - cx, y: worst.y - cy, size: worst.size };
  return { thumb: { w: tw, h: th, rgb: small }, at: [cx, cy], crops: [crop(lb), crop(l), crop(rb), crop(r), heat(e, CROP, CROP, tile)], tile };
}
