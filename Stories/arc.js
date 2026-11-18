// A story's arc (Stories/<story>/arc.json): the viewer's journey through it, and nothing else. Every change is a call of
// this tool; the studio's Arc page only shows it (how: .claude/skills/story-arc/SKILL.md).
//
//   bun Stories/arc.js put <story> < arc.json               the arc made or replaced whole
//   bun Stories/arc.js show <story>                          the journey, a line a section
//   bun Stories/arc.js set <story> <section> key=value …     a section's title, minutes, emotion, charge, how, to, tension, scene
//   bun Stories/arc.js set <story> story from=…              the state the viewer arrives in
//
// The primitives. A story takes a viewer from one state to another, a section at a time:
//
//   arc      { day, from, sections, next, inGame }     from: the state the viewer arrives in
//   section  { id, kind, title, minutes,
//              emotion, charge,                         the one emotion it carries; charge: up (it lifts) or down (it weighs)
//              tension,                                 how strong, 0 to 10
//              how,                                     what in it moves the viewer, one line
//              to,                                      the state it leaves them in, one line: the next section's start
//              scene }                                  its scene, once made (a folder of Stories/scenes/)
//
// The rules. In order: hook, trailer, scenes (three at least, one to three minutes each), relief, outro; ten minutes in
// all (10 to 11). The charge turns at every section (a roller coaster: the hook weighs, the relief lifts, the outro
// weighs again, a cliffhanger for the next day), and neighbours never carry the same emotion. Every line is short (90
// characters): a state or a move that needs more is two. Shots, sound, lines and dialogue are not the arc's: they come
// with the scenes.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { STORIES as HERE, cli, isId, readJSON, writeJSON, assign } from './store.js';

export const KINDS = ['hook', 'trailer', 'scene', 'relief', 'outro'], CHARGES = ['up', 'down'];
const KEYS = ['id', 'kind', 'title', 'minutes', 'emotion', 'charge', 'tension', 'how', 'to', 'scene'], LINE = 90;
const { fail, run } = cli('arc');
const file = (story) => resolve(HERE, story, 'arc.json');
const line = (t, what) => { if (!t || typeof t !== 'string') fail(`${what} is missing`); if (t.length > LINE) fail(`${what} is one short line (${LINE} characters at most): this is ${t.length}`); };

function check(a) {
  line(a.from, 'from (the state the viewer arrives in)');
  const S = a.sections || [], n = S.length, kinds = S.map((s) => s.kind);
  if (kinds[0] !== 'hook' || kinds[1] !== 'trailer' || kinds[n - 2] !== 'relief' || kinds[n - 1] !== 'outro') fail('the order is: hook, trailer, the scenes, relief, outro');
  if (S.slice(2, -2).some((s) => s.kind !== 'scene') || n < 7) fail('between the trailer and the relief stand at least three scenes, and only scenes');
  S.forEach((s, i) => {
    const at = `section ${i + 1} (${s.id || '?'})`;
    if (!isId(s.id)) fail(`${at}: an id of lower-case words joined by hyphens`);
    for (const k of Object.keys(s)) if (!KEYS.includes(k)) fail(`${at}: ${k} is not the arc's (a section is ${KEYS.join(', ')})`);
    line(s.title, `${at}: title`); line(s.how, `${at}: how (what moves the viewer)`); line(s.to, `${at}: to (the state it leaves the viewer in)`);
    if (!s.emotion || /\s/.test(s.emotion.trim())) fail(`${at}: emotion is one word`);
    if (!CHARGES.includes(s.charge)) fail(`${at}: charge is up (it lifts) or down (it weighs)`);
    if (!(s.tension >= 0 && s.tension <= 10)) fail(`${at}: tension is 0 to 10`);
    if (!(s.minutes > 0)) fail(`${at}: minutes`);
    if (s.kind === 'scene' && (s.minutes < 1 || s.minutes > 3)) fail(`${at}: a scene is one to three minutes`);
    if (s.scene && !existsSync(resolve(HERE, 'scenes', s.scene, 'scene.json'))) fail(`${at}: no scene ${s.scene} (Stories/scenes.js list)`);
    const t = S[i + 1]; if (!t) return;
    if (s.charge === t.charge) fail(`${at} and the next both ${s.charge === 'up' ? 'lift' : 'weigh'}: the charge turns at every section`);
    if (s.emotion.toLowerCase() === t.emotion.toLowerCase()) fail(`${at} and the next carry the same emotion (${s.emotion})`);
  });
  if (S[0].charge !== 'down' || S[n - 2].charge !== 'up' || S[n - 1].charge !== 'down') fail('the hook weighs (an open question), the relief lifts, the outro weighs again (a cliffhanger)');
  const total = S.reduce((t, s) => t + s.minutes, 0);
  if (total < 10 || total > 11) fail(`the whole is ten minutes (10 to 11): it is ${+total.toFixed(1)}. A scene too many goes to the next day's story`);
  return a;
}
const load = (story) => (existsSync(file(story)) ? readJSON(file(story)) : fail(`no arc for ${story}`));
function store(story, a) {
  if (!existsSync(resolve(HERE, story, 'hook.json'))) fail(`${story} has no hook yet: step 1 first (bun Stories/hook.js put ${story})`);
  check(a); writeJSON(file(story), a);
}

if (import.meta.main) run({
  put: (story) => { store(story, readJSON(0)); console.log(`arc of ${story} put`); },
  show: (story) => {
    const a = load(story), total = a.sections.reduce((t, s) => t + s.minutes, 0);
    console.log(`${readJSON(resolve(HERE, story, 'hook.json')).title} · day ${a.day} · ${+total.toFixed(1)} min\n\n   ${a.from}`);
    a.sections.forEach((s, i) => console.log(`${i + 1} ${s.kind.padEnd(7)} ${s.title} · ${s.minutes} min · ${s.emotion} ${s.charge === 'up' ? '▲' : '▼'}${s.tension}\n     ${s.how}\n   → ${s.to}`));
  },
  set: (story, sec, ...rest) => {
    const a = load(story), s = sec === 'story' ? a : a.sections.find((x) => x.id === sec) || fail(`no section ${sec}`);
    assign(s, rest, sec === 'story' ? ['from'] : KEYS.filter((k) => k !== 'id' && k !== 'kind'), (k) => fail(`set does not take ${k}`), { minutes: Number, tension: Number });
    store(story, a); console.log(`${story}: ${sec} set`);
  },
}, 'put | show | set', 'put | show | set, then a story\'s folder (see the head of Stories/arc.js)');
