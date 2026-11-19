// The machine a measure runs on (intent 0038, 2026-11-19: the Mac mini at 6 % free memory with 6.9 GB of its 8 GB swap
// in use, WebKit crashing at launch even on about:blank, GPU work paged to disk: the night's numbers may have measured
// the disk, not the game). Its free memory and swap, read before and after every measured run (onMachine: tools/gate.js
// device, walks, bench, compile, paths, all, motion and the hour). A run is not measured, and said so, where it would start with less memory free than the game
// may hold on the GPU (budget.js GPU_MB: on one memory, as a Mac has it, the GPU's is the machine's), or where the swap
// grew while it ran. Where the machine's memory cannot be read (not a Mac), nothing is refused.
import { execFileSync } from 'node:child_process';
import { GPU_MB } from '../../src/core/budget.js';

const read = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8' }); } catch { return ''; } };
/** The machine now: { total and free (MB), share (free, of its memory), swap (MB in use) }. */
function machine() {
  const total = +read('sysctl', ['-n', 'hw.memsize']) / 1048576, share = +(read('memory_pressure', []).match(/free percentage:\s*(\d+)%/)?.[1] ?? NaN) / 100;
  return { total: Math.round(total), share, free: Math.round(total * share), swap: Math.round(+(read('sysctl', ['-n', 'vm.swapusage']).match(/used\s*=\s*([\d.]+)M/)?.[1] ?? NaN)) };
}
/** Why a run on the machine (as it was before; after, once it has run) is not measured, or null: less free than the
    game's GPU budget at its start, or its swap grew. */
const unfit = (before, after = null) => (before.free < GPU_MB ? `the machine is short of memory: ${before.free} MB free (${Math.round(before.share * 100)} %), less than the game's GPU budget of ${GPU_MB} MB; ${before.swap} MB of swap in use`
  : after && after.swap > before.swap ? `the machine swapped while it ran: ${before.swap} → ${after.swap} MB of swap in use` : null);
/** fn run as a measure on this machine: not run where the machine starts short of memory ({ notMeasured, host: { before } },
    given to short for the caller's own shape); else what fn gave, with host { before, after } and notMeasured where the
    swap grew while it ran. */
export async function onMachine(fn, short = (o) => o) {
  const before = machine(), why = unfit(before);
  return why ? short({ notMeasured: why, host: { before } }) : ran(before, await fn());
}
/** fn run whatever the machine (a part whose check holds either way, its timing only where the machine had the memory):
    what it gave, with host and notMeasured as onMachine gives them. */
export const watched = async (fn) => { const before = machine(); return ran(before, await fn()); };
const ran = (before, r) => { const after = machine(); return Object.assign(r ?? {}, { host: { before, after }, notMeasured: unfit(before, after) }); };
/** The machine's line on a board: its free memory and swap, before and after. */
export const machineLine = (before, after = null) => `The machine: ${before.free} MB free (${Math.round(before.share * 100)} %)${after ? ` → ${after.free} MB (${Math.round(after.share * 100)} %)` : ''}, swap ${before.swap}${after ? ` → ${after.swap}` : ''} MB in use.`;
/** A board's first lines (the hour's run R): not measured and why, else whether the game came (ready: its line, from
    the device's run); then the machine, before and after. */
export const head = (R, ready) => [R.notMeasured ? `**Not measured**: ${R.notMeasured}.` : ready(R.device), ...(R.host ? [machineLine(R.host.before, R.host.after)] : [])];
