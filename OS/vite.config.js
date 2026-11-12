// OS reads the repository as it is: the intents (../Intents/*.md), the stories (../Stories/*) and the story ideas (../Stories/ideas/*.md).
// Nothing is copied or cached: the files are the one source.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { createServer } from 'vite';
import { readIdeas } from '../Stories/ideas.js';
import { listScenes, sceneFile, objectPath, objectType } from '../Stories/scenes.js';   // the scenes (timelines that stand alone) and their media, named by hash   // the story ideas (Stories/ideas/*.md), read as they are; changed only by that tool

const front = (text) => { // the few "key: value" lines between the first two ---
  const m = text.match(/^---\n([\s\S]*?)\n---/), out = {};
  if (m) for (const line of m[1].split('\n')) { const k = line.match(/^(\w+):\s*(.*?)\s*(#.*)?$/); if (k) out[k[1]] = k[2].replace(/^"|"$/g, ''); }
  return out;
};

export default {
  plugins: [{
    name: 'os-repository',
    async configureServer(server) {
      // one server for all of TheOS: the game's own Vite runs inside this one, under /game/, with its own config
      const game = await createServer({ root: resolve(server.config.root, '../TheGame'), configFile: resolve(server.config.root, '../TheGame/vite.config.js'), base: '/game/', server: { middlewareMode: true, hmr: { port: 24690 } }, appType: 'mpa' });
      server.middlewares.use((req, res, next) => (req.url.startsWith('/game') ? game.middlewares(req, res, next) : next()));
      server.httpServer?.on('close', () => game.close());
      const root = resolve(server.config.root, '..'), intents = resolve(root, 'Intents'), stories = resolve(root, 'Stories');
      const json = (res, v) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); };
      const text = (res, f) => { if (!existsSync(f)) { res.statusCode = 404; res.end(''); return; } res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end(readFileSync(f)); };
      // the brand, one file for every page of TheOS: ../brand
      server.middlewares.use('/brand', (req, res) => {
        const f = resolve(server.config.root, '../brand', new URL(req.url, 'http://x').pathname.replace(/^\/+/, '').replace(/\.\./g, ''));
        if (!existsSync(f)) { res.statusCode = 404; res.end(''); return; }
        res.setHeader('content-type', f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); res.end(readFileSync(f));
      });
      server.middlewares.use('/api', (req, res) => {
        const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let m;
        // who works here: the first name of the repository's own author (git config), for the dashboard's welcome
        if (url === '/me') { let name = ''; try { name = execSync('git config user.name', { cwd: root, encoding: 'utf8' }).trim().split(/\s+/)[0]; } catch {} return json(res, { name }); }
        if (url === '/intents') {
          const list = readdirSync(intents).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort().map((f) => ({ file: f, slug: f.slice(0, -3), ...front(readFileSync(resolve(intents, f), 'utf8')) }));
          return json(res, list);
        }
        if ((m = url.match(/^\/intents\/(\d{4}-[a-z0-9-]+\.md)$/))) return text(res, resolve(intents, m[1]));
        if (url === '/ideas') return json(res, readIdeas());   // what a story could be told about, lane by lane (the Stories page's Ideas: shown, never changed there)
        if (url === '/scenes') return json(res, listScenes());
        if ((m = url.match(/^\/scenes\/([a-z0-9][a-z0-9-]*)\/scene\.json$/))) return text(res, sceneFile(m[1]));
        // a scene's media by its hash (Stories/objects/, not kept in git); a part of it when a player asks for a range
        if ((m = url.match(/^\/objects\/([0-9a-f]{64})$/))) {
          const f = objectPath(m[1]); if (!f || !existsSync(f)) { res.statusCode = 404; return res.end(''); }
          const all = readFileSync(f), r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
          res.setHeader('content-type', objectType(m[1])); res.setHeader('accept-ranges', 'bytes'); res.setHeader('cache-control', 'max-age=31536000, immutable');
          if (!r) return res.end(all);
          const from = r[1] ? +r[1] : 0, to = r[2] ? Math.min(+r[2], all.length - 1) : all.length - 1;
          res.statusCode = 206; res.setHeader('content-range', `bytes ${from}-${to}/${all.length}`); return res.end(all.subarray(from, to + 1));
        }
        if (url === '/stories') {
          let list = [];
          try { list = readdirSync(stories).filter((d) => ['hook.json', 'arc.json', 'story.md'].some((n) => existsSync(resolve(stories, d, n)))).sort().map((d) => {
            // a story's film also says which day it is, how many humans were in the game that day, and the day's goals
            let t = {}; try { t = JSON.parse(readFileSync(resolve(stories, d, 'timeline.json'), 'utf8')); } catch {}
            let a = {}; try { a = JSON.parse(readFileSync(resolve(stories, d, 'arc.json'), 'utf8')); } catch {}
            let h = {}; try { h = JSON.parse(readFileSync(resolve(stories, d, 'hook.json'), 'utf8')); } catch {}   // its arc, if it has one (Stories/arc.js): a story may stand as an arc alone, before its film
            return { id: d, film: Array.isArray(t.clips), title: h.title || d, intro: h.intro || '',   // a story's one title and its description: its hook's (Stories/hook.js)
              day: t.day ?? a.day, arc: Array.isArray(a.sections), hook: existsSync(resolve(stories, d, 'hook.json')), minutes: Array.isArray(a.sections) ? a.sections.reduce((n, x) => n + x.minutes, 0) : null, inGame: t.inGame ?? a.inGame, goals: t.goals, preview: existsSync(resolve(stories, d, 'preview.jpg')), shots: (() => { try { return readdirSync(resolve(stories, d, 'shots')).filter((f) => f.endsWith('.jpg')).length; } catch { return 0; } })(), secs: Array.isArray(t.clips) ? Math.round(t.clips.reduce((a, c) => a + (c.secs || 0), 0)) : undefined };
          }); } catch {}
          return json(res, list);
        }
        if ((m = url.match(/^\/stories\/([a-z0-9][a-z0-9-]*)\/(story\.md|timeline\.json|arc\.json|hook\.json)$/))) return text(res, resolve(stories, m[1], m[2]));
        if ((m = url.match(/^\/stories\/([a-z0-9][a-z0-9-]*)\/shots\/(\d{1,3})\.jpg$/))) { const f = resolve(stories, m[1], 'shots', m[2] + '.jpg'); if (!existsSync(f)) { res.statusCode = 404; res.end(''); return; } res.setHeader('content-type', 'image/jpeg'); return res.end(readFileSync(f)); }
        if ((m = url.match(/^\/stories\/([a-z0-9][a-z0-9-]*)\/preview\.jpg$/))) { const f = resolve(stories, m[1], 'preview.jpg'); if (!existsSync(f)) { res.statusCode = 404; res.end(''); return; } res.setHeader('content-type', 'image/jpeg'); return res.end(readFileSync(f)); }
        res.statusCode = 404; res.end('');
      });
    },
  }],
};
