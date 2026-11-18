// The figures brought in whole (intent 0041), checked and looked at: `bun tools/figure.js` reads every figure a
// recipe names (characters/*.js with a `figure`): that its file is the one the recipe was written for (its SHA-256),
// that its licence lies beside it, and what is in it (its points, its triangles, its bones, its face's shapes, its
// pictures); it fails (exit 1) where a file is not its recipe's, has no body with shapes, or the licence is missing.
// `--stills <folder>` then takes each figure's stills there, through its own kit on the game's dev server
// (tools/figure.html; VIEWS below): every move and every expression. `--chrome <path>` names the browser (a machine
// without a GPU draws through its software one), `--url` the dev server (http://localhost:5173/); `--json` prints the
// numbers instead of the table.
import './glob.js';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] ?? true; };

/** What a figure's file holds, read from its glTF's own description (no decoding: counts are written there). */
export function contentsOf(file) {
  const buf = readFileSync(file), n = buf.readUInt32LE(12), J = JSON.parse(buf.subarray(20, 20 + n).toString('utf8')), acc = J.accessors ?? [];
  const meshes = (J.meshes ?? []).map((m) => ({ name: m.name, points: m.primitives.reduce((t, p) => t + acc[p.attributes.POSITION].count, 0), triangles: m.primitives.reduce((t, p) => t + (p.indices != null ? acc[p.indices].count : acc[p.attributes.POSITION].count) / 3, 0), shapes: m.primitives[0].targets?.length ?? 0 }));
  return { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), meshes, points: meshes.reduce((t, m) => t + m.points, 0), triangles: meshes.reduce((t, m) => t + m.triangles, 0),
    shapes: Math.max(0, ...meshes.map((m) => m.shapes)), bones: Math.max(0, ...(J.skins ?? []).map((s) => s.joints.length)), pictures: (J.images ?? []).map((i) => `${i.name} (${Math.round(J.bufferViews[i.bufferView].byteLength / 1024)} kB)`), needs: J.extensionsRequired ?? [] };
}

/** The stills of a figure: its moves (standing from the front and from behind, two strides of its walk from the side, its wave, its cheer, the pose it came in with its skeleton drawn), and each expression close (the address of tools/figure.html each). `eyes`: how high its eyes are (m). */
export const VIEWS = (who, eyes) => ({
  'standing': `who=${who}&d=4.6&y=0.95&yaw=-15&t=4.5`, 'standing, from behind': `who=${who}&d=4.6&y=0.95&yaw=165&t=4.5`,
  'walking, a stride': `who=${who}&move=walk&d=4.8&y=0.95&yaw=-80&t=2.0`, 'walking, the next': `who=${who}&move=walk&d=4.8&y=0.95&yaw=-80&t=2.54`,
  'waving': `who=${who}&move=wave&d=4.6&y=0.95&yaw=-15&t=2.2&turned`, 'cheering': `who=${who}&move=cheer&d=4.6&y=1.05&yaw=-15&t=2.17`, 'as it came, its skeleton': `who=${who}&move=came&d=4.6&y=0.95&yaw=-15&t=2&bones`,
  ...Object.fromEntries(['rest', 'smile', 'laugh', 'surprise', 'sad', 'closed', 'speak'].map((f) => [`face, ${f}`, `who=${who}&face=${f}&d=0.62&y=${eyes}&yaw=-12&z=0.03&t=4.5&sun=30&suna=30`])),
});

const { recipes: every, manifest } = await import('../src/core/registry.js');   // (first, as the game does: the recipes import it back)
const recipes = every('character').filter((r) => r.figure).map((r) => ({ who: manifest[r.uid].file.replace(/^characters\/|\.js$/g, ''), r }));
const rows = [], wrong = [];
for (const { who, r } of recipes) {
  const file = fileURLToPath(r.file), C = existsSync(file) ? contentsOf(file) : null, fails = [];
  if (!C) fails.push(`its file is not there: ${file}`);
  else {
    if (C.sha256 !== r.sha256) fails.push(`its file is not the one its recipe was written for (SHA-256 ${C.sha256.slice(0, 12)}…, the recipe's ${String(r.sha256).slice(0, 12)}…)`);
    if (C.shapes < 40) fails.push(`no body with its face's shapes (most on a mesh: ${C.shapes})`);
    if (!C.bones) fails.push('no skeleton');
    if (!existsSync(resolve(dirname(file), 'LICENSE'))) fails.push('no LICENSE beside it');
  }
  rows.push({ who, name: r.name, figure: r.figure, licence: r.from?.licence, ...(C ?? {}), fails }); for (const f of fails) wrong.push(`${r.name}: ${f}`);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else {
  for (const x of rows) {
    console.log(`${x.fails.length ? '✗' : '✓'} ${x.name.padEnd(8)}${x.figure.padEnd(20)}${(x.bytes / 1048576).toFixed(2)} MB   ${x.points} points   ${x.triangles} triangles   ${x.bones} bones   ${x.shapes} shapes   licence ${x.licence}`);
    console.log(`    ${x.meshes.map((m) => `${m.name} ${m.triangles}${m.shapes ? ` (${m.shapes} shapes)` : ''}`).join(', ')}`); console.log(`    pictures: ${x.pictures.join(', ')}; needs ${x.needs.join(', ')}`);
    for (const f of x.fails) console.log(`    ✗ ${f}`);
  }
  console.log(`\n${rows.length - new Set(wrong.map((w) => w.split(':')[0])).size} of ${rows.length} figures as their recipes say`);
}

// ── their stills ──────────────────────────────────────────────────────────────────────────────────────────────────
const stills = arg('stills');
if (stills && stills !== true) {
  const base = String(arg('url', 'http://localhost:5173/')).replace(/\/?$/, '/'), dir = resolve(String(stills)); mkdirSync(dir, { recursive: true });
  if (!(await fetch(base + 'tools/figure.html').then((r) => r.ok, () => false))) { console.error(`no stills: the game's dev server does not answer at ${base} (bun run game)`); process.exit(1); }
  const { chromium } = await import('playwright-core'), path = arg('chrome'), browser = await chromium.launch(path && path !== true ? { executablePath: String(path), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : { channel: 'chrome' });
  let taken = 0;
  for (const { who, r } of recipes) for (const [name, view] of Object.entries(VIEWS(who, (r.height * 0.938).toFixed(3)))) {
    const page = await browser.newPage({ viewport: name.startsWith('face') ? { width: 560, height: 680 } : { width: 560, height: 800 } }), said = [];
    page.on('pageerror', (e) => said.push(String(e).slice(0, 200)));
    await page.goto(`${base}tools/figure.html?${view}${arg('with') && arg('with') !== true ? '&' + arg('with') : ''}`); await page.waitForFunction(() => window.__drawn, null, { timeout: 240000 }).catch(() => said.push('not drawn in four minutes'));
    const drawn = await page.evaluate(() => window.__drawn); if (drawn?.error) said.push(drawn.error);
    await page.screenshot({ path: resolve(dir, `${who}-${name.replace(/[, ]+/g, '-')}.png`) }); await page.close(); taken++;
    for (const s of said) wrong.push(`${r.name}, ${name}: ${s}`);
  }
  await browser.close(); console.log(`${taken} stills in ${dir}`);
}
for (const w of wrong) console.error(`✗ ${w}`);
process.exit(wrong.length ? 1 : 0);
