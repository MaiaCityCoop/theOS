// The 10 % gate as one report (intent 0038; the intents skill, "Define: the 10 % gate"): a run of the gate against a
// stored one, the base (the train's numbers on main), measure by measure: here, the base, the change, and whether it is
// the skill's 10 % better. It reads what tools/gate.js kept and measures nothing again, so it needs no GPU.
//
//   bun tools/gate/ten.js --base <run> [--here <run>] [--again <run>] [--json]
//
// A run is what the gate kept of one code, under its tag (the commit, unless the run was given another):
// .gate/<tag>/summary.json (gate.js all: the FLIP against its own truth, the bench, the compile, the paths), and beside
// it where they were run .gate/<tag>-vs-<tag>-truth/report.json (gate.js diff, where there is no summary),
// .gate/<tag>/real.json (gate.js real <tag>) and .gate/motion-<tag>/report.json (gate.js motion). <run>: a tag, a
// summary.json (or the folder that holds it), or a git ref (its commit's tag). --here: by default this code's tag; with
// no summary, the last single runs in .gate/ (bench.json, compile.json, paths.json, real.json).
//
// The measures are the skill's, and lower is better in each:
//   smoke          the GPU smoke's: the world settled at each view posed, turned about and walked on; its WebGPU
//                  errors
//   rendering      the bench's GPU ms a frame per view and per part; each path's p99 frame in motion and its frames
//                  over 16.7 ms, cold and warm
//   startup        the first frame that draws the world and the bytes loaded before it (the game's mark,
//                  src/core/marks.js), and the world settled where it starts, cold and warm
//   boot and load  the WGSL compiled until the world settled
//   memory         the browser's peak; each class's GPU memory, the most of any view
//   quality        FLIP against the run's own truth per view (its mean and p99 tile); each view class's distances to
//                  the photos; each path's worst pop
//
// It fails (exit 1) where a measure got worse by more than its noise: what two runs of the same code differ by, as the
// gate measured it, the larger where two say. --again: the base's code run again (every measure); and the gate's own:
// the bench's --twice (tools/gate/ceilings.json: a class's noise; a view's frame, the sum of its parts'), `gate.js noise
// <tag>` (<tag>-a-vs-<tag>-b: each view's FLIP floor) and `motion --floor` (motion-<tag>-floor: each path's). A measure
// with no noise measured is shown, never judged. The 10 % is the skill's own ("Define: the N % gate"): this tool holds no
// number of its own.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';

const GAME = resolve(import.meta.dirname, '../..'), OUT = join(GAME, '.gate/'), SKILL = resolve(GAME, '../.claude/skills/intents/SKILL.md');
const fail = (why) => { console.error(`ten: ${why}`); process.exit(1); };
const read = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
const git = (...args) => { try { return execFileSync('git', args, { cwd: GAME, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const ARGS = process.argv.slice(2), valueOf = (k) => (ARGS.includes(k) ? ARGS[ARGS.indexOf(k) + 1] ?? fail(`${k} wants a run`) : undefined);
/** How much better the skill asks each measure to be (its "## Define: the N % gate"), a share. */
const SHARE = +((existsSync(SKILL) ? readFileSync(SKILL, 'utf8') : '').match(/^## Define: the (\d+(?:\.\d+)?) % gate/m) ?? fail(`${SKILL} names no "Define: the N % gate"`))[1] / 100;

// ---- a run, as the gate kept it ----
/** This code's tag, as the gate names a run of it (tools/gate.js commit()). */
const own = () => (git('rev-parse', '--short', 'HEAD') ?? 'nogit') + (git('status', '--porcelain') ? '-dirty' : '');
/** Where a run is: the folder the gate kept it in, its tag, and its summary.json. what: a tag, a summary.json or the
    folder of one, or a git ref (its commit's tag); loose: a tag even with no summary (this code's). */
function placeOf(what, loose) {
  const file = [what, join(what, 'summary.json')].find((f) => existsSync(f) && statSync(f).isFile());
  if (file) return { at: `${dirname(dirname(resolve(file)))}/`, tag: basename(dirname(resolve(file))), file };
  const tag = existsSync(`${OUT}${what}`) || loose ? what : git('rev-parse', '--short', what) ?? fail(`no run ${what}: no tag in .gate/, no summary.json, no commit`);
  return { at: OUT, tag, file: `${OUT}${tag}/summary.json` };
}
/** A run of the gate (placeOf), what the gate kept of it. loose: with no summary, the last single runs in .gate/. */
export function runOf(what, loose = false) {
  const { at, tag, file } = placeOf(what, loose), S = read(file), kept = (f) => read(`${at}${f}`), last = (name) => (S || !loose ? null : kept(`${name}.json`));
  return { tag: S?.tag ?? tag, flip: S?.flip ?? kept(`${tag}-vs-${tag}-truth/report.json`), bench: S?.bench ?? last('bench'), compile: S?.compile ?? last('compile'), smoke: S?.smoke ?? null, paths: S?.paths ?? last('paths'),
    real: kept(`${tag}/real.json`) ?? last('real'), motion: kept(`motion-${tag}/report.json`), floor: { flip: kept(`${tag}-a-vs-${tag}-b/report.json`), motion: kept(`motion-${tag}-floor/report.json`) } };
}

// ---- its measures ----
const caches = (P) => ['cold', 'warm'].filter((c) => P?.[c]).map((c) => [c, P[c]]);
const benchOf = (B) => Object.keys({ ...B?.views, ...B?.classes }).flatMap((v) => [[`GPU ms a frame, ${v}`, 'ms', B.views?.[v]], ...Object.entries(B.classes?.[v] ?? {}).map(([part, ms]) => [`GPU ms a frame, ${v}, ${part}`, 'ms', ms])]);
const motionOf = (P) => caches(P).flatMap(([c, C]) => Object.entries(C.paths ?? {}).flatMap(([p, r]) => [[`the p99 frame in motion, ${p}, ${c}`, 'ms', r.frame?.p99], [`frames over 16.7 ms, ${p}, ${c}`, 'frames', r.frame?.over]]));
function gpuMemoryOf(B) {
  const M = Object.values(B?.memory ?? {}).filter(Boolean);
  return [...new Set(M.flatMap((m) => Object.keys(m.classes ?? {})))].map((c) => [`GPU memory, ${c}, the most of any view`, 'MB', Math.max(...M.map((m) => m.classes?.[c]?.gpu ?? -Infinity))]);
}
const flipOf = (F) => Object.entries(F?.views ?? {}).flatMap(([v, r]) => [[`FLIP against its truth, ${v}, mean`, '', r.mean], [`FLIP against its truth, ${v}, p99 tile`, '', r.p99]]);
const classesOf = (Q) => (Q?.groups ?? []).filter((g) => g.name === 'all' || g.name.startsWith('kind '));   // (the view classes: the kinds, and all of them; tools/gate/real.js)
const realOf = (Q) => classesOf(Q).flatMap((g) => Object.entries({ CMMD: g.cmmd, ...g.stats?.diff }).map(([k, x]) => [`real, ${g.name.replace(/^kind /, '')}, ${k}`, '', x == null ? null : Math.abs(x)]));
const popsOf = (M) => Object.entries(M?.paths ?? {}).map(([p, r]) => [`the worst pop in motion, ${p}`, '', r.worst?.value]);
const KINDS = {   // the skill's measures, each read from a run as [name, unit, value]
  smoke: (R) => [...Object.entries(R.smoke?.views ?? {}).flatMap(([v, m]) => ['posed', 'turned', 'walked'].map((k) => [`the world settled, ${v}, ${k}`, 's', m[k] / 1e3])), ['WebGPU errors in the smoke', 'errors', R.smoke?.errors?.length]],
  rendering: (R) => [...benchOf(R.bench), ...motionOf(R.paths)],
  startup: (R) => caches(R.paths).flatMap(([c, C]) => [[`the first frame that draws the world, ${c}`, 's', C.first?.ms / 1e3], [`bytes loaded before the first frame, ${c}`, 'MB', C.first?.bytes / 1e6], [`the world settled where it starts, ${c}`, 's', C.start?.ms / 1e3]]),
  'boot and load': (R) => [['the WGSL compiled until the world settled', 'MB', R.compile?.bytes / 1e6]],
  memory: (R) => [["the browser's peak", 'GB', R.paths?.peak / 1e9], ...gpuMemoryOf(R.bench)],
  quality: (R) => [...flipOf(R.flip), ...realOf(R.real), ...popsOf(R.motion)],
};
/** A run's measures, in the order the report shows them: { kind, name, unit, value }. */
const measures = (R) => Object.entries(KINDS).flatMap(([kind, of]) => of(R).filter(([, , v]) => Number.isFinite(v)).map(([name, unit, value]) => ({ kind, name, unit, value })));

// ---- noise, and the comparison ----
/** A bench as the noise its --twice kept (ceilings.json noise.classes: each class's ms): a part's its own, a view's frame the sum of its
    parts' where every one has one. */
function twice(B, noise) {
  if (!B?.classes || !noise) return null;
  const views = {}, classes = {};
  for (const [v, parts] of Object.entries(B.classes)) {
    classes[v] = Object.fromEntries(Object.keys(parts).filter((p) => noise[p] != null).map((p) => [p, noise[p]]));
    if (Object.keys(parts).every((p) => noise[p] != null)) views[v] = Object.values(classes[v]).reduce((s, x) => s + x, 0);
  }
  return { views, classes };
}
/** Each measure's noise, by its name: what two runs of the same code differ by, as the gate measured it (the larger where
    two say): the gate's own floors of the runs, and --again against the base. */
function noiseOf(runs, again) {
  const N = new Map(), put = (list) => { for (const m of list) N.set(m.name, Math.max(N.get(m.name) ?? 0, m.value)); };
  const C = read(join(import.meta.dirname, 'ceilings.json'));
  for (const R of runs) put(measures({ bench: twice(R.bench, C?.noise?.classes), flip: R.floor.flip, motion: R.floor.motion }));
  const A = new Map(again ? measures(again).map((m) => [m.name, m.value]) : []);
  put(measures(runs[0]).filter((m) => A.has(m.name)).map((m) => ({ ...m, value: Math.abs(m.value - A.get(m.name)) })));
  return N;
}
/** Every measure of either run: here, the base, the change, its noise, whether it is the skill's share better, and
    whether it got worse by more than its noise. */
function compare(here, base, N) {
  const H = new Map(here.map((m) => [m.name, m])), B = new Map(base.map((m) => [m.name, m])), order = Object.keys(KINDS);
  return [...here, ...base.filter((m) => !H.has(m.name))].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).map((m) => {
    const h = H.get(m.name)?.value ?? null, b = B.get(m.name)?.value ?? null, noise = N.get(m.name) ?? null, both = h != null && b != null;
    return { ...m, value: undefined, here: h, base: b, noise, change: both ? h - b : null, better: both && b > 0 ? (b - h) / b >= SHARE : null, worse: both && noise != null && h - b > noise };
  });
}

// ---- the table ----
const pct = `${+(SHARE * 100).toFixed(2)} %`;
const fmt = (v, unit) => (v == null ? '–' : `${v.toFixed({ ms: 2, s: 1, MB: 1, GB: 2, frames: 0, errors: 0 }[unit] ?? 4)}${unit && unit !== 'frames' ? ` ${unit}` : ''}`);
const signed = (x, unit) => (x > 0 ? '+' : x < 0 ? '−' : '±') + fmt(Math.abs(x), unit);
const changed = (r) => (r.change == null ? '–' : r.base ? `${r.change > 0 ? '+' : r.change < 0 ? '−' : '±'}${Math.abs((100 * r.change) / r.base).toFixed(1)} %` : signed(r.change, r.unit));
const verdict = (r) => (r.worse ? 'worse' : r.better == null ? '–' : r.better ? 'yes' : 'no');
function table({ here, base, rows, worse }) {
  const out = [`The ${pct} gate · here ${here} against the base ${base} · .gate/ten.json`, '', `| Measure | Here | Base | Change | ≥ ${pct}? |`, '| --- | --- | --- | --- | --- |'];
  for (const kind of Object.keys(KINDS)) {
    const R = rows.filter((r) => r.kind === kind);
    if (R.length) out.push(`| **${kind}** | | | | |`, ...R.map((r) => `| ${r.name} | ${fmt(r.here, r.unit)} | ${fmt(r.base, r.unit)} | ${changed(r)} | ${verdict(r)} |`));
  }
  const both = rows.filter((r) => r.change != null), blind = both.filter((r) => r.noise == null);
  out.push('', `${both.filter((r) => r.better).length} of ${both.length} measures ${pct} better or more; ${n(worse.length, 'measure')} worse by more than ${worse.length === 1 ? 'its' : 'their'} noise.`);
  if (worse.length) out.push('Worse than the base:', ...worse.map((r) => `  ${r.kind}, ${r.name}: ${fmt(r.base, r.unit)} → ${fmt(r.here, r.unit)} (${signed(r.change, r.unit)}; its noise ${fmt(r.noise, r.unit)})`));
  if (blind.length) out.push(`Not judged, no noise measured: ${n(blind.length, 'measure')} (the gate's noise: bench --twice, gate.js noise <tag>, motion --floor; every measure's: --again, the base run twice).`);
  return out.join('\n');
}
function n(k, word) { return `${k} ${word}${k === 1 ? '' : 's'}`; }

// ---- the run ----
/** Two runs of the gate (runOf) held against each other, measure by measure: the report, and its table (text); null
    where either kept nothing to measure. again: the base run twice, for every measure's noise. */
export function held(here, base, again = null) {
  const H = measures(here), B = measures(base);
  if (!H.length || !B.length) return null;
  const rows = compare(H, B, noiseOf([base, here], again)), report = { here: here.tag, base: base.tag, again: again?.tag ?? null, share: SHARE, when: new Date().toISOString(), rows, worse: rows.filter((r) => r.worse) };
  return { ...report, text: table(report) };
}
if (import.meta.main) {
  const base = runOf(valueOf('--base') ?? fail('--base <run>: the stored run to hold this one against (the train\'s numbers on main)'));
  const here = runOf(valueOf('--here') ?? own(), true), again = valueOf('--again') && runOf(valueOf('--again'));
  const { text, ...report } = held(here, base, again) ?? fail(`the gate kept nothing to measure of ${here.tag} or ${base.tag}`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}ten.json`, JSON.stringify(report, null, 1) + '\n');
  console.log(ARGS.includes('--json') ? JSON.stringify(report, null, 1) : text);
  process.exitCode = report.worse.length ? 1 : 0;
}
