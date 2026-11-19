// The plants' outlines (intent 0038, the cold start): what the page must know of each plant before any of its meshes is
// made (assets/kit/tree.js OUTLINES: its size, each shape's height, trunk and feet), measured here as the page measures
// it, by the same code (the recipe's own, as the page's first ask of them runs it), for the page and the recipes'
// workers to read (src/core/outlines.js). The land asks them as its files are read (the stands' colours:
// src/terrain/layers.js), a tree's nearest meshes grown for each: 0.8 s of a first start's one thread (2026-11-19, the
// master's profile). A start measures none of what the build did.
//
//   outlines.json   { "<uid>:<seed>@<version>": { size, trunk, heights, feet } }   numbers only: each plant by what it is
//                   (its recipe's uid and seed) at its recipe's version (the registry: tools/registry.js); a recipe
//                   changed since has another version, and is measured on the page, as before
//
// Never kept in git (it is only ever made again, as registry.json is): made at every build and dev start, and on every
// change to a recipe (vite.config.js), and in CI; each time in a process of its own (`bun tools/outlines.js`, or node:
// what it imports is read afresh, a kit as it is now).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRegistry, writeIfChanged, runTool } from './registry.js';

/** Measure every plant's outline and write outlines.json if anything changed. Returns them. */
export async function buildOutlines(root) {
  const manifest = buildRegistry(root), path = resolve(root, 'outlines.json'), load = (f) => import(pathToFileURL(resolve(root, f)).href);
  const { OUTLINES } = await load('assets/kit/tree.js');
  for (const uid of Object.keys(manifest).sort()) {
    const r = manifest[uid];
    if (r.type !== 'asset') continue;
    const a = (await load(r.file)).default;
    if (a?.outlineFor) void a.heights;   // (its heights: what measures it, as the page's first ask of them does)
  }
  const out = {};
  for (const [id, o] of OUTLINES.made) out[`${id}@${manifest[id.split(':')[0]].version}`] = o;
  const text = `{\n${Object.entries(out).map(([k, o]) => `${JSON.stringify(k)}: ${JSON.stringify(o)}`).join(',\n')}\n}\n`;
  writeIfChanged(path, text);
  return out;
}

await runTool(import.meta.url, buildOutlines, (O) => `[outlines] ${Object.keys(O).length} plants`);
