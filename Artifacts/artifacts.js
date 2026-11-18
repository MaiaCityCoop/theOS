#!/usr/bin/env bun
// The artifact library's one tool. Every change to Artifacts/items/ is a call of it (the skill: .claude/skills/artifacts).
//
//   bun Artifacts/artifacts.js new <url> [--id <id>]       a draft for a link: type, id, author and thumbnail found where possible
//   bun Artifacts/artifacts.js source <id> <file | ->      keep the verbatim extract (transcript, article…) as source.md, counts its words
//   bun Artifacts/artifacts.js thumb <id> [<image url>]    fetch the thumbnail (the source's own image) to thumb.jpg
//   bun Artifacts/artifacts.js check [<id>]                every artifact.json against schema.json; exits 1 on a problem
//   bun Artifacts/artifacts.js list [--tag t] [--category c] [--type t]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ITEMS, validate, readArtifacts } from './store.js';

const [cmd, ...args] = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i < 0 ? undefined : args[i + 1]; };
const die = (m) => { console.error(m); process.exit(1); };
const dir = (id) => resolve(ITEMS, id), file = (id) => resolve(dir(id), 'artifact.json');
const load = (id) => (existsSync(file(id)) ? JSON.parse(readFileSync(file(id), 'utf8')) : die(`no artifact ${id}`));
const save = (a) => { mkdirSync(dir(a.id), { recursive: true }); writeFileSync(file(a.id), JSON.stringify(a, null, 2) + '\n'); };
const today = () => new Date().toISOString().slice(0, 10);
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60).replace(/-$/, '');
const UA = { 'user-agent': 'Mozilla/5.0 (artifact library)', 'accept-language': 'en-US,en' };

// a link's kind, by its host
const TYPES = [[/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'], [/(^|\.)(vimeo\.com)$/, 'video'], [/(^|\.)(x\.com|twitter\.com)$/, 'x'],
  [/(^|\.)(instagram\.com|tiktok\.com|linkedin\.com|reddit\.com|facebook\.com|threads\.net|bsky\.app)$/, 'social'], [/(^|\.)wikipedia\.org$/, 'wiki'],
  [/(^|\.)(arxiv\.org|doi\.org|nature\.com|sciencedirect\.com|researchgate\.net|ncbi\.nlm\.nih\.gov|ssrn\.com)$/, 'paper'],
  [/(^|\.)(substack\.com|medium\.com|ghost\.io)$/, 'blog'], [/(^|\.)(github\.com|gitlab\.com)$/, 'repo'], [/(^|\.)(spotify\.com|podcasts\.apple\.com|pocketcasts\.com)$/, 'podcast']];
const typeOf = (u) => TYPES.find(([re]) => re.test(u.hostname))?.[1] ?? 'website';
const ytId = (u) => (u.hostname.endsWith('youtu.be') ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.match(/\/(shorts|live|embed)\/([\w-]{11})/)?.[2]);
const meta = (html, p) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)`, 'i'))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, 'i'))?.[1];
const unhtml = (s) => s?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function fetchThumb(id, url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) return false;
  writeFileSync(resolve(dir(id), 'thumb.jpg'), Buffer.from(await r.arrayBuffer()));
  return true;
}

if (cmd === 'new') {
  const raw = args[0] || die('usage: new <url> [--id <id>]');
  const u = new URL(raw), type = typeOf(u);
  const a = { id: '', src: raw, type, title: '', description: '', summary: [], category: 'other', tags: [], author: { name: '' }, origin: 'human', addedBy: 'Samuel', added: today(), source: { kind: type === 'youtube' || type === 'video' || type === 'podcast' ? 'transcript' : type === 'paper' ? 'paper' : type === 'x' || type === 'social' ? 'post' : 'article' } };
  let found = '';
  if (type === 'youtube') {
    const v = ytId(u) || die('no video id in the link');
    a.src = `https://www.youtube.com/watch?v=${v}`;
    const o = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(a.src)}&format=json`).then((r) => r.json()).catch(() => ({}));
    const page = await fetch(a.src + '&hl=en', { headers: UA }).then((r) => r.text()).catch(() => '');
    found = o.title || '';
    a.author = { name: o.author_name || '', ...(o.author_url ? { url: o.author_url } : {}), kind: 'organization' };
    const d = page.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/)?.[1], s = +(page.match(/"lengthSeconds":"(\d+)"/)?.[1] || 0);
    if (d) a.published = d;
    if (s) a.length = `${Math.round(s / 60)} min`;
    a.thumb = { url: `https://i.ytimg.com/vi/${v}/maxresdefault.jpg` };
  } else {
    const html = await fetch(raw, { headers: UA }).then((r) => r.text()).catch(() => '');
    found = unhtml(meta(html, 'og:title') || html.match(/<title>([^<]*)/i)?.[1] || '');
    const img = meta(html, 'og:image') || meta(html, 'twitter:image'), by = meta(html, 'author') || meta(html, 'og:site_name');
    if (img) a.thumb = { url: new URL(unhtml(img), raw).href };
    if (by) a.author = { name: unhtml(by) };
    const d = meta(html, 'article:published_time')?.slice(0, 10);
    if (d) a.published = d;
  }
  a.id = opt('id') || slug(found || u.hostname + u.pathname) || die('give an --id');
  if (existsSync(file(a.id))) die(`${a.id} exists already`);
  if (found) a.title = found.slice(0, 80);
  save(a);
  if (a.thumb && (await fetchThumb(a.id, a.thumb.url).catch(() => false))) a.thumb.file = 'thumb.jpg';
  else if (type === 'youtube' && a.thumb) { a.thumb.url = a.thumb.url.replace('maxresdefault', 'hqdefault'); if (await fetchThumb(a.id, a.thumb.url).catch(() => false)) a.thumb.file = 'thumb.jpg'; }
  save(a);
  console.log(`Artifacts/items/${a.id}/artifact.json: a draft (${type}${found ? `, "${found}"` : ''}${a.thumb?.file ? ', thumbnail kept' : ''}).`);
  console.log('Now: title in our words, description, summary, category, tags; the extract with `source`; then `check`.');
} else if (cmd === 'source') {
  const [id, from] = args, a = load(id);
  const text = from === '-' || !from ? readFileSync(0, 'utf8') : readFileSync(from, 'utf8');
  writeFileSync(resolve(dir(id), 'source.md'), text.trim() + '\n');
  a.source = { ...a.source, file: 'source.md', words: (text.match(/\S+/g) || []).length, ...(opt('how') ? { how: opt('how') } : {}) };
  save(a);
  console.log(`Artifacts/items/${id}/source.md: ${a.source.words} words (on this machine only).`);
} else if (cmd === 'thumb') {
  const [id, url] = args, a = load(id), src = url || a.thumb?.url || die('no image url');
  if (!(await fetchThumb(id, src))) die(`could not fetch ${src}`);
  a.thumb = { url: src, file: 'thumb.jpg' };
  save(a);
  console.log(`Artifacts/items/${id}/thumb.jpg kept.`);
} else if (cmd === 'check') {
  const all = args[0] ? [load(args[0])] : readArtifacts();
  let bad = 0;
  for (const a of all) {
    const { has, ...json } = a, p = validate(json);
    if (json.id && !existsSync(file(json.id))) p.push(`id: ${json.id} is not its folder's name`);
    if (json.source?.file && !existsSync(resolve(dir(json.id), json.source.file)) && args[0]) p.push('source.file: named, but not on this machine (fine on another one)');
    if (p.length) { bad++; console.log(`✗ ${json.id}\n  ${p.join('\n  ')}`); } else console.log(`✓ ${json.id}`);
  }
  console.log(`${all.length} artifact${all.length === 1 ? '' : 's'}, ${bad} with problems.`);
  process.exit(bad ? 1 : 0);
} else if (cmd === 'list') {
  const t = opt('tag'), c = opt('category'), y = opt('type');
  for (const a of readArtifacts().filter((a) => (!t || a.tags.includes(t)) && (!c || a.category === c) && (!y || a.type === y)))
    console.log(`${a.added}  ${a.type.padEnd(8)} ${a.category.padEnd(12)} ${a.id}  · ${a.title}  [${a.tags.join(' ')}]`);
} else die(readFileSync(import.meta.filename, 'utf8').split('\n').slice(1, 9).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
