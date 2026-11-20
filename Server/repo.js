// The repository as TheOS's two dev servers answer it and their builds write it down: the brand, the intents, the
// story ideas, the compass, the artifact library, the scenes and their media, the stories and the game's kept timelines. One copy, for the
// dashboard (Website/vite.config.js, at /) and the game (TheGame/vite.config.js, at / on its own and at /game inside the
// dashboard's server). Nothing is copied or cached: the files are the one source.
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { front, readJSON } from '../Stories/store.js';
import { readIdeas } from '../Stories/ideas.js';
import { listScenes, objectPath, objectType } from '../Stories/scenes.js';
import { readCompass } from '../Website/compass.js';
import { readArtifacts, ITEMS } from '../Artifacts/store.js';

const ROOT = resolve(import.meta.dirname, '..'), BRAND = resolve(ROOT, 'brand'), INTENTS = resolve(ROOT, 'Intents');
const STORIES = resolve(ROOT, 'Stories'), SCENES = resolve(STORIES, 'scenes'), TIMELINES = resolve(ROOT, 'TheGame/cine/timelines');
// the one table of types, by a file's extension
const MIME = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

// the intents as a board reads them: each file's front matter, a value without its # comment, its spaces or its quotes
const intentList = () => readdirSync(INTENTS).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort().map((f) => ({ file: f, slug: f.slice(0, -3),
  ...Object.fromEntries(Object.entries(front(readFileSync(resolve(INTENTS, f), 'utf8'))).map(([k, v]) => [k, v.replace(/#.*/, '').trim().replace(/^"|"$/g, '')])) }));
// the stories, each shortly, as the dashboard lists them (/api/stories): a story may stand as a hook or an arc alone,
// before its film; a film also says which day it is, how many humans were in the game that day, and the day's goals
const storyList = () => {
  try { return readdirSync(STORIES).filter((d) => ['hook.json', 'arc.json', 'story.md'].some((n) => existsSync(resolve(STORIES, d, n)))).sort().map((d) => {
    const t = readJSON(resolve(STORIES, d, 'timeline.json'), {}), a = readJSON(resolve(STORIES, d, 'arc.json'), {}), h = readJSON(resolve(STORIES, d, 'hook.json'), {});
    return { id: d, film: Array.isArray(t.clips), title: h.title || d, intro: h.intro || '',   // a story's one title and its description: its hook's (Stories/hook.js)
      day: t.day ?? a.day, arc: Array.isArray(a.sections), hook: existsSync(resolve(STORIES, d, 'hook.json')), minutes: Array.isArray(a.sections) ? a.sections.reduce((n, x) => n + x.minutes, 0) : null, inGame: t.inGame ?? a.inGame, goals: t.goals, preview: existsSync(resolve(STORIES, d, 'preview.jpg')), shots: (() => { try { return readdirSync(resolve(STORIES, d, 'shots')).filter((f) => f.endsWith('.jpg')).length; } catch { return 0; } })(), secs: Array.isArray(t.clips) ? Math.round(t.clips.reduce((n, c) => n + (c.secs || 0), 0)) : undefined };
  }); } catch { return []; }
};
// the stories that have a film or an arc, as the game reads them (/story/list): a day's story may stand as an arc alone,
// its day and its citizens are there
const gameList = () => {
  try { return readdirSync(STORIES).filter((d) => existsSync(resolve(STORIES, d, 'timeline.json')) || existsSync(resolve(STORIES, d, 'arc.json'))).sort().map((d) => { const j = readJSON(['timeline.json', 'arc.json'].map((n) => resolve(STORIES, d, n)).find(existsSync)), h = readJSON(resolve(STORIES, d, 'hook.json'), {}); return { id: d, title: h.title || j.title || d, day: j.day ?? null, inGame: j.inGame ?? null }; }); } catch { return []; }
};
const timelineNames = () => { try { return readdirSync(TIMELINES).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort(); } catch { return []; } };
const shotsOf = (id) => { try { return readdirSync(resolve(STORIES, id, 'shots')).filter((f) => /^\d{1,3}\.jpg$/.test(f)); } catch { return []; } };

const json = (v) => ({ type: 'application/json', body: JSON.stringify(v) });
// a file of `dir` with its type, or null where there is none (nothing outside `dir`)
const file = (dir, path) => { const f = resolve(dir, './' + path); return f.startsWith(dir + sep) && statSync(f, { throwIfNoEntry: false })?.isFile() ? { type: MIME[extname(f)] ?? 'application/octet-stream', body: readFileSync(f) } : null; };

/** What the repository answers at `path` ({ type, body }), null where it has nothing, undefined for a path not its own. */
function answer(path) {
  let m;
  if ((m = path.match(/^\/brand\/(.+)$/))) return file(BRAND, m[1]);   // the brand, one file for every page of TheOS
  if (path === '/api/intents') return json(intentList());
  if ((m = path.match(/^\/api\/intents\/(\d{4}-[a-z0-9-]+\.md)$/))) return file(INTENTS, m[1]);
  if (path === '/api/ideas') return json(readIdeas());   // what a story could be told about, lane by lane (shown, never changed there)
  if (path === '/api/compass') return json(readCompass(ROOT));   // the serial's compass (../Compass): the vision, the mission, the game, characters, arcs, world, episodes
  if (path === '/api/artifacts') return json(readArtifacts());   // the artifact library (../Artifacts): outside sources, each with our summary and tags
  if ((m = path.match(/^\/api\/artifacts\/([a-z0-9][a-z0-9-]*)\/(artifact\.json|source\.md|thumb\.jpg)$/))) return file(ITEMS, `${m[1]}/${m[2]}`);   // source.md and thumb.jpg only where this machine has them (not in git)
  if (path === '/api/scenes') return json(listScenes());
  if ((m = path.match(/^\/api\/scenes\/([a-z0-9][a-z0-9-]*)\/scene\.json$/))) return file(SCENES, `${m[1]}/scene.json`);
  if (path === '/api/stories') return json(storyList());
  if ((m = path.match(/^\/api\/stories\/([a-z0-9][a-z0-9-]*)\/(story\.md|timeline\.json|arc\.json|hook\.json|preview\.jpg|shots\/\d{1,3}\.jpg)$/))) return file(STORIES, `${m[1]}/${m[2]}`);
  if (path === '/story/list') return json(gameList());
  if ((m = path.match(/^\/story\/([a-z0-9][a-z0-9-]*)\/timeline\.json$/))) return file(STORIES, `${m[1]}/timeline.json`);
  if (path === '/cine/list') return json(timelineNames());   // the game's kept timelines' names (TheGame/cine/timelines)
  if ((m = path.match(/^\/cine\/timelines\/([^/]+\.json)$/))) return file(TIMELINES, m[1]);
  return /^\/(api|brand|story)\//.test(path) ? null : undefined;   // the repository's own paths: what isn't there is a 404, never a page
}

/** The repository's answers on a dev server whose pages live under `base` ('' or '/game'), for GET and HEAD. */
export const serve = (base = '') => (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let path; try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return next(); }
  if (!path.startsWith(base + '/')) return next();
  path = path.slice(base.length);
  const m = path.match(/^\/api\/objects\/([0-9a-f]{64})$/);
  if (m) return object(req, res, m[1]);
  const a = answer(path);
  if (a === undefined) return next();
  if (!a) { res.statusCode = 404; return res.end(''); }
  res.setHeader('content-type', a.type); res.end(a.body);
};

// a scene's media by its hash (Stories/objects/, not kept in git); a part of it when a player asks for a range
function object(req, res, hash) {
  const f = objectPath(hash); if (!f || !existsSync(f)) { res.statusCode = 404; return res.end(''); }
  const all = readFileSync(f), r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  res.setHeader('content-type', objectType(hash)); res.setHeader('accept-ranges', 'bytes'); res.setHeader('cache-control', 'max-age=31536000, immutable');
  if (!r) return res.end(all);
  const from = r[1] ? +r[1] : 0, to = r[2] ? Math.min(+r[2], all.length - 1) : all.length - 1;
  res.statusCode = 206; res.setHeader('content-range', `bytes ${from}-${to}/${all.length}`); return res.end(all.subarray(from, to + 1));
}

/** One file of a build: `body` at `path` in `out`, a list of /api at <path>/index.json (its path is also its items' folder). */
export const put = (out, path, body) => { const f = resolve(out, '.' + (path.startsWith('/api/') && !extname(path) ? `${path}/index.json` : path)); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, body); };

/** A build's copy of the repository: the brand (without the drafts it was chosen from, Brand/sheets/, which no page
 *  loads), and what the dev server answers at each of `paths` that has an answer. */
const DRAFTS = resolve(BRAND, 'sheets');
export const write = (out, paths) => { cpSync(BRAND, resolve(out, 'brand'), { recursive: true, filter: (f) => f !== DRAFTS }); for (const p of paths) { const a = answer(p); if (a) put(out, p, a.body); } };

/** What the website's build holds (Website/): every list and file the dashboard reads. */
export const website = () => ['/api/intents', ...intentList().map((i) => `/api/intents/${i.file}`), '/api/ideas', '/api/compass', '/api/artifacts', '/api/scenes', ...listScenes().map((s) => `/api/scenes/${s.id}/scene.json`), '/api/stories',
  ...storyList().flatMap(({ id }) => [...['story.md', 'timeline.json', 'arc.json', 'hook.json', 'preview.jpg'].map((n) => `/api/stories/${id}/${n}`), ...shotsOf(id).map((f) => `/api/stories/${id}/shots/${f}`)])];

/** What the game's build holds (TheGame/): its stories' films, its kept timelines, and the scenes its film pages play, at the
 *  path the website's server answers them on. */
export const game = () => ['/story/list', ...gameList().map(({ id }) => `/story/${id}/timeline.json`), '/cine/list', ...timelineNames().map((n) => `/cine/timelines/${n}.json`), ...listScenes().map((s) => `/api/scenes/${s.id}/scene.json`)];
