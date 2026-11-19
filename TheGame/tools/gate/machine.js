// The machine a measure runs on (intent 0038, 2026-11-19: the Mac mini at 6 % free memory with 6.9 GB of its 8 GB swap
// in use, WebKit crashing at launch even on about:blank, GPU work paged to disk: the night's numbers may have measured
// the disk, not the game). Its free memory and swap, read before and after every measured run (onMachine: tools/gate.js
// device, walks, bench, compile, paths, all, motion and the hour), and the game's own footprint while it runs: what its
// browsers hold of the machine (every process the gate started and Playwright's WebKit's, its pages and its GPU, by their
// physical footprint, which counts what Metal holds for the GPU). A run is not measured, and said so, where it would
// start with less memory free than the game takes, or where the swap grew while it ran. What the game takes is its own
// measure: the most its browsers held in the last run of each browser on this machine (kept beside the GPU's lock, for
// every worktree of it: tools/gpu/lock.js SHARED), the GPU's budget at the least (budget.js GPU_MB, and before any run).
// (2026-11-19, the MacBook: a run let start at 4.1 GB free, the floor then GPU_MB, 2 GB, took the machine to 16 % free and
// its swap to 5.7 GB before ready, and was killed: a WebKit game at Retina scale takes some 3 GB of it.) Where the
// machine's memory cannot be read (not a Mac), nothing is refused.
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { GPU_MB } from '../../src/core/budget.js';
import { SHARED } from '../gpu/lock.js';

const MB = 1048576, KEPT = join(SHARED, '.gate-machine.json'), exec = promisify(execFile);
const read = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8' }); } catch { return ''; } };
/** The machine now: { total and free (MB), share (free, of its memory), swap (MB in use) }. */
function machine() {
  const total = +read('sysctl', ['-n', 'hw.memsize']) / MB, share = +(read('memory_pressure', []).match(/free percentage:\s*(\d+)%/)?.[1] ?? NaN) / 100;
  return { total: Math.round(total), share, free: Math.round(total * share), swap: Math.round(+(read('sysctl', ['-n', 'vm.swapusage']).match(/used\s*=\s*([\d.]+)M/)?.[1] ?? NaN)) };
}

// ---- what processes hold of the machine: one reader, for the floor here, the paths' and a hung page's memory
// (tools/gate.js, tools/gate/guard.js) and the device's (tools/gate/device.js) ----
/** Every process now: [{ pid, ppid, rss (bytes), cpu (%), cmd }]. */
export async function processes() {
  const rows = [];
  for (const line of (await exec('ps', ['-A', '-o', 'pid=,ppid=,rss=,%cpu=,command='], { maxBuffer: 1 << 26 })).stdout.split('\n')) { const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/); if (m) rows.push({ pid: +m[1], ppid: +m[2], rss: +m[3] * 1024, cpu: +m[4], cmd: m[5] }); }
  return rows;
}
/** The processes of `rows` that `of` picks, with every one they started, and theirs: a browser's own (by pid). */
export function withChildren(rows, of) {
  const ours = new Map(rows.filter(of).map((p) => [p.pid, p]));
  for (let more = true; more;) { more = false; for (const p of rows) if (!ours.has(p.pid) && ours.has(p.ppid)) { ours.set(p.pid, p); more = true; } }
  return ours;
}
/** What each of `ours` (by pid) holds of the machine: { measure, of(p): bytes }: on a Mac its physical footprint
    (footprint: what Metal holds for the GPU counted, where the resident size does not: 2026-11-17, a Chrome GPU process
    52 MB resident had a footprint of 1.16 GB), else, and for a process gone between the two looks, its resident size. */
export async function heldBy(ours) {
  if (process.platform !== 'darwin' || !ours.size) return { measure: 'resident size', of: (p) => p.rss };
  const out = await exec('footprint', ['--noCategories', '-f', 'bytes', ...[...ours.keys()].flatMap((pid) => ['-p', `${pid}`])]).then((r) => r.stdout, (e) => e.stdout ?? '');
  const foot = new Map([...out.matchAll(/\[(\d+)\]:.*?Footprint:\s*(\d+) B/g)].map((m) => [+m[1], +m[2]]));
  return { measure: 'physical footprint', of: (p) => foot.get(p.pid) ?? p.rss };
}
/** Playwright's WebKit's processes (its pages', its GPU's, its network's: the system starts them, not the gate). */
export const WEBKIT = (p) => /ms-playwright\/webkit/i.test(p.cmd);
/** A Chrome's (the gate's: tools/browsers.js), any of its processes. */
const CHROME = (p) => /Google Chrome|Chromium|chrome-headless-shell/i.test(p.cmd);

// ---- the game's footprint: the floor ----
const kept = () => { try { return JSON.parse(readFileSync(KEPT, 'utf8')); } catch { return {}; } };
/** What a run must find free (MB), and why: the most the game's browsers held in the last run of each on this machine,
    the GPU's budget at the least. */
function floor() {
  const F = Object.entries(kept().footprint ?? {}).sort((a, b) => b[1].mb - a[1].mb)[0];
  return F && F[1].mb > GPU_MB ? { mb: F[1].mb, why: `the game's own footprint here, ${F[1].mb} MB (its browsers at the most in ${F[0]}'s last run, ${F[1].at.slice(0, 16)})` } : { mb: GPU_MB, why: `the game's GPU budget of ${GPU_MB} MB${F ? ` (its browsers held at most ${F[1].mb} MB in ${F[0]}'s last run here)` : ''}` };
}
/** While a measure runs, the game's browsers' memory each second: every process this run started (and theirs), and
    WebKit's; their sum at its most, by browser (MB). stop() ends it and keeps it (the floor of every run after). */
function sampled() {
  const most = {}; let busy = false;
  const look = async () => {
    if (busy) return; busy = true;
    try {
      const rows = await processes(), ours = new Map([...withChildren(rows, (p) => p.ppid === process.pid), ...withChildren(rows, WEBKIT)]), H = await heldBy(ours), by = {};
      for (const p of ours.values()) { const k = WEBKIT(p) ? 'WebKit' : CHROME(p) ? 'Chrome' : null; if (k) by[k] = (by[k] ?? 0) + H.of(p); }   // (the browsers alone: not the gate's other helpers)
      for (const [k, b] of Object.entries(by)) most[k] = Math.max(most[k] ?? 0, Math.round(b / MB));
    } finally { busy = false; }
  };
  const timer = setInterval(() => look().catch(() => {}), 1000);
  return () => {
    clearInterval(timer);
    if (Object.keys(most).length) { const K = kept(), at = new Date().toISOString(); K.footprint = { ...K.footprint, ...Object.fromEntries(Object.entries(most).map(([k, mb]) => [k, { mb, at }])) }; try { writeFileSync(KEPT, JSON.stringify(K, null, 1) + '\n'); } catch {} }
    return most;
  };
}
/** Why a run on the machine (as it was before; after, once it has run) is not measured, or null: less free at its start
    than the game takes (floor), or its swap grew. */
const unfit = (before, after = null) => { const F = floor(); return before.free < F.mb ? `the machine is short of memory: ${before.free} MB free (${Math.round(before.share * 100)} %), less than ${F.why}; ${before.swap} MB of swap in use`
  : after && after.swap > before.swap ? `the machine swapped while it ran: ${before.swap} → ${after.swap} MB of swap in use` : null; };
/** fn run as a measure on this machine: not run where the machine starts short of memory ({ notMeasured, host: { before } },
    given to short for the caller's own shape); else what fn gave, with host { before, after, game: its browsers' most, MB
    by browser } and notMeasured where the swap grew while it ran. Whatever it measured, what the game's browsers held is
    kept: a run that swapped took at least that. */
export async function onMachine(fn, short = (o) => o) {
  const before = machine(), why = unfit(before);
  return why ? short({ notMeasured: why, host: { before } }) : ran(before, sampled(), await fn());
}
/** fn run whatever the machine (a part whose check holds either way, its timing only where the machine had the memory):
    what it gave, with host and notMeasured as onMachine gives them. */
export const watched = async (fn) => { const before = machine(), stop = sampled(); return ran(before, stop, await fn()); };
const ran = (before, stop, r) => { const game = stop(), after = machine(); return Object.assign(r ?? {}, { host: { before, after, game }, notMeasured: unfit(before, after) }); };
/** The machine's line on a board: its free memory and swap, before and after, and what the game's browsers held. */
export const machineLine = (before, after = null, game = null) => `The machine: ${before.free} MB free (${Math.round(before.share * 100)} %)${after ? ` → ${after.free} MB (${Math.round(after.share * 100)} %)` : ''}, swap ${before.swap}${after ? ` → ${after.swap}` : ''} MB in use${game && Object.keys(game).length ? `; the game's browsers at most ${Object.entries(game).map(([k, mb]) => `${mb} MB (${k})`).join(', ')}` : ''}.`;
/** A board's first lines (the hour's run R): not measured and why, else whether the game came (ready: its line, from
    the device's run); then the machine, before and after. */
export const head = (R, ready) => [R.notMeasured ? `**Not measured**: ${R.notMeasured}.` : ready(R.device), ...(R.host ? [machineLine(R.host.before, R.host.after, R.host.game)] : [])];
