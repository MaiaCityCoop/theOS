// Labelled sheets of pictures for people (intent 0038: labelled before/after images go to Samuel with every task that
// changes the picture): JPEGs drawn in a blank page of Chrome, the world not started. tools/gate.js diff --jpeg. Its
// shrink and square serve tools/gate/change.js's workers too, so Chrome's driver is loaded only when a sheet is drawn.
import { writeFileSync } from 'node:fs';

/** A picture's RGB bytes brought down to `tw` wide (each pixel the mean of the block of the picture's it covers). */
export function shrink({ width: w, height: h, data, channels: ch = data.length / (w * h) }, tw) {
  const k = w / tw, th = Math.round(h / k), out = new Uint8Array(tw * th * 3);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.floor((x + 1) * k)), y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.min(h, Math.floor((y + 1) * k)));
    let r = 0, g = 0, b = 0, m = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * w + xx) * ch; r += data[o]; g += data[o + 1]; b += data[o + 2]; m++; }
    const o = 3 * (y * tw + x); out[o] = r / m; out[o + 1] = g / m; out[o + 2] = b / m;
  }
  return { w: tw, h: th, rgb: out };
}
/** The square of `size` pixels of a picture round a point, its RGB bytes. */
export function square({ width: w, height: h, data, channels: ch = data.length / (w * h) }, cx, cy, size) {
  const x0 = Math.max(0, Math.min(w - size, Math.round(cx - size / 2))), y0 = Math.max(0, Math.min(h - size, Math.round(cy - size / 2))), out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const o = ((y0 + y) * w + x0 + x) * ch, d = 3 * (y * size + x); out[d] = data[o]; out[d + 1] = data[o + 1]; out[d + 2] = data[o + 2]; }
  return { w: size, h: size, rgb: out, at: [x0, y0] };
}
/** A labelled JPEG of a view in two sets, drawn in a blank page of a Chrome of its own: the two side by side, and under
    them the squares round the worst tile at full size in each and in FLIP's heat map. */
export async function sideBySide(file, { title, sub, A, B, heatRGB, worst, names }) {
  const { chromium } = await import('playwright-core'), ctx = await chromium.launch({ channel: 'chrome', headless: true }), b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  try {
    const page = await ctx.newPage(), S = 384, cx = worst.x + worst.size / 2, cy = worst.y + worst.size / 2;
    await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
    const a = shrink(A, 960), b = shrink(B, 960), k = a.w / A.width, H = { width: A.width, height: A.height, data: heatRGB, channels: 3 };
    const qa = square(A, cx, cy, S), qb = square(B, cx, cy, S), qh = square(H, cx, cy, S), box = [worst.x - qa.at[0], worst.y - qa.at[1], worst.size];
    const rows = [
      [{ label: names[0], ...a, rgb: b64(a.rgb), box: [worst.x * k, worst.y * k, worst.size * k] }, { label: names[1], ...b, rgb: b64(b.rgb), box: [worst.x * k, worst.y * k, worst.size * k] }],
      [{ label: `${names[0]}: the ${S}-px square round the worst tile`, ...qa, rgb: b64(qa.rgb), sharp: true, box }, { label: names[1], ...qb, rgb: b64(qb.rgb), sharp: true, box }, { label: 'FLIP', ...qh, rgb: b64(qh.rgb), sharp: true, box }],
    ];
    const url = await page.evaluate(sheet, { title, sub, width: 1600, rows });
    writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  } finally { await ctx.close(); }
}

/** In a blank page: a sheet of labelled pictures as a JPEG data URL, `width` wide: a title, then rows, each row's
    panels side by side scaled to share its width (crisp where `sharp`), each with its label under it and, where it
    says, a box outlined ([x, y, size] in its own pixels). rows: [[{ label, w, h, rgb (base64 RGB), sharp?, box? }]]. */
export function sheet({ title, sub, width, rows }) {
  const PAD = 10, LABEL = 20;
  const img = (b64, w, h) => { const s = atob(b64), id = new ImageData(w, h); for (let i = 0, j = 0; i < w * h; i++, j += 3) { id.data[4 * i] = s.charCodeAt(j); id.data[4 * i + 1] = s.charCodeAt(j + 1); id.data[4 * i + 2] = s.charCodeAt(j + 2); id.data[4 * i + 3] = 255; } const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(id, 0, 0); return c; };
  const laid = rows.map((r) => { const k = (width - PAD * (r.length + 1)) / r.reduce((s, p) => s + p.w / p.h, 0); return { r, h: Math.floor(k) }; });
  const cv = document.createElement('canvas'); cv.width = width; cv.height = 64 + laid.reduce((s, l) => s + l.h + LABEL + PAD, 0) + PAD;
  const x = cv.getContext('2d');
  x.fillStyle = '#101418'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#f2efe6'; x.font = 'bold 22px -apple-system, Helvetica, sans-serif'; x.fillText(title, PAD, 30);
  x.font = '14px -apple-system, Helvetica, sans-serif'; x.fillStyle = '#b9c0c6'; x.fillText(sub, PAD, 52);
  let y = 64;
  for (const { r, h } of laid) {
    let cx = PAD;
    for (const p of r) {
      const w = Math.floor((p.w / p.h) * h);
      x.imageSmoothingEnabled = !p.sharp; x.imageSmoothingQuality = 'high';
      x.drawImage(img(p.rgb, p.w, p.h), cx, y, w, h);
      if (p.box) { const q = w / p.w; x.strokeStyle = '#ff5a5a'; x.lineWidth = 2; x.strokeRect(cx + p.box[0] * q - 2, y + p.box[1] * q - 2, p.box[2] * q + 4, p.box[2] * q + 4); }
      x.fillStyle = '#f2efe6'; x.font = '13px -apple-system, Helvetica, sans-serif'; x.fillText(p.label, cx, y + h + 15);
      cx += w + PAD;
    }
    y += h + LABEL + PAD;
  }
  return cv.toDataURL('image/jpeg', 0.9);
}
