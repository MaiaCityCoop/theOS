// The lakes round the camera (src/world/land.js: where the river closes round on itself, a lake): looked for in a
// worker, at the start and again whenever the camera has gone AGAIN metres from where they were last looked for; the
// CPU's land (LAKES) and the GPU's (land.nodes.js: setLakes) take them together, and what reads the ground is told
// (changed()).
import { LAKES, findLakes } from './land.js';
import { setLakes } from './land.nodes.js';
import { source } from '../core/settle.js';
import { workerPool } from '../core/workers.js';

const AGAIN = 2000;
export function createLakes() {
  const { ask } = workerPool("the lakes' worker", () => new Worker(new URL('./lakes.worker.js', import.meta.url), { type: 'module' }), () => 1, () => 'the lakes looked for');   // (one, let go once the world has settled: made again when the camera has gone far enough)
  let at = null, busy = null, version = 0;
  source('lakes', () => (busy ? 1 : 0));   // (being looked for: the ground is drawn again when they come, src/core/settle.js)
  const take = (x, z, lakes) => { LAKES.length = 0; LAKES.push(...lakes); setLakes(LAKES); version++; at = { x, z }; return LAKES; };
  // (a look that failed is a look there too: asked again only once the camera has gone AGAIN metres, not every frame)
  const look = (x, z) => (busy ||= ask({ x, z }).then(({ lakes }) => take(x, z, lakes), (e) => { at = { x, z }; throw e; }).finally(() => { busy = null; }));
  return {
    /** the lakes round (x, z), looked for now (the start waits for them) */
    look,
    /** the same, here on the page's thread: some 40 ms, less than a worker takes to start (the first, before the first frame) */
    lookHere: (x, z) => take(x, z, findLakes(x, z)),
    /** each frame: looked for again once the camera has gone far enough */
    update(camera) { const p = camera.position; if (!busy && (!at || Math.hypot(p.x - at.x, p.z - at.z) > AGAIN)) look(p.x, p.z); },
    get version() { return version; },
    list: LAKES,
  };
}
