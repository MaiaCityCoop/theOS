// The materials' painting held texel by texel, one version against another (intent 0038: a painting's elements made
// data, 2026-11-19: the same numbers in, the same pixels out). Every material that paints, painted alone at the
// painter's size in the system's Chrome (tools/paints.page.js on the game's dev server: its own painting program into
// what the painter paints into), its tile (8 bits a channel), its heights and roughness (32-bit floats) and its relief
// as the painter takes it from them (8 bits) kept; then two such sets compared, material by material.
//
//   bun tools/paints.js --url <the dev server's game/> --tag <t> [--size n] [--cpu]   paint them into .gate/paints/<t>/
//                       [--only name,name]                                            (those materials alone)
//   bun tools/paints.js diff <tagA> <tagB>                                           hold the two sets against each other
//   bun tools/paints.js cache --url <the dev server's game/> [--cpu]               a start, and a start again (the warm
//                       cache: src/materials/bake.js): the second paints nothing, asks the GPU for no painting
//                       program, and its layers are the first's, byte for byte; the first kept them all, a layer a
//                       frame at the most, one buffer of them at once (tools/painted.page.js)
//
// The GPU's lock is held while it paints (tools/gpu/lock.js); --cpu paints in Chrome on its CPU adapter (SwiftShader, as
// CI compiles: tools/gate/wgsl.js), no GPU at all. What is kept is held to one step of its format: a texel of the tile
// or of the relief differs where a channel is more than one step (1/255) off. The raw heights are said, not held: no
// texture keeps them (float rounding moves them: 1e-6 of them, and 1e-7).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { locked } from './gpu/lock.js';

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = new URL('../.gate/paints/', import.meta.url).pathname;

async function paint() {
  const url = arg('url'), tag = arg('tag'), size = +arg('size', 1024), cpu = process.argv.includes('--cpu');
  if (!url || !tag) throw new Error('paints: --url <the dev server\'s game/> and --tag <t>');
  const dir = `${OUT}${tag}/`; mkdirSync(dir, { recursive: true });
  const run = async () => {
    const args = ['--enable-unsafe-webgpu', ...(cpu ? ['--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'] : [])];
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args });
    try {
      const page = await browser.newPage();
      page.on('pageerror', (e) => console.log(`paints: the page: ${e.message}`));
      await page.goto(`${url}tools/paints.html?size=${size}`); await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      const only = arg('only')?.split(',').map((x) => x.trim().toLowerCase()), list = (await page.evaluate(() => window.__materials)).filter((m) => !only || only.includes(m.name.toLowerCase())), index = [];
      for (const m of list) {
        const t0 = Date.now(), r = await page.evaluate((uid) => window.__paint(uid), m.uid);
        if (r.error) { console.log(`  ${m.name}: not painted: ${r.error}`); index.push({ ...m, error: r.error }); continue; }
        writeFileSync(`${dir}${m.uid}.tile`, Buffer.from(r.tile, 'base64')); writeFileSync(`${dir}${m.uid}.raw`, Buffer.from(r.raw, 'base64')); if (r.relief) writeFileSync(`${dir}${m.uid}.relief`, Buffer.from(r.relief, 'base64'));
        index.push(m); console.log(`  ${m.name}: painted, ${Date.now() - t0} ms`);
      }
      writeFileSync(`${dir}index.json`, JSON.stringify({ size, cpu, list: index }));
      console.log(`paints: ${index.filter((m) => !m.error).length} of ${list.length} materials painted, ${size}² each, in .gate/paints/${tag}/`);
    } finally { await browser.close(); }
  };
  if (cpu) await run(); else await locked('tools/paints.js: the materials painted', run);
}

function diff(a, b) {
  const A = JSON.parse(readFileSync(`${OUT}${a}/index.json`, 'utf8')), B = JSON.parse(readFileSync(`${OUT}${b}/index.json`, 'utf8'));
  if (A.size !== B.size) throw new Error(`paints: ${a} is ${A.size}², ${b} ${B.size}²`);
  let worst = 0; const rows = [];
  for (const m of A.list) {
    const other = B.list.find((x) => x.uid === m.uid);
    if (m.error || !other || other.error || !existsSync(`${OUT}${b}/${m.uid}.tile`)) { rows.push(`| ${m.name} | not in both |  |  |`); worst = Infinity; continue; }
    const ta = readFileSync(`${OUT}${a}/${m.uid}.tile`), tb = readFileSync(`${OUT}${b}/${m.uid}.tile`), ra = new Float32Array(readFileSync(`${OUT}${a}/${m.uid}.raw`).buffer.slice(0)), rb = new Float32Array(readFileSync(`${OUT}${b}/${m.uid}.raw`).buffer.slice(0));
    const steps = (x, y) => { let off = 0, most = 0; for (let i = 0; i < x.length; i += 4) { let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(x[i + c] - y[i + c])); most = Math.max(most, d); if (d > 1) off++; } return [off, most]; };
    const [tileOff, tileMost] = steps(ta, tb), relA = `${OUT}${a}/${m.uid}.relief`, relB = `${OUT}${b}/${m.uid}.relief`, [relOff, relMost] = existsSync(relA) && existsSync(relB) ? steps(readFileSync(relA), readFileSync(relB)) : [0, null];
    let rawOff = 0, rawMost = 0;
    for (let i = 0; i < ra.length; i += 2) { let off = false; for (let c = 0; c < 2; c++) { const d = Math.abs(ra[i + c] - rb[i + c]); rawMost = Math.max(rawMost, d); if (d > 1e-7 + 1e-6 * Math.abs(ra[i + c])) off = true; } if (off) rawOff++; }
    worst = Math.max(worst, tileOff + relOff);
    rows.push(`| ${m.name} | ${tileOff ? `**${tileOff}**` : 0} (most ${tileMost}) | ${relMost == null ? 'none' : `${relOff ? `**${relOff}**` : 0} (most ${relMost})`} | ${rawOff} (most ${rawMost.toExponential(1)}) |`);
  }
  console.log(`paints: ${a} against ${b}, ${A.size}² a material: texels off by more than one step of 255 (the most), what is kept: its tile and its relief; and the raw heights moved past float rounding (said, not held)\n| material | tile | relief | raw |\n| --- | --- | --- | --- |\n${rows.join('\n')}`);
  console.log(worst === 0 ? 'paints: every material the same, texel by texel' : 'paints: some differ');
  if (worst) process.exitCode = 1;
}

/** A start of the world's textures, then another on the same profile: what the first painted and kept, the second lays
    out. Exit 1 unless the second painted nothing, asked the GPU for no pipeline, and holds the first's layers, and the
    first kept all it painted, paced: no more than a layer a frame, nor a buffer of them at once. */
async function cache() {
  const url = arg('url'), cpu = process.argv.includes('--cpu'), dir = mkdtempSync(join(tmpdir(), 'paints-cache-'));
  const args = ['--enable-unsafe-webgpu', ...(cpu ? ['--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'] : [])];
  const run = async () => {
    const context = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: true, args }), starts = [];
    try {
      for (const q of ['?fresh', '']) {
        const page = await context.newPage(); page.on('pageerror', (e) => console.log(`paints: the page: ${e.message}`));
        await page.goto(`${url}tools/painted.html${q}`); await page.waitForFunction(() => window.__painted, null, { timeout: 600000 });
        starts.push(await page.evaluate(() => window.__painted)); await page.close();
      }
    } finally { await context.close(); }
    return starts;
  };
  const [a, b] = cpu ? await run() : await locked('tools/paints.js: the textures, kept and laid out', run);
  const same = a.layers.length === b.layers.length && a.layers.every((L, n) => L.hash === b.layers[n].hash && L.uid === b.layers[n].uid);
  const P = a.pace, paced = a.stored === a.painted && P.perFrame <= 1 && P.buffers <= 1;
  console.log(`paints cache: the first start painted ${a.painted}, laid out ${a.laid}, asked the GPU for ${a.asked} pipelines, and kept ${a.stored} over ${P.frames} frames, at most ${P.perFrame} a frame, ${P.buffers} of their buffers at once${paced ? '' : ' (NOT paced)'}; the second painted ${b.painted}, laid out ${b.laid}, asked for ${b.asked}; its ${b.layers.length} layers ${same ? 'the first\'s, byte for byte' : 'NOT the first\'s'}${a.packed ? '' : ' (no blocks on this GPU: nothing kept)'}`);
  if (!a.packed || b.painted || b.asked || !same || b.laid !== a.painted || !paced) process.exitCode = 1;
}

if (process.argv[2] === 'diff') diff(process.argv[3], process.argv[4]); else if (process.argv[2] === 'cache') await cache(); else await paint();
