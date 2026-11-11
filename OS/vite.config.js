// OS reads the repository as it is: the intents (../Intents/*.md) and the stories (../Stories/*).
// Nothing is copied or cached: the files are the one source.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const front = (text) => { // the few "key: value" lines between the first two ---
  const m = text.match(/^---\n([\s\S]*?)\n---/), out = {};
  if (m) for (const line of m[1].split('\n')) { const k = line.match(/^(\w+):\s*(.*?)\s*(#.*)?$/); if (k) out[k[1]] = k[2].replace(/^"|"$/g, ''); }
  return out;
};

export default {
  plugins: [{
    name: 'os-repository',
    configureServer(server) {
      const root = resolve(server.config.root, '..'), intents = resolve(root, 'Intents'), stories = resolve(root, 'Stories');
      const json = (res, v) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); };
      const text = (res, f) => { if (!existsSync(f)) { res.statusCode = 404; res.end(''); return; } res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end(readFileSync(f)); };
      // the brand, one file for every page of TheOS: ../brand
      server.middlewares.use('/brand', (req, res) => {
        const f = resolve(server.config.root, '../brand', new URL(req.url, 'http://x').pathname.replace(/^\/+/, '').replace(/\.\./g, ''));
        if (!existsSync(f)) { res.statusCode = 404; res.end(''); return; }
        res.setHeader('content-type', f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); res.end(readFileSync(f));
      });
      server.middlewares.use('/api', (req, res) => {
        const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let m;
        if (url === '/intents') {
          const list = readdirSync(intents).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort().map((f) => ({ file: f, slug: f.slice(0, -3), ...front(readFileSync(resolve(intents, f), 'utf8')) }));
          return json(res, list);
        }
        if ((m = url.match(/^\/intents\/(\d{4}-[a-z0-9-]+\.md)$/))) return text(res, resolve(intents, m[1]));
        if (url === '/stories') {
          let list = [];
          try { list = readdirSync(stories).filter((d) => existsSync(resolve(stories, d, 'story.md'))).sort().map((d) => {
            // a story's film also says which day it is, how many humans were in the game that day, and the day's goals
            let t = {}; try { t = JSON.parse(readFileSync(resolve(stories, d, 'timeline.json'), 'utf8')); } catch {}
            return { id: d, film: Array.isArray(t.clips), title: (readFileSync(resolve(stories, d, 'story.md'), 'utf8').match(/^# (.*)$/m) || [])[1] || d,
              day: t.day, inGame: t.inGame, goals: t.goals, preview: existsSync(resolve(stories, d, 'preview.jpg')), secs: Array.isArray(t.clips) ? Math.round(t.clips.reduce((a, c) => a + (c.secs || 0), 0)) : undefined };
          }); } catch {}
          return json(res, list);
        }
        if ((m = url.match(/^\/stories\/([a-z0-9][a-z0-9-]*)\/(story\.md|timeline\.json)$/))) return text(res, resolve(stories, m[1], m[2]));
        if ((m = url.match(/^\/stories\/([a-z0-9][a-z0-9-]*)\/preview\.jpg$/))) { const f = resolve(stories, m[1], 'preview.jpg'); if (!existsSync(f)) { res.statusCode = 404; res.end(''); return; } res.setHeader('content-type', 'image/jpeg'); return res.end(readFileSync(f)); }
        res.statusCode = 404; res.end('');
      });
    },
  }],
};
