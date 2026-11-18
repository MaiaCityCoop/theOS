// The story ideas' one door (Stories/ideas/*.md): every change to an idea is a call of this tool; no one edits the files
// by hand, and the dashboard's Ideas page only shows them (server/repo.js reads them with readIdeas, below).
//
//   bun Stories/ideas.js list                         every idea, lane by lane
//   bun Stories/ideas.js show <id>                    one idea, whole
//   bun Stories/ideas.js put  < idea.json             an idea made or replaced whole: { id, title, lane, hook, intents: ['0008'],
//                                                     stage?, happened: [{ at, intent, text }], words: [{ intent, text }], shots: ['…'] }
//                                                     (an array of such: several at once)
//   bun Stories/ideas.js set <id> key=value …         title, lane, hook, intents (0008,0010), story (a story's folder)
//   bun Stories/ideas.js stage <id> <stage>           raw | hooked | scripted | filmed | told
//   bun Stories/ideas.js note <id> happened|words|shots "text" [intent] [at]     one more line of its material
//   bun Stories/ideas.js merge <from> <into>          one idea's material and intents into another; the first is removed
//   bun Stories/ideas.js dismiss <id> | restore <id>  not for stories (kept, shown folded away) | for stories again
//   bun Stories/ideas.js lanes "A|B|C"                the lanes' order on the page
//   bun Stories/ideas.js gathered <commit>            how far the history has been read (the next gathering starts after it)
//
// An idea is a topic a story could be told about, gathered backwards from the intents' history (how:
// .claude/skills/story-ideas/SKILL.md). It names the intents it draws from, so a story gathers across intents.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { STORIES as HERE, cli, isId, readJSON, writeJSON, assign, front } from './store.js';

export const STAGES = ['raw', 'hooked', 'scripted', 'filmed', 'told'];
const DIR = resolve(HERE, 'ideas'), META = resolve(DIR, 'ideas.json'), INTENTS = resolve(HERE, '../Intents');
const SECTIONS = { happened: 'What happened', words: "Samuel's own words", shots: 'What the world can show' };
const commas = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);   // "0008, 0010" as ['0008', '0010']

const line = { happened: (x) => `- ${x.at ? x.at + ' · ' : ''}${x.intent ? '[' + x.intent + '] ' : ''}${x.text}`, words: (x) => `- ${x.intent ? '[' + x.intent + '] ' : ''}"${x.text}"`, shots: (x) => `- ${x}` };
const parse = {
  happened: (s) => { const m = s.match(/^(?:(\S[^·\[]*?) · )?(?:\[(\d{4})\] )?(.*)$/); return { at: m[1] || '', intent: m[2] || '', text: m[3] }; },
  words: (s) => { const m = s.match(/^(?:\[(\d{4})\] )?"?(.*?)"?$/); return { intent: m[1] || '', text: m[2] }; },
  shots: (s) => s,
};
const text = (i) => `---\nid: ${i.id}\ntitle: ${i.title}\nlane: ${i.lane}\nhook: ${i.hook || ''}\nstage: ${i.stage}\nintents: ${i.intents.join(', ')}\nstory: ${i.story || ''}\ndismissed: ${i.dismissed ? 'yes' : 'no'}\nupdated: ${i.updated}\n---\n\n# ${i.title}\n\n` +
  Object.entries(SECTIONS).map(([k, h]) => `## ${h}\n\n${(i[k] || []).map(line[k]).join('\n') || '_nothing gathered yet_'}\n`).join('\n');
function read(file) {
  const s = readFileSync(file, 'utf8'), f = front(s);
  const i = { id: f.id, title: f.title, lane: f.lane, hook: f.hook || '', stage: f.stage || 'raw', intents: commas(f.intents || ''), story: f.story || '', dismissed: f.dismissed === 'yes', updated: f.updated || '' };
  for (const [k, h] of Object.entries(SECTIONS)) { const m = s.match(new RegExp(`## ${h.replace(/[']/g, "'")}\\n\\n([\\s\\S]*?)(?=\\n## |$)`)); i[k] = m ? m[1].split('\n').filter((l) => l.startsWith('- ')).map((l) => parse[k](l.slice(2))) : []; }
  return i;
}
const meta = () => readJSON(META, { lanes: [], gathered: null });

/** Every idea and how they are laid out: { lanes, gathered, ideas } (what the Ideas page shows). */
export function readIdeas() {
  if (!existsSync(DIR)) return { lanes: [], gathered: null, ideas: [] };
  const ideas = readdirSync(DIR).filter((f) => f.endsWith('.md')).sort().map((f) => read(resolve(DIR, f))), m = meta();
  const lanes = [...m.lanes, ...[...new Set(ideas.map((i) => i.lane))].filter((l) => !m.lanes.includes(l))];
  return { lanes, gathered: m.gathered, ideas };
}

// ---- the tool ----
const { fail, run } = cli('ideas');
const today = () => new Date().toISOString().slice(0, 10);
const intentIds = () => readdirSync(INTENTS).map((f) => (f.match(/^(\d{4})-/) || [])[1]).filter(Boolean);
function check(i) {
  if (!isId(i.id)) fail(`an id is lower-case words joined by hyphens: ${i.id}`);
  for (const k of ['title', 'lane']) if (!i[k] || /\n/.test(i[k])) fail(`${i.id}: ${k} is one line, not empty`);
  if (!STAGES.includes(i.stage)) fail(`${i.id}: a stage is one of ${STAGES.join(', ')}`);
  const known = intentIds(); for (const n of i.intents) if (!known.includes(n)) fail(`${i.id}: no intent ${n}`);
  if (!i.intents.length) fail(`${i.id}: it names the intents it draws from`);
  for (const x of [...i.happened, ...i.words]) if (x.intent && !i.intents.includes(x.intent)) fail(`${i.id}: a line cites intent ${x.intent}, which the idea does not name`);
  return i;
}
const file = (id) => resolve(DIR, id + '.md');
const load = (id) => (existsSync(file(id)) ? read(file(id)) : fail(`no idea ${id}`));
const store = (i) => { mkdirSync(DIR, { recursive: true }); i.updated = today(); writeFileSync(file(i.id), text(check(i))); return i; };
const whole = (o) => ({ id: o.id, title: o.title, lane: o.lane, hook: o.hook || '', stage: o.stage || 'raw', intents: (o.intents || []).map(String), story: o.story || '', dismissed: !!o.dismissed, happened: o.happened || [], words: o.words || [], shots: o.shots || [] });
const fold = (a, away) => { const i = load(a); i.dismissed = away; store(i); console.log(`${a}: ${away ? 'not for stories' : 'for stories again'}`); };

if (import.meta.main) run({
  list: () => {
    const { lanes, ideas, gathered } = readIdeas();
    for (const l of lanes) { console.log(`\n${l}`); for (const i of ideas.filter((x) => x.lane === l && !x.dismissed)) console.log(`  ${i.id.padEnd(22)} ${i.stage.padEnd(9)} [${i.intents.join(' ')}]  ${i.title}: ${i.hook}`); }
    const off = ideas.filter((x) => x.dismissed); if (off.length) console.log(`\nNot for stories\n  ${off.map((i) => i.id).join(', ')}`);
    console.log(`\n${ideas.length} ideas; history read up to ${gathered?.commit ?? 'nothing yet'}`);
  },
  show: (a) => console.log(text(load(a))),
  put: () => { const got = readJSON(0); for (const o of Array.isArray(got) ? got : [got]) { store(whole(o)); console.log('put ' + o.id); } },
  set: (a, ...rest) => {
    const i = load(a);
    assign(i, rest.filter(Boolean), ['title', 'lane', 'hook', 'intents', 'story'], (k) => fail(`set takes title, lane, hook, intents, story; not ${k}`), { intents: commas });
    store(i); console.log('set ' + a);
  },
  stage: (a, b) => { const i = load(a); i.stage = b; store(i); console.log(`${a}: ${b}`); },
  note: (a, b, t, intent = '', at = '') => {
    const i = load(a); if (!SECTIONS[b] || !t) fail('note <id> happened|words|shots "text" [intent] [at]');
    const item = b === 'shots' ? t : b === 'words' ? { intent, text: t } : { at, intent, text: t };
    if (!i[b].some((x) => (x.text ?? x) === t)) i[b].push(item);
    store(i); console.log(`noted on ${a}`);
  },
  merge: (a, b) => {
    const from = load(a), into = load(b);
    into.intents = [...new Set([...into.intents, ...from.intents])].sort();
    for (const k of Object.keys(SECTIONS)) for (const x of from[k]) if (!into[k].some((y) => (y.text ?? y) === (x.text ?? x))) into[k].push(x);
    store(into); unlinkSync(file(a)); console.log(`${a} merged into ${b}`);
  },
  dismiss: (a) => fold(a, true), restore: (a) => fold(a, false),
  lanes: (a) => { const m = meta(); m.lanes = a.split('|').map((x) => x.trim()).filter(Boolean); writeJSON(META, m); console.log('lanes: ' + m.lanes.join(' | ')); },
  gathered: (a) => { const m = meta(); m.gathered = { commit: a, on: today() }; writeJSON(META, m); console.log('history read up to ' + a); },
}, 'list | show | put | set | stage | note | merge | dismiss | restore | lanes | gathered (see the head of Stories/ideas.js)');
