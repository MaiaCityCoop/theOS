// The real half of the gate (intent 0038, check 4a): renders held against photographs of the real thing, by CMMD on
// CLIP features and by natural-image statistics (tools/gate/real.py, in a Python of its own: tools/gate/README.md).
// tools/gate.js real.
import { existsSync, readFileSync, readdirSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { VIEWS, KINDS } from './views.js';

const OUT = new URL('../../.gate/', import.meta.url).pathname;   // (TheGame/.gate/, as tools/gate.js keeps its sets)
const save = (file, data) => writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
const f = (v, n = 2, w = 8) => (v == null ? '–' : v.toFixed(n)).padStart(w);
const PYTHON = process.env.GATE_PYTHON || `${homedir()}/.venvs/theos-real/bin/python`;   // (the venv tools/gate/README.md makes)
const IMAGE = /\.(png|jpe?g|webp|tiff?)$/i;
/** The photographs of a folder, as its manifest.json lists them (tools/gate/README.md): each { file, kind, licence,
    distance_m ([near, far] metres, one number, or null: inside or not known), gate? (the one gate view it is of) }, as
    the gate reads them: { file (its path), kind, near, far, gate }. A folder without one: every picture in it, each
    of the gate view it is named by (a set of stills), else of no kind (held against every render, as one set). */
function photosIn(dir) {
  const at = `${dir.replace(/\/$/, '')}/`, m = `${at}manifest.json`;
  if (!existsSync(m)) return readdirSync(at).filter((n) => IMAGE.test(n)).sort().map((n) => { const v = VIEWS.find((x) => x.name === n.replace(IMAGE, '')); return { file: `${at}${n}`, kind: v?.kind ?? null, near: v?.distance ?? null, far: v?.distance ?? null, gate: v?.name ?? null }; });   // (a set of gate stills: each of its view)
  const list = JSON.parse(readFileSync(m, 'utf8')).photos ?? [], bad = [];
  for (const [k, p] of list.entries()) {
    const miss = ['file', 'kind', 'licence'].filter((x) => p[x] == null || p[x] === ''), d = p.distance_m;
    if (miss.length) bad.push(`photo ${k} (${p.file ?? '?'}) has no ${miss.join(', ')}`);
    else if (!KINDS.includes(p.kind)) bad.push(`${p.file}: kind '${p.kind}' is none of ${KINDS.join(', ')}`);
    else if (d != null && !(typeof d === 'number' ? d >= 0 : Array.isArray(d) && d.length === 2 && d[0] >= 0 && d[1] >= d[0])) bad.push(`${p.file}: distance_m ${JSON.stringify(d)} is neither metres, [near, far] nor null`);
    else if (p.gate && !VIEWS.some((v) => v.name === p.gate)) bad.push(`${p.file}: gate '${p.gate}' is not a gate view`);
    else if (!existsSync(`${at}${p.file}`)) bad.push(`${p.file} is not in ${at}`);
  }
  if (bad.length) throw new Error(`${m}:\n  ${bad.join('\n  ')}`);
  return list.map((p) => { const d = p.distance_m; return { file: `${at}${p.file}`, kind: p.kind, near: d == null ? null : +[].concat(d)[0], far: d == null ? null : +[].concat(d).at(-1), gate: p.gate ?? null, licence: p.licence }; });
}
/** The photos a view is held against: those that name it, else those of its kind from about as far (their distances
    within a factor of two of its own; where either is not known, its kind alone). */
const photosFor = (v, photos) => {
  const named = photos.filter((p) => p.gate === v.name);
  if (named.length) return named;
  return photos.filter((p) => !p.gate && p.kind === v.kind && (v.distance == null || p.near == null || (p.far >= v.distance / 2 && p.near <= v.distance * 2)));
};

// ---- the ratchet: a class's distances to the photos may only go down ----
// tools/gate/real-ratchet.json: { measured, classes: { class: { cmmd, lightness, colour, rms, local, slope } } }, the
// distances (their sizes) as main last measured them. A class farther than it was by more than the photos' own spread
// (its floor: the photos split in two halves, held against each other, tools/gate/real.py) fails the gate: a rise
// within that is more than the measure can tell. A measure with no floor is shown, never judged. main's run with
// --ratchet lowers each to what it measures, never raises one.
const RATCHET = new URL('./real-ratchet.json', import.meta.url).pathname, MEASURES = ['cmmd', 'lightness', 'colour', 'rms', 'local', 'slope'];
const kept = () => (existsSync(RATCHET) ? JSON.parse(readFileSync(RATCHET, 'utf8')) : { measured: null, classes: {} });
/** A group's distances to the photos (sizes), and the same for its floor (the photos against themselves: f, its floor). */
const sizes = (cmmd, diff) => ({ cmmd, ...Object.fromEntries(MEASURES.slice(1).map((m) => [m, diff?.[m] == null ? null : Math.abs(diff[m])])) });
const distances = (g) => sizes(g.cmmd, g.stats.diff), floors = (g) => sizes(g.floor?.cmmd, g.floor?.diff);
const classOf = (g) => (g.name === 'all' || g.name.startsWith('kind ') ? g.name.replace(/^kind /, '') : null);   // (the per-view groups are detail: the classes are the kinds and all)
function judge(groups, K = kept()) {
  const fails = [];
  for (const g of groups) {
    const c = classOf(g), was = c && K.classes[c]; if (!was) continue;
    const f = floors(g);
    for (const [m, v] of Object.entries(distances(g))) if (v != null && was[m] != null && f[m] != null && v > was[m] + f[m]) fails.push(`${c} ${m} ${v.toFixed(3)} (was ${was[m].toFixed(3)}, the photos' own spread ${f[m].toFixed(3)})`);
  }
  return { measured: K.measured, fails, pass: !fails.length };
}
function lower(groups, at, K = kept()) {
  const L = [];
  for (const g of groups) {
    const c = classOf(g); if (!c) continue;
    const was = (K.classes[c] ||= {});
    for (const [m, v] of Object.entries(distances(g))) if (v != null && (was[m] == null || v < was[m])) { if (was[m] != null) L.push(`${c} ${m} ${was[m].toFixed(3)} → ${v.toFixed(3)}`); was[m] = +v.toFixed(4); }
  }
  K.measured = at; writeFileSync(RATCHET, JSON.stringify(K, null, 1) + '\n');
  return L;
}
/** What real compares: the renders (a set of stills in .gate/, or a folder; each with its view where it is one) and the
    photographs (a folder with its manifest.json). */
function inputs(what, opt) {
  if (!what || !opt.photos) throw new Error('real <tag | folder> --photos <folder>: renders (a set of stills in .gate/, or a folder) against photographs (a folder with its manifest.json: tools/gate/README.md)');
  const rdir = existsSync(`${OUT}${what}/`) ? `${OUT}${what}/` : `${what.replace(/\/$/, '')}/`, photos = photosIn(opt.photos);
  if (!existsSync(PYTHON)) throw new Error(`no Python at ${PYTHON} (GATE_PYTHON): make the venv as tools/gate/README.md says`);
  const renders = readdirSync(rdir).filter((n) => IMAGE.test(n) && !n.startsWith('real-')).sort().map((n) => ({ file: `${rdir}${n}`, view: VIEWS.find((v) => n.replace(IMAGE, '') === v.name) ?? null }));
  if (!renders.length || !photos.length) throw new Error(`nothing to compare: ${renders.length} renders in ${rdir}, ${photos.length} photos in ${opt.photos}`);
  return { rdir, renders, photos };
}
/** The groups the measure holds against each other: all of them, by kind, and by view, where there are photos to hold
    them against. */
function groupsOf(renders, photos) {
  const groups = [{ name: 'all', renders: renders.map((r) => r.file), photos: photos.map((p) => p.file) }];
  for (const k of KINDS) {   // by kind, and by view, where there are photos to hold them against
    const R = renders.filter((r) => r.view?.kind === k), P = photos.filter((p) => p.kind === k);
    if (R.length && P.length) groups.push({ name: `kind ${k}`, renders: R.map((r) => r.file), photos: P.map((p) => p.file) });
    for (const r of R) { const Q = photosFor(r.view, photos); if (Q.length) groups.push({ name: r.view.name, renders: [r.file], photos: Q.map((p) => p.file) }); }
  }
  return groups;
}
/** The groups measured (tools/gate/real.py, in the gate's Python): its answer, { groups, images }. */
async function measured(groups, opt) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-real-')), job = `${dir}/job.json`, out = `${dir}/out.json`;
  save(job, { groups });
  try {
    await new Promise((ok, no) => { const p = spawn(PYTHON, [new URL('./real.py', import.meta.url).pathname, job, out, '--device', opt.device ?? 'cpu', '--clip', opt.clip ?? 'ViT-L-14-336', ...(opt['no-clip'] ? ['--no-clip'] : [])], { stdio: ['ignore', 'inherit', 'pipe'] }); let e = ''; p.stderr.on('data', (d) => { e += d; if (opt.verbose) process.stderr.write(d); }); p.on('exit', (c) => (c ? no(new Error(`tools/gate/real.py failed (${c}):\n${e.slice(-2000)}`)) : ok())); });
    const r = JSON.parse(readFileSync(out, 'utf8'));
    return r;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** The view classes (the photos' kinds) and what each holds: the gate's views of it among the renders, and its photos. */
function sayClasses(renders, photos) {
  console.log(`  the view classes: the gate's views (rendered here, of all) against the photos of each kind`);
  for (const k of KINDS) {
    const all = VIEWS.filter((v) => v.kind === k).map((v) => v.name), here = renders.filter((x) => x.view?.kind === k).map((x) => x.view.name), n = photos.filter((p) => p.kind === k).length;
    if (all.length || n) console.log(`    ${k.padEnd(10)} ${String(n).padStart(3)} photos  ${here.length ? here.join(', ') : '–'}${all.length > here.length ? `  (not rendered: ${all.filter((v) => !here.includes(v)).join(', ')})` : ''}${!all.length ? '  (no gate view yet)' : ''}${!n ? '  (no photo yet)' : ''}`);
  }
}
/** The table: each class's distance, and in brackets the photos' own spread, the floor it stands on; then the sets
    themselves. */
function sayTable(groups) {
  const cell = (v, fl, n, w) => `${v == null ? '–' : Math.abs(v).toFixed(n)}${fl == null ? '' : ` (${Math.abs(fl).toFixed(n)})`}`.padStart(w);
  console.log(`\n  ${'class'.padEnd(26)}${'n'.padStart(6)}${'CMMD'.padStart(15)}${'L* EMD'.padStart(14)}${'ΔE mean'.padStart(14)}${'Δ RMS'.padStart(13)}${'Δ local'.padStart(13)}${'Δ slope'.padStart(15)}`);
  console.log(`  ${'(the photos\' own spread)'.padEnd(26)}`);
  for (const g of groups) { const d = g.stats.diff ?? {}, fd = g.floor?.diff ?? {}; console.log(`  ${g.name.replace(/^kind /, '').padEnd(26)}${`${g.renders}:${g.photos}`.padStart(6)}${cell(g.cmmd, g.floor?.cmmd, 3, 15)}${cell(d.lightness, fd.lightness, 2, 14)}${cell(d.colour, fd.colour, 2, 14)}${cell(d.rms, fd.rms, 2, 13)}${cell(d.local, fd.local, 2, 13)}${cell(d.slope, fd.slope, 3, 15)}`); }
  const A = groups[0].stats;
  console.log(`  the sets themselves (renders | photos): L* ${A.renders.L.toFixed(1)} | ${A.photos.L.toFixed(1)}, chroma ${A.renders.C.toFixed(1)} | ${A.photos.C.toFixed(1)}, RMS ${A.renders.rms.toFixed(1)} | ${A.photos.rms.toFixed(1)}, local ${A.renders.local.toFixed(2)} | ${A.photos.local.toFixed(2)}, slope ${A.renders.slope.toFixed(2)} | ${A.photos.slope.toFixed(2)}`);
}

export async function real(what, opt) {
  const { rdir, renders, photos } = inputs(what, opt), groups = groupsOf(renders, photos);
  console.log(`real: ${renders.length} renders (${rdir}) against ${photos.length} photographs (${opt.photos}); ${groups.length} groups`);
  const r = await measured(groups, opt);
  const report = { renders: rdir, photos: opt.photos, when: new Date().toISOString(), clip: opt.clip ?? 'ViT-L-14-336', groups: r.groups, images: r.images };
  sayClasses(renders, photos);
  sayTable(r.groups);
  // the rule: a class's distances may only go down (tools/gate/real-ratchet.json; --ratchet: main's, lowered)
  const J = judge(r.groups);
  report.ratchet = J;
  console.log(`  the real rule (no class farther from the photos than it was, ${J.measured ?? 'nothing yet measured'}): ${J.pass ? 'met' : 'NOT MET: ' + J.fails.join('; ')}`);
  if (opt.ratchet) { const L = lower(r.groups, opt.at ?? new Date().toISOString().slice(0, 10)); console.log(`  lowered: ${L.length ? L.join('; ') : 'none'}`); }
  save(`${rdir}real.json`, report); mkdirSync(OUT, { recursive: true }); save(`${OUT}real.json`, report);
  console.log(`  → .gate/real.json and ${rdir}real.json (check 4a: every distance falls stage by stage, never rises)`);
  if (!J.pass) process.exitCode = 1;
  return report;
}
