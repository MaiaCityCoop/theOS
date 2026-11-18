// The motion check of the gate (intent 0038, check 4: nothing pops). Every frame of a path is drawn twice, as the game
// draws it and at full detail (?truth, drawn as a frame in motion: src/detail/measure.js TRUTH_AS), on the gate's clock
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
import { CROP } from './change.js';
import { locked } from './lock.js';

// what tools/gate.js lends this module to draw and read with (motion(opt, kit))
let K = null;

/** The line no frame's worst tile may cross in motion: a 32-pixel tile's mean FLIP of the change detail made in one
    frame. Provisional: until Samuel's pairs set the threshold of visibility (check 3), a little over twice the stills'
    noise floor (≤ 0.022, stage 2a). */
export const POP = 0.05;

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
    (`jits`); the second (the truth, or the game again: --floor) is drawn at those same places, and each of its frames'
    change is measured as it comes, against the first pass's frames read back (`from`, `jits`). */
async function pass(ctx, p, { truth, floor, T, fps, to, net, reach, store, from = null, jits = null, start = null, work, workers, keep }) {
  const { open, prepare, course, said, rank, WAIT, INSIDE } = K, fly = !!p.flyby, t0 = Date.now(), first = !from, who = first ? 'LOD' : floor ? 'LOD again' : 'truth';
  const P = await open(ctx, { query: truth ? (reach ? `truth=${reach}` : 'truth') : '', init: stepper });
  try {
    await P.page.evaluate(prepare, { inside: INSIDE, time: null });
    const begun = await P.page.evaluate(begin, { truth });
    if (begun.clock >= T) throw new Error(`the page's clock (${begun.clock.toFixed(0)} s) is past where the path starts on it (${T} s)`);
    const c = fly ? { secs: await P.page.evaluate(async () => (await import(new URL('tools/flyby.js', location.href).href)).cycleOf('zoom')) } : await P.page.evaluate(course, p);
    const secs = Math.min(c.secs, to ?? Infinity), n = Math.floor(secs * fps + 1e-6) + 1;
    const a = await P.page.evaluate(rest, { T, fly, wait: WAIT, jit: start?.jit ?? null });
    console.log(`  ${p.name}, ${who}: the page came in ${(P.start.ms / 1000).toFixed(1)} s; ${n} frames over ${secs.toFixed(1)} s; settled at the path's start in ${(a.ms / 1000).toFixed(1)} s (${a.frames} frames${a.aligned ? `, ${a.aligned} more to stand at the first pass's place of a pixel` : ''})`);
    const frames = [], top = [], jobs = new Set(), places = [];
    let before = null;
    for (let i = 0; i < n; i++) {
      const s = i / fps;
      const r = await P.page.evaluate(shot, { s, T: T + s, fly, url: net.url, key: `${p.name}${i}`, whole: truth, jit: jits?.[i] ?? null });
      const now = await net.take(`${p.name}${i}`);
      places.push(r.jit);
      if (first) { writeFileSync(`${store}${i}.z`, deflateSync(new Uint8Array(now.data), { level: 1 })); if (i && (i % 50 === 0 || i === n - 1)) console.log(`    ${String(i).padStart(5)} / ${n - 1}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)} s a frame`); continue; }
      const f = { i, s: +s.toFixed(4), again: r.again, ...(r.out ? { out: r.out } : {}), ...(r.late ? { late: true } : {}), ...(jits && (jits[i][0] !== r.jit[0] || jits[i][1] !== r.jit[1]) ? { places: 'apart' } : {}) };
      frames.push(f);
      const L = inflateSync(readFileSync(`${from}${i}.z`)), Ls = new SharedArrayBuffer(L.length); new Uint8Array(Ls).set(L);
      const pair = { L: Ls, R: now.data };
      if (before) {
        const job = work.run({ w: now.w, h: now.h, L: pair.L, Lb: before.L, R: pair.R, Rb: before.R }).then((m) => {
          Object.assign(f, { mean: +m.mean.toFixed(6), p99: +m.p99.toFixed(6), worst: { ...m.worst, value: +m.worst.value.toFixed(6) } });
          top.push({ ...f, look: m.look, width: now.w }); top.sort((x, y) => y.worst.value - x.worst.value); top.length = Math.min(top.length, keep * 4);
        });
        jobs.add(job); job.finally(() => jobs.delete(job));
        while (work.busy > workers * 2) await Promise.race(jobs);   // (no more frames in hand than the workers will soon take)
      }
      before = pair;
      if (i && (i % 25 === 0 || i === n - 1)) { const w = frames.reduce((m, x) => Math.max(m, x.worst?.value ?? 0), 0); console.log(`    ${String(i).padStart(5)} / ${n - 1}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(1)} s a frame; the worst tile so far ${w.toFixed(4)}`); }
    }
    await Promise.all(jobs);
    if (first) return { secs, n, ms: Date.now() - t0, start: a, jits: places };
    const ms = frames.filter((x) => x.worst), ws = ms.map((x) => x.worst.value), worst = ms.reduce((m, x) => (x.worst.value > (m?.worst.value ?? -1) ? x : m), null);
    // the frames shown: the worst, none within half a second of one shown before
    const shown = []; for (const x of top) if (shown.length < keep && !shown.some((y) => Math.abs(y.s - x.s) < 0.5)) shown.push(x);
    return {
      secs, fps, frames: ms.length, ms: Date.now() - t0, start: { lod: start, [floor ? 'again' : 'truth']: a },
      worst: worst && { value: worst.worst.value, frame: worst.i, s: worst.s, x: worst.worst.x, y: worst.worst.y },
      p99: rank(ws, 0.99), median: rank(ws, 0.5), over: ws.filter((v) => v > POP).length,
      again: frames.reduce((s, x) => s + x.again, 0), late: frames.filter((x) => x.late).length, apart: frames.filter((x) => x.places).length,
      list: frames, shown,
    };
  } finally { said(P.errors); await P.close(); }
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
    measured, against POP in every frame's worst tile. Each path in two passes of one page each (pass): the game's, then
    the truth's, drawn on the gate's clock (tools/gate/clock.js) at the same moments of the world's clock and the
    same places of a pixel, the truth's frames drawn again until nothing was still out. Between the passes nothing is
    drawn, and the GPU lock (GATE_LOCK) is let go. */
export async function motion(opt, kit) {
  K = kit;
  const { OUT, BASE, SCREEN, INSIDE, pick, commit, save, launch, f } = K;
  const list = pick(PATHS, opt.paths, 'path'), fps = +(opt.fps ?? 60), keep = +(opt.keep ?? 6), workers = +(opt.workers ?? 2), to = opt.to != null ? +opt.to : null;
  const floor = !!opt.floor, tag = (opt.tag || commit()) + (floor ? '-floor' : ''), dir = `${OUT}motion-${tag}/`, report = { tag, fps, line: POP, floor, when: new Date().toISOString(), screen: SCREEN, inside: INSIDE, paths: {} };
  mkdirSync(dir, { recursive: true });
  const net = await receiver(), work = pool(workers), ctx = await launch(opt);
  console.log(`motion → .gate/motion-${tag}/ (${BASE}): every path at ${fps} frames a second, as the game draws it and ${floor ? 'as it draws it again (the noise floor)' : 'as the truth does'}`);
  try {
    for (const [k, p] of list.entries()) {
      const T = 3600 + 200 * k, store = `${mkdtempSync(join(tmpdir(), 'gate-motion-'))}/`;   // (each path at its own hour on the world's clock, the same in every run; its first pass's frames kept here till the second's are measured)
      try {
        const A = await locked(`motion: ${p.name}, as the game draws it`, () => pass(ctx, p, { truth: false, T, fps, to, net, store }));
        const r = await locked(`motion: ${p.name}, ${floor ? 'again' : 'the truth'}`, () => pass(ctx, p, { truth: !floor, floor, T, fps, to, net, reach: opt.reach, from: store, jits: A.jits, start: A.start, work, workers, keep }));
        r.ms += A.ms;
        await filmstrip(ctx, `${dir}${p.name}.jpg`, { title: `gate.js motion · ${p.name} · ${tag}`, sub: `the change detail made in each frame, ((LOD − ${floor ? 'LOD again' : 'truth'}) now) − (the same a frame before), FLIP in 32-px tiles at 4K · ${r.frames} frames at ${fps} a second · worst tile ${r.worst?.value.toFixed(4)} at ${r.worst?.s.toFixed(2)} s · ${r.over} over the line ${POP} (provisional)`, r, other: floor ? 'LOD again' : 'truth' });
        const { shown, ...kept } = r; report.paths[p.name] = kept; save(`${dir}report.json`, report);
        console.log(`  ${p.name}: the worst tile ${r.worst?.value.toFixed(4)} (frame ${r.worst?.frame}, ${r.worst?.s.toFixed(2)} s, at ${r.worst?.x},${r.worst?.y}); p99 ${r.p99?.toFixed(4)}; ${r.over} over ${POP}; ${(r.ms / 60e3).toFixed(1)} min → .gate/motion-${tag}/${p.name}.jpg`);
      } finally { rmSync(store, { recursive: true, force: true }); }
    }
  } finally { await ctx.close(); net.close(); await work.close(); }
  const fails = Object.entries(report.paths).filter(([, r]) => r.over).map(([k, r]) => `${k} ${r.over} frame(s), the worst ${r.worst.value.toFixed(4)}`);
  console.log(`motion, ${tag}: the change detail made in each frame (FLIP of ((LOD − truth) now) − ((LOD − truth) a frame before), 32-px tiles, 4K)`);
  console.log(`  ${'path'.padEnd(8)}${'frames'.padStart(7)}${'worst'.padStart(9)}${'at s'.padStart(8)}${'p99'.padStart(9)}${'median'.padStart(9)}${`>${POP}`.padStart(7)}${'truth again'.padStart(13)}`);
  for (const [k, r] of Object.entries(report.paths)) console.log(`  ${k.padEnd(8)}${String(r.frames).padStart(7)}${f(r.worst?.value, 4, 9)}${f(r.worst?.s, 2)}${f(r.p99, 4, 9)}${f(r.median, 4, 9)}${String(r.over).padStart(7)}${String(r.again).padStart(13)}`);
  console.log(`  the merge rule, nothing pops (no frame's worst tile over ${POP}, provisional): ${fails.length ? 'NOT MET: ' + fails.join('; ') : 'met'}`);
  report.pass = !fails.length; report.fails = fails; save(`${dir}report.json`, report);
  return report;
}

/** In the page, once it has come and settled (tools/gate.js open, prepare): the clock taken (no frame drawn after this
    but those the gate steps), and what the frames need: the shared uniforms, what is still out (src/core/settle.js), the
    flight (tools/flyby.js). truth: this page is the truth, drawn as a frame in motion. Its own start (t0: the world's
    clock is (timestamp − t0) / 1000 s, src/boot.js) and that clock now. */
export async function begin({ truth }) {
  const R = performance.getEntriesByType('resource').map((e) => e.name), mod = (part) => import(R.filter((n) => n.includes(part)).at(-1));
  const [{ U }, { waiting }, F] = await Promise.all([mod('src/core/uniforms.js'), mod('src/core/settle.js'), import(new URL('tools/flyby.js', location.href).href)]);
  if (truth) { const { TRUTH_AS } = await mod('src/detail/measure.js'); TRUTH_AS.still = false; }
  const C = window.__gateClock; C.start();
  const t0 = C.last - U.uTime.value * 1000, g = window.__game;
  // (the camera where the path has it s seconds in: the film camera's timeline, or the flight's rig)
  const pose = (s, fly) => { if (!fly) return void window.__cine.seek(s); const q = F.flightAt(s, 'zoom'); g.controls.place(q.x, q.z, q.yaw); g.controls.height = q.h; };
  window.__gateMotion = { U, waiting, pose, t0 };
  return { clock: U.uTime.value, visible: document.visibilityState, inside: [window.__game.screen.inside] };
}

/** In the page: the path laid (tools/gate.js course; the flight: the film camera let go, the rig flown frame by frame
    here, not by tools/flyby.js's own loop), the camera at its start, and the world settled there with the clock standing
    at T seconds, frame by stepped frame. Then, given `jit` (the other page's place of a pixel in its last frame), frames
    drawn on there until this one's last is at the same place: the two pages' frames are then drawn at the same places,
    frame for frame. What it took. */
export async function rest({ T, fly, jit = null, wait = 600e3 }) {
  const M = window.__gateMotion, C = window.__gateClock, g = window.__game, t = M.t0 + T * 1000, t0 = Date.now();
  if (fly) window.__cine.release();
  const pose = () => M.pose(0, fly);
  let done = null, frames = 0;
  pose();
  g.settle({ timeout: wait }).then((r) => (done = r), (e) => (done = { error: String(e.message ?? e) }));
  while (!done) { pose(); await C.step(t); frames++; await new Promise((r) => setTimeout(r, 0)); }
  if (done.error) throw new Error(done.error);
  let aligned = 0;
  if (jit) for (; aligned < 128 && (M.U.uJit.value.x !== jit[0] || M.U.uJit.value.y !== jit[1]); aligned++) { pose(); await C.step(t); }
  return { frames, aligned, ms: Date.now() - t0, jit: [M.U.uJit.value.x, M.U.uJit.value.y] };
}

/** In the page: frame `s` seconds into the path, at T seconds on the world's clock, drawn and sent to the gate (its raw
    RGBA bytes, POSTed to `url`). whole: the frame is the truth's, and is drawn again (the clock and the camera standing)
    until nothing was still out when it was drawn, then on until its place of a pixel is `jit`'s again (the LOD page's
    this frame), so the two are drawn alike. What it took: { jit (this frame's place), again (frames drawn over), out
    (what was still out, the first time, by source), ms }. */
export async function shot({ s, T, fly, url, key, whole = false, jit = null, wait = 120e3 }) {
  const M = window.__gateMotion, C = window.__gateClock, g = window.__game, c = window.__cine, t = M.t0 + T * 1000, t0 = Date.now();
  const busy = () => Object.keys(M.waiting()).length > 0;
  let again = -1, first = null, cv = null, late = false;
  for (;;) {
    again++;
    M.pose(s, fly);
    const grab = c.grab(g.renderer.domElement.width);
    await C.step(t);
    cv = await grab;
    if (whole) {
      await g.renderer.backend.device?.queue.onSubmittedWorkDone();
      await new Promise((r) => setTimeout(r, 0));   // (what the frame read back, come)
      if (busy()) {   // (drawn while something was out: what a worker brings is waited for a moment, what a frame does is drawn again)
        first ??= M.waiting();
        const w0 = Date.now(); while (busy() && Date.now() - w0 < 2000) await new Promise((r) => setTimeout(r, 20));
        if (Date.now() - t0 < wait) continue;
        late = true;
      }
      if (jit && again < 64 && (M.U.uJit.value.x !== jit[0] || M.U.uJit.value.y !== jit[1])) continue;
    }
    break;
  }
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  await fetch(`${url}?key=${key}&w=${cv.width}&h=${cv.height}`, { method: 'POST', body: d, mode: 'no-cors' });
  return { jit: [M.U.uJit.value.x, M.U.uJit.value.y], again, out: first, late, ms: Date.now() - t0 };
}

/** In a blank page: a path's filmstrip as a JPEG data URL, `width` wide. At the top, every frame's worst tile against
    the line (`line`); under it a row for each frame shown: the frame small with its worst tile outlined, then the
    squares round that tile at full size (LOD before, LOD now, truth before, truth now, the change's heat map), labelled.
    rows: [{ label, thumb: { w, h, rgb (base64) }, crops: [base64 RGB, …], crop, at: [x, y], tile, scale }]. */
export function film({ title, sub, width, series, line, rows, names }) {
  const PAD = 10, CHART = 210, LABEL = 22, img = (b64, w, h) => { const s = atob(b64), id = new ImageData(w, h); for (let i = 0, j = 0; i < w * h; i++, j += 3) { id.data[4 * i] = s.charCodeAt(j); id.data[4 * i + 1] = s.charCodeAt(j + 1); id.data[4 * i + 2] = s.charCodeAt(j + 2); id.data[4 * i + 3] = 255; } const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(id, 0, 0); return c; };
  const tw = rows[0]?.thumb.w ?? 640, th = rows[0]?.thumb.h ?? 360, n = names.length, cs = Math.floor((width - tw - PAD * (n + 2)) / n);
  const rowH = Math.max(th, cs + LABEL) + LABEL + PAD;
  const cv = document.createElement('canvas'); cv.width = width; cv.height = 64 + CHART + PAD + rows.length * rowH + PAD;
  const x = cv.getContext('2d');
  x.fillStyle = '#101418'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#f2efe6'; x.font = 'bold 22px -apple-system, Helvetica, sans-serif'; x.fillText(title, PAD, 30);
  x.font = '14px -apple-system, Helvetica, sans-serif'; x.fillStyle = '#b9c0c6'; x.fillText(sub, PAD, 52);
  // the chart: the worst tile of every frame, the line, the frames shown marked
  const cx0 = PAD + 44, cy0 = 64, cw = width - cx0 - PAD, top = Math.max(line * 2, ...series.map((p) => p[1])) * 1.05 || 1;
  const X = (s) => cx0 + (s / (series.at(-1)?.[0] || 1)) * cw, Y = (v) => cy0 + CHART - 18 - (v / top) * (CHART - 26);
  x.strokeStyle = '#2c343c'; x.lineWidth = 1; x.font = '11px -apple-system, Helvetica, sans-serif'; x.fillStyle = '#8a949c';
  for (let k = 0; k <= 4; k++) { const v = (top * k) / 4; x.beginPath(); x.moveTo(cx0, Y(v)); x.lineTo(cx0 + cw, Y(v)); x.stroke(); x.fillText(v.toFixed(3), PAD, Y(v) + 4); }
  x.fillText('seconds into the path →', cx0 + cw - 130, cy0 + CHART - 2);
  x.strokeStyle = '#e8a33d'; x.setLineDash([6, 4]); x.beginPath(); x.moveTo(cx0, Y(line)); x.lineTo(cx0 + cw, Y(line)); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#e8a33d'; x.fillText(`line ${line}`, cx0 + 4, Y(line) - 4);
  x.strokeStyle = '#7fc8a9'; x.lineWidth = 1.5; x.beginPath(); series.forEach(([s, v], k) => (k ? x.lineTo(X(s), Y(v)) : x.moveTo(X(s), Y(v)))); x.stroke();
  for (const r of rows) { x.fillStyle = '#ff5a5a'; x.beginPath(); x.arc(X(r.s), Y(r.value), 4, 0, 7); x.fill(); }
  // the rows
  let y = 64 + CHART + PAD;
  for (const r of rows) {
    x.fillStyle = '#f2efe6'; x.font = 'bold 14px -apple-system, Helvetica, sans-serif'; x.fillText(r.label, PAD, y + 16);
    const yy = y + LABEL;
    x.drawImage(img(r.thumb.rgb, r.thumb.w, r.thumb.h), PAD, yy);
    const k = r.thumb.w / r.width;   // (the tile, outlined on the small frame)
    x.strokeStyle = '#ff5a5a'; x.lineWidth = 2; x.strokeRect(PAD + r.worst.x * k - 3, yy + r.worst.y * k - 3, r.worst.size * k + 6, r.worst.size * k + 6);
    x.imageSmoothingEnabled = false;
    r.crops.forEach((b64, j) => {
      const cx = PAD * 2 + tw + j * (cs + PAD);
      x.drawImage(img(b64, r.crop, r.crop), cx, yy, cs, cs);
      const q = cs / r.crop; x.strokeStyle = 'rgba(255,90,90,0.9)'; x.lineWidth = 1; x.strokeRect(cx + r.tile.x * q, yy + r.tile.y * q, r.tile.size * q, r.tile.size * q);
      x.fillStyle = '#b9c0c6'; x.font = '12px -apple-system, Helvetica, sans-serif'; x.fillText(names[j], cx, yy + cs + 15);
    });
    x.imageSmoothingEnabled = true;
    y += rowH;
  }
  return cv.toDataURL('image/jpeg', 0.9);
}
