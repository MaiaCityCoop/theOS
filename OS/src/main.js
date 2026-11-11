// OS: one place over the three. The front page (the city's count, the line of its 5423 days, one
// shot from above per day told), the intents (what is worked on, and where each stands), their
// stories (each with its film, played at the top of its page), and the game to walk in.
// It only reads the repository and frames the game. Only one framed game runs at a time.
import { marked } from 'marked';

const GAME = import.meta.env.VITE_GAME || `http://${location.hostname}:5173`;
const STATES = ['idea', 'define', 'build', 'propose', 'story', 'archived'];
const TARGET = 1346269, DAYS = 5423, YEARS = 16;   // the humans (the 31st Fibonacci number), the days, the years
const $ = (id) => document.getElementById(id);
const get = (u) => fetch(u).then((r) => (r.ok ? r : Promise.reject(r.status)));
const body = (md) => marked.parse(md.replace(/^---\n[\s\S]*?\n---\n/, ''));   // without the front matter
const n = (v) => Math.round(v).toLocaleString('en-US'), pad = (d, w = 4) => String(d).padStart(w, '0');
const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
let intents = [], stories = [], current = null, gameView = 'walk';
const latest = () => stories.filter((s) => s.film).pop();

// ---- tabs: showing one stops the framed games of the others ----
function tab(name) {
  document.querySelectorAll('header.site nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('main').forEach((m) => m.classList.toggle('on', m.id === name));
  const hero = $('heroframe'), film = latest();
  if (name === 'home' && film) { if (!hero.getAttribute('src')) hero.src = `${GAME}/timeline.html?story=${film.id}&embed`; } else hero.removeAttribute('src');
  if (name === 'game') { if (!$('frame').getAttribute('src')) $('frame').src = GAME + VIEWS[gameView][1]; } else $('frame').removeAttribute('src');
  const player = document.querySelector('.player iframe');
  if (player) { if (name === 'stories' && current) { if (!player.getAttribute('src')) player.src = `${GAME}/timeline.html?story=${current.id}&in=os`; } else player.removeAttribute('src'); }
  scrollTo(0, 0);
}
document.querySelectorAll('header.site nav button').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
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

// ---- the land, drawn: the same ground in every picture, so the days can be compared ----
const rng = (seed) => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const riverX = (y) => 46 + 17 * Math.sin(y / 41) + 9 * Math.sin(y / 17);             // the river runs past the first tent, to its east
const land = rng(7), PATCH = [...Array(520)].map(() => ({ x: (land() - .5) * 2400, y: (land() - .5) * 2400, r: 14 + land() * 60, t: land() }));
const STONE = [...Array(260)].map(() => ({ x: (land() - .5) * 1400, y: (land() - .5) * 1400, r: .8 + land() * 1.6 }));
const home0 = (i) => { const r = 13 * Math.sqrt(i), a = i * 2.39996; return [r * Math.cos(a), r * Math.sin(a) * .9]; };   // where the i-th tent stands: outward from the first, like seeds in a sunflower

// one day, from above: a drone's look down at an angle. The more humans, the more ground it has to hold, so it climbs.
function drone(e, joined) {
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
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gr${e.day}" x2="0" y2="1"><stop offset="0" stop-color="#9dbe78"/><stop offset="1" stop-color="#5a8a4b"/></linearGradient>
    <radialGradient id="li${e.day}" cx=".8" cy=".1" r=".9"><stop offset="0" stop-color="#fff3c9" stop-opacity=".5"/><stop offset=".6" stop-color="#fff3c9" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#gr${e.day})"/>${patches}
    <path d="M${l}${r}z" fill="#e7dcc0" stroke="#e7dcc0" stroke-width="${f(5 * k)}" stroke-linejoin="round"/><path d="M${l}${r}z" fill="#9cc3d6"/><path d="M${l}${r}z" fill="none" stroke="#7fb0c8" stroke-width="${f(Math.max(.6, k * .5))}"/>
    ${stones}${tents.map(tent).join('')}<rect width="${W}" height="${H}" fill="url(#li${e.day})"/></svg>`;
}

// the years ahead, guessed in pencil: tents, round huts, domes, trees, more of them each year
const yr = rng(11), PROPS = [...Array(150)].map(() => ({ x: 40 + yr() * 1115, d: yr(), r: yr() })), count = (y) => (y < 2 ? 0 : Math.round(4 + (y - 1) ** 2.1 * .48));
PROPS.forEach((p, i) => { p.born = 2; while (count(p.born) <= i) p.born++; p.y = 178 + p.d ** 1.25 * 300; p.s = .32 + p.d; });
const rcx = (y) => 640 + 150 * Math.sin((y - 150) / 78), rw = (y) => 10 + (y - 172) * .24;
function pencil(y) {
  let l = '', r = ''; for (let yy = 172; yy <= 504; yy += 12) { l += `${(rcx(yy) - rw(yy) / 2).toFixed(0)} ${yy} `; r = `${(rcx(yy) + rw(yy) / 2).toFixed(0)} ${yy} ` + r; }
  const kind = (p) => { const a = y - p.born;
    if (p.r < .2 && y >= 4) return p.r < .1 ? '<path d="M0 0v-10M0-10c-7-8-5-30 0-38 5 8 7 30 0 38z"/>' : '<path d="M0 0v-14"/><circle cx="0" cy="-27" r="14"/>';
    if (a < 2) return '<path d="M0-27Q-7-12-20 0h40Q7-12 0-27z"/>';
    if (a < 6) return '<path d="M-16 0v-16a16 16 0 0 1 32 0v16zM-5 0v-9a5 5 0 0 1 10 0v9"/>';
    return p.r > .6 ? '<path d="M-28 0a28 28 0 0 1 56 0zM0-28v28M-14-24q-7 12-4 24M14-24q7 12 4 24"/>' : '<path d="M-15 0v-36a15 15 0 0 1 30 0v36zM-15-22h30M-5 0v-10a5 5 0 0 1 10 0v10"/>'; };
  const props = PROPS.filter((p, i) => i < count(y) && Math.abs(p.x - rcx(p.y)) > rw(p.y) / 2 + 26 * p.s).sort((a, b) => a.d - b.d).map((p) => `<g transform="translate(${p.x.toFixed(0)} ${p.y.toFixed(0)}) scale(${p.s.toFixed(2)})">${kind(p)}</g>`).join('');
  const aq = y >= 10 ? `<path d="M470 196h340M470 196v-12a6 6 0 0 1 6-6h328a6 6 0 0 1 6 6v12${[...Array(8)].map((_, i) => `M${486 + i * 40} 196a14 14 0 0 1 28 0`).join('')}"/>` : '';
  const st = y >= 5 ? '<g stroke-dasharray="2 9" opacity=".7"><path d="M430 304Q300 380 120 500M430 304Q240 300 30 330M430 304Q500 250 520 180" fill="none"/></g>' : '';
  return `<svg viewBox="0 0 1195 500" preserveAspectRatio="xMidYMid slice"><g fill="#f7f0e3" stroke="#1f3a2c" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" opacity=".84">
    <path d="M-60 174Q600 150 1255 174" fill="none"/><path d="M${l}${r}z" fill="#e6dcc6"/>${aq}${st}${props}</g>
    <g transform="translate(430 304) scale(.6)" fill="#f2b544" stroke="#1f3a2c" stroke-width="2.6" stroke-linejoin="round"><path d="M0-46Q-12-20-36 0h72Q12-20 0-46z"/><path d="M0-14v14" fill="none" stroke-linecap="round"/></g>
    <text x="456" y="312" font-family="Outfit,sans-serif" font-size="11.5" font-weight="600" fill="#bd5b33">the first tent</text></svg>`;
}

// ---- the front page: the count, the line of the days, and each day told as one shot from above ----
function home() {
  const days = stories.filter((s) => s.film).map((s, i) => ({ ...s, day: s.day || i + 1 })), today = days[days.length - 1], told = days.length;
  const joined = (i) => (days[i].inGame == null ? null : days[i].inGame - (i ? days[i - 1].inGame || 0 : 0));
  const count = (e) => (e && e.inGame != null ? n(e.inGame) : '–');
  $('h-in').textContent = $('s-in').textContent = count(today); $('h-day').textContent = today ? n(today.day) : '–'; $('s-told').textContent = n(told);
  $('w-out').textContent = told === 1 ? 'One day is' : `${n(told)} days are`; $('w-left').textContent = n(DAYS - told);
  $('goals').innerHTML = today?.goals?.length ? `<span class="label">Day ${today.day}</span>` + (() => { const next = today.goals.findIndex((g) => !g[1]); return today.goals.map((g, i) => `<p class="${g[1] ? 'done' : i === next ? 'now' : ''}">${g[0]}</p>`).join(''); })() : '';
  $('travel').onclick = () => game('walk');

  // the line: sixteen years of days. The sun is today. Move along it: a day told shows the city as it stood, a day ahead a guess in pencil
  const track = $('track'), tip = track.querySelector('.tip'), probe = track.querySelector('.probe'), banner = $('banner');
  track.querySelectorAll('.seg').forEach((s) => s.remove());
  for (let y = YEARS; y >= 1; y--) { const s = document.createElement('i'); s.className = 'seg'; s.style.left = ((y - 1) / YEARS * 100) + '%'; s.style.width = (100 / YEARS) + '%'; s.innerHTML = `<span>${pad(y, 2)}</span>`; s.dataset.y = y; track.prepend(s); }
  $('sunhead').style.left = `max(15px, ${(today ? today.day : 0) / DAYS * 100}%)`;
  let shown = '';
  const look = (key, svg, tag, line) => { if (key === shown) return; shown = key; if (!key) { banner.classList.remove('ahead'); return; }
    $('yearboard').innerHTML = svg; $('ahead-tag').textContent = tag; $('ahead-line').textContent = line; banner.classList.add('ahead'); };
  const scrub = (ev) => { const r = track.getBoundingClientRect(), x = Math.min(Math.max(ev.clientX - r.left, 0), r.width), f = x / r.width;
    let d = Math.max(1, Math.round(f * DAYS)); const y = Math.min(YEARS, Math.floor(f * YEARS) + 1);
    if (told && x <= Math.max(26, today.day / DAYS * r.width + 12)) d = Math.min(d, today.day);      // near the sun is a day told, however thin the days still are on the line
    const e = days.find((s) => s.day === d) || (d <= (today?.day || 0) ? days.filter((s) => s.day <= d).pop() : null);
    probe.style.left = x + 'px'; tip.style.left = Math.min(Math.max(x, 130), r.width - 130) + 'px';
    tip.innerHTML = e ? `<b>Day ${n(e.day)}</b> · told` : `<b>Day ${n(d)}</b> · year ${y} of ${YEARS} · not yet told`;
    track.classList.add('on'); track.setAttribute('aria-valuenow', d);
    track.querySelectorAll('.seg').forEach((s) => s.classList.toggle('at', +s.dataset.y === y));
    if (e) look('d' + e.day, drone(e, joined(days.indexOf(e))), `Day ${n(e.day)} · as it stood`, `${e.title} · ${count(e)} in game`);
    else look('y' + y, pencil(y), `Year ${y} of ${YEARS} · not yet told`, y === YEARS ? `${n(TARGET)} humans. The city stands.` : 'A guess, in pencil.'); };
  const back = () => { track.classList.remove('on'); look(''); track.querySelectorAll('.seg').forEach((s) => s.classList.remove('at')); };
  track.onpointerdown = (e) => { track.setPointerCapture(e.pointerId); scrub(e); };
  track.onpointermove = scrub; track.onpointerleave = back; track.onpointercancel = back;
  track.onpointerup = (e) => { if (e.pointerType !== 'mouse') back(); };

  // day by day: one widescreen shot from above per day told, the newest first. Nothing stands in for a day that has not happened
  $('days').innerHTML = days.map((e, i) => `<button class="day" data-id="${e.id}" aria-label="Play day ${e.day}">${drone(e, joined(i))}
    <div class="txt"><span class="label num">Day ${pad(e.day)}</span><h3>${e.title}</h3>
      <p class="count">${e.inGame != null ? `<span><b>${n(e.inGame)}</b>in game</span>` : ''}${joined(i) ? `<span><b>+${n(joined(i))}</b>joined</span>` : ''}</p></div>
    <span class="go">${e.secs ? `<span>${mm(e.secs)}</span>` : ''}<i></i></span></button>`).reverse().join('');
  $('days').querySelectorAll('.day').forEach((b) => (b.onclick = () => story(stories.find((s) => s.id === b.dataset.id))));

  // the seeds: every one of the 5423 days, the told ones lit
  const cv = $('seeds'), cue = $('cue'), rest = `${n(DAYS)} days. ${n(told)} told. Point at one.`; let grid = {};
  const seeds = (hot = -1) => { const W = cv.clientWidth; if (!W) return;
    const H = W < 700 ? 320 : 250, dpr = Math.min(2, devicePixelRatio || 1), cols = Math.ceil(Math.sqrt(DAYS * W / H)), c = W / cols, rows = Math.ceil(DAYS / cols);
    grid = { cols, c }; cv.style.height = rows * c + 'px'; cv.width = W * dpr; cv.height = rows * c * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
    for (let i = 0; i < DAYS; i++) { const on = days.some((s) => s.day === i + 1);
      g.fillStyle = on ? '#f2b544' : i === hot ? '#1f3a2c' : '#dfd2b8'; g.beginPath(); g.arc(i % cols * c + c / 2, Math.floor(i / cols) * c + c / 2, on || i === hot ? c * .46 : c * .3, 0, 7); g.fill();
      if (on) { g.strokeStyle = '#bd5b33'; g.lineWidth = 1.2; g.stroke(); } } };
  cv.onpointermove = (ev) => { const r = cv.getBoundingClientRect(), i = Math.floor((ev.clientY - r.top) / grid.c) * grid.cols + Math.floor((ev.clientX - r.left) / grid.c);
    if (i < 0 || i >= DAYS) return; seeds(i); const e = days.find((s) => s.day === i + 1);
    cue.textContent = e ? `Day ${pad(i + 1)} · ${e.title} · ${count(e)} in game` : `Day ${pad(i + 1)} · not yet told`; };
  cv.onpointerleave = () => { seeds(); cue.textContent = rest; };
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(seeds, 150); });
  seeds(); cue.textContent = rest; home.redraw = seeds;
}

[intents, stories] = await Promise.all([get('/api/intents').then((r) => r.json()), get('/api/stories').then((r) => r.json()).catch(() => [])]);
$('count').textContent = `${intents.length} intent${intents.length === 1 ? '' : 's'} · ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}`;
$('list').innerHTML = stories.length ? stories.map((s) => `<div class="card" data-id="${s.id}"><b>STORY ${s.id.slice(0, 4)}</b>${s.title}${s.film ? '<i>with a film</i>' : ''}</div>`).join('') : '<p class="empty">No stories yet. A story is spawned when an intent is proposed.</p>';
$('list').querySelectorAll('.card').forEach((c) => (c.onclick = () => story(stories.find((s) => s.id === c.dataset.id))));
board(); home();
if (stories.length) await story(stories[stories.length - 1], false);   // made ready, not shown: nothing loads a game it will not show
game('walk', false); tab('home'); home.redraw?.();
