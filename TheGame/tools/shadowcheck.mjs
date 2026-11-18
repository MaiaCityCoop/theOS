// The shadow cascades on the GPU itself (intent 0038, stage 9a): `bun tools/shadowcheck.mjs [--url <game>] [--views
// tent,forest] [--size 1280x720] [--out <dir>]`. tools/cascades.js checks on the CPU what three asks of the device; this
// asks the GPU what it did. One Chrome tab on a fresh profile (thrown away after), at device scale 1 and at most
// 1920 × 1080, the world settled at each view as the gate poses it (tools/gate/views.js: the bench's tent and pine
// forest at eye level, 11:00, no wind, no clouds). At each view:
//   still     the picture, as the gate takes it (<out>/<view>.png)
//   layers    each layer of the cascades read back (copyTextureToBuffer, its rows padded to WebGPU's pitch: readback):
//             how many texels something was drawn into
//   floor     a grid of floor points round the eye (41 × 41, 0.75 m apart), each through the near cascade's matrix to
//             its texel: in shade where the layer holds something nearer the light than it (the CPU's reading)
//   receiver  the same points through the light's own code on the GPU (src/world/light.js shadowAt, shadowAtOne and
//             shadowAtVertex, drawn into a small target and read back), with the matrix, the switch and the bias as the
//             GPU sees them: the GPU's reading
//   errors    WebGPU's validation errors over two of the game's frames (an error scope), and what the page said
//   culling   the near layer again with the tiers' culling off (window.__occlusion.mode 0): what only what the eye saw
//             casts (src/core/occlusion.js entry)
// Read together: a layer with nothing over the floor is a caster that was not drawn; a layer with something over it, read
// as shade by the CPU and as light by the receiver, is the receiver's reading on the GPU (its matrix, its switch, the
// array's comparison); both in shade and the still lit is the material's use of it. A build without stage 9's cascades
// (main's one map) gets its still and its errors alone. The dev server must be running
// (bun run dev in TheGame; the gate's own at http://localhost:5180/game/ by default, or GATE_URL).
import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VIEWS, CHECK_SIZE } from './gate/views.js';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const BASE = arg('url', process.env.GATE_URL || 'http://localhost:5180/game/');
const [W, H] = arg('size', CHECK_SIZE).split('x').map(Number);
if (!(W > 0 && H > 0 && W * H <= 1920 * 1080)) throw new Error(`--size ${W}x${H}: at most 1920x1080 (a light check, not a gate)`);
const NAMES = { tent: 'bench-tent-eye-level', forest: 'bench-pine-forest-eye-level' };
const views = arg('views', 'forest,tent').split(',').map((n) => VIEWS.find((v) => v.name === (NAMES[n] ?? n)) ?? (() => { throw new Error(`no view ${n}`); })());
const OUT = arg('out', new URL('../.gate/shadowcheck/', import.meta.url).pathname);
mkdirSync(OUT, { recursive: true });

// ---- in the page ----
/** Into the page: window.__readLayer(tex, S, k), layer k of the cascades read back as S × S depths, row by row. WebGPU
    copies a texture into a buffer only by rows a multiple of 256 bytes apart (bytesPerRow), and S is derived
    (src/world/shadow.js useCascades), no power of two: each row is copied padded to that pitch and read back by it. */
function readback() {
  window.__readLayer = async (tex, S, k) => {
    const dev = window.__game.renderer.backend.device, pitch = Math.ceil((S * 4) / 256) * 256, row = pitch / 4;   // (bytes a row, padded; its floats)
    const buf = dev.createBuffer({ size: pitch * S, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), enc = dev.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex, origin: { x: 0, y: 0, z: k }, aspect: 'depth-only' }, { buffer: buf, bytesPerRow: pitch, rowsPerImage: S }, { width: S, height: S, depthOrArrayLayers: 1 });
    dev.queue.submit([enc.finish()]); await buf.mapAsync(GPUMapMode.READ);
    const raw = new Float32Array(buf.getMappedRange()), a = new Float32Array(S * S);
    for (let y = 0; y < S; y++) a.set(raw.subarray(y * row, y * row + S), y * S);
    buf.unmap(); buf.destroy();
    return a;
  };
}

/** The camera to a view (as tools/gate.js aim does) and the world settled there. */
async function aim(v) {
  const R = performance.getEntriesByType('resource').map((e) => e.name), mod = (part) => import(R.filter((n) => n.includes(part)).at(-1));
  const S = await import(new URL('tools/shots.js', location.href).href);
  const { poseAt } = await mod('src/camera/rig.js'), { heightAt } = await mod('src/world/land.js');
  const { x, z, yaw, look = 0 } = v.rig, P = poseAt(x, z, yaw, v.rig.h, look);
  S.weather({ wind: v.wind, clouds: v.clouds });
  await S.view({ x: P.pos[0], z: P.pos[2], yaw: P.yaw, up: P.pos[1] - heightAt(P.pos[0], P.pos[2]), pitch: 100 * Math.tan(P.pitch), mm: P.v.mm, hour: v.hour });
  for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
  await window.__game.settle({ timeout: 240e3 });
}

/** What the cascades hold and how the receiver reads them, at the camera as it is now. */
async function look({ N, step }) {
  const R = performance.getEntriesByType('resource').map((e) => e.name), mod = (re) => import(R.filter((n) => re.test(n)).at(-1));
  const THREE = await mod(/three_webgpu\.js/), T = await mod(/three_tsl\.js/);
  const { U } = await mod(/src\/core\/uniforms\.js/), L = await mod(/src\/world\/light\.js/), { heightAt } = await mod(/src\/world\/land\.js/);
  const g = window.__game, renderer = g.renderer, rt = g.light?.shadows?.target, lay = g.light?.shadows?.layout;
  if (!rt?.depthTexture?.isArrayTexture) return { cascades: 'none: this build has no cascades of stage 9 (the still alone)' };
  const tex = renderer.backend.get(rt.depthTexture).texture, S = rt.depthTexture.image.width, eye = g.camera.position.clone();
  const out = { cascades: `${tex.width}x${tex.height}x${tex.depthOrArrayLayers} ${tex.format}`, bound: U.tShadow.value === rt.depthTexture, on: U.uShadowOn.value, half: lay.half.map((h) => +h.toFixed(2)), texel: lay.texel.map((t) => +t.toFixed(4)), pen: +U.uShadowPen.value.toFixed(3), sunDir: U.uSunDir.value.toArray().map((v) => +v.toFixed(3)), layers: [] };
  // each layer as it is now
  const layers = [];
  for (let k = 0; k < tex.depthOrArrayLayers; k++) {
    const a = await window.__readLayer(tex, S, k);
    let drawn = 0, least = 1; for (let i = 0; i < a.length; i++) { if (a[i] < 1) drawn++; if (a[i] < least) least = a[i]; }
    layers.push(a); out.layers.push({ layer: k, drawn: +(drawn / a.length).toFixed(4), least: +least.toFixed(5) });
  }
  // the floor round the eye: the CPU's reading, through each cascade's matrix (src/world/shadow.js cascades)
  const pts = new Float32Array(N * N * 4), M = lay.mats.map((m) => m.value), bias = lay.bias.map((b, k) => b / lay.range[k]);
  const cpu = M.map(() => new Uint8Array(N * N));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = eye.x + (i - (N - 1) / 2) * step, z = eye.z + (j - (N - 1) / 2) * step, y = heightAt(x, z), p = j * N + i;
    pts.set([x, y, z, 1], p * 4);
    for (let k = 0; k < M.length; k++) {
      const e = M[k].elements, u = e[0] * x + e[4] * y + e[8] * z + e[12], v = e[1] * x + e[5] * y + e[9] * z + e[13], d = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (u <= 0 || v <= 0 || u >= 1 || v >= 1 || d >= 1) { cpu[k][p] = 2; continue; }   // (outside it)
      cpu[k][p] = layers[k][Math.min(S - 1, Math.floor(v * S)) * S + Math.min(S - 1, Math.floor(u * S))] < d - bias[k] ? 1 : 0;
    }
  }
  // the receiver: the light's own code at those points, drawn on the GPU into N × 3N texels, read back. Rows 0 … N-1:
  // shadowAt, shadowAtOne, shadowAtVertex (1 lit) and the point's index; N … 2N-1: the point in the near cascade as the
  // GPU works it out (u, v, depth) and its index; 2N … 3N-1: uShadowOn, uShadowPen (the widest penumbra), and 0, 0
  const P = new THREE.DataTexture(pts, N, N, THREE.RGBAFormat, THREE.FloatType); P.needsUpdate = true;
  const probe = new THREE.RenderTarget(N, 3 * N, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  const m = new THREE.NodeMaterial(); m.depthTest = m.depthWrite = false;
  m.vertexNode = T.vec4(T.positionGeometry.xy, 0, 1);
  m.fragmentNode = T.Fn(() => {
    const c = T.ivec2(T.screenCoordinate.xy), row = T.int(c.y).div(N), j = T.int(c.y).mod(N), w = T.texture(P).load(T.ivec2(c.x, j)).xyz.toVar();
    const s = lay.mats[0].mul(T.vec4(w, 1)), q = s.xyz.div(s.w), id = T.float(j.mul(N).add(T.int(c.x)));   // (id: which point, so a texel read back is matched to its point whichever way up)
    const a = T.vec4(L.shadowAt(w), L.shadowAtOne(w), L.shadowAtVertex(w), id), b = T.vec4(q.xy, q.z, id), u = T.vec4(U.uShadowOn, U.uShadowPen, 0, 0);
    return row.equal(0).select(a, row.equal(1).select(b, u));
  })();
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  quad.frustumCulled = false; scene.add(quad);
  const prev = renderer.getRenderTarget(); renderer.setRenderTarget(probe); renderer.render(scene, cam); renderer.setRenderTarget(prev);
  const got = await renderer.readRenderTargetPixelsAsync(probe, 0, 0, N, 3 * N);
  probe.dispose(); P.dispose(); m.dispose(); quad.geometry.dispose();
  const at = (p, row) => got.subarray((row * N * N + p) * 4, (row * N * N + p) * 4 + 4);
  const count = { points: N * N, misplaced: 0, nearInside: 0, cpuShade: 0, soft: 0, one: 0, vertex: 0, agree: 0, qOff: 0 };
  for (let p = 0; p < N * N; p++) {
    if (Math.round(at(p, 0)[3]) !== p || Math.round(at(p, 1)[3]) !== p) count.misplaced++;   // (not 0: the probe's rows are not where it drew them, and its numbers mean nothing)
    if (cpu[0][p] === 2) continue;
    count.nearInside++;
    const [soft, one, vert] = at(p, 0), shadeCpu = cpu[0][p] === 1;
    if (shadeCpu) count.cpuShade++;
    if (soft < 0.5) count.soft++; if (one < 0.5) count.one++; if (vert < 0.5) count.vertex++;
    if ((one < 0.5) === shadeCpu) count.agree++;
    const [u, v, d] = at(p, 1), x = pts[p * 4], y = pts[p * 4 + 1], z = pts[p * 4 + 2], e = M[0].elements;
    const cu = e[0] * x + e[4] * y + e[8] * z + e[12], cv = e[1] * x + e[5] * y + e[9] * z + e[13], cd = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (Math.abs(u - cu) * S > 0.5 || Math.abs(v - cv) * S > 0.5 || Math.abs(d - cd) > 1e-5) count.qOff++;   // (the GPU's matrix is not the CPU's)
  }
  out.floor = { ...count, beyond: cpu.slice(1).map((C) => ({ inside: C.filter((c) => c !== 2).length, cpuShade: C.filter((c) => c === 1).length })) };
  out.gpuUniforms = [...at(0, 2)].slice(0, 2).map((v) => +v.toPrecision(5));   // (uShadowOn, uShadowPen)
  return out;
}

/** WebGPU's validation errors over two of the game's frames. */
async function errorsOver() {
  const dev = window.__game.renderer.backend.device, kinds = ['validation', 'out-of-memory', 'internal'];
  for (const k of kinds) dev.pushErrorScope(k);
  for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
  const said = [];
  for (const k of [...kinds].reverse()) { const e = await dev.popErrorScope(); if (e) said.push(`${k}: ${e.message.slice(0, 400)}`); }
  return said.concat((window.__gpuErrors ?? []).splice(0));
}

/** The near layer's texels drawn with the tiers' culling off, then on again. */
async function unculled() {
  const o = window.__occlusion, g = window.__game, renderer = g.renderer, rt = g.light?.shadows?.target;
  if (!o || !rt?.depthTexture?.isArrayTexture) return null;
  const was = o.mode; o.mode = 0;
  try {
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    const tex = renderer.backend.get(rt.depthTexture).texture, S = rt.depthTexture.image.width;
    const a = await window.__readLayer(tex, S, 0); let drawn = 0; for (let i = 0; i < a.length; i++) if (a[i] < 1) drawn++;
    return { mode: was, nearDrawnUnculled: +(drawn / (S * S)).toFixed(4) };
  } finally { o.mode = was; for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame); }
}

// ---- the run ----
const dir = mkdtempSync(join(tmpdir(), 'shadowcheck-'));
const ctx = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'], viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const said = [];
try {
  const page = await ctx.newPage();
  await page.addInitScript(() => performance.setResourceTimingBufferSize(1e5));   // (the page's own modules found by their resource entries: all of them kept)
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') said.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => said.push(`[pageerror] ${String(e).slice(0, 400)}`));
  page.on('crash', () => said.push('[crash]'));
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'load', timeout: 300e3 });
  await page.waitForFunction(() => typeof window.__game?.settle === 'function', null, { timeout: 300e3, polling: 500 });
  await page.evaluate(async () => { const s = window.__game; await s.ready; await s.settle({ timeout: 240e3 }); });
  if (!(await page.evaluate(() => !!window.__game.renderer.backend.isWebGPUBackend))) throw new Error('drawn through WebGL, not WebGPU');
  console.log(`${BASE}: settled at the start in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${W}x${H}`);
  // (as the gate's prepare: the clock held, the governor held, no lens blur; the inside at the canvas's own pixels; every
  // uncaptured WebGPU error kept)
  await page.evaluate(async () => {
    const s = window.__game, R = performance.getEntriesByType('resource').map((e) => e.name);
    const { U } = await import(R.filter((n) => n.includes('src/core/uniforms.js')).at(-1));
    Object.defineProperty(U.uTime, 'value', { get: () => 100, set() {}, configurable: true });
    s.governor.hold(true); s.governor.rest?.(); s.screen.set(1); window.__cine.dof = false;
    s.renderer.backend.device.addEventListener('uncapturederror', (e) => (window.__gpuErrors ||= []).push(`uncaptured: ${e.error.message.slice(0, 400)}`));
  });
  await page.evaluate(readback);
  for (const v of views) {
    await page.evaluate(aim, v);
    const png = await page.evaluate(() => window.__cine.still()), file = `${OUT}${v.name}.png`;
    writeFileSync(file, Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
    const D = await page.evaluate(look, { N: 41, step: 0.75 });
    D.errors = await page.evaluate(errorsOver);
    D.culling = await page.evaluate(unculled);
    console.log(`\n${v.name}: ${file}\n${JSON.stringify(D, null, 1)}`);
  }
} finally {
  console.log(`\nthe page said ${said.length} warning(s)/error(s)`); for (const s of said.slice(0, 25)) console.log('  ' + s);
  await ctx.close(); rmSync(dir, { recursive: true, force: true });
}
