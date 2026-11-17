import { chromium, webkit } from 'playwright';
import { appendFileSync } from 'fs';
const out = process.env.S + '/ab.jsonl';
async function one(b, lod) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto(`http://localhost:5180/game/?lod=${lod}&gputime`, { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => window.__game?.scatter && window.__game?.governor, null, { timeout: 180000 });
  await p.waitForTimeout(4000);
  const bench = await p.evaluate(async () => (await import('/game/tools/bench.js')).bench({ frames: 30, settle: 3000 }));
  const parts = await p.evaluate(async () => { const B = await import('/game/tools/bench.js'); const s = window.__game; s.covered = true; try { return await B.parts(B.VIEWS[4], { ratio: 1.5, frames: 20 }); } finally { s.covered = false; } });
  const plants = await p.evaluate(async () => { try { return await window.__plants?.submitted?.(); } catch (e) { return String(e); } });
  await p.close();
  return { bench, parts, plants, errs };
}
for (const [name, type, opts] of [['chrome', chromium, { channel: 'chrome', headless: true }], ['webkit', webkit, { headless: true }]]) {
  const b = await type.launch(opts);
  for (const lod of ['old', 'new', 'old', 'new']) {
    try { const r = await one(b, lod); appendFileSync(out, JSON.stringify({ browser: name, lod, ...r }) + '\n'); console.log(name, lod, 'worst', r.bench.worst, 'pine eye', r.bench['pine forest, eye level']); }
    catch (e) { console.log(name, lod, 'FAIL', String(e).slice(0, 300)); }
  }
  await b.close();
}
