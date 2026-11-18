// Labelled sheets of pictures for people (intent 0038: labelled before/after images go to Samuel with every task that
// changes the picture): JPEGs painted in a blank page of Chrome, the world not started: a view in two sets (tools/gate.js
// diff --jpeg) and a path's filmstrip (tools/gate/motion.js). One painter: laid out here (lay), painted in the page
// (paint), written (jpeg). Its shrink and square serve tools/gate/change.js's workers too, so Chrome's driver is loaded
// only when a sheet is drawn.
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

/** A sheet laid out: under its title, a chart where given ({ series, line, marks }: a path's frames), then its rows, each
    row's panels scaled to share the width and all as tall as the row, a label over the row where it has one and under each
    panel. rows: [{ label?, panels: [{ label?, w, h, rgb?, sharp?, box? }] }]. Each panel's place (x, y) and drawn size
    (dw, dh), the chart's, and the sheet's height. */
export function lay(rows, { width = 1600, chart = null } = {}) {
  const pad = 10, label = 20, head = 64, band = 210;
  let y = head + (chart ? band + pad : 0);
  const laid = rows.map((r) => {
    const h = Math.floor((width - pad * (r.panels.length + 1)) / r.panels.reduce((s, p) => s + p.w / p.h, 0)), top = y + (r.label ? label : 0);
    let x = pad;
    const panels = r.panels.map((p) => { const dw = Math.floor((p.w / p.h) * h), at = { ...p, x, y: top, dw, dh: h }; x += dw + pad; return at; });
    const row = { label: r.label ?? null, y, panels };
    y = top + h + label + pad;
    return row;
  });
  return { width, height: y + pad, pad, chart: chart && { ...chart, x: pad + 44, y: head, w: width - pad * 2 - 44, h: band }, rows: laid };
}
/** A view in two sets as a labelled JPEG: the two side by side, and under them the squares round the worst tile at full
    size in each and in FLIP's heat map. */
export async function sideBySide(file, { title, sub, A, B, heatRGB, worst, names }) {
  const { chromium } = await import('playwright-core'), ctx = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const S = 384, cx = worst.x + worst.size / 2, cy = worst.y + worst.size / 2, a = shrink(A, 960), b = shrink(B, 960), k = a.w / A.width, H = { width: A.width, height: A.height, data: heatRGB, channels: 3 };
    const qa = square(A, cx, cy, S), qb = square(B, cx, cy, S), qh = square(H, cx, cy, S), box = [worst.x - qa.at[0], worst.y - qa.at[1], worst.size], small = [worst.x * k, worst.y * k, worst.size * k];
    const rows = [
      { panels: [{ label: names[0], ...a, rgb: b64(a.rgb), box: small }, { label: names[1], ...b, rgb: b64(b.rgb), box: small }] },
      { panels: [{ label: `${names[0]}: the ${S}-px square round the worst tile`, ...qa, rgb: b64(qa.rgb), sharp: true, box }, { label: names[1], ...qb, rgb: b64(qb.rgb), sharp: true, box }, { label: 'FLIP', ...qh, rgb: b64(qh.rgb), sharp: true, box }] },
    ];
    await jpeg(await ctx.newPage(), file, { title, sub, ...lay(rows) });
  } finally { await ctx.close(); }
}
/** Bytes as base64 (a panel's RGB, for the page). */
export const b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
/** A laid sheet painted in a blank page of Chrome (`page`) and written to `file` as a JPEG. */
export async function jpeg(page, file, sheet) {
  await page.setContent('<!doctype html><html><body style="margin:0;background:#101418"></body></html>');
  const url = await page.evaluate(paint, sheet);
  writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}

/** In a blank page: a laid sheet (lay) painted, a JPEG data URL: its title, its chart where it has one (each frame's worst
    tile against the line, the frames shown marked), and its panels, crisp where `sharp`, a box outlined where they say
    ([x, y, size] in their own pixels), labelled. */
function paint({ title, sub, width, height, pad, chart, rows }) {
  const img = (s64, w, h) => { const s = atob(s64), id = new ImageData(w, h); for (let i = 0, j = 0; i < w * h; i++, j += 3) { id.data[4 * i] = s.charCodeAt(j); id.data[4 * i + 1] = s.charCodeAt(j + 1); id.data[4 * i + 2] = s.charCodeAt(j + 2); id.data[4 * i + 3] = 255; } const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(id, 0, 0); return c; };
  const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
  const x = cv.getContext('2d');
  x.fillStyle = '#101418'; x.fillRect(0, 0, width, height);
  x.fillStyle = '#f2efe6'; x.font = 'bold 22px -apple-system, Helvetica, sans-serif'; x.fillText(title, pad, 30);
  x.font = '14px -apple-system, Helvetica, sans-serif'; x.fillStyle = '#b9c0c6'; x.fillText(sub, pad, 52);
  const plot = ({ x: cx0, y: cy0, w: cw, h: ch, series, line, marks }) => {   // (the chart: every frame's worst tile, the line, the frames shown)
    const top = Math.max(line * 2, ...series.map((p) => p[1])) * 1.05 || 1, X = (s) => cx0 + (s / (series.at(-1)?.[0] || 1)) * cw, Y = (v) => cy0 + ch - 18 - (v / top) * (ch - 26);
    x.strokeStyle = '#2c343c'; x.lineWidth = 1; x.font = '11px -apple-system, Helvetica, sans-serif'; x.fillStyle = '#8a949c';
    for (let k = 0; k <= 4; k++) { const v = (top * k) / 4; x.beginPath(); x.moveTo(cx0, Y(v)); x.lineTo(cx0 + cw, Y(v)); x.stroke(); x.fillText(v.toFixed(3), pad, Y(v) + 4); }
    x.fillText('seconds into the path →', cx0 + cw - 130, cy0 + ch - 2);
    x.strokeStyle = '#e8a33d'; x.setLineDash([6, 4]); x.beginPath(); x.moveTo(cx0, Y(line)); x.lineTo(cx0 + cw, Y(line)); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#e8a33d'; x.fillText(`line ${line.toFixed(3)}`, cx0 + 4, Y(line) - 4);
    x.strokeStyle = '#7fc8a9'; x.lineWidth = 1.5; x.beginPath(); series.forEach(([s, v], k) => (k ? x.lineTo(X(s), Y(v)) : x.moveTo(X(s), Y(v)))); x.stroke();
    for (const [s, v] of marks) { x.fillStyle = '#ff5a5a'; x.beginPath(); x.arc(X(s), Y(v), 4, 0, 7); x.fill(); }
  };
  if (chart) plot(chart);
  for (const r of rows) {
    if (r.label) { x.fillStyle = '#f2efe6'; x.font = 'bold 14px -apple-system, Helvetica, sans-serif'; x.fillText(r.label, pad, r.y + 16); }
    for (const p of r.panels) {
      x.imageSmoothingEnabled = !p.sharp; x.imageSmoothingQuality = 'high';
      x.drawImage(img(p.rgb, p.w, p.h), p.x, p.y, p.dw, p.dh);
      if (p.box) { const q = p.dw / p.w; x.strokeStyle = '#ff5a5a'; x.lineWidth = 2; x.strokeRect(p.x + p.box[0] * q - 2, p.y + p.box[1] * q - 2, p.box[2] * q + 4, p.box[2] * q + 4); }
      if (p.label) { x.fillStyle = '#f2efe6'; x.font = '13px -apple-system, Helvetica, sans-serif'; x.fillText(p.label, p.x, p.y + p.dh + 15); }
    }
  }
  return cv.toDataURL('image/jpeg', 0.9);
}
