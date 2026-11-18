// The game's workers, watched (intent 0038). A worker that cannot start (its file no longer served: a page of a build
// two deploys old, deploy/deploy.sh serving only the one before besides its own; or a module of it that does not load)
// never answers what it was asked, nor does one that throws, and whatever waits for it waits for ever: the start's veil
// with it. So every worker the game makes is watched: on its error, what it was asked and has not answered fails with
// it, and one that could not start is told to the page as a file it lost (os:lost: brand/loading.js reloads into the
// build the host serves now, or says so on the veil).
//
// A worker is made where it is used, `new Worker(new URL('…', import.meta.url))`, so the build finds its file, and
// handed to these.

/** `worker`, watched: fail(error) on its error; one that could not start, told to the page as `name` lost. */
export function watched(worker, name, fail) {
  worker.addEventListener('error', (e) => {
    const threw = e instanceof ErrorEvent;   // (the browser's: an ErrorEvent, what the worker threw; a plain event, it could not start)
    if (!threw) dispatchEvent(new CustomEvent('os:lost', { detail: name }));
    fail(new Error(threw ? `${name}: ${e.message}` : `${name} could not start`));
  });
  return worker;
}

/** A worker that answers each message with the id it was sent under ({ id, … }), watched: ask(message, transfer) ->
    its answer, or its error; ask.out(): how many it has not answered yet; ask.worker: the worker. */
export function asking(worker, name) {
  const waiting = new Map(); let next = 0;
  watched(worker, name, (error) => { for (const { rej } of waiting.values()) rej(error); waiting.clear(); });
  worker.addEventListener('message', ({ data }) => { const job = waiting.get(data.id); if (job) { waiting.delete(data.id); job.res(data); } });
  const ask = (message, transfer = []) => new Promise((res, rej) => { const id = next++; waiting.set(id, { res, rej }); worker.postMessage({ ...message, id }, transfer); });
  return Object.assign(ask, { worker, out: () => waiting.size });
}
