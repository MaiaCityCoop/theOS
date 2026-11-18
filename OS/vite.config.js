// OS reads the repository as it is: the intents (../Intents/*.md), the stories (../Stories/*), the story ideas
// (../Stories/ideas/*.md), the compass and the scenes, answered by ../server/repo.js, which the game's server shares.
// Nothing is copied or cached: the files are the one source.
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { createServer } from 'vite';
import * as repo from '../server/repo.js';

// The deployed website has no server: a build writes what the dev server answers as files (a list as <path>/index.json,
// as a list's path is also the folder of its items), with the brand (../brand). Caddy serves them as they are
// (deploy/Caddyfile). /api/me names no one (a host has no repository author: the welcome has no name), and a scene's
// media (Stories/objects/) is not in git, so a build has none.
const publish = {
  name: 'publish',
  apply: 'build',
  writeBundle({ dir }) { repo.write(dir, repo.website()); repo.put(dir, '/api/me', JSON.stringify({ name: '' })); },
};

export default {
  plugins: [publish, {
    name: 'os-repository',
    async configureServer(server) {
      // one server for all of TheOS: the game's own Vite runs inside this one, under /game/, with its own config
      const game = await createServer({ root: resolve(server.config.root, '../TheGame'), configFile: resolve(server.config.root, '../TheGame/vite.config.js'), base: '/game/', server: { middlewareMode: true, hmr: { port: 24690 } }, appType: 'mpa' });
      server.middlewares.use((req, res, next) => (req.url.startsWith('/game') ? game.middlewares(req, res, next) : next()));
      server.httpServer?.on('close', () => game.close());
      // who works here: the first name of the repository's own author (git config), for the dashboard's welcome
      server.middlewares.use((req, res, next) => {
        if (new URL(req.url, 'http://x').pathname !== '/api/me') return next();
        let name = ''; try { name = execSync('git config user.name', { cwd: resolve(server.config.root, '..'), encoding: 'utf8' }).trim().split(/\s+/)[0]; } catch {}
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ name }));
      });
      server.middlewares.use(repo.serve());
    },
  }],
};
