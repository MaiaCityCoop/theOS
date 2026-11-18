// The lint (intent 0038): what a merge can break that `vite build` does not see, said with its file and line on every
// push. One side's import line taken where the other side's code still reads a name from it leaves the name unbound,
// and the page throws a ReferenceError only as it builds a shader. So, over the game's code and its tools:
//   - a name used and never bound (eslint's no-undef). What is bound without an import is the platform's: for the
//     game's code the page's and a worker's, as TypeScript declares them (lib.dom.d.ts, lib.webworker.d.ts: knip
//     brings TypeScript), and WebGPU's, which it does not declare yet (every name of it is GPU and a capital: the
//     spec's); for the tools Bun's own as well; none is listed by hand;
//   - an import that resolves to nothing (a file, a package, a Vite suffix taken off: ?url, ?raw, ?worker), and a
//     file a worker or an asset is loaded from (`new URL('….js', import.meta.url)`) likewise;
//   - a name imported, or exported again, that its module does not export: a file's exports read from its own code
//     (`export * from` followed), a package's from the package itself, loaded.
//
//   bun tools/lint.js [path…]     the game's folders and its tools (or the paths given): a line a problem, exit 1 if any
import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { Linter } from 'eslint';

const GAME = resolve(import.meta.dirname, '..'), linter = new Linter();
const CODE = ['src', 'assets', 'biomes', 'camera', 'characters', 'cine', 'materials', 'world'], TOOLS = ['tools', 'vite.config.js'];
const declared = (lib) => [...readFileSync(join(GAME, 'node_modules/typescript/lib', lib), 'utf8').matchAll(/^declare (?:var|function) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const readonly = (names) => Object.fromEntries([...names].map((k) => [k, 'readonly']));
const PAGE = readonly(new Set([...declared('lib.dom.d.ts'), ...declared('lib.webworker.d.ts')])), BUN = { ...PAGE, ...readonly(Object.getOwnPropertyNames(globalThis)) };
const LANG = (globals) => ({ ecmaVersion: 'latest', sourceType: 'module', globals });
const WEBGPU = /^'GPU[A-Z]\w*' is not defined/;

// ---- the files: as git sees them (tracked, or new and not ignored) ----
const asked = process.argv.slice(2), git = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...(asked.length ? asked : [...CODE, ...TOOLS])], { cwd: GAME, encoding: 'utf8' });
if (git.status) { console.error(`lint: git ls-files: ${git.stderr}`); process.exit(1); }
const files = git.stdout.split('\n').filter((f) => /\.m?js$/.test(f) && existsSync(join(GAME, f)));
const toolOf = (f) => TOOLS.some((t) => f === t || f.startsWith(`${t}/`));

// ---- pass one: every file's unbound names, and what it imports ----
const problems = [], imports = [];
const nameOf = (n) => n.name ?? n.value;
const urlOf = (n) => n.type === 'NewExpression' && n.callee.name === 'URL' && n.arguments[0]?.type === 'Literal' && typeof n.arguments[0].value === 'string' && n.arguments[1]?.type === 'MemberExpression' && n.arguments[1].object?.type === 'MetaProperty' ? n.arguments[0].value : null;
for (const f of files) {
  const at = join(GAME, f), take = (spec, names, line) => imports.push({ f, at, spec, names, line });
  const collect = { create: () => ({
    ImportDeclaration: (n) => take(n.source.value, n.specifiers.filter((s) => s.type !== 'ImportNamespaceSpecifier').map((s) => (s.type === 'ImportDefaultSpecifier' ? 'default' : nameOf(s.imported))), n.loc.start.line),
    ExportNamedDeclaration: (n) => { if (n.source) take(n.source.value, n.specifiers.map((s) => nameOf(s.local)), n.loc.start.line); },
    ExportAllDeclaration: (n) => take(n.source.value, [], n.loc.start.line),
    ImportExpression: (n) => { if (n.source.type === 'Literal') take(n.source.value, [], n.loc.start.line); },
    NewExpression: (n) => { const u = urlOf(n); if (u && /^\.\.?\/.*\.\w+$/.test(u)) take(u, [], n.loc.start.line); },   // (a file, not a folder a tool writes into)
  }) };
  const msgs = linter.verify(readFileSync(at, 'utf8'), { languageOptions: LANG(toolOf(f) ? BUN : PAGE), plugins: { lint: { rules: { imports: collect } } }, rules: { 'no-undef': 'error', 'lint/imports': 'error' } }, at);
  for (const m of msgs) if (!WEBGPU.test(m.message)) problems.push(`${f}:${m.line}: ${m.message}`);
}

// ---- pass two: each import resolved, each name it asks for found ----
/** Where an import leads from `dir`: { path, bare } (bare: a package's), or null where it leads nowhere. */
const resolveFrom = (dir, spec) => {
  const clean = spec.replace(/\?.*$/, '');
  if (/^\.{0,2}\//.test(clean)) { const p = resolve(dir, clean); for (const c of [p, `${p}.js`, join(p, 'index.js')]) if (existsSync(c) && statSync(c).isFile()) return { path: c, bare: false }; return null; }
  try { return { path: Bun.resolveSync(clean, dir), bare: true }; } catch { return null; }
};
const OWN = new Map();
/** A file's exports, read from its code: { names, open } (open: it exports again all of what cannot be read). */
function exportsOf(file) {
  if (OWN.has(file)) return OWN.get(file);
  const out = { names: new Set(), open: false }, stars = []; OWN.set(file, out);   // (a ring of imports sees what is known so far)
  if (!/\.m?js$/.test(file)) { out.names.add('default'); return out; }   // (a JSON file, an asset: its default)
  const bound = (p) => (p.type === 'Identifier' ? [p.name] : p.type === 'ObjectPattern' ? p.properties.flatMap((q) => bound(q.value ?? q.argument)) : p.type === 'ArrayPattern' ? p.elements.filter(Boolean).flatMap(bound) : p.type === 'RestElement' ? bound(p.argument) : p.type === 'AssignmentPattern' ? bound(p.left) : []);
  const read = { create: () => ({ Program: (node) => {
    for (const s of node.body) {
      if (s.type === 'ExportDefaultDeclaration') out.names.add('default');
      else if (s.type === 'ExportNamedDeclaration') { const d = s.declaration; if (d?.type === 'VariableDeclaration') for (const v of d.declarations) for (const n of bound(v.id)) out.names.add(n); else if (d?.id) out.names.add(d.id.name); for (const sp of s.specifiers) out.names.add(nameOf(sp.exported)); }
      else if (s.type === 'ExportAllDeclaration') { if (s.exported) out.names.add(nameOf(s.exported)); else stars.push(s.source.value); }
    }
  } }) };
  linter.verify(readFileSync(file, 'utf8'), { languageOptions: LANG({}), plugins: { lint: { rules: { read } } }, rules: { 'lint/read': 'error' } }, file);
  for (const spec of stars) { const t = resolveFrom(dirname(file), spec); if (!t || t.bare) { out.open = true; continue; } const e = exportsOf(t.path); for (const n of e.names) if (n !== 'default') out.names.add(n); out.open ||= e.open; }
  return out;
}
const PACKAGES = new Map();
/** A package's exports, the package loaded: { names, open } (open: it could not be loaded here). */
const packageOf = async (path) => {
  if (!PACKAGES.has(path)) PACKAGES.set(path, import(path).then((m) => ({ names: new Set(Object.keys(m)), open: false }), () => ({ names: new Set(), open: true })));
  return PACKAGES.get(path);
};
for (const { f, at, spec, names, line } of imports) {
  const t = resolveFrom(dirname(at), spec);
  if (!t) { problems.push(`${f}:${line}: '${spec}' leads nowhere`); continue; }
  if (!names.length) continue;
  const e = t.bare ? await packageOf(t.path) : exportsOf(t.path);
  if (e.open) continue;
  for (const n of names) if (!e.names.has(n)) problems.push(`${f}:${line}: '${spec}' exports no '${n}'`);
}

console.log(`lint: ${files.length} files, ${imports.length} imports: ${problems.length ? `${problems.length} problems` : 'no problem'}; ${(performance.now() / 1000).toFixed(1)} s`);
for (const p of problems) console.log(`  ${p}`);
process.exit(problems.length ? 1 : 0);
