// one oak and one pine at set distances, each config a page; the plant's region cropped at full 4K resolution
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const S = process.env.S, tag = process.env.TAG || 'b', modes = process.env.MODES.split(',').map((m) => m.split(':'));
const R = (process.env.DIST || '10,30,60,120,250,500').split(',').map(Number);
const TREES = [{ name: 'oak', at: [-1342.09, 604.37], h: 12.84, deg: +(process.env.OAKDEG || 200) }, { name: 'pine', at: [-1232.6, 627.5], h: 14, deg: +(process.env.PINEDEG || 90) }];
const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const [mode, q] of modes) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 3 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`http://localhost:5180/game/?notaau&nohud${q}`, { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => window.__game?.scatter && window.__cine, null, { timeout: 180000 });
  await p.evaluate(() => { window.__game.governor.detail = () => 1; });
  await p.waitForTimeout(+(process.env.WAIT || 20000));
  for (const T of TREES) for (const r of R) {
    const png = await p.evaluate(async ({ T, r }) => {
      const M = await import('/game/tools/shots.js'); M.weather({ wind: 0, clouds: 0 });
      await M.around({ at: T.at, deg: T.deg, r, mm: 28, up: 1.7, hour: 11, lookUp: r < 20 ? 6 : T.h / 2 });
      const s = window.__game; s.governor.hold(true); s.renderer.setPixelRatio(3);
      const U = (await import(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('src/core/uniforms.js')).at(-1))).U;
      const t = U.uTime.value; Object.defineProperty(U.uTime, 'value', { get: () => t, set: () => {}, configurable: true });
      for (let i = 0; i < 60; i++) await new Promise(requestAnimationFrame);
      await new Promise((res) => setTimeout(res, 2500));
      const url = await window.__cine.still(), img = new Image(); img.src = url; await img.decode();
      const W = img.width, H = img.height, px = (T.h / r) * (H / 2) / Math.tan((s.camera.fov * Math.PI) / 360);
      const ch = Math.min(H, Math.max(180, Math.round(px * 1.5))), cw = Math.min(W, Math.round(ch * 4 / 3));
      const c = new OffscreenCanvas(cw, ch); c.getContext('2d').drawImage(img, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, cw, ch);
      const bl = await c.convertToBlob(); const ab = new Uint8Array(await bl.arrayBuffer()); let bin = ''; for (let i = 0; i < ab.length; i += 8192) bin += String.fromCharCode(...ab.subarray(i, i + 8192)); return btoa(bin);
    }, { T, r });
    writeFileSync(`${S}/band/${tag}-${mode}-${T.name}-${r}.png`, Buffer.from(png, 'base64'));
  }
  console.log(mode, 'done', errs.slice(0, 1).join(''));
  await p.close();
}
await b.close();
