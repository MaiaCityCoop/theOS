// The solids' rooms (intent 0038): how much each level of every solid's cluster hierarchy holds, measured from the
// hierarchy itself (assets/kit/clusters.js), as the heap lays a level (assets/kit/surface.js levelSizes): rooms.json,
// a recipe's by its version (the registry: tools/registry.js), so a level's place in the heap is as large as what it holds, no larger,
// and a recipe's rooms are made again only when it, or a kit it builds with, changes. What reads them: the engines that
// make the heap's places (src/scatter/rocks.js, src/scatter/placed.js, through src/scatter/rooms.js).
//
//   rooms.json   { builder, [uid]: { name, version, shapes: [[[triangles, vertices, clusters], …a level], …a shape] } }
//                a rock's every shape (each a kind of the heap: assets/kit/rock.js), a made thing's one
//                (assets/kit/made.js); builder: the hash of what makes the full meshes and builds and lays their
//                hierarchies (BUILDER, and the kits they build with: no recipe's version says them, as the zoo and the
//                recipes' workers bring them, not the recipes), every room made again when it changes
//
// The hierarchies are built here as the recipes' workers build them (the same code, meshoptimizer's WebAssembly), in a
// process of its own each time (`node tools/rooms.js`: what it imports is read afresh, a kit as it is now). The dev
// server runs it as it makes the registry (vite.config.js), and after.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { kitsOf, buildRegistry } from './registry.js';
import { build, ready } from '../assets/kit/clusters.js';
import { useBuilder, levelSizes } from '../assets/kit/surface.js';
import { rockHierarchy } from '../assets/kit/rock.js';
import { isMade, madeHierarchy } from '../assets/kit/made.js';

const BUILDER = ['assets/kit/clusters.js', 'assets/kit/surface.js', 'assets/kit/rock.js', 'assets/kit/made.js'];

/** Measure the rooms of every solid whose version changed, and write rooms.json if anything did. Returns them. */
export async function buildRooms(root) {
  const manifest = buildRegistry(root), path = resolve(root, 'rooms.json');   // (the registry made here as the dev server makes it: registry.json is made, never kept in git)
  const files = [...new Set(BUILDER.flatMap((f) => [resolve(root, f), ...kitsOf(root, resolve(root, f))]))].sort(), builder = bytesToHex(blake3(utf8ToBytes([...files, resolve(root, 'node_modules/meshoptimizer/package.json')].map((f) => readFileSync(f, 'utf8')).join('\n'))));
  const was = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}, old = was.builder === builder ? was : {}, out = { builder };
  const load = (f) => import(pathToFileURL(resolve(root, f)).href);
  await ready; useBuilder(build);
  for (const uid of Object.keys(manifest).sort()) {
    const r = manifest[uid]; if (r.type !== 'asset') continue;
    if (old[uid]?.version === r.version) { out[uid] = old[uid]; continue; }
    const a = (await load(r.file)).default, t0 = performance.now();
    // (the heap's solids: a rock's shapes, as the zoo lays them out: assets/zoo/scattered.js; a made thing: made.js isMade)
    const D = a?.placement?.at === 'scatter' && a.placement.engine === 'rocks' ? Array.from({ length: a.placement.shapes ?? 1 }, (_, v) => rockHierarchy(a, v)) : isMade(a) ? [madeHierarchy(a)] : null;
    if (!D) continue;
    out[uid] = { name: r.name, version: r.version, shapes: D.map(levelSizes) };
    console.log(`[rooms] ${r.name}: ${D.length} shape${D.length > 1 ? 's' : ''}, ${Math.round(performance.now() - t0)} ms`);
  }
  const text = JSON.stringify(out, (k, v) => (Array.isArray(v) && v.every((x) => typeof x === 'number') ? `[${v.join(', ')}]` : v), 2).replace(/"\[([\d, ]*)\]"/g, '[$1]') + '\n';
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = performance.now(), R = await buildRooms(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  console.log(`[rooms] ${Object.keys(R).length - 1} solids, ${Math.round(performance.now() - t0)} ms`);
}
