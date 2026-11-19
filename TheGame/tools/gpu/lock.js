// The GPU's lock and its queue (intent 0038: one place for it, on every machine, no script of its own on any): one run
// a hold, in the order asked. Both stand where the repository does, shared by all its worktrees (GPU_LOCK_DIR, else the
// folder that holds the repository):
//   - `.gate-lock/`, the lock: made by the one who takes it (making a directory is atomic: one maker wins), with
//     `holder.json` in it: who, what, since when, and the processes whose life holds it;
//   - `.gate-queue.d/`, the queue: a ticket a waiting run, named by when it asked, so the oldest goes first.
// A holder whose processes are all gone (a run killed outright) holds nothing: the first in line takes the lock back.
// A lock made by a run from before this tool (an `owner` file, no `holder.json`) is waited for, never taken back.
//
//   bun tools/gpu/lock.js take <owner> -- <command…>   waits its turn, holds the lock while the command runs, lets it
//                                                      go however the command ends, and ends with the command's code
//   bun tools/gpu/lock.js status [--json]               who holds it, since when, and who waits, in order
//
// In code: locked(what, fn), fn run holding the lock (tools/gate.js: every part of a run that draws; its owner is
// GPU_OWNER). A command run by `take` holds the lock for every part it draws, so it never waits for itself
// (GPU_LOCK_TOKEN, given to the command).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: import.meta.dirname, encoding: 'utf8' }).stdout.trim();
const DIR = resolve(process.env.GPU_LOCK_DIR || dirname(dirname(common))), LOCK = join(DIR, '.gate-lock'), HOLDER = join(LOCK, 'holder.json'), QUEUE = join(DIR, '.gate-queue.d');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Where the lock and its queue stand: the folder every worktree of this machine shares (tools/gate/machine.js keeps the
    game's footprint here). */
export const SHARED = DIR;

/** When a process started ('' where it is gone): with its pid, what tells it from a later one given the same pid. */
const startOf = (pid) => spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).stdout?.trim() ?? '';
/** Whether a process is still the one it was: there, and started when it did. */
const alive = ({ pid, start }) => !!pid && startOf(pid) === start;
const ME = { pid: process.pid, start: startOf(process.pid) };

/** Who holds the lock: holder.json's { owner, what, since, token, by: the processes whose life holds it }; null where it
    is free; { owner, old: true } where a run from before this tool made it (its owner file's words). */
function holder() {
  try { return JSON.parse(readFileSync(HOLDER, 'utf8')); } catch {}
  try { readdirSync(LOCK); } catch { return null; }
  let says = ''; try { says = readFileSync(join(LOCK, 'owner'), 'utf8').trim(); } catch {}
  return { owner: says || '(being taken)', old: true };
}
/** The queue, oldest first: each ticket's file name (n) and what it says ({ owner, what, since, pid, start }). */
function line() {
  let names = []; try { names = readdirSync(QUEUE).filter((n) => n.endsWith('.json')).sort(); } catch {}
  return names.map((n) => { try { return { n, ...JSON.parse(readFileSync(join(QUEUE, n), 'utf8')) }; } catch { return null; } }).filter(Boolean);
}
/** Whether the lock can be taken: free, or held by processes all gone (then taken back). Asked only by the first in line,
    so no two take a lock back at once. */
function free() {
  const h = holder();
  if (!h) return true;
  if (h.old || h.by.some(alive)) return false;
  rmSync(LOCK, { recursive: true, force: true });
  return true;
}
/** The lock made (one maker wins) and its holder written into it: whether this run made it. */
function grab(record) {
  try { mkdirSync(LOCK); } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  writeFileSync(HOLDER, JSON.stringify(record));
  return true;
}

let ticket = null, token = null, depth = 0;
/** Waits its turn and takes the lock: in line until no one living asked before it and the lock is free. Its token. */
async function take(owner, what) {
  mkdirSync(QUEUE, { recursive: true });
  ticket = join(QUEUE, `${String(Date.now()).padStart(14, '0')}-${process.pid}.json`);
  writeFileSync(ticket, JSON.stringify({ owner, what, since: new Date().toISOString(), ...ME }), { flag: 'wx' });
  const record = { owner, what, since: null, token: `${process.pid}-${Date.now()}`, by: [ME] };
  try {
    for (let told = ''; ; await sleep(500)) {   // (two looks a second: a turn is waited for in seconds or minutes)
      const ahead = line().filter((t) => t.n < basename(ticket) && (alive(t) || void rmSync(join(QUEUE, t.n), { force: true })));
      if (!ahead.length && free() && grab({ ...record, since: new Date().toISOString() })) return (token = record.token);
      const now = ahead.length ? `${ahead.length} before it, first ${ahead[0].owner}` : `held by ${holder()?.owner ?? '(being let go)'}`;
      if (now !== told) console.error(`  (gpu lock: ${owner} waits: ${now})`);   // (on stderr: the command's own output stays its own)
      told = now;
    }
  } finally { rmSync(ticket, { force: true }); ticket = null; }
}
/** The lock let go, where this run holds it. */
function release() {
  if (token && holder()?.token === token) rmSync(LOCK, { recursive: true, force: true });
  token = null;
}
process.on('exit', () => { release(); if (ticket) rmSync(ticket, { force: true }); });   // (however the run ends, short of being killed outright)

/** fn() run holding the GPU lock, taken in turn and let go after; at once where this run (or the `take` it runs under)
    holds it already. */
export async function locked(what, fn) {
  const under = process.env.GPU_LOCK_TOKEN;
  if (depth || (under && holder()?.token === under)) return fn();
  await take(process.env.GPU_OWNER || 'tools/gate.js', what);
  depth++;
  try { return await fn(); } finally { depth--; if (!depth) release(); }
}
/** The lock let go at once, where this run holds it (a run stopped by a signal). */
export function unlock() { depth = 0; release(); }

/** `take`: the command run holding the lock, its own life holding it too; the command's exit code (128 + a signal's). */
async function run(owner, command) {
  await take(owner, command.join(' '));
  const child = spawn(command[0], command.slice(1), { stdio: 'inherit', env: { ...process.env, GPU_LOCK_TOKEN: token } });
  const h = holder();
  if (child.pid && h?.token === token) writeFileSync(HOLDER, JSON.stringify({ ...h, by: [ME, { pid: child.pid, start: startOf(child.pid) }] }));
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
  const code = await new Promise((done) => { child.on('error', (e) => { console.error(`gpu lock: ${e.message}`); done(127); }); child.on('exit', (c, s) => done(c ?? 128 + (constants.signals[s] ?? 0))); });
  release();
  process.exit(code);
}
/** `status`: who holds the lock, since when, and who waits, in order. */
function status(json) {
  const h = holder(), q = line(), on = h && (h.old ? null : h.by.some(alive));
  if (json) return console.log(JSON.stringify({ lock: LOCK, holder: h && { ...h, alive: on }, queue: q.map((t) => ({ ...t, alive: alive(t) })) }));
  console.log(`${LOCK}: ${h ? `held by ${h.owner}${h.what ? ` (${h.what})` : ''}${h.since ? ` since ${h.since}` : ''}` : 'free'}${h && on === false ? '; its processes are gone, so the first in line takes it back' : ''}${h?.old ? '; made by a run from before tools/gpu/lock.js: waited for, never taken back' : ''}`);
  for (const [i, t] of q.entries()) console.log(`  ${i + 1}. ${t.owner} (${t.what}), waiting since ${t.since}${alive(t) ? '' : ': gone'}`);
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2), dash = rest.indexOf('--');
  if (cmd === 'take' && dash > 0 && dash < rest.length - 1) await run(rest.slice(0, dash).join(' '), rest.slice(dash + 1));
  else if (cmd === 'status') status(rest.includes('--json'));
  else { console.log('bun tools/gpu/lock.js take <owner> -- <command…> | status [--json]: see the top of tools/gpu/lock.js'); process.exitCode = cmd ? 1 : 0; }
}
