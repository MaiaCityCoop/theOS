// Where the game makes its shaders (intent 0038): every place in its own code that makes a node material or a compute
// pass, by the function it is made in (the smoke: what it built, against all of them; tools/gate/wgsl.js: what each
// shader is called). By function, not line: Bun runs the game's files as it re-prints them, and a stack's lines can lie
// a few off the source's (2026-11-19: src/world/sky.js's dome made its material on line 74, its stack said 78; its
// column was right), where its names and columns do not. A function given no name in the source is named in a stack
// by what it is called as (a plant's material, src/scatter/trees.js), so a frame is matched to the nearest place at
// its column, or to its function's (placeAt).
import { readFileSync } from 'node:fs';
import { Linter } from 'eslint';

/** In a stack as it is being made (inside a constructor, say): the game's own frames, innermost first, each { file
    (from root), fn (its function's name, or the nearest named one about it in the same file), line, column (from 1)
    }, the first of each file only. root: the game's folder; tools and node_modules are not the game's. */
export function framesHere(root) {
  const was = Error.prepareStackTrace; Error.prepareStackTrace = (e, sites) => sites;
  const sites = new Error().stack; Error.prepareStackTrace = was;
  const out = [];
  for (const c of Array.isArray(sites) ? sites : []) {
    const f = c.getFileName?.() ?? '', file = f.startsWith(root) ? f.slice(root.length) : '';
    if (!file || /^(node_modules|tools)\//.test(file)) continue;
    const fn = c.getFunctionName?.() || '', last = out.at(-1);
    if (last?.file === file) { if (!last.fn && fn) last.fn = fn; continue; }   // (an anonymous one: named by the named one about it)
    out.push({ file, fn, line: c.getLineNumber?.() ?? 0, column: c.getColumnNumber?.() ?? 0 });
  }
  return out.map((x) => ({ ...x, fn: x.fn || '(module)' }));
}
/** Every place in `files` (from root) that makes a node material (`new …NodeMaterial(`) or a compute pass (a node's
    `.compute(`, TSL's: called on what a call gave, `Fn(…)().compute(n)`), each 'file fn' as framesHere names its frame,
    with its line and column (from 1, as a stack gives it). */
export function sitesIn(root, files) {
  const linter = new Linter(), out = [];
  for (const file of files) {
    linter.verify(readFileSync(root + file, 'utf8'), [{ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }]);
    const ast = linter.getSourceCode()?.ast;
    if (ast) walk(ast, null, [], (node, fns) => { if (makes(node)) out.push({ file, fn: fns.findLast(Boolean) ?? '(module)', line: node.loc.start.line, column: node.loc.start.column + 1 }); });
  }
  return out;
}
/** The place (of sites, sitesIn) a frame (framesHere) was at, where it can be told: its function's only place; of its
    function's places, the nearest at its column; where its function has none (named in the stack by what it was called
    as), the nearest of its file's at its column; else null. */
export function placeAt(sites, frame) {
  const here = sites.filter((s) => s.file === frame.file), named = here.filter((s) => s.fn === frame.fn);
  const nearest = (L) => L.filter((s) => s.column === frame.column).reduce((a, s) => (!a || Math.abs(s.line - frame.line) < Math.abs(a.line - frame.line) ? s : a), null);
  return named.length === 1 ? named[0] : named.length ? nearest(named) : nearest(here);
}
/** The places (of sites) the frames were at: each frame's (placeAt), or, where it cannot be told, every place of its
    function (it was in it). */
export const placesAt = (sites, frames) => new Set(frames.flatMap((f) => { const p = placeAt(sites, f); return p ? [p] : sites.filter((s) => s.file === f.file && s.fn === f.fn); }));
const makes = (n) => (n.type === 'NewExpression' && /NodeMaterial$/.test(n.callee.name ?? n.callee.property?.name ?? '')) || (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'compute' && n.callee.object.type === 'CallExpression');
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
/** A function's name as the stack gives it: its own, or what it is given to (a variable, a property, a method, a member). */
function nameOf(n, parent) {
  if (n.id?.name) return n.id.name;
  const p = parent ?? {};
  return p.type === 'VariableDeclarator' ? p.id.name : p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition' ? p.key.name ?? '' : p.type === 'AssignmentExpression' ? p.left.property?.name ?? p.left.name ?? '' : '';
}
/** The tree walked, each node seen with the names of the functions about it (a nameless one ''). */
function walk(n, parent, fns, see) {
  const inner = FN.has(n.type) ? [...fns, nameOf(n, parent)] : fns;
  see(n, inner);
  for (const k in n) {
    if (k === 'parent' || k === 'loc' || k === 'range') continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const c of v) if (c?.type) walk(c, n, inner, see); } else if (v?.type) walk(v, n, inner, see);
  }
}
