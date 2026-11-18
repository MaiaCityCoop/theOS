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
// A message: { i, w, h, L, Lb, R, Rb, thumb } (RGBA bytes, SharedArrayBuffers: L and R this frame's, Lb and Rb the frame
// before's; thumb: how wide the filmstrip draws the frame, tools/gate/motion.js thumbOf). The answer: { i, mean, p99,
// worst: { value, x, y, size }, look } – the error map's mean, its 32-pixel tiles' 99th percentile and worst – and, for
// the filmstrip, `look`: the frame small (thumb wide), and the squares round its worst tile at full size, the tile and
// the ring of tiles round it: LOD before, LOD now, truth before, truth now, and FLIP's heat map of the change.
import { parentPort } from 'node:worker_threads';
import { flip, tiles, heat } from './flip.js';
import { shrink, square } from './sheet.js';

parentPort?.on('message', ({ i, w, h, L, Lb, R, Rb, thumb }) => {
  try {
    const n = w * h, l = new Uint8Array(L), lb = new Uint8Array(Lb), r = new Uint8Array(R), rb = new Uint8Array(Rb), b = new Uint8Array(n * 3);
    for (let p = 0, q = 0; p < n * 4; p += 4, q += 3) for (let c = 0; c < 3; c++) { const v = lb[p + c] + r[p + c] - rb[p + c]; b[q + c] = v < 0 ? 0 : v > 255 ? 255 : v; }
    const err = flip({ width: w, height: h, data: b, channels: 3 }, { width: w, height: h, data: l, channels: 4 }), t = tiles(err, w, h);
    parentPort.postMessage({ i, mean: t.mean, p99: t.p99, worst: t.worst, look: look(w, h, t.worst, { l, lb, r, rb, err }, thumb) });
  } catch (e) { parentPort.postMessage({ i, error: String(e?.stack ?? e) }); }
});

/** What the filmstrip shows of a frame: the frame `thumb` wide (an average of each block of the picture's pixels), and
    the squares round the worst tile, the tile and the ring of tiles round it (three tiles a side), RGB bytes each
    (tools/gate/sheet.js shrink and square); FLIP's of one number a pixel, read here. */
function look(w, h, worst, { l, lb, r, rb, err }, thumb) {
  const crop = 3 * worst.size, of = (data) => ({ width: w, height: h, data }), [B, N, T, Tn] = [lb, l, rb, r].map((d) => square(of(d), worst.x + worst.size / 2, worst.y + worst.size / 2, crop)), [cx, cy] = N.at;
  const e = new Float32Array(crop * crop); for (let y = 0; y < crop; y++) e.set(err.subarray((cy + y) * w + cx, (cy + y) * w + cx + crop), y * crop);
  const tile = { x: worst.x - cx, y: worst.y - cy, size: worst.size };
  return { thumb: shrink(of(l), thumb), at: [cx, cy], crop, crops: [B.rgb, N.rgb, T.rgb, Tn.rgb, heat(e, crop, crop, tile)], tile };
}
