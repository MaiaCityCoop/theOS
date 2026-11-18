// Every call the gate makes into a page answered in time, the time held here, outside the page (intent 0038). The
// gate's own waits (settle()'s timeout, `settled`'s race) are timers inside the page: a renderer that is frozen, swapped
// out or has lost its device runs none of them, and Playwright then waits for ever (train 1c, 2026-11-18: the truth hung
// 20 minutes on its fourth view, the renderer at 0 % CPU and 35 MB resident, the machine's swap 3.24 of 4 GB); nor has
// Playwright's page.close() a time of its own: it waits for the renderer to let the page go (2026-11-18, a ?truth run
// whose first view had failed hung 13 minutes in stills' last call, closing that page, its Chrome at 0 % CPU). Here each
// page.evaluate and page.waitForFunction races a timer of the gate's own: the call's own wait (its argument's `wait`, or
// waitForFunction's timeout), and then the page's whole allowance again (the longest the gate lets it come or settle):
// the page's own timer had all of that to answer. page.close, naming none, the page's allowance. A page that does not answer in that time is said (crashed, or
// hung, with the browser's memory by process and the machine's swap at that moment), its Chrome closed (killed if it
// will not close), and the call fails: the view is marked failed and the run stops, nothing waited on.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** A page that did not answer: its message says what was found. */
class Unanswered extends Error {}

/** The memory of the Chrome on profile `dir` (every process that names it, and theirs) by kind, in bytes (the physical
    footprint on a Mac, else the resident size), and the machine's swap: a line. */
async function memoryNow(dir) {
  try {
    const rows = [];
    for (const line of (await run('ps', ['-A', '-o', 'pid=,ppid=,rss=,%cpu=,command='])).stdout.split('\n')) { const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/); if (m) rows.push({ pid: +m[1], ppid: +m[2], rss: +m[3] * 1024, cpu: +m[4], cmd: m[5] }); }
    const ours = new Map(rows.filter((p) => dir && p.cmd.includes(dir)).map((p) => [p.pid, p]));
    for (let more = true; more;) { more = false; for (const p of rows) if (!ours.has(p.pid) && ours.has(p.ppid)) { ours.set(p.pid, p); more = true; } }
    let foot = null;
    if (process.platform === 'darwin' && ours.size) { const out = await run('footprint', ['--noCategories', '-f', 'bytes', ...[...ours.keys()].flatMap((pid) => ['-p', `${pid}`])]).then((r) => r.stdout, (e) => e.stdout ?? ''); foot = new Map([...out.matchAll(/\[(\d+)\]:.*?Footprint:\s*(\d+) B/g)].map((m) => [+m[1], +m[2]])); }
    const by = {};
    for (const p of ours.values()) { const k = p.cmd.match(/--type=([\w-]+)/)?.[1] ?? 'browser', b = by[k] ||= { bytes: 0, rss: 0, cpu: 0 }; b.bytes += foot?.get(p.pid) ?? p.rss; b.rss += p.rss; b.cpu += p.cpu; }
    const swap = process.platform === 'darwin' ? (await run('sysctl', ['-n', 'vm.swapusage'])).stdout.trim() : '';
    const gb = (b) => `${(b / 1e9).toFixed(2)} GB`, all = Object.values(by).reduce((s, b) => s + b.bytes, 0);
    return `the browser ${gb(all)}${foot ? ' (physical footprint)' : ''}: ${Object.entries(by).map(([k, b]) => `${k} ${gb(b.bytes)}, ${(b.rss / 1e6).toFixed(0)} MB resident, ${b.cpu.toFixed(0)} % CPU`).join('; ')}${swap ? `; swap ${swap}` : ''}`;
  } catch (e) { return `(memory not read: ${e.message})`; }
}

/** `page`'s evaluate, waitForFunction and close held to their time from here: a call's own wait, else `wait` (the
    longest the gate allows the page to come or settle: tools/gate.js open) on top. dir: the profile its Chrome runs on (for the
    memory said); kill(): its Chrome closed at once. */
export function guard(page, { dir = null, kill = null, wait } = {}) {
  if (!(wait > 0)) throw new Error('guard: the longest a call on the page may take (wait) is the gate\'s to say');
  const held = (own) => (own ?? 0) + wait;
  const ev = page.evaluate.bind(page), wf = page.waitForFunction.bind(page), cl = page.close.bind(page);
  let crashed = false; page.on('crash', () => (crashed = true));
  const within = async (call, ms, what) => {
    let timer;
    const late = new Promise((_, no) => { timer = setTimeout(() => no(new Unanswered('')), ms); });
    try { return await Promise.race([call, late]); }
    catch (e) {
      if (!(e instanceof Unanswered)) throw e;
      call.catch(() => {});
      const said = `the page did not answer within ${Math.round(ms / 1000)} s (${what}): ${crashed ? 'it crashed' : 'hung (a frozen or swapped-out renderer, or a lost device)'}; ${await memoryNow(dir)}`;
      await Promise.race([kill?.(), new Promise((r) => setTimeout(r, 15e3))]).catch(() => {});
      throw new Unanswered(said);
    } finally { clearTimeout(timer); }
  };
  page.evaluate = (fn, arg) => within(ev(fn, arg), held(arg?.wait), `${fn?.name || 'a call'}${arg?.at ? ` at ${arg.at}` : ''}`);
  page.waitForFunction = (fn, arg, opt) => within(wf(fn, arg, opt), held(opt?.timeout), 'waiting for the page');
  page.close = (opt) => within(cl(opt), held(), 'closing it');
  return page;
}

/** A Chrome closed now, however it is: Playwright's close, and where that does not end in 10 s every process of its
    profile killed. */
export async function closeHard(ctx, dir) {
  const closed = await Promise.race([ctx.close().then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 10e3))]);
  if (closed || !dir) return;
  const rows = (await run('ps', ['-A', '-o', 'pid=,command='])).stdout.split('\n').filter((l) => l.includes(dir));
  for (const l of rows) { const pid = +l.trim().split(/\s+/)[0]; if (pid && pid !== process.pid) try { process.kill(pid, 'SIGKILL'); } catch {} }
}
