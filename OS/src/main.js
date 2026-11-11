// OS: one place over the three. The intents (what is worked on, and where each stands), their
// stories (each with its film, played at the top of its page), and the game to walk in.
// It only reads the repository and frames the game. Only one framed game runs at a time.
import { marked } from 'marked';

const GAME = `http://${location.hostname}:5173`;
const STATES = ['idea', 'define', 'build', 'propose', 'story', 'archived'];
const $ = (id) => document.getElementById(id);
const get = (u) => fetch(u).then((r) => (r.ok ? r : Promise.reject(r.status)));
const body = (md) => marked.parse(md.replace(/^---\n[\s\S]*?\n---\n/, ''));   // without the front matter
let intents = [], stories = [], current = null, gameView = 'walk';
const latest = () => stories.filter((s) => s.film).pop();

// ---- tabs: showing one stops the framed games of the others ----
function tab(name) {
  document.querySelectorAll('header nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('main').forEach((m) => m.classList.toggle('on', m.id === name));
  const hero = $('heroframe'), film = latest();
  if (name === 'home' && film) { if (!hero.getAttribute('src')) hero.src = `${GAME}/timeline.html?story=${film.id}&embed`; } else hero.removeAttribute('src');
  if (name === 'game') { if (!$('frame').getAttribute('src')) $('frame').src = GAME + VIEWS[gameView][1]; } else $('frame').removeAttribute('src');
  const player = document.querySelector('.player iframe');
  if (player) { if (name === 'stories' && current) { if (!player.getAttribute('src')) player.src = `${GAME}/timeline.html?story=${current.id}&in=os`; } else player.removeAttribute('src'); }
  scrollTo(0, 0);
}
document.querySelectorAll('header nav button').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => tab(b.dataset.go)));
document.querySelector('header .mark').onclick = (e) => { e.preventDefault(); tab('home'); };

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
  $('board').innerHTML = STATES.map((s) => {
    const mine = intents.filter((i) => i.state === s);
    return `<div class="col"><h2 class="label"><span>${s}</span><span>${mine.length || ''}</span></h2>` +
      mine.map((i) => `<div class="card ${i.outcome || ''}" data-file="${i.file}"><b>INTENT ${i.id}</b>${i.title}${i.outcome ? `<i>${i.outcome}</i>` : ''}</div>`).join('') + '</div>';
  }).join('');
  $('board').querySelectorAll('.card').forEach((c) => (c.onclick = () => intent(intents.find((i) => i.file === c.dataset.file))));
  const first = intents.find((i) => i.slug === open) || intents.find((i) => i.state !== 'archived') || intents[0];
  if (first) intent(first);
}
async function intent(i) {
  document.querySelectorAll('#board .card').forEach((c) => c.classList.toggle('on', c.dataset.file === i.file));
  const md = await get(`/api/intents/${i.file}`).then((r) => r.text()), s = stories.find((x) => x.id === i.slug);
  const d = $('intentdoc'); d.classList.add('on');
  d.innerHTML = `<div class="bar">${s ? `<button class="btn small play" data-do="story">Its story</button>` : ''}<span class="chip live">${i.state}${i.outcome ? ' · ' + i.outcome : ''}</span></div>` + body(md);
  d.querySelector('[data-do=story]')?.addEventListener('click', () => story(s));
  d.scrollTop = 0;
}

// ---- stories: the film at the top, the telling under it ----
async function story(s, show = true) {
  current = s;
  document.querySelectorAll('#list .card').forEach((c) => c.classList.toggle('on', c.dataset.id === s.id));
  const md = await get(`/api/stories/${s.id}/story.md`).then((r) => r.text()), d = $('storydoc');
  d.innerHTML = `<div class="bar"><span class="label">Story ${s.id.slice(0, 4)}</span><button class="btn small quiet" data-do="intent" style="margin-left:auto">Its intent</button></div>` +
    (s.film ? `<div class="player"><iframe title="${s.title}" allow="fullscreen"></iframe></div>` : '') + body(md);
  d.querySelector('[data-do=intent]').addEventListener('click', () => { tab('intents'); board(s.id); });
  d.scrollTop = 0;
  if (show) tab('stories');
}

// ---- the front page ----
function home() {
  const film = latest();
  $('flow').innerHTML = STATES.map((s) => { const n = intents.filter((i) => i.state === s).length; return `<div class="${n ? 'has' : ''}"><b>${n}</b><span class="label">${s}</span></div>`; }).join('');
  $('flow').querySelectorAll('div').forEach((d) => (d.onclick = () => tab('intents')));
  const open = intents.filter((i) => i.state !== 'archived');
  $('nowlist').innerHTML = open.length ? open.slice(0, 4).map((i) => `<div class="row" data-slug="${i.slug}"><span>${i.title}</span><span class="chip live">${i.state}</span></div>`).join('') : '<p>Nothing is open.</p>';
  $('nowlist').querySelectorAll('.row').forEach((r) => (r.onclick = () => { tab('intents'); board(r.dataset.slug); }));
  if (film) { $('storytitle').textContent = film.title; $('storysub').textContent = `Story ${film.id.slice(0, 4)}: Samuel and Maia, and a camera inside the world. The same film every time.`; $('herocap').textContent = film.title; }
  for (const id of ['watch', 'watch2']) $(id).onclick = () => (film ? story(film) : tab('stories'));
  for (const id of ['walk', 'walk2']) $(id).onclick = () => game('walk');
  $('lenses').onclick = () => game('lenses');
}

[intents, stories] = await Promise.all([get('/api/intents').then((r) => r.json()), get('/api/stories').then((r) => r.json()).catch(() => [])]);
$('count').textContent = `${intents.length} intent${intents.length === 1 ? '' : 's'} · ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}`;
$('list').innerHTML = stories.length ? stories.map((s) => `<div class="card" data-id="${s.id}"><b>STORY ${s.id.slice(0, 4)}</b>${s.title}${s.film ? '<i>with a film</i>' : ''}</div>`).join('') : '<p class="empty">No stories yet. A story is spawned when an intent is proposed.</p>';
$('list').querySelectorAll('.card').forEach((c) => (c.onclick = () => story(stories.find((s) => s.id === c.dataset.id))));
board(); home();
if (stories.length) await story(stories[stories.length - 1], false);   // made ready, not shown: nothing loads a game it will not show
game('walk', false); tab('home');
