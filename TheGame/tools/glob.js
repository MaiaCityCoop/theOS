// Vite's `import.meta.glob` for Bun: what lets a tool (tools/scale.js) import the game's own modules outside the
// browser, as the dev server and the build do. A runtime plugin: every module of the game's that globs has each call
// turned into the modules it names: imported at once where it asks ({ eager: true }), whole or by the export it asks
// for (`import`), else a function a module that imports it. Import this file first, then import the game's modules with `await import(...)`.
// And the registry's manifest, made as the dev server and the build make it (vite.config.js: registry.json is never
// kept in git, tools/registry.js), before any module of the game's asks for it.
import { plugin } from 'bun';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Glob } from 'bun';
import { buildRegistry } from './registry.js';
import { GAME, marked } from './sites.js';

if (Bun.isMainThread) buildRegistry(resolve(import.meta.dir, '..'));   // (once, by the tool itself: a worker it starts, given this file first, tools/smoke.js --full, globs and reads it)
const ROOT = resolve(import.meta.dir, '..') + '/';
// (and every place in the game's code that makes a shader hands its thing, as it is made, to __made with its own name,
// 'file:line' (tools/sites.js marked): a tool that asks where a thing was made reads it there, the smoke; nothing
// otherwise)
globalThis.__made ??= (id, x) => x;
const CALL = /import\.meta\.glob\(\s*(\[[^\]]*\]|'[^']*')\s*(?:,\s*(\{[^}]*\}))?\s*\)/g;

plugin({
  name: 'import.meta.glob',
  setup(build) {
    build.onLoad({ filter: /[\\/]TheGame[\\/](src|world|biomes|assets|materials|characters|camera|cine)[\\/].*\.js$/ }, ({ path }) => {
      let src = readFileSync(path, 'utf8');
      const rel = path.slice(ROOT.length);
      if (GAME.test(rel)) src = marked(src, rel);
      if (!src.includes('import.meta.glob')) return { contents: src, loader: 'js' };
      const dir = dirname(path), head = [];
      src = src.replace(CALL, (_, pats, opts) => {
        const list = [].concat(Function(`return ${pats}`)()), o = opts ? Function(`return ${opts}`)() : {};
        const yes = list.filter((p) => !p.startsWith('!')), no = list.filter((p) => p.startsWith('!')).map((p) => new Glob(p.slice(1)));
        const found = new Set();
        for (const p of yes) for (const f of new Glob(p).scanSync({ cwd: dir, dot: false })) {
          const rel = f.startsWith('.') ? f : `./${f}`;
          if (!no.some((g) => g.match(rel) || g.match(f))) found.add(rel);
        }
        const keys = [...found].sort(), at = (k) => JSON.stringify(resolve(dir, k));
        if (o.query === '?url') { const url = (k) => JSON.stringify(pathToFileURL(resolve(dir, k)).href); return `({ ${keys.map((k) => `${JSON.stringify(k)}: ${o.eager ? url(k) : `() => Promise.resolve(${url(k)})`}`).join(', ')} })`; }   // (a file's URL, as Vite's ?url gives the one it emitted: what fetch reads it by)
        if (!o.eager) return `({ ${keys.map((k) => `${JSON.stringify(k)}: () => import(${at(k)})${o.import ? `.then((m) => m[${JSON.stringify(o.import)}])` : ''}`).join(', ')} })`;   // lazy: a function a module
        const names = keys.map((_, i) => `__glob_${head.length + i}`);
        keys.forEach((k, i) => head.push(o.import === 'default' ? `import ${names[i]} from ${at(k)};` : o.import ? `import { ${o.import} as ${names[i]} } from ${at(k)};` : `import * as ${names[i]} from ${at(k)};`));
        return `({ ${keys.map((k, i) => `${JSON.stringify(k)}: ${names[i]}`).join(', ')} })`;
      });
      return { contents: `${head.join('\n')}\n${src}`, loader: 'js' };
    });
  },
});
