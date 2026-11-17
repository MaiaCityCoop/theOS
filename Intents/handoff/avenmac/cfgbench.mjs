import { chromium } from 'playwright';
const cfgs = process.env.CFGS.split(',').map((m) => m.split(':')), ratio = +(process.env.RATIO || 3);
const b = await chromium.launch({ channel: 'chrome', headless: true }); const res = {};
for (const rep of [0, 1]) for (const [name, q] of rep ? [...cfgs].reverse() : cfgs) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await p.goto(`http://localhost:5180/game/?gputime${q}`, { waitUntil: 'load', timeout: 90000 });
    await p.waitForFunction(() => window.__game?.scatter && window.__game?.governor, null, { timeout: 180000 });
    await p.waitForTimeout(20000);
    const r = await p.evaluate(async (ratio) => (await import('/game/tools/bench.js')).bench({ ratio, frames: 20, settle: 2000 }), ratio);
    (res[name] ||= []).push(r);
  } catch (e) { console.log(name, 'FAIL', String(e).slice(0, 200)); }
  await p.close();
}
const views = ['tent, eye level', 'river bend, 26 m', 'town, 40 m', 'pine forest, eye level', 'pine forest, 90 m'];
console.log('cfg'.padEnd(10), views.map((v) => v.slice(0, 14).padStart(15)).join(''));
for (const [n, rs] of Object.entries(res)) console.log(n.padEnd(10), views.map((v) => rs.map((r) => r[v].toFixed(1)).join('/').padStart(15)).join(''));
await b.close();
