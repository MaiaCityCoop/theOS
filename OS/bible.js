// The bible (../Bible): the serial's story bible, a story-skills project read exactly as it stands on disk.
// Nothing is copied and nothing is cached: the markdown files are the one source, as everywhere else in TheOS.
// Changed only by the story CLI (`bun ~/.claude/plugins/.../bin/story.js`), never by this reader and never by the page.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const unq = (v) => v.replace(/^"([\s\S]*)"$/, '$1').replace(/^'([\s\S]*)'$/, '$1');

// the frontmatter, in the subset the bible uses: scalars, string lists, and lists of maps (a character's relationships)
const front = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  let list = null, item = null;
  for (const raw of m[1].split('\n')) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const top = raw.match(/^([\w-]+):\s*(.*)$/);
    if (top) {
      const v = top[2].trim();
      if (v === '' ) { out[top[1]] = list = []; item = null; }
      else if (v === '[]') { out[top[1]] = []; list = item = null; }
      else { out[top[1]] = unq(v); list = item = null; }
      continue;
    }
    const li = raw.match(/^\s+-\s+(.*)$/);
    if (li && list) {
      const kv = li[1].match(/^([\w-]+):\s*(.*)$/);
      if (kv) list.push((item = { [kv[1]]: unq(kv[2].trim()) }));
      else { list.push(unq(li[1].trim())); item = null; }
      continue;
    }
    const sub = raw.match(/^\s+([\w-]+):\s*(.*)$/);
    if (sub && item) item[sub[1]] = unq(sub[2].trim());
  }
  return out;
};

const strip = (text) => text.replace(/^---\n[\s\S]*?\n---\n?/, '');
const read = (f) => readFileSync(f, 'utf8');
const docs = (dir, pick = (f) => f.endsWith('.md') && f !== '_index.md') => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(pick).sort().map((f) => {
    const text = read(resolve(dir, f));
    return { id: f.slice(0, -3), front: front(text), body: strip(text) };
  });
};

export function readBible(root) {
  const B = resolve(root, 'Bible');
  if (!existsSync(resolve(B, 'story.md'))) return null;
  const storyText = read(resolve(B, 'story.md'));

  // an episode is a day: its outline is kept above the prose, so the two are shown apart
  const chapters = docs(resolve(B, 'chapters')).map((c) => {
    const i = c.body.indexOf('## Chapter Text');
    return { ...c, outline: i < 0 ? '' : c.body.slice(0, i), text: i < 0 ? c.body : c.body.slice(i + 15).trim() };
  });

  return {
    story: { front: front(storyText), body: strip(storyText) },
    style: existsSync(resolve(B, 'style-sheet.md')) ? { front: front(read(resolve(B, 'style-sheet.md'))), body: strip(read(resolve(B, 'style-sheet.md'))) } : null,
    plot: existsSync(resolve(B, 'plot/_index.md')) ? strip(read(resolve(B, 'plot/_index.md'))) : '',
    world: existsSync(resolve(B, 'worldbuilding/_index.md')) ? strip(read(resolve(B, 'worldbuilding/_index.md'))) : '',
    timeline: existsSync(resolve(B, 'plot/timeline.md')) ? strip(read(resolve(B, 'plot/timeline.md'))) : '',
    characters: docs(resolve(B, 'characters')),
    arcs: docs(resolve(B, 'plot/arcs')),
    systems: docs(resolve(B, 'worldbuilding/systems')),
    locations: docs(resolve(B, 'worldbuilding/locations')),
    terms: docs(resolve(B, 'glossary/terms')),
    chapters,
    scenes: docs(resolve(B, 'scenes')),
    state: existsSync(resolve(B, 'continuity/state.md')) ? front(read(resolve(B, 'continuity/state.md'))) : {},
  };
}
