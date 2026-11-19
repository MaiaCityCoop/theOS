// Whether the land's page table ever says a page is in that was not laid, on the CPU (intent 0038): `bun tools/pagecheck.js
// [share]` (default budget.js PHONE_SHARE, the iPhone's). No GPU. The land's pages (src/terrain/pages.js) made on the GPU's stand-in
// (tools/gpu-mock.js) at that share of the Mac's budget, on a device whose error scopes say every third batch's laying
// could not be done (as WebGPU says it where a buffer could not be made, short of memory: 2026-11-19, Samuel's iPhone,
// the river's bed in other places' ground, triangle by triangle). Frames of the camera at the river, the last level's
// pages laid round it as every frame lays them; each slot's last laying, done or not (the batch's own slots, as it
// is handed to the GPU), and the table as it is sent. Exit 1 where an entry says a page is in at a slot whose last
// laying was not done: a pixel would read what lay there before.
import { mock } from './gpu-mock.js';

const M = await mock({ lean: true }), { THREE, renderer } = M, dev = renderer.backend.device;
const { MAC_BUFFER, PHONE_SHARE, FPS } = await import('../src/core/budget.js'), G = await import('../src/core/gpu.js'), { VALID } = await import('../src/terrain/pages.js');
const SHARE = Number(process.argv[2] ?? PHONE_SHARE), FRAMES = FPS * 7;   // (the phone's share; seven seconds of frames)
globalThis.navigator.gpu = { requestAdapter: async () => ({ limits: { maxBufferSize: SHARE * MAC_BUFFER, maxStorageBufferBindingSize: SHARE * MAC_BUFFER }, info: {} }) };
const info = console.info; console.info = () => {}; await G.askedLimits(); console.info = info;
// (the device: its buffers named, the table's and the batch's writes read; its error scopes, a batch a pair)
const TABLE = "the land's page table", BATCH = "the land's pages: the batch being laid", table = new Map(), lastLay = new Map();
let batch = 0, failing = false;
dev.createBuffer = (d) => ({ label: d?.label ?? '', destroy() {} });
dev.queue.writeBuffer = (buf, off, data) => {
  if (buf.label === TABLE) { const u = new Uint32Array(data.buffer, data.byteOffset, data.length); for (let k = 0; k < u.length; k++) table.set(off / 4 + k, u[k]); }
  // (a batch handed over: its slots, and whether its laying is to fail)
  if (buf.label === BATCH) { const f = new Float32Array(data.buffer, data.byteOffset, data.length); batch++; failing = batch % 3 === 0; for (let b = 3; b < f.length; b += 12) lastLay.set(f[b], !failing); }
};
dev.pushErrorScope = () => {};
dev.popErrorScope = () => Promise.resolve(failing ? { message: 'out of memory (the check)' } : null);   // (both of the batch's scopes: what it could not do)

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.15, 30000); scene.add(camera);
(await import('../src/core/uniforms.js')).createUniforms(camera);
const tex = (await import('../src/materials/bake.js')).bakeTextures(renderer, { spare: 1 });
const { createTerrain } = await import('../src/terrain/terrain.js'), terrain = createTerrain(scene, tex, renderer);
const { heightAt } = await import('../src/world/land.js');
camera.position.set(-1264, heightAt(-1264, 617) + 2.7, 617); camera.lookAt(-1240, heightAt(-1240, 640), 640); camera.updateMatrixWorld();
let wrong = 0, said = 0;
for (let f = 0; f < FRAMES; f++) {
  terrain.pages.update(camera, 3000);
  for (let k = 0; k < 4; k++) await Promise.resolve();   // (the scopes' answers)
  for (const [, v] of table) if (v & VALID && lastLay.get(v & 0xfff) === false) { wrong++; if (said++ < 3) console.log(`  frame ${f}: an entry says a page is in at slot ${v & 0xfff}, whose last laying was not done`); }
}
const S = terrain.pages.stats, inTable = [...table.values()].filter((v) => v & VALID).length;
console.log(`share ${SHARE}: ${S.slots} slots; ${batch} batches handed over, every third not done (${[...lastLay.values()].filter((x) => !x).length} slots last laid so); ${inTable} pages in the table, ${S.in} held, ${S.lost ?? '–'} given back`);
console.log(wrong ? `FAIL: ${wrong} reads of the table, over ${FRAMES} frames, of a page not laid` : 'ok: the table never says a page is in whose laying was not done');
process.exit(wrong ? 1 : 0);
