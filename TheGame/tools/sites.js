// Where the game makes its shaders (intent 0038): every place in its own code that makes a node material or a compute
// pass, each by its own name in the source ('file:line', and the function it is made in). The tools' loader
// (tools/glob.js) hands each such place's thing, as it is made, to globalThis.__made with that name (marked), so a
// tool knows where a thing was made from the code itself: the smoke holds every place against what it built, and the
// shader gate names each shader so (tools/gate/wgsl.js). Never from a stack: Bun's frames differ from version to version
// (2026-11-19: on 1.4.2 the census found 13 places never built that 1.4.4 built) and lie a few lines off the source.
import { readFileSync } from 'node:fs';
import { Linter } from 'eslint';

/** The game's own code, by its path from the game's folder: what the loader marks and the census reads (not the tools,
    nor three's, nor a worker's own file). */
export const GAME = /^(src|world|biomes|assets|materials|characters|camera|cine)\/(?!.*worker).*\.js$/;
const linter = new Linter();

/** Every place in `code` (the file `file`, from the game's folder) that makes a node material (`new …NodeMaterial(`) or a
    compute pass (a node's `.compute(`, TSL's: called on what a call gave, `Fn(…)().compute(n)`): { id ('file:line'),
    file, fn (the function it is made in, or the nearest named one about it), line, range ([start, end] in code) }. */
function placesIn(code, file) {
  if (!/NodeMaterial|\.compute\s*\(/.test(code)) return [];
  linter.verify(code, [{ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }]);
  const ast = linter.getSourceCode()?.ast, out = [];
  if (ast) walk(ast, null, [], (node, fns) => { if (makes(node)) out.push({ id: `${file}:${node.loc.start.line}`, file, fn: fns.findLast(Boolean) ?? '(module)', line: node.loc.start.line, range: node.range }); });
  return out;
}
/** Every place in `files` (paths from root), placesIn. */
export const sitesIn = (root, files) => files.flatMap((f) => placesIn(readFileSync(root + f, 'utf8'), f));
/** `code` with each of its places' things handed to globalThis.__made as they are made, with the place's id: what the
    loader runs (tools/glob.js). */
export function marked(code, file) {
  const cuts = placesIn(code, file).flatMap((p) => [[p.range[1], ')'], [p.range[0], `globalThis.__made(${JSON.stringify(p.id)}, `]]).sort((a, b) => b[0] - a[0]);
  for (const [at, text] of cuts) code = code.slice(0, at) + text + code.slice(at);   // (from the end: what is cut later stands where it was)
  return code;
}
const makes = (n) => (n.type === 'NewExpression' && /NodeMaterial$/.test(n.callee.name ?? n.callee.property?.name ?? '')) || (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'compute' && n.callee.object.type === 'CallExpression');
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
/** A function's name: its own, or what it is given to (a variable, a property, a method, a member). */
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
