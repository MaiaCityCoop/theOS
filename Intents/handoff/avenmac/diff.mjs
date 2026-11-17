// per view: on against off: mean |diff| (of 255), share of pixels off by > 8, share of 8x8 blocks whose means differ by > 4; a heatmap
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
const S = process.env.S, A = process.env.A, B = process.env.B, dir = `${S}/stills`;
const names = readdirSync(dir).filter((f) => f.startsWith(A + '-')).map((f) => f.slice(A.length + 1, -4));
const b = await chromium.launch({ headless: true }); const p = await b.newPage();
for (const n of names) {
  const fb = `${dir}/${B}-${n}.png`; let bb; try { bb = readFileSync(fb).toString('base64'); } catch { continue; }
  const aa = readFileSync(`${dir}/${A}-${n}.png`).toString('base64');
  const r = await p.evaluate(async ([aa, bb]) => {
    const load = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = new OffscreenCanvas(i.width, i.height), x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height); };
    const X = await load(aa), Y = await load(bb), W = X.width, H = X.height, d = X.data, e = Y.data;
    let sum = 0, big = 0; const hm = new ImageData(W >> 2, H >> 2);
    for (let i = 0; i < d.length; i += 4) { const m = (Math.abs(d[i] - e[i]) + Math.abs(d[i + 1] - e[i + 1]) + Math.abs(d[i + 2] - e[i + 2])) / 3; sum += m; if (m > 8) big++; }
    let blocks = 0, bad = 0;
    for (let y = 0; y + 8 <= H; y += 8) for (let x = 0; x + 8 <= W; x += 8) { let s1 = 0, s2 = 0; for (let j = 0; j < 8; j++) for (let k = 0; k < 8; k++) { const o = ((y + j) * W + x + k) * 4; s1 += d[o] + d[o + 1] + d[o + 2]; s2 += e[o] + e[o + 1] + e[o + 2]; } blocks++; if (Math.abs(s1 - s2) / 192 > 4) bad++; }
    for (let y = 0; y < H >> 2; y++) for (let x = 0; x < W >> 2; x++) { let m = 0; for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) { const o = (((y << 2) + j) * W + (x << 2) + k) * 4; m += Math.abs(d[o] - e[o]) + Math.abs(d[o + 1] - e[o + 1]) + Math.abs(d[o + 2] - e[o + 2]); } m = Math.min(255, (m / 48) * 8); const o = (y * (W >> 2) + x) * 4; hm.data[o] = m; hm.data[o + 1] = m; hm.data[o + 2] = m; hm.data[o + 3] = 255; }
    const c = new OffscreenCanvas(W >> 2, H >> 2); c.getContext('2d').putImageData(hm, 0, 0); const bl = await c.convertToBlob(); const ab = new Uint8Array(await bl.arrayBuffer()); let bin = ''; for (const v of ab) bin += String.fromCharCode(v);
    return { mean: +(sum / (W * H)).toFixed(2), over8: +((100 * big) / (W * H)).toFixed(2), blocks: +((100 * bad) / blocks).toFixed(2), heat: btoa(bin) };
  }, [aa, bb]);
  writeFileSync(`${dir}/heat-${A}-vs-${B}-${n}.png`, Buffer.from(r.heat, 'base64'));
  console.log(n.padEnd(12), 'mean', r.mean, '| px>8', r.over8 + '%', '| blocks>4', r.blocks + '%');
}
await b.close();
