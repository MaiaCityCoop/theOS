// OS: one place over the three. The intents (what is worked on, and where each stands), their
// stories, and the game those stories play in. It only reads the repository and frames the game.
import { marked } from 'marked';

const GAME = `http://${location.hostname}:5173`;
const STATES = ['idea', 'define', 'build', 'propose', 'story', 'archived'];
const $ = (id) => document.getElementById(id);
const get = (u) => fetch(u).then((r) => (r.ok ? r : Promise.reject(r.status)));
const body = (md) => marked.parse(md.replace(/^---\n[\s\S]*?\n---\n/, ''));   // without the front matter
let intents = [], stories = [];

// ---- tabs ----
function tab(name) {
  document.querySelectorAll('header nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('main').forEach((m) => m.classList.toggle('on', m.id === name));
  if (name === 'game' && !$('frame').src) play('walk');
  // the front page's film runs only while the front page is shown: one picture drawn at a time
  const hero = $('heroframe'), film = stories.filter((s) => s.film).pop();
  if (name === 'home' && film) { if (!hero.src) hero.src = `${GAME}/timeline.html?story=${film.id}&embed`; } else hero.removeAttribute('src');
  scrollTo(0, 0);
}
document.querySelectorAll('header nav button').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => tab(b.dataset.go)));
document.querySelector('header .mark').onclick = (e) => { e.preventDefault(); tab('home'); };

// ---- the game, framed ----
const VIEWS = { walk: ['Walk the world', '/'], lenses: ['Lenses', '/lenses.html'] };
function gamebar(now) {
  const views = { ...VIEWS };
  for (const s of stories) if (s.film) views['story:' + s.id] = [s.title, `/timeline.html?story=${s.id}`];
  $('gamebar').innerHTML = Object.entries(views).map(([k, v]) => `<button class="btn small ${k === now ? '' : 'quiet'}" data-v="${k}">${v[0]}</button>`).join('') + `<span>${GAME}</span>`;
  $('gamebar').querySelectorAll('button').forEach((b) => (b.onclick = () => play(b.dataset.v)));
  return views;
}
function play(view) {
  const views = gamebar(view), v = views[view] || VIEWS.walk;
  tab('game');
  $('frame').src = GAME + v[1];
}

// ---- intents: a board by state ----
function board(open) {
  $('board').innerHTML = STATES.map((s) => {
    const mine = intents.filter((i) => i.state === s);
    return `<div class="col"><h2><span>${s}</span><span>${mine.length || ''}</span></h2>` +
      (mine.map((i) => `<div class="card ${i.outcome || ''}" data-file="${i.file}"><b>${i.id}</b>${i.title}${i.outcome ? `<br><i>${i.outcome}</i>` : ''}</div>`).join('') || '<div class="hole"></div>') + '</div>';
  }).join('');
  $('board').querySelectorAll('.card').forEach((c) => (c.onclick = () => intent(intents.find((i) => i.file === c.dataset.file))));
  const first = intents.find((i) => i.slug === open) || intents.find((i) => i.state !== 'archived') || intents[0];
  if (first) intent(first);
}
async function intent(i) {
  document.querySelectorAll('#board .card').forEach((c) => c.classList.toggle('on', c.dataset.file === i.file));
  const md = await get(`/api/intents/${i.file}`).then((r) => r.text()), s = stories.find((x) => x.id === i.slug);
  const d = $('intentdoc'); d.classList.add('on');
  d.innerHTML = `<div class="bar">${s && s.film ? `<button class="btn small" data-do="film">▶ Play its story</button>` : ''}${s ? `<button class="btn small quiet" data-do="story">Read its story</button>` : ''}<span class="chip live">${i.state}${i.outcome ? ' · ' + i.outcome : ''}</span></div>` + body(md);
  d.querySelector('[data-do=story]')?.addEventListener('click', () => { tab('stories'); story(s); });
  d.querySelector('[data-do=film]')?.addEventListener('click', () => play('story:' + s.id));
  d.scrollTop = 0;
}

// ---- stories ----
async function story(s) {
  document.querySelectorAll('#list .card').forEach((c) => c.classList.toggle('on', c.dataset.id === s.id));
  const md = await get(`/api/stories/${s.id}/story.md`).then((r) => r.text()), d = $('storydoc');
  d.innerHTML = `<div class="bar">${s.film ? `<button class="btn small" data-do="film">▶ Play it in the game</button>` : ''}<button class="btn small quiet" data-do="intent">Its intent</button><span class="chip">story ${s.id.slice(0, 4)}</span></div>` + body(md);
  d.querySelector('[data-do=film]')?.addEventListener('click', () => play('story:' + s.id));
  d.querySelector('[data-do=intent]').addEventListener('click', () => { tab('intents'); board(s.id); });
  d.scrollTop = 0;
}

// ---- the front page ----
function home() {
  const film = stories.filter((s) => s.film).pop();
  $('flow').innerHTML = STATES.map((s) => { const n = intents.filter((i) => i.state === s).length; return `<div class="${n ? 'has' : ''}"><b>${n}</b><span>${s}</span></div>`; }).join('');
  $('flow').querySelectorAll('div').forEach((d) => (d.onclick = () => tab('intents')));
  const open = intents.filter((i) => i.state !== 'archived');
  $('nowlist').innerHTML = open.length ? open.slice(0, 4).map((i) => `<div class="row" data-slug="${i.slug}"><span>${i.title}</span><span class="chip live">${i.state}</span></div>`).join('') : '<p>Nothing is open.</p>';
  $('nowlist').querySelectorAll('.row').forEach((r) => (r.onclick = () => { tab('intents'); board(r.dataset.slug); }));
  if (film) { $('storytitle').textContent = film.title; $('storysub').textContent = `Story ${film.id.slice(0, 4)}, told by avenMAIA, played by a camera inside the world. The same film every time.`; }
  for (const id of ['watch', 'watch2']) $(id).onclick = () => (film ? play('story:' + film.id) : tab('stories'));
  for (const id of ['walk', 'walk2']) $(id).onclick = () => play('walk');
  $('lenses').onclick = () => play('lenses');
}

[intents, stories] = await Promise.all([get('/api/intents').then((r) => r.json()), get('/api/stories').then((r) => r.json()).catch(() => [])]);
$('count').textContent = `${intents.length} intent${intents.length === 1 ? '' : 's'} · ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}`;
$('list').innerHTML = stories.length ? stories.map((s) => `<div class="card" data-id="${s.id}"><b>story ${s.id.slice(0, 4)}</b>${s.title}${s.film ? '<br><i>with a film</i>' : ''}</div>`).join('') : '<p class="empty">No stories yet. A story is spawned when an intent is proposed.</p>';
$('list').querySelectorAll('.card').forEach((c) => (c.onclick = () => story(stories.find((s) => s.id === c.dataset.id))));
gamebar(); board(); home(); tab('home');
if (stories.length) story(stories[stories.length - 1]);
