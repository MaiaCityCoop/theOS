// The dev server serves the intents' stories (../Stories) and keeps timelines: POST /cine/keep?name=<name> with a timeline's JSON writes
// cine/timelines/<name>.json, so a set of cameras an agent composed can be played back later by name; POST /story-preview keeps a story's picture.
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export default {
  plugins: [{
    name: 'cine-keep',
    configureServer(server) {
      server.middlewares.use('/cine/list', (req, res) => { // the kept timelines' names
        let names = [];
        try { names = readdirSync(resolve(server.config.root, 'cine/timelines')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort(); } catch {}
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(names));
      });
      // the brand, one file for every page of TheOS: ../brand
      server.middlewares.use('/brand', (req, res) => {
        const f = resolve(server.config.root, '../brand', new URL(req.url, 'http://x').pathname.replace(/^\/+/, '').replace(/\.\./g, ''));
        if (!existsSync(f)) { res.statusCode = 404; res.end(''); return; }
        res.setHeader('content-type', f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream'); res.end(readFileSync(f));
      });
      // the stories of the intents, from ../Stories: /story/list, /story/<id>/timeline.json
      server.middlewares.use('/story', (req, res) => {
        const dir = resolve(server.config.root, '../Stories'), url = new URL(req.url, 'http://x').pathname;
        res.setHeader('content-type', 'application/json');
        if (url === '/list') {
          let ids = [];
          try { ids = readdirSync(dir).filter((d) => existsSync(resolve(dir, d, 'timeline.json'))).sort().map((d) => ({ id: d, title: JSON.parse(readFileSync(resolve(dir, d, 'timeline.json'), 'utf8')).title || d })); } catch {}
          res.end(JSON.stringify(ids)); return;
        }
        const m = url.match(/^\/([a-z0-9][a-z0-9-]*)\/timeline\.json$/);
        if (!m || !existsSync(resolve(dir, m[1], 'timeline.json'))) { res.statusCode = 404; res.end('{}'); return; }
        res.end(readFileSync(resolve(dir, m[1], 'timeline.json')));
      });
      // a story's preview picture, filmed in the game: POST /story-preview?id=<story> with a JPEG data URL writes ../Stories/<id>/preview.jpg
      server.middlewares.use('/story-preview', (req, res) => {
        const id = new URL(req.url, 'http://x').searchParams.get('id') || '', dir = resolve(server.config.root, '../Stories', id);
        if (req.method !== 'POST' || !/^[a-z0-9][a-z0-9-]*$/.test(id) || !existsSync(dir)) { res.statusCode = 400; res.end('POST, id of a story'); return; }
        let body = ''; req.on('data', (c) => { body += c; });
        req.on('end', () => { const m = body.match(/^data:image\/jpeg;base64,(.+)$/);
          if (!m) { res.statusCode = 400; res.end('a JPEG data URL'); return; }
          writeFileSync(resolve(dir, 'preview.jpg'), Buffer.from(m[1], 'base64')); res.end('kept'); });
      });
      server.middlewares.use('/cine/keep', (req, res) => {
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
