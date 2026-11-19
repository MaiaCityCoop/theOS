// The frame's budget as the hour's rule (intent 0038: 60 fps, FRAME_MS a frame at OUTPUT, on the Mac mini's M2): every
// bench view's GPU time held pass by pass and class by class (tools/bench.js: each ?gputime pass under the class its name
// is in, src/core/classes.js):
// - each pass of each view against a ceiling of its own, set from main's measure and only ever lowered (--ratchet: the
//   hour's on main). No pass has a number of its own by hand, so a pass that rises names itself;
// - each class's sum against its share of the frame (src/core/budget.js FRAME_MS_BY_CLASS, the one split of it): a
//   class within its share is held to it, one over it to the least it has been measured at (lowered as it comes down,
//   never below its share), and the board says by how much it is over its share: its owner's next piece.
// A part is over where it rose past its ceiling by more than the noise between two runs of the same code (--twice: the
// hour's own; else the noise kept with the ceilings). It is judged by the lower of its two runs, and a ceiling is lowered
// only to the higher, so neither a run's luck sets a ceiling nor its bad luck fails one. A part with no ceiling (a new
// pass or view, till the next ratchet) or no noise measured is shown, never judged: no number stands in for one. Binding
// at the hour (tools/gate.js hourly fails over), never at a merge (ship-first: CI has no GPU).
//
// ceilings.json, beside this: { about, measured (the commit and the output they were last lowered from), noise:
// { passes, classes: { name: ms } }, views: { view: { passes: { pass: ms }, classes: { class: ms } } } }.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { FRAME_MS_BY_CLASS, FRAME_MS, OUTPUT } from '../../src/core/budget.js';

const FILE = new URL('./ceilings.json', import.meta.url).pathname, KINDS = ['passes', 'classes'];
const load = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { measured: null, noise: { passes: {}, classes: {} }, views: {} });
const save = (C) => writeFileSync(FILE, JSON.stringify(C, null, 1) + '\n');
const up = (v) => Math.ceil(v * 100 - 1e-9) / 100;   // (to the hundredth of a ms above)
/** A class's share of the frame (src/core/budget.js): 'other', the slack, for a class it does not name. */
const share = (c) => FRAME_MS_BY_CLASS[c] ?? FRAME_MS_BY_CLASS.other;

/** A bench's parts (tools/gate.js bench: out.passes[view][pass].mean, out.classes[view][class], ms a frame): { view:
    { passes: { pass: ms }, classes: { class: ms } } }; and each pass's class, as the bench put it (in: { view: { pass:
    class } }). */
const partsOf = (out) => Object.fromEntries(Object.entries(out.classes ?? {}).map(([v, classes]) => [v, { passes: Object.fromEntries(Object.entries(out.passes?.[v] ?? {}).map(([k, p]) => [k, p.mean])), classes }]));
const inOf = (out) => Object.fromEntries(Object.entries(out.passes ?? {}).map(([v, P]) => [v, Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.class]))]));
/** One bench, or two of the same code (b), part by part: { low, high (a part's lower and higher run: one bench's are its
    own), noise (each pass's and each class's most any view differed by between the two; null with one) }. */
function pair(a, b) {
  const A = partsOf(a), B = b ? partsOf(b) : A, low = {}, high = {}, noise = b ? { passes: {}, classes: {} } : null;
  for (const [v, P] of Object.entries(A)) for (const kind of KINDS) for (const [k, x] of Object.entries(P[kind])) {
    const y = B[v]?.[kind]?.[k] ?? x;
    ((low[v] ??= { passes: {}, classes: {} })[kind])[k] = Math.min(x, y);
    ((high[v] ??= { passes: {}, classes: {} })[kind])[k] = Math.max(x, y);
    if (noise) noise[kind][k] = Math.max(noise[kind][k] ?? 0, up(Math.abs(x - y)));
  }
  return { low, high, noise };
}

/** Every part of every view (its lower run) against its ceiling and the noise: { rows: [{ view, kind, name, ms, ceiling,
    noise, share (a class's), in (a pass's class), over }], fails, pass }. */
function judge({ low }, C, noise, at = {}) {
  const rows = [], fails = [];
  for (const [view, P] of Object.entries(low)) for (const kind of KINDS) for (const [name, ms] of Object.entries(P[kind])) {
    const ceiling = C.views[view]?.[kind]?.[name] ?? null, n = noise?.[kind]?.[name] ?? null, over = ceiling != null && n != null && ms > ceiling + n;
    rows.push({ view, kind, name, ms, ceiling, noise: n, ...(kind === 'classes' ? { share: share(name) } : { in: at[view]?.[name] }), over });
    if (over) fails.push(`${view}, ${kind === 'classes' ? `the class ${name}` : `the pass ${name}`}: ${ms.toFixed(2)} ms, over its ceiling ${ceiling.toFixed(2)} (+${n.toFixed(2)} noise)`);
  }
  return { rows, fails, pass: !fails.length };
}
/** The ceilings lowered to what was measured (each part's higher run), never raised, a class's never below its share;
    a part with none yet given its first. What was lowered. at: what was measured (a commit). */
function ratchet({ high }, at, C) {
  const lowered = [];
  for (const [view, P] of Object.entries(high)) for (const kind of KINDS) for (const [name, ms] of Object.entries(P[kind])) {
    const was = C.views[view]?.[kind]?.[name], now = kind === 'classes' ? Math.max(share(name), up(ms)) : up(ms);
    if (was == null || now < was) { ((C.views[view] ??= {})[kind] ??= {})[name] = now; if (was != null) lowered.push(`${view}, ${name}: ${was.toFixed(2)} → ${now.toFixed(2)}`); }
  }
  C.measured = `${at}, at ${OUTPUT.width} × ${OUTPUT.height}`;
  return lowered;
}

/** The rule, for tools/gate.js bench and the hour: run() (one bench of every view; twice with opt.twice, the noise
    measured between them), every part judged against its ceiling and printed, the ceilings (and the noise) lowered and
    kept with opt.ratchet (main's hour: at, its commit); a run not measured (tools/gate/machine.js onMachine) is given back
    as it is. The first run's numbers, with { ceilings: judge's, and the noise it was judged with }. */
export async function rule(run, opt, at) {
  const a = await run(), f = (v, n = 2, w = 8) => (v == null ? '–' : v.toFixed(n)).padStart(w);
  if (a.notMeasured) return a;   // (run on a machine short of memory, or one that swapped: neither judged nor kept)
  const b = opt.twice ? await run() : null;
  if (b?.notMeasured) return b;
  const C = load(), P = pair(a, b), noise = P.noise ?? C.noise, J = judge(P, C, noise, inOf(a));
  if (P.noise) console.log(`  the noise between two runs, each class's most over every view (ms): ${Object.entries(P.noise.classes).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}`);
  console.log(`\n  each class and pass against its ceiling (tools/gate/ceilings.json, set from ${C.measured ?? 'nothing yet'}): ms a frame (the lower run), a class's share, its ceiling + noise`);
  for (const r of J.rows) if (r.ms > 0 || r.over) console.log(`  ${`${r.view}, ${r.kind === 'classes' ? r.name : `  ${r.name}`}`.padEnd(44)}${f(r.ms)}${f(r.share, 2, 7)}${f(r.ceiling)} +${r.noise?.toFixed(2) ?? '?'}  ${state(r)}`);
  console.log(`  the frame's rule (no class and no pass of a view past its ceiling and the noise): ${J.pass ? 'met' : 'NOT MET: ' + J.fails.join('; ')}`);
  if (opt.ratchet) { const L = ratchet(P, at, C); if (P.noise) C.noise = P.noise; save(C); console.log(`  the ceilings lowered to what was measured (${at}): ${L.length ? L.join('; ') : 'none (nothing came down)'}`); }
  return { ...a, ceilings: { ...J, noise, measured: C.measured } };
}
/** A row's state, as the rule prints it and the board says it. */
const state = (r) => (r.ceiling == null ? 'no ceiling yet: not judged' : r.noise == null ? 'no noise measured: not judged' : r.over ? 'OVER its ceiling' : r.share == null ? 'within its ceiling' : r.ms > r.share ? `${(r.ms - r.share).toFixed(2)} over its share` : 'within its share');

/** The board's lines of the bench against the frame's rule (J: rule's ceilings, as the hour keeps them): each view's
    classes against their shares and ceilings, each with its passes largest first; what rose past its ceiling; what was
    not judged, and why. */
export function board(J) {
  const rows = (J?.rows ?? []).filter((r) => r.kind), classes = rows.filter((r) => r.kind === 'classes'), passes = rows.filter((r) => r.kind === 'passes');
  if (!classes.length) return ['The bench measured no class (no view settled, or no pass timed): the frame\'s rule not judged.'];
  const of = (r) => passes.filter((p) => p.view === r.view && p.in === r.name && p.ms > 0).sort((x, y) => y.ms - x.ms).map((p) => `${p.name} ${p.ms.toFixed(2)}${p.over ? ' (**over**)' : ''}`).join(', ') || '–';
  const unjudged = passes.filter((r) => r.ceiling == null || r.noise == null);
  return [`The frame by class against its share of ${FRAME_MS} ms (src/core/budget.js FRAME_MS_BY_CLASS) and its ceiling, with each pass in it (tools/gate/ceilings.json, set from ${J.measured ?? 'nothing yet'}); ms a frame, the lower of two runs. The hour fails where a class or a pass rose past its ceiling by more than the noise between the runs:`, '',
    '| View | Class | ms | Share | Over its share | Ceiling + noise | Its passes, largest first (ms) |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...classes.map((r) => `| ${r.view} | ${r.name} | ${r.ms.toFixed(2)} | ${r.share.toFixed(2)} | ${r.ms > r.share ? `**${(r.ms - r.share).toFixed(2)}**` : ''} | ${r.ceiling == null ? '–' : `${r.ceiling.toFixed(2)} + ${r.noise?.toFixed(2) ?? '?'}`}${r.over ? ' **over**' : ''} | ${of(r)} |`), '',
    J.fails.length ? `**Past its ceiling**: ${J.fails.join('; ')}.` : 'No class and no pass rose past its ceiling.',
    ...(unjudged.length ? [`Not judged, no ceiling or noise yet (the next --ratchet gives them theirs): ${unjudged.length} pass${unjudged.length > 1 ? 'es' : ''}, ${unjudged.slice(0, 8).map((r) => `${r.view}, ${r.name}`).join('; ')}${unjudged.length > 8 ? '; …' : ''}.`] : [])];
}
