// The game's workers, watched (intent 0038). A worker that cannot start (its file no longer served: a page of a build
// two deploys old, deploy/deploy.sh serving only the one before besides its own; or a module of it that does not load)
// never answers what it was asked, nor does one that throws, and whatever waits for it waits for ever: the start's veil
// with it. So every worker the game makes is watched: on its error, what it was asked and has not answered fails with
// it, and one that could not start is told to the page as a file it lost (os:lost: brand/loading.js reloads into the
// build the host serves now, or says so on the veil).
//
// And one whose file came as something else (an ad blocker's empty stand-in) starts, says nothing and fails nothing:
// so a worker asked through `asking` says it has started (`{ here: true }`, its first message), and every question put
// to it is something the start waits for (src/core/waits.js): unheard for a while, the veil says so.
//
// A worker is made where it is used, `new Worker(new URL('…', import.meta.url))`, so the build finds its file, and
// handed to these.
//
// A pool of them (workerPool) is as large as the device: each worker holds memory of its own (its kits, the meshes it
// builds from, its module's code), and an iPhone's page is killed by what its own process holds, not the GPU's (the
// master, 2026-11-19: the world shown, then "a problem repeatedly occurred", 8 workers at the start). So a pool makes a
// worker only while those it has are all busy, never more than poolSize, and lets go of every one with nothing to do
// each time the world has settled: what it held goes with it, and the page's memory falls after the start's peak.
import { waitsOn, answered } from './waits.js';
import { onSettled } from './settle.js';
import { budgetShare } from './gpu.js';
import { MACHINE_CORES, BUSY_CORES } from './budget.js';

/** `worker`, watched: fail(error) on its error; one that could not start, told to the page as `name` lost. */
export function watched(worker, name, fail) {
  worker.addEventListener('error', (e) => {
    const threw = e instanceof ErrorEvent;   // (the browser's: an ErrorEvent, what the worker threw; a plain event, it could not start)
    if (!threw) dispatchEvent(new CustomEvent('os:lost', { detail: name }));
    fail(new Error(threw ? `${name}: ${e.message}` : `${name} could not start`));
  });
  return worker;
}

/** A worker that answers each message with the id it was sent under ({ id, … }), and says `{ here: true }` as it starts,
    watched: ask(message, transfer) -> its answer, or its error; ask.out(): how many it has not answered yet; ask.worker:
    the worker. */
function asking(worker, name) {
  const waiting = new Map(); let next = 0;
  watched(worker, name, (error) => { for (const { rej } of waiting.values()) rej(error); waiting.clear(); });
  worker.addEventListener('message', ({ data }) => { if (data?.here) return answered(name); const job = waiting.get(data.id); if (job) { waiting.delete(data.id); job.res(data); } });
  const ask = (message, transfer = []) => waitsOn(name, new Promise((res, rej) => { const id = next++; waiting.set(id, { res, rej }); worker.postMessage({ ...message, id }, transfer); }));
  return Object.assign(ask, { worker, out: () => waiting.size });
}

// (the pools that work at once, sharing the cores: the recipes' and the impostors')
const POOLS = ["the recipes' worker", "the impostors' worker"];
/** How many workers each of the pools that work at once (POOLS) may run on this device: the cores beyond the page's own
    thread and the GPU process's (budget.js BUSY_CORES; the cores as the browser tells them, no more than the Mac's),
    shared out between the pools, at the device's share of the Mac's budget (src/core/gpu.js budgetShare: what each
    worker holds is memory), one at the least. The Mac: 3 a pool; a phone (WebKit tells 2 cores; a share of 0.375): 1.
    Read as a pool grows: the share is known once the adapter is (src/boot.js askedLimits), after the first asks. */
const poolSize = () => Math.max(1, Math.floor(((Math.min(navigator.hardwareConcurrency || MACHINE_CORES, MACHINE_CORES) - BUSY_CORES) / POOLS.length) * budgetShare()));
/** A pool of workers made by need (make(): a new Worker, made where it is used; each asked through `asking` as `name`),
    as many at once as size() (poolSize: the device's): { ask(message, transfer): of a worker with nothing to do, one
    made while there are fewer than size(), else the least busy; to(key, message, transfer): of the key's own (what a
    worker keeps between the asks of one key: a kind's hierarchy, for its bands); all(message): told to every worker, and
    to every one made later, before anything asked of it; out(): what is asked and not answered }. A worker with nothing
    to do is let go each time the world has settled (src/core/settle.js onSettled), and one past size() as soon as it
    has nothing to do; the next ask makes one again. */
export function workerPool(name, make, size = poolSize) {
  const slots = [], told = [];
  const spawn = (i) => { const a = asking(make(), name); for (const m of told) a.worker.postMessage(m); return (slots[i] = a); };
  const letGo = (i) => { slots[i].worker.terminate(); slots[i] = null; };
  const run = (i, message, transfer) => slots[i](message, transfer).finally(() => { if (slots[i] && !slots[i].out() && i >= size()) letGo(i); });
  const pick = () => {
    const n = size(); let free = -1, least = -1;
    for (let i = 0; i < Math.max(n, slots.length); i++) {
      const a = slots[i];
      if (a && !a.out()) return i;
      if (!a && i < n && free < 0) free = i;
      if (a && (least < 0 || a.out() < slots[least].out())) least = i;
    }
    return free >= 0 ? (spawn(free), free) : least;
  };
  onSettled(() => { slots.forEach((a, i) => { if (a && !a.out()) letGo(i); }); });
  return {
    ask: (message, transfer = []) => run(pick(), message, transfer),
    to: (key, message, transfer = []) => { const i = key % size(); if (!slots[i]) spawn(i); return run(i, message, transfer); },
    all: (message) => { told.push(message); for (const a of slots) a?.worker.postMessage(message); },
    out: () => slots.reduce((n, a) => n + (a ? a.out() : 0), 0),
  };
}
