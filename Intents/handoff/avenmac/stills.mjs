// stills of the same views with and without the ground cache, 4K (1280x720 at 3), nothing moving
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const S = process.env.S, tag = process.env.TAG || 'run', modes = (process.env.MODES || 'off:&groundcache=0,on:&groundcache').split(',').map((m) => m.split(':'));
export const VIEWS = [
  { name: 'meadow-eye', v: { up: 1.7, pitch: 6, mm: 28 } },
  { name: 'pine-eye', v: { x: -1383.6, z: 634.1, yaw: -4.14, up: 1.7, pitch: 4, mm: 28 } },
  { name: 'meadow-10m', v: { up: 10, pitch: -18, mm: 28 } },
  { name: 'meadow-30m', v: { up: 30, pitch: -30, mm: 28 } },
  { name: 'meadow-60m', v: { up: 60, pitch: -35, mm: 28 } },
  { name: 'pine-30m', v: { x: -1383.6, z: 634.1, yaw: -4.14, up: 30, pitch: -30, mm: 28 } },
];
if (process.env.VIEWJSON) VIEWS.splice(0, VIEWS.length, ...JSON.parse(process.env.VIEWJSON));
const only = process.env.VIEWS ? process.env.VIEWS.split(',') : null;
const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const [mode, q] of modes) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 3 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`http://localhost:5180/game/?notaau&nohud${q}${process.env.EXTRA || ''}`, { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => window.__game?.scatter && window.__cine, null, { timeout: 180000 });
  await p.evaluate((d) => { const g = window.__game.governor; g.detail = () => d; }, +(process.env.DETAIL || 1));
  await p.waitForTimeout(+(process.env.WAIT || 3000));
  await p.evaluate(() => { const s = window.__game, U = s.U ?? null; const Sh = import('/game/tools/shots.js'); return Sh.then((M) => { M.weather({ wind: 0, clouds: 0 }); const u = window.__game.U || null; }); });
  for (const { name, v } of VIEWS) {
    if (only && !only.includes(name)) continue;
    const url = await p.evaluate(async (v) => {
      const M = await import('/game/tools/shots.js'); await M.view({ ...v, hour: 11 });
      const s = window.__game; s.governor.hold(true); s.renderer.setPixelRatio(3);
      const U = (await import(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('src/core/uniforms.js')).at(-1))).U;
      const t = U.uTime.value; Object.defineProperty(U.uTime, 'value', { get: () => t, set: () => {}, configurable: true });
      for (let i = 0; i < 90; i++) await new Promise(requestAnimationFrame);
      await new Promise((r) => setTimeout(r, 1500));
      return window.__cine.still();
    }, v);
    writeFileSync(`${S}/stills/${tag}-${mode}-${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(mode, name, 'ok', errs.slice(0, 1).join(''));
  }
  await p.close();
}
await b.close();
