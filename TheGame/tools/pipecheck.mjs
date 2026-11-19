// Which render pipelines a start asks for with a colour target that has no format (intent 0038, stage 9a):
// `bun tools/pipecheck.mjs [webkit|chromium] [url] [seconds]`. WebKit refuses such a pipeline ("GPUColorTargetState.format
// is required"); Chrome lets it by. One tab on a fresh profile, thrown away after, the game loaded at the url (a dev
// server of the code to test; http://localhost:5180/game/ by default) and waited for until it is ready or the seconds
// run out (170). Every pipeline the page asks the device for is looked at as it is asked for:
//   bad      each one with a colour target without a format: when (ms from the start), how (async or not), its label,
//            its targets' formats, the render target the renderer had set then and its textures' formats as the
//            backend holds them, and where it was asked from (the stack)
//   sizes    the inside's ratio and the canvas's size each time either changed (a target made again while a compile
//            runs leaves its textures without a format until they are made again)
//   start    the start's marks (src/boot.js) and when it was ready, or that it was not
// and what the page said (errors and warnings). Runs a GPU: one job at a time, on the machine the master gives the turn.
import { chromium, webkit } from 'playwright-core';
import { webkitAt } from './browsers.js';

const [kind = 'webkit', url = 'http://localhost:5180/game/', seconds = '170'] = process.argv.slice(2);
if (!['webkit', 'chromium'].includes(kind)) throw new Error(`pipecheck: webkit or chromium, not ${kind}`);

// ---- in the page, before any of its scripts ----
function watch() {
  const keep = (window.__pipes = { asked: 0, bad: [], sizes: [] });
  const fmt = (r, t) => { try { return r.backend.get(t)?.format ?? null; } catch { return 'unknown'; } };
  const targetOf = (r, rt) => (rt ? { w: rt.width, h: rt.height, depth: rt.depth, count: rt.textures?.length, formats: rt.textures?.map((t) => fmt(r, t)), names: rt.textures?.map((t) => t.name || t.type) } : null);
  for (const how of ['createRenderPipeline', 'createRenderPipelineAsync']) {
    const ask = GPUDevice.prototype[how];
    GPUDevice.prototype[how] = function (d) {
      keep.asked++;
      const targets = d?.fragment?.targets ?? [];
      if (targets.some((t) => t && !t.format)) {
        const r = window.__game?.renderer;
        keep.bad.push({
          at: Math.round(performance.now()), how, label: d.label, targets: targets.map((t) => (t ? (t.format ?? 'none') : null)),
          target: r ? targetOf(r, r.getRenderTarget()) : 'no renderer yet',
          context: r?._currentRenderContext?.textures?.map((t) => ({ name: t.name || t.type, format: fmt(r, t), w: t.image?.width, h: t.image?.height })) ?? null,
          stack: String(new Error().stack ?? '').split('\n').slice(1, 18).map((s) => s.replace(/https?:\/\/[^/]+/, '').replace(/\?v=[^:]+/, '').slice(0, 170)),
        });
      }
      return ask.call(this, d);
    };
  }
  // (the inside's ratio and the canvas, each time either changed)
  let was = '';
  setInterval(() => {
    const g = window.__game, c = g?.renderer?.domElement, now = `${g?.screen?.inside ?? '-'} ${c?.width ?? '-'}x${c?.height ?? '-'}`;
    if (now !== was) { keep.sizes.push(`${Math.round(performance.now())} ms: inside ${now}`); was = now; }
  }, 100);
}

// ---- the run ----
const said = [];
const browser = kind === 'webkit' ? await webkit.launch(webkitAt()) : await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  await page.addInitScript(watch);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') said.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => said.push(`[pageerror] ${String(e).slice(0, 300)}`));
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120e3 });
  const ready = await page.waitForFunction(() => window.__game?.loadMs > 0, null, { timeout: Number(seconds) * 1000, polling: 500 }).then(() => true, () => false);
  const out = await page.evaluate(() => ({ marks: window.__game?.boot ?? null, loadMs: window.__game?.loadMs ?? null, pipes: window.__pipes }));
  console.log(`${kind} ${url}: ${ready ? `ready in ${Math.round(out.loadMs)} ms` : `not ready after ${seconds} s`} (${((Date.now() - t0) / 1000).toFixed(1)} s in all)`);
  console.log(`start: ${JSON.stringify(out.marks)}`);
  console.log(`pipelines asked for: ${out.pipes?.asked}, with a colour target without a format: ${out.pipes?.bad.length}`);
  for (const b of out.pipes?.bad.slice(0, 12) ?? []) console.log(`\n${JSON.stringify(b, null, 1)}`);
  console.log(`\nsizes:\n  ${(out.pipes?.sizes ?? []).join('\n  ')}`);
} finally {
  console.log(`\nthe page said ${said.length} error(s)/warning(s)`); for (const s of said.slice(0, 30)) console.log(`  ${s}`);
  await browser.close();
}
