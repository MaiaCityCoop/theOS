// The code gates (intent 0038; the intents skill, "Define: the architecture pass"): what a change does to the code over
// the paths it touches, as one table (Markdown, to paste into an intent) and whole in .gate/health.json. They measure
// against `main` by design: run it on main and on the branch over the same paths; every number holds or goes down.
//
//   bun tools/health.js [path…] [--json]   each path from the current directory, else from TheGame/ (none: all of
//                                          TheGame); its .js files as git sees them (tracked, or new and not ignored);
//                                          --json: health.json on stdout instead of the table
//
//   Copies        jscpd, clones of 50 tokens or more: the share of lines that are in one, and the largest
//   Spaghetti     eslint's `complexity` (cyclomatic) of every function: the most, the mean, the 20 most
//   Dead code     knip (knip.jsonc): files nothing imports, exports nothing imports, things exported under two names
//   Cycles        madge --circular: the import cycles through the paths, and the imports madge could not follow
//   Size          lines of code (a line with code on it: not blank, not only a comment), by folder
//   Settings      mode branches (TRUTH-like): every place a condition asks a mode, a constant true or false for the
//                 whole run (one the address sets, as `?truth` sets TRUTH, or one set by hand): in the condition of an
//                 if, ?:, loop or switch, or left of &&, || or ??, by the flags each is made from. Hand-set numbers:
//                 every module constant, or number in a constant's table, written as a number by hand, and those the
//                 SSOT audit (research_notes/0038-ssot-audit.md) names however they are written (marked). Flag reads:
//                 every call of flag, flagNum and flagText (src/core/flags.js)
//   Dependencies  the direct dependencies of every package.json in the repository
//
// No node on the path: jscpd and knip are run by bun from their files, eslint and madge through their own APIs.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { Linter } from 'eslint';
import madge from 'madge';

const GAME = resolve(import.meta.dirname, '..'), REPO = resolve(GAME, '..'), OUT = join(GAME, '.gate/health.json');
const READS = new Set(['flag', 'flagNum', 'flagText']);   // how the address is read (src/core/flags.js)
// the hand-set numbers the SSOT audit names, by the file each is set in (not ERROR_PX, the one dial; DRAWN is a mode)
const AUDIT = { 'error.js': ['BUDGET_DRAWN'], 'measure.js': ['REACHES', 'BIG'], 'tier.js': ['MAXP'], 'terrain.js': ['CAP'], 'relief.js': ['CAP'],
  'crowd.js': ['SWELL', 'WIN', 'CLUMPS', 'VIEWS', 'CELL', 'TILE', 'TILES', 'SWITCH', 'FADE', 'RATIO'].map((k) => `CROWD.${k}`) };

const fail = (why) => { console.error(`health: ${why}`); process.exit(1); };
const run = (cmd, args, cwd = GAME) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PATHS = wanted.length ? wanted.map((p) => [resolve(p), resolve(GAME, p)].find((q) => existsSync(q)) ?? fail(`no ${p}`)) : [GAME];
const FILES = [...new Set(run('git', ['ls-files', '-co', '--exclude-standard', '--', ...PATHS]).stdout.split('\n'))]
  .filter((f) => f.endsWith('.js') && existsSync(join(GAME, f))).sort();
if (!FILES.length) fail(`no .js files in ${wanted.join(' ') || 'TheGame'}`);
const IN = new Set(FILES), at = (f, line) => `${f}:${line}`, nameOf = (n) => n.name ?? n.value;

// ---- every module read once, by eslint's parser: its functions' complexity, its lines of code, its bindings ----
const linter = new Linter({ cwd: REPO });
const CONFIG = [{ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules: { complexity: ['error', 0] } }];
const MODS = new Map(), MADE = new Map();
/** A module, by its path from TheGame/: its functions (complexity), its lines of code, and its module scope's imports,
    constants and exports (none where it could not be parsed: `broken` says why). */
const mod = (f) => (MODS.has(f) ? MODS.get(f) : MODS.set(f, parse(f)).get(f));
function parse(f) {
  const text = readFileSync(join(GAME, f), 'utf8'), said = linter.verify(text, CONFIG, { filename: join(GAME, f) }), broken = said.find((x) => x.fatal);
  const fns = said.filter((x) => x.ruleId === 'complexity').map((x) => ({ at: at(f, x.line), name: x.message.replace(/ has a complexity of.*/, ''), complexity: +x.message.match(/complexity of (\d+)/)[1] }));
  if (broken) return { f, fns, broken: `${at(f, broken.line)}: ${broken.message}`, code: text.split('\n').filter((l) => /\S/.test(l)).length, consts: new Map() };
  const sc = linter.getSourceCode(), lines = new Set();
  for (const t of sc.ast.tokens) for (let l = t.loc.start.line; l <= t.loc.end.line; l++) lines.add(l);
  return { f, fns, sc, code: lines.size, ...bindings(f, sc) };
}
/** A module's own bindings: what it imports (local name: from where, under what name), its constants, what it exports
    (name: its local name, or where it is re-exported from) and the modules it re-exports whole. */
function bindings(f, sc) {
  const scope = sc.scopeManager.globalScope.childScopes.find((s) => s.type === 'module'), imports = new Map(), consts = new Map(), exports = new Map(), stars = [];
  for (const v of scope.variables) if (v.defs[0]?.type === 'ImportBinding') imports.set(v.name, { from: target(f, v.defs[0].parent.source.value), name: imported(v.defs[0].node) });
  for (const s of sc.ast.body) {
    const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
    if (d?.type === 'VariableDeclaration' && d.kind === 'const') for (const v of d.declarations) if (v.id.type === 'Identifier' && v.init) consts.set(v.id.name, v);
    if (s.type === 'ExportNamedDeclaration') exportsOf(f, s, exports);
    if (s.type === 'ExportAllDeclaration' && !s.exported) stars.push(target(f, s.source.value));
  }
  return { scope, imports, consts, exports, stars };
}
const imported = (s) => (s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : nameOf(s.imported));
function exportsOf(f, s, out) {
  for (const id of s.declaration ? (s.declaration.declarations ?? [s.declaration]).map((x) => x.id) : []) if (id?.type === 'Identifier') out.set(id.name, id.name);
  for (const x of s.specifiers) out.set(nameOf(x.exported), s.source ? { from: target(f, s.source.value), name: nameOf(x.local) } : nameOf(x.local));
}
/** The module an import names, by its path from TheGame/, as vite resolves ./, ../ and / (null: a package's, or none). */
function target(f, spec) {
  const p = spec.startsWith('/') ? join(GAME, spec) : spec.startsWith('.') ? resolve(GAME, dirname(f), spec) : null;
  return p && existsSync(p) ? relative(GAME, p) : null;
}

// ---- modes: what a module's constant is made from ----
/** What a module's binding is made from: the flags of the address it reads, through every constant and import it is
    made of, and whether it is a mode, true or false for the whole run (a mode no flag makes is its own). null: it is
    no constant of a module's. Reckoned once; null while it is reckoned, so an import cycle ends. */
function made(f, name) {
  const key = `${f}#${name}`;
  if (!MADE.has(key)) MADE.set(key, null).set(key, reckon(mod(f), name));
  return MADE.get(key);
}
function reckon(m, name) {
  const imp = m.imports?.get(name), v = m.consts.get(name);
  if (imp) return imp.from && exported(imp.from, imp.name);
  if (!v) return null;
  const flags = new Set(), mode = isBool(m, v.init), inside = (n) => n.range[0] >= v.init.range[0] && n.range[1] <= v.init.range[1];
  for (const r of m.scope.references) if (r.resolved?.scope === m.scope && inside(r.identifier)) for (const x of flagsOf(m, r.identifier)) flags.add(x);
  return { mode, flags: mode && !flags.size ? [name] : [...flags] };
}
const flagsOf = (m, id) => (readOf(id) ? [readOf(id)] : made(m.f, id.name)?.flags ?? []);
/** made() of what a module exports under a name, through its re-exports. */
function exported(f, name) {
  const key = `${f}@${name}`;
  if (!MADE.has(key)) MADE.set(key, null).set(key, reexport(mod(f), name));
  return MADE.get(key);
}
function reexport(m, name) {
  const e = m.exports?.get(name);
  if (typeof e === 'string') return made(m.f, e);
  if (e) return e.from && exported(e.from, e.name);
  for (const s of m.stars ?? []) { const x = s && exported(s, name); if (x) return x; }
  return null;
}
/** The flag a read of the address asks for (`flag('truth')`: 'truth'), where id is the callee of one. */
const readOf = (id) => (READS.has(id.name) && id.parent.type === 'CallExpression' && id.parent.callee === id ? String(id.parent.arguments[0]?.value ?? '?') : null);
const SAY = new Set(['==', '!=', '===', '!==', '<', '<=', '>', '>=', 'in', 'instanceof']);
const ASK = new Set(['test', 'includes', 'has', 'startsWith', 'endsWith', 'some', 'every', 'isArray', 'isFinite', 'isInteger', 'isNaN']);
const BOOL = {   // which expressions are true or false as they are written: a constant made of one is a mode
  Literal: (m, n) => typeof n.value === 'boolean',
  UnaryExpression: (m, n) => n.operator === '!',
  BinaryExpression: (m, n) => SAY.has(n.operator),
  LogicalExpression: (m, n) => isBool(m, n.left) && isBool(m, n.right),
  ConditionalExpression: (m, n) => isBool(m, n.consequent) && isBool(m, n.alternate),
  Identifier: (m, n) => !!made(m.f, n.name)?.mode,
  CallExpression: (m, n) => (n.callee.type === 'Identifier' ? n.callee.name === 'flag' : ASK.has(n.callee.property?.name)),
};
const isBool = (m, n) => !!BOOL[n.type]?.(m, n);
const TEST = { IfStatement: 'test', ConditionalExpression: 'test', WhileStatement: 'test', DoWhileStatement: 'test', ForStatement: 'test', SwitchStatement: 'discriminant', SwitchCase: 'test', LogicalExpression: 'left' };
/** Whether a node is (in) the condition of a branch: of an if, ?:, loop or switch, or left of &&, || or ??. */
function inTest(n) {
  for (let p = n.parent; p; n = p, p = p.parent) {
    if (p[TEST[p.type]] === n) return true;
    if (/Statement|Declarat|Function|Program/.test(p.type)) return false;
  }
  return false;
}

// ---- numbers set by hand ----
const ARITH = new Set(['+', '-', '*', '/', '%', '**', '<<', '>>', '>>>', '&', '|', '^']);
const isMath = (n) => n.type === 'MemberExpression' && n.object.name === 'Math';
const NUMBER = {   // which expressions are numbers written by hand: literals, arithmetic of them, Math's
  Literal: (n) => typeof n.value === 'number',
  UnaryExpression: (n) => ['-', '+', '~'].includes(n.operator) && isNumber(n.argument),
  BinaryExpression: (n) => ARITH.has(n.operator) && isNumber(n.left) && isNumber(n.right),
  CallExpression: (n) => isMath(n.callee) && n.arguments.length > 0 && n.arguments.every(isNumber),
  MemberExpression: isMath,
};
const isNumber = (n) => !!NUMBER[n.type]?.(n);
const frozen = (n) => (n.type === 'CallExpression' && n.callee.object?.name === 'Object' && n.callee.property?.name === 'freeze' && n.arguments[0]) || n;
/** A module constant's hand-set numbers, into out: itself, or the numbers of its table (frozen or not), by key. */
function numbers(m, name, init, out) {
  const n = frozen(init), text = m.sc.getText(n), audit = !!AUDIT[basename(m.f)]?.includes(name);
  if (n.type === 'ObjectExpression') for (const p of n.properties) if (p.type === 'Property' && !p.computed) numbers(m, `${name}.${nameOf(p.key)}`, p.value, out);
  if (audit || (isNumber(n) && /\d/.test(text))) out.push({ at: at(m.f, n.loc.start.line), name, value: text, ...(audit && { audit }) });
}

// ---- the gates ----
function copies() {
  const dir = mkdtempSync(join(tmpdir(), 'health-')), report = join(dir, 'jscpd-report.json');
  try {
    const r = run(process.execPath, [join(GAME, 'node_modules/jscpd/run-jscpd.js'), '--min-tokens', '50', '--reporters', 'json,silent', '--output', dir, '--absolute', ...FILES]);
    if (!existsSync(report)) fail(`jscpd: ${r.stderr || r.stdout}`);
    const j = JSON.parse(readFileSync(report, 'utf8')), T = j.statistics.total, end = (x) => `${relative(GAME, x.name)}:${x.start}-${x.end}`;
    return { percent: T.percentage, lines: T.duplicatedLines, of: T.lines, clones: T.clones,
      largest: j.duplicates.map((d) => ({ lines: d.lines, tokens: d.tokens, a: end(d.firstFile), b: end(d.secondFile) })).sort((x, y) => y.lines - x.lines) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function spaghetti() {
  const fns = FILES.flatMap((f) => mod(f).fns).sort((a, b) => b.complexity - a.complexity);
  return { functions: fns.length, most: fns[0]?.complexity ?? 0, mean: fns.reduce((s, x) => s + x.complexity, 0) / (fns.length || 1), top: fns.slice(0, 20),
    unparsed: FILES.map((f) => mod(f).broken).filter(Boolean) };
}
function dead() {
  const r = run(process.execPath, [join(GAME, 'node_modules/knip/bin/knip-bun.js'), '--reporter', 'json', '--no-progress', '--no-exit-code', '--no-config-hints', '--include', 'files,exports,duplicates']);
  if (r.status !== 0) fail(`knip: ${r.stderr || r.stdout}`);
  const rows = JSON.parse(r.stdout).issues.filter((i) => IN.has(i.file));
  return { files: rows.filter((i) => i.files.length).map((i) => i.file), exports: rows.flatMap((i) => i.exports.map((x) => ({ at: at(i.file, x.line), name: x.name }))),
    duplicates: rows.flatMap((i) => i.duplicates.map((g) => ({ at: at(i.file, g[0].line), names: g.map((x) => x.name) }))) };
}
async function cycles() {
  const res = await madge(FILES.map((f) => join(GAME, f)), { baseDir: GAME, fileExtensions: ['js'], includeNpm: false });
  return { cycles: res.circular().filter((c) => c.some((f) => IN.has(f))), unfollowed: res.warnings().skipped.filter((s) => /^[./]/.test(s)) };
}
function size() {
  const by = {};
  for (const f of FILES) { const d = (by[dirname(f)] ??= { folder: dirname(f), files: 0, code: 0 }); d.files++; d.code += mod(f).code; }
  const folders = Object.values(by).sort((a, b) => a.folder.localeCompare(b.folder));
  return { files: FILES.length, code: folders.reduce((s, d) => s + d.code, 0), folders };
}
function settings() {
  const branches = [], hand = [], reads = [];
  for (const m of FILES.map((f) => mod(f)).filter((x) => x.sc)) {
    for (const r of m.sc.scopeManager.scopes.flatMap((s) => s.references)) {
      const id = r.identifier, line = at(m.f, id.loc.start.line), read = readOf(id);
      const what = read ? { mode: true, flags: [read] } : r.resolved?.scope === m.scope && made(m.f, id.name);   // (a module's own bindings and imports)
      if (read) reads.push({ at: line, flag: read });
      if (what?.mode && inTest(read ? id.parent : id)) branches.push({ at: line, on: what.flags.join(' ') });
    }
    for (const [name, v] of m.consts) numbers(m, name, v.init, hand);
  }
  return { branches, numbers: hand, reads };
}
function dependencies() {
  return run('git', ['ls-files', '-co', '--exclude-standard', '--', ':(glob)**/package.json'], REPO).stdout.split('\n').filter(Boolean).map((p) => {
    const j = JSON.parse(readFileSync(join(REPO, p), 'utf8'));
    return { at: p, dependencies: Object.keys({ ...j.dependencies, ...j.optionalDependencies, ...j.peerDependencies }), dev: Object.keys(j.devDependencies ?? {}) };
  });
}

const H = { commit: run('git', ['rev-parse', '--short', 'HEAD']).stdout.trim() + (run('git', ['status', '--porcelain']).stdout.trim() ? '+' : ''),
  at: new Date().toISOString(), paths: PATHS.map((p) => relative(GAME, p) || '.'), files: FILES.length,
  copies: copies(), spaghetti: spaghetti(), dead: dead(), cycles: await cycles(), size: size(), settings: settings(), dependencies: dependencies() };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(H, null, 1));
console.log(process.argv.includes('--json') ? JSON.stringify(H, null, 1) : table(H));

// ---- the table ----
function table({ commit, paths, files, copies: C, spaghetti: S, dead: D, cycles: Y, size: Z, settings: T, dependencies: P }) {
  const count = (list, key) => Object.entries(list.reduce((o, x) => ((o[key(x)] = (o[key(x)] ?? 0) + 1), o), {})).sort((a, b) => b[1] - a[1]);
  const n = (k, word) => `${k} ${word}${k === 1 ? '' : word.endsWith('h') ? 'es' : 's'}`;
  const modes = count(T.branches, (b) => b.on), dirs = count(D.exports, (x) => dirname(x.at)), big = [...Z.folders].sort((a, b) => b.code - a.code)[0];
  const deps = P.reduce((s, p) => s + p.dependencies.length + p.dev.length, 0), devs = P.reduce((s, p) => s + p.dev.length, 0), c = C.largest[0], s = S.top[0];
  const rows = [
    ['Copies', `${C.percent.toFixed(2)} % of lines in clones (${C.lines} of ${C.of}), ${n(C.clones, 'clone')}`, c ? `\`${c.a}\` = \`${c.b}\` (${c.lines} lines)` : ''],
    ['Spaghetti', `most ${S.most}, mean ${S.mean.toFixed(2)} over ${n(S.functions, 'function')}${S.unparsed.length ? `, ${n(S.unparsed.length, 'file')} not parsed` : ''}`, s ? `\`${s.at}\` ${s.name} (${s.complexity})` : ''],
    ['Dead code', `${n(D.files.length, 'file')}, ${n(D.exports.length, 'export')}, ${D.duplicates.length} exported twice`, dirs[0] ? `\`${dirs[0][0]}\`: ${n(dirs[0][1], 'export')}` : ''],
    ['Cycles', `${Y.cycles.length}${Y.unfollowed.length ? ` (madge could not follow ${n(Y.unfollowed.length, 'import')})` : ''}`, Y.cycles[0] ? Y.cycles[0].map((f) => `\`${f}\``).join(' → ') : ''],
    ['Size', `${Z.code} lines of code in ${n(Z.files, 'file')}`, big ? `\`${big.folder}\`: ${big.code}` : ''],
    ['Settings', `${n(T.branches.length, 'mode branch')}, ${n(T.numbers.length, 'hand-set number')} (the audit's ${T.numbers.filter((x) => x.audit).length}), ${n(T.reads.length, 'flag read')}`, modes[0] ? `${modes[0][0]}: ${n(modes[0][1], 'branch')}` : ''],
    ['Dependencies', `${deps} direct (${devs} dev) in ${P.length} package.json`, P.filter((p) => p.dependencies.length + p.dev.length).map((p) => `${dirname(p.at)}: ${p.dependencies.length} + ${p.dev.length} dev`).join(', ')],
  ];
  const out = [`Code gates · ${paths.join(' ')} · ${files} files · ${commit} · .gate/health.json`, '', '| Gate | Measure | Where most |', '| --- | --- | --- |',
    ...rows.map((r) => `| ${r.join(' | ')} |`), ''];
  const list = (title, items) => items.length && out.push(title, ...items.map((x) => `  ${x}`));
  list('Largest clones', C.largest.slice(0, 10).map((x) => `${String(x.lines).padStart(4)} lines  ${x.a} = ${x.b}`));
  list('Most complex functions', S.top.map((x) => `${String(x.complexity).padStart(4)}  ${x.at}  ${x.name}`));
  list('Not parsed', S.unparsed);
  list('Dead files', D.files);
  list('Exported twice', D.duplicates.map((x) => `${x.at}  ${x.names.join(' = ')}`));
  list('Dead exports by folder', dirs.map(([d, n]) => `${String(n).padStart(4)}  ${d}`));
  list('Cycles', Y.cycles.map((cy) => cy.join(' → ')));
  list('Imports madge could not follow', Y.unfollowed);
  list('Lines of code by folder', Z.folders.map((d) => `${String(d.code).padStart(6)}  ${d.folder} (${d.files} files)`));
  list('Mode branches', modes.map(([on, n]) => `${String(n).padStart(4)}  ${on}: ${T.branches.filter((b) => b.on === on).map((b) => b.at).join(', ')}`));
  list('Hand-set numbers by folder', count(T.numbers, (x) => dirname(x.at)).map(([d, n]) => `${String(n).padStart(4)}  ${d}`));
  list('The audit\'s, still set', T.numbers.filter((x) => x.audit).map((x) => `${x.at}  ${x.name} = ${x.value}`));
  list('Flag reads', count(T.reads, (x) => x.flag).map(([flag, n]) => `${String(n).padStart(4)}  ${flag}`));
  list('Dependencies', P.map((p) => `${p.at}: ${[...p.dependencies, ...p.dev.map((d) => `${d} (dev)`)].join(', ') || 'none'}`));
  return out.join('\n');
}
