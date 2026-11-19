// The plants' outlines (intent 0038, the cold start): what the page must know of each plant before any of its meshes is
// made (assets/kit/tree.js OUTLINES: its size, each shape's height, trunk and feet), and what the stands are sized by,
// each shape's rooms in the heap and its far end's chunks (crowdRooms: the crowd kit's measure of every shape, for the
// world's atlases' numbers, the same on every device: src/detail/impostor.js atlases), measured here as the page
// measures them, by the same code (the recipe's own, as the page's first ask of them runs it), for the page and the
// recipes' workers to read (src/core/outlines.js). The land asks the outlines as its files are read (the stands'
// colours: src/terrain/layers.js), a tree's nearest meshes grown for each: 0.8 s of a first start's one thread; and the
// start waited for the rooms, reckoned in the recipes' workers (src/scatter/trees.js outlinesAhead): 3.0 s of them, the
// longest a holm oak's 1.8 s (2026-11-19). A start measures none of what the build did.
//
//   outlines.json   { "<uid>:<seed>@<version>": { size, trunk, heights, feet, rooms, far, atlas } }   numbers only: each
//                   plant by what it is (its recipe's uid and seed) at its recipe's version (the registry:
//                   tools/registry.js); rooms, far and atlas a tree kind's (assets/kit/tree.js crowdRooms, for the
//                   atlases' numbers whose key is atlas); a recipe changed since has another version, and is measured
//                   on the page, as before
//   crowds.bin      each tree kind's every shape's crowd's measure (assets/kit/measures.js: its turns' order, their
//                   errors and goes, where its crowd ends, its growth, its chunks, its cover), by
//                   "<uid>:<seed>@<version>#<shape>|<atlases' key>": what the recipes' workers lay its levels by
//                   (src/core/crowds.js), so a start reckons none of a crowd's measure (1.3 s of a start's workers)
//
// Never kept in git (it is only ever made again, as registry.json is): made at every build and dev start, and on every
// change to a recipe (vite.config.js), and in CI; each time in a process of its own (`bun tools/outlines.js`: what it
// imports is read afresh, a kit as it is now; Bun's, as the game's modules are read through the GPU's stand-in,
// tools/gpu-mock.js, for the atlases' numbers).
import { mock } from './gpu-mock.js';
import { packMeasures } from '../assets/kit/measures.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRegistry, writeIfChanged, runTool } from './registry.js';

/** Measure every plant's outline and write outlines.json if anything changed. Returns them. */
export async function buildOutlines(root) {
  const manifest = buildRegistry(root), path = resolve(root, 'outlines.json'), load = (f) => import(pathToFileURL(resolve(root, f)).href);
  await mock();
  const { OUTLINES } = await load('assets/kit/tree.js'), A = (await load('src/detail/impostor.js')).atlases();
  const { crowdOf } = await load('assets/kit/plant.js'), measures = [];
  for (const uid of Object.keys(manifest).sort()) {
    const r = manifest[uid];
    if (r.type !== 'asset') continue;
    const a = (await load(r.file)).default;
    if (!a?.outlineFor) continue;
    a.outlineFor(A);   // (its outline, as the page's first ask of its heights measures it, and its rooms and far ends: what the start asked the workers for)
    for (let i = 0; i < a.shapeCount; i++) measures.push([`${uid}:${a.placement?.seed ?? 1}@${r.version}#${i}|${A.key}`, crowdOf(a, i, A).measure]);   // (each shape's crowd as the workers ask it: for the world's atlases' numbers)
  }
  const bin = packMeasures(measures), at = resolve(root, 'crowds.bin');
  if (!existsSync(at) || !Buffer.from(readFileSync(at)).equals(Buffer.from(bin))) writeFileSync(at, bin);
  const out = {};
  for (const [id, o] of OUTLINES.made) out[`${id}@${manifest[id.split(':')[0]].version}`] = o;
  const text = `{\n${Object.entries(out).map(([k, o]) => `${JSON.stringify(k)}: ${JSON.stringify(o)}`).join(',\n')}\n}\n`;
  writeIfChanged(path, text);
  return out;
}

await runTool(import.meta.url, buildOutlines, (O) => `[outlines] ${Object.keys(O).length} plants`);
