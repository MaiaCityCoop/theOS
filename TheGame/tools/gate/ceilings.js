// The budget as a merge rule (intent 0038, Define: the budget by the bench's parts): every view's GPU time, part by part
// (tools/bench.js CLASSES), held against a ceiling of its own. A ceiling starts at max(the part's budget, what main
// measured), so nothing merged today fails it; a branch fails where a part of a view costs more than its ceiling and the
// noise between two runs. The nightly run on main lowers each ceiling to what main measures (`bench --ratchet`), never
// raises one, until every part of every view is within its budget. tools/gate.js bench prints the table and exits 1 over
// a ceiling.
//
// ceilings.json, beside this: { measured: where the ceilings were last set from, noise: { part: ms }, views: { view:
// { part: ms } } }. A part a view has no ceiling for (a new view, a new part) is held to its budget.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/** Each part's share of the 12 ms a frame (BUDGET, tools/bench.js), at a 4K output drawn from about 1440p. The upscale's
    is its floor: its bytes alone at a 4K output take about 1.9 ms (#86). 'other', a pass no part names, is the slack. */
export const BUDGETS = { geometry: 5, light: 3, ground: 1.5, 'upscale/post': 2, other: 0.5 };
/** The noise allowed a part until two runs have measured it (`bench --twice`): the larger of this and NOISE_SHARE of its
    ceiling. */
const NOISE_MS = 0.25, NOISE_SHARE = 0.05;
const FILE = new URL('./ceilings.json', import.meta.url).pathname;

export const load = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { measured: null, noise: {}, views: {} });
const save = (C) => writeFileSync(FILE, JSON.stringify(C, null, 1) + '\n');
const up = (v) => Math.ceil(v * 100 - 1e-9) / 100;   // (to the hundredth of a ms above)

/** The ceiling and the noise of a part of a view. */
export function ceilingOf(C, view, part) {
  const c = C.views[view]?.[part] ?? BUDGETS[part] ?? BUDGETS.other;
  return { ceiling: c, noise: C.noise?.[part] ?? Math.max(NOISE_MS, NOISE_SHARE * c) };
}

/** A bench's numbers (tools/gate.js bench: out.classes[view][part], ms a frame) against the ceilings: every part of
    every view, and those over (more than its ceiling and its noise). */
export function judge(out, C = load()) {
  const rows = [], fails = [];
  for (const [view, parts] of Object.entries(out.classes ?? {})) for (const [part, ms] of Object.entries(parts)) {
    const { ceiling, noise } = ceilingOf(C, view, part), over = ms > ceiling + noise;
    rows.push({ view, part, ms, ceiling, noise, budget: BUDGETS[part] ?? BUDGETS.other, over });
    if (over) fails.push(`${view}, ${part}: ${ms.toFixed(2)} ms over its ceiling ${ceiling.toFixed(2)} (+${noise.toFixed(2)})`);
  }
  return { rows, fails, pass: !fails.length };
}

/** The ceilings lowered to what this bench measured (main's, nightly), never raised, never below a part's budget: what
    was lowered. at: what was measured (a commit). */
export function ratchet(out, at, C = load()) {
  const lowered = [];
  for (const [view, parts] of Object.entries(out.classes ?? {})) for (const [part, ms] of Object.entries(parts)) {
    const budget = BUDGETS[part] ?? BUDGETS.other, was = C.views[view]?.[part], now = Math.max(budget, up(ms));
    if (was == null || now < was) { (C.views[view] ||= {})[part] = now; if (was != null) lowered.push(`${view}, ${part}: ${was.toFixed(2)} → ${now.toFixed(2)}`); }
  }
  C.measured = at; save(C);
  return lowered;
}

/** The noise between two runs of the same code: per part, the most any view's time differed (ms), kept in the file. */
export function noise(a, b, C = load()) {
  const n = {};
  for (const [view, parts] of Object.entries(a.classes ?? {})) for (const [part, ms] of Object.entries(parts)) {
    const d = Math.abs(ms - (b.classes?.[view]?.[part] ?? ms)); n[part] = Math.max(n[part] ?? 0, up(d));
  }
  C.noise = n; save(C);
  return n;
}

/** The rule, for tools/gate.js bench: run() (one bench of every view; twice with --twice, the noise measured between
    them and kept), every part judged against its ceiling and printed, the ceilings lowered with --ratchet (main's
    nightly run: at, its commit). The first run's numbers, with { ceilings: judge's }; exit code 1 over a ceiling. */
export async function rule(run, opt, at) {
  const a = await run(), f = (v, n = 2, w = 8) => (v == null ? '–' : v.toFixed(n)).padStart(w);
  if (opt.twice) { const b = await run(); const n = noise(a, b); console.log(`  the noise between two runs, a part's most over every view (ms): ${Object.entries(n).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}`); }
  const C = load(), J = judge(a, C);
  console.log(`\n  each part against its ceiling (tools/gate/ceilings.json, set from ${C.measured ?? 'nothing yet'}): ms a frame, its budget, its ceiling + noise`);
  for (const r of J.rows) if (r.ms > 0 || r.over) console.log(`  ${`${r.view}, ${r.part}`.padEnd(40)}${f(r.ms)}${f(r.budget, 2, 7)}${f(r.ceiling)} +${r.noise.toFixed(2)}  ${r.over ? 'OVER' : r.ms <= r.budget ? 'within its budget' : 'within its ceiling'}`);
  console.log(`  the budget's rule (no part of a view over its ceiling and noise): ${J.pass ? 'met' : 'NOT MET: ' + J.fails.join('; ')}`);
  if (opt.ratchet) { const L = ratchet(a, at); console.log(`  the ceilings lowered to what was measured (${at}): ${L.length ? L.join('; ') : 'none (nothing came down)'}`); }
  if (!J.pass) process.exitCode = 1;
  return { ...a, ceilings: J };
}
