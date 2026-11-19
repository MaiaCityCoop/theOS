// The device under the game, on the machine the 8 GB gate is for (intent 0038, 2026-11-19: on deployed next, WebKit at
// Retina scale held 2.3 GB of GPU memory at ready and 5.2 GB six seconds later, single submissions took up to 4.2 s, and
// its GPU process died at 38 s, the device lost; Samuel's MacBook did the same, and nothing had measured it).
// tools/gate.js device, and the first of the hour's run (hourly).
//
// WebKit at budget.js's MACHINE, from the start to `secs` past ready, walked forward a while in the middle:
// - the GPU memory as the game's own ledger keeps it (src/core/gpu.js: what the device has made, by class against
//   BUDGET_MB, the pools largest first, what no pool notes), sampled each second: its peak and where it settles;
// - that ledger checked by a count of the gate's own, every buffer the device makes net of its destroy(): the ledger
//   holds at least those (textures are the ledger's alone: one count of them, not two);
// - WebKit's own processes' resident memory beside it (every process of the browser Playwright runs);
// - every submission's own GPU time (the queue runs in order: done less the later of its submit and the one before's
//   done), the longest with the passes it held (where each began, its pipeline, its calls), and how many took more than
//   a frame's budget (FRAME_MS); any destroyed buffer a submission binds (WebKit says only "Validation failure.");
// - whether the device survives (device.lost), and what the device said wrong (uncaptured errors).
// A lost device fails; the rest is shown.
import { webkit } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { machine, unfit, machineLine } from './machine.js';
import { MACHINE, BUDGET_MB, FRAME_MS } from '../../src/core/budget.js';

/** In the page, before anything of it runs: the device as the gate sees it. The buffers it makes (net of destroy); what
    each command buffer holds (its passes, where in the page's code each began, its pipeline, its calls, the buffers it
    binds); each submission's own GPU time (the queue runs in order: from when it was submitted or the one before it was
    done, whichever was later, to its own done), the longest with what it held, and how many took more than a frame; a
    destroyed buffer a submission uses (WebKit says only "Validation failure."); the device's loss and its errors. */
function watch(frameMs) {
  const W = (window.__device = { buffers: 0, submits: 0, longest: 0, over: 0, lost: null, errors: [], top: null, long: null, dead: [] });
  // (the ledger's most, read in the page a tenth of a second apart, what it held then with it: it rises by gigabytes
  // the seconds before a device is lost, between two of the gate's looks)
  setInterval(() => { const L = window.__game?.memory?.(); if (L && L.gpu > (W.top?.device ?? -1)) W.top = { device: L.gpu, classes: L.classes, rows: L.rows.slice(0, 8), makers: L.makers.slice(0, 8), over: L.over, unnoted: L.unnoted, buffers: W.buffers }; }, 100);
  const DEAD = new WeakSet(), LABEL = new WeakMap(), GROUP = new WeakMap(), HOLDS = new WeakMap();
  const where = () => (new Error().stack || '').split('\n').map((l) => l.trim().replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?[^:)]*/, '')).filter((l) => /(^|\W)(src|assets)\//.test(l)).slice(0, 2).join(' < ');
  const buffers = (dev) => {
    const make = dev.createBuffer.bind(dev), group = dev.createBindGroup.bind(dev);
    dev.createBuffer = (d) => { const b = make(d), destroy = b.destroy.bind(b); let gone = false; W.buffers += d.size; LABEL.set(b, d.label || '?'); b.destroy = () => { if (!gone) { gone = true; DEAD.add(b); W.buffers -= d.size; } destroy(); }; return b; };
    dev.createBindGroup = (d) => { const g = group(d); GROUP.set(g, (d.entries ?? []).map((e) => e.resource?.buffer ?? (e.resource instanceof GPUBuffer ? e.resource : null)).filter(Boolean)); return g; };
  };
  const pass = (p, kind, list) => {
    const r = { kind, by: where(), pipe: '', calls: 0, bufs: new Set() }, bind = p.setBindGroup.bind(p), pipe = p.setPipeline.bind(p);
    list.push(r);
    p.setBindGroup = (i, g, ...a) => { for (const b of GROUP.get(g) ?? []) r.bufs.add(b); return bind(i, g, ...a); };
    p.setPipeline = (x) => { r.pipe ||= x.label || ''; return pipe(x); };
    for (const f of ['setVertexBuffer', 'setIndexBuffer', 'dispatchWorkgroups', 'dispatchWorkgroupsIndirect', 'draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect']) if (p[f]) {
      const o = p[f].bind(p), set = f.startsWith('set'), buf = f === 'setVertexBuffer' ? 1 : f === 'setIndexBuffer' || f.endsWith('Indirect') ? 0 : -1;
      p[f] = (...a) => { if (buf >= 0 && a[buf]) r.bufs.add(a[buf]); if (!set) r.calls++; return o(...a); };
    }
    return p;
  };
  const encoders = (dev) => {
    const make = dev.createCommandEncoder.bind(dev);
    dev.createCommandEncoder = (d) => { const e = make(d), list = [], c = e.beginComputePass.bind(e), r = e.beginRenderPass.bind(e), fin = e.finish.bind(e); e.beginComputePass = (x) => pass(c(x), 'compute', list); e.beginRenderPass = (x) => pass(r(x), 'render', list); e.finish = (x) => { const b = fin(x); HOLDS.set(b, list); return b; }; return e; };
  };
  const held = (list, ms, t) => { const by = {}; for (const r of list) { const k = `${r.kind} ${r.pipe || '?'}, begun at ${r.by || '?'}`, a = (by[k] ||= { passes: 0, calls: 0 }); a.passes++; a.calls += r.calls; } return { at: Math.round(t), ms: Math.round(ms), passes: list.length, what: Object.entries(by).sort((x, y) => y[1].calls - x[1].calls).slice(0, 8).map(([k, a]) => `${a.passes}× ${k}: ${a.calls} calls`) }; };
  const timed = (dev) => {
    const q = dev.queue, submit = q.submit.bind(q);
    let last = 0;
    q.submit = (cbs) => {
      const t = performance.now(), list = [...cbs].flatMap((c) => HOLDS.get(c) ?? []);
      for (const r of list) for (const b of r.bufs) if (DEAD.has(b) && W.dead.length < 12) W.dead.push(`the destroyed buffer "${LABEL.get(b)}" bound by a ${r.kind} pass (${r.pipe || 'no pipeline'}) begun at ${r.by || '?'}, ${Math.round(t / 1e3)} s in`);
      submit(cbs); W.submits++;
      q.onSubmittedWorkDone().then(() => { const now = performance.now(), ms = now - Math.max(t, last); last = now; if (ms > frameMs) W.over++; if (ms > W.longest) { W.longest = ms; W.long = held(list, ms, t); } }, () => {});
    };
  };
  const ask = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (desc) {
    const dev = await ask.call(this, desc);
    dev.lost.then((i) => { W.lost = { at: Math.round(performance.now()), reason: i.reason, message: i.message }; });
    dev.addEventListener?.('uncapturederror', (e) => { if (W.errors.length < 8) W.errors.push(String(e.error?.message).slice(0, 300)); });
    buffers(dev); encoders(dev); timed(dev);
    return dev;
  };
}
/** In the page: the ledger now (src/core/gpu.js), with the gate's own count and the device's state. */
const look = () => ({ ready: window.__game?.loadMs ?? null, shown: performance.getEntriesByName('game:first-frame')[0]?.startTime ?? null, ledger: window.__game?.memory?.() ?? null, ...window.__device });
/** The resident memory of every process of the WebKit Playwright runs (its pages', its GPU's, its own), MB (0 where it
    cannot be read). */
function gpuProcess() {
  try { return execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8' }).split('\n').filter((l) => /ms-playwright\/webkit/i.test(l)).reduce((s, l) => s + +l.trim().split(/\s+/)[0] / 1024, 0); } catch { return 0; }
}

/** The device on MACHINE: { ready (s), peak and settled (MB, the ledger's), classes at the peak against BUDGET_MB, the
    largest pools, unnoted, buffers (the gate's own count, at the peak), process (MB, its most), longest submission (ms),
    over (how many took more than FRAME_MS), lost, errors, pass }. url: the game's. */
export async function device(url, { secs = 60 } = {}) {
  const before = machine(), short = unfit(before);   // (a machine short of memory measures its disk: not measured)
  if (short) { const out = { machine: MACHINE, host: { before }, notMeasured: short, pass: true }; say(out); return out; }
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: MACHINE.width, height: MACHINE.height }, deviceScaleFactor: MACHINE.dpr })).newPage();
    await page.addInitScript(watch, FRAME_MS);
    const t0 = Date.now(), out = { machine: MACHINE, budget: Object.values(BUDGET_MB).reduce((a, b) => a + b, 0), peak: 0, process: 0, samples: [] };
    await page.goto(url, { waitUntil: 'load' });
    out.ready = await arrived(page, out, t0, secs);
    const s = out.ready == null ? await page.evaluate(look) : await stay(page, out, secs);
    Object.assign(out, { shown: s.shown == null ? null : +(s.shown / 1e3).toFixed(1), settled: out.samples.at(-1) ?? null, longest: Math.round(s.longest ?? 0), over: s.over ?? 0, submits: s.submits ?? 0, lost: s.lost ?? null, errors: s.errors ?? [], long: s.long ?? null, dead: s.dead ?? [], process: Math.round(out.process) });
    out.honest = out.buffers == null || out.peak >= out.buffers;   // (the ledger holds at least the buffers the device made)
    out.pass = !out.lost && out.ready != null;
    out.host = { before, after: machine() }; out.notMeasured = unfit(before, out.host.after);   // (swap that grew while it ran: not measured either)
    say(out);
    return out;
  } finally { await browser.close(); }
}
/** The game's start, as long as four stays, sampled (sample): seconds from t0 to ready, or null where it never came
    (or the device was lost before). */
async function arrived(page, out, t0, secs) {
  let s = await sample(page, out);
  while (s.ready == null && !s.lost && Date.now() - t0 < secs * 4e3) { await page.waitForTimeout(1e3); s = await sample(page, out); }
  return s.ready == null || s.lost ? null : +((Date.now() - t0) / 1e3).toFixed(1);
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
export const readyLine = (d) => (d?.notMeasured ? `**Not measured**: ${d.notMeasured}.` : d?.ready != null ? `Ready: yes, ${d.ready} s in${d.shown != null ? ` (the first frame shown ${d.shown} s in)` : ''}, on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}× in WebKit.` : `**Ready: no**${d ? `, on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}× in WebKit${d.lost ? ' (the device lost first)' : ''}` : ''}: the game never came.`);
/** The device's lines, as the hour's board begins with them (after readyLine). */
export function lines(d) {
  if (!d) return [];
  const host = d.host ? [machineLine(d.host.before, d.host.after)] : [];
  if (d.peak == null) return host;
  const mb = (n) => (n == null ? '–' : `${(n / 1024).toFixed(2)} GB`);
  return [
    ...host,
    d.lost ? `**The device was lost** ${(d.lost.at / 1e3).toFixed(0)} s in (${d.lost.reason}: ${d.lost.message}), on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}×.` : d.ready == null ? `**The game never came** on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}×.` : `The device lived, ready ${d.ready} s in, on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}×.`,
    `GPU memory (the game's ledger): peak ${mb(d.peak)}, settled ${mb(d.settled)}, against the budget's ${mb(d.budget)}; unnoted by any pool ${mb(d.unnoted)}; WebKit's processes at most ${mb(d.process)} resident${d.honest ? '' : `; **the ledger is short**: the device made ${mb(d.buffers)} of buffers alone`}.`,
    `By class at the peak: ${Object.entries(d.classes ?? {}).map(([c, x]) => `${c} ${x.gpu} MB of ${x.budget}${x.gpu > x.budget ? ' (over)' : ''}`).join(', ') || '–'}.`,
    `The largest pools: ${(d.rows ?? []).map(([n, g]) => `${n} ${g} MB`).join('; ') || '–'}.`,
    `The largest makes, by class and what they were (the ledger's makers): ${(d.makers ?? []).map(([c, w, m, n]) => `${c}: ${w} ${m} MB (${n})`).join('; ') || '–'}.`,
    `Made past a budget (the ledger's over): ${(d.past ?? []).map((o) => `${o.who} with ${o.by} (${o.mb} MB of ${o.budget})`).join('; ') || 'none'}.`,
    `The longest submission's own GPU time ${d.longest} ms (a frame's budget ${FRAME_MS} ms; ${d.over} of ${d.submits} over it)${d.long ? `, ${d.long.at / 1e3 | 0} s in, ${d.long.passes} passes: ${d.long.what.join('; ')}` : ''}.`,
    d.dead.length ? `**A destroyed buffer was used** (WebKit says only "Validation failure."): ${d.dead[0]}${d.dead.length > 1 ? ` (and ${d.dead.length - 1} more)` : ''}.` : 'No destroyed buffer was used.',
    ...(d.errors.length ? [`The device said: ${d.errors[0]}`] : []),
  ];
}
const say = (d) => console.log(`device:\n  ${[readyLine(d), ...lines(d)].join('\n  ').replace(/\*\*/g, '')}`);
