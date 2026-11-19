// The WGSL check (intent 0038): every shader module the smoke builds (tools/smoke.js --wgsl, on the CPU: the world's
// and the library's, as the game builds them), compiled on this machine's GPU in a blank page of each engine the game
// runs in, Chrome (Tint) and WebKit (its own compiler), no game loaded: each module's errors (getCompilationInfo), and
// every pipeline made of them, its bind groups laid out as its WGSL declares them (as three lays out the game's: an
// inferred layout takes a depth texture's sampler for a filtering one, which no pipeline of the game's is) and, a
// render one, the vertex inputs and colour targets it declares and a depth buffer. Smoke builds the text; only a device says whether it compiles (2026-11-19: 16 of
// smoke's modules did not, written atan(y, x) for want of the stand-in's coordinate system, #215). A minute, little
// memory, nothing of the game's: it runs where the machine is too short for a measure.
//
// And what each costs (the master, 2026-11-19: single pipelines took seconds to compile, and the start waited minutes
// for them): every pipeline's WGSL bytes, its modules' compile and its own making, ms, one at a time, in each engine;
// the worst of all the smoke builds, and the first view's total (its own programs, as the game made them before its
// first frame showed: the hour's device run, tools/gate/device.js; firstView), against their ceilings
// (tools/gate/shaders.json: set from main's run with --ratchet, only ever lowered). A driver
// keeps what it compiled from run to run (a Mac's Metal cache: a second run here took a tenth of the first), so a set
// measured again would read the cache: each set is marked (a private variable its entry point writes, which no compiler
// leaves out, so the driver's source is new), measured once cold, and its numbers kept (.gate/wgsl/) for every run of
// that set after; where the machine was short of memory or swapped (tools/gate/machine.js), it is marked anew and
// measured again next time.
//
//   tools/gate.js wgsl (exit 1 on any error), the hour's first line after Ready, and before a push where asked
//   (git config gate.wgsl true: .githooks/pre-push; where a run holds the GPU, the push says so and goes on).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { webkitAt } from '../browsers.js';
import { watched } from './machine.js';

const KEPT = new URL('../../.gate/wgsl/', import.meta.url).pathname, CEILINGS = new URL('./shaders.json', import.meta.url).pathname;
const ENGINES = { chrome: () => chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] }), webkit: () => webkit.launch({ headless: true, ...webkitAt() }) };

/** Every module the smoke builds, by running it (its own process: the world made on the stand-in): { render: [{ label,
    vertex, fragment }], compute: [{ label, code }] }, or { error } where the smoke did not get so far. */
function built() {
  const dir = mkdtempSync(join(tmpdir(), 'gate-wgsl-')), f = join(dir, 'wgsl.json');
  try {
    const r = spawnSync('bun', ['tools/smoke.js', '--full', '--wgsl', f],   // (--full: what grows after it is made too, the characters', tools/unbuilt.json full)
      { cwd: new URL('../..', import.meta.url).pathname, encoding: 'utf8', maxBuffer: 1 << 26 });
    try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return { error: `the smoke kept no modules: ${(r.stdout + r.stderr).trim().split('\n').slice(-3).join(' · ')}` }; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** In the page: every module compiled on the adapter's device (all its features and limits asked, as the game asks
    them), its errors said with where; every pipeline made. { adapter, modules, pipelines, errors }. */
async function compileAll(S) {
  const adapter = (await navigator.gpu?.requestAdapter()) ?? (await navigator.gpu?.requestAdapter({ forceFallbackAdapter: true }));   // (a CPU's where there is no GPU: CI's, SwiftShader)
  if (!adapter) return { error: 'no WebGPU adapter' };
  const requiredLimits = {}; for (const k in adapter.limits) requiredLimits[k] = adapter.limits[k];
  const device = await adapter.requestDevice({ requiredFeatures: [...adapter.features], requiredLimits });
  const errors = [], info = adapter.info ?? {}, out = { adapter: [...new Set([info.vendor, info.architecture, info.device].filter(Boolean))].join(' ') || 'an adapter', modules: 0, pipelines: 0, errors, ms: [] };
  const said = (label, what, m) => errors.push(`${label}, ${what}: ${m.replace(/\s*\n\s*/g, ' ').slice(0, 400)}`);
  let took = 0;   // (the module compiles of the pipeline being made, ms)
  const mod = async (code, label, what) => {
    const t = performance.now(), m = device.createShaderModule({ code }), I = await m.getCompilationInfo(); took += performance.now() - t; out.modules++;
    for (const x of I.messages) if (x.type === 'error') said(label, what, `${x.lineNum}:${x.linePos} ${x.message} (\`${code.split('\n')[x.lineNum - 1]?.trim().slice(0, 120) ?? ''}\`)`);
    return I.messages.some((x) => x.type === 'error') ? null : m;
  };
  const made = async (label, what, make) => {
    device.pushErrorScope('validation');
    const t = performance.now();
    try { await make(); out.pipelines++; } catch (e) { said(label, what, String(e?.message ?? e)); }
    const ms = performance.now() - t, v = await device.popErrorScope(); if (v) said(label, `${what}, validation`, v.message);
    return ms;
  };
  // (each pipeline's cost, in the smoke's order, compute first: its modules' compile and its own making, ms)
  const cost = (pipeline) => { out.ms.push([+took.toFixed(1), pipeline == null ? null : +pipeline.toFixed(1)]); took = 0; };
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
  const pipes = S.pipelines !== false;   // (pipelines: false, the modules only: a CPU adapter's limits are not the game's devices')
  // (a render pipeline: its vertex buffers, one an input its vertex stage declares, and its colour targets, one an output
  // its fragment stage declares, made with its modules)
  const renderPipeline = (s, vm, fm) => {
    const inputs = fields(s.vertex.match(/@vertex\s*fn main\(([\s\S]*?)\)\s*->/)?.[1] ?? '').map(([, at, t]) => [+at, vertexFormat(t)]).filter(([, f]) => f);
    const buffers = inputs.map(([at, format]) => ({ arrayStride: bytes(format), attributes: [{ shaderLocation: at, offset: 0, format }] }));
    const ret = s.fragment.match(/@fragment\s*fn main\([\s\S]*?\)\s*->\s*(@location\(\s*0\s*\)\s*)?([\w<>]+)/), outs = [];
    if (ret?.[1]) outs[0] = ret[2];
    else if (ret) for (const [, at, t] of fields(s.fragment.match(new RegExp(`struct ${ret[2]}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? '')) outs[+at] = t;
    return made(s.label, 'render pipeline', () => device.createRenderPipelineAsync({ layout: layoutOf([[s.vertex, 'vertex'], [s.fragment, 'fragment']]), vertex: { module: vm, entryPoint: 'main', buffers },
      fragment: { module: fm, entryPoint: 'main', targets: Array.from(outs, (t) => (t ? { format: target(t) } : null)) }, depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' } }));
  };
  for (const s of S.compute) { const m = await mod(s.code, s.label, 'compute'); if (pipes) cost(m ? await made(s.label, 'compute pipeline', () => device.createComputePipelineAsync({ layout: layoutOf([[s.code, 'compute']]), compute: { module: m, entryPoint: 'main' } })) : null); }
  for (const s of S.render) { const vm = await mod(s.vertex, s.label, 'vertex'), fm = await mod(s.fragment, s.label, 'fragment'); if (pipes) cost(vm && fm ? await renderPipeline(s, vm, fm) : null); }
  device.destroy();
  return out;
}

/** A module's WGSL marked (above): `n` written by its entry point, which no compiler leaves out, so the driver's source
    is new and compiled anew. Whole in itself: a page is handed it too (tools/gate/device.js, a cold start's shaders). */
export const mark = (code, n) => code.replace(/(@(?:vertex|fragment|compute)\b[^{]*?\bfn\s+main\s*\([^{]*\{)/, `var<private> gate_mark: u32 = ${n}u;\n$1\n  gate_mark += 1u;`);
/** The modules marked (mark), so the driver compiles the set anew. */
const markedOf = (S, n) => {
  const m = (code) => mark(code, n);
  return { compute: S.compute.map((c) => ({ ...c, code: m(c.code) })), render: S.render.map((r) => ({ ...r, vertex: m(r.vertex), fragment: m(r.fragment) })) };
};
const hashOf = (...x) => createHash('sha1').update(x.join('\0')).digest('hex');
/** One engine's run on a CPU adapter (--cpu: CI's, SwiftShader): the modules compiled, nothing timed nor kept. */
async function plain(name, launch, S) {
  let b = null;
  try { b = await launch(); const page = await opened(b); return await page.evaluate(compileAll, { ...S, pipelines: false }); }
  catch (e) { return { error: String(e?.message ?? e).split('\n')[0] }; }
  finally { await b?.close(); }
}
/** A blank page of a secure origin (WebGPU's) in browser b, a context of its own (WebKit's default one has no adapter). */
const opened = async (b) => { const page = await (await b.newContext()).newPage(); await page.route('https://wgsl.gate/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>wgsl</title>' })); await page.goto('https://wgsl.gate/'); return page; };
/** One engine's run: its result kept for this set and this browser where measured; else the set marked anew (its
    attempt), compiled and timed (compileAll), the machine watched. */
async function engine(name, launch, S, set) {
  let b = null;
  try {
    b = await launch();
    const file = `${KEPT}${set.slice(0, 16)}-${name}-${b.version()}.json`, kept = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    if (kept?.result && !kept.result.notMeasured && !kept.result.error) return { ...kept.result, kept: true };   // (a run that did not come to the shaders is never kept as the set's)
    const attempt = (kept?.attempt ?? 0) + 1, mark = parseInt(hashOf(set, attempt).slice(0, 8), 16);
    const page = await opened(b), result = await watched(() => page.evaluate(compileAll, markedOf(S, mark)));
    mkdirSync(KEPT, { recursive: true }); writeFileSync(file, JSON.stringify({ attempt, result }));
    return result;
  } catch (e) { return { error: String(e?.message ?? e).split('\n')[0] }; }
  finally { await b?.close(); }
}
/** A set's pipelines (S: render and compute, each with its label), one row each: label, kind, bytes. */
const rowsOf = (S) => [...S.compute.map((c) => ({ label: c.label, kind: 'compute', bytes: Buffer.byteLength(c.code) })), ...S.render.map((r) => ({ label: r.label, kind: 'render', bytes: Buffer.byteLength(r.vertex) + Buffer.byteLength(r.fragment) }))];
const codesOf = (S) => [...S.compute.map((c) => c.code), ...S.render.flatMap((r) => [r.vertex, r.fragment])];
/** The check: the smoke's modules, compiled and timed in each engine (above). { modules (render, compute: how many the
    smoke built), engines: { chrome, webkit: { adapter, modules, pipelines, errors, ms, host, notMeasured, kept } or
    { error } }, list (each pipeline: label, kind, bytes, ms by engine), cost (by engine: the worst pipeline against its
    ceiling, and the whole), errors, pass }; and, not kept with it, names (each program's code: the smoke's name for it,
    firstView's). opt.ratchet: the ceiling lowered to what was measured (main's run). */
export async function wgsl(opt = {}) {
  const W = ON[opt.cpu ? 'cpu' : 'gpu'], S = W.modules(opt);
  if (S.error) { const out = { error: S.error, pass: false }; say(out); return out; }
  const out = { modules: { render: S.render.length, compute: S.compute.length }, engines: {}, list: rowsOf(S) }, set = hashOf(...codesOf(S));
  for (const [name, launch] of Object.entries(W.engines)) out.engines[name] = await W.run(name, launch, S, set);
  out.errors = Object.entries(out.engines).flatMap(([n, e]) => (e.errors ?? []).map((x) => `${n}: ${x}`));   // (what the shaders got wrong: it fails)
  out.unchecked = Object.entries(out.engines).filter(([, e]) => e.error).map(([n, e]) => `${n}: ${e.error}`);   // (an engine that did not come to them, no adapter, say: said, it fails nothing)
  out.pass = !out.errors.length;
  out.cost = W.cost(out, opt);
  Object.defineProperty(out, 'names', { value: new Map([...S.compute.map((c) => [c.code, c.label]), ...S.render.map((r) => [`${r.vertex}\0${r.fragment}`, r.label])]) });
  say(out);
  return out;
}
/** Where the modules come from and how they are compiled: on this machine's GPU, the smoke run --full, each engine,
    timed cold (marked, kept); or, --cpu, CI's, in Chrome on its CPU adapter (SwiftShader), the modules CI's smoke kept
    (--from), compiled only: what Chrome's compiler, Tint, refuses fails a pull request, not the hour (2026-11-19: a
    float level on a depth texture), and nothing timed, a CPU's times not being a GPU's. */
const ON = {
  gpu: { modules: () => built(), engines: ENGINES, run: engine, cost: (out, opt) => held('worst', costs(out.list, out.engines), (c) => c.worst?.ms, opt.ratchet) },
  cpu: { modules: (opt) => JSON.parse(readFileSync(opt.from, 'utf8')), engines: { chrome: () => chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'] }) }, run: plain, cost: () => ({}) },
};
/** The first view's own programs (P: as the game made them before its first frame showed, tools/gate/device.js
    programs), compiled and timed cold in each engine as the smoke's are, each named as the smoke names it where its code
    is the smoke's (W.names). { shown, made (pipelines asked before the first frame), programs, smoke's (of them, the
    smoke's own code), engines, list, cost (by engine: the total against its ceiling, and the worst) }, or null. */
export async function firstView(P, W, opt = {}) {
  if (!P || !(P.render.length + P.compute.length)) return null;
  const names = W?.names ?? new Map(), as = (k, label) => names.get(k) ?? `as the game labels it: ${label || 'unlabelled'}`;
  const S = { compute: P.compute.map((c) => ({ ...c, label: as(c.code, c.label) })), render: P.render.map((r) => ({ ...r, label: as(`${r.vertex}\0${r.fragment}`, r.label) })) };
  const out = { shown: P.shown, made: P.made, programs: { render: S.render.length, compute: S.compute.length }, smokes: [...P.compute.map((c) => c.code), ...P.render.map((r) => `${r.vertex}\0${r.fragment}`)].filter((k) => names.has(k)).length, engines: {}, list: rowsOf(S) };
  const set = hashOf('the first view', ...codesOf(S));
  for (const [name, launch] of Object.entries(ENGINES)) out.engines[name] = await engine(name, launch, S, set);
  out.cost = held('firstView', costs(out.list, out.engines), (c) => c.total, opt.ratchet);
  console.log(`  ${firstLine(out).replace(/\*\*/g, '')}`);
  return out;
}
/** Each pipeline's cost by engine (its modules' compile and its making, ms, kept on its row), and each engine's worst
    and total. */
function costs(list, engines) {
  const cost = {};
  for (const [n, e] of Object.entries(engines)) {
    if (!e.ms) continue;
    list.forEach((x, i) => { const [m, p] = e.ms[i] ?? []; (x.ms ??= {})[n] = p == null ? null : Math.round(m + p); });
    const timed = list.filter((x) => x.ms[n] != null), worst = timed.reduce((w, x) => (x.ms[n] > (w?.ms[n] ?? -1) ? x : w), null);
    cost[n] = { worst: worst && { label: worst.label, ms: worst.ms[n] }, total: timed.reduce((t, x) => t + x.ms[n], 0), notMeasured: e.notMeasured ?? null };
  }
  return cost;
}
/** Each engine's `key` (worst: the costliest pipeline of all the smoke builds; firstView: the first view's total, ms,
    value(cost)) against its ceiling (tools/gate/shaders.json), over where it is past it; lowered to what was measured
    with ratchet (main's run), never raised. */
function held(key, cost, value, ratchet) {
  const C = existsSync(CEILINGS) ? JSON.parse(readFileSync(CEILINGS, 'utf8')) : {};
  for (const [n, c] of Object.entries(cost)) {
    const v = value(c), ceiling = C[n]?.[key] ?? null;
    Object.assign(c, { ceiling, over: !c.notMeasured && ceiling != null && v > ceiling });
    if (ratchet && !c.notMeasured && v != null) (C[n] ??= {})[key] = Math.min(ceiling ?? Infinity, v);
  }
  if (ratchet) writeFileSync(CEILINGS, JSON.stringify({ ...C, measured: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim() }, null, 1) + '\n');
  return cost;
}
const against = (c, v, unit) => (c.notMeasured ? ` (**not measured**: ${c.notMeasured})` : c.ceiling == null ? ' (no ceiling yet)' : c.over ? ` (**over its ceiling, ${unit(c.ceiling)}**)` : ` (ceiling ${unit(c.ceiling)})`);
const secs = (ms) => `${(ms / 1e3).toFixed(1)} s`, ms = (v) => `${v} ms`;
/** The costs' line: each engine's costliest pipeline of all the smoke builds, against its ceiling. */
export const costLine = (W) => (!W?.cost || !Object.keys(W.cost).length ? 'Shader cost: not timed.' : `Shader cost (each pipeline's compile and making, one at a time, cold): ${Object.entries(W.cost).map(([n, c]) => `${n}: the worst ${c.worst?.ms} ms (${c.worst?.label})${against(c, c.worst?.ms, ms)}, every pipeline the smoke builds ${secs(c.total)}`).join('; ')}.`);
/** The first view's line: its own programs, how many the smoke builds as they are, and each engine's total against its
    ceiling. */
export const firstLine = (F) => (!F ? "The first view's shaders: not timed (no game came to give them)." : `The first view's shaders${F.shown ? '' : ' (**the first frame never showed: every program made in the run**)'}: ${F.made} pipelines asked, ${F.programs.render + F.programs.compute} programs (${F.programs.render} render, ${F.programs.compute} compute; ${F.smokes} of them the smoke's code), cold one at a time: ${Object.entries(F.cost ?? {}).map(([n, c]) => `${n} ${secs(c.total)}${against(c, c.total, secs)}, the worst ${c.worst?.ms} ms (${c.worst?.label})`).join('; ')}.`);
/** The hour's board's WGSL lines, after Ready: whether every module compiles, what they cost, and the first view's. */
export const wgslLines = (W, F) => [wgslLine(W), costLine(W), firstLine(F)];
/** The board's table of the costliest pipelines (the first view's, where it was timed; else the smoke's), with its heading. */
export const costBlock = (W, F) => { const T = F?.cost ? F : W?.cost ? W : null; return T ? ['', `The costliest pipelines${T === F ? ' of the first view' : ' the smoke builds'}, each compiled and made one at a time, cold (tools/gate/wgsl.js):`, '', ...costTable(T), ''] : []; };
/** The most costly pipelines of a timed set, n of them, as a table: KB, and ms in each engine. */
export const costTable = (T, n = 20) => (!T?.cost || !Object.keys(T.cost).length ? [] : ['| Pipeline (where it is made) | KB | ' + Object.keys(T.cost).map((e) => `${e} ms`).join(' | ') + ' |', '| --- | --- | ' + Object.keys(T.cost).map(() => '---').join(' | ') + ' |',
  ...T.list.filter((x) => x.ms).sort((a, b) => Math.max(...Object.values(b.ms).map((v) => v ?? 0)) - Math.max(...Object.values(a.ms).map((v) => v ?? 0))).slice(0, n).map((x) => `| ${x.label} | ${(x.bytes / 1024).toFixed(0)} | ${Object.keys(T.cost).map((e) => x.ms[e] ?? '–').join(' | ')} |`)]);
/** The check's line, as the hour's board has it after Ready. */
export const wgslLine = (W) => (!W ? 'WGSL: not checked.' : W.error ? `**WGSL: not checked**: ${W.error}.`
  : `${W.pass ? 'WGSL: every module compiles' : `**WGSL: ${W.errors.length} error${W.errors.length === 1 ? '' : 's'}**`}${W.unchecked?.length ? ` (**not checked** in ${W.unchecked.join('; ')})` : ''} on the device (${W.modules.render} render and ${W.modules.compute} compute pipelines the smoke builds; ${Object.entries(W.engines).map(([n, e]) => (e.error ? `${n}: ${e.error}` : `${n} on ${e.adapter}: ${e.modules} modules, ${e.pipelines} pipelines`)).join('; ')})${W.pass ? '.' : `: ${W.errors.slice(0, 3).join(' | ')}${W.errors.length > 3 ? ` (and ${W.errors.length - 3} more)` : ''}`}`);
const say = (W) => { console.log(`wgsl: ${wgslLine(W).replace(/\*\*/g, '')}`); for (const e of (W.errors ?? []).slice(3, 40)) console.log(`  ${e}`); console.log(`  ${costLine(W).replace(/\*\*/g, '')}`); for (const l of costTable(W, 10)) console.log(`  ${l}`); };
