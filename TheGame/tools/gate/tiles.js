// The truth past 800 m (intent 0038): a view drawn in n × n tiles, each at all the canvas's pixels. ?truth draws
// everything within its reach at its finest; past about 800 m one frame holds more than the GPU can and the WebGPU
// device is lost. Each tile's frustum holds about 1 / n² of what the whole picture's does, and the picture laid from
// the tiles is n² times supersampled. tools/gate.js stills --tiles n.
import { readPNG, writePNG } from './flip.js';

/** In the page: the camera set to show tile (i, j) of its picture split n × n (none: the whole picture), drawn at all
    the canvas's pixels (src/core/temporal.js keeps its part of a pixel inside the tile), and what was built over time
    let go. Each tile's frustum holds about 1 / n² of what the whole picture's does. */
function tileOf(t) {
  const g = window.__game, c = g.renderer.domElement;
  if (!t) g.camera.clearViewOffset(); else g.camera.setViewOffset(c.width, c.height, (t.i * c.width) / t.n, (t.j * c.height) / t.n, c.width / t.n, c.height / t.n);
  g.temporal.cut();
}
/** The tiles of a view (each drawn n times as finely as it is shown: PNGs), brought down by n and laid side by side. */
function mosaic(parts, n) {
  const first = readPNG(parts[0].png), W = first.width, H = first.height, tw = W / n, th = H / n, out = new Uint8Array(W * H * 3);
  if (tw % 1 || th % 1) throw new Error(`a ${W}×${H} picture does not split into ${n} × ${n} whole tiles`);
  for (const p of parts) {
    const P = p === parts[0] ? first : readPNG(p.png), ch = P.channels;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      let r = 0, g = 0, b = 0;
      for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) { const o = ((y * n + yy) * W + x * n + xx) * ch; r += P.data[o]; g += P.data[o + 1]; b += P.data[o + 2]; }
      const o = ((p.j * th + y) * W + p.i * tw + x) * 3, k = n * n;
      out[o] = Math.round(r / k); out[o + 1] = Math.round(g / k); out[o + 2] = Math.round(b / k);
    }
  }
  return writePNG(out, W, H);
}
/** A view drawn tile by tile in `page` (go: the camera to the view and settled; still: the frame read; each tile under
    the GPU lock, `locked`): the picture laid from them (a PNG), and each tile's { i, j, ms, over, drawn }. */
export async function tiled(page, v, n, { go, still, locked, label }) {
  const parts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [a, s] = await locked(`${label}, tile ${i},${j} of ${n}×${n}`, async () => { await page.evaluate(tileOf, { i, j, n }); const a = await go(page, v); return [a, await page.evaluate(still)]; });
    parts.push({ i, j, png: Buffer.from(s.png.slice(s.png.indexOf(',') + 1), 'base64'), ms: a.ms, over: s.over, drawn: s.drawn });
    console.log(`  ${v.name.padEnd(28)} tile ${i},${j} settled in ${(a.ms / 1000).toFixed(1).padStart(5)} s${s.over ? ' (a tier had more patches than it holds: the farthest left out)' : ''}`);
  }
  await page.evaluate(tileOf, null);
  return { png: mosaic(parts, n), parts: parts.map(({ png, ...p }) => p) };
}
