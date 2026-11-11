// OS reads the repository as it is: the intents (../Intents/*.md) and the stories (../TheStory/*).
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
      const root = resolve(server.config.root, '..'), intents = resolve(root, 'Intents'), stories = resolve(root, 'TheStory');
      const json = (res, v) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); };
      const text = (res, f) => { if (!existsSync(f)) { res.statusCode = 404; res.end(''); return; } res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end(readFileSync(f)); };
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
          try { list = readdirSync(stories).filter((d) => existsSync(resolve(stories, d, 'story.md'))).sort().map((d) => ({ id: d, film: existsSync(resolve(stories, d, 'timeline.json')) })); } catch {}
          return json(res, list);
        }
        if ((m = url.match(/^\/stories\/([a-z0-9][a-z0-9-]*)\/(story\.md|timeline\.json)$/))) return text(res, resolve(stories, m[1], m[2]));
        res.statusCode = 404; res.end('');
      });
    },
  }],
};
