// A story's arc (Stories/<story>/arc.json): its sections and the tension that runs through them, before any word of it
// is written. Every change is a call of this tool; the studio's Arc page only shows it (how: .claude/skills/story-arc/SKILL.md).
//
//   bun Stories/arc.js put <story> < arc.json      the arc made or replaced whole (the story's folder is made if it is not there)
//   bun Stories/arc.js show <story>                 its sections, their contrasts and gateways, as text
//   bun Stories/arc.js set <story> <section> key=value …    one section's field (title, idea, scene, minutes, setting, emotion, feeling,
//                                                   pace, dynamic, music, question, release, gate, colour=name:#hex, tension=in:peak:out)
//
// A story is a long film (ten minutes and more) composed of scenes. A scene is a short: a timeline of its own that stands
// alone (it is also posted by itself) and that any story may contain (Stories/scenes.js; a section names its scene once
// it is made: `scene`). In order: 1 a hook, 2 a trailer, then scenes of one to three minutes, then the big relief (the
// hook's promise kept), then an outro that is a cliffhanger for the next day (it ends higher than it began). The whole is ten minutes (10 to 11): a
// scene too many belongs to the next day's story. Each scene has
// its own setting, feeling, pace and music, its own pressing question and its release. Neighbours are opposites: the
// stronger the contrast across a gateway, the better, and each gateway says its contrast in words.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CHARGES = ['up', 'down'];   // an emotion's charge: neighbours never share it, so two lifting emotions (hope, then belonging) cannot follow one another
export const KINDS = ['hook', 'trailer', 'scene', 'relief', 'outro'], PACES = ['still', 'slow', 'medium', 'fast', 'frantic'], DYNAMICS = ['calm', 'playful', 'tense', 'hectic', 'majestic', 'intimate'];
const TEXTS = ['title', 'setting', 'emotion', 'feeling', 'music', 'question', 'release'];
const fail = (m) => { console.error('arc: ' + m); process.exit(1); };
const file = (story) => resolve(HERE, story, 'arc.json');

function check(a) {
  if (!a.promise) fail('an arc has a promise (what the hook promises and the relief keeps); its title is the hook\'s, not its own');
  delete a.title;   // one title a story: its hook's (Stories/hook.js)
  const S = a.sections || [], n = S.length, kinds = S.map((s) => s.kind);
  if (kinds[0] !== 'hook' || kinds[1] !== 'trailer' || kinds[n - 2] !== 'relief' || kinds[n - 1] !== 'outro') fail('the order is: hook, trailer, the shorts, relief, outro');
  if (S.slice(2, -2).some((s) => s.kind !== 'scene') || n < 7) fail('between the trailer and the relief stand at least three scenes, and only scenes');
  S.forEach((s, i) => {
    const at = `section ${i + 1} (${s.id || '?'})`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s.id || '')) fail(`${at}: an id of lower-case words joined by hyphens`);
    for (const k of TEXTS) if (!s[k] || typeof s[k] !== 'string') fail(`${at}: ${k} is missing`);
    if (!PACES.includes(s.pace)) fail(`${at}: pace is one of ${PACES.join(', ')}`);
    if (!DYNAMICS.includes(s.dynamic)) fail(`${at}: dynamic is one of ${DYNAMICS.join(', ')}`);
    if (!CHARGES.includes(s.charge)) fail(`${at}: charge is up (an emotion that lifts: hope, belonging, delight, awe, triumph, peace) or down (one that weighs: doubt, longing, frustration, fear, unease)`);
    if (!s.colour?.name || !/^#[0-9a-f]{6}$/i.test(s.colour?.hex || '')) fail(`${at}: colour is { name, hex: '#rrggbb' }`);
    const T = s.tension || {}; for (const k of ['in', 'peak', 'out']) if (!(T[k] >= 0 && T[k] <= 10)) fail(`${at}: tension.${k} is 0 to 10`);
    if (!(s.minutes > 0)) fail(`${at}: minutes`);
    if (s.kind === 'scene' && (s.minutes < 1 || s.minutes > 3)) fail(`${at}: a scene is one to three minutes`);
    if (s.scene && !existsSync(resolve(HERE, 'scenes', s.scene, 'scene.json'))) fail(`${at}: no scene ${s.scene} (Stories/scenes.js list)`);
    if (s.kind === 'scene' && !(T.peak > T.in && T.peak > T.out)) fail(`${at}: a scene rises to its peak and is released: peak above in and out`);
    for (const b of s.beats || []) if (!(b.at >= 0 && b.at <= 1) || !(b.level >= 0 && b.level <= 10) || !b.note) fail(`${at}: a beat is { at: 0..1, level: 0..10, note }`);
    if (i < n - 1) {
      if (!s.gate) fail(`${at}: its gateway into the next scene says the contrast in words`);
      const t = S[i + 1];
      // neighbours are opposites in every sense the arc names: never the same pace, the same dynamic, the same colour or the same emotion
      for (const k of ['pace', 'dynamic', 'emotion', 'charge']) if (String(s[k]).toLowerCase() === String(t[k]).toLowerCase()) fail(`${at} and the next have the same ${k} (${s[k]}): neighbours contrast in every sense`);
      if (s.colour.hex.toLowerCase() === t.colour.hex.toLowerCase()) fail(`${at} and the next have the same colour`);
    }
  });
  const total = S.reduce((t, s) => t + s.minutes, 0);
  if (total < 10 || total > 11) fail(`the whole is ten minutes (10 to 11): it is ${+total.toFixed(1)}. A scene too many goes to the next day's story`);
  const out = S[n - 1].tension; if (!(out.out > out.in)) fail('the outro is a cliffhanger for the next day: it ends higher than it began (tension.out above tension.in), its question left open');
  return a;
}
const load = (story) => (existsSync(file(story)) ? JSON.parse(readFileSync(file(story), 'utf8')) : fail(`no arc for ${story}`));
function store(story, a) {
  if (!existsSync(resolve(HERE, story, 'hook.json'))) fail(`${story} has no hook yet: step 1 first (bun Stories/hook.js put ${story})`);
  check(a); writeFileSync(file(story), JSON.stringify(a, null, 1) + '\n');
}

if (import.meta.main) {
  const [cmd, story, sec, ...rest] = process.argv.slice(2);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(story || '')) fail('put | show | set, then a story\'s folder (see the head of Stories/arc.js)');
  if (cmd === 'put') { store(story, JSON.parse(readFileSync(0, 'utf8'))); console.log(`arc of ${story} put`); }
  else if (cmd === 'show') {
    const a = load(story), total = a.sections.reduce((t, s) => t + s.minutes, 0);
    console.log(`${JSON.parse(readFileSync(resolve(HERE, story, 'hook.json'), 'utf8')).title} · day ${a.day} · ${total} min\npromise: ${a.promise}\n`);
    a.sections.forEach((s, i) => { console.log(`${String(i + 1).padStart(2)} ${s.kind.padEnd(7)} ${s.title}  (${s.minutes} min${s.idea ? ', ' + s.idea : ''})\n   ${s.colour.name} · ${s.pace} · ${s.dynamic} · ${s.emotion} (${s.charge}) · ${s.setting}\n   tension ${s.tension.in} → ${s.tension.peak} → ${s.tension.out}: ${s.question} → ${s.release}`); if (s.gate) console.log(`   ⇣ ${s.gate}`); });
  } else if (cmd === 'set') {
    const a = load(story), s = a.sections.find((x) => x.id === sec) || fail(`no section ${sec}`);
    for (const kv of rest) { const [k, ...v] = kv.split('='), val = v.join('=');
      if (k === 'colour') { const [name, hex] = val.split(':'); s.colour = { name, hex }; }
      else if (k === 'tension') { const [i, p, o] = val.split(':').map(Number); s.tension = { in: i, peak: p, out: o }; }
      else if (k === 'minutes') s.minutes = +val;
      else if ([...TEXTS, 'idea', 'scene', 'pace', 'dynamic', 'charge', 'gate'].includes(k)) s[k] = val;
      else fail(`set does not take ${k}`); }
    store(story, a); console.log(`${story}: ${sec} set`);
  } else fail('put | show | set');
}
