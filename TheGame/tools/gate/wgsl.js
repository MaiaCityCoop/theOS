// The WGSL check (intent 0038): every shader module the smoke builds (tools/smoke.js --wgsl, on the CPU: the world's
// and the library's, as the game builds them), compiled on this machine's GPU in a blank page of each engine the game
// runs in, Chrome (Tint) and WebKit (its own compiler), no game loaded: each module's errors (getCompilationInfo), and
// every pipeline made of them, its bind groups laid out as its WGSL declares them (as three lays out the game's: an
// inferred layout takes a depth texture's sampler for a filtering one, which no pipeline of the game's is) and, a
// render one, the vertex inputs and colour targets it declares and a depth buffer. Smoke builds the text; only a device says whether it compiles (2026-11-19: 16 of
// smoke's modules did not, written atan(y, x) for want of the stand-in's coordinate system, #215). A minute, little
// memory, nothing of the game's: it runs where the machine is too short for a measure.
//
//   tools/gate.js wgsl (exit 1 on any error), the hour's first line after Ready, and before a push where asked
//   (git config gate.wgsl true: .githooks/pre-push; where a run holds the GPU, the push says so and goes on).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { webkitAt } from '../browsers.js';

const ENGINES = { chrome: () => chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] }), webkit: () => webkit.launch({ headless: true, ...webkitAt() }) };

/** Every module the smoke builds, by running it (its own process: the world made on the stand-in): { render: [{ label,
    vertex, fragment }], compute: [{ label, code }] }, or { error } where the smoke did not get so far. */
function built() {
  const dir = mkdtempSync(join(tmpdir(), 'gate-wgsl-')), f = join(dir, 'wgsl.json');
  try {
    const r = spawnSync('bun', ['tools/smoke.js', '--wgsl', f], { cwd: new URL('../..', import.meta.url).pathname, encoding: 'utf8', maxBuffer: 1 << 26 });
    try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return { error: `the smoke kept no modules: ${(r.stdout + r.stderr).trim().split('\n').slice(-3).join(' · ')}` }; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** In the page: every module compiled on the adapter's device (all its features and limits asked, as the game asks
    them), its errors said with where; every pipeline made. { adapter, modules, pipelines, errors }. */
async function compileAll(S) {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) return { error: 'no WebGPU adapter' };
  const requiredLimits = {}; for (const k in adapter.limits) requiredLimits[k] = adapter.limits[k];
  const device = await adapter.requestDevice({ requiredFeatures: [...adapter.features], requiredLimits });
  const errors = [], info = adapter.info ?? {}, out = { adapter: [...new Set([info.vendor, info.architecture, info.device].filter(Boolean))].join(' ') || 'an adapter', modules: 0, pipelines: 0, errors };
  const said = (label, what, m) => errors.push(`${label}, ${what}: ${m.replace(/\s*\n\s*/g, ' ').slice(0, 400)}`);
  const mod = async (code, label, what) => {
    const m = device.createShaderModule({ code }), I = await m.getCompilationInfo(); out.modules++;
    for (const x of I.messages) if (x.type === 'error') said(label, what, `${x.lineNum}:${x.linePos} ${x.message} (\`${code.split('\n')[x.lineNum - 1]?.trim().slice(0, 120) ?? ''}\`)`);
    return I.messages.some((x) => x.type === 'error') ? null : m;
  };
  const made = async (label, what, make) => {
    device.pushErrorScope('validation');
    try { await make(); out.pipelines++; } catch (e) { said(label, what, String(e?.message ?? e)); }
    const v = await device.popErrorScope(); if (v) said(label, `${what}, validation`, v.message);
  };
  // (a render pipeline's vertex buffers, one an input its vertex stage declares, and colour targets, one an output its
  // fragment stage declares: the formats the types ask, a float one half floats, as the game's targets mostly are)
  const FMT = { f32: 'float32', u32: 'uint32', i32: 'sint32' }, SIZE = { float32: 4, uint32: 4, sint32: 4 };
  const vertexFormat = (t) => { const [, n, s] = t.match(/^(?:vec([234])<)?(f32|u32|i32)>?$/) ?? []; return s ? FMT[s] + (n ? `x${n}` : '') : null; };
  const bytes = (f) => SIZE[f.replace(/x\d$/, '')] * (+f.match(/x(\d)$/)?.[1] || 1);
  const target = (t) => (/u32/.test(t) ? (/vec[234]/.test(t) ? 'rg32uint' : 'r32uint') : /i32/.test(t) ? (/vec[234]/.test(t) ? 'rg32sint' : 'r32sint') : 'rgba16float');
  const fields = (src) => [...src.matchAll(/@location\(\s*(\d+)\s*\)\s*\w+\s*:\s*([\w<>]+)/g)];
  // (the bind groups as the stages' WGSL declares them, each binding seen by the stages that declare it: a sampler one
  // that filters nothing, a float texture one read unfiltered, which sample whatever valid WGSL samples with them)
  const DIM = { '1d': '1d', '2d': '2d', '2d_array': '2d-array', '3d': '3d', cube: 'cube', cube_array: 'cube-array' }, ACCESS = { read: 'read-only', write: 'write-only', read_write: 'read-write' };
  const entryOf = (space, type) => {
    let m;
    if (/^sampler_comparison/.test(type)) return { sampler: { type: 'comparison' } };
    if (/^sampler/.test(type)) return { sampler: { type: 'non-filtering' } };
    if ((m = type.match(/^texture_storage_(1d|2d_array|2d|3d)<\s*(\w+)\s*,\s*(\w+)\s*>/))) return { storageTexture: { format: m[2], access: ACCESS[m[3]], viewDimension: DIM[m[1]] } };
    if ((m = type.match(/^texture_depth_(multisampled_)?(2d_array|2d|cube_array|cube)/))) return { texture: { sampleType: 'depth', viewDimension: DIM[m[2]], multisampled: !!m[1] } };
    if ((m = type.match(/^texture_(multisampled_)?(1d|2d_array|2d|3d|cube_array|cube)<\s*(f32|u32|i32)\s*>/))) return { texture: { sampleType: { f32: 'unfilterable-float', u32: 'uint', i32: 'sint' }[m[3]], viewDimension: DIM[m[2]], multisampled: !!m[1] } };
    if (/^texture_external/.test(type)) return { externalTexture: {} };
    return space === 'uniform' ? { buffer: { type: 'uniform' } } : /^storage/.test(space ?? '') ? { buffer: { type: /read_write/.test(space) ? 'storage' : 'read-only-storage' } } : null;
  };
  const layoutOf = (stages) => {
    const groups = [];
    for (const [code, stage] of stages) for (const [, a, x, b, y, space, type] of code.matchAll(/@(group|binding)\(\s*(\d+)\s*\)\s*@(group|binding)\(\s*(\d+)\s*\)\s*var(?:<([^>]*)>)?\s+\w+\s*:\s*([^;]+);/g)) {
      const [g, n] = a === 'group' ? [+x, +y] : [+y, +x], e = entryOf(space?.replace(/\s/g, ''), type.trim());
      if (!e) continue;
      const G = (groups[g] ??= new Map()), had = G.get(n);
      G.set(n, { ...(had ?? e), binding: n, visibility: (had?.visibility ?? 0) | GPUShaderStage[stage.toUpperCase()] });
    }
    return device.createPipelineLayout({ bindGroupLayouts: Array.from(groups, (G) => device.createBindGroupLayout({ entries: [...(G ?? new Map()).values()] })) });
  };
  for (const s of S.compute) { const m = await mod(s.code, s.label, 'compute'); if (m) await made(s.label, 'compute pipeline', () => device.createComputePipelineAsync({ layout: layoutOf([[s.code, 'compute']]), compute: { module: m, entryPoint: 'main' } })); }
  for (const s of S.render) {
    const vm = await mod(s.vertex, s.label, 'vertex'), fm = await mod(s.fragment, s.label, 'fragment');
    if (!vm || !fm) continue;
    const inputs = fields(s.vertex.match(/@vertex\s*fn main\(([\s\S]*?)\)\s*->/)?.[1] ?? '').map(([, at, t]) => [+at, vertexFormat(t)]).filter(([, f]) => f);
    const buffers = inputs.map(([at, format]) => ({ arrayStride: bytes(format), attributes: [{ shaderLocation: at, offset: 0, format }] }));
    const ret = s.fragment.match(/@fragment\s*fn main\([\s\S]*?\)\s*->\s*(@location\(\s*0\s*\)\s*)?([\w<>]+)/), outs = [];
    if (ret?.[1]) outs[0] = ret[2];
    else if (ret) for (const [, at, t] of fields(s.fragment.match(new RegExp(`struct ${ret[2]}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? '')) outs[+at] = t;
    await made(s.label, 'render pipeline', () => device.createRenderPipelineAsync({ layout: layoutOf([[s.vertex, 'vertex'], [s.fragment, 'fragment']]), vertex: { module: vm, entryPoint: 'main', buffers },
      fragment: { module: fm, entryPoint: 'main', targets: Array.from(outs, (t) => (t ? { format: target(t) } : null)) }, depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' } }));
  }
  device.destroy();
  return out;
}

/** The check: the smoke's modules, compiled in each engine (above). { modules (render, compute: how many the smoke
    built), engines: { chrome, webkit: { adapter, modules, pipelines, errors } or { error } }, errors (all, by engine),
    pass }. */
export async function wgsl() {
  const S = built();
  if (S.error) { const out = { error: S.error, pass: false }; say(out); return out; }
  const out = { modules: { render: S.render.length, compute: S.compute.length }, engines: {} };
  for (const [name, launch] of Object.entries(ENGINES)) {
    let b = null;
    try {
      b = await launch();
      const page = await (await b.newContext()).newPage();   // (a context of its own: WebKit's default one has no adapter)
      await page.route('https://wgsl.gate/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>wgsl</title>' }));   // (a blank page of a secure origin: WebGPU's)
      await page.goto('https://wgsl.gate/');
      out.engines[name] = await page.evaluate(compileAll, S);
    } catch (e) { out.engines[name] = { error: String(e?.message ?? e).split('\n')[0] }; }
    finally { await b?.close(); }
  }
  out.errors = Object.entries(out.engines).flatMap(([n, e]) => (e.error ? [`${n}: ${e.error}`] : e.errors.map((x) => `${n}: ${x}`)));
  out.pass = !out.errors.length;
  say(out);
  return out;
}
/** The check's line, as the hour's board has it after Ready. */
export const wgslLine = (W) => (!W ? 'WGSL: not checked.' : W.error ? `**WGSL: not checked**: ${W.error}.`
  : `${W.pass ? 'WGSL: every module compiles' : `**WGSL: ${W.errors.length} error${W.errors.length === 1 ? '' : 's'}**`} on the device (${W.modules.render} render and ${W.modules.compute} compute pipelines the smoke builds; ${Object.entries(W.engines).map(([n, e]) => (e.error ? `${n}: ${e.error}` : `${n} on ${e.adapter}: ${e.modules} modules, ${e.pipelines} pipelines`)).join('; ')})${W.pass ? '.' : `: ${W.errors.slice(0, 3).join(' | ')}${W.errors.length > 3 ? ` (and ${W.errors.length - 3} more)` : ''}`}`);
const say = (W) => { console.log(`wgsl: ${wgslLine(W).replace(/\*\*/g, '')}`); for (const e of (W.errors ?? []).slice(3, 40)) console.log(`  ${e}`); };
