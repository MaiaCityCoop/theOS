// The dev server answers the repository (the brand, the stories, the scenes and the kept timelines' names) as the
// dashboard's does (../server/repo.js), and keeps timelines: POST /cine/keep?name=<name> with a timeline's JSON writes
// cine/timelines/<name>.json, so a set of cameras an agent composed can be played back later by name; POST /story-preview keeps a story's picture.
import { writeFileSync, appendFileSync, mkdirSync, readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';
import { spawn } from 'node:child_process';
import { buildRegistry, FOLDERS, SHARED, MEASURES } from './tools/registry.js';
import * as repo from '../server/repo.js';

const ROOT = import.meta.dirname;
// the registry's manifest (registry.json, tools/registry.js): made at the start, and again whenever a recipe, or what
// every recipe builds with (SHARED: the dice, the measure), changes; and after it what is measured of the recipes, each
// in a process of its own: the solids' rooms (rooms.json, tools/rooms.js: measured from their hierarchies, those whose
// version changed) and the plants' outlines (outlines.json, tools/outlines.js: what the page must know of each plant
// before any of its meshes is made); one run at a time (a change while one runs: one more after it)
let measuring = null, again = false;
const measure = () => {
  if (measuring) { again = true; return measuring; }
  const run = (f) => new Promise((res) => spawn(process.execPath, [resolve(ROOT, f)], { stdio: 'inherit' }).on('exit', res));
  return (measuring = Promise.all(MEASURES.map((m) => run(m.maker))).then(() => { measuring = null; if (again) { again = false; return measure(); } }));
};
const registry = {
  name: 'registry',
  async buildStart() { buildRegistry(ROOT); await measure(); },
  configureServer(server) {
    buildRegistry(ROOT); measure();
    server.watcher.on('all', (_, file) => { if (FOLDERS.some((d) => file.startsWith(resolve(ROOT, d) + '/')) || SHARED.some((f) => file === resolve(ROOT, f))) { try { buildRegistry(ROOT); measure(); } catch (e) { console.error('[registry]', e.message); } } });
  },
};

// The deployed game has no server: a build writes what the dev server answers from the repository as files beside the
// pages (../server/repo.js): the brand, the stories' films, the kept timelines and the scenes. A scene's media
// (Stories/objects/) is not in git, so a build has none. Caddy serves them as they are (deploy/Caddyfile).
// Two things for the start (intent 0026): the brand's files a page names are asked for by their content (?v=, the start
// of their hash), so the host keeps them for good like the scripts, and a second visit asks for none of them; and every
// file that compresses is written compressed beside itself as well (brotli at its best, .br), which the host sends
// where it is accepted, a fifth less than what it compresses as it sends.
const BRAND = resolve(ROOT, '../brand'), versionOf = (f) => createHash('sha256').update(readFileSync(resolve(BRAND, f))).digest('hex').slice(0, 10);
const SQUEEZE = new Set(['.js', '.css', '.html', '.json', '.svg']);
const squeeze = (dir) => { for (const n of readdirSync(dir)) { const f = join(dir, n), st = statSync(f); if (st.isDirectory()) squeeze(f); else if (SQUEEZE.has(extname(n)) && st.size >= 1024) writeFileSync(f + '.br', brotliCompressSync(readFileSync(f), { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: st.size } })); } };
const publish = {
  name: 'publish',
  apply: 'build',
  transformIndexHtml(html) { return html.replace(/(["'])\/brand\/(brand\.css|loading\.js|MaiaCity\.svg)\1/g, (m, q, f) => `${q}/brand/${f}?v=${versionOf(f)}${q}`); },
  closeBundle() { squeeze(resolve(ROOT, 'dist')); },
  writeBundle({ dir }) { repo.write(dir, repo.game()); },
};

// The dev server sends what compresses compressed (gzip, where the browser takes it): its modules come with their source
// maps written into them, three times their size, 17.6 MB in all for one start, which a phone on the dev server
// (`bun run lan`) fetches over the air (intent 0026). Each answer is compressed once, kept by its ETag.
const squeezeDev = {
  name: 'squeeze-dev',
  apply: 'serve',
  configureServer(server) {
    const kept = new Map(), TYPES = /javascript|css|json|html|svg/;
    server.middlewares.use((req, res, next) => {
      if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
      const end = res.end;
      res.end = function (chunk, ...rest) {
        res.end = end;
        if ((typeof chunk === 'string' || chunk instanceof Uint8Array) && chunk.length >= 1024 && res.statusCode === 200 && !res.headersSent && !res.getHeader('content-encoding') && TYPES.test(String(res.getHeader('content-type') || ''))) {
          const key = res.getHeader('etag') && `${req.url}|${res.getHeader('etag')}`;
          let gz = key && kept.get(key);
          if (!gz) { gz = gzipSync(chunk, { level: 4 }); if (key) { if (kept.size > 3000) kept.delete(kept.keys().next().value); kept.set(key, gz); } }
          res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Vary', 'Accept-Encoding'); res.setHeader('Content-Length', gz.length);
          return end.call(this, gz, ...rest.filter((x) => typeof x === 'function'));
        }
        return end.call(this, chunk, ...rest);
      };
      next();
    });
  },
};

export default {
  // the pages a build makes: the game, the way back from aven.id (src/account/callback.js), and the views the website frames:
  // a story's film (timeline.html), the lenses and the library
  build: { rolldownOptions: { input: Object.fromEntries(['index', 'callback', 'timeline', 'lenses', 'library', 'me'].map((n) => [n, resolve(ROOT, n + '.html')])) } },
  plugins: [registry, publish, squeezeDev, {
    name: 'cine-keep',
    configureServer(server) {
      const B = (server.config.base || '/').replace(/\/$/, '');   // '' on its own, '/game' inside the dashboard's server
      // the game's API (../API, intent 0024) at the paths Caddy gives it when deployed: handed on to MAIA_API (an API run
      // on this machine, e.g. `bun src/server.js` in API/ with INSECURE_COOKIE=1), the cookie and the origin with it
      const API = process.env.MAIA_API || 'http://127.0.0.1:8083', apiPath = new RegExp(`^${B}/api/(session|me)(/|\\?|$)`);
      server.middlewares.use(async (req, res, next) => {
        if (!apiPath.test(req.url)) return next();
        const chunks = []; for await (const c of req) chunks.push(c);
        const pass = (k) => (req.headers[k] ? { [k]: req.headers[k] } : {});
        try {
          const r = await fetch(API + req.url.slice(B.length), { method: req.method, redirect: 'manual', headers: { ...pass('cookie'), ...pass('origin'), ...pass('content-type'), ...pass('accept') },
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
          res.statusCode = r.status;
          for (const k of ['content-type', 'cache-control', 'retry-after']) if (r.headers.get(k)) res.setHeader(k, r.headers.get(k));
          if (r.headers.getSetCookie().length) res.setHeader('set-cookie', r.headers.getSetCookie());
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch { res.statusCode = 502; res.setHeader('content-type', 'application/json'); res.end('{"error":"api_unreachable"}'); }
      });
      // the repository, as the dashboard's server answers it: the brand, /story/list, /story/<id>/timeline.json,
      // /cine/list, and the scenes and their media a film page plays (/api/scenes, /api/objects)
      server.middlewares.use(repo.serve(B));
      // a story's preview picture, filmed in the game: POST /story-preview?id=<story> with a JPEG data URL writes ../Stories/<id>/preview.jpg
      server.middlewares.use(B + '/story-preview', (req, res) => {
        const id = new URL(req.url, 'http://x').searchParams.get('id') || '', dir = resolve(server.config.root, '../Stories', id);
        if (req.method !== 'POST' || !/^[a-z0-9][a-z0-9-]*$/.test(id) || !existsSync(dir)) { res.statusCode = 400; res.end('POST, id of a story'); return; }
        let body = ''; req.on('data', (c) => { body += c; });
        req.on('end', () => { const m = body.match(/^data:image\/jpeg;base64,(.+)$/);
          if (!m) { res.statusCode = 400; res.end('a JPEG data URL'); return; }
          writeFileSync(resolve(dir, 'preview.jpg'), Buffer.from(m[1], 'base64')); res.end('kept'); });
      });
      // a shot's still, taken once by the story editor: POST /story-shot?id=<story>&i=<shot> writes ../Stories/<id>/shots/<i>.jpg
      server.middlewares.use(B + '/story-shot', (req, res) => {
        const q = new URL(req.url, 'http://x').searchParams, id = q.get('id') || '', i = q.get('i') || '', dir = resolve(server.config.root, '../Stories', id);
        if (req.method !== 'POST' || !/^[a-z0-9][a-z0-9-]*$/.test(id) || !/^\d{1,3}$/.test(i) || !existsSync(dir)) { res.statusCode = 400; res.end('POST, id and i'); return; }
        let body = ''; req.on('data', (c) => { body += c; });
        req.on('end', () => { const m = body.match(/^data:image\/jpeg;base64,(.+)$/); if (!m) { res.statusCode = 400; res.end('a JPEG data URL'); return; }
          mkdirSync(resolve(dir, 'shots'), { recursive: true }); writeFileSync(resolve(dir, 'shots', i + '.jpg'), Buffer.from(m[1], 'base64')); res.end('kept'); });
      });
      // the hitch log (dev only): the game posts its slow frames here; appended to .perf/hitches.jsonl
      server.middlewares.use(B + '/perf-log', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 400; res.end(''); return; }
        let body = ''; req.on('data', (c) => { body += c; });
        req.on('end', () => { try { JSON.parse(body); const dir = resolve(server.config.root, '.perf'); mkdirSync(dir, { recursive: true }); appendFileSync(resolve(dir, 'hitches.jsonl'), body + '\n'); } catch {} res.end('ok'); });
      });
      server.middlewares.use(B + '/cine/keep', (req, res) => {
        const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
        if (req.method !== 'POST' || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(name)) { res.statusCode = 400; res.end('POST, name: a-z 0-9 -'); return; }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const clips = JSON.parse(body);
            if (!Array.isArray(clips)) throw new Error('a list of clips');
            const dir = resolve(server.config.root, 'cine/timelines');
            mkdirSync(dir, { recursive: true });
            writeFileSync(resolve(dir, name + '.json'), JSON.stringify(clips, null, 1) + '\n');
            res.end('kept');
          } catch (e) { res.statusCode = 400; res.end(String(e.message)); }
        });
      });
    },
  }],
};
