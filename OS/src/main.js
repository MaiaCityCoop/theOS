// OS: one board over the three. The intents (what is worked on, and where each stands), their
// stories, and the game those stories play in. It only reads the repository and frames the game.
import { marked } from 'marked';

const GAME = `http://${location.hostname}:5173`;
const STATES = ['idea', 'define', 'build', 'propose', 'story', 'archived'];
const $ = (id) => document.getElementById(id);
const get = (u) => fetch(u).then((r) => (r.ok ? r : Promise.reject(r.status)));
const body = (md) => marked.parse(md.replace(/^---\n[\s\S]*?\n---\n/, ''));   // without the front matter

// ---- tabs ----
function tab(name) {
  document.querySelectorAll('header button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('main').forEach((m) => m.classList.toggle('on', m.id === name));
  if (name === 'game' && !$('frame').src) play('walk');
}
document.querySelectorAll('header button').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));

// ---- the game, framed ----
const VIEWS = { walk: ['Walk the world', '/'], lenses: ['Lenses', '/lenses.html'] };
let stories = [];
function gamebar(now) {
  const views = { ...VIEWS };
  for (const s of stories) if (s.film) views['story:' + s.id] = ['Story ' + s.id, `/timeline.html?story=${s.id}`];
  $('gamebar').innerHTML = Object.entries(views).map(([k, v]) => `<button data-v="${k}" class="${k === now ? 'on' : ''}">${v[0]}</button>`).join('') + `<span>${GAME}</span>`;
  $('gamebar').querySelectorAll('button').forEach((b) => (b.onclick = () => play(b.dataset.v)));
  return views;
}
function play(view) {
  const views = gamebar(view), v = views[view] || VIEWS.walk;
  $('frame').src = GAME + v[1];
  tab('game');
}

// ---- intents: a board by state ----
async function board(open) {
  const list = await get('/api/intents').then((r) => r.json());
  $('count').textContent = `${list.length} intent${list.length === 1 ? '' : 's'} · ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}`;
  $('board').innerHTML = STATES.map((s) => {
    const mine = list.filter((i) => i.state === s);
    return `<div class="col"><h2><span>${s}</span><span>${mine.length || ''}</span></h2>` +
      mine.map((i) => `<div class="card ${i.outcome || ''}" data-file="${i.file}"><b>${i.id}</b>${i.title}${i.outcome ? `<br><i>${i.outcome}</i>` : ''}</div>`).join('') + '</div>';
  }).join('');
  $('board').querySelectorAll('.card').forEach((c) => (c.onclick = () => intent(list.find((i) => i.file === c.dataset.file))));
  const first = list.find((i) => i.slug === open) || list.find((i) => i.state !== 'archived') || list[0];
  if (first) intent(first);
}
async function intent(i) {
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('on', c.dataset.file === i.file));
  const md = await get(`/api/intents/${i.file}`).then((r) => r.text()), s = stories.find((x) => x.id === i.slug);
  const d = $('intentdoc'); d.classList.add('on');
  d.innerHTML = `<div class="bar">${s ? `<button data-do="story">Its story</button>` : ''}${s && s.film ? `<button data-do="film">Play it in the game</button>` : ''}<span class="state">${i.state}${i.outcome ? ' · ' + i.outcome : ''}</span></div>` + body(md);
  d.querySelector('[data-do=story]')?.addEventListener('click', () => { tab('stories'); story(s); });
  d.querySelector('[data-do=film]')?.addEventListener('click', () => play('story:' + s.id));
  d.scrollTop = 0; history.replaceState(null, '', '#' + i.slug);
}

// ---- stories ----
async function story(s) {
  document.querySelectorAll('#list .card').forEach((c) => c.classList.toggle('on', c.dataset.id === s.id));
  const md = await get(`/api/stories/${s.id}/story.md`).then((r) => r.text()), d = $('storydoc');
  d.innerHTML = `<div class="bar">${s.film ? `<button data-do="film">Play it in the game</button>` : ''}<button class="quiet" data-do="intent">Its intent</button></div>` + body(md);
  d.querySelector('[data-do=film]')?.addEventListener('click', () => play('story:' + s.id));
  d.querySelector('[data-do=intent]').addEventListener('click', () => { tab('intents'); board(s.id); });
}

stories = await get('/api/stories').then((r) => r.json()).catch(() => []);
$('list').innerHTML = stories.length ? stories.map((s) => `<div class="card" data-id="${s.id}"><b>${s.id.slice(0, 4)}</b>${s.id.slice(5).replace(/-/g, ' ')}${s.film ? '<br><i>with a film</i>' : ''}</div>`).join('') : '<p class="empty">No stories yet. A story is spawned when an intent is proposed.</p>';
$('list').querySelectorAll('.card').forEach((c) => (c.onclick = () => story(stories.find((s) => s.id === c.dataset.id))));
gamebar();
await board(location.hash.slice(1));
