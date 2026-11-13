// A story's hook (Stories/<story>/hook.json): its title and its intro, the first fifteen to twenty seconds. Step 1,
// before the arc. Every change is a call of this tool; the studio's Hook page only shows it
// (how: .claude/skills/story-hook/SKILL.md).
//
//   bun Stories/hook.js put <story> < hook.json       the hook made or replaced whole: { title, intro, seconds }
//   bun Stories/hook.js set <story> key=value …       title, intro (what happens in it, in words), seconds
//   bun Stories/hook.js show <story>                   it, as text
//
// Two things, no more: the title, 6 to 13 words; and the intro, described, 20 seconds at most (the front of the film is
// where a viewer stays or leaves). How a hook is built inside is not kept here yet.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error('hook: ' + m); process.exit(1); };
const words = (t) => String(t || '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;   // (a dash standing alone is no word)
const file = (story) => resolve(HERE, story, 'hook.json');

function check(h) {
  if (words(h.title) < 6 || words(h.title) > 13) fail(`the title is 6 to 13 words: this one is ${words(h.title)}`);
  if (!h.intro || typeof h.intro !== 'string') fail('the intro is described in words: what is seen and said in the film\'s first seconds');
  if (!(h.seconds > 0 && h.seconds <= 20)) fail('the intro is 20 seconds at most (15 to 20)');
  return { title: h.title.trim(), intro: h.intro.trim(), seconds: +h.seconds };
}
const store = (story, h) => { mkdirSync(resolve(HERE, story), { recursive: true }); writeFileSync(file(story), JSON.stringify(check(h), null, 1) + '\n'); };

if (import.meta.main) {
  const [cmd, story, ...rest] = process.argv.slice(2);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(story || '')) fail('put | set | show, then a story\'s folder');
  if (cmd === 'put') { store(story, JSON.parse(readFileSync(0, 'utf8'))); console.log(`hook of ${story} put`); }
  else if (cmd === 'set') { const h = existsSync(file(story)) ? JSON.parse(readFileSync(file(story), 'utf8')) : {};
    for (const kv of rest) { const [k, ...v] = kv.split('='); if (!['title', 'intro', 'seconds'].includes(k)) fail(`set takes title, intro, seconds; not ${k}`); h[k] = k === 'seconds' ? +v.join('=') : v.join('='); }
    store(story, h); console.log(`hook of ${story} set`); }
  else if (cmd === 'show') { const h = JSON.parse(readFileSync(file(story), 'utf8')); console.log(`TITLE  ${h.title}   (${words(h.title)} words)\nINTRO  ${h.seconds} s\n\n${h.intro}`); }
  else fail('put | set | show');
}
