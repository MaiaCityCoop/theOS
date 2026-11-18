// What size the ground cover is seen at, near and far (intent 0038): `bun tools/sizecheck.mjs [--url <game>] [--browser
// webkit|chromium] [--size 1280x720] [--at x,z] [--yaw a] [--dists 2,10,30,80] [--high deg] [--metres 6] [--out <dir>]`.
// A thing keeps its true size at every distance, by the one measure: one spot of the forest's floor looked at from each
// distance in turn, along one line, at eye level (or, with --high, from as high as looking down at it by that angle
// asks, where that is higher: far off, over what stands between), through the walker's lens, and of each look:
//   still     the picture (<out>/<d>m.png), and the same metres of ground round the spot (--metres), enlarged to one
//             size (<out>/<d>m-crop.png): side by side, the ground cover should look the same size in each
//   size      how large the ground cover's pattern is there, metres: the width at which its brightness stops being
//             like itself along a row (where the rows' autocorrelation falls to a half), through the spot, over the
//             metres a pixel is there (the lens: the camera's own projection)
// The spot: by default the bench's pine forest at eye level (tools/bench.js VIEWS), 12 m ahead of it on its heading.
// One tab of a browser on a fresh profile, closed after; at most 1920 × 1080 at scale 1: a light check, under the GPU's
// lock (tools/gpu/lock.js take). The dev server must be running (bun run dev; GATE_URL or --url).
import { chromium, webkit } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { CHECK_SIZE } from './gate/views.js';
import { VIEWS } from './bench.js';
import RIG from '../camera/rig.js';
import { WALKER } from '../world/scale.js';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt; };
const BASE = arg('url', process.env.GATE_URL || 'http://localhost:5180/game/'), kind = arg('browser', 'webkit');
const [W, H] = arg('size', CHECK_SIZE).split('x').map(Number);
if (!(W > 0 && H > 0 && W * H <= 1920 * 1080)) throw new Error(`--size ${W}x${H}: at most 1920x1080 (a light check)`);
const F = VIEWS.find((v) => v.name === 'pine forest, eye level'), yaw = +arg('yaw', F.yaw);
const ahead = [-Math.sin(yaw), -Math.cos(yaw)];   // (the rig looks along (−sin, −cos) of its yaw)
const [tx, tz] = arg('at', `${F.x + ahead[0] * 12},${F.z + ahead[1] * 12}`).split(',').map(Number);
const HIGH = (+arg('high', 0) * Math.PI) / 180, METRES = +arg('metres', 6);
const dists = arg('dists', '2,10,30,80').split(',').map(Number), OUT = arg('out', new URL('../.gate/sizecheck/', import.meta.url).pathname);
mkdirSync(OUT, { recursive: true });

// ---- in the page ----
/** As the gate prepares a page: the clock held, the governor held, the inside at the canvas's own pixels, no lens blur. */
async function prepare() {
  const s = window.__game, R = performance.getEntriesByType('resource').map((e) => e.name);
  const { U } = await import(R.filter((n) => n.includes('src/core/uniforms.js')).at(-1));
  Object.defineProperty(U.uTime, 'value', { get: () => 100, set() {}, configurable: true });
  s.governor.hold(true); s.governor.rest?.(); s.screen.set(1); window.__cine.dof = false;
}
/** The camera d metres back from the spot along the line, `up` metres over the ground there (a walker's eyes, or
    higher: --high), looking at the spot, through the walker's lens; the world settled there. */
async function aim({ tx, tz, ahead, d, up, mm, hour }) {
  const R = performance.getEntriesByType('resource').map((e) => e.name), { heightAt } = await import(R.filter((n) => n.includes('src/world/land.js')).at(-1));
  const x = tx - ahead[0] * d, z = tz - ahead[1] * d;
  window.__cine.take({ pos: [x, heightAt(x, z) + up, z], look: [tx, heightAt(tx, tz) + 0.05, tz], mm, hour });
  for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
  await window.__game.settle({ timeout: 240e3 });
}
/** The still, its crop of `metres` of ground round the spot enlarged to `side` pixels, and the pattern's size there:
    { png, crop, px (where the rows' autocorrelation falls to a half), perM (pixels a metre at the spot), m }. */
async function look({ d, up, metres, side }) {
  const png = window.__cine.still(), img = new Image(); img.src = png; await img.decode();
  const w = img.width, h = img.height, c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const cam = window.__game.camera, perM = (cam.projectionMatrix.elements[5] * h * 0.5) / Math.hypot(d, up);   // (pixels a metre, across the view, at the spot)
  // the band through the spot: a few rows, a third of the width
  const rows = Math.max(3, Math.round(h * 0.01)), cols = Math.round(w / 3), x0 = Math.round(w / 2 - cols / 2), y0 = Math.round(h / 2 - rows / 2);
  const D = g.getImageData(x0, y0, cols, rows).data, maxLag = Math.round(cols / 3), ac = new Float64Array(maxLag + 1);
  for (let r = 0; r < rows; r++) {
    const L = new Float64Array(cols); let mean = 0;
    for (let i = 0; i < cols; i++) { const o = (r * cols + i) * 4; L[i] = 0.2126 * D[o] + 0.7152 * D[o + 1] + 0.0722 * D[o + 2]; mean += L[i]; }
    mean /= cols; let v = 0; for (let i = 0; i < cols; i++) { L[i] -= mean; v += L[i] * L[i]; }
    if (v <= 0) continue;
    for (let k = 0; k <= maxLag; k++) { let s = 0; for (let i = 0; i + k < cols; i++) s += L[i] * L[i + k]; ac[k] += s / v; }
  }
  let px = maxLag; for (let k = 1; k <= maxLag; k++) if (ac[k] < ac[0] / 2) { px = k - 1 + (ac[k - 1] - ac[0] / 2) / Math.max(1e-9, ac[k - 1] - ac[k]); break; }
  // the crop: `metres` of ground round the spot, enlarged (each pixel a block) to `side` pixels
  const cw = Math.max(4, Math.round(metres * perM)), crop = new OffscreenCanvas(side, Math.round((side * 9) / 16)), cg = crop.getContext('2d');
  cg.imageSmoothingEnabled = false; cg.drawImage(c, Math.round(w / 2 - cw / 2), Math.round(h / 2 - (cw * 9) / 32), cw, Math.round((cw * 9) / 16), 0, 0, crop.width, crop.height);
  const blob = await crop.convertToBlob({ type: 'image/png' }), bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { png, crop: `data:image/png;base64,${btoa(bin)}`, px: +px.toFixed(2), perM: +perM.toFixed(2), m: +(px / perM).toFixed(3) };
}

// ---- the run ----
// (WebKit: the newest one installed, as the cut's check takes it, tools/gate/cut.js)
const CACHE = `${homedir()}/Library/Caches/ms-playwright`, WK = existsSync(CACHE) ? readdirSync(CACHE).filter((d) => d.startsWith('webkit-')).sort().map((d) => `${CACHE}/${d}/pw_run.sh`).filter(existsSync).pop() : null;
const browser = kind === 'webkit' ? await webkit.launch(WK ? { executablePath: WK } : {}) : await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
const said = [];
try {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  await page.addInitScript(() => performance.setResourceTimingBufferSize(1e5));
  page.on('pageerror', (e) => said.push(`[pageerror] ${String(e).slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error') said.push(`[error] ${m.text().slice(0, 300)}`); });
  await page.goto(BASE, { waitUntil: 'load', timeout: 300e3 });
  await page.waitForFunction(() => typeof window.__game?.settle === 'function', null, { timeout: 300e3, polling: 500 });
  await page.evaluate(async () => { const s = window.__game; await s.ready; await s.settle({ timeout: 240e3 }); });
  await page.evaluate(prepare);
  console.log(`${kind} ${BASE}, ${W}x${H}: the spot ${tx.toFixed(1)}, ${tz.toFixed(1)}, looked at along ${yaw.toFixed(2)}`);
  for (const d of dists) {
    const up = Math.max(WALKER.eye, d * Math.tan(HIGH));
    await page.evaluate(aim, { tx, tz, ahead, d, up, mm: RIG.keys[0].mm, hour: 11 });
    const r = await page.evaluate(look, { d, up, metres: METRES, side: 480 });
    const save = (name, url) => writeFileSync(`${OUT}${name}`, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    save(`${d}m.png`, r.png); save(`${d}m-crop.png`, r.crop);
    console.log(`  ${String(d).padStart(3)} m${up > WALKER.eye ? ` (${up.toFixed(0)} m up)` : ''}: ${r.perM} px a metre; the ground cover's pattern ${r.px} px, ${r.m} m (→ ${OUT}${d}m.png, ${d}m-crop.png)`);
  }
} finally {
  if (said.length) { console.log(`the page said ${said.length}:`); for (const s of said.slice(0, 8)) console.log(`  ${s}`); }
  await browser.close();
}
