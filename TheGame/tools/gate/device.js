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
// - every submission's time until the GPU has done it (onSubmittedWorkDone): the longest, and how many took more than
//   a frame's budget (FRAME_MS);
// - whether the device survives (device.lost), and what the device said wrong (uncaptured errors).
// A lost device fails; the rest is shown.
import { webkit } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { MACHINE, BUDGET_MB, FRAME_MS } from '../../src/core/budget.js';

/** In the page, before anything of it runs: the device as the gate sees it, the buffers it makes (net of destroy), each
    submission's time to done, its loss and its errors. */
function watch(frameMs) {
  const W = (window.__device = { buffers: 0, submits: 0, longest: 0, over: 0, lost: null, errors: [], top: null });
  // (the ledger's most, read in the page a tenth of a second apart, what it held then with it: it rises by gigabytes in
  // the seconds before a device is lost, between two of the gate's looks)
  setInterval(() => { const L = window.__memory?.(); if (L?.device != null && L.device > (W.top?.device ?? -1)) W.top = { device: L.device, classes: L.classes, rows: L.rows.slice(0, 8), unnoted: L.unnoted, buffers: W.buffers }; }, 100);
  const ask = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (desc) {
    const dev = await ask.call(this, desc), make = dev.createBuffer.bind(dev), q = dev.queue, submit = q.submit.bind(q);
    dev.lost.then((i) => { W.lost = { at: Math.round(performance.now()), reason: i.reason, message: i.message }; });
    dev.addEventListener?.('uncapturederror', (e) => { if (W.errors.length < 8) W.errors.push(String(e.error?.message).slice(0, 300)); });
    dev.createBuffer = (d) => { const b = make(d), destroy = b.destroy.bind(b); let gone = false; W.buffers += d.size; b.destroy = () => { if (!gone) { gone = true; W.buffers -= d.size; } destroy(); }; return b; };
    q.submit = (list) => { const t = performance.now(); submit(list); W.submits++; q.onSubmittedWorkDone().then(() => { const ms = performance.now() - t; W.longest = Math.max(W.longest, ms); if (ms > frameMs) W.over++; }, () => {}); };
    return dev;
  };
}
/** In the page: the ledger now (src/core/gpu.js), with the gate's own count and the device's state. */
const look = () => ({ ready: window.__game?.loadMs ?? null, ledger: window.__memory?.() ?? null, ...window.__device });
/** The resident memory of every process of the WebKit Playwright runs (its pages', its GPU's, its own), MB (0 where it
    cannot be read). */
function gpuProcess() {
  try { return execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8' }).split('\n').filter((l) => /ms-playwright\/webkit/i.test(l)).reduce((s, l) => s + +l.trim().split(/\s+/)[0] / 1024, 0); } catch { return 0; }
}

/** The device on MACHINE: { ready (s), peak and settled (MB, the ledger's), classes at the peak against BUDGET_MB, the
    largest pools, unnoted, buffers (the gate's own count, at the peak), process (MB, its most), longest submission (ms),
    over (how many took more than FRAME_MS), lost, errors, pass }. url: the game's. */
export async function device(url, { secs = 60 } = {}) {
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: MACHINE.width, height: MACHINE.height }, deviceScaleFactor: MACHINE.dpr })).newPage();
    await page.addInitScript(watch, FRAME_MS);
    const t0 = Date.now(), out = { machine: MACHINE, budget: Object.values(BUDGET_MB).reduce((a, b) => a + b, 0), peak: 0, process: 0, samples: [] };
    await page.goto(url, { waitUntil: 'load' });
    out.ready = await arrived(page, out, t0, secs);
    const s = out.ready == null ? await page.evaluate(look) : await stay(page, out, secs);
    Object.assign(out, { settled: out.samples.at(-1) ?? null, longest: Math.round(s.longest ?? 0), over: s.over ?? 0, submits: s.submits ?? 0, lost: s.lost ?? null, errors: s.errors ?? [], process: Math.round(out.process) });
    out.honest = out.buffers == null || out.peak >= out.buffers;   // (the ledger holds at least the buffers the device made)
    out.pass = !out.lost && out.ready != null;
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
  out.samples.push(s.ledger?.device ?? 0); out.process = Math.max(out.process, gpuProcess());
  if (T) Object.assign(out, { peak: T.device, classes: T.classes, rows: T.rows, unnoted: T.unnoted, buffers: +(T.buffers / 1048576).toFixed(1) });
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

/** The device's lines, as the hour's board begins with them. */
export function lines(d) {
  if (!d) return [];
  const mb = (n) => (n == null ? '–' : `${(n / 1024).toFixed(2)} GB`);
  return [
    d.lost ? `**The device was lost** ${(d.lost.at / 1e3).toFixed(0)} s in (${d.lost.reason}: ${d.lost.message}), on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}×.` : d.ready == null ? `**The game never came** on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}×.` : `The device lived, ready ${d.ready} s in, on ${d.machine.width} × ${d.machine.height} at ${d.machine.dpr}×.`,
    `GPU memory (the game's ledger): peak ${mb(d.peak)}, settled ${mb(d.settled)}, against the budget's ${mb(d.budget)}; unnoted by any pool ${mb(d.unnoted)}; WebKit's processes at most ${mb(d.process)} resident${d.honest ? '' : `; **the ledger is short**: the device made ${mb(d.buffers)} of buffers alone`}.`,
    `By class at the peak: ${Object.entries(d.classes ?? {}).map(([c, x]) => `${c} ${x.gpu} MB of ${x.budget}${x.gpu > x.budget ? ' (over)' : ''}`).join(', ') || '–'}.`,
    `The largest pools: ${(d.rows ?? []).map(([n, g]) => `${n} ${g} MB`).join('; ') || '–'}.`,
    `The longest submission ${d.longest} ms (a frame's budget ${FRAME_MS} ms; ${d.over} of ${d.submits} over it)${d.errors.length ? `; the device said: ${d.errors[0]}` : ''}.`,
  ];
}
const say = (d) => console.log(`device:\n  ${lines(d).join('\n  ').replace(/\*\*/g, '')}`);
