// The lakes round the camera (src/world/land.js: where the river closes round on itself, a lake): looked for in a
// worker, at the start and again whenever the camera has gone AGAIN metres from where they were last looked for; the
// CPU's land (LAKES) and the GPU's (land.nodes.js: setLakes) take them together, and what reads the ground is told
// (changed()).
import { LAKES } from './land.js';
import { setLakes } from './land.nodes.js';

const AGAIN = 2000;
export function createLakes() {
  const worker = new Worker(new URL('./lakes.worker.js', import.meta.url), { type: 'module' });
  let at = null, busy = null, version = 0, id = 0;
  const look = (x, z) => (busy ||= new Promise((res) => {
    const me = ++id;
    worker.onmessage = ({ data }) => { if (data.id !== me) return; LAKES.length = 0; LAKES.push(...data.lakes); setLakes(LAKES); version++; at = { x, z }; busy = null; res(LAKES); };
    worker.postMessage({ id: me, x, z });
  }));
  return {
    /** the lakes round (x, z), looked for now (the start waits for them) */
    look,
    /** each frame: looked for again once the camera has gone far enough */
    update(camera) { const p = camera.position; if (!busy && (!at || Math.hypot(p.x - at.x, p.z - at.z) > AGAIN)) look(p.x, p.z); },
    get version() { return version; },
    list: LAKES,
  };
}
