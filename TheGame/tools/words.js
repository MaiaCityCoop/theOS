// The library's words, kept short (intent 0042): `bun tools/words.js` reads what the library's card shows of every
// recipe (its `about`, a biome's `laid`, a material's `usedBy`) and of every variant a character kit offers (a move,
// a layer, an expression: each `about` written in characters/kit/*.js), and fails (exit 1) where one is longer than
// its measure below. The card is narrow (brand.css --side-w): a description is one or two of its lines, a variant's
// words one. `--json` prints the numbers instead of the table.
import './glob.js';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const MOST = { about: 80, laid: 40, usedBy: 40, variant: 40 };   // letters

const { recipes } = await import('../src/core/registry.js');   // (first, as the game does: the recipes import it back)
const ROOT = resolve(import.meta.dirname, '..'), lines = [];
for (const type of ['asset', 'biome', 'character', 'material']) for (const r of recipes(type)) {
  lines.push({ kind: `${type}: about`, of: r.name, text: r.about ?? '', most: MOST.about, must: true });
  if (r.laid != null) lines.push({ kind: 'biome: laid', of: r.name, text: r.laid, most: MOST.laid });
  if (r.usedBy != null) lines.push({ kind: 'material: used by', of: r.name, text: String(r.usedBy), most: MOST.usedBy });
}
for (const f of readdirSync(resolve(ROOT, 'characters/kit')).filter((f) => f.endsWith('.js')).sort()) {
  const src = readFileSync(resolve(ROOT, 'characters/kit', f), 'utf8');
  for (const m of src.matchAll(/name: '((?:[^'\\]|\\.)*)', about: '((?:[^'\\]|\\.)*)'/g)) lines.push({ kind: `variant: ${f}`, of: m[1], text: m[2].replace(/\\'/g, "'"), most: MOST.variant, must: true });
}
const wrong = lines.filter((l) => l.text.length > l.most || (l.must && !l.text.trim())).map((l) => `${l.kind}, ${l.of}: ${l.text.trim() ? `${l.text.length} letters, over ${l.most}` : 'no words'}: "${l.text}"`);
const kinds = [...new Set(lines.map((l) => l.kind))].map((k) => { const L = lines.filter((l) => l.kind === k), top = L.reduce((a, b) => (b.text.length > a.text.length ? b : a)); return { kind: k, lines: L.length, most: L[0].most, longest: top.text.length, of: top.of, over: L.filter((l) => l.text.length > l.most).length }; });
if (process.argv.includes('--json')) console.log(JSON.stringify({ kinds, wrong }, null, 1));
else {
  for (const k of kinds) console.log(`${k.over ? '✗' : '✓'} ${k.kind.padEnd(24)}${String(k.lines).padStart(3)} lines   longest ${String(k.longest).padStart(3)} of ${k.most}   (${k.of})`);
  console.log(`\n${lines.length - wrong.length} of ${lines.length} lines within their measure`);
}
for (const w of wrong) console.error(`✗ ${w}`);
process.exit(wrong.length ? 1 : 0);
