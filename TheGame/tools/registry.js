// The registry's manifest (registry.json): every recipe in materials/, biomes/ and assets/ by its stable uid, with its
// type, its name, its file, the recipes it uses, and its version: the BLAKE3 hash of its source and of the versions of
// what it uses, so a changed material gives every biome and asset that lays it a new version too. A version never
// changes once made; a uid never changes at all. Run on its own (`bun tools/registry.js`) or by the dev server on
// every change to a recipe (vite.config.js).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const FOLDERS = ['materials', 'biomes', 'assets'];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;

/** Read every recipe under root, version it, and write registry.json if anything changed. Returns the manifest. */
export function buildRegistry(root) {
  const found = {};
  for (const dir of FOLDERS) {
    const abs = join(root, dir); if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((n) => n.endsWith('.js')).sort()) {
      const src = readFileSync(join(abs, f), 'utf8'), uid = src.match(/\buid: '([0-9a-f-]{36})'/)?.[1];
      if (!uid) continue;   // not a recipe (an index, the kinds' defaults)
      if (found[uid]) throw new Error(`uid ${uid} in both ${found[uid].file} and ${dir}/${f}`);
      found[uid] = { type: src.match(/\btype: '(\w+)'/)?.[1], name: src.match(/\bname: (['"])(.*?)\1/)?.[2], file: `${dir}/${f}`, src };
    }
  }
  for (const [uid, r] of Object.entries(found)) r.uses = [...new Set(r.src.match(UUID) || [])].filter((u) => u !== uid && found[u]).sort();
  const version = (uid, seen = new Set()) => {
    const r = found[uid]; if (r.version) return r.version;
    if (seen.has(uid)) throw new Error(`recipes use each other in a ring: ${[...seen, uid].join(' → ')}`);
    seen.add(uid);
    const deps = r.uses.map((u) => version(u, seen)).join('\n');
    return (r.version = bytesToHex(blake3(utf8ToBytes(`${r.src}\n${deps}`))));
  };
  const out = {};
  for (const uid of Object.keys(found).sort((a, b) => (found[a].type + found[a].name).localeCompare(found[b].type + found[b].name))) {
    const { type, name, file, uses } = found[uid]; out[uid] = { type, name, file, version: version(uid), uses };
  }
  const path = resolve(root, 'registry.json'), text = JSON.stringify(out, null, 2) + '\n';
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
  return out;
}

if (import.meta.main) { const m = buildRegistry(resolve(import.meta.dir, '..')); console.log(`${Object.keys(m).length} recipes`); }
