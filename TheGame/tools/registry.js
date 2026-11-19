// The registry's manifest (registry.json): every recipe in materials/, biomes/, assets/ and characters/ by its stable uid, with its
// type, its name, its file, the recipes it uses, and its version: the BLAKE3 hash of its source and of the versions of
// what it uses, so a changed material gives every biome and asset that lays it a new version too. A version never
// changes once made; a uid never changes at all. Never kept in git (it is only ever made again, and a branch that kept
// it met every other over it): made at every build and dev start, and on every change to a recipe or to what paints one (vite.config.js), by
// every tool that loads the game's modules (tools/glob.js) and by the lint (tools/lint.js), and first in CI. On its own:
// `bun tools/registry.js`.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const FOLDERS = ['materials', 'biomes', 'assets', 'characters'];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;

// what a recipe's file builds with, followed through its imports (those it loads when first wanted and the workers it
// runs among them): the kits (a folder `kit/`), the shared dice, the world's one scale (world/scale.js), the one
// measure of detail (src/detail/error.js) and what the far ends' pictures misplace (src/detail/atlas.js), in the order
// they are first met
export const SHARED = ['src/core/hash.js', 'world/scale.js', 'src/detail/error.js', 'src/detail/atlas.js'];
export function kitsOf(root, file, seen = new Set()) {
  for (const m of readFileSync(file, 'utf8').matchAll(/(?:from|import|import\(|new URL\()\s*'(\.{1,2}\/[^']+\.js)'/g)) {
    const p = resolve(dirname(file), m[1]), rel = relative(root, p).split(sep).join('/');
    if (seen.has(p) || !existsSync(p) || !(rel.split('/').includes('kit') || SHARED.includes(rel))) continue;
    seen.add(p); kitsOf(root, p, seen);
  }
  return [...seen];
}

/** Every module a file reads, followed through its imports (relative ones: the game's own, not three's), in the order
    they are first met: what a material's painting is made of (paintOf). */
export function importsOf(root, file, seen = new Set()) {
  for (const m of readFileSync(file, 'utf8').matchAll(/(?:from|import|import\(|new URL\()\s*'(\.{1,2}\/[^']+\.js)'/g)) {
    const p = resolve(dirname(file), m[1]);
    if (seen.has(p) || !existsSync(p)) continue;
    seen.add(p); importsOf(root, p, seen);
  }
  return [...seen];
}
/** What paints a material, as one hash each (src/materials/bake.js keeps what it painted between starts by it): `paint`,
    its file and every module it reads, with `painter`, the painter's own (src/materials/bake.js, and the kit it paints
    with, src/materials/paint.js, and what that reads) and three's version (what writes its programs). A change to any
    of it is another hash: nothing painted before it is laid out again. PAINTS: every file the last hashes read, which
    the dev server watches (vite.config.js), so that a change to any of them is another hash at once (the far ends'
    `baker`'s too, below). */
export const PAINTS = new Set();
function paintOf(root) {
  PAINTS.clear();
  const read = (p) => (PAINTS.add(p), readFileSync(p, 'utf8')), three = JSON.parse(read(resolve(root, 'node_modules/three/package.json'))).version ?? '';
  const own = [resolve(root, 'src/materials/bake.js'), ...new Set([resolve(root, 'src/materials/paint.js'), ...importsOf(root, resolve(root, 'src/materials/paint.js'))])];
  const painter = bytesToHex(blake3(utf8ToBytes(`${own.map(read).join('\n')}\nthree ${three}`)));
  // (and what bakes a plant's far end, as one hash: src/scatter/far.js, where its pictures are drawn and kept, and the
  // inputs it names, each file itself: the impostors' baker and their pictures' frames (src/detail/impostor.js), its
  // worker that mips them, the atlases' numbers (src/detail/atlas.js), a plant's vertex as the heap holds it
  // (src/scatter/plantvert.js, unpack.js); and three's version. What else a shape's pictures are made of has its own
  // hash, which far.js keys each shape by beside this one: its recipe's version (its kits with it) and its paintings'
  // `paint`, the world's textures as they are read among them (the painter's code))
  const bakes = ['src/scatter/far.js', 'src/detail/impostor.js', 'src/detail/impostor.worker.js', 'src/detail/atlas.js', 'src/scatter/plantvert.js', 'src/scatter/unpack.js'];
  const baker = bytesToHex(blake3(utf8ToBytes(`${bakes.map((f) => read(resolve(root, f))).join('\n')}\nthree ${three}`)));
  return { painter, baker, of: (file) => bytesToHex(blake3(utf8ToBytes(`${[file, ...importsOf(root, file)].map(read).join('\n')}\n${painter}`))) };
}

/** Read every recipe under root, version it, and write registry.json if anything changed. Returns the manifest. */
export function buildRegistry(root) {
  const found = {};
  for (const dir of FOLDERS) {
    const abs = join(root, dir); if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((n) => n.endsWith('.js')).sort()) {
      const src = readFileSync(join(abs, f), 'utf8'), uid = src.match(/\buid: '([0-9a-f-]{36})'/)?.[1];
      if (!uid) continue;   // not a recipe (an index, the kinds' defaults)
      if (found[uid]) throw new Error(`uid ${uid} in both ${found[uid].file} and ${dir}/${f}`);
      // a kit it builds with (./kit/*.js: the tree kit, and the kits that kit builds with) is part of what it is, and so
      // are the shared dice (src/core/hash.js) and the world's scale (world/scale.js): a changed kit, hash or scale gives
      // it a new version too
      const kits = kitsOf(root, join(abs, f)).map((p) => readFileSync(p, 'utf8')).join('\n');
      found[uid] = { type: src.match(/\btype: '(\w+)'/)?.[1], name: src.match(/\bname: (['"])(.*?)\1/)?.[2], file: `${dir}/${f}`, src: kits ? `${src}\n${kits}` : src };
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
  const out = {}, P = paintOf(root);
  for (const uid of Object.keys(found).sort((a, b) => (found[a].type + found[a].name).localeCompare(found[b].type + found[b].name))) {
    const { type, name, file, uses } = found[uid]; out[uid] = { type, name, file, version: version(uid), uses, ...(type === 'material' ? { paint: P.of(join(root, file)), painter: P.painter } : {}), ...(type === 'asset' ? { baker: P.baker } : {}) };
  }
  const path = resolve(root, 'registry.json'), text = JSON.stringify(out, null, 2) + '\n';
  writeIfChanged(path, text);
  return out;
}

/** Write `text` to `path` unless the file holds it already: what the build and the dev server read is not touched for
    nothing (the dev server would read it again). The manifest's, the solids' rooms' (tools/rooms.js), the plants'
    outlines' (tools/outlines.js). */
/** What is measured of the recipes once the registry is made, each by a tool of its own in a process of its own (the
    dev server and the build, vite.config.js; CI, tools/fresh.js): { maker, makes (the file it writes, from the game's
    folder) }. A file of them git keeps is held to what its maker makes of the commit (tools/fresh.js). */
export const MEASURES = [{ maker: 'tools/rooms.js', makes: 'rooms.json' }, { maker: 'tools/outlines.js', makes: 'outlines.json' }];
export function writeIfChanged(path, text) { if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text); }
/** A measuring tool's own run (`bun tools/x.js`, or node: not when it is imported): make(root) on the game's folder,
    timed, and said(what it made), a line. */
export async function runTool(url, make, said) {
  if (!process.argv[1] || resolve(process.argv[1]) !== fileURLToPath(url)) return;
  const t0 = performance.now(), out = await make(resolve(dirname(fileURLToPath(url)), '..'));
  console.log(`${said(out)}, ${Math.round(performance.now() - t0)} ms`);
}

if (import.meta.main) { const m = buildRegistry(resolve(import.meta.dir, '..')); console.log(`${Object.keys(m).length} recipes`); }
