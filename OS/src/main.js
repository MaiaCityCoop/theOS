// OS: one place over the three. The front page (the city's count and the calendar of its 5423 days;
// first the words, then the day's film, which plays while it is on screen), the intents (what is worked on, and where each stands), their
// stories (each with its film, played at the top of its page), and the game to walk in.
// It only reads the repository and frames the game. Only one framed game runs at a time.
import { marked } from 'marked';

const GAME = import.meta.env.VITE_GAME || `http://${location.hostname}:5173`;
const STATES = ['idea', 'define', 'build', 'propose', 'story', 'archived'];
const DAYS = 5423, NOTED = { 1: { title: 'The decision', inGame: 1 } };   // days that have a name and a count but no film yet: day 1, Samuel alone
const DAYS_ = DAYS;   // the days; the humans, 1,346,269 (the 31st Fibonacci number), stand in the page's title
const $ = (id) => document.getElementById(id);
const get = (u) => fetch(u).then((r) => (r.ok ? r : Promise.reject(r.status)));
const body = (md) => marked.parse(md.replace(/^---\n[\s\S]*?\n---\n/, ''));   // without the front matter
const n = (v) => Math.round(v).toLocaleString('en-US'), pad = (d, w = 4) => String(d).padStart(w, '0');
const cit = (v) => `${n(v)} citizen${v === 1 ? '' : 's'}`;   // the count is of citizens
const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
let intents = [], stories = [], current = null, gameView = 'walk';
const latest = () => stories.filter((s) => s.film).pop();
const filmOf = (id) => `${GAME}/timeline.html?story=${id}&embed`;

// ---- tabs: showing one stops the framed games of the others ----
function tab(name) {
  document.body.classList.toggle('sheet', name === 'intents');   // the intents open as a sheet over the dashboard
  document.body.classList.toggle('studio', name === 'stories');   // the stories, their shelf and their editor: dark, TheOS blue
  document.body.classList.toggle('admin', name !== 'home');   // inside: the bottom pill; the front page has none
  if (location.hash.slice(1) !== (name === 'home' ? '' : name)) history.replaceState(null, '', name === 'home' ? location.pathname : '#' + name);
  document.querySelectorAll('main').forEach((m) => m.classList.toggle('on', m.id === name));
  if (name === 'intents') { $('city').classList.add('on'); city(); }   // the dashboard stays under the sheet
  if (name === 'stories') $('stories').classList.toggle('editing', !!current);
  document.body.classList.toggle('play', name === 'game');   // the game takes the whole window
  if (name !== 'home') $('heroframe').removeAttribute('src');
  if (name === 'game') { if (!$('frame').getAttribute('src')) $('frame').src = GAME + VIEWS[gameView][1]; } else $('frame').removeAttribute('src');
  const player = document.querySelector('.player iframe');
  if (player) { if (name === 'stories' && current) { if (!player.getAttribute('src')) player.src = filmOf(current.id); } else player.removeAttribute('src'); }
  scrollTo(0, 0);
  if (name === 'home') { home.sync?.(); home.draw?.(); }
  if (name === 'city') city();   // the front page's film starts when its window is on screen, not before
}
$('homebtn').onclick = () => tab(location.hash === '#intents' ? 'city' : 'intents');   // the star opens the board of intents, as in the old play; again, it closes it
$('back').onclick = () => tab(document.body.classList.contains('sheet') || location.hash === '#game' ? 'city' : 'home');
$('badge').onclick = () => tab('home');
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => tab('city')));
$('visit').onclick = () => tab('city');
addEventListener('hashchange', () => tab(location.hash.slice(1) || 'home'));
document.querySelector('header.site .mark').onclick = (e) => { e.preventDefault(); tab('home'); };

// ---- the game, framed: to walk, or to look through the lenses ----
const VIEWS = { walk: ['Walk the world', '/?in=os'], lenses: ['Lenses', '/lenses.html?in=os'] };
function game(view, show = true) {
  gameView = view;
  $('gamebar').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button class="${k === view ? 'on' : ''}" data-v="${k}">${v[0]}</button>`).join('') + `<span class="label">${GAME.replace('http://', '')}</span>`;
  $('gamebar').querySelectorAll('button').forEach((b) => (b.onclick = () => game(b.dataset.v)));
  $('frame').removeAttribute('src');
  if (show) tab('game');
}

// ---- intents: a board by state ----
function board(open) {
  const folded = board.folded || (board.folded = new Set(STATES.filter((st) => !intents.some((i) => i.state === st))));
  $('board').innerHTML = STATES.map((st) => {
    const mine = intents.filter((i) => i.state === st);
    return `<div class="col${folded.has(st) ? ' fold' : ''}" data-st="${st}"><h2>${st}<i>${mine.length}</i><u>${folded.has(st) ? '›' : '‹'}</u></h2>` +
      (mine.length ? mine.map((i) => `<div class="card ${i.outcome || ''}" data-file="${i.file}"><b>INTENT ${i.id}</b>${i.title}${i.outcome ? `<br><i>${i.outcome}</i>` : ''}<div class="meta"><em>S</em>Samuel${i.opened ? ` · ${i.opened}` : ''}</div></div>`).join('') : '<p class="none">None.</p>') + '</div>';
  }).join('');
  $('board').querySelectorAll('.col h2').forEach((h) => (h.onclick = () => { const st = h.parentNode.dataset.st; folded.has(st) ? folded.delete(st) : folded.add(st); board(); }));
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
  $('shelf').innerHTML = stories.filter((s) => s.film).slice().reverse().map((e) => `<button class="cd told" data-id="${e.id}">${pic(e)}<span class="cn">Day ${n(e.day || 1)}${e.secs ? ' · ' + mm(e.secs) : ''}</span>${e.inGame != null ? `<span class="cs"><b>${n(e.inGame)}</b> ${e.inGame === 1 ? 'citizen' : 'citizens'}</span>` : ''}<span class="ct">${e.title}</span></button>`).join('') || '<p class="empty">No stories yet.</p>';
  $('shelf').querySelectorAll('.cd').forEach((c) => (c.onclick = () => story(stories.find((s) => s.id === c.dataset.id))));
}
async function story(s, show = true) {
  current = s;
  const md = await get(`/api/stories/${s.id}/story.md`).then((r) => r.text()), d = $('storyedit');
  d.innerHTML = `<header class="studiohead"><button class="btn small quiet" data-do="shelf">← Stories</button><h1>${s.title}</h1><span class="chip">Day ${n(s.day || 1)}${s.inGame != null ? ' · ' + (s.inGame === 1 ? '1 citizen' : n(s.inGame) + ' citizens') : ''}</span>${s.film ? '<button class="btn small quiet" data-do="retake" title="Take the preview picture again from the live scene, at the camera the story names">Retake picture</button>' : ''}<button class="btn small quiet" data-do="intent">Its intent</button></header>` +
    (s.film ? `<div class="editpage"><div class="pstage"><div class="player"><iframe title="${s.title}" allow="fullscreen"></iframe></div></div>${EDIT}</div>` : '') + `<div class="stagedoc"></div><nav class="pages"></nav>`;
  if (s.film) editor(d.querySelector('.edit'), d.querySelector('.player iframe'), s);
  pages(d, md, s.film);
  d.querySelector('[data-do=intent]').onclick = () => { tab('intents'); board(s.id); };
  d.querySelector('[data-do=shelf]').onclick = () => { current = null; tab('stories'); };
  const rt = d.querySelector('[data-do=retake]'); if (rt) rt.onclick = () => { rt.textContent = 'Taking…'; rt.disabled = true; d.querySelector('.player iframe')?.contentWindow?.postMessage({ maia: 1, cmd: 'preview' }, '*'); };
  if (show) tab('stories');
}

// ---- a story's work, as the pages of an editing suite: one page at a time, chosen from a bar at the bottom left.
// Edit is the film and its timeline; the others are the parts of story.md (its ## sections), hook first ----
const STEP = [['The hook', 'Hook'], ['The story', 'Story'], ['The film', 'Script'], ['EDIT', 'Edit']];
const HIDE = ['Open', 'Receipts', 'The series'];   // sections of story.md the studio does not show as pages
function pages(root, md, film) {
  const parts = md.replace(/^---\n[\s\S]*?\n---\n/, '').split(/^## /m).slice(1).map((p) => { const nl = p.indexOf('\n'); return { head: p.slice(0, nl).trim(), text: p.slice(nl + 1) }; });
  const tabs = STEP.map(([h, name]) => (h === 'EDIT' ? (film ? { name, edit: true } : null) : { name, part: parts.find((p) => p.head.startsWith(h)) })).filter((t) => t && (t.edit || t.part));
  for (const p of parts) if (!tabs.some((t) => t.part === p) && !HIDE.some((h) => p.head.startsWith(h))) tabs.push({ name: p.head, part: p });
  const bar = root.querySelector('.pages'), stage = root.querySelector('.stagedoc'), frame = root.querySelector('.player iframe');
  bar.innerHTML = `<button class="burger" aria-label="Pages"><i></i><i></i><i></i></button>` + tabs.map((t, i) => `<button class="pg" data-i="${i}">${t.name}</button>`).join('');
  const open = (i) => { const t = tabs[i]; root.dataset.page = t.edit ? 'edit' : 'doc'; bar.classList.remove('open');
    bar.querySelectorAll('.pg').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
    if (!t.edit) { stage.innerHTML = `<article class="doc on"><h2>${t.part.head}</h2>${marked.parse(t.part.text)}</article>`; stage.scrollTop = 0; frame?.contentWindow?.postMessage({ maia: 1, cmd: 'pause' }, '*'); } };
  bar.querySelectorAll('.pg').forEach((b) => (b.onclick = () => open(+b.dataset.i)));
  bar.querySelector('.burger').onclick = () => bar.classList.toggle('open');
  const first = tabs.findIndex((t) => t.edit); open(first >= 0 ? first : 0);
}

// ---- a story's editor: the film above, its timeline under it. A ruler, the picture track (one still per shot,
// taken in the game), the voices track (the subtitles, by who speaks), and a playhead to drag. It drives the film. ----
const EDIT = `<div class="edit"><div class="etop"><button class="eplay" aria-label="Play or pause"></button><span class="etime"><b>0:00</b> / 0:00</span><span class="eshot"></span><button class="efull" aria-label="Full screen" title="Full screen"><svg viewBox="0 0 16 16"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
  <div class="etracks"><div class="elabs"><span></span><span>T1 · Title</span><span>V1 · Picture</span><span>S1 · Subtitles</span><span>A1 · Voices</span><span>A2 · Music</span></div>
  <div class="elanes"><div class="eruler"></div><div class="elane t"></div><div class="elane v"></div><div class="elane s"></div><div class="elane a"></div><div class="elane m"><span class="eempty">no music yet</span></div><i class="ehead"></i></div></div></div>`;
let onFilm = null;
addEventListener('message', (ev) => { const m = ev.data; if (m?.maia && onFilm && ev.source === onFilm.win()) onFilm.take(m); });
function editor(el, frame, story) {
  const q = (c) => el.querySelector(c), lanes = q('.elanes'), say = (m) => frame.contentWindow?.postMessage({ maia: 1, ...m }, '*');
  let D = 0, clips = [], starts = [], playing = false, asked = false, cur = -1, base = 0, stamp = 0, shownSec = -1;
  const head = q('.ehead'), clock = q('.etime');
  const run = () => { if (!el.isConnected) return; requestAnimationFrame(run); if (!D) return;   // the playhead glides with the film, not in the steps the frame reports in
    const t = Math.min(D, playing ? base + (performance.now() - stamp) / 1000 : base);
    head.style.transform = `translateX(${(t / D) * lanes.clientWidth}px)`;
    const sec = Math.floor(t); if (sec !== shownSec) { shownSec = sec; (clock.firstChild || clock).textContent = mm(sec); } };   // one text node changes, in a box of fixed width: nothing around it moves
  requestAnimationFrame(run);
  const pct = (t) => (D ? (t / D) * 100 : 0);
  onFilm = { win: () => frame.contentWindow, take(m) {
    if (m.type === 'film' && m.duration && !D) {
      D = m.duration; clips = m.clips; starts = []; let T = 0; for (const c of clips) { starts.push(T); T += c.secs; }
      let r = ''; for (let s = 0; s <= D; s += 5) r += `<span style="left:${pct(s)}%">${mm(s)}</span>`; q('.eruler').innerHTML = r;
      q('.elane.v').innerHTML = clips.map((c, i) => `<div class="eclip" data-i="${i}" style="left:${pct(starts[i])}%;width:calc(${pct(c.secs)}% - 3px)"><span>${c.name}</span></div>`).join('');
      const caps = m.captions || [], block = (c, cls) => `<div class="${cls} ${c.kind}" style="left:${pct(c.at)}%;width:calc(${pct(c.for)}% - 2px)" title="${c.text.replace(/"/g, '&quot;')}">${c.text}</div>`;
      q('.elane.t').innerHTML = caps.filter((c) => c.kind === 'title').map((c) => block(c, 'ecap')).join('');
      q('.elane.a').innerHTML = caps.filter((c) => c.kind === 'samuel' || c.kind === 'maia').map((c) => block({ ...c, text: (c.kind === 'samuel' ? 'Samuel' : 'Maia') + ' · not recorded' }, 'eaud')).join('');
      q('.elane.s').innerHTML = caps.filter((c) => c.kind !== 'title').map((c) => `<div class="ecap ${c.kind}" style="left:${pct(c.at)}%;width:calc(${pct(c.for)}% - 2px)" title="${c.text.replace(/"/g, '&quot;')}">${c.text}</div>`).join('');
      clock.innerHTML = `<b>0:00</b> / ${mm(Math.round(D))}`;
      if (story?.shots >= clips.length) clips.forEach((c, i) => { q(`.eclip[data-i="${i}"]`).style.backgroundImage = `url(/api/stories/${story.id}/shots/${i}.jpg)`; });   // taken before: no run through the shots
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
  $('h-day').textContent = today ? n(T) : '–';
  $('travel').onclick = () => tab('city');

  // the day's challenge: its few goals, the next one lit
  const goals = (e) => { $('goals').innerHTML = e?.goals?.length ? `<span class="label">Day ${e.day}</span>` + (() => { const next = e.goals.findIndex((g) => !g[1]); return e.goals.map((g, i) => `<p class="${g[1] ? 'done' : i === next ? 'now' : ''}">${g[0]}</p>`).join(''); })() : ''; };
  // the window: the day's story. Its shot from above stands there until its film runs, and the film runs only
  // while the window is on screen: scrolled to, it starts; scrolled away, or on another tab, it stops
  const banner = $('banner'), hero = $('heroframe'); let wait, shown = null, inView = false;
  const playing = (e) => (hero.getAttribute('src') || '').includes(`story=${e.id}&`);
  const sync = () => { clearTimeout(wait);
    if (!shown || !inView || !$('home').classList.contains('on')) { hero.removeAttribute('src'); banner.classList.add('poster'); return; }
    if (playing(shown)) return;
    banner.classList.add('poster'); const e = shown;
    wait = setTimeout(() => { hero.onload = () => { if (playing(e)) banner.classList.remove('poster'); }; hero.src = filmOf(e.id); }, 350); };
  // the large play: the day's film from its first frame, the window full screen
  const full = (e) => { clearTimeout(wait); const go = () => { hero.contentWindow?.postMessage({ maia: 1, cmd: 'seek', t: 0 }, '*'); hero.contentWindow?.postMessage({ maia: 1, cmd: 'play' }, '*'); banner.classList.remove('poster'); };
    $('window').requestFullscreen?.().catch(() => {});
    if (playing(e)) go(); else { hero.onload = () => setTimeout(go, 400); hero.src = filmOf(e.id); } };
  const show = (e) => { e = e || today; if (!e) return; const j = joined(e);
    if (e !== shown) { shown = e; $('dayboard').innerHTML = pic(e, j);
      $('daycard').innerHTML = `<button class="bigplay" aria-label="Play day ${e.day} from the start, full screen"></button><div><span class="label num">Day ${pad(e.day)}${e === today ? ' · today' : ''}</span>
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

// ---- inside: the city's dashboard. A few tiles: the game, the stories, the lenses (the intents open from the pill's star) ----
function city() {
  const today = home.today;
  $('citysub').textContent = today ? `Day ${n(today.day)} of ${n(DAYS)} · ${today.inGame != null ? cit(today.inGame) : '–'}` : '';
  $('tiles').innerHTML = `<button class="tile big" data-go="game">${today ? pic(today, home.joined(today)) : ''}<span class="label">The Game</span><h2>Walk the world</h2><p>The meadow, the river and the first tent, live. Or look at it through the lenses.</p><div class="foot"><b>${today?.inGame != null ? n(today.inGame) : '–'}</b> citizens<span class="go"></span></div></button>
    <button class="tile" data-go="stories"><span class="label">Stories</span><h2>One a day</h2><p>${latest() ? 'Latest: ' + latest().title : 'None yet.'}</p><div class="foot"><b>${n(stories.length)}</b> of ${n(DAYS)}<span class="go"></span></div></button>`;
  $('tiles').insertAdjacentHTML('beforeend', `<button class="tile wide dark" data-lenses><span class="label">Debug &amp; performance</span><h2>Lenses</h2><p>The world through nine film lenses, with the frame time, draw calls and triangles: where it runs smooth and where it does not.</p><div class="foot"><span class="go"></span></div></button>`);
  $('tiles').querySelectorAll('.tile').forEach((t) => (t.onclick = () => (t.dataset.lenses !== undefined ? game('lenses') : tab(t.dataset.go))));
}

[intents, stories] = await Promise.all([get('/api/intents').then((r) => r.json()), get('/api/stories').then((r) => r.json()).catch(() => [])]);
board(); home();
shelf();
game('walk', false); tab(['city', 'intents', 'stories', 'game'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
