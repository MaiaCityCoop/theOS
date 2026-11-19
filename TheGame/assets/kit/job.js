// What the kit keeps only while a job is done (intent 0038): a shape's finest, its crowd, its packed block, each made
// once and used by every level of it the job asks, then let go when the job is done (jobDone), so a worker between jobs
// holds no plant. No count of its own: what a job asks, and no more. (2026-11-19: a recipes' worker kept 155 MB between
// jobs, the last four crowds and blocks and the last six finest meshes, against 20 MB once loaded.) Plain JS.
//   jobCache()   a cache of the job's: get(key), set(key, value) -> value; let go at jobDone
//   jobDone()    the job is done: every cache of it let go (the recipes' worker, src/scatter/recipes.worker.js, after
//                each kind's levels and each message; whoever else builds a plant on its own: the build's measures,
//                tools/outlines.js; a tree's sample, src/scatter/trees.js treeSample)
const live = new Set();
export function jobCache() {
  const m = new Map();
  return { get: (key) => m.get(key), set: (key, value) => { m.set(key, value); live.add(m); return value; } };
}
export function jobDone() { for (const m of live) m.clear(); live.clear(); }
