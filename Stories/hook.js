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
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { STORIES as HERE, cli, readJSON, writeJSON, assign } from './store.js';

const { fail, run } = cli('hook');
const words = (t) => String(t || '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;   // (a dash standing alone is no word)
const file = (story) => resolve(HERE, story, 'hook.json');

function check(h) {
  if (words(h.title) < 6 || words(h.title) > 13) fail(`the title is 6 to 13 words: this one is ${words(h.title)}`);
  if (!h.intro || typeof h.intro !== 'string') fail('the intro is described in words: what is seen and said in the film\'s first seconds');
  if (!(h.seconds > 0 && h.seconds <= 20)) fail('the intro is 20 seconds at most (15 to 20)');
  return { title: h.title.trim(), intro: h.intro.trim(), seconds: +h.seconds };
}
const store = (story, h) => writeJSON(file(story), check(h));

if (import.meta.main) run({
  put: (story) => { store(story, readJSON(0)); console.log(`hook of ${story} put`); },
  set: (story, ...rest) => {
    const h = existsSync(file(story)) ? readJSON(file(story)) : {};
    assign(h, rest, ['title', 'intro', 'seconds'], (k) => fail(`set takes title, intro, seconds; not ${k}`), { seconds: Number });
    store(story, h); console.log(`hook of ${story} set`);
  },
  show: (story) => { const h = readJSON(file(story)); console.log(`TITLE  ${h.title}   (${words(h.title)} words)\nINTRO  ${h.seconds} s\n\n${h.intro}`); },
}, 'put | set | show', 'put | set | show, then a story\'s folder');
