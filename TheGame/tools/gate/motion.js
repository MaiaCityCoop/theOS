// The motion check of the gate (intent 0038, check 4: nothing pops). Every frame of a path is drawn twice, as the game
// draws it and at full detail (?truth: at each frame a settled still, so it neither shimmers nor lacks), on the gate's clock
// (tools/gate/clock.js), and the change detail made in each frame is measured (tools/gate/change.js). tools/gate.js
// motion; tools/gate/README.md. The functions marked "in the page" are handed to the page whole and read nothing of
// this module.
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PATHS } from './views.js';
import { stepper } from './clock.js';
import { locked } from '../gpu/lock.js';
import { lay, jpeg, b64 } from './sheet.js';
import { ERROR_PX } from '../../src/detail/error.js';

// what tools/gate.js lends this module to draw and read with (motion(opt, kit))
let K = null;

/** The line no frame's worst tile may cross in motion, for a tile `size` pixels wide (every frame's worst tile's: the
    FLIP tiles', tools/gate/flip.js): a switch within the dial moves an edge by at most ERROR_PX pixels drawn, INSIDE
    canvas pixels each, so across the tile at full contrast (FLIP at most 1) it changes the tile's mean by at most
    ERROR_PX × INSIDE / size (INSIDE: the most rows the game draws over the output's, src/core/output.js drawnRows: at
    the gate's output 1, 1 × 1 / 32 = 0.031). A pop is a tile over it. */
const lineOf = (size) => (ERROR_PX() * K.INSIDE) / size;   // (the dial as the gate holds it: at rest)
/** What the filmstrip shows of a frame beside it: the squares round its worst tile, as `other` (the truth, or the game
    again) has them too. */
const shownOf = (other) => ['LOD before', 'LOD now', `${other} before`, `${other} now`, 'the change, FLIP'];
/** How wide the filmstrip draws a w × h frame beside its squares (tools/gate/sheet.js lay): its thumb is made so wide. */
const thumbOf = (w, h) => lay([{ panels: [{ w, h }, ...shownOf('').map(() => ({ w: 1, h: 1 }))] }]).rows[0].panels[0].dw;

/** The frames the pages send (their raw RGBA bytes, POSTed: far quicker than through evaluate), each kept under its key
    until it is taken, in a SharedArrayBuffer the change's workers read without a copy. */
export async function receiver() {
  const kept = new Map(), wanted = new Map();
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), key = u.searchParams.get('key'), parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => {
      const b = Buffer.concat(parts), data = new SharedArrayBuffer(b.length); new Uint8Array(data).set(b);
      const f = { w: +u.searchParams.get('w'), h: +u.searchParams.get('h'), data };
      res.writeHead(200, { 'access-control-allow-origin': '*', connection: 'close' }); res.end();   // (no connection kept: the truth's frames come seconds apart, and a POST on one the server has just let go fails, not retried)
      if (b.length !== f.w * f.h * 4) f.error = `frame ${key} came as ${b.length} bytes, not ${f.w}×${f.h}×4`;
      else { let lit = 0; for (let i = 0; i < b.length; i += 4 * 997) lit += b[i] + b[i + 1] + b[i + 2]; if (!lit) f.error = `frame ${key} is black: the canvas was read before anything was drawn on it`; }
      if (wanted.has(key)) { wanted.get(key)(f); wanted.delete(key); } else kept.set(key, f);
    });
  });
  server.keepAliveTimeout = 0;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const check = (f) => { if (f.error) throw new Error(f.error); return f; };
  const take = (key) => { const f = kept.get(key); if (f) { kept.delete(key); return Promise.resolve(f).then(check); } return new Promise((r) => wanted.set(key, r)).then(check); };
  return { url: `http://127.0.0.1:${server.address().port}/frame`, take, close: () => server.close() };
}
/** n workers measuring frames' change (tools/gate/change.js), each frame to the next one free. */
function pool(n) {
  const ws = Array.from({ length: n }, () => new Worker(new URL('./change.js', import.meta.url))), free = [...ws], queue = [], out = new Map();
  let id = 0;
  const next = () => { while (free.length && queue.length) { const [job, r] = queue.shift(); out.set(job.i, r); free.pop().postMessage(job); } };
  for (const w of ws) w.on('message', (m) => { const r = out.get(m.i); out.delete(m.i); free.push(w); next(); if (m.error) r.no(new Error(m.error)); else r.ok(m); });
  return {
    run: (job) => new Promise((ok, no) => { queue.push([{ ...job, i: id++ }, { ok, no }]); next(); }),
    get busy() { return queue.length + out.size; },
    close: () => Promise.all(ws.map((w) => w.terminate())),
  };
}

/** One pass over a path in a page of its own (made, come and settled here, closed after: one world in memory at a
    time). The world's clock stands at T where the path starts; frame i is i / fps seconds in. The first pass (as the
    game draws: `store`, a folder) writes every frame there, squeezed, and says at which place of a pixel each was drawn
    (`jits`); the second (the truth, a settled still at each step; or the game again, --floor, at those same places) has each of its frames'
    change is measured as it comes, against the first pass's frames read back (`from`, `jits`). */
async function pass(ctx, p, o) {
  const t0 = Date.now(), P = await K.open(ctx, { query: o.truth ? (o.reach ? `truth=${o.reach}` : 'truth') : '', init: stepper });
  try {
    const at = await arrive(P, p, o), S = await shoot(P, p, o, at, t0);
    return o.from ? told(at, S, o, t0) : { secs: at.secs, n: at.n, ms: Date.now() - t0, start: at.a, jits: S.places };
  } finally { K.said(P.errors); await P.close(); }
}
/** A pass's page made ready: the shared numbers, the clock taken, the path laid (its seconds and frames) and the world
    settled at its start. */
async function arrive(P, p, { truth, floor, T, fps, to, from = null, start = null }) {
  const fly = !!p.flyby, who = !from ? 'LOD' : floor ? 'LOD again' : 'truth';
  await P.page.evaluate(K.prepare, { inside: K.INSIDE, time: null });
  const begun = await P.page.evaluate(begin);
  if (begun.clock >= T) throw new Error(`the page's clock (${begun.clock.toFixed(0)} s) is past where the path starts on it (${T} s)`);
  const c = fly ? { secs: await P.page.evaluate(async () => (await import(new URL('tools/flyby.js', location.href).href)).cycleOf('zoom')) } : await P.page.evaluate(K.course, p);
  const secs = Math.min(c.secs, to ?? Infinity), n = Math.floor(secs * fps + 1e-6) + 1;
  const a = await P.page.evaluate(rest, { T, fly, wait: K.WAIT, place: start?.place ?? null });
  console.log(`  ${p.name}, ${who}: the page came in ${(P.start.ms / 1000).toFixed(1)} s; ${n} frames over ${secs.toFixed(1)} s; settled at the path's start in ${(a.ms / 1000).toFixed(1)} s (${a.frames} frames)`);
  return { fly, secs, n, a };
}
/** A pass's frames, one by one, drawn and read: the first pass's kept (stored), the second's each measured against the
    first's as it comes (measured). Its frames, its worst (top), the places of a pixel they were drawn at. */
async function shoot(P, p, o, { fly, n }, t0) {
  const S = { frames: [], top: [], jobs: new Set(), places: [], before: null };
  for (let i = 0; i < n; i++) {
    const s = i / o.fps, r = await P.page.evaluate(shot, { s, T: o.T + s, fly, url: o.net.url, key: `${p.name}${i}`, truth: o.truth, place: o.truth ? null : o.jits?.[i] ?? null, wait: K.WAIT });
    const now = await o.net.take(`${p.name}${i}`);
    S.places.push(r.place);
    if (o.from) await measured(S, o, { i, s, r, now, n, t0 }); else stored(o.store, { i, now, n, t0 });
  }
  await Promise.all(S.jobs);
  return S;
}
/** A job kept in S.jobs till it ends (a pass's end waits for them all). */
const track = (S, job) => { S.jobs.add(job); job.finally(() => S.jobs.delete(job)); return job; };
/** No more frames in hand than the workers will soon take. */
const room = async (S, work, workers) => { while (work.busy > workers * 2) await Promise.race(S.jobs); };
/** A frame x measured (m: tools/gate/change.js's answer): its numbers kept on it, and it among S.top, the worst keep × 4
    with what the filmstrip shows of them. */
const topped = (S, x, m, width, keep) => {
  Object.assign(x, { mean: +m.mean.toFixed(6), p99: +m.p99.toFixed(6), worst: { ...m.worst, value: +m.worst.value.toFixed(6) } });
  S.top.push({ ...x, look: m.look, width }); S.top.sort((p, q) => q.worst.value - p.worst.value); S.top.length = Math.min(S.top.length, keep * 4);
  return x;
};
/** The first pass's frame i kept (squeezed) for the second to be measured against. */
function stored(store, { i, now, n, t0 }) {
  writeFileSync(`${store}${i}.z`, deflateSync(new Uint8Array(now.data), { level: 1 }));
  if (i && (i % 50 === 0 || i === n - 1)) console.log(`    ${String(i).padStart(5)} / ${n - 1}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)} s a frame`);
}
/** The second pass's frame i: the change detail made since the frame before, measured by a worker against the first
    pass's two frames; the worst kept for the filmstrip. */
async function measured(S, { from, jits, truth, work, workers, keep }, { i, s, r, now, n, t0 }) {
  const f = { i, s: +s.toFixed(4), ...(r.frames ? { frames: r.frames } : {}), ...(r.out ? { out: r.out } : {}), ...(!truth && jits && jits[i] !== r.place ? { places: 'apart' } : {}) };
  S.frames.push(f);
  const L = inflateSync(readFileSync(`${from}${i}.z`)), Ls = new SharedArrayBuffer(L.length); new Uint8Array(Ls).set(L);
  const pair = { L: Ls, R: now.data };
  if (S.before) {
    track(S, work.run({ w: now.w, h: now.h, L: pair.L, Lb: S.before.L, R: pair.R, Rb: S.before.R, thumb: thumbOf(now.w, now.h) }).then((m) => topped(S, f, m, now.w, keep)));
    await room(S, work, workers);
  }
  S.before = pair;
  if (i && (i % 25 === 0 || i === n - 1)) { const w = S.frames.reduce((m, x) => Math.max(m, x.worst?.value ?? 0), 0); console.log(`    ${String(i).padStart(5)} / ${n - 1}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(1)} s a frame; the worst tile so far ${w.toFixed(4)}`); }
}
/** The second pass, told: its frames measured, their worst, 99th percentile and median, the line and how many crossed it,
    and the frames the filmstrip shows (the worst, none within half a second of one shown before). */
function told({ secs, a }, { frames, top }, { fps, floor, start, keep }, t0) {
  const ms = frames.filter((x) => x.worst), ws = ms.map((x) => x.worst.value), worst = ms.reduce((m, x) => (x.worst.value > (m?.worst.value ?? -1) ? x : m), null);
  const shown = []; for (const x of top) if (shown.length < keep && !shown.some((y) => Math.abs(y.s - x.s) < 0.5)) shown.push(x);
  return {
    secs, fps, frames: ms.length, ms: Date.now() - t0, start: { lod: start, [floor ? 'again' : 'truth']: a },
    worst: worst && { value: worst.worst.value, frame: worst.i, s: worst.s, x: worst.worst.x, y: worst.worst.y },
    p99: K.rank(ws, 0.99), median: K.rank(ws, 0.5), line: ms.length ? lineOf(ms[0].worst.size) : null, over: ms.filter((x) => x.worst.value > lineOf(x.worst.size)).length,
    lacking: frames.filter((x) => x.out).length, apart: frames.filter((x) => x.places).length,
    list: frames, shown,
  };
}

/** The filmstrip of a path, painted in a blank page of `ctx` (no world: only a canvas; tools/gate/sheet.js), a JPEG: every
    frame's worst tile against the line, and a row for each frame shown: the frame small with its worst tile outlined,
    and the squares round that tile at full size (shownOf), labelled. */
async function filmstrip(ctx, file, { title, sub, r, other = 'truth' }) {
  const B = await ctx.newPage(), names = shownOf(other);
  const row = (x) => {
    const L = x.look, k = L.thumb.w / x.width, lacked = x.out ? ` · the truth lacked: ${Object.entries(x.out).map(([key, v]) => `${key} ${v}`).join(', ')}` : '';
    return { label: `frame ${x.i} · ${x.s.toFixed(2)} s in · worst tile ${x.worst.value.toFixed(4)} at ${x.worst.x},${x.worst.y}${lacked}`,
      panels: [{ w: L.thumb.w, h: L.thumb.h, rgb: b64(L.thumb.rgb), box: [x.worst.x * k, x.worst.y * k, x.worst.size * k] },
        ...L.crops.map((c, j) => ({ label: names[j], w: L.crop, h: L.crop, rgb: b64(c), sharp: true, box: [L.tile.x, L.tile.y, L.tile.size] }))] };
  };
  try {
    const chart = { series: r.list.filter((x) => x.worst).map((x) => [x.s, x.worst.value]), line: r.line, marks: r.shown.map((x) => [x.s, x.worst.value]) };
    await jpeg(B, file, { title, sub, ...lay(r.shown.map(row), { chart }) });
  } finally { await B.close(); }
}

/** Check 4: every path frame by frame, as the game draws it and at full detail, the change detail made in each frame
    measured, against the line (lineOf) in every frame's worst tile. Each path in two passes of one page each (pass): the game's, then
    the truth's, drawn on the gate's clock (tools/gate/clock.js) at the same moments of the world's clock, each of the
    truth's frames a still settled at its step (it neither shimmers nor lacks). Between the passes nothing is
    drawn, and the GPU lock (tools/gpu/lock.js) is let go. */
export async function motion(opt, kit) {
  K = kit;
  const { OUT, BASE, SCREEN, INSIDE, pick, commit, launch } = K;
  const list = pick(PATHS, opt.paths, 'path'), fps = +(opt.fps ?? 60), keep = +(opt.keep ?? 6), workers = +(opt.workers ?? 2), to = opt.to != null ? +opt.to : null;
  const floor = !!opt.floor, tag = (opt.tag || commit()) + (floor ? '-floor' : ''), dir = `${OUT}motion-${tag}/`, report = { tag, fps, line: null, floor, when: new Date().toISOString(), screen: SCREEN, inside: INSIDE, paths: {} };
  mkdirSync(dir, { recursive: true });
  const net = await receiver(), work = pool(workers), ctx = await launch(opt);
  console.log(`motion → .gate/motion-${tag}/ (${BASE}): every path at ${fps} frames a second, as the game draws it and ${floor ? 'as it draws it again (the noise floor)' : 'as the truth does'}`);
  try {
    for (const [k, p] of list.entries()) await onePath(ctx, p, { T: 3600 + 200 * k, opt, fps, keep, workers, to, floor, tag, dir, report, net, work });   // (each path at its own hour on the world's clock, the same in every run)
  } finally { await ctx.close(); net.close(); await work.close(); }
  say(report, dir, tag);
  return report;
}
/** One path: the game's pass, then the truth's (or the game's again: --floor), its filmstrip, and its line in the
    report. */
async function onePath(ctx, p, { T, opt, fps, keep, workers, to, floor, tag, dir, report, net, work }) {
  const store = `${mkdtempSync(join(tmpdir(), 'gate-motion-'))}/`;   // (its first pass's frames, kept here till the second's are measured)
  try {
    const A = await locked(`motion: ${p.name}, as the game draws it`, () => pass(ctx, p, { truth: false, T, fps, to, net, store }));
    const r = await locked(`motion: ${p.name}, ${floor ? 'again' : 'the truth'}`, () => pass(ctx, p, { truth: !floor, floor, T, fps, to, net, reach: opt.reach, from: store, jits: A.jits, start: A.start, work, workers, keep }));
    r.ms += A.ms; report.line ??= r.line;
    await filmstrip(ctx, `${dir}${p.name}.jpg`, { title: `gate.js motion · ${p.name} · ${tag}`, sub: `the change detail made in each frame, ((LOD − ${floor ? 'LOD again' : 'truth'}) now) − (the same a frame before), FLIP in 32-px tiles at 4K · ${r.frames} frames at ${fps} a second · worst tile ${r.worst?.value.toFixed(4)} at ${r.worst?.s.toFixed(2)} s · ${r.over} over the line ${r.line?.toFixed(3)} (ERROR_PX × INSIDE / the tile)`, r, other: floor ? 'LOD again' : 'truth' });
    const { shown, ...kept } = r; report.paths[p.name] = kept; K.save(`${dir}report.json`, report);
    console.log(`  ${p.name}: the worst tile ${r.worst?.value.toFixed(4)} (frame ${r.worst?.frame}, ${r.worst?.s.toFixed(2)} s, at ${r.worst?.x},${r.worst?.y}); p99 ${r.p99?.toFixed(4)}; ${r.over} over ${r.line?.toFixed(3)}; ${(r.ms / 60e3).toFixed(1)} min → .gate/motion-${tag}/${p.name}.jpg`);
  } finally { rmSync(store, { recursive: true, force: true }); }
}
/** The paths' table, and the merge rule: nothing pops (no frame's worst tile over the line). */
function say(report, dir, tag) {
  const f = K.f, fails = Object.entries(report.paths).filter(([, r]) => r.over).map(([k, r]) => `${k} ${r.over} frame(s), the worst ${r.worst.value.toFixed(4)}`);
  console.log(`motion, ${tag}: the change detail made in each frame (FLIP of ((LOD − truth) now) − ((LOD − truth) a frame before), 32-px tiles, 4K)`);
  console.log(`  ${'path'.padEnd(8)}${'frames'.padStart(7)}${'worst'.padStart(9)}${'at s'.padStart(8)}${'p99'.padStart(9)}${'median'.padStart(9)}${'>line'.padStart(7)}${'truth lacking'.padStart(15)}`);
  for (const [k, r] of Object.entries(report.paths)) console.log(`  ${k.padEnd(8)}${String(r.frames).padStart(7)}${f(r.worst?.value, 4, 9)}${f(r.worst?.s, 2)}${f(r.p99, 4, 9)}${f(r.median, 4, 9)}${String(r.over).padStart(7)}${String(r.lacking).padStart(15)}`);
  console.log(`  the merge rule, nothing pops (no frame's worst tile over the line ${report.line?.toFixed(3)}, ERROR_PX × INSIDE / the tile): ${fails.length ? 'NOT MET: ' + fails.join('; ') : 'met'}`);
  report.pass = !fails.length; report.fails = fails; K.save(`${dir}report.json`, report);
}

// ---- check 4 where regions join or split (#171): motion --swaps ----
// A tier's regions are packed a piece at a time, and what a region replaces (the region it was split out of, the four it
// was joined from, what it held before) is let go only once it is all visited (src/scatter/tier.js): the frame that
// lets it go says how many it replaced (window.__game.work.swaps, the game's own count). Where that is right, a swap
// changes nothing the eye sees; where something is let go too soon, or comes late, a hole opens or a patch pops. Each
// path is walked as the game draws it, frame by frame on the gate's clock. A frame is measured where it, or the pair
// before it, holds a swap (a lone swap at k: k, k + 1 and k + 2), against the frame before, the change the walk itself
// made taken out: the swap-free pair just before the run of such frames, its change laid on the frame before
// (tools/gate/change.js, its "truth" that pair). Measured so, the frame before the run is the run's floor. A long run
// of swaps measures its later frames against an older pair: each frame says how far back its pair is (age).

/** motion --swaps: every path (the walk, by default) for `to` seconds (20) as the game draws it, in the world or the
    stress world (--stress), at every swap its frames measured (above) against the line; a filmstrip of the worst. */
export async function swaps(opt, kit) {
  K = kit;
  const { OUT, BASE, pick, commit, launch } = K, world = opt.stress ? 'stress' : 'world';
  const list = pick(PATHS, opt.paths ?? 'walk', 'path'), fps = +(opt.fps ?? 60), keep = +(opt.keep ?? 6), workers = +(opt.workers ?? 2), to = +(opt.to ?? 20);
  const tag = `${opt.tag || commit()}-${world}`, dir = `${OUT}swaps-${tag}/`, report = { tag, world, fps, line: null, when: new Date().toISOString(), paths: {} };
  mkdirSync(dir, { recursive: true });
  const net = await receiver(), work = pool(workers), ctx = await launch(opt);
  console.log(`motion --swaps → .gate/swaps-${tag}/ (${BASE}, the ${world}): every path's first ${to} s at ${fps} frames a second, each frame where regions were replaced against the frame before`);
  try {
    for (const [k, p] of list.entries()) {
      const r = await locked(`motion --swaps: ${p.name}, the ${world}`, () => swapPass(ctx, p, { T: 3600 + 200 * k, fps, to, net, work, workers, keep, query: opt.stress ? 'stress' : '' }));
      report.line ??= r.line;
      await filmstrip(ctx, `${dir}${p.name}.jpg`, { title: `gate.js motion --swaps · ${p.name} · ${tag}`, sub: `each frame that or whose pair before holds a swap, FLIP against the frame before with the swap-free pair before the run's change taken out, 32-px tiles · ${r.measured} frames measured of ${r.frames}`, r, other: 'the pair before' });
      const { shown, ...kept } = r; report.paths[p.name] = kept; K.save(`${dir}report.json`, report);
    }
  } finally { await ctx.close(); net.close(); await work.close(); }
  return sayRuns(report, dir);
}
/** One path walked for --swaps in a page of its own: frame by frame, each frame's swaps read with it (shot). */
async function swapPass(ctx, p, o) {
  const t0 = Date.now(), P = await K.open(ctx, { query: o.query, init: stepper });
  try {
    const at = await arrive(P, p, { ...o, truth: false }), S = { list: [], top: [], jobs: new Set(), runs: [], ring: [], run: null };
    for (let i = 0; i < at.n; i++) {
      const s = i / o.fps, r = await P.page.evaluate(shot, { s, T: o.T + s, fly: at.fly, url: o.net.url, key: `${p.name}${i}`, wait: K.WAIT });
      await swapFrame(S, o, { i, s: +s.toFixed(4), swaps: r.swaps, now: await o.net.take(`${p.name}${i}`) });
    }
    await Promise.all(S.jobs);
    return toldRuns(S, o, at, t0);
  } finally { K.said(P.errors); await P.close(); }
}
/** Frame f of a --swaps walk (above): kept with the three before it (ring); a run begun where it holds a swap and none
    is under way (its pair: the two before it, where both are swap-free; its floor measured), carried on while it or the
    pair before it holds one, ended where neither does; the frame measured where it is in a run that has its pair. */
async function swapFrame(S, o, f) {
  const R = S.ring; R.push(f); if (R.length > 4) R.shift();
  const [a, b, c] = [R.at(-2), R.at(-3), R.at(-4)], free = (...x) => x.every((y) => y && !y.swaps);
  if (![f, a, b].some((x) => x?.swaps)) { S.run = null; return; }   // (neither it nor the pair before it holds a swap)
  if (!S.run) {
    const run = (S.run = { from: f.i, to: f.i, s: f.s, swaps: 0, pair: free(a, b) ? { at: a.i, R: a.now.data, Rb: b.now.data } : null, floor: null, worst: null, measured: 0, age: 0 });
    S.runs.push(run);
    if (run.pair && free(c)) track(S, measure(o, { f: a, before: b, R: b.now.data, Rb: c.now.data }).then((m) => { run.floor = +m.worst.value.toFixed(6); }));
  }
  const run = S.run;
  if (f.swaps) Object.assign(run, { to: f.i, swaps: run.swaps + f.swaps });
  if (!run.pair) return;
  run.measured++; run.age = f.i - run.pair.at;
  track(S, measure(o, { f, before: a, R: run.pair.R, Rb: run.pair.Rb }).then((m) => {
    const x = topped(S, { i: f.i, s: f.s, swaps: f.swaps, run: S.runs.indexOf(run), age: f.i - run.pair.at }, m, f.now.w, o.keep);
    S.list.push(x); if (x.worst.value > (run.worst ?? -1)) run.worst = x.worst.value;
  }));
  await room(S, o.work, o.workers);
}
/** Frame f against the frame before, the pair (R now, Rb before)'s change taken out (tools/gate/change.js). */
const measure = (o, { f, before, R, Rb }) => o.work.run({ w: f.now.w, h: f.now.h, L: f.now.data, Lb: before.now.data, R, Rb, thumb: thumbOf(f.now.w, f.now.h) });
/** A --swaps walk, told: its frames and swaps, its runs (each: its frames, swaps, worst, floor), the measured frames'
    worst, p99 and median, the line and how many crossed it, the frames the filmstrip shows. */
function toldRuns({ list, top, runs }, { fps, keep }, { secs }, t0) {
  const ws = list.map((x) => x.worst.value), worst = list.reduce((m, x) => (x.worst.value > (m?.worst.value ?? -1) ? x : m), null), line = list.length ? lineOf(list[0].worst.size) : null;
  const shown = []; for (const x of top) if (shown.length < keep && !shown.some((y) => y.run === x.run)) shown.push(x);   // (the worst frame of each of the worst runs)
  return {
    secs, fps, frames: Math.floor(secs * fps + 1e-6) + 1, ms: Date.now() - t0, swaps: runs.reduce((n, r) => n + r.swaps, 0), runs: runs.length,
    measured: list.length, unpaired: runs.filter((r) => !r.pair).length, age: runs.reduce((n, r) => Math.max(n, r.age), 0),
    worst: worst && { value: worst.worst.value, frame: worst.i, s: worst.s, x: worst.worst.x, y: worst.worst.y }, p99: K.rank(ws, 0.99), median: K.rank(ws, 0.5),
    floor: K.rank(runs.map((r) => r.floor).filter((v) => v != null), 0.5), line, over: list.filter((x) => x.worst.value > lineOf(x.worst.size)).length,
    list: list.sort((p, q) => p.i - q.i), shown, byRun: runs.map(({ pair, ...r }) => ({ ...r, paired: !!pair })),
  };
}
/** The --swaps table, and its rule: nothing pops where regions join or split (no measured frame's worst tile over the
    line). */
function sayRuns(report, dir) {
  const f = K.f, fails = Object.entries(report.paths).filter(([, r]) => r.over).map(([k, r]) => `${k} ${r.over} frame(s), the worst ${r.worst.value.toFixed(4)} at ${r.worst.s.toFixed(2)} s`);
  console.log(`motion --swaps, ${report.tag}: each frame where regions joined or split, FLIP against the frame before, the walk's own change taken out (32-px tiles)`);
  console.log(`  ${'path'.padEnd(8)}${'runs'.padStart(6)}${'swaps'.padStart(7)}${'measured'.padStart(10)}${'worst'.padStart(9)}${'at s'.padStart(8)}${'p99'.padStart(9)}${'floor'.padStart(9)}${'>line'.padStart(7)}`);
  for (const [k, r] of Object.entries(report.paths)) console.log(`  ${k.padEnd(8)}${String(r.runs).padStart(6)}${String(r.swaps).padStart(7)}${String(r.measured).padStart(10)}${f(r.worst?.value, 4, 9)}${f(r.worst?.s, 2)}${f(r.p99, 4, 9)}${f(r.floor, 4, 9)}${String(r.over).padStart(7)}  (pairs up to ${r.age} frames back${r.unpaired ? `; ${r.unpaired} runs with no swap-free pair before, not measured` : ''})`);
  console.log(`  the rule, nothing pops where regions join or split (no measured frame's worst tile over the line ${report.line?.toFixed(3) ?? '–'}): ${fails.length ? 'NOT MET: ' + fails.join('; ') : 'met'}`);
  report.pass = !fails.length; report.fails = fails; K.save(`${dir}report.json`, report);
  return report;
}

/** In the page, once it has come and settled (tools/gate.js open, prepare): the clock taken (no frame drawn after this
    but those the gate steps), and what the frames need: the shared uniforms, what is still out (src/core/settle.js), the
    flight (tools/flyby.js). Its own start (t0: the world's
    clock is (timestamp − t0) / 1000 s, src/boot.js) and that clock now. */
export async function begin() {
  const R = performance.getEntriesByType('resource').map((e) => e.name), mod = (part) => import(R.filter((n) => n.includes(part)).at(-1));
  const [{ U }, F] = await Promise.all([mod('src/core/uniforms.js'), import(new URL('tools/flyby.js', location.href).href)]), waiting = window.__game.waiting;   // (what is still out as the game gives it: src/core/settle.js waiting)
  const C = window.__gateClock; C.start();
  const t0 = C.last - U.uTime.value * 1000, g = window.__game;
  // (the camera where the path has it s seconds in: the film camera's timeline, or the flight's rig)
  const pose = (s, fly) => { if (!fly) return void window.__cine.seek(s); const q = F.flightAt(s, 'zoom'); g.controls.place(q.x, q.z, q.yaw); g.controls.height = q.h; };
  window.__gateMotion = { U, waiting, pose, t0 };
  return { clock: U.uTime.value, visible: document.visibilityState, inside: [window.__game.screen.inside] };
}

/** In the page: the path laid (tools/gate.js course; the flight: the film camera let go, the rig flown frame by frame
    here, not by tools/flyby.js's own loop), the camera at its start, and the world settled there with the clock standing
    at T seconds, frame by stepped frame. Given `place` (the first pass's place of a pixel when it settled there), this
    page's next frame is drawn at the same place as the first pass's next was (src/core/temporal.js place): the two
    passes' frames are drawn at the same places, frame for frame. What it took, and its place. */
export async function rest({ T, fly, place = null, wait = 600e3 }) {
  const M = window.__gateMotion, C = window.__gateClock, g = window.__game, t = M.t0 + T * 1000, t0 = Date.now();
  if (fly) window.__cine.release();
  const pose = () => M.pose(0, fly);
  let done = null, frames = 0;
  pose();
  g.settle({ timeout: wait }).then((r) => (done = r), (e) => (done = { error: String(e.message ?? e) }));
  while (!done) { pose(); await C.step(t); frames++; await new Promise((r) => setTimeout(r, 0)); }
  if (done.error) throw new Error(done.error);
  if (place != null) g.temporal.place = place;
  return { frames, ms: Date.now() - t0, place: g.temporal.place };
}

/** In the page: frame `s` seconds into the path, at T seconds on the world's clock, drawn and sent to the gate (its raw
    RGBA bytes, POSTed to `url`). The game's: one frame, at `place` where given (the --floor's second pass, drawn at the
    first's places of a pixel: src/core/temporal.js place). truth: the truth's, a settled still at the step, the camera
    and the clock standing: drawn until settle() resolves (nothing out, the land's pages among it, and the picture built
    over its 32 places come to rest), so the reference neither shimmers nor lacks. What it took: { place, frames (drawn
    for it), out (what was still out after it: none, for a settled truth), ms, swaps (the regions its last frame replaced:
    window.__game.work, src/scatter/tier.js) }. */
export async function shot({ s, T, fly, url, key, truth = false, place = null, wait = 300e3 }) {
  const M = window.__gateMotion, C = window.__gateClock, g = window.__game, t = M.t0 + T * 1000, t0 = Date.now();
  let frames = 0;
  M.pose(s, fly);
  if (truth) {
    let done = null;
    g.settle({ timeout: wait }).then((r) => (done = r), (e) => (done = { error: String(e.message ?? e) }));
    while (!done) { M.pose(s, fly); await C.step(t); frames++; await new Promise((r) => setTimeout(r, 0)); }
    if (done.error) throw new Error(`the truth at ${s} s: ${done.error}`);
  } else {
    if (place != null) g.temporal.place = place - 1;
    await C.step(t); frames = 1;
  }
  // (read once the frame is drawn: read inside it, as the film camera's grab does, a WebGPU canvas came back black)
  const can = g.renderer.domElement, cv = new OffscreenCanvas(can.width, can.height); cv.getContext('2d').drawImage(can, 0, 0);
  const out = M.waiting();
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const send = () => fetch(`${url}?key=${key}&w=${cv.width}&h=${cv.height}`, { method: 'POST', body: d, mode: 'no-cors', keepalive: false });
  await send().catch(() => new Promise((r) => setTimeout(r, 500)).then(send));   // (once more, on a connection of its own)
  return { place: g.temporal.place, frames, out: Object.keys(out).length ? out : null, ms: Date.now() - t0, swaps: g.work?.swaps ?? 0 };
}

