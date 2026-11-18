// OS: one place over the three. The front page (the city's count and the calendar of its 5423 days;
// first the words, then the day's film, which plays while it is on screen), the intents (what is worked on, and where each stands), their
// stories (each with its film, played at the top of its page), and the game to walk in.
// It only reads the repository and frames the game. Only one framed game runs at a time.
import { marked } from 'marked';

const GAME = import.meta.env.VITE_GAME || '/game';
   // the game, served by this same server under /game (OS/vite.config.js)
const STATES = ['idea', 'define', 'build', 'propose', 'story', 'archived'];
const DAYS = 5423, NOTED = { 1: { title: 'The decision', inGame: 1 } };   // days that have a name and a count but no film yet: day 1, Samuel alone
const DAYS_ = DAYS;   // the days; the humans, 1,346,269 (the 31st Fibonacci number), stand in the page's title
const $ = (id) => document.getElementById(id);
const get = (u) => fetch(u).then((r) => (r.ok ? r : Promise.reject(r.status)));
const body = (md) => marked.parse(md.replace(/^---\n[\s\S]*?\n---\n/, ''));   // without the front matter
const n = (v) => Math.round(v).toLocaleString('en-US'), pad = (d, w = 4) => String(d).padStart(w, '0');
const cit = (v) => `${n(v)} citizen${v === 1 ? '' : 's'}`;   // the count is of citizens
const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
let intents = [], stories = [], scenes = [], me = {}, current = null, gameView = 'walk';   // me: who works here (the dashboard's welcome)
const latest = () => stories.filter((s) => s.film).pop();
// the page's own flags (`?lod=new`, `?flyby`, any the game reads: TheGame/src/core/flags.js), passed on to every frame
// of the game it opens; the dashboard reads none itself
const FLAGS = location.search.slice(1), withFlags = (u) => (FLAGS ? u + (u.includes('?') ? '&' : '?') + FLAGS : u);
const filmOf = (id, scene = !!current?.scene && current.id === id) => withFlags(`${GAME}/timeline.html?${scene ? 'scene' : 'story'}=${id}&embed`);   // a story's film, or a scene's (Stories/scenes/)

// ---- tabs: showing one stops the framed games of the others ----
function tab(name) {
  document.body.classList.toggle('sheet', name === 'intents');   // the intents open as a sheet over the dashboard
  document.body.classList.toggle('studio', name === 'stories' || name === 'compass' || name === 'ladder');   // the stories, their shelf and their editor: dark, TheOS blue
  document.body.classList.toggle('admin', name !== 'home' && name !== 'legal' && name !== 'join');   // inside: the bottom pill; the front page has none
  if (location.hash.slice(1) !== (name === 'home' ? '' : name)) history.replaceState(null, '', name === 'home' ? location.pathname + location.search : '#' + name);   // (its flags kept)
  document.querySelectorAll('main').forEach((m) => m.classList.toggle('on', m.id === name));
  if (name === 'intents') { $('city').classList.add('on'); city(); }   // the dashboard stays under the sheet
  if (name === 'stories') $('stories').classList.toggle('editing', !!current);
  if (name === 'stories' && !current) ideas();   // the ideas as they stand now
  if (name === 'compass') compass();   // the compass
  if (name === 'ladder') ladder();   // the village ladder, from the game sheet as they stand now (both change only by their tools)
  document.body.classList.toggle('play', name === 'game');   // the game takes the whole window
  if (name !== 'home') $('heroframe').removeAttribute('src');
  if (name === 'game') { if (!$('frame').getAttribute('src')) $('frame').src = withFlags(GAME + VIEWS[gameView][1]); } else $('frame').removeAttribute('src');
  const player = document.querySelector('.player iframe');
  if (player) { if (name === 'stories' && current) { if (!player.getAttribute('src')) player.src = filmOf(current.id) + '&ch=edit'; } else player.removeAttribute('src'); }
  scrollTo(0, 0);
  if (name === 'home') { home.sync?.(); home.draw?.(); }
  if (name === 'city') city();   // the front page's film starts when its window is on screen, not before
}
$('homebtn').onclick = () => tab(location.hash === '#intents' ? 'city' : 'intents');   // the star opens the board of intents, as in the old play; again, it closes it
$('back').onclick = () => tab('city');   // home: the dashboard
$('badge').onclick = () => tab('home');
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => tab('city')));
// the pill's button is the shortcut for people who are already in: their dashboard, from which the world is one tile
$('visit').onclick = (e) => { e.preventDefault(); tab('city'); };
if ($('joinsignin')) $('joinsignin').onclick = (e) => { e.preventDefault(); tab('city'); };
if ($('joinplay')) $('joinplay').onclick = (e) => { e.preventDefault(); game('walk'); };
if ($('joinnow')) $('joinnow').onclick = () => { $('signup').scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => $('joinmail').focus(), 500); };

// ---- what a village unlocks as it fills: a count of villagers and the thing it puts in their hands. The pictures are
// placeholders until each asset is built and can be shot in the game ----
const LEVELS = [
  [1, 'Your first tent, on open ground. One settler, one shelter, and the fire in front of it.'],
  [2, 'A second tent beside the first. From here nothing is decided alone.'],
  [3, 'A third tent. Three settlers is a camp, and a camp can split the work.'],
  [5, 'The first glamping dome: a shell you can stand up in, warm through the night, with the first beds that are not on the ground.'],
  [8, 'A second dome, and the sanitary container: running water, showers and a proper washroom for the camp.'],
  [13, 'Another dome, and the kitchen container. The camp stops eating out of tins and starts cooking together.'],
  [21, 'More domes, and the workshop and store container. Tools, spares and somewhere dry to keep them, so the village can repair its own things.'],
  [34, 'More domes, and the technical container: power, solar, batteries and the servers. From here the village runs on what it makes.'],
];
if ($('levels')) $('levels').innerHTML = LEVELS.map(([n_, text]) => `<li>
    <div class="ph"><span>Picture to come</span></div>
    <div class="who"><b>${n(n_)}</b><span>${n_ === 1 ? 'villager' : 'villagers'}</span></div>
    <p>${text}</p>
  </li>`).join('') + `<li class="soon">
    <div class="ph"><span>Coming soon</span></div>
    <div class="who"><b>55+</b><span>villagers</span></div>
    <p>The milestones past the technical container are not set yet. They are decided with the villages that get there.</p>
  </li>`;
if ($('mailform')) $('mailform').onsubmit = (e) => {   // the sign-up itself is play's; until it is wired, the page says so rather than pretending
  e.preventDefault();
  $('joinnote').innerHTML = 'Thank you. Sign-up is not wired up yet, so nothing was sent. <a href="#game" data-do="walk">Walk into the world</a> meanwhile.';
  $('joinnote').querySelector('[data-do=walk]').onclick = (ev) => { ev.preventDefault(); game('walk'); };
};
addEventListener('hashchange', () => { if (location.hash.slice(1).startsWith('legal/')) return; tab(location.hash.slice(1) || 'home'); });
document.querySelector('header.site .logo')?.addEventListener('click', (e) => { e.preventDefault(); tab('home'); });
if ($('homelink')) $('homelink').onclick = (e) => { e.preventDefault(); tab('home'); };

// ---- the channels, brought over from maia.city: the same four, in the header as marks and at the foot of the front
// page as cards. One list, drawn in both places ----
const SOCIALS = [
  { id: 'youtube', label: 'YouTube', handle: '@MaiaCityCoop', href: 'https://www.youtube.com/@MaiaCityCoop', d: 'M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .6 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-4.8 31 31 0 0 0-.4-4.8ZM9.7 15V9l5.8 3-5.8 3Z' },
  { id: 'x', label: 'X', handle: '@MaiaCityCoop', href: 'https://x.com/MaiaCityCoop', d: 'M17.8 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.6-5.9 6.6H1.4l7.7-8.8L1 2.5h6.8l4.7 6 5.3-6Zm-1.2 17h1.8L7 4.3H5.1l11.5 15.2Z' },
  { id: 'instagram', label: 'Instagram', handle: '@MaiaCityCoop', href: 'https://instagram.com/MaiaCityCoop', d: 'M12 2.2c3.2 0 3.6 0 4.8.1 3.2.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3c1.2-.1 1.6-.1 4.8-.1ZM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0Zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9Z' },
  { id: 'linkedin', label: 'LinkedIn', handle: '@MaiaCityCoop', href: 'https://www.linkedin.com/company/MaiaCityCoop/', d: 'M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.3V9h3.4v1.6h.1a3.7 3.7 0 0 1 3.4-1.9c3.6 0 4.3 2.4 4.3 5.5v6.3ZM5.3 7.4a2.1 2.1 0 1 1 0-4.1 2.1 2.1 0 0 1 0 4.1Zm1.8 13.1H3.6V9h3.5v11.5ZM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0Z' },
];
const mark = (s, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${s.d}"/></svg>`;
const out = (s) => `href="${s.href}" target="_blank" rel="noopener"`;
if ($('socials')) $('socials').innerHTML = SOCIALS.map((s) => `<a ${out(s)} title="${s.label} · ${s.handle}" aria-label="${s.label}">${mark(s, 18)}</a>`).join('');
if ($('channels')) $('channels').innerHTML = SOCIALS.map((s) => `<a ${out(s)}><i>${mark(s, 22)}</i><span class="who"><b>${s.label}</b><span>${s.handle}</span></span></a>`).join('');
if ($('playnow')) $('playnow').onclick = () => { tab('join'); };   // the button that follows the whole scroll: the way in
if ($('playlink')) $('playlink').onclick = (e) => { e.preventDefault(); game('walk'); };

// ---- the legal pages, ported from maia.city as they stand (OS/src/legal/): each a document of sections and blocks,
// opened from the foot of the front page and read in its own window ----
const LEG = { slug: null };
const legEsc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const block = (b) => (Array.isArray(b.items)
  ? `<ul>${b.items.map((i) => `<li>${legEsc(i)}</li>`).join('')}</ul>`
  : `<p>${b.lead ? `<b>${legEsc(b.lead)}</b>` : ''}${b.lines.map(legEsc).join('<br>')}</p>`);
async function legal(path) {
  const { LEGAL_DOCUMENTS, LEGAL_LINKS } = await import('./legal/index.js');
  if ($('legalnav') && !$('legalnav').children.length)
    $('legalnav').innerHTML = LEGAL_LINKS.map((l) => `<a href="#legal${l.href.replace(/\/$/, '')}">${legEsc(l.label)}</a>`).join('');
  const doc = LEGAL_DOCUMENTS.find((d) => d.path.replace(/\/$/, '') === '/' + path) || LEGAL_DOCUMENTS[0];
  LEG.slug = path;
  $('legaldoc').innerHTML = `<button class="back" data-do="home">← Maia City</button><h1>${legEsc(doc.title)}</h1>` +
    doc.sections.map((s) => (s.title ? `<h${s.level || 2}>${legEsc(s.title)}</h${s.level || 2}>` : '') + s.blocks.map(block).join('')).join('');
  $('legaldoc').querySelector('[data-do=home]').onclick = () => tab('home');
}
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h.startsWith('legal/')) { legal(h.slice(6)); tab('legal'); } });
legal('');   // the links at the foot are drawn once, whatever is open

// ---- the game, framed: to walk, or to look through the lenses ----
const VIEWS = { walk: ['Walk the world', '/?in=os'], lenses: ['Lenses', '/lenses.html?in=os'], stress: ['Magic Wonder', '/?stress&in=os'], library: ['Library', '/library.html?in=os'] };
function game(view, show = true) {
  gameView = view;
  $('gamebar').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button class="${k === view ? 'on' : ''}" data-v="${k}">${v[0]}</button>`).join('') + `<span class="label">${GAME.replace('http://', '')}</span>`;
  $('gamebar').querySelectorAll('button').forEach((b) => (b.onclick = () => game(b.dataset.v)));
  $('frame').removeAttribute('src');
  if (show) tab('game');
}

// ---- the game's frame on a phone: the safe area it is not given (an iframe has none; brand.css --safe-*), told when it
// asks, loads or the window turns ----
const safeProbe = document.createElement('i');
safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l)';
document.body.append(safeProbe);
function tellSafe() {
  const w = $('frame').contentWindow; if (!w || !$('frame').getAttribute('src')) return;
  const c = getComputedStyle(safeProbe), px = (v) => Math.round(parseFloat(v) || 0);
  w.postMessage({ maia: 1, cmd: 'safe', t: px(c.paddingTop), r: px(c.paddingRight), b: px(c.paddingBottom), l: px(c.paddingLeft) }, '*');
}
$('frame').addEventListener('load', tellSafe);
addEventListener('resize', tellSafe);
addEventListener('message', (ev) => {
  const m = ev.data; if (!m?.maia || ev.source !== $('frame').contentWindow) return;
  if (m.cmd === 'safe?') tellSafe();
});

// ---- intents: a board by state ----
function board(open, fresh) {
  // the list is read again each time the board opens, so a new intent or a changed state shows without a reload
  if (!fresh) get('/api/intents').then((r) => r.json()).then((list) => { if (JSON.stringify(list) !== JSON.stringify(intents)) { intents = list; board(open, true); } }).catch(() => {});
  // a column with no intents is folded, one with intents open; what you fold or open yourself stays so
  const mine = board.mine || (board.mine = new Map());
  const folded = new Set(STATES.filter((st) => (mine.has(st) ? mine.get(st) : !intents.some((i) => i.state === st))));
  $('board').innerHTML = STATES.map((st) => {
    const mine = intents.filter((i) => i.state === st);
    return `<div class="col${folded.has(st) ? ' fold' : ''}" data-st="${st}"><h2>${st}<i>${mine.length}</i><u>${folded.has(st) ? '›' : '‹'}</u></h2>` +
      (mine.length ? mine.map((i) => `<div class="card ${i.outcome || ''}" data-file="${i.file}"><b>INTENT ${i.id}</b>${i.title}${i.outcome ? `<br><i>${i.outcome}</i>` : ''}<div class="meta"><em>S</em>Samuel${i.opened ? ` · ${i.opened}` : ''}</div></div>`).join('') : '<p class="none">None.</p>') + '</div>';
  }).join('');
  $('board').querySelectorAll('.col h2').forEach((h) => (h.onclick = () => { const st = h.parentNode.dataset.st; mine.set(st, !folded.has(st)); board(undefined, true); }));
  $('board').querySelectorAll('.card').forEach((c) => (c.onclick = () => intent(intents.find((i) => i.file === c.dataset.file))));
  const pick = intents.find((i) => i.slug === open);
  if (pick) intent(pick); else { $('intentdoc').classList.remove('on'); $('intents').classList.remove('reading'); }   // the board first; a card opens its intent beside it
}
async function intent(i) {
  document.querySelectorAll('#board .card').forEach((c) => c.classList.toggle('on', c.dataset.file === i.file));
  const md = await get(`/api/intents/${i.file}`).then((r) => r.text()), s = stories.find((x) => x.id === i.slug);
  const d = $('intentdoc'); d.classList.add('on');
  d.innerHTML = `<div class="bar"><button class="btn small quiet shut" data-do="shut">← Board</button>${s ? `<button class="btn small play" data-do="story">Its story</button>` : ''}<span class="chip live" style="margin-left:auto">${i.state}${i.outcome ? ' · ' + i.outcome : ''}</span></div>` + body(md);
  $('intents').classList.add('reading');
  d.querySelector('[data-do=shut]').onclick = () => { d.classList.remove('on'); $('intents').classList.remove('reading'); document.querySelectorAll('#board .card').forEach((c) => c.classList.remove('on')); };
  d.querySelector('[data-do=story]')?.addEventListener('click', () => story(s));
  d.scrollTop = 0;
}

// ---- stories: the film at the top, the telling under it ----
// ---- stories: first a shelf of them, each with its picture; one opened is the editor, the whole window ----
function shelf() {
  $('shelf').innerHTML = stories.filter((s) => s.film || s.arc).slice().reverse().map((e) => `<button class="cd told" data-id="${e.id}">${pic(e)}<span class="cn">Day ${n(e.day || 1)}${e.secs ? ' · ' + mm(e.secs) : e.minutes ? ' · arc, ' + e.minutes + ' min' : ''}</span>${e.inGame != null ? `<span class="cs"><b>${n(e.inGame)}</b> ${e.inGame === 1 ? 'citizen' : 'citizens'}</span>` : ''}<span class="ct">${e.title}${e.intro ? `<small>${e.intro}</small>` : ''}</span></button>`).join('') || '<p class="empty">No stories yet.</p>';
  // the scenes: timelines that stand alone and that stories contain (Stories/scenes/, made by Stories/scenes.js); one opens in the same studio
  $('sceneshelf').innerHTML = scenes.map((e) => `<button class="cd told" data-scene="${e.id}">${e.cover ? `<img class="pic" src="/api/objects/${e.cover}" alt="">` : ''}<span class="cn">Scene · ${mm(Math.round(e.duration))}</span><span class="cs"><b>${e.shots}</b> shots</span><span class="ct">${e.title}</span></button>`).join('') || '<p class="empty">No scenes yet.</p>';
  $('shelf').querySelectorAll('.cd').forEach((c) => (c.onclick = () => story(stories.find((s) => s.id === c.dataset.id))));
  $('sceneshelf').querySelectorAll('.cd').forEach((c) => (c.onclick = () => { const e = scenes.find((x) => x.id === c.dataset.scene); story({ id: e.id, scene: true, film: true, title: e.title, secs: Math.round(e.duration), shots: 0 }); }));
}
// ---- the story ideas, under the shelf: what a story could be told about, gathered backwards from the intents' history and
// clustered in lanes (Stories/ideas/*.md). The page only shows them: an idea is made, moved, merged or put aside by the
// ideas' tool alone (Stories/ideas.js), so this draws again whenever the stories are opened. One opens in the right half ----
let ideaOpen = null;
async function ideas() {
  const data = await get('/api/ideas').then((r) => r.json()).catch(() => null), box = $('ideas'); if (!data || !box) return;
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const live = data.ideas.filter((i) => !i.dismissed), off = data.ideas.filter((i) => i.dismissed);
  $('ideasnote').innerHTML = `<b>${n(live.length)}</b> to tell, from ${n(new Set(data.ideas.flatMap((i) => i.intents)).size)} intents${data.gathered ? ` · history read up to <b>${esc(data.gathered.commit)}</b>` : ''}`;
  const chips = (i) => i.intents.map((x) => `<i>${x}</i>`).join('') + `<em class="${i.stage}">${i.stage}</em>`;
  const card = (i) => `<button class="idea${ideaOpen === i.id ? ' on' : ''}" data-id="${i.id}"><b>${esc(i.title)}</b><span>${esc(i.hook)}</span><span class="row">${chips(i)}</span></button>`;
  const rows = (list, f) => list.map(f).join('') || '<p class="none">Nothing gathered yet.</p>';
  // the one opened, in the right half: its points (what a viewer would be told), Samuel's own words, what the world can show
  const doc = (i) => `<aside class="ideadoc"><header><b>${esc(i.title)}</b>${chips(i)}<button data-do="shut" aria-label="Close">×</button></header><p class="hook none">${esc(i.hook)}</p>
    <h4>What happened</h4>${rows(i.happened, (x) => `<p><small>${esc(x.intent || '')}</small><span>${esc(x.text)}</span></p>`)}
    <h4>Samuel's own words</h4><div class="said">${rows(i.words, (x) => `<p><small>${esc(x.intent || '')}</small><span>“${esc(x.text)}”</span></p>`)}</div>
    <h4>What the world can show</h4><div class="show">${rows(i.shots, (x) => `<p><span>${esc(x)}</span></p>`)}</div></aside>`;
  const lane = (name, list, cls = '') => (list.length ? `<section class="lane ${cls}"><h3>${esc(name)}<small>${list.length} ${list.length === 1 ? 'idea' : 'ideas'}</small></h3><div class="ideas">${list.map(card).join('')}</div></section>` : '');
  const open = data.ideas.find((i) => i.id === ideaOpen);
  box.classList.toggle('open', !!open);
  box.innerHTML = (`<div class="lanes">${data.lanes.map((l) => lane(l, live.filter((i) => i.lane === l))).join('') + lane('Not for stories', off, 'off')}</div>` + (open ? doc(open) : '')) || '<p class="empty">No ideas gathered yet.</p>';
  box.querySelectorAll('.idea').forEach((c) => (c.onclick = () => { ideaOpen = ideaOpen === c.dataset.id ? null : c.dataset.id; ideas(); }));
  box.querySelector('[data-do=shut]')?.addEventListener('click', () => { ideaOpen = null; ideas(); });
}
// ---- the compass (../Compass): its own page. Top to bottom: the vision (why), the mission (what we unite behind), the
// story (how it is told), its people (who), its arcs (in what order) and its world (where); every entry opens in a
// drawer. The page only shows it: the compass is changed by the story CLI alone, so it is read again whenever it opens ----
const esc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const gist = (md) => { const p = md.split('\n').find((l) => l.trim() && !/^(#|>|\||-\s|\*\s|\d+\.\s|---|\*\*Open)/.test(l.trim())) || ''; const t = p.replace(/\*\*|\*|\[|\]\([^)]*\)|`/g, '').trim(); return t.length > 110 ? t.slice(0, 109).replace(/\s\S*$/, '') + '…' : t; };
const TRACKS = ['the-first-world', 'a-night-in-the-future', 'the-thousand', 'the-ground'];   // the four tracks, in the order they open
async function compass() {
  const box = $('cx'); if (!box) return;
  const b = await get('/api/compass').then((r) => r.json()).catch(() => null);
  if (!b) { box.innerHTML = '<p class="lede">No compass yet.</p>'; return; }
  const f = b.story.front, md = b.story.body;
  const quote = (h) => (md.match(new RegExp('## ' + h + '\\n[\\s\\S]*?\\n((?:>.*\\n?)+)')) || [])[1]?.replace(/^> ?/gm, '').trim() || '';
  const after = (h) => (md.match(new RegExp('\\*\\*' + h + '\\*\\*\\s*([^\\n]+)')) || [])[1] || '';
  const vision = quote('The core message'), mission = quote('The mission'), joint = after('How the two meet\\.');
  const stakes = [...md.matchAll(/^- \*\*(External|Relational|Internal)\.?\*\*\s*([^\n]*)/gm)].map((m) => ({ k: m[1], t: m[2] }));
  const plain = (t) => esc(String(t).replace(/\*\*|\*|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
  const first = (t) => plain((t.split('\n').find((l) => l.trim()) || '').replace(/^#+\s*/, ''));

  const all = {}; const reg = (kind, x) => (all[kind + '/' + x.id] = { ...x, kind });
  for (const [k, list] of [['character', b.characters], ['arc', b.arcs], ['system', b.systems], ['place', b.locations], ['term', b.terms], ['episode', b.chapters]]) list.forEach((x) => reg(k, x));
  reg('index', { id: 'compass', front: { title: 'The whole compass' }, body: md });
  reg('index', { id: 'plot', front: { title: 'The plot' }, body: b.plot });
  reg('index', { id: 'world', front: { title: 'The world' }, body: b.world });
  reg('index', { id: 'timeline', front: { title: 'The timeline' }, body: b.timeline });
  const name = (x) => x.front.name || x.front.term || x.front.title || x.id;
  const card = (k, x, label, cls = '') => `<button class="cxc ${cls}" data-k="${k}/${x.id}"><small>${esc(label)}</small><b>${esc(name(x))}</b><span>${esc(gist(x.body))}</span></button>`;

  const game = b.systems.find((x) => x.id === 'the-game');
  const sec = (body, h) => (body.match(new RegExp('#+ ' + h + '\\n+([\\s\\S]*?)(?=\\n#+ |$)')) || [])[1]?.trim() || '';
  const people = [...b.characters].sort((a, c) => (a.id === 'the-citizen' ? -1 : c.id === 'the-citizen' ? 1 : 0));
  const tracks = TRACKS.map((id) => b.arcs.find((a) => a.id === id)).filter(Boolean), themes = b.arcs.filter((a) => !TRACKS.includes(a.id));
  const n_ = (v, one, many) => `${v} ${v === 1 ? one : many}`;

  box.innerHTML = `
    <div class="top"><button class="btn" data-go="stories">← Stories</button><span>${esc(f.title || 'Maia City')} · ${n_(b.chapters.length, 'episode', 'episodes')} of ${n(DAYS)} written</span></div>
    <h1>The Compass</h1>
    <p class="lede">Where every day of the story points. Why we do it, what we unite behind, how it is told, who it is about and where it happens, top to bottom.</p>
    <ol class="map">
      <a href="#cx-vision"><i>1</i><em>Why</em><b>The vision</b><span>The power we carry when we unite behind one vision.</span></a>
      <a href="#cx-mission"><i>2</i><em>What</em><b>The mission</b><span>The one vision a million of us unite behind: the race.</span></a>
      <a href="#cx-story"><i>3</i><em>How</em><b>The story</b><span>One day a story, ${n(DAYS)} days. You are the hero.</span></a>
      <a href="#cx-people"><i>4</i><em>Who</em><b>The people</b><span>${n_(b.characters.length, 'character', 'characters')}, and ${n_(b.arcs.length, 'arc', 'arcs')} they walk.</span></a>
      <a href="#cx-world"><i>5</i><em>Where</em><b>The world</b><span>${n_(b.locations.length, 'place', 'places')}, ${n_(b.systems.length, 'system', 'systems')}, ${n_(b.terms.length, 'word', 'words')}.</span></a>
      <a href="#cx-game"><i>6</i><em>Play</em><b>The game</b><span>Survive, own, found. The reference sheet.</span></a>
    </ol>

    <section id="cx-vision"><span class="k"><b>1 · Why</b>The vision · read in the first person</span><div class="vision">${marked.parse(vision)}</div></section>

    <section id="cx-mission"><span class="k"><b>2 · What</b>The mission</span><div class="mission">${marked.parse(mission)}</div>${joint ? `<p class="joint">${plain(joint)}</p>` : ''}</section>

    <section id="cx-story"><span class="k"><b>3 · How</b>The story</span>
      <p class="premise">${esc(f.premise || '')}</p>
      <div class="grid">
        ${f['counter-premise'] ? `<div class="cxc anti"><small>What it out-builds</small><span>${esc(f['counter-premise'])}</span></div>` : ''}
        ${stakes.map((x) => `<div class="cxc"><small>${esc(x.k)} stake</small><span>${plain(x.t)}</span></div>`).join('')}
      </div>
      <p class="sub">Every day</p>
      <div class="grid">
        <div class="cxc"><small>One story a day</small><span>${n(DAYS)} days from ${esc(f['release-start'] || '')}. Each poses one question, gives one reward, lands one realization and ends on a cliffhanger.</span></div>
        <div class="cxc"><small>The voice</small><span>Second person, present tense. Celebrate, never warn. Every claim carries its receipt. Nobody's words are written for them.</span></div>
        <button class="cxc" data-k="index/compass"><small>Read it all</small><b>The whole compass</b><span>Synopsis, voice, the city, the four tracks, how a day is shot.</span></button>
      </div>
    </section>

    <section id="cx-people"><span class="k"><b>4 · Who</b>The people, and the arcs they walk</span>
      <div class="grid">${people.map((x) => card('character', x, x.id === 'the-citizen' ? 'The hero · you' : x.front.role || 'Character', x.id === 'the-citizen' ? 'you' : '')).join('')}</div>
      <p class="sub">The four tracks, in the order they open</p>
      <ol class="path">${tracks.map((x) => `<li>${card('arc', x, x.front.status || '')}</li>`).join('')}</ol>
      ${themes.length ? `<p class="sub">Running through all of it</p><div class="grid">${themes.map((x) => card('arc', x, x.front.type || 'Thematic')).join('')}</div>` : ''}
      <p class="sub">Read further</p>
      <div class="chips"><button data-k="index/plot">The plot</button><button data-k="index/timeline">The timeline</button>${b.chapters.map((x) => `<button data-k="episode/${x.id}">${esc(name(x))}</button>`).join('')}</div>
    </section>

    <section id="cx-world"><span class="k"><b>5 · Where</b>The world</span>
      <p class="sub" style="margin-top:0">Places</p>
      <div class="grid">${b.locations.map((x) => card('place', x, x.front.type || 'Place')).join('')}</div>
      <p class="sub">How it works</p>
      <div class="grid">${b.systems.filter((x) => x.id !== 'the-game').map((x) => card('system', x, x.front.type || 'System')).join('')}</div>
      <p class="sub">Its words</p>
      <div class="chips">${b.terms.map((x) => `<button data-k="term/${x.id}">${esc(name(x))}</button>`).join('')}<button data-k="index/world">The world, all of it</button></div>
    </section>
    ${game ? `<section id="cx-game"><span class="k"><b>6 · Play</b>The game · reference sheet and single source of truth</span>
      <p class="premise">${plain(sec(game.body, 'Overview').split('\n\n')[1] || '')}</p>
      <div class="sheet md">
        <h3>The three levels of coops</h3>${marked.parse(sec(game.body, 'The three levels of coops'))}
        <h3>The money</h3>${marked.parse(sec(game.body, 'The money'))}
        <h3>The essential fixed tree</h3>${marked.parse(sec(game.body, 'The essential fixed tree \\(MVP\\)'))}
      </div>
      <div class="chips" style="margin-top:14px"><button class="go" data-go="ladder">The village ladder →</button><button data-k="system/the-game">Read the whole reference sheet</button></div>
    </section>` : ''}`;

  const doc = $('cxdoc'), shade = $('cxshade');
  const shut = () => { doc.classList.remove('on'); shade.classList.remove('on'); };
  const open = (k) => {
    const x = all[k]; if (!x) return;
    doc.innerHTML = `<header><div><small>${esc(x.kind === 'index' ? 'The compass' : x.front.role || x.front.type || x.front.category || x.kind)}</small><b>${esc(name(x))}</b></div><button aria-label="Close">×</button></header>` +
      `<div class="md">${marked.parse(x.kind === 'episode' ? (x.text || '') + '\n\n' + (x.outline || '') : x.body || '')}</div>`;
    doc.querySelector('header button').onclick = shut; doc.scrollTop = 0;
    doc.classList.add('on'); shade.classList.add('on');
  };
  shade.onclick = shut;
  box.querySelectorAll('[data-k]').forEach((c) => (c.onclick = () => open(c.dataset.k)));
  box.querySelectorAll('.map a').forEach((a) => (a.onclick = (e) => { e.preventDefault(); box.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' }); }));
  box.querySelector('[data-go=stories]').onclick = () => tab('stories');
  box.querySelector('[data-go=ladder]')?.addEventListener('click', () => tab('ladder'));
}

// ---- the village ladder: the game sheet's ladder (Compass/worldbuilding/systems/the-game.md, "The village ladder")
// on a page of its own. Read from the sheet as it stands; the page only shows it ----
const rows = (md) => md.split('\n').filter((l) => l.trim().startsWith('|') && !/^\|\s*-/.test(l.trim().replace(/\s/g, '').replace(/:/g, '')) && !/^\|[\s\-:|]+\|$/.test(l.trim()))
  .map((l) => l.trim().slice(1, -1).split('|').map((c) => c.trim()));
const PHASE = { 1: 'food', 2: 'energy', 3: 'compute', 4: 'factories' };
const euro = (t) => { const m = String(t).match(/([\d.]+)\s*([kM])/); return m ? +m[1] * (m[2] === 'M' ? 1e6 : 1e3) : 0; };
async function ladder() {
  const box = $('lx'); if (!box) return;
  const b = await get('/api/compass').then((r) => r.json()).catch(() => null);
  const game = b?.systems.find((x) => x.id === 'the-game');
  const part = game ? (game.body.split('### The village ladder')[1] || '').split('\n### ')[0] : '';
  if (!part) { box.innerHTML = '<p class="lede">No ladder in the game sheet yet.</p>'; return; }
  const [intro, ...rest] = part.trim().split('\n\n');
  const tables = part.split(/\n\n(?=\|)/).slice(1).map((t) => rows(t.split('\n\n')[0]));
  const phases = (tables[0] || []).slice(1), steps = (tables[1] || []).slice(1);
  const notes = part.split('\n').filter((l) => l.startsWith('- ')).join('\n');
  const paras = rest.filter((x) => !x.startsWith('|') && !x.startsWith('- ')).slice(0, 2);
  const top = Math.max(...steps.map((r) => euro(r[6])), 1);
  const pct = (t) => { const v = parseInt(t, 10); return isNaN(v) ? 0 : v; };
  const bar = (t, cls) => `<span class="lbar ${cls}"><i style="width:${pct(t)}%"></i></span><span class="pc">${esc(t)}</span>`;
  const ph = (t) => PHASE[String(t).trim()[0]] || '';
  box.innerHTML = `
    <div class="top"><button class="btn" data-go="compass">← The Compass</button><span>From the game sheet · ${steps.length} levels</span></div>
    <h1>The village ladder</h1>
    <div class="lede md">${marked.parse(intro)}</div>
    <div class="phases">${phases.map((r, i) => `<div class="ph ${PHASE[i + 1]}"><small>${esc(r[1])} villagers</small><b>${esc(r[0])}</b><span>${esc(r[2])}</span><em>${esc(r[3])}</em><u>${esc(r[4])}</u></div>`).join('')}</div>
    <div class="tablewrap"><table class="lad">
      <thead><tr><th>Villagers</th><th>Added at this level</th><th>€ this level</th><th>Settlers bring</th><th>Investment round</th><th>€ in total</th><th>Funded by</th><th>Food import</th><th>Energy import</th></tr></thead>
      <tbody>${steps.map((r) => `<tr class="${ph(r[1])}">
        <td class="n"><b>${esc(r[0])}</b><small>${esc(r[1])}</small></td>
        <td class="add">${marked.parseInline(r[2])}</td>
        <td class="eur">${esc(r[3])}</td>
        <td class="eur bring">${esc(r[4])}</td>
        <td class="eur round">${esc(r[5])}</td>
        <td class="eur"><span class="lbar sum"><i style="width:${Math.max(2, Math.sqrt(euro(r[6]) / top) * 100)}%"></i></span><span class="pc">${esc(r[6])}</span></td>
        <td>${esc(r[7])}</td>
        <td>${bar(r[8], 'food')}</td>
        <td>${bar(r[9], 'energy')}</td></tr>`).join('')}</tbody>
    </table></div>
    ${paras.map((p) => `<div class="md note">${marked.parse(p)}</div>`).join('')}
    <div class="md notes">${marked.parse(notes)}</div>`;
  box.querySelector('[data-go=compass]').onclick = () => tab('compass');
}

async function story(s, show = true) {
  current = s;
  const md = s.scene ? '' : await get(`/api/stories/${s.id}/story.md`).then((r) => r.text()).catch(() => ''), d = $('storyedit');
  d.innerHTML = `<header class="studiohead"><button class="btn small quiet" data-do="shelf">← Stories</button><h1>${s.title}</h1><span class="chip">${s.scene ? 'Scene · ' + mm(s.secs) : `Day ${n(s.day || 1)}${s.inGame != null ? ' · ' + (s.inGame === 1 ? '1 citizen' : n(s.inGame) + ' citizens') : ''}`}</span>${s.film ? '<button class="btn small quiet" data-do="retake" title="Take the preview picture again from the live scene, at the camera the story names">Retake picture</button>' : ''}<button class="btn small quiet" data-do="intent">Its intent</button></header>` +
    (s.film ? `<div class="editpage"><div class="pstage"><div class="player"><iframe title="${s.title}" allow="fullscreen; autoplay"></iframe></div></div>${EDIT}</div>` : '') + `<div class="stagedoc"></div><nav class="pages"></nav>`;
  if (s.film) editor(d.querySelector('.edit'), d.querySelector('.player iframe'), s);
  if (s.film) { const ps = d.querySelector('.pstage'), pl = d.querySelector('.player');   // the film's frame in whole pixels, set only when the window's size changes
    const fit = () => { const w = ps.clientWidth, h = ps.clientHeight; if (!w || !h) return; const W = Math.floor(Math.min(w, h * 16 / 9)); pl.style.width = W + 'px'; pl.style.height = Math.floor(W * 9 / 16) + 'px'; };
    new ResizeObserver(fit).observe(ps); fit(); }
  const arc = s.arc ? await get(`/api/stories/${s.id}/arc.json`).then((r) => r.json()).catch(() => null) : null;
  const hook = s.hook ? await get(`/api/stories/${s.id}/hook.json`).then((r) => r.json()).catch(() => null) : null;
  pages(d, md, s.film, arc, hook);
  d.querySelector('[data-do=intent]').onclick = () => { tab('intents'); board(s.id); };
  d.querySelector('[data-do=shelf]').onclick = () => { current = null; tab('stories'); };
  const rt = d.querySelector('[data-do=retake]'); if (rt) rt.onclick = () => { rt.textContent = 'Taking…'; rt.disabled = true; d.querySelector('.player iframe')?.contentWindow?.postMessage({ maia: 1, cmd: 'preview' }, '*'); };
  if (show) tab('stories');
}

// ---- a story's work, as the pages of an editing suite: one page at a time, chosen from a bar at the bottom left.
// Edit is the film and its timeline; the others are the parts of story.md (its ## sections), hook first ----
const STEP = [['The hook', 'Hook'], ['The story', 'Story'], ['The film', 'Script'], ['EDIT', 'Edit']];
const HIDE = ['Open', 'Receipts', 'The series'];   // sections of story.md the studio does not show as pages
// ---- a story's arc (Stories/<story>/arc.json, made and changed only by Stories/arc.js): the viewer's journey in one
// look. A card a section in one row (the first: the state the viewer arrives in), each with its emotion, what moves the
// viewer and the state it leaves them in; over them the journey as one line, up where it lifts, down where it weighs.
// Shown only ----
// ---- a story's hook, the studio's first page (Stories/<story>/hook.json, made and changed only by Stories/hook.js): its
// title and its intro, the first seconds. Under them, read from the arc, the state the viewer arrives in and the one the
// relief leaves them in. Shown only ----
function hookView(h, arc) {
  const esc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]), W = h.title.trim().split(/\s+/).length;
  const open = arc?.sections.find((s) => s.kind === 'hook'), rel = arc?.sections.find((s) => s.kind === 'relief'), total = arc ? arc.sections.reduce((t, s) => t + s.minutes, 0) : 0;
  return `<div class="hookpage"><span class="lab">Step 1 · Title <em>${W} words</em></span><h2>${esc(h.title)}</h2>
    <span class="lab">Intro <em>the first ${h.seconds} seconds</em></span><p class="intro">${esc(h.intro)}</p>
    ${open && rel ? `<span class="lab">The viewer's journey <em>${Math.round(total)} minutes</em></span><div class="loop"><p style="--c:#6f9bd8"><small>Arrives</small>${esc(arc.from)}</p><i></i><p style="--c:#f2b544"><small>After the relief</small>${esc(rel.to)}</p></div>` : ''}</div>`;
}
const KIND = { hook: 'Hook', trailer: 'Trailer', scene: 'Scene', relief: 'Relief', outro: 'Outro' };
function arcView(a, hook) {
  const esc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const S = a.sections, n = S.length, total = S.reduce((t, s) => t + s.minutes, 0), clock = (m) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;
  // the journey as one line: a column a section (the first is where the viewer arrives), up where it lifts, down where it weighs
  const W = 100 * (n + 1), H = 120, X = (i) => 100 * i + 50, Y = (v) => H / 2 - v * 5, P = [[X(0), Y(0)], ...S.map((s, i) => [X(i + 1), Y((s.charge === 'up' ? 1 : -1) * s.tension)])];
  const path = P.map(([x, y], i) => (i ? `C${(P[i - 1][0] + x) / 2},${P[i - 1][1]} ${(P[i - 1][0] + x) / 2},${y} ${x},${y}` : `M${x},${y}`)).join(' ');
  let no = 0;
  const card = (s, i) => `<article class="${s.charge}"><header>${String(i + 1).padStart(2, '0')} · ${KIND[s.kind]}${s.kind === 'scene' ? ' ' + ++no : ''}<em>${s.minutes} min</em></header><h3>${esc(s.title)}</h3><b>${esc(s.emotion)} ${s.charge === 'up' ? '▲' : '▼'}</b><p>${esc(s.how)}</p><p class="to">${esc(s.to)}</p></article>`;
  return `<div class="arc"><header class="archead"><h2>${esc(hook?.title ?? '')}</h2><span>Day ${a.day} · ${clock(total)}</span></header>
    <div class="arcgrid" style="--n:${n + 1}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}"/><path d="${path}"/></svg>
    <div class="arcdots">${P.map(([, y], i) => `<i class="${i ? S[i - 1].charge : ''}" style="top:${(y / H) * 100}%"></i>`).join('')}</div>
    <article class="from"><header>The viewer arrives</header><p class="to">${esc(a.from)}</p></article>${S.map(card).join('')}</div></div>`;
}
function pages(root, md, film, arc, hook) {
  const parts = md.replace(/^---\n[\s\S]*?\n---\n/, '').split(/^## /m).slice(1).map((p) => { const nl = p.indexOf('\n'); return { head: p.slice(0, nl).trim(), text: p.slice(nl + 1) }; });
  const tabs = STEP.map(([h, name]) => (h === 'EDIT' ? (film ? { name, edit: true } : null) : { name, part: parts.find((p) => p.head.startsWith(h)) })).filter((t) => t && (t.edit || t.part));
  if (arc) tabs.unshift({ name: 'Arc', arc });   // step 2: the story's sections and their tension, before any word of it
  if (hook) tabs.unshift({ name: 'Hook', hook, arc });   // step 1: its title and its intro (Stories/hook.js)
  for (const p of parts) if (!tabs.some((t) => t.part === p) && !HIDE.some((h) => p.head.startsWith(h))) tabs.push({ name: p.head, part: p });
  const bar = root.querySelector('.pages'), stage = root.querySelector('.stagedoc'), frame = root.querySelector('.player iframe');
  bar.innerHTML = `<button class="burger" aria-label="Pages"><i></i><i></i><i></i></button>` + tabs.map((t, i) => `<button class="pg" data-i="${i}">${t.name}</button>`).join('');
  const open = (i) => { const t = tabs[i]; root.dataset.page = t.edit ? 'edit' : 'doc'; bar.classList.remove('open');
    bar.querySelectorAll('.pg').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
    if (t.hook) { stage.innerHTML = hookView(t.hook, t.arc); stage.scrollTop = 0; frame?.contentWindow?.postMessage({ maia: 1, cmd: 'pause' }, '*'); }
    else if (t.arc) { stage.innerHTML = arcView(t.arc, hook); stage.scrollTop = 0; frame?.contentWindow?.postMessage({ maia: 1, cmd: 'pause' }, '*'); }
    else if (!t.edit) { stage.innerHTML = `<article class="doc on"><h2>${t.part.head}</h2>${marked.parse(t.part.text)}</article>`; stage.scrollTop = 0; frame?.contentWindow?.postMessage({ maia: 1, cmd: 'pause' }, '*'); } };
  bar.querySelectorAll('.pg').forEach((b) => (b.onclick = () => open(+b.dataset.i)));
  bar.querySelector('.burger').onclick = () => bar.classList.toggle('open');
  const first = tabs.findIndex((t) => t.edit); open(arc || hook ? 0 : first >= 0 ? first : 0);
}

// ---- a story's editor: the film above, its timeline under it. A ruler, the picture track (one still per shot,
// taken in the game), the voices track (the subtitles, by who speaks), and a playhead to drag. It drives the film. ----
const EDIT = `<div class="edit"><div class="etop"><button class="eplay" aria-label="Play or pause"></button><span class="etime"><b>0:00</b> / 0:00</span><span class="eshot"></span><button class="efull" aria-label="Full screen" title="Full screen"><svg viewBox="0 0 16 16"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
  <div class="etracks"><div class="elabs"><span></span><span>T1 · Title</span><span>V1 · Picture</span><span>S1 · Subtitles</span><span>A1 · Voices</span><span>A2 · Music</span></div>
  <div class="elanes"><div class="eruler"></div><div class="elane t"></div><div class="elane v"></div><div class="elane s"></div><div class="elane a"></div><div class="elane m"><span class="eempty">no music yet</span></div><i class="ehead"></i></div></div></div>`;
let onFilm = null;
// the editor's film says so in every message (ch, from its address): Safari's message source is not the frame's
// contentWindow, so the frame cannot be told by identity
addEventListener('message', (ev) => { const m = ev.data; if (m?.maia && m.ch === 'edit' && onFilm && ev.origin === location.origin) onFilm.take(m); });
function editor(el, frame, story) {
  const q = (c) => el.querySelector(c), lanes = q('.elanes'), say = (m) => frame.contentWindow?.postMessage({ maia: 1, ...m }, '*');
  let D = 0, clips = [], starts = [], playing = false, asked = false, cur = -1, base = 0, stamp = 0, shownSec = -1;
  const head = q('.ehead'), clock = q('.etime');
  // the clock is a small canvas: a changed text would make the browser look at the page's layout again, every second
  const cv = document.createElement('canvas'), cx = cv.getContext('2d'), DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = 96 * DPR; cv.height = 20 * DPR; cv.style.width = '96px'; cv.style.height = '20px'; clock.replaceChildren(cv);
  const paintClock = (sec) => { cx.setTransform(DPR, 0, 0, DPR, 0, 0); cx.clearRect(0, 0, 96, 20); cx.textBaseline = 'middle';
    cx.font = '600 14px "DM Sans", sans-serif'; cx.fillStyle = '#fbf6ea'; const a = mm(sec); cx.fillText(a, 0, 10);
    cx.font = '500 14px "DM Sans", sans-serif'; cx.fillStyle = 'rgba(251,246,234,.65)'; cx.fillText(' / ' + mm(Math.round(D)), cx.measureText(a).width + 2, 10); };
  const run = () => { if (!el.isConnected) return; requestAnimationFrame(run); if (!D) return;   // the playhead glides with the film, not in the steps the frame reports in
    const t = Math.min(D, playing ? base + (performance.now() - stamp) / 1000 : base);
    head.style.transform = `translateX(${(t / D) * lanes.clientWidth}px)`;
    const sec = Math.floor(t); if (sec !== shownSec) { shownSec = sec; paintClock(sec); } };   // drawn, not written: no text in the page changes while the film plays
  requestAnimationFrame(run);
  const pct = (t) => (D ? (t / D) * 100 : 0);
  onFilm = { take(m) {
    if (m.type === 'film' && m.duration && !D) {
      D = m.duration; clips = m.clips; starts = []; let T = 0; for (const c of clips) { starts.push(T); T += c.secs; }
      let r = ''; for (let s = 0; s <= D; s += 5) r += `<span style="left:${pct(s)}%">${mm(s)}</span>`; q('.eruler').innerHTML = r;
      q('.elane.v').innerHTML = clips.map((c, i) => `<div class="eclip" data-i="${i}" style="left:${pct(starts[i])}%;width:calc(${pct(c.secs)}% - 3px)${c.still ? `;background-image:url(${c.still})` : ''}"><span>${c.name}</span></div>`).join('');
      const caps = m.captions || [], block = (c, cls) => `<div class="${cls} ${c.kind}" style="left:${pct(c.at)}%;width:calc(${pct(c.for)}% - 2px)" title="${c.text.replace(/"/g, '&quot;')}">${c.text}</div>`;
      q('.elane.t').innerHTML = caps.filter((c) => c.kind === 'title').map((c) => block(c, 'ecap')).join('');
      q('.elane.a').innerHTML = caps.filter((c) => c.kind === 'samuel' || c.kind === 'maia').map((c) => block({ ...c, text: (c.kind === 'samuel' ? 'Samuel' : 'Maia') + ' · not recorded' }, 'eaud')).join('');
      q('.elane.s').innerHTML = caps.filter((c) => c.kind !== 'title').map((c) => `<div class="ecap ${c.kind}" style="left:${pct(c.at)}%;width:calc(${pct(c.for)}% - 2px)" title="${c.text.replace(/"/g, '&quot;')}">${c.text}</div>`).join('');
      // a scene's sounds, each where it lies: its recorded voices, its music and effects
      if (m.sound) { const bar = (x, t) => `<div class="eaud" style="left:${pct(x.at)}%;width:calc(${pct(x.for)}% - 2px)">${t}</div>`;
        q('.elane.a').innerHTML = m.sound.filter((x) => x.kind === 'voice').map((x) => bar(x, (x.who ? x.who[0] + x.who.slice(1).toLowerCase() : 'Voice') + ' · recorded')).join('');
        q('.elane.m').innerHTML = m.sound.filter((x) => x.kind !== 'voice').map((x) => bar(x, x.kind === 'music' ? 'Music' : x.id)).join('') || '<span class="eempty">no music yet</span>'; }
      paintClock(0);
      if (clips.every((c) => c.still)) {} else if (story?.shots >= clips.length) clips.forEach((c, i) => { q(`.eclip[data-i="${i}"]`).style.backgroundImage = `url(/api/stories/${story.id}/shots/${i}.jpg)`; });   // taken before: no run through the shots
      else if (!asked) { asked = true; say({ cmd: 'thumbs' }); }
    }
    if (m.type === 'preview') { const b = document.querySelector('[data-do=retake]'); if (b) { b.textContent = m.ok ? 'Picture retaken' : 'No preview camera'; b.disabled = false; } }
    if (m.type === 'thumb') { const c = q(`.eclip[data-i="${m.i}"]`); if (c) c.style.backgroundImage = `url(${m.src})`; }
    if (m.type === 'time' && D) {
      if (m.playing !== playing) q('.eplay').classList.toggle('on', m.playing);
      playing = m.playing; base = m.t; stamp = performance.now();   // the frame's clock; the playhead runs on from it every frame
      let i = starts.length - 1; while (i > 0 && starts[i] > m.t) i--;
      if (i !== cur) { cur = i; el.querySelectorAll('.eclip').forEach((c) => c.classList.toggle('on', +c.dataset.i === i)); q('.eshot').textContent = clips[i] ? `${i + 1} / ${clips.length} · ${clips[i].name}` : ''; }
    } } };
  q('.eplay').onclick = () => say({ cmd: playing ? 'pause' : 'play' });
  // the space bar plays and pauses, wherever the studio's focus is (in the film's own frame the film takes it itself)
  const space = (e) => { if (!el.isConnected) return removeEventListener('keydown', space);
    if (e.code !== 'Space' || e.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (!document.body.classList.contains('studio') || $('storyedit').dataset.page !== 'edit') return;
    e.preventDefault(); say({ cmd: playing ? 'pause' : 'play' }); };
  addEventListener('keydown', space);
  q('.efull').onclick = () => { frame.parentNode.requestFullscreen?.().catch(() => {}); say({ cmd: 'play' }); };   // the film alone, the whole screen, playing on
  const seek = (ev) => { const r = lanes.getBoundingClientRect(); say({ cmd: 'seek', t: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * D }); };
  lanes.onpointerdown = (ev) => { lanes.setPointerCapture(ev.pointerId); say({ cmd: 'pause' }); seek(ev); lanes.onpointermove = seek; };
  lanes.onpointerup = () => { lanes.onpointermove = null; };
  frame.addEventListener('load', () => say({ cmd: 'film' }));
}

// ---- the land, drawn: the same ground in every picture, so the days can be compared ----
const rng = (seed) => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const riverX = (y) => 46 + 17 * Math.sin(y / 41) + 9 * Math.sin(y / 17);             // the river runs past the first tent, to its east
const land = rng(7), PATCH = [...Array(520)].map(() => ({ x: (land() - .5) * 2400, y: (land() - .5) * 2400, r: 14 + land() * 60, t: land() }));
const STONE = [...Array(260)].map(() => ({ x: (land() - .5) * 1400, y: (land() - .5) * 1400, r: .8 + land() * 1.6 }));
const home0 = (i) => { const r = 13 * Math.sqrt(i), a = i * 2.39996; return [r * Math.cos(a), r * Math.sin(a) * .9]; };   // where the i-th tent stands: outward from the first, like seeds in a sunflower

// one day, from above: a drone's look down at an angle. The more humans, the more ground it has to hold, so it climbs.
let uid = 0;   // every drawing gets its own gradient ids: a copy on a hidden page would otherwise paint nothing
// a day's picture: its preview filmed in the game where there is one, else the drawing from above
const pic = (e, joined) => (e?.preview ? `<img class="pic" src="/api/stories/${e.id}/preview.jpg" alt="">` : drone(e, joined));
function drone(e, joined) {
  const id = ++uid;
  const N = Math.max(1, e.inGame || 1), R = 46 + 15 * Math.sqrt(N) + 4 * Math.log2(e.day + 1);
  const W = 1195, H = 500, k = (W / 2) / (R * 2.1), P = (x, y) => [W * .58 + (x + y * .32) * k, H * .56 + y * .46 * k];
  const span = R * 3.4, f = (v) => v.toFixed(1);
  let l = '', r = ''; for (let y = -span; y <= span; y += span / 28) { const a = P(riverX(y) - 6.5, y), b = P(riverX(y) + 6.5, y); l += `${f(a[0])} ${f(a[1])} `; r = `${f(b[0])} ${f(b[1])} ` + r; }
  const patches = PATCH.filter((p) => Math.abs(p.x) < span * 1.6 && Math.abs(p.y) < span * 1.4).map((p) => { const c = P(p.x, p.y); return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(p.r * k)}" ry="${f(p.r * k * .46)}" fill="${p.t > .5 ? '#a6c47f' : '#4f7f47'}" opacity="${f(.1 + p.t * .16)}"/>`; }).join('');
  const stones = k > 1.2 ? STONE.filter((p) => Math.abs(p.x) < span && Math.abs(p.y) < span).map((p) => { const c = P(p.x, p.y); return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(p.r * k)}" ry="${f(p.r * k * .6)}" fill="#c9cfc0" opacity=".8"/>`; }).join('') : '';
  const shown = Math.min(N, 900), tents = [];
  for (let i = 0; i < shown; i++) { const [x, y] = home0(i); if (i && Math.abs(x - riverX(y)) < 11) continue; tents.push({ x, y, fresh: i >= N - (joined || 0) }); }
  tents.sort((a, b) => a.y - b.y);
  const w = 3.6 * k, h = 5.2 * k;   // a tent is about seven paces wide
  const tent = (t) => { const [cx, cy] = P(t.x, t.y), c = t.fresh ? '#f2b544' : '#fbf1dc';
    if (w < 2.4) return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(Math.max(1.1, w))}" fill="${c}"/>`;
    return `<ellipse cx="${f(cx + w * .9)}" cy="${f(cy + h * .08)}" rx="${f(w * 1.5)}" ry="${f(h * .2)}" fill="#16301f" opacity=".3"/>` +
      `<path d="M${f(cx)} ${f(cy - h)}Q${f(cx - w * .3)} ${f(cy - h * .4)} ${f(cx - w)} ${f(cy)}H${f(cx + w)}Q${f(cx + w * .3)} ${f(cy - h * .4)} ${f(cx)} ${f(cy - h)}z" fill="${c}" stroke="#1f3a2c" stroke-width="${f(Math.max(.6, k * .28))}" stroke-linejoin="round"/>` +
      (w > 6 ? `<path d="M${f(cx)} ${f(cy - h * .34)}V${f(cy)}" stroke="#1f3a2c" stroke-width="${f(k * .3)}" stroke-linecap="round"/>` : ''); };
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gr${id}" x2="0" y2="1"><stop offset="0" stop-color="#9dbe78"/><stop offset="1" stop-color="#5a8a4b"/></linearGradient>
    <radialGradient id="li${id}" cx=".8" cy=".1" r=".9"><stop offset="0" stop-color="#fff3c9" stop-opacity=".5"/><stop offset=".6" stop-color="#fff3c9" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#gr${id})"/>${patches}
    <path d="M${l}${r}z" fill="#e7dcc0" stroke="#e7dcc0" stroke-width="${f(5 * k)}" stroke-linejoin="round"/><path d="M${l}${r}z" fill="#9cc3d6"/><path d="M${l}${r}z" fill="none" stroke="#7fb0c8" stroke-width="${f(Math.max(.6, k * .5))}"/>
    ${stones}${tents.map(tent).join('')}<rect width="${W}" height="${H}" fill="url(#li${id})"/></svg>`;
}

// ---- the front page: one banner and one strip. The count; and the calendar of the 5423 days, today large,
// the next days after it, the far ones small. Pointing at a day that is told brings its story into the banner. ----
function home() {
  const days = stories.filter((s) => s.film).map((s, i) => ({ ...s, day: s.day || i + 1 })), today = days[days.length - 1], told = days.length, T = today ? today.day : 0;
  const joined = (e) => { const i = days.indexOf(e); return e.inGame == null ? null : e.inGame - (i ? days[i - 1].inGame || 0 : NOTED[e.day - 1]?.inGame || 0); };
  const count = (e) => (e && e.inGame != null ? n(e.inGame) : '–');
  $('h-day').textContent = n(Math.max(1, T));   // the last day that has its film; before the first one, day 1
  $('travel')?.addEventListener('click', () => tab('city'));

  // the day's challenge: its few goals, the next one lit
  const goals = (e) => { $('goals').innerHTML = e?.goals?.length ? `<span class="g-label">Day ${e.day}</span>` + (() => { const next = e.goals.findIndex((g) => !g[1]); return e.goals.map((g, i) => `<p class="${g[1] ? 'done' : i === next ? 'now' : ''}">${g[0]}</p>`).join(''); })() : ''; };
  // the window: the day's story. Its shot from above stands there until its film runs, and the film runs only
  // while the window is on screen: scrolled to, it starts; scrolled away, or on another tab, it stops
  const banner = $('banner'), hero = $('heroframe'); let wait, shown = null, inView = false;
  // until a day has its film the trailer stands in the window (a scene: Stories/scenes/trailer), named as what it is
  const tr = scenes.find((x) => x.id === 'trailer'), stand = !today && tr ? { id: tr.id, scene: true, title: tr.title, secs: Math.round(tr.duration), cover: tr.cover } : null;
  const playing = (e) => (hero.getAttribute('src') || '').includes(`${e.scene ? 'scene' : 'story'}=${e.id}&`);
  const sync = () => { clearTimeout(wait);
    if (!shown || !inView || !$('home').classList.contains('on')) { hero.removeAttribute('src'); banner.classList.add('poster'); return; }
    if (playing(shown)) return;
    banner.classList.add('poster'); const e = shown;
    wait = setTimeout(() => { hero.onload = () => { if (playing(e)) banner.classList.remove('poster'); }; hero.src = filmOf(e.id, !!e.scene); }, 350); };
  // the large play: the day's film from its first frame, the window full screen
  const full = (e) => { clearTimeout(wait); const go = () => { hero.contentWindow?.postMessage({ maia: 1, cmd: 'seek', t: 0 }, '*'); hero.contentWindow?.postMessage({ maia: 1, cmd: 'play' }, '*'); banner.classList.remove('poster'); };
    $('window').requestFullscreen?.().catch(() => {});
    if (playing(e)) go(); else { hero.onload = () => setTimeout(go, 400); hero.src = filmOf(e.id, !!e.scene); } };
  const show = (e) => { e = e || today || stand; if (!e) return; const j = e.scene ? null : joined(e);
    if (e !== shown) { shown = e; $('dayboard').innerHTML = e.scene ? (e.cover ? `<img class="pic" src="/api/objects/${e.cover}" alt="">` : '') : pic(e, j);
      $('daycard').innerHTML = `<button class="bigplay" aria-label="Play day ${e.day} from the start, full screen"></button><div><span class="label num">${e.scene ? `The trailer · Day ${pad(1)}` : `Day ${pad(e.day)}${e === today ? ' · today' : ''}`}</span>
        <p class="count">${e.inGame != null ? `<span><b>${n(e.inGame)}</b>${e.inGame === 1 ? 'citizen' : 'citizens'}</span>` : ''}${j ? `<span><b>+${n(j)}</b>joined</span>` : ''}${e.secs ? `<span>${mm(e.secs)}</span>` : ''}</p></div>`;
      $('daycard').querySelector('.bigplay').onclick = () => full(e);
      goals(e); }
    sync(); };
  new IntersectionObserver(([en]) => { inView = en.intersectionRatio >= .45; sync(); }, { threshold: [0, .45, .9] }).observe($('window'));
  home.sync = sync; show(today);

  // day by day: full-width rows. The first row holds today and the days next to it, large, with their shot from above
  // and their count; each row under it holds twice as many, smaller; after three rows every remaining day is a dot
  const toldOn = new Map(days.map((e) => [e.day, e])), cal = $('cal'), start = Math.max(1, T - 1);
  let d = start, rows = '';
  const card = (x, t) => { const e = toldOn.get(x), note = NOTED[x];
    return `<button class="cd${e ? ' told' : ''}${note && !e ? ' noted' : ''}${x === T ? ' today' : ''}" data-d="${x}">${e && t < 2 ? pic(e, joined(e)) : ''}<span class="cn">${t < 2 ? (x === T ? 'Today · ' : x === T + 1 ? 'Tomorrow · ' : '') + 'Day ' : ''}${n(x)}</span>` +
      (t === 0 ? (e ? `${e.inGame != null ? `<span class="cs"><b>${n(e.inGame)}</b> ${e.inGame === 1 ? 'citizen' : 'citizens'}</span>` : ''}<span class="ct">${e.title}</span>` : `${note?.inGame ? `<span class="cs"><b>${n(note.inGame)}</b> ${note.inGame === 1 ? 'citizen' : 'citizens'}</span>` : ''}<span class="ct">${note?.title || 'Not yet told'}</span>`) : '') + '</button>'; };
  [6, 12, 24].forEach((k, t) => { rows += `<div class="crow r${t}">`; for (let i = 0; i < k && d <= DAYS; i++) rows += card(d++, t); rows += '</div>'; });
  cal.innerHTML = `<header class="calhead"><h2>Day by day</h2><p><b>${n(told)}</b> of ${n(DAYS)} days told · <b>${count(today)}</b> ${today?.inGame === 1 ? 'citizen' : 'citizens'} today</p></header>${rows}<canvas></canvas><span class="tip"></span>`;
  cal.querySelectorAll('.cd').forEach((b) => { const e = toldOn.get(+b.dataset.d); if (!e) return;
    b.onpointerenter = () => show(e); b.onpointerleave = () => show(null); b.onclick = () => story(stories.find((s) => s.id === e.id)); });
  const cv = cal.querySelector('canvas'), tip = cal.querySelector('.tip'), first = d; let grid = [], hot = 0;
  const draw = () => { const W = cv.clientWidth; if (!W) return; grid = []; let y = 0, x0 = first, k = 48;
    while (x0 <= DAYS) { const c = W / k; grid.push({ y, c, from: x0, k }); x0 += k; y += c; if (k < 192) k *= 2; }
    const dpr = Math.min(2, devicePixelRatio || 1); cv.style.height = y + 'px'; cv.width = W * dpr; cv.height = y * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
    for (const r of grid) for (let i = 0; i < r.k && r.from + i <= DAYS; i++) { const x = r.from + i; g.beginPath(); g.arc(i * r.c + r.c / 2, r.y + r.c / 2, r.c * .36, 0, 7);
      g.fillStyle = toldOn.has(x) ? '#1f3a2c' : x === hot ? '#5f7f52' : x === DAYS ? '#47604f' : '#dfd2b8'; g.fill(); } };
  const at = (ev) => { const r = cv.getBoundingClientRect(), y = ev.clientY - r.top, row = grid.find((g) => y >= g.y && y < g.y + g.c); if (!row) return null;
    const x = row.from + Math.floor((ev.clientX - r.left) / row.c); return x <= DAYS ? { d: x, x: (x - row.from + .5) * row.c, y: cv.offsetTop + row.y } : null; };
  cv.onpointermove = (ev) => { const o = at(ev); if (!o || o.d === hot) return; hot = o.d; draw(); const e = toldOn.get(o.d);
    tip.innerHTML = `<b>Day ${n(o.d)}</b> · ${e ? e.title : o.d === DAYS ? 'the city stands' : 'not yet told'}`; tip.style.left = Math.min(Math.max(o.x, 110), cv.clientWidth - 110) + 'px'; tip.style.top = (o.y - 46) + 'px'; tip.classList.add('on'); };
  cv.onpointerleave = () => { hot = 0; draw(); tip.classList.remove('on'); };
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 120); }); draw(); home.draw = draw;
  home.today = today; home.joined = joined;
}

// ---- inside: the city's dashboard. A few tiles: the game, the stories, the lenses and the stress test (the intents open from the pill's star) ----
function city() {
  const today = home.today;
  const count = today?.inGame, day = today ? `Day ${n(today.day)} of ${n(DAYS)}` : '';
  // every part of the dashboard is a card: first the welcome (who is here, how many we are today, and the way to grow), then the tiles
  $('tiles').innerHTML = `<section class="tile welcome"><span class="mark" aria-hidden="true"></span><h2>Welcome to Maia City${me.name ? ', ' + me.name : ''}</h2><p>${count != null ? `Today we are <b>${n(count)}</b>${count === 1 ? 'citizen' : 'citizens'}` : ''}</p><button class="btn sunny go" id="invite">Grow your village now<i></i></button></section>
    <button class="tile big" data-go="game"><img class="pic" src="/brand/game.jpg" alt=""><span class="label">The Game</span><h2>Walk the world</h2><p>The meadow, the river, the pines and the first tent, live. Or look at it through the lenses.</p><div class="foot"><span class="go"></span></div></button>
    <button class="tile" data-go="stories"><span class="label">Stories${day ? ' · ' + day : ''}</span><h2>One a day</h2><p>${latest() ? 'Latest: ' + latest().title : 'None yet.'}</p><div class="foot"><b>${n(stories.length)}</b> told<span class="go"></span></div></button>`;
  // the invite: the city's address handed on (the system's own share sheet where there is one, else copied)
  $('invite').onclick = async (e) => {
    const b = e.currentTarget, url = location.origin + '/', say = (t) => { const was = b.firstChild.textContent; b.firstChild.textContent = t; setTimeout(() => (b.firstChild.textContent = was), 1800); };
    try { if (navigator.share) await navigator.share({ title: 'Maia City', text: 'Come and see Maia City grow, one day at a time.', url }); else { await navigator.clipboard.writeText(url); say('Link copied'); } } catch {}
  };
  $('tiles').insertAdjacentHTML('beforeend', `<button class="tile" data-library><span class="label">Library</span><h2>Assets</h2><p>Every made thing that stands in the world, one file each. Turn them, read what they are.</p><div class="foot"><span class="go"></span></div></button>`);
  $('tiles').insertAdjacentHTML('beforeend', `<button class="tile dark pair" data-lenses><span class="label">Debug &amp; performance</span><h2>Lenses</h2><p>The world through nine film lenses, with the frame time, draw calls and triangles: where it runs smooth and where it does not.</p><div class="foot"><span class="go"></span></div></button>`);
  // beside the lenses, the engine's own test: the world with every plot filled (898 million standing, nine million moving; TheGame/src/scatter/stress.js)
  $('tiles').insertAdjacentHTML('beforeend', `<button class="tile dark pair" data-stress><span class="label">Debug &amp; performance</span><h2>Magic Wonder</h2><p>The world with every plot full: 898 million things standing and nine million moving. How far the engine goes.</p><div class="foot"><span class="go"></span></div></button>`);
  $('tiles').querySelectorAll('button.tile').forEach((t) => (t.onclick = () => (t.dataset.lenses !== undefined ? game('lenses') : t.dataset.stress !== undefined ? game('stress') : t.dataset.library !== undefined ? game('library') : t.dataset.go === 'game' ? game('walk') : tab(t.dataset.go))));   // the game's tile always walks, whatever was open last
}

[intents, stories, me, scenes] = await Promise.all([get('/api/intents').then((r) => r.json()), get('/api/stories').then((r) => r.json()).catch(() => []), get('/api/me').then((r) => r.json()).catch(() => ({})), get('/api/scenes').then((r) => r.json()).catch(() => [])]);
board(); home();
shelf();
if ($('tocompass')) $('tocompass').onclick = () => tab('compass');
game('walk', false); tab(['city', 'intents', 'stories', 'compass', 'ladder', 'game', 'join'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
