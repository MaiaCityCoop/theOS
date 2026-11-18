// The code gates (intent 0038; the intents skill, "Define: the architecture pass"): what a change does to the code over
// the paths it touches, as one table (Markdown, to paste into an intent) and whole in .gate/health.json.
//
//   bun tools/health.js [path…] [--json]   the gates over the paths (each from the current directory, else from
//                                          TheGame/; none: all of TheGame): their .js files as git sees them (tracked,
//                                          or new and not ignored). --json: health.json on stdout instead of the table
//   bun tools/health.js --base <ref> [path…] [--ceiling n] [--json]
//                                          the same here and as the code was where <ref> and HEAD part (their merge
//                                          base, unpacked in a folder of its own), each gate's change beside it; with no
//                                          path, over the folders the change touches (their own files). It fails (exit
//                                          1) where a gate got worse: more lines in clones, or a new clone; a function
//                                          the change touches over the ceiling (--ceiling: Define's; else eslint's own
//                                          default for `complexity`) and not as complex at the base; a new unused file
//                                          or export; a new cycle; more mode branches or hand-set numbers; a new
//                                          dependency that no intent the change touches names. CI runs it on every PR.
//                                          A change that reverts a commit M of the base's line is measured against the
//                                          state it restores, the base with M undone (M's first parent, where nothing
//                                          came after M): a pure revert shows no change, and whatever else the change
//                                          does is measured as ever.
//
//   Copies        jscpd, clones of 50 tokens or more: the share of lines that are in one, and the largest
//   Spaghetti     eslint's `complexity` (cyclomatic) of every function: the most, the mean, the 20 most
//   Dead code     knip (knip.jsonc): files nothing imports, exports nothing imports, things exported under two names
//   Cycles        madge --circular: the import cycles through the paths, and the imports madge could not follow
//   Size          lines of code (a line with code on it: not blank, not only a comment), by folder
//   Settings      mode branches (TRUTH-like): every place a condition asks a mode, a constant true or false for the
//                 whole run (one the address sets, as `?truth` sets TRUTH, or one set by hand): in the condition of an
//                 if, ?:, loop or switch, or left of &&, || or ??, by the flags each is made from. Hand-set numbers:
//                 every module constant, or number in a constant's table, written as a number by hand (a literal,
//                 arithmetic of them, Math's, or a value made of them alone: TSL's vec2, vec3, vec4, color, float,
//                 three's Vector2, Vector3, Vector4, Color, Matrix3, Matrix4; not one all 0 or all 1, an identity; not
//                 what a uniform starts at, nor an array's size), and those the SSOT audit (research_notes/0038-ssot-
//                 audit.md) names however they are written (marked). Not hand-set: the exported values of a module
//                 named physics.js (physical: the one place physical constants live), budget.js (required: the
//                 intent's requirements, its hard gates and their split) or method.js (method: a published method's
//                 own defining constants, as a filter's σ and its tile), each saying its source in its comment
//                 (`source: …`), and a physical one or a requirement its unit too (`unit: …`); --base fails where one
//                 does not. Flag reads: every call of flag, flagNum and flagText (src/core/flags.js)
//   Pipelines     what a start of the world compiles (tools/smoke.js --json, run in each tree: the world made on the
//                 GPU's stand-in as src/boot.js makes it, every material as each pass draws it and every compute pass
//                 built): its distinct render pipelines (a vertex and a fragment stage), distinct compute pipelines,
//                 the distinct shader modules they hold and those modules' WGSL bytes, all by their WGSL text, not by
//                 object. Shown with its change against the base, never failing: a feature adds what it needs, and the
//                 count comes down through shared passes, whose trend the hourly scoreboard keeps
//   Dependencies  the direct dependencies of every package.json in the repository
//
// No node on the path: jscpd and knip are run by bun from their files, eslint and madge through their own APIs.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { Linter } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import madge from 'madge';

const GAME = resolve(import.meta.dirname, '..'), REPO = resolve(GAME, '..'), OUT = join(GAME, '.gate/health.json');
const JSCPD = join(GAME, 'node_modules/jscpd/run-jscpd.js'), KNIP = join(GAME, 'node_modules/knip/bin/knip-bun.js');
const READS = new Set(['flag', 'flagNum', 'flagText']);   // how the address is read (src/core/flags.js)
// the hand-set numbers the SSOT audit names, by the file each is set in (not ERROR_PX, the one dial; DRAWN is a mode).
// The code must hold each, or every run fails (staleAudit): a change that takes one away drops it here too
const AUDIT = { 'tier.js': ['MAXP'], 'terrain.js': ['CAP'],
  'crowd.js': ['SWELL', 'WIN', 'CLUMPS', 'VIEWS', 'CELL', 'TILE', 'TILES', 'SWITCH', 'FADE', 'RATIO'].map((k) => `CROWD.${k}`) };
const COMPLEXITY = builtinRules.get('complexity');

const fail = (why) => { console.error(`health: ${why}`); process.exit(1); };
const run = (cmd, args, cwd = GAME) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
const git = (...args) => { const r = run('git', args); return r.status ? fail(`git ${args.join(' ')}: ${r.stderr.trim()}`) : r.stdout.split('\n').filter(Boolean); };
const ARGS = process.argv.slice(2), TAKES = ['--base', '--ceiling'];
const valueOf = (name) => (ARGS.includes(name) ? ARGS[ARGS.indexOf(name) + 1] ?? fail(`${name} wants a value`) : undefined);
const REF = valueOf('--base'), CEILING = +(valueOf('--ceiling') ?? COMPLEXITY.meta.defaultOptions[0]);
const at = (f, line) => `${f}:${line}`, fileOf = (place) => place.slice(0, place.lastIndexOf(':')), nameOf = (n) => n.name ?? n.value;

// ---- what is measured: the paths asked for, else (against a base) the folders the change touches, else all of TheGame ----
/** The base a change is measured against: where <ref> and HEAD part; or, where the change reverts a commit M of that
    base's line, the state that revert restores: the base with M undone (as git revert undoes it), which is M's first
    parent where nothing came after M. M is the commit a "This reverts commit M" of the change's own commits names (git
    revert), else the newest commit of the base's line all of whose paths the change touches and leaves as they are with
    M undone. [the base: a commit, or the tree with M undone; M, or null]. */
function baseOf(ref) {
  const base = git('merge-base', ref, 'HEAD')[0], M = revertOf(base, null), T = M && depthOf(M) % 2 === 0 && undone(base, M);
  return T ? [T, M] : [base, null];
}
const ok = (...args) => run('git', args).status === 0;
/** The commit a change from `base` to `head` (a commit; null: the working tree) reverts: the one a "This reverts commit
    K" of the change's own commits names, on the base's line; else the newest commit of the base's line all of whose
    paths the change touches and leaves as they are with it undone. null where it reverts none. */
function revertOf(base, head) {
  const to = head ? [head] : [], touched = new Set(git('diff', '--name-only', base, ...to, '--', ':/'));
  const named = [...git('log', '--format=%B', `${base}..${head ?? 'HEAD'}`).join('\n').matchAll(/This reverts commit ([0-9a-f]{7,40})/g)].map((m) => m[1]).find((K) => ok('merge-base', '--is-ancestor', K, base));
  const restores = ({ sha, paths }) => paths.length && paths.every((p) => touched.has(p)) && ok('diff', '--quiet', undone(base, sha), ...to, '--', ...paths.map((p) => `:/${p}`));
  return named ?? firstParents(base).find(restores)?.sha ?? null;
}
/** How deep a commit lies in a chain of reverts: 0, a change of its own; 1, the revert of one; 2, the revert of that.
    Undoing one of an even depth goes back to the state before it; undoing one of an odd depth (a revert) brings back
    what it took out, which is measured as new. */
const depthOf = (c) => { const K = ok('rev-parse', '--verify', '-q', `${c}^1`) && revertOf(`${c}^1`, c); return K ? 1 + depthOf(K) : 0; };
/** The tree of `base` with commit M undone, as git revert undoes it (null where that does not merge cleanly). */
const undone = (base, M) => { const r = run('git', ['merge-tree', '--write-tree', `--merge-base=${M}`, base, `${M}^1`]); return r.status === 0 ? r.stdout.split('\n')[0] : null; };
/** The commits of a commit's first-parent line, newest first, each with the paths it changed from its first parent. */
function firstParents(c) {
  const out = [];
  for (const l of git('log', '--first-parent', '--format=@%H', '--name-only', c)) if (l.startsWith('@')) out.push({ sha: l.slice(1), paths: [] }); else out.at(-1).paths.push(l);
  return out;
}
const [BASE, REVERTED] = REF ? baseOf(REF) : [];
const CHANGED = BASE ? [...git('diff', '--name-only', '--relative', BASE), ...git('ls-files', '-o', '--exclude-standard')] : [];
function inGame(p) {
  const abs = [resolve(p), resolve(GAME, p)].find((q) => existsSync(q)) ?? fail(`no ${p}`), rel = relative(GAME, abs);
  return rel.startsWith('..') ? fail(`${p} is outside TheGame`) : rel || '.';
}
const wanted = ARGS.filter((a, i) => !a.startsWith('--') && !TAKES.includes(ARGS[i - 1]));
const AREA = wanted.length ? wanted.map((p) => ({ path: inGame(p) }))
  : BASE ? [...new Set(CHANGED.filter((f) => f.endsWith('.js')).map(dirname))].sort().map((folder) => ({ folder })) : [{ path: '.' }];
const inArea = (f) => f.endsWith('.js') && AREA.some((a) => (a.folder !== undefined ? dirname(f) === a.folder : a.path === '.' || f === a.path || f.startsWith(`${a.path}/`)));
const HERE_FILES = [...new Set(git('ls-files', '-co', '--exclude-standard'))].filter((f) => inArea(f) && existsSync(join(GAME, f))).sort();
const BASE_FILES = BASE ? git('ls-tree', '-r', '--name-only', BASE).filter(inArea).sort() : [];
if (!BASE && !HERE_FILES.length) fail(`no .js files in ${wanted.join(' ') || 'TheGame'}`);

/** The repository as it was at a commit, unpacked in a folder of its own (git archive), its TheGame/ given this one's
    packages (a link) and knip's config, so that it is measured as this one is. Gone again on exit. */
function unpack(commit) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'health-'))), game = join(repo, 'TheGame'), modules = join(game, 'node_modules');
  process.on('exit', () => { if (existsSync(modules)) unlinkSync(modules); rmSync(repo, { recursive: true, force: true }); });   // (the link first: never this one's packages)
  const tar = spawnSync('git', ['archive', commit], { cwd: REPO, maxBuffer: 1 << 30 });
  if (tar.status || spawnSync('tar', ['-x', '-C', repo], { input: tar.stdout }).status) fail(`could not unpack ${commit}`);
  symlinkSync(join(GAME, 'node_modules'), modules);
  copyFileSync(join(GAME, 'knip.jsonc'), join(game, 'knip.jsonc'));
  return { repo, game };
}

// ---- every module read once, by eslint's parser: its functions' complexity, its lines of code, its bindings ----
let REPORTED = [];   // what eslint's own complexity rule reports of the module being read: each function, its node, its complexity
const HEALTH = { rules: { complexity: { meta: COMPLEXITY.meta, create: (context) => COMPLEXITY.create(Object.create(context, { report: { value: (d) => REPORTED.push(d) } })) } } };
const CONFIG = [{ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }, linterOptions: { noInlineConfig: true }, plugins: { health: HEALTH }, rules: { 'health/complexity': ['error', 0] } }];
const linter = new Linter({ cwd: '/' });
/** A tree of the game to measure: its TheGame/ (root) and the .js files measured there (from root); each module is
    read once (mods), each binding reckoned once (made). */
const treeOf = (root, files) => ({ root, files, in: new Set(files), mods: new Map(), made: new Map() });
/** A module, by its path from its tree's root: its functions (complexity, lines), its lines of code, and its module
    scope's imports, constants and exports (none where it could not be parsed: `broken` says why). */
const mod = (t, f) => (t.mods.has(f) ? t.mods.get(f) : t.mods.set(f, parse(t, f)).get(f));
function parse(t, f) {
  REPORTED = [];
  const text = readFileSync(join(t.root, f), 'utf8'), said = linter.verify(text, CONFIG, { filename: join(t.root, f) }), broken = said.find((x) => x.fatal);
  const fns = REPORTED.map((d) => ({ at: at(f, d.loc.start.line), name: d.data.name, complexity: d.data.complexity, from: Math.min(d.loc.start.line, d.node.loc.start.line), to: d.node.loc.end.line }));
  if (broken) return { t, f, fns, broken: `${at(f, broken.line)}: ${broken.message}`, code: text.split('\n').filter((l) => /\S/.test(l)).length, consts: new Map() };
  const sc = linter.getSourceCode(), lines = new Set();
  for (const k of sc.ast.tokens) for (let l = k.loc.start.line; l <= k.loc.end.line; l++) lines.add(l);
  return { t, f, fns, sc, code: lines.size, ...bindings(t, f, sc) };
}
/** A module's own bindings: what it imports (local name: from where, under what name), its constants, what it exports
    (name: its local name, or where it is re-exported from) and the modules it re-exports whole. */
function bindings(t, f, sc) {
  const scope = sc.scopeManager.globalScope.childScopes.find((s) => s.type === 'module'), imports = new Map(), consts = new Map(), exports = new Map(), stars = [];
  for (const v of scope.variables) if (v.defs[0]?.type === 'ImportBinding') imports.set(v.name, { from: target(t, f, v.defs[0].parent.source.value), name: imported(v.defs[0].node) });
  for (const s of sc.ast.body) {
    const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
    if (d?.type === 'VariableDeclaration' && d.kind === 'const') for (const v of d.declarations) if (v.id.type === 'Identifier' && v.init) consts.set(v.id.name, v);
    if (s.type === 'ExportNamedDeclaration') exportsOf(t, f, s, exports);
    if (s.type === 'ExportAllDeclaration' && !s.exported) stars.push(target(t, f, s.source.value));
  }
  return { scope, imports, consts, exports, stars };
}
const imported = (s) => (s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : nameOf(s.imported));
function exportsOf(t, f, s, out) {
  for (const id of s.declaration ? (s.declaration.declarations ?? [s.declaration]).map((x) => x.id) : []) if (id?.type === 'Identifier') out.set(id.name, id.name);
  for (const x of s.specifiers) out.set(nameOf(x.exported), s.source ? { from: target(t, f, s.source.value), name: nameOf(x.local) } : nameOf(x.local));
}
/** The module an import names, by its path from its tree's root (null: a package's, or none). */
function target(t, f, spec) {
  const p = spec.startsWith('.') && resolve(t.root, dirname(f), spec);
  return p && existsSync(p) ? relative(t.root, p) : null;
}

// ---- modes: what a module's constant is made from ----
/** What a module's binding is made from: the flags of the address it reads, through every constant and import it is
    made of, and whether it is a mode, true or false for the whole run (a mode no flag makes is its own). null: it is
    no constant of a module's. Reckoned once; null while it is reckoned, so an import cycle ends. */
function made(t, f, name) {
  const key = `${f}#${name}`;
  if (!t.made.has(key)) t.made.set(key, null).set(key, reckon(mod(t, f), name));
  return t.made.get(key);
}
function reckon(m, name) {
  const imp = m.imports?.get(name), v = m.consts.get(name);
  if (imp) return imp.from && exported(m.t, imp.from, imp.name);
  if (!v) return null;
  const flags = new Set(), mode = isBool(m, v.init), inside = (n) => n.range[0] >= v.init.range[0] && n.range[1] <= v.init.range[1];
  for (const r of m.scope.references) if (r.resolved?.scope === m.scope && inside(r.identifier)) for (const x of flagsOf(m, r.identifier)) flags.add(x);
  return { mode, flags: mode && !flags.size ? [name] : [...flags] };
}
const flagsOf = (m, id) => (readOf(id) ? [readOf(id)] : made(m.t, m.f, id.name)?.flags ?? []);
/** made() of what a module exports under a name, through its re-exports. */
function exported(t, f, name) {
  const key = `${f}@${name}`;
  if (!t.made.has(key)) t.made.set(key, null).set(key, reexport(mod(t, f), name));
  return t.made.get(key);
}
function reexport(m, name) {
  const e = m.exports?.get(name);
  if (typeof e === 'string') return made(m.t, m.f, e);
  if (e) return e.from && exported(m.t, e.from, e.name);
  for (const s of m.stars ?? []) { const x = s && exported(m.t, s, name); if (x) return x; }
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
  Identifier: (m, n) => !!made(m.t, m.f, n.name)?.mode,
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
// a value TSL's or three's value constructors make of numbers alone is a number set by hand too (a number hidden in a
// vector is still one); what a uniform starts at, an array's size and the like are not values written by hand
const VALUE = { call: /^(vec[234]|color|float)$/, new: /^(Vector[234]|Color|Matrix[34])$/ };
const calleeName = (c) => (c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : '');
const ofNumbers = (n) => n.arguments.length > 0 && n.arguments.every(isNumber);
const NUMBER = {   // which expressions are numbers written by hand: literals, arithmetic of them, Math's, and values made of them
  Literal: (n) => typeof n.value === 'number',
  UnaryExpression: (n) => ['-', '+', '~'].includes(n.operator) && isNumber(n.argument),
  BinaryExpression: (n) => ARITH.has(n.operator) && isNumber(n.left) && isNumber(n.right),
  CallExpression: (n) => (isMath(n.callee) || VALUE.call.test(calleeName(n.callee))) && ofNumbers(n),
  NewExpression: (n) => VALUE.new.test(calleeName(n.callee)) && ofNumbers(n),
  MemberExpression: isMath,
};
const isNumber = (n) => !!NUMBER[n.type]?.(n);
/** Whether a value is an identity, no setting: a vector all of whose components are 0, or all 1 (vec4(0), vec3(1)). */
const identity = (n) => /Call|New/.test(n.type) && n.arguments.length > 0 && [0, 1].some((k) => n.arguments.every((a) => a.type === 'Literal' && a.value === k));
const frozen = (n) => (n.type === 'CallExpression' && n.callee.object?.name === 'Object' && n.callee.property?.name === 'freeze' && n.arguments[0]) || n;
/** Whether a module has a constant by a name (a table's key: NAME.KEY). */
function holds(m, name) {
  const [head, ...keys] = name.split('.');
  let n = m.consts.get(head)?.init;
  for (const k of keys) n = n && frozen(n).type === 'ObjectExpression' ? frozen(n).properties.find((p) => p.type === 'Property' && nameOf(p.key) === k)?.value : undefined;
  return !!n;
}
/** The audit's names this code no longer has, AUDIT gone stale ("file name" each): looked for in this tree's files of
    that name, whatever is measured. */
function staleAudit() {
  const t = treeOf(GAME, []), all = git('ls-files', '-co', '--exclude-standard').filter((f) => existsSync(join(GAME, f)));
  return Object.entries(AUDIT).flatMap(([file, names]) => {
    const ms = all.filter((f) => basename(f) === file).map((f) => mod(t, f)).filter((m) => m.sc);
    return names.filter((name) => !ms.some((m) => holds(m, name))).map((name) => `${file} ${name}`);
  });
}
/** A module constant's hand-set numbers, into out: itself, or the numbers of its table (frozen or not), by key. */
function numbers(m, name, init, out) {
  const n = frozen(init), text = m.sc.getText(n), audit = !!AUDIT[basename(m.f)]?.includes(name);
  if (n.type === 'ObjectExpression') for (const p of n.properties) if (p.type === 'Property' && !p.computed) numbers(m, `${name}.${nameOf(p.key)}`, p.value, out);
  if (audit || (isNumber(n) && !identity(n) && /\d/.test(text))) out.push({ at: at(m.f, n.loc.start.line), name, value: text, ...(audit && { audit }) });
}
/** The modules whose exported values are no hand-set numbers, each module the list of its kind, and what each value's
    comment says: a physics.js holds the physical constants and a budget.js the intent's requirements (its hard gates
    and their split), each with its unit and its source; a method.js a published method's own defining constants (a
    filter's σ, its tile), each with its source (its unit, where it has one, is not asked: a count or a ratio has none). */
const CONTRACT = {
  'physics.js': { kind: 'physical', holds: 'a physical constant (physics.js)', says: ['unit', 'source'] },
  'budget.js': { kind: 'required', holds: 'a requirement (budget.js)', says: ['unit', 'source'] },
  'method.js': { kind: 'method', holds: "a published method's constant (method.js)", says: ['source'] },
};
const KINDS = Object.values(CONTRACT).map((c) => c.kind), HOLDS = Object.fromEntries(Object.values(CONTRACT).map((c) => [c.kind, c]));
/** The contract a module constant is under (CONTRACT), where it is an exported value (not a function) of such a module;
    else null. */
const contracted = (m, name) => (CONTRACT[basename(m.f)] && [...m.exports.values()].includes(name) && !/Function/.test(m.consts.get(name).init.type) ? CONTRACT[basename(m.f)] : null);
/** Whether a constant's comment (before its statement, not on the line the one before ends on, or after it on its own
    last line) says each thing its contract asks (`unit: …`, `source: …`). */
function sourced(m, v, says) {
  const s = v.parent.parent?.type === 'ExportNamedDeclaration' ? v.parent.parent : v.parent, before = m.sc.getTokenBefore(s)?.loc.end.line ?? 0;
  const said = [...m.sc.getCommentsBefore(s).filter((c) => c.loc.start.line > before), ...m.sc.getCommentsAfter(s).filter((c) => c.loc.start.line === s.loc.end.line)].map((c) => c.value).join(' ');
  return says.every((w) => new RegExp(`\\b${w}s?:\\s*\\S`, 'i').test(said));
}
/** A module's constants: each under a contract (physical, required, method; a vector or a table one constant), those
    whose comment does not say what it asks among them, and the hand-set numbers of the rest. */
function constants(m, S) {
  for (const [name, v] of m.consts) {
    const k = contracted(m, name);
    if (!k) { numbers(m, name, v.init, S.numbers); continue; }
    const c = { at: at(m.f, v.loc.start.line), name, value: m.sc.getText(v.init), kind: k.kind };
    S[k.kind].push(c);
    if (!sourced(m, v, k.says)) S.unsourced.push(c);
  }
}

// ---- the gates, over a tree ----
function copies(t) {
  if (!t.files.length) return { percent: 0, lines: 0, of: 0, clones: 0, largest: [] };
  const dir = mkdtempSync(join(tmpdir(), 'health-jscpd-')), report = join(dir, 'jscpd-report.json');
  try {
    const r = run(process.execPath, [JSCPD, '--min-tokens', '50', '--reporters', 'json,silent', '--output', dir, '--absolute', ...t.files], t.root);
    if (!existsSync(report)) fail(`jscpd: ${r.stderr || r.stdout}`);
    const j = JSON.parse(readFileSync(report, 'utf8')), T = j.statistics.total, end = (x) => `${relative(t.root, x.name)}:${x.start}-${x.end}`;
    const key = (d) => createHash('sha1').update(d.fragment.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);   // (a clone is the same where its code is)
    return { percent: T.percentage, lines: T.duplicatedLines, of: T.lines, clones: T.clones,
      largest: j.duplicates.map((d) => ({ lines: d.lines, tokens: d.tokens, a: end(d.firstFile), b: end(d.secondFile), key: key(d) })).sort((x, y) => y.lines - x.lines) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function spaghetti(t) {
  const fns = t.files.flatMap((f) => mod(t, f).fns).sort((a, b) => b.complexity - a.complexity);
  return { functions: fns.length, most: fns[0]?.complexity ?? 0, mean: fns.reduce((s, x) => s + x.complexity, 0) / (fns.length || 1), top: fns.slice(0, 20),
    ceiling: CEILING, over: fns.filter((x) => x.complexity > CEILING), unparsed: t.files.map((f) => mod(t, f).broken).filter(Boolean) };
}
function dead(t) {
  if (!t.files.length) return { files: [], exports: [], duplicates: [] };
  const r = run(process.execPath, [KNIP, '--reporter', 'json', '--no-progress', '--no-exit-code', '--no-config-hints', '--include', 'files,exports,duplicates'], t.root);
  if (r.status !== 0) fail(`knip: ${r.stderr || r.stdout}`);
  const rows = JSON.parse(r.stdout).issues.filter((i) => t.in.has(i.file));
  return { files: rows.filter((i) => i.files.length).map((i) => i.file), exports: rows.flatMap((i) => i.exports.map((x) => ({ at: at(i.file, x.line), name: x.name }))),
    duplicates: rows.flatMap((i) => i.duplicates.map((g) => ({ at: at(i.file, g[0].line), names: g.map((x) => x.name) }))) };
}
async function cycles(t) {
  if (!t.files.length) return { cycles: [], unfollowed: [] };
  const res = await madge(t.files.map((f) => join(t.root, f)), { baseDir: t.root, fileExtensions: ['js'], includeNpm: false });
  return { cycles: res.circular().filter((c) => c.some((f) => t.in.has(f))), unfollowed: res.warnings().skipped.filter((s) => /^[./]/.test(s)) };
}
function size(t) {
  const by = {};
  for (const f of t.files) { const d = (by[dirname(f)] ??= { folder: dirname(f), files: 0, code: 0 }); d.files++; d.code += mod(t, f).code; }
  const folders = Object.values(by).sort((a, b) => a.folder.localeCompare(b.folder));
  return { files: t.files.length, code: folders.reduce((s, d) => s + d.code, 0), folders };
}
function settings(t) {
  const S = { branches: [], numbers: [], ...Object.fromEntries(KINDS.map((k) => [k, []])), unsourced: [], reads: [] };
  for (const m of t.files.map((f) => mod(t, f)).filter((x) => x.sc)) {
    for (const r of m.sc.scopeManager.scopes.flatMap((s) => s.references)) {
      const id = r.identifier, line = at(m.f, id.loc.start.line), read = readOf(id);
      const what = read ? { mode: true, flags: [read] } : r.resolved?.scope === m.scope && made(t, m.f, id.name);   // (a module's own bindings and imports)
      if (read) S.reads.push({ at: line, flag: read });
      if (what?.mode && inTest(read ? id.parent : id)) S.branches.push({ at: line, on: what.flags.join(' ') });
    }
    constants(m, S);
  }
  return S;
}
/** The direct dependencies of each package.json among a tree of the repository's files (from its root, repo). */
const dependencies = (repo, files) => files.filter((p) => basename(p) === 'package.json').map((p) => {
  const j = JSON.parse(readFileSync(join(repo, p), 'utf8'));
  return { at: p, dependencies: Object.keys({ ...j.dependencies, ...j.optionalDependencies, ...j.peerDependencies }), dev: Object.keys(j.devDependencies ?? {}) };
});
/** What a start of the world compiles, by WGSL text (tools/smoke.js --json, run in the tree's TheGame/, `game`):
    { render, compute, modules, bytes, failed: how many builds threw }; null where that tree's smoke.js does not count
    them. */
function pipelines(game) {
  const r = run(process.execPath, ['tools/smoke.js', '--json'], game);
  try { const j = JSON.parse(r.stdout.trim().split('\n').at(-1)); return j.world.pipelines ? { ...j.world.pipelines, failed: j.failed.length } : null; } catch { return null; }
}
const PIPES = ['render', 'compute', 'modules', 'bytes'];
async function measure(root, files, repo, all) {
  const t = treeOf(root, files);
  return { files: files.length, copies: copies(t), spaghetti: spaghetti(t), dead: dead(t), cycles: await cycles(t), size: size(t), settings: settings(t), pipelines: pipelines(root), dependencies: dependencies(repo, all) };
}

// ---- against the base: what the change made of each gate ----
/** The lines of each file (from TheGame/) the change touches, numbered as the file is now. */
function touchedLines() {
  const lines = new Map();
  let f = null;
  for (const l of git('diff', '-U0', '--no-color', '--relative', BASE)) {
    if (l.startsWith('+++ ')) f = l === '+++ /dev/null' ? null : l.slice(6);
    const h = f && l.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/), from = h && +h[1], k = h && (h[2] === undefined ? 1 : +h[2] || 2);   // (a hunk that only takes lines away touches the two it leaves together)
    for (let i = from; h && i < from + k; i++) (lines.get(f) ?? lines.set(f, new Set()).get(f)).add(i);
  }
  return lines;
}
/** A cycle as one string, from its first file in order: the same cycle read from anywhere in it is the same. */
const ring = (c) => { const i = c.indexOf([...c].sort()[0]); return [...c.slice(i), ...c.slice(0, i)].join(' → '); };
/** Where a count rose from the base to here, by key: [key, by how much]. */
function rose(B, H, key) {
  const c = new Map();
  for (const [list, by] of [[H, 1], [B, -1]]) for (const x of list) c.set(key(x), (c.get(key(x)) ?? 0) + by);
  return [...c].filter(([, k]) => k > 0);
}
/** What changed from the base (B) to here (H), gate by gate, over the same paths. */
function change(B, H) {
  const lines = touchedLines(), was = new Set(BASE_FILES), keys = (list, key) => new Set(list.map(key)), exportKey = (x) => `${fileOf(x.at)}#${x.name}`;
  const touched = (fn) => !was.has(fileOf(fn.at)) || Array.from({ length: fn.to - fn.from + 1 }, (_, i) => fn.from + i).some((l) => lines.get(fileOf(fn.at))?.has(l));
  const asBefore = (fn) => B.spaghetti.over.some((b) => fileOf(b.at) === fileOf(fn.at) && b.name === fn.name && b.complexity >= fn.complexity);
  const clones = keys(B.copies.largest, (c) => c.key), unused = keys(B.dead.exports, exportKey), cycled = keys(B.cycles.cycles, ring), set = keys(B.settings.numbers, exportKey);
  return {
    copies: { lines: H.copies.lines - B.copies.lines, clones: H.copies.largest.filter((c) => !clones.has(c.key)) },
    spaghetti: { mean: H.spaghetti.mean - B.spaghetti.mean, over: H.spaghetti.over.filter((fn) => touched(fn) && !asBefore(fn)) },
    dead: { files: H.dead.files.filter((f) => !B.dead.files.includes(f)), exports: H.dead.exports.filter((x) => !unused.has(exportKey(x))) },
    cycles: H.cycles.cycles.filter((c) => !cycled.has(ring(c))),
    size: H.size.code - B.size.code,
    settings: { branches: { change: H.settings.branches.length - B.settings.branches.length, rose: rose(B.settings.branches, H.settings.branches, (b) => `${b.on} in ${fileOf(b.at)}`) },
      numbers: { change: H.settings.numbers.length - B.settings.numbers.length, new: H.settings.numbers.filter((x) => !set.has(exportKey(x))) },
      ...Object.fromEntries(KINDS.map((k) => [k, H.settings[k].length - B.settings[k].length])), unsourced: H.settings.unsourced, reads: H.settings.reads.length - B.settings.reads.length },
    pipelines: H.pipelines && B.pipelines ? { was: B.pipelines, is: H.pipelines } : null,
    dependencies: added(B.dependencies, H.dependencies),
  };
}
/** The dependencies here that their package.json had not at the base, and whether an intent the change touches names each. */
function added(B, H) {
  const had = new Set(B.flatMap((p) => [...p.dependencies, ...p.dev].map((d) => `${p.at}#${d}`)));
  const intents = git('diff', '--name-only', BASE, '--', ':/Intents').map((p) => join(REPO, p)).filter((p) => existsSync(p)).map((p) => readFileSync(p, 'utf8')).join('\n');
  return H.flatMap((p) => [...p.dependencies, ...p.dev].filter((d) => !had.has(`${p.at}#${d}`)).map((d) => ({ at: p.at, name: d, named: intents.includes(d) })));
}
/** Each way the change made a gate worse than at the base, in words: the run fails on any. */
const worse = (D) => [
  ...(D.copies.lines > 0 ? [`copies: ${D.copies.lines} more lines in clones`] : []),
  ...D.copies.clones.map((c) => `copies: a new clone, ${c.a} = ${c.b} (${c.lines} lines)`),
  ...D.spaghetti.over.map((x) => `spaghetti: ${x.at} ${x.name}, complexity ${x.complexity}, over the ceiling of ${CEILING}`),
  ...D.dead.files.map((f) => `dead code: ${f}, a new unused file`),
  ...D.dead.exports.map((x) => `dead code: ${x.at} ${x.name}, a new unused export`),
  ...D.cycles.map((c) => `cycles: a new one, ${ring(c)}`),
  ...(D.settings.branches.change > 0 ? D.settings.branches.rose.map(([k, by]) => `settings: ${n(by, 'more mode branch')} on ${k}`) : []),
  ...(D.settings.numbers.change > 0 ? D.settings.numbers.new.map((x) => `settings: a new hand-set number, ${x.at} ${x.name} = ${x.value}`) : []),
  ...D.settings.unsourced.map((x) => `settings: ${x.at} ${x.name}, ${HOLDS[x.kind].holds} whose comment does not say its ${HOLDS[x.kind].says.join(' and its ')}`),
  ...D.dependencies.filter((d) => !d.named).map((d) => `dependencies: ${d.name} (${d.at}) is new, and no intent the change touches names it`),
];

// ---- the tables ----
function n(k, word) { return `${k} ${word}${k === 1 ? '' : word.endsWith('h') ? 'es' : 's'}`; }
function signed(x, digits = 0) { return (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(digits); }
function count(list, key) { return Object.entries(list.reduce((o, x) => ((o[key(x)] = (o[key(x)] ?? 0) + 1), o), {})).sort((a, b) => b[1] - a[1]); }
const cell = (rows) => rows.map((r) => `| ${r.join(' | ')} |`);
const SAID = {   // each gate's measure, in a cell
  Copies: (G) => `${G.copies.percent.toFixed(2)} % of lines in clones (${G.copies.lines} of ${G.copies.of}), ${n(G.copies.clones, 'clone')}`,
  Spaghetti: (G) => `most ${G.spaghetti.most}, mean ${G.spaghetti.mean.toFixed(2)} over ${n(G.spaghetti.functions, 'function')}${G.spaghetti.unparsed.length ? `, ${n(G.spaghetti.unparsed.length, 'file')} not parsed` : ''}`,
  'Dead code': (G) => `${n(G.dead.files.length, 'file')}, ${n(G.dead.exports.length, 'export')}, ${G.dead.duplicates.length} exported twice`,
  Cycles: (G) => `${G.cycles.cycles.length}${G.cycles.unfollowed.length ? ` (madge could not follow ${n(G.cycles.unfollowed.length, 'import')})` : ''}`,
  Size: (G) => `${G.size.code} lines of code in ${n(G.size.files, 'file')}`,
  Settings: (G) => `${n(G.settings.branches.length, 'mode branch')}, ${G.settings.numbers.length} hand-set (the audit's ${G.settings.numbers.filter((x) => x.audit).length}), ${KINDS.map((k) => `${G.settings[k].length} ${k}`).join(', ')}${G.settings.unsourced.length ? ` (${G.settings.unsourced.length} without unit or source)` : ''}, ${n(G.settings.reads.length, 'flag read')}`,
  Pipelines: ({ pipelines: p }) => (p ? `${p.render} render and ${p.compute} compute pipelines, ${n(p.modules, 'shader module')}, ${(p.bytes / 1024).toFixed(1)} KB of WGSL${p.failed ? ` (${n(p.failed, 'build')} threw)` : ''}` : 'not counted'),
  Dependencies: (G) => `${G.dependencies.reduce((s, p) => s + p.dependencies.length + p.dev.length, 0)} direct (${G.dependencies.reduce((s, p) => s + p.dev.length, 0)} dev) in ${G.dependencies.length} package.json`,
};
const WHERE = {   // where the most of each gate is, in a cell
  Copies: ({ copies: { largest: [c] } }) => (c ? `\`${c.a}\` = \`${c.b}\` (${c.lines} lines)` : ''),
  Spaghetti: ({ spaghetti: { top: [s] } }) => (s ? `\`${s.at}\` ${s.name} (${s.complexity})` : ''),
  'Dead code': (G) => count(G.dead.exports, (x) => dirname(x.at)).slice(0, 1).map(([d, k]) => `\`${d}\`: ${n(k, 'export')}`).join(''),
  Cycles: (G) => (G.cycles.cycles[0] ?? []).map((f) => `\`${f}\``).join(' → '),
  Size: (G) => [...G.size.folders].sort((a, b) => b.code - a.code).slice(0, 1).map((d) => `\`${d.folder}\`: ${d.code}`).join(''),
  Settings: (G) => count(G.settings.branches, (b) => b.on).slice(0, 1).map(([on, k]) => `${on}: ${n(k, 'branch')}`).join(''),
  Pipelines: () => 'a start of the world',
  Dependencies: (G) => G.dependencies.filter((p) => p.dependencies.length + p.dev.length).map((p) => `${dirname(p.at)}: ${p.dependencies.length} + ${p.dev.length} dev`).join(', '),
};
const CHANGE = {   // each gate's change from the base, in a cell
  Copies: (D) => `${signed(D.copies.lines)} lines in clones, ${n(D.copies.clones.length, 'new clone')}`,
  Spaghetti: (D) => `mean ${signed(D.spaghetti.mean, 2)}; ${n(D.spaghetti.over.length, 'touched function')} over ${CEILING} and more complex than before`,
  'Dead code': (D) => `${n(D.dead.files.length, 'new file')}, ${n(D.dead.exports.length, 'new export')}`,
  Cycles: (D) => `${D.cycles.length} new`,
  Size: (D) => `${signed(D.size)} lines of code`,
  Settings: (D) => `${signed(D.settings.branches.change)} mode branches, ${signed(D.settings.numbers.change)} hand-set, ${KINDS.map((k) => `${signed(D.settings[k])} ${k}`).join(', ')}, ${signed(D.settings.reads)} flag reads`,
  Pipelines: ({ pipelines: p }) => (p ? PIPES.map((k) => `${signed(p.is[k] - p.was[k])} ${k}`).join(', ') : 'not counted at the base'),
  Dependencies: (D) => D.dependencies.map((d) => `${d.name} (${dirname(d.at)}) new${d.named ? ', named in its intent' : ''}`).join(', ') || 'none new',
};
/** The gates against the base: here, there and the change, and what got worse. */
function against(G) {
  const rows = Object.keys(SAID).map((g) => [g, SAID[g](G), SAID[g](G.base), CHANGE[g](G.change)]);
  return [`Code gates · ${G.area.join(' ') || 'no .js touched'} · ${G.commit} against ${G.base.commit} (${G.base.ref}${G.base.reverts ? `: the state the revert of ${G.base.reverts} restores` : ''}) · .gate/health.json`, '',
    '| Gate | Here | Base | Change |', '| --- | --- | --- | --- |', ...cell(rows), '',
    ...(G.worse.length ? ['Worse than at the base:', ...G.worse.map((w) => `  ${w}`)] : ['Nothing is worse than at the base.'])].join('\n');
}
/** The gates: one table, and what they found. */
function table(G) {
  const out = [`Code gates · ${G.area.join(' ')} · ${n(G.files, 'file')} · ${G.commit} · .gate/health.json`, '', '| Gate | Measure | Where most |', '| --- | --- | --- |',
    ...cell(Object.keys(SAID).map((g) => [g, SAID[g](G), WHERE[g](G)])), ''];
  const list = (title, items) => items.length && out.push(title, ...items.map((x) => `  ${x}`));
  list('Largest clones', G.copies.largest.slice(0, 10).map((x) => `${String(x.lines).padStart(4)} lines  ${x.a} = ${x.b}`));
  list('Most complex functions', G.spaghetti.top.map((x) => `${String(x.complexity).padStart(4)}  ${x.at}  ${x.name}`));
  list('Not parsed', G.spaghetti.unparsed);
  list('Dead files', G.dead.files);
  list('Exported twice', G.dead.duplicates.map((x) => `${x.at}  ${x.names.join(' = ')}`));
  list('Dead exports by folder', count(G.dead.exports, (x) => dirname(x.at)).map(([d, k]) => `${String(k).padStart(4)}  ${d}`));
  list('Cycles', G.cycles.cycles.map(ring));
  list('Imports madge could not follow', G.cycles.unfollowed);
  list('Lines of code by folder', G.size.folders.map((d) => `${String(d.code).padStart(6)}  ${d.folder} (${n(d.files, 'file')})`));
  list('Mode branches', count(G.settings.branches, (b) => b.on).map(([on, k]) => `${String(k).padStart(4)}  ${on}: ${G.settings.branches.filter((b) => b.on === on).map((b) => b.at).join(', ')}`));
  list('Hand-set numbers by folder', count(G.settings.numbers, (x) => dirname(x.at)).map(([d, k]) => `${String(k).padStart(4)}  ${d}`));
  list('The audit\'s, still set', G.settings.numbers.filter((x) => x.audit).map((x) => `${x.at}  ${x.name} = ${x.value}`));
  list('Physical constants and requirements without their unit or source', G.settings.unsourced.map((x) => `${x.at}  ${x.name} (${x.kind})`));
  list('Flag reads', count(G.settings.reads, (x) => x.flag).map(([flag, k]) => `${String(k).padStart(4)}  ${flag}`));
  list('Dependencies', G.dependencies.map((p) => `${p.at}: ${[...p.dependencies, ...p.dev.map((d) => `${d} (dev)`)].join(', ') || 'none'}`));
  return out.join('\n');
}

// ---- the run ----
const stale = staleAudit();
if (stale.length) fail(`AUDIT names what the code no longer has (${stale.join(', ')}): drop it from AUDIT (tools/health.js)`);
const all = git('ls-files', '-co', '--exclude-standard', '--full-name', '--', ':/').filter((p) => existsSync(join(REPO, p)));
const HERE = await measure(GAME, HERE_FILES, REPO, all);
const H = { commit: git('rev-parse', '--short', 'HEAD')[0] + (git('status', '--porcelain').length ? '+' : ''), at: new Date().toISOString(),
  area: AREA.map((a) => (a.folder !== undefined ? `${a.folder}/*` : a.path)), ...HERE };
if (BASE) {
  const { repo, game } = unpack(BASE);
  H.base = { ref: REF, commit: BASE.slice(0, 7), reverts: REVERTED?.slice(0, 7) ?? null, ...(await measure(game, BASE_FILES, repo, git('ls-tree', '-r', '--name-only', '--full-tree', BASE))) };
  H.change = change(H.base, HERE);
  H.worse = worse(H.change);
  process.exitCode = H.worse.length ? 1 : 0;
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(H, null, 1));
console.log(ARGS.includes('--json') ? JSON.stringify(H, null, 1) : BASE ? against(H) : table(H));
