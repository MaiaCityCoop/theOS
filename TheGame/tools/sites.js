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
    with where a stack can say it was (at: { line, column } from 1): itself, and, where it is its function's tail call
    (`return Fn(…)().compute(n)`), where that function is called in its file too: a tail call leaves no frame of its own
    (JavaScriptCore, strict code: src/scatter/tier.js patchPass was seen at its call in packedOf). */
export function sitesIn(root, files) {
  const linter = new Linter(), out = [];
  for (const file of files) {
    linter.verify(readFileSync(root + file, 'utf8'), [{ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }]);
    const ast = linter.getSourceCode()?.ast, mine = [], calls = {};
    if (!ast) continue;
    walk(ast, null, [], (node, fns, parent) => {
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier') (calls[node.callee.name] ??= []).push(node.callee.loc.start);
      if (!makes(node)) return;
      const at = (node.type === 'CallExpression' ? node.callee.property : node).loc.start, fn = fns.findLast(Boolean) ?? '(module)';   // (a call, where a stack says it is: at its method's name; a new, at itself)
      const tail = node.type === 'CallExpression' && (parent?.type === 'ReturnStatement' || (parent?.type === 'ArrowFunctionExpression' && parent.body === node)) ? fns.at(-1) : '';
      mine.push({ file, fn, line: at.line, column: at.column + 1, tail });
    });
    for (const m of mine) out.push({ ...m, at: [{ line: m.line, column: m.column }, ...(m.tail ? calls[m.tail] ?? [] : []).map((c) => ({ line: c.line, column: c.column + 1 }))] });
  }
  return out;
}
/** The place (of sites, sitesIn) a frame (framesHere) was at, where it can be told: of its file's places where a stack
    could say it was at its column (its function's first), the nearest to its line; else its function's only place;
    else null. */
export function placeAt(sites, frame) {
  const here = sites.filter((s) => s.file === frame.file), named = here.filter((s) => s.fn === frame.fn), off = (s) => Math.min(...s.at.filter((a) => a.column === frame.column).map((a) => Math.abs(a.line - frame.line)));
  const nearest = (L) => L.filter((s) => off(s) < Infinity).reduce((a, s) => (!a || off(s) < off(a) ? s : a), null);
  return nearest(named) ?? nearest(here) ?? (named.length === 1 ? named[0] : null);
}
/** The places (of sites) the frames were at, each frame's (placeAt): where one cannot be told, none (a place is built
    only where a frame was surely at it: a gap is never hidden by a guess). */
export const placesAt = (sites, frames) => new Set(frames.map((f) => placeAt(sites, f)).filter(Boolean));
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
  see(n, inner, parent);
  for (const k in n) {
    if (k === 'parent' || k === 'loc' || k === 'range') continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const c of v) if (c?.type) walk(c, n, inner, see); } else if (v?.type) walk(v, n, inner, see);
  }
}
