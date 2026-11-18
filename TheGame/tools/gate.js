// The gate (intent 0038): one driver for every check of the picture and of its cost. Run from TheGame/ against the dev
// server (http://localhost:5180/game/; another with --url <url> or GATE_URL: a worktree's own server), in the system's
// own Chrome through Playwright, headless (--headed: in a window, for frame times as a screen paces them):
//
//   bun tools/gate.js stills [--tag t] [--truth] [--views a,b]   the gate's views (tools/gate/views.js) as 4K PNGs in
//                        [--fresh] [--reach m] [--tiles n]       .gate/<tag>/ (by default the commit); --truth: ?truth
//                                                                (--reach: ?truth=m, as far as it says); --fresh: on a
//                                                                new browser profile (launch, below); --tiles: each view
//                                                                drawn in n × n tiles, each at all the canvas's pixels,
//                                                                brought down by n and laid side by side (the truth past
//                                                                800 m: no tile's frustum holds more than the GPU can)
//   bun tools/gate.js diff <tagA> <tagB> [--ppd n] [--jpeg]      FLIP between two sets (tools/gate/flip.js), per view:
//                                                                the mean, the 99th percentile of its 32-px tiles, the
//                                                                worst tile; heat maps and report.json in .gate/A-vs-B/
//                                                                (--jpeg: and a labelled sheet of the two, <view>.jpg)
//   bun tools/gate.js noise <tag> [--truth] [--views a,b]        the same views shot twice: the floor any diff stands on
//   bun tools/gate.js bench [--ratio r] [--frames n]             tools/bench.js at its six views with ?gputime: GPU ms
//                                                                against its BUDGET, and the resolution drawn
//   bun tools/gate.js compile [--page library.html]              the WGSL compiled from the start until the world has
//                                                                settled: bytes, modules, the largest ten (check 6)
//   bun tools/gate.js paths [--paths a,b]                        the paths (tools/gate/views.js) on a cold profile and a
//                                                                warm one: every frame's time, the GPU's, the whole
//                                                                browser's memory, against 60 fps, BUDGET and 8 GB
//   bun tools/gate.js motion [--paths a,b] [--fps n] [--to s]    check 4, nothing pops: every frame of the paths drawn
//                        [--keep n] [--workers n] [--reach m]    twice in step, as the game draws it and at full detail
//                                                                (?truth drawn as a frame in motion), and in each frame
//                                                                the change detail made, ((LOD − truth) now) − ((LOD −
//                                                                truth) a frame before), by FLIP in 32-px tiles: every
//                                                                frame's worst tile against POP, and a filmstrip of the
//                                                                worst (--keep) in .gate/motion-<tag>/; --fps: frames a
//                                                                second of the path (60: every frame the game draws);
//                                                                --to: the first s seconds of each path only; --floor:
//                                                                the game against itself, drawn twice: the noise floor
//   bun tools/gate.js real <tag | dir> --photos <dir>            check 4a, photorealism: renders (a set of stills, or a
//                        [--device mps] [--no-clip]              folder) held against photographs (a folder with its
//                                                                manifest.json, tools/gate/README.md): CMMD on CLIP
//                                                                features, and natural-image statistics, by view, kind
//                                                                and all together; in Python (GATE_PYTHON)
//   bun tools/gate.js all [--tag t] [--views a,b]                stills of this code and of ?truth, their diff, the
//                                                                bench, the compile and the paths, in one table
//
// GATE_LOCK=<dir>: the GPU is shared with other runs (tools/gate/README.md). Each part of a run that draws (a page come,
// a view or a tile, a path in motion) takes the lock, and lets it go after; meanwhile the page is held on the gate's
// clock (tools/gate/motion.js) and draws nothing.
//
// It never waits on a timer for the picture: once the camera has moved it waits for window.__game.settle() (src/core/
// settle.js), which resolves when nothing streams or builds for that camera and the picture built over time has come to
// rest. A page without it is an error, and says so. The screen is a 4K one: 1920×1080 points at two pixels each, so the
// game's canvas is 3840×2160 by its own rule. For stills the world is drawn inside at 2560×1440 (the budget's "about
// 1440p") and brought up to the screen by the temporal pass, the governor held where it starts and the world's clock
// standing still at the same moment in every run, so two runs of the same code draw the same. On the paths the governor
// and the clock run, as in the game. Chrome runs on the gate's own profile, .gate/chrome/, kept from run to run (the
// world is made in half a minute, not two); the paths make a fresh one for their cold run.
import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { execSync, execFile, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { promisify } from 'node:util';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { VIEWS, PATHS, KINDS } from './gate/views.js';
import { BUDGET } from './bench.js';
import { flip, tiles, heat, readPNG, writePNG, PPD } from './gate/flip.js';
import { stepper, begin, rest, shot, film, sheet } from './gate/motion.js';
import { CROP } from './gate/change.js';

const URL_AT = process.argv.indexOf('--url'), BASE = (URL_AT > 0 && process.argv[URL_AT + 1]) || process.env.GATE_URL || 'http://localhost:5180/game/';
const OUT = new URL('../.gate/', import.meta.url).pathname;   // TheGame/.gate/: made again by every run, not kept in git
const SCREEN = { width: 1920, height: 1080, dpr: 2 }, INSIDE = 4 / 3, TIME = 100;   // (TIME: the seconds the world's clock stands at for stills)
const FRAME = 1000 / 60, JITTER = 1, MEMORY = 8e9;   // the hard gates in motion: no frame longer than 1/60 s (the frame clock's own jitter allowed), the GPU within BUDGET ms in every frame, the whole browser within 8 GB
const WAIT = 300e3;   // ms the world may take to come, or to settle, before the gate calls it broken (an error; never a wait for readiness)
const ARGS = ['--enable-unsafe-webgpu'];

// ---- the page ----
/** A page of the game in Chrome (`ctx`: launch()), its world come and settled where it starts: drawn through WebGPU,
    with window.__game.settle(), or an error. */
async function open(ctx, { path = '', query = '', init = null } = {}) {
  const page = await ctx.newPage(), errors = [], url = new URL(path, BASE).href + (query ? `?${query}` : '');
  await page.addInitScript(() => performance.setResourceTimingBufferSize(1e5));   // (the gate finds the page's own modules by their resource entries: all of them kept)
  if (init) await page.addInitScript(init);
  // (the dev server's live reload kept away, its socket answered by nothing: a file saved during a run must not reload
  // the page under the gate, which keeps the code it began with)
  await page.routeWebSocket((u) => u.pathname === new URL(BASE).pathname && u.searchParams.has('token'), () => {});
  const close = () => page.close();
  let loads = 0;
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
  page.on('crash', () => errors.unshift('the page crashed'));
  page.on('load', () => loads++ && errors.unshift(`the page was loaded again (${page.url()})`));   // (a load, not a page saying where it is: the library writes what it shows into its address)
  try {
    await page.goto(url, { waitUntil: 'load', timeout: WAIT });
    // (the start is over once the world can say it has settled, or once it has said it is ready without that: a page
    // older than src/core/settle.js)
    await page.waitForFunction(() => typeof window.__game?.settle === 'function' || window.__game?.loadMs != null, null, { timeout: WAIT, polling: 250 });
    if (!(await page.evaluate(() => typeof window.__game?.settle === 'function'))) throw new Error(`${url}: window.__game.settle() is missing, so the gate cannot know when the picture is ready, and it never waits on a timer. It comes with intent 0038 stage 2 (src/core/settle.js): a promise that resolves when nothing streams or builds for the camera and the picture built over time has come to rest.`);
    const start = await page.evaluate(settled, { wait: WAIT, at: 'the start' });   // (the world made and settled where it starts, before anything is asked of it)
    if (!(await page.evaluate(() => !!window.__game.renderer.backend.isWebGPUBackend))) throw new Error(`${url}: drawn through WebGL, not WebGPU (Chrome gave the page no GPU adapter)`);
    return { page, errors, url, start, close };
  } catch (e) { said(errors); await close(); throw e; }
}
/** In the page: the world's ready (where it has one), then window.__game.settle(); how long that took (ms), what
    settle() said, and when it was (ms since the page began). An error after `wait` ms. */
async function settled({ wait, at }) {
  const s = window.__game, C = window.__gateClock, t0 = Date.now(), late = new Promise((_, no) => setTimeout(() => no(new Error(`window.__game.settle() did not resolve in ${wait / 1000} s at ${at}`)), wait + 10e3));
  // (the page on the gate's clock, tools/gate/motion.js stepper: its frames drawn here, one after another, until it has)
  const on = (p) => { if (C?.on) { let done = false; p.finally(() => (done = true)).catch(() => {}); (async () => { while (!done) { await C.step(C.last + 1000 / 60); await new Promise((r) => setTimeout(r, 0)); } })(); } return p; };
  const said = await Promise.race([Promise.resolve(s.ready).then(() => on(s.settle({ timeout: wait }))), late]);
  let kept = null; try { kept = JSON.parse(JSON.stringify(said ?? null)); } catch {}
  return { ms: Date.now() - t0, said: kept, now: Math.round(performance.now()) };
}

/** In the page, once, for pictures that hold still: the world's clock standing at `time` seconds (the fire, the smoke,
    the water and the grass caught at the same moment in every run; what grows by the clock is grown at once where the
    clock is held, src/core/settle.js), the governor held where it starts (its detail cap too), the world drawn inside at `inside` (or as the
    page chooses: ?truth), and no lens blur (the walker sees none, and it would hide what detail does). */
async function prepare({ inside, time }) {
  const s = window.__game, R = performance.getEntriesByType('resource').map((e) => e.name);
  const { U } = await import(R.filter((n) => n.includes('src/core/uniforms.js')).at(-1));
  if (time != null) Object.defineProperty(U.uTime, 'value', { get: () => time, set() {}, configurable: true });
  s.governor.hold(true); s.governor.rest?.();   // (and its detail cap where it starts: what the start's frames cost must not change the picture)
  s.renderer.setPixelRatio(devicePixelRatio);   // (the canvas at all the screen's pixels: so the game keeps it, up to two a point)
  if (inside != null) s.screen.set(inside);
  window.__cine.dof = false;
}

/** In the page: the camera to a view (tools/gate/views.js), the hour and the weather to its own; the camera in view()'s
    terms. */
async function aim(v) {
  const R = performance.getEntriesByType('resource').map((e) => e.name), mod = (part) => import(R.filter((n) => n.includes(part)).at(-1));
  const S = await import(new URL('tools/shots.js', location.href).href);
  let cam = v.cam;
  if (v.rig) {   // (the game's own camera there, in view()'s terms)
    const { poseAt, heightFor } = await mod('src/camera/rig.js'), { heightAt } = await mod('src/world/land.js');
    const { x, z, yaw, look = 0 } = v.rig, P = poseAt(x, z, yaw, v.rig.h ?? heightFor(x, z, yaw, v.rig.dist), look);
    cam = { x: P.pos[0], z: P.pos[2], yaw: P.yaw, up: P.pos[1] - heightAt(P.pos[0], P.pos[2]), pitch: 100 * Math.tan(P.pitch), mm: P.v.mm };
  }
  S.weather({ wind: v.wind, clouds: v.clouds });
  await S.view({ ...cam, hour: v.hour });
  const C = window.__gateClock;
  for (let i = 0; i < 2; i++) await (C?.on ? C.step(C.last + 1000 / 60) : new Promise(requestAnimationFrame));   // (the move drawn once, so what it asks for has been asked before settle() is)
  return cam;
}
/** The camera to a view and the world settled there. */
const go = async (page, v) => ({ cam: await page.evaluate(aim, v), ...(await page.evaluate(settled, { wait: WAIT, at: v.name })) });

/** In the page: the next frame drawn, as a PNG, and the sizes it was drawn at (inside) and shown at (the canvas). */
async function still() {
  const s = window.__game, C = window.__gateClock, p = window.__cine.still(), d = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };
  if (C?.on) await C.step(C.last + 1000 / 60);
  const png = await p;
  s.screen?.size?.(d);
  return { png, drawn: [d.x, d.y], out: [s.renderer.domElement.width, s.renderer.domElement.height], over: !!s.scatter?.over };
}
/** In the page: the camera set to show tile (i, j) of its picture split n × n (none: the whole picture), drawn at all
    the canvas's pixels (src/core/temporal.js keeps its part of a pixel inside the tile), and what was built over time
    let go. Each tile's frustum holds about 1 / n² of what the whole picture's does. */
function tileOf(t) {
  const g = window.__game, c = g.renderer.domElement;
  if (!t) g.camera.clearViewOffset(); else g.camera.setViewOffset(c.width, c.height, (t.i * c.width) / t.n, (t.j * c.height) / t.n, c.width / t.n, c.height / t.n);
  g.temporal.cut();
}
/** The tiles of a view (each drawn n times as finely as it is shown: PNGs), brought down by n and laid side by side. */
function mosaic(parts, n) {
  const first = readPNG(parts[0].png), W = first.width, H = first.height, tw = W / n, th = H / n, out = new Uint8Array(W * H * 3);
  if (tw % 1 || th % 1) throw new Error(`a ${W}×${H} picture does not split into ${n} × ${n} whole tiles`);
  for (const p of parts) {
    const P = p === parts[0] ? first : readPNG(p.png), ch = P.channels;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      let r = 0, g = 0, b = 0;
      for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) { const o = ((y * n + yy) * W + x * n + xx) * ch; r += P.data[o]; g += P.data[o + 1]; b += P.data[o + 2]; }
      const o = ((p.j * th + y) * W + p.i * tw + x) * 3, k = n * n;
      out[o] = Math.round(r / k); out[o + 1] = Math.round(g / k); out[o + 2] = Math.round(b / k);
    }
  }
  return writePNG(out, W, H);
}

// ---- small things ----
/** Those of a list named (all where none are). */
function pick(list, names, what) {
  if (!names) return list;
  const want = String(names).split(','), bad = want.filter((n) => !list.some((v) => v.name === n));
  if (bad.length) throw new Error(`no ${what} ${bad.join(', ')}; the ${what}s are ${list.map((v) => v.name).join(', ')}`);
  return list.filter((v) => want.includes(v.name));
}
const git = (c) => execSync(`git ${c}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const commit = () => { try { return git('rev-parse --short HEAD') + (git('status --porcelain') ? '-dirty' : ''); } catch { return 'nogit'; } };
const save = (file, data) => writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
const px = ([w, h]) => `${w}×${h}`, gb = (b) => `${(b / 1e9).toFixed(2)} GB`, f = (v, n = 2, w = 8) => (v == null ? '–' : v.toFixed(n)).padStart(w);
const said = (errors) => errors.length && console.log(`  the page said ${errors.length} error(s); the first: ${errors[0]}`);
/** Chrome on the gate's own profile (.gate/chrome/, kept from run to run: what the browser and the game keep, so the world
    is made in about half a minute, not two; the paths take a fresh one of their own). One run at a time uses it.
    --fresh: a new profile for this run, thrown away after. What a page keeps is kept by its origin, and can draw what
    the code would not draw now (2026-11-18: the same code drew the plants at pines-30m otherwise on the kept profile than
    on a fresh one), so two sets of stills to be compared are each taken fresh. */
const FRESH = [];
const launch = (opt, dir = opt.fresh ? (FRESH[FRESH.length] = mkdtempSync(join(tmpdir(), 'gate-fresh-'))) : `${OUT}chrome`) => chromium.launchPersistentContext(dir, { channel: 'chrome', headless: !opt.headed, args: ARGS, viewport: { width: SCREEN.width, height: SCREEN.height }, deviceScaleFactor: SCREEN.dpr })
  .catch((e) => { throw new Error(`Chrome did not start on ${dir} (is another gate run using it?): ${e.message.split('\n')[0]}`); });
/** The value at fraction q of a list's sorted values (nearest rank). */
const rank = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.max(0, Math.ceil(q * s.length) - 1)] : null; };
/** The GPU shared with other runs (GATE_LOCK: a directory, taken by making it, the one whose making succeeds holding it;
    its `owner` file says who and since when): fn() run holding it, and let go after, so that between the parts of a long
    run (a page made, a path, a pass of the truth) another's timed run can come in. Without GATE_LOCK, fn() at once. A
    lock older than an hour is not broken but said: the person decides. */
const LOCK = process.env.GATE_LOCK || null;
let holding = false;
async function locked(what, fn) {
  if (!LOCK || holding) return fn();
  for (let told = false; ;) {
    try { mkdirSync(LOCK); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let who = '', age = 0; try { who = readFileSync(`${LOCK}/owner`, 'utf8').trim(); age = Date.now() - statSync(`${LOCK}/owner`).mtimeMs; } catch {}
      if (age > 3600e3) throw new Error(`the GPU lock ${LOCK} has been held for ${Math.round(age / 60e3)} min (${who}): is it stale? Not broken here; ask`);
      if (!told) { console.log(`  (waiting for the GPU lock: ${who || 'being taken'})`); told = true; }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  holding = true;
  writeFileSync(`${LOCK}/owner`, `${process.env.GATE_WHO || 'tools/gate.js'} ${new Date().toISOString()} ${what} (pid ${process.pid})\n`);
  try { return await fn(); } finally { holding = false; rmSync(LOCK, { recursive: true, force: true }); }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (holding) rmSync(LOCK, { recursive: true, force: true }); for (const d of FRESH) rmSync(d, { recursive: true, force: true }); process.exit(130); });

// ---- the commands ----
async function stills(chrome, { tag, truth = false, reach = null, views, tiles = 1 } = {}) {
  tag ||= commit() + (truth ? '-truth' : '');
  const list = pick(VIEWS, views, 'view'), dir = `${OUT}${tag}/`, n = Math.max(1, Math.round(+tiles || 1)), png = (s) => Buffer.from(s.png.slice(s.png.indexOf(',') + 1), 'base64');
  // (in tiles, or with the GPU shared, GATE_LOCK, the page is held on the gate's clock, tools/gate/motion.js stepper:
  // nothing is drawn between two views or tiles, so another run may have the GPU meanwhile)
  const held = n > 1 || !!LOCK;
  const { page, errors, url, start, close } = await locked(`stills ${tag}: the page`, async () => {
    const P = await open(chrome, { query: truth ? (reach ? `truth=${reach}` : 'truth') : '', init: held ? stepper : null });
    await P.page.evaluate(prepare, { inside: truth ? null : INSIDE, time: TIME });
    if (held) await P.page.evaluate(() => window.__gateClock.start());
    return P;
  });
  mkdirSync(dir, { recursive: true });
  const meta = existsSync(`${dir}gate.json`) ? JSON.parse(readFileSync(`${dir}gate.json`, 'utf8')) : { views: {} };
  Object.assign(meta, { tag, url, truth, commit: commit(), when: new Date().toISOString(), screen: SCREEN, start });
  console.log(`stills → .gate/${tag}/ (${url})${n > 1 ? `, each view in ${n} × ${n} tiles` : ''}`);
  try {
    for (const v of list) {
      if (n === 1) {
        const [a, s] = await locked(`stills ${tag}: ${v.name}`, async () => { const a = await go(page, v); return [a, await page.evaluate(still)]; });
        writeFileSync(`${dir}${v.name}.png`, png(s));
        meta.views[v.name] = { cam: a.cam, settleMs: a.ms, settle: a.said, drawn: s.drawn, out: s.out, over: s.over };
        console.log(`  ${v.name.padEnd(28)} settled in ${(a.ms / 1000).toFixed(1).padStart(5)} s, drawn ${px(s.drawn)} into ${px(s.out)}${s.over ? ' (a tier had more patches than it holds: the farthest left out)' : ''}`);
        if (truth && s.drawn[0] < s.out[0]) console.log('  (the truth drawn at fewer pixels than it is shown at: ?truth is to be supersampled)');
        continue;
      }
      const parts = [], t0 = Date.now();
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const [a, s] = await locked(`stills ${tag}: ${v.name}, tile ${i},${j} of ${n}×${n}`, async () => { await page.evaluate(tileOf, { i, j, n }); const a = await go(page, v); return [a, await page.evaluate(still)]; });
        parts.push({ i, j, png: png(s), ms: a.ms, over: s.over, drawn: s.drawn });
        console.log(`  ${v.name.padEnd(28)} tile ${i},${j} settled in ${(a.ms / 1000).toFixed(1).padStart(5)} s${s.over ? ' (a tier had more patches than it holds)' : ''}`);
      }
      await page.evaluate(tileOf, null);
      writeFileSync(`${dir}${v.name}.png`, mosaic(parts, n));
      meta.views[v.name] = { tiles: n, ms: Date.now() - t0, settleMs: parts.map((p) => p.ms), over: parts.some((p) => p.over), drawn: parts[0].drawn, out: parts[0].drawn };
      console.log(`  ${v.name.padEnd(28)} ${n * n} tiles in ${((Date.now() - t0) / 60e3).toFixed(1)} min, each drawn ${px(parts[0].drawn)} for a ${n}th of the picture each way`);
    }
  } finally { meta.errors = errors; save(`${dir}gate.json`, meta); said(errors); await close(); }
  return tag;
}

/** A picture's RGB bytes brought down to `tw` wide (each pixel the mean of the block of the picture's it covers). */
function shrink({ width: w, height: h, data, channels: ch = data.length / (w * h) }, tw) {
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
function square({ width: w, height: h, data, channels: ch = data.length / (w * h) }, cx, cy, size) {
  const x0 = Math.max(0, Math.min(w - size, Math.round(cx - size / 2))), y0 = Math.max(0, Math.min(h - size, Math.round(cy - size / 2))), out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const o = ((y0 + y) * w + x0 + x) * ch, d = 3 * (y * size + x); out[d] = data[o]; out[d + 1] = data[o + 1]; out[d + 2] = data[o + 2]; }
  return { w: size, h: size, rgb: out, at: [x0, y0] };
}
/** A labelled JPEG of a view in two sets, drawn in a blank page of a Chrome of its own: the two side by side, and under
    them the squares round the worst tile at full size in each and in FLIP's heat map. */
async function sideBySide(file, { title, sub, A, B, heatRGB, worst, names }) {
  const ctx = await chromium.launch({ channel: 'chrome', headless: true }), b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  try {
    const page = await ctx.newPage(), S = 384, cx = worst.x + worst.size / 2, cy = worst.y + worst.size / 2;
    await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
    const a = shrink(A, 960), b = shrink(B, 960), k = a.w / A.width, H = { width: A.width, height: A.height, data: heatRGB, channels: 3 };
    const qa = square(A, cx, cy, S), qb = square(B, cx, cy, S), qh = square(H, cx, cy, S), box = [worst.x - qa.at[0], worst.y - qa.at[1], worst.size];
    const rows = [
      [{ label: names[0], ...a, rgb: b64(a.rgb), box: [worst.x * k, worst.y * k, worst.size * k] }, { label: names[1], ...b, rgb: b64(b.rgb), box: [worst.x * k, worst.y * k, worst.size * k] }],
      [{ label: `${names[0]}: ${S} px round the worst tile, at full size`, ...qa, rgb: b64(qa.rgb), sharp: true, box }, { label: names[1], ...qb, rgb: b64(qb.rgb), sharp: true, box }, { label: 'FLIP', ...qh, rgb: b64(qh.rgb), sharp: true, box }],
    ];
    const url = await page.evaluate(sheet, { title, sub, width: 1600, rows });
    writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  } finally { await ctx.close(); }
}

/** FLIP of set `a` against set `b` (the reference: FLIP is symmetric, so only the names say which is which). --jpeg:
    also a labelled sheet of each view, the two side by side (sideBySide), as <view>.jpg. */
async function diff(a, b, { ppd = PPD, views, jpeg = false } = {}) {
  if (!a || !b) throw new Error('diff <tagA> <tagB>: two sets of stills in .gate/');
  const dir = `${OUT}${a}-vs-${b}/`, report = { a, b, ppd: +ppd, tile: 32, when: new Date().toISOString(), views: {} };
  mkdirSync(dir, { recursive: true });
  console.log(`FLIP at ${(+ppd).toFixed(1)} pixels a degree, ${a} against ${b} → .gate/${a}-vs-${b}/`);
  console.log(`  ${'view'.padEnd(28)}${'mean'.padStart(8)}${'p99 tile'.padStart(10)}${'worst tile'.padStart(12)}  at`);
  for (const v of pick(VIEWS, views, 'view')) {
    const fa = `${OUT}${a}/${v.name}.png`, fb = `${OUT}${b}/${v.name}.png`;
    if (!existsSync(fa) || !existsSync(fb)) continue;
    const A = readPNG(readFileSync(fa)), B = readPNG(readFileSync(fb));
    if (A.width !== B.width || A.height !== B.height) { console.log(`  ${v.name.padEnd(28)} not the same size: ${A.width}×${A.height} and ${B.width}×${B.height}`); continue; }
    const err = flip(B, A, { ppd: +ppd }), t = tiles(err, A.width, A.height);
    const H = heat(err, A.width, A.height, t.worst);
    writeFileSync(`${dir}${v.name}.png`, writePNG(H, A.width, A.height));
    report.views[v.name] = { mean: +t.mean.toFixed(6), p99: +t.p99.toFixed(6), worst: { ...t.worst, value: +t.worst.value.toFixed(6) } };
    console.log(`  ${v.name.padEnd(28)}${f(t.mean, 4)}${f(t.p99, 4, 10)}${f(t.worst.value, 4, 12)}  ${t.worst.x},${t.worst.y}`);
    if (jpeg) await sideBySide(`${dir}${v.name}.jpg`, { title: `${v.name}: ${a} against ${b}`, sub: `FLIP at 4K (${(+ppd).toFixed(1)} px a degree): mean ${t.mean.toFixed(4)}, the 99th percentile of its 32-px tiles ${t.p99.toFixed(4)}, the worst tile ${t.worst.value.toFixed(4)} (outlined)`, A, B, heatRGB: H, worst: t.worst, names: [a, b] });
  }
  const rows = Object.values(report.views);
  if (!rows.length) throw new Error(`no view is in both .gate/${a}/ and .gate/${b}/`);
  report.most = { mean: Math.max(...rows.map((r) => r.mean)), p99: Math.max(...rows.map((r) => r.p99)), worst: Math.max(...rows.map((r) => r.worst.value)) };
  console.log(`  ${'most'.padEnd(28)}${f(report.most.mean, 4)}${f(report.most.p99, 4, 10)}${f(report.most.worst, 4, 12)}`);
  save(`${dir}report.json`, report);
  return report;
}

async function noise(chrome, tag, opt) {
  if (!tag) throw new Error('noise <tag>: the name the two sets are kept under (<tag>-a, <tag>-b)');
  const a = await stills(chrome, { ...opt, tag: `${tag}-a` }), b = await stills(chrome, { ...opt, tag: `${tag}-b` });
  console.log('the noise floor (the same code, shot twice):');
  return await diff(a, b, opt);
}

/** tools/bench.js's bench(), one view at a time, each once the world has settled there. bench() draws the world as the
    game does: inside at `ratio`, brought up to the 4K canvas by the upscale pass (the whole frame's GPU time). */
async function bench(chrome, { ratio = INSIDE, frames = 60 } = {}) {
  const { page, errors, url, close } = await open(chrome, { query: 'gputime' }), out = { ratio: +ratio, views: {} };
  try {
    await page.evaluate(prepare, { inside: null, time: TIME });
    for (const v of VIEWS.filter((x) => x.bench)) {
      await go(page, v);
      const r = await page.evaluate(async ({ name, ratio, frames }) => {
        const B = await import(new URL('tools/bench.js', location.href).href), all = [...B.VIEWS];
        B.VIEWS.splice(0, all.length, all.find((x) => x.name === name));   // (bench() times every view in its list: here only this one)
        try { return await B.bench({ ratio, frames }); } finally { B.VIEWS.splice(0, 1, ...all); window.__game.governor.hold(true); }   // (it lets the governor go when it is done)
      }, { name: v.bench, ratio: +ratio, frames: +frames });
      out.measure = r.measure; out.drawn = [Math.floor(r.size[0] * r.ratio), Math.floor(r.size[1] * r.ratio)]; out.views[v.bench] = r[v.bench];
    }
  } finally { said(errors); await close(); }
  out.worst = Math.max(...Object.values(out.views)); out.pass = out.worst <= BUDGET;
  console.log(`bench: ${out.measure}, drawn ${px(out.drawn)} (×${(+ratio).toFixed(2)} of ${SCREEN.width}×${SCREEN.height}) and brought up to ${px([SCREEN.width * SCREEN.dpr, SCREEN.height * SCREEN.dpr])} (${url})`);
  for (const [k, ms] of [...Object.entries(out.views), ['worst', out.worst]]) console.log(`  ${k.padEnd(28)}${f(ms)} ms  ${ms <= BUDGET ? 'within' : 'OVER'} ${BUDGET}`);
  return out;
}

/** Every shader module the page makes: its WGSL's bytes, its label, and the first pipeline that uses it, watched from
    before the page's own scripts run (an init script). */
function watchShaders() {
  const D = globalThis.GPUDevice?.prototype; if (!D) return;
  const log = (globalThis.__gateShaders = []), of = new WeakMap(), make = D.createShaderModule, utf8 = new TextEncoder();
  D.createShaderModule = function (d) { const m = make.call(this, d), code = d?.code ?? '', e = { label: d?.label ?? '', code, bytes: utf8.encode(code).length, used: '' }; log.push(e); of.set(m, e); return m; };
  for (const k of ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync']) {
    const g = D[k]; D[k] = function (d) { for (const st of [d?.vertex, d?.fragment, d?.compute]) { const e = st && of.get(st.module); if (e && !e.used) e.used = d.label ?? ''; } return g.call(this, d); };
  }
}
async function compile(chrome, { page: path = '' } = {}) {
  const { page, errors, url, start, close } = await open(chrome, { path, init: watchShaders });   // (open() has waited for the world to settle where it starts)
  let r;
  try {
    r = await page.evaluate(() => {
      const s = window.__game, L = globalThis.__gateShaders ?? [], seen = new Set(); let again = 0, againBytes = 0;
      for (const e of L) { if (seen.has(e.code)) { again++; againBytes += e.bytes; } else seen.add(e.code); }
      // a short label: what draws with the module's material (the land, the water, the sky, a stand's kind, else the
      // mesh's name), found by the material's number in the pipeline's label; a compute module by the stand whose packing
      // pass it is (three's pipeline for each of a tier's passes), else by the storage it binds
      const tierOf = new Map(), drawn = new Map(), packs = new Map();
      for (const t of s.scatter?.tiers ?? []) {
        for (const m of t.meshes ?? [t.mesh]) if (m) tierOf.set(m, t.asset);
        for (const n of t.passes ?? []) { let code = null; try { code = s.renderer._pipelines.get(n)?.pipeline?.computeProgram?.code; } catch {} if (code && !packs.has(code)) packs.set(code, `${t.asset}: packing`); }
      }
      s.scene.traverse((o) => { const what = o === s.terrain?.landMesh ? 'land' : o === s.terrain?.waterMesh ? 'water' : o.renderOrder === 15 ? 'sky' : tierOf.get(o) ?? (o.name || o.parent?.name || ''); for (const m of [].concat(o.material ?? [])) if (what && !drawn.has(m.id)) drawn.set(m.id, what); });
      const name = (e) => {
        const stage = e.label.split('_')[0], own = e.label.slice(stage.length + 1), p = e.used.split('_');
        if (own) return `${stage} ${own}`;
        if (p[0] === 'renderPipeline') return `${stage} ${drawn.get(+p.at(-1)) ?? `${p.slice(1, -1).join('_')} #${p.at(-1)}`}`;
        const vars = [...new Set([...e.code.matchAll(/var<storage[^>]*>\s*(\w+)/g)].map((m) => m[1]))];
        return `${stage} ${packs.get(e.code) ?? (vars.slice(0, 3).join(', ') || e.used || '?')}`;
      };
      return { n: L.length, bytes: L.reduce((s, e) => s + e.bytes, 0), again, againBytes, largest: [...L].sort((a, b) => b.bytes - a.bytes).slice(0, 10).map((e) => ({ name: name(e), bytes: e.bytes, label: e.label, used: e.used })) };
    });
  } finally { said(errors); await close(); }
  r.settledAt = start.now;
  console.log(`compile: ${r.n} shader modules, ${(r.bytes / 1e6).toFixed(2)} MB of WGSL, from the start until the world settled ${(r.settledAt / 1000).toFixed(1)} s in (${url})`);
  if (r.again) console.log(`  the same code made again: ${r.again} of them, ${(r.againBytes / 1e3).toFixed(0)} KB`);
  for (const e of r.largest) console.log(`  ${(e.bytes / 1e3).toFixed(0).padStart(6)} KB  ${e.name}`);
  return r;
}

// ---- the paths: every frame timed, the memory watched ----
/** In the page: a path's keys for the film camera (one clip at an even pace), the camera standing on its first. */
async function course(p) {
  const R = performance.getEntriesByType('resource').map((e) => e.name), mod = (part) => import(R.filter((n) => n.includes(part)).at(-1));
  const { poseAt, heightFor } = await mod('src/camera/rig.js'), { heightAt } = await mod('src/world/land.js');
  const key = (P) => { const c = Math.cos(P.pitch); return { pos: P.pos, look: [P.pos[0] - Math.sin(P.yaw) * c * 50, P.pos[1] + Math.sin(P.pitch) * 50, P.pos[2] - Math.cos(P.yaw) * c * 50], mm: P.v.mm }; };
  let keys, secs;
  if (p.walk) {   // (a key every 3 m, at the eyes over the ground there, looking 20 m ahead)
    const { from: [x0, z0], to: [x1, z1], eye, speed, mm } = p.walk, L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 3), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    keys = Array.from({ length: n + 1 }, (_, i) => { const x = x0 + (x1 - x0) * (i / n), z = z0 + (z1 - z0) * (i / n), lx = x + dx * 20, lz = z + dz * 20; return { pos: [x, heightAt(x, z) + eye, z], look: [lx, heightAt(lx, lz) + eye, lz], mm }; });
    secs = L / speed;
  } else if (p.zoom) {   // (a key every eighth of a doubling of the height)
    const { at: [x, z], yaw, from, to } = p.zoom, n = Math.ceil(8 * Math.log2(to / from));
    keys = Array.from({ length: n + 1 }, (_, i) => key(poseAt(x, z, yaw, from * (to / from) ** (i / n))));
    secs = p.zoom.secs;
  } else {   // (an orbit: a key every 10°)
    const { at: [x, z], yaw, dist } = p.orbit;
    keys = Array.from({ length: 37 }, (_, i) => { const y = yaw + (Math.PI * 2 * i) / 36; return key(poseAt(x, z, y, heightFor(x, z, y, dist))); });
    secs = p.orbit.secs;
  }
  window.__cine.load([{ name: p.name, secs, ease: 'linear', hour: p.hour, keys }]);
  return { secs, keys: keys.length };
}
/** In the page: tools/flyby.js's flight, held at its start (its own frame-by-frame hold), the film camera let go. */
async function flight() {
  window.__cine.release();
  const F = await import(new URL('tools/flyby.js', location.href).href);
  if (!window.__flyby) F.run();
  window.__flyby.at(0);
  return { secs: window.__flyby.cycle };
}
/** In the page: the path played to its end (the film camera's timeline, or the flight driven by its own hold, second by
    second from 0), and every frame of it: its time from the frame clock (requestAnimationFrame), the renderer's number
    for it, the inside's ratio; and the GPU's own time of every frame the renderer numbered (?gputime: three's timestamp
    queries, render and compute passes, read back as they come and summed by frame). */
async function ride({ fly }) {
  const s = window.__game, r = s.renderer, B = r.backend, ticks = [], gpu = {}, seen = {};
  let on = true;
  const tick = (t) => { if (!on) return; ticks.push([t, r.info.frame, s.screen.inside]); requestAnimationFrame(tick); };
  const read = async () => {
    for (const type of ['render', 'compute']) {
      const P = B.timestampQueryPool?.[type]; if (!P) continue;
      await r.resolveTimestampsAsync(type);
      if (P.frames && P.frames !== seen[type]) { seen[type] = P.frames; for (const [uid, ms] of P.timestamps) { const n = uid.slice(uid.lastIndexOf(':f') + 2); gpu[n] = (gpu[n] ?? 0) + ms; } }   // (a read-back that brought nothing new keeps the last one's: not counted twice)
    }
  };
  const timing = (async () => { while (on && B.trackTimestamp) { await read(); await new Promise(requestAnimationFrame); } })();
  requestAnimationFrame(tick);
  if (fly) {
    const c = window.__flyby.cycle; let t0 = null;
    await new Promise((res) => { const step = (now) => { t0 ??= now; const q = (now - t0) / 1000; window.__flyby.at(Math.min(q, c)); if (q < c) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
  } else {
    window.__cine.play();
    await new Promise((res) => { const step = () => (window.__cine.playing ? requestAnimationFrame(step) : res()); requestAnimationFrame(step); });
  }
  on = false; await timing;
  if (B.trackTimestamp) await read();   // (the last frames' times)
  return { ticks, gpu, timestamps: !!B.trackTimestamp };
}
/** A path's frames, told: the frame clock's steps (ms) and the GPU's own times, their median, 99th percentile, worst,
    and how many were over the gate's line; the inside's ratio. */
function told({ ticks, gpu, timestamps }) {
  const steps = ticks.slice(1).map((t, i) => t[0] - ticks[i][0]), g = ticks.map((t) => gpu[t[1]]).filter((v) => v != null), r = ticks.map((t) => t[2]);
  const of = (xs, line) => (xs.length ? { frames: xs.length, median: rank(xs, 0.5), p99: rank(xs, 0.99), worst: Math.max(...xs), over: xs.filter((v) => v > line).length } : null);
  return { frame: of(steps, FRAME + JITTER), gpu: timestamps ? of(g, BUDGET) : null, inside: r.length ? { least: Math.min(...r), median: rank(r, 0.5) } : null };
}

const run = promisify(execFile);
/** The whole browser's memory, four times a second: every process of the Chrome on this profile (the browser, its GPU
    process, its pages, its helpers: those that name the profile and every one they started), summed two ways: the
    resident size (ps), and on a Mac the physical footprint (footprint), which counts what Metal holds for the GPU where
    the resident size does not (read on 2026-11-17: a Chrome GPU process 52 MB resident had a footprint of 1.16 GB). The
    gate goes by the footprint where there is one. The most it reached, overall and on each part of the run (`phase`). */
function memory(dir) {
  const W = { phase: 'the start', peak: { bytes: 0 }, rss: 0, phases: {}, looks: 0 }, mac = process.platform === 'darwin'; let busy = false;
  const look = async () => {
    if (busy) return; busy = true;
    try {
      const rows = [];
      for (const line of (await run('ps', ['-A', '-o', 'pid=,ppid=,rss=,command='])).stdout.split('\n')) { const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/); if (m) rows.push({ pid: +m[1], ppid: +m[2], rss: +m[3] * 1024, cmd: m[4] }); }
      const ours = new Map(rows.filter((p) => p.cmd.includes(dir)).map((p) => [p.pid, p]));
      for (let more = true; more;) { more = false; for (const p of rows) if (!ours.has(p.pid) && ours.has(p.ppid)) { ours.set(p.pid, p); more = true; } }
      if (!ours.size) return;
      let foot = null;
      if (mac) {   // (a process gone between the two looks makes footprint fail for it alone: what it did say is read)
        const out = await run('footprint', ['--noCategories', '-f', 'bytes', ...[...ours.keys()].flatMap((pid) => ['-p', `${pid}`])]).then((r) => r.stdout, (e) => e.stdout ?? '');
        foot = new Map([...out.matchAll(/\[(\d+)\]:.*?Footprint:\s*(\d+) B/g)].map((m) => [+m[1], +m[2]]));
      }
      const of = (p) => (foot ? foot.get(p.pid) ?? 0 : p.rss), bytes = [...ours.values()].reduce((s, p) => s + of(p), 0);
      W.looks++; W.rss = Math.max(W.rss, [...ours.values()].reduce((s, p) => s + p.rss, 0));
      if (bytes > W.peak.bytes) { const by = {}; for (const p of ours.values()) { const k = p.cmd.match(/--type=([\w-]+)/)?.[1] ?? 'browser'; by[k] = (by[k] ?? 0) + of(p); } W.peak = { bytes, phase: W.phase, by }; }
      if (bytes > (W.phases[W.phase] ?? 0)) W.phases[W.phase] = bytes;
    } finally { busy = false; }
  };
  const timer = setInterval(() => look().catch(() => {}), 250);
  W.stop = () => { clearInterval(timer); return { measure: mac ? 'physical footprint' : 'resident size', peak: W.peak, rss: W.rss, phases: W.phases, looks: W.looks }; };
  return W;
}

/** One pass over the paths in a page of `ctx` (a profile on disk), the memory watcher told where the run is. */
async function travel(ctx, list, mem) {
  const { page, errors, url, start, close } = await open(ctx, { query: 'gputime' }), out = { url, start, paths: {} };
  try {
    await page.evaluate(() => { window.__cine.dof = false; });   // (the walker's picture: no lens blur; the governor and the clock run, as in the game)
    for (const p of list) {
      mem.phase = `before ${p.name}`;
      const c = await page.evaluate(p.flyby ? flight : course, p);
      await page.evaluate(settled, { wait: WAIT, at: `the start of ${p.name}` });
      mem.phase = p.name;
      out.paths[p.name] = { secs: c.secs, ...told(await page.evaluate(ride, { fly: !!p.flyby })) };
    }
  } finally { out.errors = errors; said(errors); await close(); }
  return out;
}
async function paths(opt) {
  const list = pick(PATHS, opt.paths, 'path'), dir = mkdtempSync(join(tmpdir(), 'gate-profile-')), out = {};
  try {
    for (const cache of ['cold', 'warm']) {   // a fresh profile, then the same one again with all it kept: the browser's caches and the game's own
      const ctx = await launch(opt, dir), mem = memory(dir);
      try { out[cache] = await travel(ctx, list, mem); } finally { const m = mem.stop(); if (out[cache]) out[cache].memory = m; await ctx.close(); }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const fails = [];
  console.log(`paths: each frame's time by the frame clock and by the GPU's own (?gputime); the whole browser's memory (${out.cold.url})`);
  console.log(`  ${'path'.padEnd(8)}${'cache'.padEnd(6)}${'frames'.padStart(7)}${'median'.padStart(8)}${'p99'.padStart(8)}${'worst'.padStart(8)}${'>16.7'.padStart(7)}${'GPU p99'.padStart(9)}${'worst'.padStart(8)}${`>${BUDGET}`.padStart(6)}${'memory'.padStart(10)}`);
  for (const p of list) for (const cache of ['cold', 'warm']) {
    const r = out[cache].paths[p.name], F = r.frame, G = r.gpu, m = out[cache].memory.phases[p.name];
    console.log(`  ${p.name.padEnd(8)}${cache.padEnd(6)}${String(F?.frames ?? 0).padStart(7)}${f(F?.median, 1)}${f(F?.p99, 1)}${f(F?.worst, 1)}${String(F?.over ?? '–').padStart(7)}${f(G?.p99, 2, 9)}${f(G?.worst, 2)}${String(G?.over ?? '–').padStart(6)}${(m ? gb(m) : '–').padStart(10)}`);
    if (F?.over) fails.push(`${p.name} ${cache}: ${F.over} frames over 16.7 ms`);
    if (G?.over) fails.push(`${p.name} ${cache}: ${G.over} frames over ${BUDGET} ms of GPU`);
  }
  const most = out.cold.memory.peak.bytes >= out.warm.memory.peak.bytes ? out.cold.memory.peak : out.warm.memory.peak;
  if (most.bytes > MEMORY) fails.push(`memory ${gb(most.bytes)}`);
  console.log(`  the world settled where it starts in ${(out.cold.start.ms / 1000).toFixed(1)} s cold, ${(out.warm.start.ms / 1000).toFixed(1)} s warm`);
  console.log(`  the most memory, ${out.cold.memory.measure}: ${gb(most.bytes)}, ${most.phase} (${Object.entries(most.by ?? {}).map(([k, b]) => `${k} ${gb(b)}`).join(', ')}); resident, at most ${gb(Math.max(out.cold.memory.rss, out.warm.memory.rss))}`);
  if (!out.cold.paths[list[0].name].gpu) console.log('  (no GPU times: the page had no timestamp queries)');
  console.log(`  the gate in motion (no frame over 16.7 ms, the GPU within ${BUDGET} ms in every frame, at most 8 GB): ${fails.length ? 'NOT MET: ' + fails.join('; ') : 'met'}`);
  return { ...out, peak: most.bytes, pass: !fails.length, fails };
}

// ---- motion: check 4, nothing pops ----
/** The line no frame's worst tile may cross in motion: a 32-pixel tile's mean FLIP of the change detail made in one
    frame. Provisional: until Samuel's pairs set the threshold of visibility (check 3), a little over twice the stills'
    noise floor (≤ 0.022, stage 2a). */
const POP = 0.05;

/** The frames the pages send (their raw RGBA bytes, POSTed: far quicker than through evaluate), each kept under its key
    until it is taken, in a SharedArrayBuffer the change's workers read without a copy. */
async function receiver() {
  const kept = new Map(), wanted = new Map();
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), key = u.searchParams.get('key'), parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => {
      const b = Buffer.concat(parts), data = new SharedArrayBuffer(b.length); new Uint8Array(data).set(b);
      const f = { w: +u.searchParams.get('w'), h: +u.searchParams.get('h'), data };
      res.writeHead(200, { 'access-control-allow-origin': '*' }); res.end();
      if (wanted.has(key)) { wanted.get(key)(f); wanted.delete(key); } else kept.set(key, f);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const take = (key) => { const f = kept.get(key); if (f) { kept.delete(key); return Promise.resolve(f); } return new Promise((r) => wanted.set(key, r)); };
  return { url: `http://127.0.0.1:${server.address().port}/frame`, take, close: () => server.close() };
}
/** n workers measuring frames' change (tools/gate/change.js), each frame to the next one free. */
function pool(n) {
  const ws = Array.from({ length: n }, () => new Worker(new URL('./gate/change.js', import.meta.url))), free = [...ws], queue = [], out = new Map();
  let id = 0;
  const next = () => { while (free.length && queue.length) { const [job, r] = queue.shift(); out.set(job.i, r); free.pop().postMessage(job); } };
  for (const w of ws) w.on('message', (m) => { const r = out.get(m.i); out.delete(m.i); free.push(w); next(); if (m.error) r.no(new Error(m.error)); else r.ok(m); });
  return {
    run: (job) => new Promise((ok, no) => { queue.push([{ ...job, i: id++ }, { ok, no }]); next(); }),
    get busy() { return queue.length + out.size; },
    close: () => Promise.all(ws.map((w) => w.terminate())),
  };
}

/** One path, frame by frame in both pages (L as the game draws, R the truth), each frame's change measured as it comes.
    The world's clock stands at T where the path starts; frame i is i / fps seconds in. */
async function along(p, { L, R, fps, T, net, work, workers, keep, to, floor = false }) {
  const fly = !!p.flyby, t0 = Date.now();
  const c = fly ? { secs: await L.page.evaluate(async () => (await import(new URL('tools/flyby.js', location.href).href)).cycleOf('zoom')) } : await L.page.evaluate(course, p);
  if (!fly) await R.page.evaluate(course, p);
  const secs = Math.min(c.secs, to ?? Infinity), n = Math.floor(secs * fps + 1e-6) + 1;
  const a = await L.page.evaluate(rest, { T, fly, wait: WAIT }), b = await R.page.evaluate(rest, { T, fly, jit: a.jit, wait: WAIT });
  console.log(`  ${p.name}: ${n} frames over ${secs.toFixed(1)} s; settled at its start in ${(a.ms / 1000).toFixed(1)} s (LOD, ${a.frames} frames) and ${(b.ms / 1000).toFixed(1)} s (truth, ${b.frames}, ${b.aligned} more to draw at the LOD's places)`);
  const frames = [], top = [], jobs = new Set();
  let before = null;
  for (let i = 0; i < n; i++) {
    const s = i / fps, t = T + s;
    const l = await L.page.evaluate(shot, { s, T: t, fly, url: net.url, key: `L${i}` });
    const r = await R.page.evaluate(shot, { s, T: t, fly, url: net.url, key: `R${i}`, whole: !floor, jit: l.jit });
    const now = { L: await net.take(`L${i}`), R: await net.take(`R${i}`) }, f = { i, s: +s.toFixed(4), again: r.again, ...(r.out ? { out: r.out } : {}), ...(r.late ? { late: true } : {}), ...(l.jit[0] !== r.jit[0] || l.jit[1] !== r.jit[1] ? { places: 'apart' } : {}) };
    frames.push(f);
    if (before) {
      const job = work.run({ w: now.L.w, h: now.L.h, L: now.L.data, Lb: before.L.data, R: now.R.data, Rb: before.R.data }).then((m) => {
        Object.assign(f, { mean: +m.mean.toFixed(6), p99: +m.p99.toFixed(6), worst: { ...m.worst, value: +m.worst.value.toFixed(6) } });
        top.push({ ...f, look: m.look, width: now.L.w }); top.sort((x, y) => y.worst.value - x.worst.value); top.length = Math.min(top.length, keep * 4);
      });
      jobs.add(job); job.finally(() => jobs.delete(job));
      while (work.busy > workers * 2) await Promise.race(jobs);   // (no more frames in hand than the workers will soon take)
    }
    before = now;
    if (i && (i % 25 === 0 || i === n - 1)) { const done = frames.filter((x) => x.worst), w = done.reduce((m, x) => Math.max(m, x.worst.value), 0); console.log(`    ${String(i).padStart(5)} / ${n - 1}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(1)} s a frame; the worst tile so far ${w.toFixed(4)}`); }
  }
  await Promise.all(jobs);
  const ms = frames.filter((x) => x.worst), ws = ms.map((x) => x.worst.value), worst = ms.reduce((m, x) => (x.worst.value > (m?.worst.value ?? -1) ? x : m), null);
  // the frames shown: the worst, none within half a second of one shown before
  const shown = []; for (const x of top) if (shown.length < keep && !shown.some((y) => Math.abs(y.s - x.s) < 0.5)) shown.push(x);
  return {
    secs, fps, frames: ms.length, ms: Date.now() - t0, start: { lod: a, truth: b },
    worst: worst && { value: worst.worst.value, frame: worst.i, s: worst.s, x: worst.worst.x, y: worst.worst.y },
    p99: rank(ws, 0.99), median: rank(ws, 0.5), over: ws.filter((v) => v > POP).length,
    again: frames.reduce((s, x) => s + x.again, 0), late: frames.filter((x) => x.late).length, apart: frames.filter((x) => x.places).length,
    list: frames, shown,
  };
}

/** The filmstrip of a path: its worst frames, drawn in a blank page of `ctx` (no world: only a canvas), a JPEG. */
async function filmstrip(ctx, file, { title, sub, r, other = 'truth' }) {
  const B = await ctx.newPage(), b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  try {
    await B.setContent('<!doctype html><html><body style="margin:0;background:#101418"></body></html>');
    const rows = r.shown.map((x) => ({ label: `frame ${x.i} · ${x.s.toFixed(2)} s in · worst tile ${x.worst.value.toFixed(4)} at ${x.worst.x},${x.worst.y}${x.again ? ` · truth drawn ${x.again + 1}×` : ''}`, s: x.s, value: x.worst.value, worst: x.worst, width: x.width,
      thumb: { w: x.look.thumb.w, h: x.look.thumb.h, rgb: b64(x.look.thumb.rgb) }, crops: x.look.crops.map(b64), crop: CROP, tile: x.look.tile }));
    const url = await B.evaluate(film, { title, sub, width: 1600, series: r.list.filter((x) => x.worst).map((x) => [x.s, x.worst.value]), line: POP, rows, names: ['LOD before', 'LOD now', `${other} before`, `${other} now`, 'the change, FLIP'] });
    writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  } finally { await B.close(); }
}

/** Check 4: every path frame by frame, as the game draws it and at full detail, the change detail made in each frame
    measured, against POP in every frame's worst tile. Two pages of one Chrome, each its world come and settled, then
    held by the gate's clock (tools/gate/motion.js stepper): each frame drawn when the gate asks, at the same moment of
    the world's clock and the same place of a pixel in both, the truth's drawn again until nothing was still out. */
async function motion(opt) {
  const list = pick(PATHS, opt.paths, 'path'), fps = +(opt.fps ?? 60), keep = +(opt.keep ?? 6), workers = +(opt.workers ?? 2), to = opt.to != null ? +opt.to : null;
  const floor = !!opt.floor, tag = (opt.tag || commit()) + (floor ? '-floor' : ''), dir = `${OUT}motion-${tag}/`, report = { tag, fps, line: POP, floor, when: new Date().toISOString(), screen: SCREEN, inside: INSIDE, paths: {} };
  mkdirSync(dir, { recursive: true });
  const net = await receiver(), work = pool(workers), ctx = await launch(opt), pages = {};
  console.log(`motion → .gate/motion-${tag}/ (${BASE}): every path at ${fps} frames a second, as the game draws it and ${floor ? 'as it draws it again (the noise floor)' : 'as the truth does'}`);
  try {
    for (const [k, truth] of [['lod', false], floor ? ['again', false] : ['truth', true]]) {   // (--floor: the game's frames against themselves)
      await locked(`motion: the ${k} page`, async () => {
        const P = (pages[k] = await open(ctx, { query: truth ? (opt.reach ? `truth=${opt.reach}` : 'truth') : '', init: stepper }));
        await P.page.evaluate(prepare, { inside: INSIDE, time: null });
        P.begun = await P.page.evaluate(begin, { truth });
        console.log(`  the ${k} page came and settled in ${(P.start.ms / 1000).toFixed(1)} s (${P.url}); ${P.begun.visible}`);
      });
    }
    const R = floor ? pages.again : pages.truth;
    let clock = Math.max(pages.lod.begun.clock, R.begun.clock);
    for (const p of list) {
      const T = 100 * Math.ceil((clock + 5) / 100);   // (the next whole hundred seconds on the world's clock, past both pages' own)
      const r = (report.paths[p.name] = await locked(`motion: ${p.name}`, () => along(p, { L: pages.lod, R, fps, T, net, work, workers, keep, to, floor })));
      clock = T + r.secs;
      await filmstrip(ctx, `${dir}${p.name}.jpg`, { title: `gate.js motion · ${p.name} · ${tag}`, sub: `the change detail made in each frame, ((LOD − truth) now) − ((LOD − truth) a frame before), FLIP in 32-px tiles at 4K · ${r.frames} frames at ${fps} a second · worst tile ${r.worst?.value.toFixed(4)} at ${r.worst?.s.toFixed(2)} s · ${r.over} frames over the line ${POP} (provisional)`, r, other: floor ? 'LOD again' : 'truth' });
      const { shown, ...kept } = r; report.paths[p.name] = kept; save(`${dir}report.json`, report);
      console.log(`  ${p.name}: the worst tile ${r.worst?.value.toFixed(4)} (frame ${r.worst?.frame}, ${r.worst?.s.toFixed(2)} s, at ${r.worst?.x},${r.worst?.y}); p99 ${r.p99?.toFixed(4)}; ${r.over} over ${POP}; ${(r.ms / 60e3).toFixed(1)} min → .gate/motion-${tag}/${p.name}.jpg`);
    }
  } finally {
    for (const P of Object.values(pages)) { said(P.errors); await P.close().catch(() => {}); }
    await ctx.close(); net.close(); await work.close();
  }
  const fails = Object.entries(report.paths).filter(([, r]) => r.over).map(([k, r]) => `${k} ${r.over} frame(s), the worst ${r.worst.value.toFixed(4)}`);
  console.log(`motion, ${tag}: the change detail made in each frame (FLIP of ((LOD − truth) now) − ((LOD − truth) a frame before), 32-px tiles, 4K)`);
  console.log(`  ${'path'.padEnd(8)}${'frames'.padStart(7)}${'worst'.padStart(9)}${'at s'.padStart(8)}${'p99'.padStart(9)}${'median'.padStart(9)}${`>${POP}`.padStart(7)}${'truth again'.padStart(13)}`);
  for (const [k, r] of Object.entries(report.paths)) console.log(`  ${k.padEnd(8)}${String(r.frames).padStart(7)}${f(r.worst?.value, 4, 9)}${f(r.worst?.s, 2)}${f(r.p99, 4, 9)}${f(r.median, 4, 9)}${String(r.over).padStart(7)}${String(r.again).padStart(13)}`);
  console.log(`  the merge rule, nothing pops (no frame's worst tile over ${POP}, provisional): ${fails.length ? 'NOT MET: ' + fails.join('; ') : 'met'}`);
  report.pass = !fails.length; report.fails = fails; save(`${dir}report.json`, report);
  return report;
}

// ---- real: check 4a, held against photographs ----
const PYTHON = process.env.GATE_PYTHON || `${homedir()}/.venvs/theos-real/bin/python`;   // (the venv tools/gate/README.md makes)
const IMAGE = /\.(png|jpe?g|webp|tiff?)$/i;
/** The photographs of a folder, as its manifest.json lists them (tools/gate/README.md): each { file, kind, licence,
    distance_m ([near, far] metres, one number, or null: inside or not known), gate? (the one gate view it is of) }, as
    the gate reads them: { file (its path), kind, near, far, gate }. A folder without one: every picture in it, of no
    kind (held against every render, as one set). */
function photosIn(dir) {
  const at = `${dir.replace(/\/$/, '')}/`, m = `${at}manifest.json`;
  if (!existsSync(m)) return readdirSync(at).filter((n) => IMAGE.test(n)).sort().map((n) => ({ file: `${at}${n}`, kind: null, near: null, far: null, gate: null }));
  const list = JSON.parse(readFileSync(m, 'utf8')).photos ?? [], bad = [];
  for (const [k, p] of list.entries()) {
    const miss = ['file', 'kind', 'licence'].filter((x) => p[x] == null || p[x] === ''), d = p.distance_m;
    if (miss.length) bad.push(`photo ${k} (${p.file ?? '?'}) has no ${miss.join(', ')}`);
    else if (!KINDS.includes(p.kind)) bad.push(`${p.file}: kind '${p.kind}' is none of ${KINDS.join(', ')}`);
    else if (d != null && !(typeof d === 'number' ? d >= 0 : Array.isArray(d) && d.length === 2 && d[0] >= 0 && d[1] >= d[0])) bad.push(`${p.file}: distance_m ${JSON.stringify(d)} is neither metres, [near, far] nor null`);
    else if (p.gate && !VIEWS.some((v) => v.name === p.gate)) bad.push(`${p.file}: gate '${p.gate}' is not a gate view`);
    else if (!existsSync(`${at}${p.file}`)) bad.push(`${p.file} is not in ${at}`);
  }
  if (bad.length) throw new Error(`${m}:\n  ${bad.join('\n  ')}`);
  return list.map((p) => { const d = p.distance_m; return { file: `${at}${p.file}`, kind: p.kind, near: d == null ? null : +[].concat(d)[0], far: d == null ? null : +[].concat(d).at(-1), gate: p.gate ?? null, licence: p.licence }; });
}
/** The photos a view is held against: those that name it, else those of its kind from about as far (their distances
    within a factor of two of its own; where either is not known, its kind alone). */
const photosFor = (v, photos) => {
  const named = photos.filter((p) => p.gate === v.name);
  if (named.length) return named;
  return photos.filter((p) => !p.gate && p.kind === v.kind && (v.distance == null || p.near == null || (p.far >= v.distance / 2 && p.near <= v.distance * 2)));
};
async function real(what, opt) {
  if (!what || !opt.photos) throw new Error('real <tag | folder> --photos <folder>: renders (a set of stills in .gate/, or a folder) against photographs (a folder with its manifest.json: tools/gate/README.md)');
  const rdir = existsSync(`${OUT}${what}/`) ? `${OUT}${what}/` : `${what.replace(/\/$/, '')}/`, photos = photosIn(opt.photos);
  if (!existsSync(PYTHON)) throw new Error(`no Python at ${PYTHON} (GATE_PYTHON): make the venv as tools/gate/README.md says`);
  const renders = readdirSync(rdir).filter((n) => IMAGE.test(n) && !n.startsWith('real-')).sort().map((n) => ({ file: `${rdir}${n}`, view: VIEWS.find((v) => n.replace(IMAGE, '') === v.name) ?? null }));
  if (!renders.length || !photos.length) throw new Error(`nothing to compare: ${renders.length} renders in ${rdir}, ${photos.length} photos in ${opt.photos}`);
  const groups = [{ name: 'all', renders: renders.map((r) => r.file), photos: photos.map((p) => p.file) }];
  for (const k of KINDS) {   // by kind, and by view, where there are photos to hold them against
    const R = renders.filter((r) => r.view?.kind === k), P = photos.filter((p) => p.kind === k);
    if (R.length && P.length) groups.push({ name: `kind ${k}`, renders: R.map((r) => r.file), photos: P.map((p) => p.file) });
    for (const r of R) { const Q = photosFor(r.view, photos); if (Q.length) groups.push({ name: r.view.name, renders: [r.file], photos: Q.map((p) => p.file) }); }
  }
  const dir = mkdtempSync(join(tmpdir(), 'gate-real-')), job = `${dir}/job.json`, out = `${dir}/out.json`;
  save(job, { groups });
  console.log(`real: ${renders.length} renders (${rdir}) against ${photos.length} photographs (${opt.photos}); ${groups.length} groups`);
  try {
    await new Promise((ok, no) => { const p = spawn(PYTHON, [new URL('./gate/real.py', import.meta.url).pathname, job, out, '--device', opt.device ?? 'cpu', ...(opt['no-clip'] ? ['--no-clip'] : [])], { stdio: ['ignore', 'inherit', 'pipe'] }); let e = ''; p.stderr.on('data', (d) => { e += d; if (opt.verbose) process.stderr.write(d); }); p.on('exit', (c) => (c ? no(new Error(`tools/gate/real.py failed (${c}):\n${e.slice(-2000)}`)) : ok())); });
    const r = JSON.parse(readFileSync(out, 'utf8'));
    const report = { renders: rdir, photos: opt.photos, when: new Date().toISOString(), clip: 'ViT-L/14 at 336 px, OpenAI', groups: r.groups, images: r.images };
    console.log(`  ${'group'.padEnd(28)}${'n'.padStart(7)}${'CMMD'.padStart(9)}${'L* EMD'.padStart(9)}${'ΔE mean'.padStart(9)}${'Δ chroma'.padStart(10)}${'Δ RMS'.padStart(8)}${'Δ local'.padStart(9)}${'Δ slope'.padStart(9)}`);
    for (const g of r.groups) { const d = g.stats.diff ?? {}; console.log(`  ${g.name.padEnd(28)}${`${g.renders}:${g.photos}`.padStart(7)}${f(g.cmmd, 3, 9)}${f(d.lightness, 2, 9)}${f(d.colour, 2, 9)}${f(d.chroma, 2, 10)}${f(d.rms, 2, 8)}${f(d.local, 2, 9)}${f(d.slope, 3, 9)}`); }
    const a = r.groups[0].stats;
    console.log(`  the sets themselves (renders | photos): L* ${a.renders.L.toFixed(1)} | ${a.photos.L.toFixed(1)}, chroma ${a.renders.C.toFixed(1)} | ${a.photos.C.toFixed(1)}, RMS ${a.renders.rms.toFixed(1)} | ${a.photos.rms.toFixed(1)}, local ${a.renders.local.toFixed(2)} | ${a.photos.local.toFixed(2)}, slope ${a.renders.slope.toFixed(2)} | ${a.photos.slope.toFixed(2)}`);
    save(`${rdir}real.json`, report);
    console.log(`  → ${rdir}real.json (check 4a: every number falls stage by stage, never rises)`);
    return report;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Everything, for this code: its stills and the truth's, their FLIP, the bench, the compile, then the paths (their own
    Chrome, the gate's closed first: nothing else running while frames are timed); one table. */
async function all(opt) {
  const tag = opt.tag || commit(), chrome = await launch(opt);
  let a, t, b, c;
  try { a = await stills(chrome, { tag, views: opt.views }); t = await stills(chrome, { tag: `${tag}-truth`, truth: true, views: opt.views, tiles: opt.tiles }); b = await locked('bench', () => bench(chrome, opt)); c = await locked('compile', () => compile(chrome, opt)); }
  finally { await chrome.close(); }
  const d = await diff(a, t, opt), p = await locked('paths', () => paths(opt));
  console.log(`\nthe gate, ${tag}: FLIP against the truth (4K, ${(+(opt.ppd ?? PPD)).toFixed(1)} px a degree); GPU ms drawn at ${px(b.drawn)}`);
  console.log(`  ${'view'.padEnd(28)}${'mean'.padStart(8)}${'p99 tile'.padStart(10)}${'worst tile'.padStart(12)}${'GPU ms'.padStart(9)}`);
  for (const v of pick(VIEWS, opt.views, 'view')) {
    const r = d.views[v.name], ms = v.bench ? b.views[v.bench] : null;
    if (r) console.log(`  ${v.name.padEnd(28)}${f(r.mean, 4)}${f(r.p99, 4, 10)}${f(r.worst.value, 4, 12)}${ms == null ? '' : f(ms, 2, 9)}`);
  }
  console.log(`  ${'most'.padEnd(28)}${f(d.most.mean, 4)}${f(d.most.p99, 4, 10)}${f(d.most.worst, 4, 12)}${f(b.worst, 2, 9)}  (budget ${BUDGET} ms: ${b.pass ? 'within' : 'OVER'})`);
  console.log(`  ${'path'.padEnd(8)}${'cache'.padEnd(6)}${'p99 ms'.padStart(8)}${'worst'.padStart(8)}${'>16.7'.padStart(7)}${'GPU p99'.padStart(9)}${`>${BUDGET}`.padStart(6)}`);
  for (const q of pick(PATHS, opt.paths, 'path')) for (const cache of ['cold', 'warm']) { const r = p[cache].paths[q.name]; console.log(`  ${q.name.padEnd(8)}${cache.padEnd(6)}${f(r.frame?.p99, 1)}${f(r.frame?.worst, 1)}${String(r.frame?.over ?? '–').padStart(7)}${f(r.gpu?.p99, 2, 9)}${String(r.gpu?.over ?? '–').padStart(6)}`); }
  console.log(`  in motion: ${p.pass ? 'met' : 'NOT MET'}; the most memory ${gb(p.peak)} (gate 8 GB); compiled at start: ${(c.bytes / 1e6).toFixed(2)} MB of WGSL in ${c.n} modules`);
  save(`${OUT}${tag}/summary.json`, { tag, when: new Date().toISOString(), flip: d, bench: b, compile: c, paths: p });
}

// ---- the command line ----
const FLAGS = new Set(['truth', 'headed', 'fresh', 'verbose', 'no-clip', 'jpeg', 'floor']);   // (options without a value)
const [cmd, ...args] = process.argv.slice(2), pos = [], opt = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--')) pos.push(a);
  else if (FLAGS.has(a.slice(2))) opt[a.slice(2)] = true;
  else opt[a.slice(2)] = args[++i];
}
const WITH = { stills: (c) => stills(c, opt), noise: (c) => noise(c, pos[0], opt), bench: (c) => locked('bench', () => bench(c, opt)), compile: (c) => locked('compile', () => compile(c, opt)) };
try {
  let r;
  if (cmd === 'diff') await diff(pos[0], pos[1], opt);
  else if (cmd === 'paths') r = await locked('paths', () => paths(opt));   // (timed: held whole)
  else if (cmd === 'motion') r = await motion(opt);
  else if (cmd === 'real') r = await real(pos[0], opt);
  else if (cmd === 'all') await all(opt);
  else if (WITH[cmd]) { const chrome = await launch(opt); try { r = await WITH[cmd](chrome); } finally { await chrome.close(); } }
  else { console.log('bun tools/gate.js stills | diff | noise | bench | compile | paths | motion | real | all: see the top of tools/gate.js'); process.exitCode = cmd ? 1 : 0; }
  if (['bench', 'compile', 'paths'].includes(cmd)) { mkdirSync(OUT, { recursive: true }); save(`${OUT}${cmd}.json`, r); }   // (the numbers kept: .gate/bench.json and so on)
} catch (e) { console.error(`gate: ${e.message}`); process.exitCode = 1; }
finally { for (const d of FRESH) rmSync(d, { recursive: true, force: true }); }
