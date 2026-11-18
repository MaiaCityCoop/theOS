// The real half of the gate (intent 0038, check 4a): renders held against photographs of the real thing, by CMMD on
// CLIP features and by natural-image statistics (tools/gate/real.py, in a Python of its own: tools/gate/README.md).
// tools/gate.js real.
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
export async function real(what, opt) {
  if (!what || !opt.photos) throw new Error('real <tag | folder> --photos <folder>: renders (a set of stills in .gate/, or a folder) against photographs (a folder with its manifest.json: tools/gate/README.md)');
  const rdir = existsSync(`${OUT}${what}/`) ? `${OUT}${what}/` : `${what.replace(/\/$/, '')}/`, photos = photosIn(opt.photos);
  if (!existsSync(PYTHON)) throw new Error(`no Python at ${PYTHON} (GATE_PYTHON): make the venv as tools/gate/README.md says`);
  const renders = readdirSync(rdir).filter((n) => IMAGE.test(n) && !n.startsWith('real-')).sort().map((n) => ({ file: `${rdir}${n}`, view: VIEWS.find((v) => n.replace(IMAGE, '') === v.name) ?? null }));
  if (!renders.length || !photos.length) throw new Error(`nothing to compare: ${renders.length} renders in ${rdir}, ${photos.length} photos in ${opt.photos}`);
  const groups = [{ name: 'all', renders: renders.map((r) => r.file), photos: photos.map((p) => p.file) }];
  for (const k of KINDS) {   // by kind, and by view, where there are photos to hold them against
    const R = renders.filter((r) => r.view?.kind === k), P = photos.filter((p) => p.kind === k);
    if (R.length && P.length) groups.push({ name: `kind ${k}`, renders: R.map((r) => r.file), photos: P.map((p) => p.file) });
    for (const r of R) { const Q = photosFor(r.view, photos); if (Q.length) groups.push({ name: r.view.name, renders: [r.file], photos: Q.map((p) => p.file) }); }
  }
  const dir = mkdtempSync(join(tmpdir(), 'gate-real-')), job = `${dir}/job.json`, out = `${dir}/out.json`;
  save(job, { groups });
  console.log(`real: ${renders.length} renders (${rdir}) against ${photos.length} photographs (${opt.photos}); ${groups.length} groups`);
  try {
    await new Promise((ok, no) => { const p = spawn(PYTHON, [new URL('./real.py', import.meta.url).pathname, job, out, '--device', opt.device ?? 'cpu', '--clip', opt.clip ?? 'ViT-L-14-336', ...(opt['no-clip'] ? ['--no-clip'] : [])], { stdio: ['ignore', 'inherit', 'pipe'] }); let e = ''; p.stderr.on('data', (d) => { e += d; if (opt.verbose) process.stderr.write(d); }); p.on('exit', (c) => (c ? no(new Error(`tools/gate/real.py failed (${c}):\n${e.slice(-2000)}`)) : ok())); });
    const r = JSON.parse(readFileSync(out, 'utf8'));
    const report = { renders: rdir, photos: opt.photos, when: new Date().toISOString(), clip: opt.clip ?? 'ViT-L-14-336', groups: r.groups, images: r.images };
    console.log(`  ${'group'.padEnd(28)}${'n'.padStart(7)}${'CMMD'.padStart(9)}${'L* EMD'.padStart(9)}${'ΔE mean'.padStart(9)}${'Δ chroma'.padStart(10)}${'Δ RMS'.padStart(8)}${'Δ local'.padStart(9)}${'Δ slope'.padStart(9)}`);
    for (const g of r.groups) { const d = g.stats.diff ?? {}; console.log(`  ${g.name.padEnd(28)}${`${g.renders}:${g.photos}`.padStart(7)}${f(g.cmmd, 3, 9)}${f(d.lightness, 2, 9)}${f(d.colour, 2, 9)}${f(d.chroma, 2, 10)}${f(d.rms, 2, 8)}${f(d.local, 2, 9)}${f(d.slope, 3, 9)}`); }
    const a = r.groups[0].stats;
    console.log(`  the sets themselves (renders | photos): L* ${a.renders.L.toFixed(1)} | ${a.photos.L.toFixed(1)}, chroma ${a.renders.C.toFixed(1)} | ${a.photos.C.toFixed(1)}, RMS ${a.renders.rms.toFixed(1)} | ${a.photos.rms.toFixed(1)}, local ${a.renders.local.toFixed(2)} | ${a.photos.local.toFixed(2)}, slope ${a.renders.slope.toFixed(2)} | ${a.photos.slope.toFixed(2)}`);
    save(`${rdir}real.json`, report);
    console.log(`  → ${rdir}real.json (check 4a: every number falls stage by stage, never rises)`);
    return report;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
