// The device under the game, on the machine the 8 GB gate is for (intent 0038, 2026-11-19: on deployed next, WebKit at
// Retina scale held 2.3 GB of GPU memory at ready and 5.2 GB six seconds later, single submissions took up to 4.2 s, and
// its GPU process died at 38 s, the device lost; Samuel's MacBook did the same, and nothing had measured it).
// tools/gate.js device, and the first of the hour's run (hourly).
//
// Two starts, as a player has them (2026-11-19: a Mac keeps compiled shaders by their source, outside any browser's
// profile, so a pipeline compiled before costs 3-30 ms and one compiled cold 100-1300 ms; B's salted measures):
// - cold, the first start after the shaders changed (after an update): a fresh profile, and every shader the game makes
//   marked anew (tools/gate/wgsl.js mark), so neither the browser nor the driver has kept any of it; measured whole,
//   below;
// - warm, a repeat start: the same profile and the same marks, in a browser of its own, till ready.
// WebKit at budget.js's MACHINE, from the cold start to `secs` past ready, walked forward a while in the middle:
// - the GPU memory as the game's own ledger keeps it (src/core/gpu.js: what the device has made, by class against
//   BUDGET_MB, the pools largest first, what no pool notes), sampled each second: its peak and where it settles;
// - that ledger checked by a count of the gate's own, every buffer the device makes net of its destroy(): the ledger
//   holds at least those (textures are the ledger's alone: one count of them, not two);
// - WebKit's own processes' resident memory beside it (every process of the browser Playwright runs);
// - every submission's own GPU time (the queue runs in order: done less the later of its submit and the one before's
//   done), the longest and every one over budget.js SUBMIT_MS with what it held (each pipeline with its draws and
//   instances or its dispatches and workgroups, where its pass began, what was written before it), and how many took
//   more than a frame's budget (FRAME_MS); any destroyed buffer a submission binds (WebKit says only "Validation failure.");
// - whether the device survives (device.lost), and what the device said wrong (uncaptured errors);
// - till ready, what held it: each source src/core/settle.js counts as still out (window.__game.waiting(), the game's
//   own registry), from and till when, the start's last stage (window.__game.boot, its own marks) and the veil's words.
// A lost device fails; the rest is shown.
import { webkit } from 'playwright-core';
import { webkitAt } from '../browsers.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mark } from './wgsl.js';
import { MACHINE, BUDGET_MB, FRAME_MS, SUBMIT_MS, TASK_MS } from '../../src/core/budget.js';

/** In the page, before anything of it runs: the device as the gate sees it. The buffers it makes (net of destroy); what
    each command buffer holds (its passes, where in the page's code each began, each pipeline they used with its draws
    and instances or its dispatches and workgroups, the render bundles they ran counted in them, the buffers they bind);
    each submission's own GPU time (the queue runs in order: from when it was submitted or the one before it was done,
    whichever was later, to its own done) with what it held: the longest, every one over submitMs (budget.js SUBMIT_MS:
    all counted, the worst kept), and how many took more than frameMs; a destroyed buffer a submission uses (WebKit says
    only "Validation failure."); the device's loss and its errors. A done is heard only when the page's own thread is
    free, so a submission's time is at most so: how late its done may have been heard is kept with it (late, the thread
    busy just before), and a submission over submitMs even so is surely over (sure). */
export function watch(frameMs, submitMs, salt = 0) {
  const W = (window.__device = { buffers: 0, submits: 0, longest: 0, over: 0, slow: [], slowN: 0, sure: 0, lost: null, errors: [], top: null, long: null, dead: [] });
  // (the ledger's most, read in the page every frame, what it held then with it: it rises by gigabytes the seconds before
  // a device is lost, between two of the gate's looks)
  const keep = () => { const L = window.__game?.memory?.(); if (L && L.gpu > (W.top?.device ?? -1)) W.top = { device: L.gpu, classes: L.classes, rows: L.rows.slice(0, 8), makers: L.makers.slice(0, 8), over: L.over, unnoted: L.unnoted, buffers: W.buffers }; requestAnimationFrame(keep); };
  requestAnimationFrame(keep);
  const DEAD = new WeakSet(), LABEL = new WeakMap(), GROUP = new WeakMap(), HOLDS = new WeakMap(), BUNDLE = new WeakMap(), USED = new WeakSet();
  const where = () => (new Error().stack || '').split('\n').map((l) => l.trim().replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?[^:)]*/, '')).filter((l) => /(^|\W)(src|assets)\//.test(l)).slice(0, 2).join(' < ');
  // (the page's thread: when it was last free, and the spans it was not; a done heard right after one may have come any
  // time in it. A timer, not a frame: a frame waits for the GPU too)
  let free = performance.now();
  const gaps = [], tick = () => { const now = performance.now(); if (now - free > 12) { gaps.push([free, now]); if (gaps.length > 32) gaps.shift(); } free = now; setTimeout(tick, 4); };
  setTimeout(tick, 4);
  const lateBy = (now) => Math.max(now - free, ...gaps.filter(([, b]) => b >= now - 12).map(([a]) => now - a));
  const buffers = (dev) => {
    const make = dev.createBuffer.bind(dev), group = dev.createBindGroup.bind(dev);
    dev.createBuffer = (d) => { const b = make(d), destroy = b.destroy.bind(b); let gone = false; W.buffers += d.size; LABEL.set(b, d.label || '?'); b.destroy = () => { if (!gone) { gone = true; DEAD.add(b); W.buffers -= d.size; } destroy(); }; return b; };
    dev.createBindGroup = (d) => { const g = group(d); GROUP.set(g, (d.entries ?? []).map((e) => e.resource?.buffer ?? (e.resource instanceof GPUBuffer ? e.resource : null)).filter(Boolean)); return g; };
  };
  const named = (l) => (l || '?').replace(/^(render|compute)Pipeline_(compute_)?/, '').replace(/_\d+$/, '');   // (three's labels: renderPipeline_<material>_<id>, computePipeline_compute_<name>)
  const pass = (p, kind, list) => {
    const r = { kind, by: where(), uses: new Map(), bufs: new Set() }, bind = p.setBindGroup.bind(p), pipe = p.setPipeline.bind(p);
    const use = (name) => r.uses.get(name) ?? r.uses.set(name, { n: 0, inst: 0, wg: 0, ind: 0, fresh: false }).get(name);
    let u = null;
    list.push(r);
    p.setBindGroup = (i, g, ...a) => { for (const b of GROUP.get(g) ?? []) r.bufs.add(b); return bind(i, g, ...a); };
    p.setPipeline = (x) => { u = use(named(x.label)); if (!USED.has(x)) { USED.add(x); u.fresh = true; } return pipe(x); };   // (fresh: its first use, which may wait for its compile)
    for (const f of ['setVertexBuffer', 'setIndexBuffer', 'dispatchWorkgroups', 'dispatchWorkgroupsIndirect', 'draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect']) if (p[f]) {
      const o = p[f].bind(p), set = f.startsWith('set'), buf = f === 'setVertexBuffer' ? 1 : f === 'setIndexBuffer' || f.endsWith('Indirect') ? 0 : -1;
      p[f] = (...a) => {
        if (buf >= 0 && a[buf]) r.bufs.add(a[buf]);
        if (!set) { const c = (u ??= use('?')); c.n++; if (f.endsWith('Indirect')) c.ind++; else if (f === 'dispatchWorkgroups') c.wg += a[0] * (a[1] ?? 1) * (a[2] ?? 1); else c.inst += a[1] ?? 1; }   // (an indirect call's counts are the GPU's: counted as calls)
        return o(...a);
      };
    }
    if (p.executeBundles) { const run = p.executeBundles.bind(p); p.executeBundles = (bs) => { for (const b of bs) { const x = BUNDLE.get(b); if (!x) continue; for (const [k, c] of x.uses) { const t = use(k); t.n += c.n; t.inst += c.inst; t.ind += c.ind; t.fresh ||= c.fresh; c.fresh = false; } for (const v of x.bufs) r.bufs.add(v); } return run(bs); }; }   // (a bundle's draws, each time it runs, in the pass that runs it)
    return p;
  };
  const encoders = (dev) => {
    const make = dev.createCommandEncoder.bind(dev), bundle = dev.createRenderBundleEncoder?.bind(dev);
    dev.createCommandEncoder = (d) => { const e = make(d), list = [], c = e.beginComputePass.bind(e), r = e.beginRenderPass.bind(e), fin = e.finish.bind(e); e.beginComputePass = (x) => pass(c(x), 'compute', list); e.beginRenderPass = (x) => pass(r(x), 'render', list); e.finish = (x) => { const b = fin(x); HOLDS.set(b, list); return b; }; return e; };
    if (bundle) dev.createRenderBundleEncoder = (d) => { const list = [], e = pass(bundle(d), 'bundle', list), fin = e.finish.bind(e); e.finish = (x) => { const b = fin(x); BUNDLE.set(b, list[0]); return b; }; return e; };
  };
  /** A submission's own time ms, submitted at t, what it held (list: its passes), what was written to the device before
      it (up: [bytes, writes]), how late its done may have been heard. */
  const held = (list, ms, t, up, late) => {
    const by = {}, of = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    for (const r of list) for (const [name, c] of r.uses) { const a = (by[`${r.kind} ${name}, begun at ${r.by || '?'}`] ||= { kind: r.kind, passes: 0, n: 0, inst: 0, wg: 0, ind: 0, fresh: false }); a.passes++; a.n += c.n; a.inst += c.inst; a.wg += c.wg; a.ind += c.ind; a.fresh ||= c.fresh; }
    const what = Object.entries(by).sort(([, x], [, y]) => y.inst + y.wg + y.ind - (x.inst + x.wg + x.ind) || y.n - x.n).slice(0, 8)
      .map(([k, a]) => `${a.passes}× ${k}: ${a.kind === 'compute' ? `${of(a.n, 'dispatch', 'dispatches')}, ${of(a.wg, 'workgroup', 'workgroups')}` : `${of(a.n, 'draw', 'draws')}, ${of(a.inst, 'instance', 'instances')}`}${a.ind ? ` (${a.ind} of them indirect)` : ''}${a.fresh ? ', its first use' : ''}`);
    return { at: Math.round(t), ms: Math.round(ms), late: late > 12 ? Math.round(Math.min(late, ms)) : 0, passes: list.length, up: { bytes: up[0], writes: up[1] }, what };
  };
  const timed = (dev) => {
    const q = dev.queue, submit = q.submit.bind(q);
    let last = 0, up = 0, ups = 0;
    const upload = (f, bytes) => { const o = q[f].bind(q); q[f] = (...a) => { up += bytes(...a); ups++; return o(...a); }; };   // (what is written to the device before a submission is done on the queue before it: in its time)
    upload('writeBuffer', (b, o, d, at = 0, n) => { const e = d.BYTES_PER_ELEMENT ?? 1; return n != null ? n * e : (d.byteLength ?? 0) - at * e; });
    upload('writeTexture', (to, d) => d.byteLength ?? 0);
    upload('copyExternalImageToTexture', (from, to, s) => (s.width ?? s[0] ?? 0) * (s.height ?? s[1] ?? 1) * 4);
    q.submit = (cbs) => {
      const t = performance.now(), list = [...cbs].flatMap((c) => HOLDS.get(c) ?? []), before = [up, ups];
      up = ups = 0;
      for (const r of list) for (const b of r.bufs) if (DEAD.has(b) && W.dead.length < 12) W.dead.push(`the destroyed buffer "${LABEL.get(b)}" bound by a ${r.kind} pass (${r.uses.keys().next().value ?? 'no pipeline'}) begun at ${r.by || '?'}, ${Math.round(t / 1e3)} s in`);
      submit(cbs); W.submits++;
      q.onSubmittedWorkDone().then(() => {
        const now = performance.now(), ms = now - Math.max(t, last);
        last = now;
        if (ms > frameMs) W.over++;
        if (ms <= W.longest && ms <= submitMs) return;
        const h = held(list, ms, t, before, lateBy(now));
        if (ms > W.longest) { W.longest = ms; W.long = h; }
        if (ms > submitMs) { W.slowN++; if (h.ms - h.late > submitMs) W.sure++; W.slow = [...W.slow, h].sort((x, y) => y.ms - x.ms).slice(0, 12); }
      }, () => {});
    };
  };
  // (every program the device is asked to make, with when, kept apart from W, which every look reads: the first view's,
  // those made before its first frame showed, are compiled again cold in a blank page, tools/gate/wgsl.js firstView)
  const CODE = new WeakMap(), MADE = (window.__programs = []);
  const programs = (dev) => {
    const mod = dev.createShaderModule.bind(dev);
    dev.createShaderModule = (d) => { const m = mod(salt && d?.code ? { ...d, code: window.__gateMark(d.code, salt) } : d); CODE.set(m, d?.code); return m; };   // (salt: each module marked, tools/gate/wgsl.js mark: compiled anew, a cold start's; kept as the game wrote it)
    for (const [fn, kind] of [['createRenderPipelineAsync', 'render'], ['createRenderPipeline', 'render'], ['createComputePipelineAsync', 'compute'], ['createComputePipeline', 'compute']]) {
      const make = dev[fn].bind(dev);
      dev[fn] = (d) => { MADE.push({ kind, at: performance.now(), label: d?.label ?? '', codes: kind === 'render' ? [CODE.get(d?.vertex?.module), CODE.get(d?.fragment?.module)] : [CODE.get(d?.compute?.module)] }); return make(d); };
    }
  };
  const ask = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (desc) {
    const dev = await ask.call(this, desc);
    dev.lost.then((i) => { W.lost = { at: Math.round(performance.now()), reason: i.reason, message: i.message }; });
    dev.addEventListener?.('uncapturederror', (e) => { if (W.errors.length < 8) W.errors.push(String(e.error?.message).slice(0, 300)); });
    buffers(dev); encoders(dev); timed(dev); programs(dev);
    return dev;
  };
}
/** The watch as a page's init script (Playwright's addInitScript; tools/gate.js open's init): a frame's GPU budget and a
    submission's limit from budget.js, every shader marked with salt (0: none). */
export const watching = (salt = 0) => `(${watch})(${FRAME_MS}, ${SUBMIT_MS}, ${salt})`;
/** In the page: the programs made before the first frame showed (all, where it never did), each once: { render: [{ label,
    vertex, fragment }], compute: [{ label, code }], shown (whether it did), made (the pipelines asked before it) }. */
const firstMade = () => {
  const end = performance.getEntriesByName('game:first-frame')[0]?.startTime ?? Infinity, seen = new Set(), out = { render: [], compute: [], shown: end < Infinity, made: 0 };
  for (const p of window.__programs ?? []) {
    if (p.at > end) continue;
    out.made++;
    const k = p.codes.join('\0');
    if (p.codes.some((c) => c == null) || seen.has(k)) continue;
    seen.add(k);
    if (p.kind === 'render') out.render.push({ label: p.label, vertex: p.codes[0], fragment: p.codes[1] }); else out.compute.push({ label: p.label, code: p.codes[0] });
  }
  return out;
};
/** In the page: the ledger now (src/core/gpu.js), with the gate's own count and the device's state. */
const look = () => {
  let out = null; try { out = window.__game?.waiting?.() ?? null; } catch (e) { out = { [`waiting() threw: ${e.message}`]: 1 }; }   // (a source that cannot say: said, by name)
  return { ready: window.__game?.loadMs ?? null, shown: performance.getEntriesByName('game:first-frame')[0]?.startTime ?? null, ledger: window.__game?.memory?.() ?? null, out, stage: Object.entries(window.__game?.boot ?? {}).at(-1) ?? null, step: document.body?.dataset.step ?? null, ...window.__device };
};
/** The resident memory of every process of the WebKit Playwright runs (its pages', its GPU's, its own), MB (0 where it
    cannot be read). */
function gpuProcess() {
  try { return execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8' }).split('\n').filter((l) => /ms-playwright\/webkit/i.test(l)).reduce((s, l) => s + +l.trim().split(/\s+/)[0] / 1024, 0); } catch { return 0; }
}

/** The device on MACHINE: { ready (s), peak and settled (MB, the ledger's), classes at the peak against BUDGET_MB, the
    largest pools, unnoted, buffers (the gate's own count, at the peak), process (MB, its most), longest submission (ms)
    and long (what it held), slow (the worst over SUBMIT_MS, what each held), slowN and sure (how many, and how many
    surely), over (how many took more than FRAME_MS), lost, errors, pass }. url: the game's. */
export async function device(url, { secs = 60, programs = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-device-')), salt = 1 + Math.floor(Math.random() * 0x7fffffff);   // (a profile and a mark of this run's own: its start is cold)
  try { const out = await coldStart(url, { secs, programs, dir, salt }); if (out.ready != null) out.warm = await warmStart(url, { secs, dir, salt }); return out; }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
/** WebKit on MACHINE, its profile `dir` (as a player's is kept from one start to the next), the device watched (watch:
    each shader marked with salt), at url. { context, page }. */
async function opened(url, dir, salt) {
  const context = await webkit.launchPersistentContext(dir, { headless: true, ...webkitAt(), viewport: { width: MACHINE.width, height: MACHINE.height }, deviceScaleFactor: MACHINE.dpr });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.addInitScript(`window.__gateMark = ${mark}`); await page.addInitScript(watching(salt));
  return { context, page, t0: Date.now(), go: () => page.goto(url, { waitUntil: 'load' }) };
}
/** A repeat start (a player's next): the same profile and the same mark as the cold one before it, so what the browser
    and the driver kept from it is kept, in a browser of its own; till ready. { ready, shown (s), lost }. */
async function warmStart(url, { secs, dir, salt }) {
  const { context, page, t0, go } = await opened(url, dir, salt);
  try { await go(); const ready = await arrived(page, { samples: [], process: 0 }, t0, secs), s = await page.evaluate(look); return { ready, shown: s.shown == null ? null : +(s.shown / 1e3).toFixed(1), lost: s.lost ?? null }; }
  finally { await context.close(); }
}
/** The first start after the shaders changed (what a player sees after an update): a fresh profile, every shader
    marked anew (salt), so neither the browser nor the driver has kept any of it; the device measured through it. */
async function coldStart(url, { secs, programs, dir, salt }) {
  const { context, page, t0, go } = await opened(url, dir, salt);
  try {
    const out = { machine: MACHINE, budget: Object.values(BUDGET_MB).reduce((a, b) => a + b, 0), peak: 0, process: 0, samples: [] };
    await go();
    out.ready = await arrived(page, out, t0, secs);
    if (out.ready != null) await page.evaluate(() => window.__game?.frames?.());   // (the frames from ready on: the start's are the veil's, src/boot.js)
    const s = out.ready == null ? await page.evaluate(look) : await stay(page, out, secs);
    out.frames = await page.evaluate(() => window.__game?.frames?.() ?? null);
    Object.assign(out, { shown: s.shown == null ? null : +(s.shown / 1e3).toFixed(1), settled: out.samples.at(-1) ?? null, longest: Math.round(s.longest ?? 0), over: s.over ?? 0, submits: s.submits ?? 0, lost: s.lost ?? null, errors: s.errors ?? [], long: s.long ?? null, slow: s.slow ?? [], slowN: s.slowN ?? 0, sure: s.sure ?? 0, dead: s.dead ?? [], process: Math.round(out.process) });
    out.honest = out.buffers == null || out.peak >= out.buffers;   // (the ledger holds at least the buffers the device made)
    out.pass = !out.lost && out.ready != null;
    say(out);
    if (programs) Object.defineProperty(out, 'programs', { value: await page.evaluate(firstMade).catch(() => null) });   // (programs: the first view's own, handed over, never kept with the run: megabytes of WGSL)
    return out;
  } finally { await context.close(); }
}
/** The game's start, as long as four stays, sampled (sample): seconds from t0 to ready, or null where it never came
    (or the device was lost before). */
async function arrived(page, out, t0, secs) {
  let s = await sample(page, out);
  while (s.ready == null && !s.lost && Date.now() - t0 < secs * 4e3) { hold(out, s, Math.round((Date.now() - t0) / 1e3)); await page.waitForTimeout(1e3); s = await sample(page, out); }
  return s.ready == null || s.lost ? null : +((Date.now() - t0) / 1e3).toFixed(1);
}
/** What held the start at a look s, t seconds in, kept in out.held: each source still out (settle.js waiting()), from
    and till when, its most at once and its count now; the start's last stage and the veil's words. */
function hold(out, s, t) {
  const H = (out.held ??= { sources: {} });
  for (const [k, n] of Object.entries(s.out ?? {})) { const h = (H.sources[k] ??= { from: t, most: 0 }); h.until = t; h.most = Math.max(h.most, n); }
  for (const [k, h] of Object.entries(H.sources)) h.now = s.out?.[k] ?? 0;
  Object.assign(H, { at: t, stage: s.stage, step: s.step });
}
/** A look, kept in out: the ledger's device now, its most as the page kept it (and what the ledger held then), the
    browser's resident memory at its most. */
async function sample(page, out) {
  const s = await page.evaluate(look), T = s.top;
  out.samples.push(s.ledger?.gpu ?? 0); out.process = Math.max(out.process, gpuProcess());
  if (T) Object.assign(out, { peak: T.device, classes: T.classes, rows: T.rows, makers: T.makers, past: T.over, unnoted: T.unnoted, buffers: +(T.buffers / 1048576).toFixed(1) });
  return s;
}
/** `secs` past ready, sampled each second (sample), walked forward from a third of the stay to its half; ends early where the device is lost. The last
    look. */
async function stay(page, out, secs) {
  const end = Date.now() + secs * 1e3, walk = [Date.now() + (secs * 1e3) / 3, Date.now() + (secs * 1e3) / 2];
  let s = {}, walking = false;
  while (Date.now() < end && !s.lost) {
    if (!walking && Date.now() > walk[0] && Date.now() < walk[1]) { walking = true; await page.mouse.click(MACHINE.width / 2, MACHINE.height / 2); await page.keyboard.down('KeyW'); }
    if (walking && Date.now() > walk[1]) { walking = false; await page.keyboard.up('KeyW'); }
    await page.waitForTimeout(1e3);
    s = await sample(page, out);
  }
  return s;
}

/** Whether the game came: ready (window.__game.loadMs set: the start's world made and drawn) and in how long, the first
    frame shown (the game's mark, src/core/marks.js) beside it; the hour's board's first line. */
const came = (r) => (r?.ready != null ? `yes, ${r.ready} s in${r.shown != null ? ` (the first frame shown ${r.shown} s in)` : ''}` : r ? `**no**${r.lost ? ' (the device lost)' : ''}` : 'not tried');
export const readyLine = (d) => (d?.ready != null ? `Ready, cold (the first start after the shaders changed: a fresh profile, every shader compiled anew): ${came(d)}; warm (a repeat start, what the browser and the driver kept, kept): ${came(d.warm)}; on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}× in WebKit.` : `**Ready: no**${d ? `, on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}× in WebKit${d.lost ? ' (the device lost first)' : ''}` : ''}: the game never came.${stillOut(d?.held, d?.submits)}`);
/** What still held the start when the run ended (hold): each source still out, with its count and since when, the
    start's last stage, the veil's words, the submissions drawn meanwhile (frames behind the veil, or none). */
const stillOut = (H, submits) => (!H ? '' : ` Still out: ${Object.entries(H.sources).filter(([, h]) => h.now).map(([k, h]) => `${k} (${h.now}, since ${h.from} s)`).join(', ') || 'nothing settle.js counts'}; the start's last stage ${H.stage ? `'${H.stage[0]}', ${(H.stage[1] / 1e3).toFixed(1)} s in` : 'none'}${H.step ? `; the veil: "${H.step}"` : ''}; ${submits ?? 0} submissions drawn.`);
/** The device's lines, as the hour's board begins with them (after readyLine). */
export function lines(d) {
  if (d?.peak == null) return [];
  const mb = (n) => (n == null ? '–' : `${(n / 1024).toFixed(2)} GB`);
  return [
    d.lost ? `**The device was lost** ${(d.lost.at / 1e3).toFixed(0)} s in (${d.lost.reason}: ${d.lost.message}), on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}×.` : 'The device lived.',   // (whether the game came, and when, is readyLine's to say)
    `GPU memory (the game's ledger): peak ${mb(d.peak)}, settled ${mb(d.settled)}, against the budget's ${mb(d.budget)}; unnoted by any pool ${mb(d.unnoted)}; WebKit's processes at most ${mb(d.process)} resident${d.honest ? '' : `; **the ledger is short**: the device made ${mb(d.buffers)} of buffers alone`}.`,
    `By class at the peak: ${Object.entries(d.classes ?? {}).map(([c, x]) => `${c} ${x.gpu} MB of ${x.budget}${x.gpu > x.budget ? ' (over)' : ''}`).join(', ') || '–'}.`,
    `The largest pools: ${(d.rows ?? []).map(([n, g]) => `${n} ${g} MB`).join('; ') || '–'}.`,
    `The largest makes, by class and what they were (the ledger's makers): ${(d.makers ?? []).map(([c, w, m, n]) => `${c}: ${w} ${m} MB (${n})`).join('; ') || '–'}.`,
    `Made past a budget (the ledger's over): ${(d.past ?? []).map((o) => `${o.who} with ${o.by} (${o.mb} MB of ${o.budget})`).join('; ') || 'none'}.`,
    `Submissions: ${d.over} of ${d.submits} over a frame's GPU budget (${FRAME_MS} ms); ${submissions(d)}.`,
    ...('frames' in d ? [framesLine(d.frames, d.ready != null ? 'from ready on' : 'from the start')] : []),
    d.dead.length ? `**A destroyed buffer was used** (WebKit says only "Validation failure."): ${d.dead[0]}${d.dead.length > 1 ? ` (and ${d.dead.length - 1} more)` : ''}.` : 'No destroyed buffer was used.',
    ...(d.errors.length ? [`The device said: ${d.errors[0]}`] : []),
  ];
}
/** A submission as the board says it (watch: held): its own time, how late its done may have been heard, when, and what
    it held: what was written before it, each pipeline with its draws and instances or its dispatches and workgroups,
    where its pass began. */
export const submission = (h) => `${h.ms} ms${h.late ? ` (its done heard up to ${h.late} ms late: the page's thread was busy)` : ''}, ${(h.at / 1e3).toFixed(1)} s in, ${h.passes} pass${h.passes === 1 ? '' : 'es'}${h.up?.writes ? `, ${h.up.bytes < 1048576 ? `${Math.ceil(h.up.bytes / 1024)} KB` : `${(h.up.bytes / 1048576).toFixed(1)} MB`} written before it in ${h.up.writes} write${h.up.writes === 1 ? '' : 's'}` : ''}: ${h.what.join('; ') || 'no draw or dispatch'}`;
/** The submissions as the board says them (r: the device's run, or a world's walk: what watch kept): the longest with what
    it held, how many were over SUBMIT_MS (how many surely, however late heard), and the next worst with what each held. */
export const submissions = (r) => `the longest ${r.long ? submission(r.long) : `${r.longest ?? 0} ms`}${r.slow == null ? '' : r.slowN ? `; **${r.slowN} over ${SUBMIT_MS} ms** (budget.js SUBMIT_MS; ${r.sure} surely, however late heard)${r.slow.length > 1 ? `, the next worst: ${r.slow.slice(1, 3).map(submission).join(' | ')}` : ''}` : `; none over ${SUBMIT_MS} ms`}`;
/** The frames as the board says them (F: window.__game.frames(), src/core/frames.js; since: from when): how many, how
    many longer than TASK_MS, and the slowest with where its time went on the page's thread: its parts, largest first,
    and what lay outside it till the next began (the page's other work: a worker's message, what an await resumes; or
    the wait for the screen). */
export const framesLine = (F, since) => (!F ? `Frames ${since}: none read (the game kept none).` : `Frames ${since}: ${F.frames}, ${F.long ? `**${F.long} longer than ${TASK_MS} ms**` : `none longer than ${TASK_MS} ms`} (budget.js TASK_MS); the slowest: ${F.slow.slice(0, 3).map(frameOf).join(' | ') || '–'}.`);
const frameOf = (f) => `${Math.round(f.ms)} ms, ${(f.at / 1e3).toFixed(1)} s in, its own ${f.own.toFixed(1)} (${f.parts.slice(0, 5).map(([n, ms]) => `${n} ${ms.toFixed(1)}`).join(', ') || 'no part'})${f.outside >= 1 ? `, outside it ${Math.round(f.outside)} (the page's other work, or the wait for the screen)` : ''}`;
const say = (d) => console.log(`device:\n  ${[readyLine(d), ...lines(d)].join('\n  ').replace(/\*\*/g, '')}`);
