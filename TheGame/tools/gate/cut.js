// The cut's Safari check (intent 0038, stage 8): tools/gate/cut.html in WebKit (Playwright's, the engine Safari runs
// on) and in Chrome, headless. It prints what each found: whether the cluster cut's compute pass, its 32-bit atomics
// and its indirect draw through the hardware rasteriser give the picture the rule asks for, and the GPU's features.
//
//   bun tools/gate/cut.js [--url http://127.0.0.1:5303/]
import { webkit, chromium } from 'playwright-core';
import { webkitAt } from '../browsers.js';

const at = process.argv.indexOf('--url'), BASE = (at > 0 && process.argv[at + 1]) || 'http://127.0.0.1:5303/';
const url = new URL('tools/gate/cut.html', BASE).href;
for (const [name, type, opts] of [['webkit', webkit, webkitAt()], ['chrome', chromium, { channel: 'chrome', args: ['--enable-unsafe-webgpu'] }]]) {
  let b = null;
  try {
    b = await type.launch({ headless: true, ...opts });
    const p = await b.newPage(); await p.goto(url);
    await p.waitForFunction(() => window.__cut, null, { timeout: 60e3 });
    const r = await p.evaluate(() => window.__cut);
    console.log(name, r.ok ? 'ok' : 'FAILED', JSON.stringify(r));
  } catch (e) { console.log(name, 'FAILED', String(e.message ?? e).split('\n')[0]); }
  await b?.close();
}
