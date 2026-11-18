// Where a start's time goes (intent 0038, the player's cold start): the game opened in Chrome on a fresh profile (cold:
// nothing kept, neither the browser's caches nor the game's own) and then again on the same profile (warm), each until
// its first view is complete (src/core/settle.js ready), and what each part of the start took on the way:
//
//   bun tools/start.js [--dist <dir> | --url <url>] [--screen 1920x1080@2] [--runs cold,warm] [--until first|ready]
//                      [--browser chrome|webkit] [--headed]
//
// The first frame is the one definition of it every measure reads (src/core/marks.js FIRST_FRAME: the GPU done with the
// first frame that draws the world); the bytes before it, every response ended by then, the page's own too. A build
// (--dist, by default TheGame/dist: `bunx --bun vite build` first) is served as the host serves it (deploy/Caddyfile):
// sent compressed where the build wrote it so, kept for good under /assets/, asked for again otherwise. The screen is
// the gate's (a 4K one: 1920×1080 points at two pixels each). The browser: the system's Chrome, or Playwright's own WebKit
// (the engine Safari runs: the newest kept, as tools/gate/cut.js takes it). The numbers: .gate/start-<browser>.json.
import { chromium, webkit } from 'playwright-core';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { FIRST_FRAME } from '../src/core/marks.js';

const GAME = resolve(import.meta.dirname, '..');
const option = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };

// ---- the build, served as the host serves it ----
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
function serve(dist) {
  return Bun.serve({ port: 0, fetch(req) {
    const u = new URL(req.url), p = decodeURIComponent(u.pathname).replace(/\/$/, '/index.html');
    const f = [p, `${p}.html`, `${p}/index.json`].map((q) => join(dist, q)).find((c) => existsSync(c) && statSync(c).isFile());
    if (!f) return new Response('', { status: 404 });
    const br = /\bbr\b/.test(req.headers.get('accept-encoding') ?? '') && existsSync(`${f}.br`), kept = p.startsWith('/assets/') || (p.startsWith('/brand/') && u.searchParams.has('v'));
    const headers = { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': kept ? 'public, max-age=31536000, immutable' : 'no-cache', ...(br ? { 'content-encoding': 'br' } : {}) };
    return new Response(Bun.file(br ? `${f}.br` : f), { headers });
  } });
}

// ---- in the page, before any of its own code runs: what each part asks and when it is answered ----
function watchStart(FIRST) {
  const now = () => performance.now(), S = (window.__start = { pipes: [], shaders: [], jobs: [], kept: [], reads: [], long: [], src: {}, frames: [] });
  // (the veil, src/ui/loading.js: watched from the document, as there is no <html> yet)
  new MutationObserver(() => { if (!S.veil && document.documentElement?.classList.contains('os-loaded')) S.veil = now(); }).observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) S.long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch { /* (no long tasks told: none counted) */ }
  const timed = (list, e, p) => { list.push(e); p.then(() => (e.t1 = now()), () => (e.t1 = now())); return p; };
  const D = window.GPUDevice?.prototype;
  if (navigator.gpu) { const ask = navigator.gpu.requestAdapter.bind(navigator.gpu); navigator.gpu.requestAdapter = (...a) => { S.adapter ??= now(); return ask(...a); }; }
  if (D) for (const k of ['createRenderPipelineAsync', 'createComputePipelineAsync']) { const f = D[k]; D[k] = function (d) { return timed(S.pipes, { k: k[6], label: d?.label ?? '', t0: now() }, f.call(this, d)); }; }
  if (D) for (const k of ['createRenderPipeline', 'createComputePipeline']) { const f = D[k]; D[k] = function (d) { const e = { k: k[6], label: d?.label ?? '', sync: true, t0: now() }, r = f.call(this, d); e.t1 = now(); S.pipes.push(e); return r; }; }
  if (D) { const f = D.createShaderModule; D.createShaderModule = function (d) { S.shaders.push({ t0: now(), bytes: d?.code?.length ?? 0, label: d?.label ?? '' }); return f.call(this, d); }; }
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(u, o) {
      super(u, o); const out = new Map(), name = String(u).split('/').pop().replace(/(-[\w-]{8})?\.js.*$/, '');
      const post = this.postMessage.bind(this);
      this.postMessage = (m, ...r) => { if (m?.id >= 0) out.set(m.id, { w: name, what: Array.isArray(m.jobs) ? m.jobs.map((j) => j[0]).join() : '', t0: now() }); return post(m, ...r); };
      this.addEventListener('message', (e) => { const j = out.get(e.data?.id); if (j) { j.t1 = now(); S.jobs.push(j); out.delete(e.data.id); } });
    }
  };
  const O = window.IDBObjectStore?.prototype;
  if (O) for (const k of ['get', 'put']) { const f = O[k]; O[k] = function (...a) { const e = { k, key: String(k === 'get' ? a[0] : a[1]), t0: now() }, r = f.apply(this, a); S.kept.push(e); r.addEventListener('success', () => { e.t1 = now(); e.hit = k === 'put' || r.result != null; }); return r; }; }
  let game;
  Object.defineProperty(window, '__game', { configurable: true, get: () => game, set: (g) => {
    game = g; S.game = now();
    const read = g.renderer.readRenderTargetPixelsAsync.bind(g.renderer);   // (what the GPU is asked to give back: the far ends' pictures)
    g.renderer.readRenderTargetPixelsAsync = (...a) => timed(S.reads, { t0: now() }, read(...a));
  } });
  // what the world still waits on (src/core/settle.js), every tenth of a second: when each part was first and last out
  setInterval(() => { const w = game?.waiting?.(), t = now(); for (const [k, n] of Object.entries(w ?? {})) { const s = (S.src[k] ||= { from: t, until: t, most: 0 }); s.until = t; s.most = Math.max(s.most, n); } }, 100);
  const frame = (t) => { const m = performance.getEntriesByName(FIRST)[0]; if (m && S.last) S.frames.push(t - S.last); S.last = t; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}

// ---- in the page, once it is done: the numbers ----
function numbersOf(FIRST) {
  const S = window.__start, G = window.__game, mark = performance.getEntriesByName(FIRST)[0] ?? null, first = mark?.startTime ?? null;
  const entries = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')];
  const before = first == null ? [] : entries.filter((e) => e.responseEnd <= first), scripts = entries.filter((e) => /\.js(\?|$)/.test(e.name));
  return { S, first, frameNo: mark?.detail ?? null, bytes: before.reduce((s, e) => s + (e.transferSize || 0), 0), responses: before.length, boot: G?.boot ?? null, loadMs: G?.loadMs ?? null,
    scripts: { n: scripts.length, bytes: scripts.reduce((s, e) => s + (e.transferSize || 0), 0), last: Math.max(0, ...scripts.map((e) => e.responseEnd)) }, out: G?.waiting?.() ?? null };
}

async function open(ctx, url, until, wait) {
  const page = await ctx.newPage(), said = [];
  page.on('pageerror', (e) => said.push(String(e).slice(0, 240)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') said.push(m.text().slice(0, 240)); });
  await page.addInitScript(() => performance.setResourceTimingBufferSize(1e5));
  await page.addInitScript(watchStart, FIRST_FRAME);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: wait });
  await page.waitForFunction((name) => performance.getEntriesByName(name).length > 0, FIRST_FRAME, { timeout: wait, polling: 100 });
  if (until === 'ready') await page.evaluate((ms) => Promise.race([window.__game.ready.then(() => (window.__start.ready = performance.now())), new Promise((res) => setTimeout(res, ms))]), wait);
  const r = { ...(await page.evaluate(numbersOf, FIRST_FRAME)), wall: Date.now() - t0, said };
  await page.close();
  return r;
}

// ---- the chain, in words ----
const s = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)} s`);
const covered = (list) => { let sum = 0, end = -Infinity; for (const e of list.filter((x) => x.t1).sort((a, b) => a.t0 - b.t0)) { sum += Math.max(0, e.t1 - Math.max(e.t0, end)); end = Math.max(end, e.t1); } return sum; };
const until = (list) => Math.max(0, ...list.map((e) => e.t1 ?? 0));
const median = (xs) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };
function chain(r) {
  const S = r.S, F = r.first ?? Infinity, pre = (list) => list.filter((e) => e.t0 < F), P = pre(S.pipes), lt = S.long.filter((x) => x[0] < F);
  const workers = {}; for (const j of S.jobs) { const w = (workers[`${j.w} ${j.what.split(',')[0]}`] ||= []); w.push(j); }
  const kept = (k) => S.kept.filter((e) => e.k === k);
  return [
    `  modules: ${r.scripts.n} scripts, ${(r.scripts.bytes / 1e3).toFixed(0)} kB sent, the last in at ${s(r.scripts.last)}; the GPU first asked for at ${s(S.adapter)}`,
    `  the start's own marks (ms from its start): ${JSON.stringify(r.boot)}`,
    `  pipelines before the first frame: ${P.length} (${P.filter((e) => e.k === 'R').length} render, ${P.filter((e) => e.k === 'C').length} compute), compiling ${s(covered(P))} of the time, each ${median(P.filter((e) => e.t1).map((e) => e.t1 - e.t0))?.toFixed(0) ?? '–'} ms (median), the last done at ${s(until(P))}; after it ${S.pipes.length - P.length}`,
    `  shader modules before the first frame: ${pre(S.shaders).length}, ${(pre(S.shaders).reduce((a, x) => a + x.bytes, 0) / 1e6).toFixed(2)} MB of WGSL, the largest ${[...pre(S.shaders)].sort((a, b) => b.bytes - a.bytes).slice(0, 4).map((x) => `${(x.bytes / 1e3).toFixed(0)} kB ${x.label}`.trim()).join(', ')}; after it ${S.shaders.length - pre(S.shaders).length}`,
    `  the slowest pipelines: ${[...S.pipes].filter((e) => e.t1).sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0)).slice(0, 4).map((e) => `${(e.t1 - e.t0).toFixed(0)} ms ${e.sync ? 'made at once ' : ''}${e.label}`).join(', ')}; made at once (not aside): ${S.pipes.filter((e) => e.sync).length}`,
    `  the page's own thread before the first frame: ${lt.length} long tasks, ${s(lt.reduce((a, x) => a + x[1], 0))}`,
    ...Object.entries(workers).map(([k, l]) => `  worker ${k}: ${l.length} jobs, busy ${s(covered(l))}, the last back at ${s(until(l))} (${pre(l).length} before the first frame)`),
    `  kept (IndexedDB): ${kept('get').length} reads (${kept('get').filter((e) => e.hit).length} found), the last answered at ${s(until(kept('get')))}; ${kept('put').length} writes, the last at ${s(until(kept('put')))}`,
    `  read back from the GPU: ${S.reads.length}, each ${median(S.reads.filter((e) => e.t1).map((e) => e.t1 - e.t0))?.toFixed(0) ?? '–'} ms (median), the last at ${s(until(S.reads))}`,
    ...Object.entries(S.src).map(([k, v]) => `  out: ${k} from ${s(v.from)} until ${s(v.until)} (at most ${v.most})`),
    ...(r.out && Object.keys(r.out).length ? [`  still out at the end: ${JSON.stringify(r.out)}`] : []),
    ...(S.frames.length ? [`  frames after the first: ${S.frames.length}, median ${median(S.frames).toFixed(1)} ms, ${S.frames.filter((x) => x > 1000 / 59).length} over 16.7 ms, the longest ${Math.max(...S.frames).toFixed(0)} ms`] : []),
    ...(r.said.length ? [`  the page said: ${[...new Set(r.said)].slice(0, 5).join(' | ')}`] : []),
  ].join('\n');
}

/** A browser on the profile `dir`, at the screen asked for. */
function launch(dir, { w, h, dpr }) {
  const headless = !process.argv.includes('--headed'), screen = { viewport: { width: w, height: h }, deviceScaleFactor: dpr };
  if (option('browser', 'chrome') === 'chrome') return chromium.launchPersistentContext(dir, { channel: 'chrome', headless, args: ['--enable-unsafe-webgpu'], ...screen });
  const cache = `${homedir()}/Library/Caches/ms-playwright`, kept = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('webkit-')).sort().map((d) => `${cache}/${d}/pw_run.sh`).filter(existsSync).pop() : null;
  return webkit.launchPersistentContext(dir, { headless, ...(kept ? { executablePath: kept } : {}), ...screen });
}

async function main() {
  const dist = option('dist', option('url', null) ? null : join(GAME, 'dist')), [w, h, dpr] = option('screen', '1920x1080@2').split(/[x@]/).map(Number);
  const runs = option('runs', 'cold,warm').split(','), until = option('until', 'ready'), wait = Number(option('wait', '300')) * 1000;
  const server = dist ? serve(dist) : null, url = server ? `http://localhost:${server.port}/` : option('url'), dir = mkdtempSync(join(tmpdir(), 'start-')), out = { url, browser: option('browser', 'chrome'), screen: { w, h, dpr }, when: new Date().toISOString() };
  try {
    for (const cache of runs) {   // (one profile: the warm start finds what the cold one kept, the browser's and the game's own)
      const ctx = await launch(dir, { w, h, dpr });
      try { out[cache] = await open(ctx, url, until, wait); } finally { await ctx.close(); }
      const r = out[cache];
      console.log(`${cache}: the first frame at ${s(r.first)} (${(r.bytes / 1e6).toFixed(2)} MB in ${r.responses} responses before it), the veil gone at ${s(r.S.veil)}, the first view complete at ${s(r.S.ready)}`);
      console.log(chain(r));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); server?.stop(true); }
  mkdirSync(join(GAME, '.gate'), { recursive: true }); writeFileSync(join(GAME, `.gate/start-${out.browser}.json`), JSON.stringify(out));
}
await main();
