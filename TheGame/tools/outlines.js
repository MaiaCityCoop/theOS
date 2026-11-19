// The plants' outlines (intent 0038, the cold start): what the page must know of each plant before any of its meshes is
// made (assets/kit/tree.js OUTLINES: its size, each shape's height, trunk and feet), and what the stands are sized by,
// each shape's rooms in the heap and its far end's chunks (crowdRooms: the crowd kit's measure of every shape, for the
// far ends' atlases' numbers of each class of device, as a device sizes its own: src/detail/impostor.js ATLAS_SHARES),
// measured here as the page
// measures them, by the same code (the recipe's own, as the page's first ask of them runs it), for the page and the
// recipes' workers to read (src/core/outlines.js). The land asks the outlines as its files are read (the stands'
// colours: src/terrain/layers.js), a tree's nearest meshes grown for each: 0.8 s of a first start's one thread; and the
// start waited for the rooms, reckoned in the recipes' workers (src/scatter/trees.js outlinesAhead): 3.0 s of them, the
// longest a holm oak's 1.8 s (2026-11-19). A start measures none of what the build did.
//
//   outlines.json   { "<uid>:<seed>@<version>": { size, trunk, heights, feet, atlases: { <key>: { rooms, far } } } }
//                   numbers only: each plant by what it is (its recipe's uid and seed) at its recipe's version (the
//                   registry: tools/registry.js); a tree kind's rooms and far ends for each class's atlases, by their
//                   key (assets/kit/tree.js crowdRooms); a recipe changed since has another version, and is measured on
//                   the page, said as an error (src/scatter/trees.js outlinesAhead)
//   crowds.bin      each tree kind's every shape's crowd's measure (assets/kit/measures.js: its turns' order, their
//                   errors and goes, where its crowd ends, its growth, its chunks, its cover), for each class's
//                   atlases, by measureKey: what the recipes' workers lay its levels by (src/core/crowds.js), so a start
//                   reckons none of a crowd's measure (1.3 s of a start's workers)
//
// Never kept in git (it is only ever made again, as registry.json is): made at every build and dev start, and on every
// change to a recipe (vite.config.js), and in CI; each time in a process of its own (`bun tools/outlines.js`: what it
// imports is read afresh, a kit as it is now; Bun's, as the game's modules are read through the GPU's stand-in,
// tools/gpu-mock.js, for the atlases' numbers).
import { mock } from './gpu-mock.js';
import { packMeasures, unpackMeasures, measureKey } from '../assets/kit/measures.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRegistry, writeIfChanged, runTool } from './registry.js';

/** Measure every plant's outline and write outlines.json if anything changed. Returns them. */
export async function buildOutlines(root) {
  const manifest = buildRegistry(root), path = resolve(root, 'outlines.json'), load = (f) => import(pathToFileURL(resolve(root, f)).href);
  await mock();
  const { OUTLINES } = await load('assets/kit/tree.js'), { ATLAS_SHARES, atlasesAt } = await load('src/detail/impostor.js'), classes = ATLAS_SHARES.map(atlasesAt);
  const { crowdOf } = await load('assets/kit/plant.js'), { jobDone } = await load('assets/kit/job.js'), measures = [], trees = [];
  for (const uid of Object.keys(manifest).sort()) {
    const r = manifest[uid];
    if (r.type !== 'asset') continue;
    const a = (await load(r.file)).default;
    if (!a?.outlineFor) continue;
    trees.push([a, r.version]);
    for (const A of classes) {   // (each class's atlases, as a device of it asks them: src/detail/impostor.js atlases)
      const o = a.outlineFor(A);   // (its outline, as the page's first ask of its heights measures it, and its rooms and far ends for A: what the start asked the workers for)
      (o.atlases ||= {})[o.atlas] = { rooms: o.rooms, far: o.far };
      for (let i = 0; i < a.shapeCount; i++) { measures.push([measureKey(a, r.version, i, A), crowdOf(a, i, A).measure]); jobDone(); }   // (each shape's crowd as the workers ask it, for A)
    }
  }
  const bin = packMeasures(measures), at = resolve(root, 'crowds.bin');
  if (!existsSync(at) || !Buffer.from(readFileSync(at)).equals(Buffer.from(bin))) writeFileSync(at, bin);
  const out = {};
  for (const [id, { rooms, far, atlas, ...o }] of OUTLINES.made) out[`${id}@${manifest[id.split(':')[0]].version}`] = o;   // (its rooms by its atlases' key, every class's: atlases)
  const text = `{\n${Object.entries(out).map(([k, o]) => `${JSON.stringify(k)}: ${JSON.stringify(o)}`).join(',\n')}\n}\n`;
  writeIfChanged(path, text);
  await readBack(load, at, trees, classes);
  return out;
}

/** The bake read back as each class of device reads it: the page's rooms by its atlases' key (src/core/outlines.js
    shippedRooms), the workers' crowds (src/core/crowds.js, measureKey), and every device's atlases, every share swept
    through the page's own sizing (src/detail/impostor.js atlasesFor), some class's. What a device would not find there
    it reckons at its start, in its recipes' workers, 0.4 GB a worker: that fails the build, named, never left to the
    page. load: a game module read afresh (after the bake is written); at: crowds.bin; trees: [asset, version]. */
async function readBack(load, at, trees, classes) {
  const { shippedRooms } = await load('src/core/outlines.js'), { atlasesFor } = await load('src/detail/impostor.js'), M = unpackMeasures(new Uint8Array(readFileSync(at)).buffer), lacking = [];
  const baked = new Set(classes.map((A) => A.key)), unbaked = new Map();   // (an atlas none was reckoned for -> the shares of the devices that would size it, the least and the most)
  for (let s = 1; s <= 1024; s++) { let k; try { k = atlasesFor(s / 1024).key; } catch (e) { k = `none (${e.message})`; } if (!baked.has(k)) { const r = unbaked.get(k) ?? [s / 1024, 0]; r[1] = s / 1024; unbaked.set(k, r); } }
  for (const [k, [lo, hi]] of unbaked) lacking.push(`the atlases ${k} of a device of share ${lo}${hi > lo ? ` to ${hi}` : ''}`);
  for (const A of classes) for (const [a, v] of trees) {
    if (!shippedRooms(a, A)) lacking.push(`${a.name}'s rooms`);
    for (let i = 0; i < a.shapeCount; i++) if (!M?.has(measureKey(a, v, i, A))) lacking.push(`${a.name}'s shape ${i}'s crowd`);
  }
  if (lacking.length) throw new Error(`the bake as a device reads it lacks ${lacking.length}: ${[...new Set(lacking)].slice(0, 8).join(', ')}${lacking.length > 8 ? ', …' : ''} (for the atlases ${classes.map((A) => A.key).join(' and ')})`);
}

await runTool(import.meta.url, buildOutlines, (O) => `[outlines] ${Object.keys(O).length} plants`);
