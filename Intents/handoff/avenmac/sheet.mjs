// a sheet: a row a distance, a column a config (and plant); each crop fitted into a cell, small ones scaled up pixel for pixel
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
const S = process.env.S, cols = process.env.COLS.split(','), R = (process.env.DIST || '10,30,60,120,250,500').split(','), tree = process.env.TREE || 'oak', CW = 640, CH = 480;
const b = await chromium.launch({ headless: true }); const p = await b.newPage();
const cells = R.map((r) => cols.map((c) => { const f = `${S}/band/${c}-${tree}-${r}.png`; return existsSync(f) ? readFileSync(f).toString('base64') : null; }));
const out = await p.evaluate(async ({ cells, cols, R, CW, CH }) => {
  const c = new OffscreenCanvas(CW * cols.length, CH * R.length + 30), x = c.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.font = '20px sans-serif'; cols.forEach((n, i) => x.fillText(n, i * CW + 8, 22));
  for (let j = 0; j < R.length; j++) for (let i = 0; i < cols.length; i++) {
    if (!cells[j][i]) continue; const im = new Image(); im.src = 'data:image/png;base64,' + cells[j][i]; await im.decode();
    const k = Math.min(CW / im.width, CH / im.height); x.imageSmoothingEnabled = k < 1;
    x.drawImage(im, i * CW + (CW - im.width * k) / 2, 30 + j * CH + (CH - im.height * k) / 2, im.width * k, im.height * k);
    x.fillText(R[j] + ' m', i * CW + 8, 30 + j * CH + 22);
  }
  const bl = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 }); const ab = new Uint8Array(await bl.arrayBuffer()); let bin = ''; for (let i = 0; i < ab.length; i += 8192) bin += String.fromCharCode(...ab.subarray(i, i + 8192)); return btoa(bin);
}, { cells, cols, R, CW, CH });
writeFileSync(process.env.OUT, Buffer.from(out, 'base64')); await b.close();
