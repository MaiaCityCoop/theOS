// The gate (intent 0038): one driver for every check of the picture and of its cost. Run from TheGame/ against the dev
// server (http://localhost:5180/game/; another with --url <url> or GATE_URL: a worktree's own server), in the system's
// own Chrome through Playwright, headless (--headed: in a window, for frame times as a screen paces them):
//
//   bun tools/gate.js stills [--tag t] [--truth] [--views a,b]   the gate's views (tools/gate/views.js) as PNGs at the output (OUTPUT) in
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
//                        [--twice] [--ratchet]                   and each part of each view against its ceiling
//                                                                (tools/gate/ceilings.js): shown, never blocking; --twice: the
//                                                                noise measured from two runs; --ratchet: main's nightly,
//                                                                each ceiling lowered to what is measured, never raised; where
//                                                                it went, pass by pass and by part (geometry, light,
//                                                                ground, upscale and post: bench.js CLASSES)
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
//                                                                and all together; in Python (GATE_PYTHON); the photos'
//                                                                own spread beside each; a class's distances may only
//                                                                go down (tools/gate/real-ratchet.json; exit 1 if one
//                                                                rose; --ratchet: main's run lowers them)
//   --query q (with any of them)                                 more of every page's address: --query stress, the
//                                                                stress world (src/scatter/stress.js)
//   bun tools/gate.js all [--tag t] [--views a,b]                stills of this code and of ?truth, their diff, the
//                                                                bench, the compile and the paths, in one table
//
// The GPU is shared with other runs: each part of a run that draws (a page come, a view or a tile, a path in motion, the
// real gate on a GPU) takes the machine's GPU lock in its turn (tools/gpu/lock.js: one queue, oldest first; GPU_OWNER
// names the run), and lets it go after; meanwhile the page is held on the gate's clock (tools/gate/clock.js) and draws
// nothing. A gate run under `bun tools/gpu/lock.js take <owner> -- …` holds the lock whole.
//
// It never waits on a timer for the picture: once the camera has moved it waits for window.__game.settle() (src/core/
// settle.js), which resolves when nothing streams or builds for that camera and the picture built over time has come to
// rest. A page without it is an error, and says so. The screen is the output (src/core/budget.js OUTPUT, 1920×1080 since
// 2026-11-18 22:15) at one pixel a point, so the game's canvas is the output's own pixels. For stills the world is drawn
// inside at INSIDE (no more than the canvas) and laid on the screen by the temporal pass, the governor held where it starts and the world's clock
// standing still at the same moment in every run, so two runs of the same code draw the same. On the paths the governor
// and the clock run, as in the game. Chrome runs on the gate's own profile, .gate/chrome/, kept from run to run (the
// world is made in half a minute, not two); the paths make a fresh one for their cold run.
import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VIEWS, PATHS } from './gate/views.js';
import { FIRST_FRAME } from '../src/core/marks.js';
import { BUDGET, CLASSES, classOf } from './bench.js';
import { flip, tiles, heat, readPNG, writePNG, PPD } from './gate/flip.js';
import { OUTPUT } from '../src/core/budget.js';
import { stepper } from './gate/clock.js';
import { locked, unlock } from './gpu/lock.js';
import { tiled } from './gate/tiles.js';
import { sideBySide } from './gate/sheet.js';
import { guard, closeHard } from './gate/guard.js';

const URL_AT = process.argv.indexOf('--url'), BASE = (URL_AT > 0 && process.argv[URL_AT + 1]) || process.env.GATE_URL || 'http://localhost:5180/game/';
const Q_AT = process.argv.indexOf('--query'), EXTRA = Q_AT > 0 ? process.argv[Q_AT + 1] : '';   // (more of the address for every page the gate opens: --query stress, the stress world)
const OUT = new URL('../.gate/', import.meta.url).pathname;   // TheGame/.gate/: made again by every run, not kept in git
// (the output the gate draws: OUTPUT (src/core/budget.js), at one pixel a point: the canvas is the output's own pixels)
const SCREEN = { ...OUTPUT, dpr: 1 }, INSIDE = 4 / 3, TIME = 100;   // (TIME: the seconds the world's clock stands at for stills)
const FRAME = 1000 / 60, JITTER = 1, MEMORY = 8e9;   // the hard gates in motion: no frame longer than 1/60 s (the frame clock's own jitter allowed), the GPU within BUDGET ms in every frame, the whole browser within 8 GB
const WAIT = 300e3;   // ms the world may take to come, or to settle, before the gate calls it broken (an error; never a wait for readiness)
const ARGS = ['--enable-unsafe-webgpu', '--enable-webgpu-developer-features'];   // (the second: the GPU's timestamps to the nanosecond, not rounded to a tenth of a millisecond: the bench times passes of a few hundredths)

// ---- the page ----
/** A page of the game in Chrome (`ctx`: launch()), its world come and settled where it starts: drawn through WebGPU,
    with window.__game.settle(), or an error. */
async function open(ctx, { path = '', query = '', init = null, wait = null } = {}) {
  query = [query, EXTRA].filter(Boolean).join('&');
  wait ??= /(^|&)truth\b/.test(query) ? 3 * WAIT : WAIT;   // (?truth's world comes in ~5 min on a fresh profile: three times the time)
  const page = guard(await ctx.newPage(), { dir: ctx.gateDir, kill: () => closeHard(ctx, ctx.gateDir), wait }), errors = [], url = new URL(path, BASE).href + (query ? `?${query}` : '');   // (every call into it answered in a time held outside it: tools/gate/guard.js)
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
    await page.goto(url, { waitUntil: 'load', timeout: wait });
    // (the start is over once the world can say it has settled, or once it has said it is ready without that: a page
    // older than src/core/settle.js)
    await page.waitForFunction(() => typeof window.__game?.settle === 'function' || window.__game?.loadMs != null, null, { timeout: wait, polling: 250 });
    // (a page on the gate's clock, tools/gate/clock.js, is held on it from here: it settles with the clock standing, the
    // wind not uncovering ground that asks for more of the land's pages, src/terrain/pages.js, and draws only when asked)
    if (init === stepper) await page.evaluate(() => window.__gateClock.start());
    if (!(await page.evaluate(() => typeof window.__game?.settle === 'function'))) throw new Error(`${url}: window.__game.settle() is missing, so the gate cannot know when the picture is ready, and it never waits on a timer. It comes with intent 0038 stage 2 (src/core/settle.js): a promise that resolves when nothing streams or builds for the camera and the picture built over time has come to rest.`);
    const start = await page.evaluate(settled, { wait, at: 'the start' });   // (the world made and settled where it starts, before anything is asked of it)
    if (!(await page.evaluate(() => !!window.__game.renderer.backend.isWebGPUBackend))) throw new Error(`${url}: drawn through WebGL, not WebGPU (Chrome gave the page no GPU adapter)`);
    return { page, errors, url, start, close };
  } catch (e) { said(errors); await close(); throw e; }
}
/** In the page: the world's ready (where it has one), then window.__game.settle(); how long that took (ms), what
    settle() said, and when it was (ms since the page began). An error after `wait` ms. */
/** In the page: the first frame that draws the world (the game's own mark, src/core/marks.js), ms from the navigation's
    start, and what was loaded before it: the bytes over the wire of the page and every resource that had come by then
    (transferSize: what a cache served is not counted), and how many files. None where the game set no mark. */
function firstFrame({ name }) {
  const m = performance.getEntriesByName(name)[0];
  if (!m) return null;
  const came = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].filter((e) => e.responseEnd <= m.startTime);
  return { ms: m.startTime, bytes: came.reduce((s, e) => s + (e.transferSize || 0), 0), files: came.length };
}
const firstSaid = (F) => (F ? `${(F.ms / 1000).toFixed(1)} s, ${(F.bytes / 1e6).toFixed(1)} MB loaded before it (${F.files} files)` : 'not marked');
async function settled({ wait, at }) {
  const s = window.__game, C = window.__gateClock, t0 = Date.now(), late = new Promise((_, no) => setTimeout(() => no(new Error(`window.__game.settle() did not resolve in ${wait / 1000} s at ${at}`)), wait + 10e3));
  // (the page on the gate's clock, tools/gate/clock.js: its frames drawn here, one after another, the clock standing,
  // from before the world's ready until it has settled)
  let done = false, said;
  if (C?.on) (async () => { while (!done) { await C.step(C.last); await new Promise((r) => setTimeout(r, 0)); } })();
  // (what held it, and till when: every 2 s, what each source still had out, src/core/settle.js waiting(); a source's
  // `until` is the last second it had anything out, its `most` the most it had at once)
  const held = {}, R = performance.getEntriesByType('resource').map((e) => e.name), path = R.filter((n) => n.includes('src/core/settle.js')).at(-1);
  const look = path ? import(path).then(({ waiting }) => setInterval(() => { const t = Math.round((Date.now() - t0) / 1000); for (const [k, n] of Object.entries(waiting())) { const h = (held[k] ||= { from: t, until: t, most: 0 }); h.until = t; h.most = Math.max(h.most, n); } }, 2000)) : null;
  try { said = await Promise.race([Promise.resolve(s.ready).then(() => s.settle({ timeout: wait })), late]); } finally { done = true; if (look) clearInterval(await look); }
  let kept = null; try { kept = JSON.parse(JSON.stringify(said ?? null)); } catch {}
  return { ms: Date.now() - t0, said: kept, now: Math.round(performance.now()), held };
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
  s.screen.fit?.();   // (the canvas as the game makes it for this window: the output's, src/core/output.js)
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
  .then((c) => Object.assign(c, { gateDir: dir }), (e) => { throw new Error(`Chrome did not start on ${dir} (is another gate run using it?): ${e.message.split('\n')[0]}`); });
/** The value at fraction q of a list's sorted values (nearest rank). */
const rank = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.max(0, Math.ceil(q * s.length) - 1)] : null; };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { unlock(); for (const d of FRESH) rmSync(d, { recursive: true, force: true }); process.exit(130); });

// ---- the commands ----
/** stills' page: ?truth (at `reach`, where given) or the game, under the GPU lock, held on the gate's clock from its
    start (tools/gate/clock.js): it settles there with the clock standing, not while the wind uncovers ground that asks
    for more of the land's pages, which on slow frames, ?truth's, it can do faster than they settle; and nothing is
    drawn between two views or tiles, so another run may have the GPU meanwhile. */
const stillsPage = (chrome, tag, truth, reach) => locked(`stills ${tag}: the page`, async () => {
  const P = await open(chrome, { query: truth ? (reach ? `truth=${reach}` : 'truth') : '', init: stepper });
  await P.page.evaluate(prepare, { inside: truth ? null : INSIDE, time: TIME });
  await P.page.evaluate(() => window.__gateClock.start());
  return P;
});
/** One view of stills drawn into `dir` (whole, or in n × n tiles: tools/gate/tiles.js), checked (valid) and said: its
    entry in gate.json. */
async function drawView(page, v, { tag, dir, n, truth, valid }) {
  const label = `stills ${tag}: ${v.name}`;
  if (n > 1) {
    const t0 = Date.now(), T = valid(await tiled(page, v, n, { go, still, locked, label }));
    writeFileSync(`${dir}${v.name}.png`, T.png);
    console.log(`  ${v.name.padEnd(28)} ${n * n} tiles in ${((Date.now() - t0) / 60e3).toFixed(1)} min, each drawn ${px(T.parts[0].drawn)} for a ${n}th of the picture each way`);
    return { tiles: n, ms: Date.now() - t0, settleMs: T.parts.map((p) => p.ms), over: T.parts.some((p) => p.over), drawn: T.parts[0].drawn };
  }
  const [a, s] = await locked(label, async () => { const a = await go(page, v); return [a, valid(await page.evaluate(still))]; });
  writeFileSync(`${dir}${v.name}.png`, Buffer.from(s.png.slice(s.png.indexOf(',') + 1), 'base64'));
  console.log(`  ${v.name.padEnd(28)} settled in ${(a.ms / 1000).toFixed(1).padStart(5)} s, drawn ${px(s.drawn)} into ${px(s.out)}${s.over ? ' (a tier had more patches than it holds: the farthest left out)' : ''}`);
  if (truth && s.drawn[0] < s.out[0]) console.log('  (the truth drawn at fewer pixels than it is shown at: ?truth is to be supersampled)');
  return { cam: a.cam, settleMs: a.ms, settle: a.said, drawn: s.drawn, out: s.out, over: s.over };
}
/** The browser's memory through a run of stills, said and kept in its gate.json (meta). */
function memorySaid(meta, mem) {
  meta.memory = mem.stop();
  console.log(`  the most memory, ${meta.memory.measure}: ${(meta.memory.peak.bytes / 1e9).toFixed(2)} GB (${meta.memory.peak.phase ?? '–'}: ${Object.entries(meta.memory.peak.by ?? {}).map(([k, b]) => `${k} ${(b / 1e9).toFixed(2)} GB`).join(', ')})`);
}
async function stills(chrome, { tag, truth = false, reach = null, views, tiles = 1 } = {}) {
  tag ||= commit() + (truth ? '-truth' : '');
  const list = pick(VIEWS, views, 'view'), dir = `${OUT}${tag}/`, n = Math.max(1, Math.round(+tiles || 1));
  const mem = chrome.gateDir ? memory(chrome.gateDir) : null;   // (the whole browser's memory through the run: the truth is the largest single consumer on the machine)
  const { page, errors, url, start, close } = await stillsPage(chrome, tag, truth, reach).catch((e) => { mem?.stop(); throw e; });
  // (a frame drawn while the GPU refused any of its work is not the game's picture: one refused buffer leaves every bind
  // group that holds it invalid, and Chrome then drops whole passes, black stills that "settled in 2.7 s" (2026-11-18,
  // ?truth's grass over WebGPU's binding limit); such a view fails, with what the GPU said)
  const valid = (x) => { const r = errors.find((e) => e.includes('GPUValidationError')); if (r) throw new Error(`the GPU refused part of the frame, so it is not the game's picture: ${r.slice(0, 400)}`); return x; };
  mkdirSync(dir, { recursive: true });
  const meta = existsSync(`${dir}gate.json`) ? JSON.parse(readFileSync(`${dir}gate.json`, 'utf8')) : { views: {} };
  Object.assign(meta, { tag, url, truth, commit: commit(), when: new Date().toISOString(), screen: SCREEN, start });
  console.log(`stills → .gate/${tag}/ (${url})${n > 1 ? `, each view in ${n} × ${n} tiles` : ''}`);
  console.log(`  the world came and settled where it starts in ${(start.ms / 1000).toFixed(1)} s; held last by ${Object.entries(start.held ?? {}).sort((a, b) => b[1].until - a[1].until).slice(0, 5).map(([k, h]) => `${k} (to ${h.until} s, at most ${h.most})`).join(', ') || 'nothing'}`);
  try {
    for (const v of list) {
      if (mem) mem.phase = v.name;
      meta.views[v.name] = await drawView(page, v, { tag, dir, n, truth, valid }).catch((e) => { meta.views[v.name] = { failed: e.message.slice(0, 600) }; throw e; });
    }
  } finally {
    if (mem) memorySaid(meta, mem);
    meta.errors = errors; save(`${dir}gate.json`, meta); said(errors); await close().catch(() => {});
  }
  return tag;
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
    if (jpeg) await sideBySide(`${dir}${v.name}.jpg`, { title: `${v.name}: ${a} against ${b}`, sub: `FLIP at ${OUTPUT.width}×${OUTPUT.height} (${(+ppd).toFixed(1)} px a degree): mean ${t.mean.toFixed(4)}, the 99th percentile of its 32-px tiles ${t.p99.toFixed(4)}, the worst tile ${t.worst.value.toFixed(4)} (outlined)`, A, B, heatRGB: H, worst: t.worst, names: [a, b] });
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
    game does: inside at `ratio`, laid on the canvas by the upscale pass (the whole frame's GPU time), and says
    where it went: every pass of the frame on the GPU's own clock, under the name of the part that drew it (the packing,
    the clouds, the shadow map, the culling, the prepass, the land's pages, the colour, the upscale, …), the frame's parts
    each added up (bench.js CLASSES: geometry, light, ground, upscale and post; what none of them names, other), and the
    colour pass's share of the shadows (the same frames with its shadow reads off). */
async function bench(chrome, { ratio = INSIDE, frames = 60 } = {}) {
  const { page, errors, url, close } = await open(chrome, { query: 'gputime' }), out = { ratio: +ratio, views: {}, span: {}, passes: {}, classes: {}, shading: {} };
  try {
    await page.evaluate(prepare, { inside: null, time: TIME });
    for (const v of VIEWS.filter((x) => x.bench)) {
      await go(page, v);
      const r = await page.evaluate(async ({ name, ratio, frames }) => {
        const B = await import(new URL('tools/bench.js', location.href).href), all = [...B.VIEWS];
        B.VIEWS.splice(0, all.length, all.find((x) => x.name === name));   // (bench() times every view in its list: here only this one)
        try { return await B.bench({ ratio, frames, shading: true }); } finally { B.VIEWS.splice(0, 1, ...all); window.__game.governor.hold(true); }   // (it lets the governor go when it is done)
      }, { name: v.bench, ratio: +ratio, frames: +frames });
      out.measure = r.measure; out.drawn = [Math.floor(r.size[0] * r.ratio), Math.floor(r.size[1] * r.ratio)]; out.views[v.bench] = r[v.bench];
      if (r.passes) { out.span[v.bench] = r.span[v.bench]; out.passes[v.bench] = r.passes[v.bench]; out.classes[v.bench] = r.classes[v.bench]; out.shading[v.bench] = r.shading?.[v.bench]; }
    }
  } finally { said(errors); await close(); }
  out.worst = Math.max(...Object.values(out.views)); out.pass = out.worst <= BUDGET;
  console.log(`bench: ${out.measure}, drawn ${px(out.drawn)} (×${(+ratio).toFixed(2)} of ${SCREEN.width}×${SCREEN.height}) and brought up to ${px([SCREEN.width * SCREEN.dpr, SCREEN.height * SCREEN.dpr])} (${url})`);
  console.log(`  ${''.padEnd(28)}${'passes'.padStart(8)}${'span'.padStart(9)}   (passes: each pass's own time added; span: the first pass's begin to the last one's end)`);
  for (const [k, ms] of [...Object.entries(out.views), ['worst', out.worst]]) console.log(`  ${k.padEnd(28)}${f(ms)}${f(out.span[k], 2, 9)} ms  ${ms <= BUDGET ? 'within' : 'OVER'} ${BUDGET}`);
  // (where it went, ms a frame, a view a column: each part added up, and under it its passes in the frame's order; a
  // pass drawn in turn, its share a frame and, in brackets, what it costs in a frame it is drawn in)
  const V = Object.keys(out.passes);
  if (V.length) {
    const W = 13, head = (i) => V.map((v) => (v.split(', ')[i] ?? '').padStart(W)).join('');   // (a view's name in two lines: its place, its height)
    const cell = (p) => (!p ? '–' : p.every > 1.5 ? `${p.mean.toFixed(2)}(${p.drawn.toFixed(1)})` : p.mean.toFixed(2)).padStart(W);
    const names = [...new Set(V.flatMap((v) => Object.keys(out.passes[v])))], at = (k) => { const i = (CLASSES[classOf(k)] ?? []).indexOf(k); return i < 0 ? 99 : i; };
    console.log(`\n  ${'ms a frame, part and pass'.padEnd(28)}${head(0)}`);
    console.log(`  ${'(in brackets: when drawn)'.padEnd(28)}${head(1)}`);
    for (const c of [...Object.keys(CLASSES), 'other']) {
      console.log(`  ${c.padEnd(28)}${V.map((v) => f(out.classes[v]?.[c], 2, W)).join('')}`);
      for (const k of names.filter((n) => classOf(n) === c).sort((a, b) => at(a) - at(b))) console.log(`    ${k.padEnd(26)}${V.map((v) => cell(out.passes[v][k])).join('')}`);
    }
    console.log(`\n  the colour pass with its shadow reads, and without (ms)`);
    for (const [v, S] of Object.entries(out.shading)) if (S) console.log(`  ${v.padEnd(28)}${f(S.colour)}${f(S.colourWithout)}  (${f(S.colour - S.colourWithout, 2, 6)} ms the shadows' share)`);
  }
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
    out.first = await page.evaluate(firstFrame, { name: FIRST_FRAME });   // (by now long set: read once the paths are ridden)
  } finally { out.errors = errors; said(errors); await close(); }
  return out;
}
async function paths(opt) {
  const list = pick(PATHS, opt.paths, 'path'), dir = mkdtempSync(join(tmpdir(), 'gate-profile-')), out = {};
  try {
    for (const cache of ['cold', 'warm']) {   // a fresh profile, then the same one again with all it kept: the browser's caches and the game's own
      const ctx = await launch(opt, dir), mem = memory(dir);
      try { out[cache] = await travel(ctx, list, mem); } finally { const m = mem.stop(); if (out[cache]) out[cache].memory = m; await closeHard(ctx, dir); }
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
  console.log(`  the first frame that draws the world: cold ${firstSaid(out.cold.first)}; warm ${firstSaid(out.warm.first)}`);
  console.log(`  the most memory, ${out.cold.memory.measure}: ${gb(most.bytes)}, ${most.phase} (${Object.entries(most.by ?? {}).map(([k, b]) => `${k} ${gb(b)}`).join(', ')}); resident, at most ${gb(Math.max(out.cold.memory.rss, out.warm.memory.rss))}`);
  if (!out.cold.paths[list[0].name].gpu) console.log('  (no GPU times: the page had no timestamp queries)');
  console.log(`  the gate in motion (no frame over 16.7 ms, the GPU within ${BUDGET} ms in every frame, at most 8 GB): ${fails.length ? 'NOT MET: ' + fails.join('; ') : 'met'}`);
  return { ...out, peak: most.bytes, pass: !fails.length, fails };
}

/** Everything, for this code: its stills and the truth's, their FLIP, the bench, the compile, then the paths (their own
    Chrome, the gate's closed first: nothing else running while frames are timed); one table. */
async function all(opt) {
  const tag = opt.tag || commit(), chrome = await launch(opt);
  let a, t, b, c;
  try { a = await stills(chrome, { tag, views: opt.views }); t = await stills(chrome, { tag: `${tag}-truth`, truth: true, views: opt.views, tiles: opt.tiles }); b = await locked('bench', () => bench(chrome, opt)); c = await locked('compile', () => compile(chrome, opt)); }
  finally { await closeHard(chrome, chrome.gateDir); }
  const d = await diff(a, t, opt), p = await locked('paths', () => paths(opt));
  console.log(`\nthe gate, ${tag}: FLIP against the truth (${OUTPUT.width}×${OUTPUT.height}, ${(+(opt.ppd ?? PPD)).toFixed(1)} px a degree); GPU ms drawn at ${px(b.drawn)}`);
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
const FLAGS = new Set(['truth', 'headed', 'fresh', 'verbose', 'no-clip', 'jpeg', 'floor', 'twice', 'ratchet']);   // (options without a value)
const [cmd, ...args] = process.argv.slice(2), pos = [], opt = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--')) pos.push(a);
  else if (FLAGS.has(a.slice(2))) opt[a.slice(2)] = true;
  else opt[a.slice(2)] = args[++i];
}
const WITH = { stills: (c) => stills(c, opt), noise: (c) => noise(c, pos[0], opt), bench: (c) => import('./gate/ceilings.js').then((C) => C.rule(() => locked('bench', () => bench(c, opt)), opt, commit())), compile: (c) => locked('compile', () => compile(c, opt)) };
try {
  let r;
  if (cmd === 'diff') await diff(pos[0], pos[1], opt);
  else if (cmd === 'paths') r = await locked('paths', () => paths(opt));   // (timed: held whole)
  else if (cmd === 'motion') r = await (await import('./gate/motion.js')).motion(opt, { OUT, BASE, SCREEN, INSIDE, WAIT, open, prepare, course, launch, pick, commit, save, rank, said, f });
  else if (cmd === 'real') { const real = async () => (await import('./gate/real.js')).real(pos[0], opt); r = await ((opt.device ?? 'cpu') === 'cpu' ? real() : locked('real', real)); }   // (on a GPU, mps: in its turn)
  else if (cmd === 'all') await all(opt);
  else if (WITH[cmd]) { const chrome = await launch(opt); try { r = await WITH[cmd](chrome); } finally { await closeHard(chrome, chrome.gateDir); } }
  else { console.log('bun tools/gate.js stills | diff | noise | bench | compile | paths | motion | real | all: see the top of tools/gate.js'); process.exitCode = cmd ? 1 : 0; }
  if (['bench', 'compile', 'paths'].includes(cmd)) { mkdirSync(OUT, { recursive: true }); save(`${OUT}${cmd}.json`, r); }   // (the numbers kept: .gate/bench.json and so on)
} catch (e) { console.error(`gate: ${e.message}`); process.exitCode = 1; }
finally { for (const d of FRESH) rmSync(d, { recursive: true, force: true }); }
