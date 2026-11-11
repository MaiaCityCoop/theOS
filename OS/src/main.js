// OS: one place over the three. The front page (the city's count and the calendar of its 5423 days;
// first the words, then the day's film, which plays while it is on screen), the intents (what is worked on, and where each stands), their
// stories (each with its film, played at the top of its page), and the game to walk in.
// It only reads the repository and frames the game. Only one framed game runs at a time.
import { marked } from 'marked';

const GAME = import.meta.env.VITE_GAME || `http://${location.hostname}:5173`;
const STATES = ['idea', 'define', 'build', 'propose', 'story', 'archived'];
const DAYS = 5423;   // the days; the humans, 1,346,269 (the 31st Fibonacci number), stand in the page's title
const $ = (id) => document.getElementById(id);
const get = (u) => fetch(u).then((r) => (r.ok ? r : Promise.reject(r.status)));
const body = (md) => marked.parse(md.replace(/^---\n[\s\S]*?\n---\n/, ''));   // without the front matter
const n = (v) => Math.round(v).toLocaleString('en-US'), pad = (d, w = 4) => String(d).padStart(w, '0');
const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
let intents = [], stories = [], current = null, gameView = 'walk';
const latest = () => stories.filter((s) => s.film).pop();
const filmOf = (id) => `${GAME}/timeline.html?story=${id}&embed`;

// ---- tabs: showing one stops the framed games of the others ----
function tab(name) {
  document.querySelectorAll('header.site nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('main').forEach((m) => m.classList.toggle('on', m.id === name));
  document.body.classList.toggle('play', name === 'game');   // the game takes the whole window
  if (name !== 'home') $('heroframe').removeAttribute('src');
  if (name === 'game') { if (!$('frame').getAttribute('src')) $('frame').src = GAME + VIEWS[gameView][1]; } else $('frame').removeAttribute('src');
  const player = document.querySelector('.player iframe');
  if (player) { if (name === 'stories' && current) { if (!player.getAttribute('src')) player.src = `${GAME}/timeline.html?story=${current.id}&in=os`; } else player.removeAttribute('src'); }
  scrollTo(0, 0);
  if (name === 'home') { home.sync?.(); home.draw?.(); }   // the front page's film starts when its window is on screen, not before
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

// ---- the front page: one banner and one strip. The count; and the calendar of the 5423 days, today large,
// the next days after it, the far ones small. Pointing at a day that is told brings its story into the banner. ----
function home() {
  const days = stories.filter((s) => s.film).map((s, i) => ({ ...s, day: s.day || i + 1 })), today = days[days.length - 1], told = days.length, T = today ? today.day : 0;
  const joined = (e) => { const i = days.indexOf(e); return e.inGame == null ? null : e.inGame - (i ? days[i - 1].inGame || 0 : 0); };
  const count = (e) => (e && e.inGame != null ? n(e.inGame) : '–');
  $('h-in').textContent = $('s-in').textContent = count(today); $('h-day').textContent = today ? n(T) : '–'; $('s-told').textContent = n(told);
  $('travel').onclick = () => game('walk');

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
  const show = (e) => { e = e || today; if (!e) return; const j = joined(e);
    if (e !== shown) { shown = e; $('dayboard').innerHTML = drone(e, j);
      $('daycard').innerHTML = `<span class="label num">Day ${pad(e.day)}${e === today ? ' · today' : ''}</span><h2>${e.title}</h2>
        <p class="count">${e.inGame != null ? `<span><b>${n(e.inGame)}</b>in game</span>` : ''}${j ? `<span><b>+${n(j)}</b>joined</span>` : ''}${e.secs ? `<span>${mm(e.secs)}</span>` : ''}</p>`;
      goals(e); }
    sync(); };
  new IntersectionObserver(([en]) => { inView = en.intersectionRatio >= .45; sync(); }, { threshold: [0, .45, .9] }).observe($('window'));
  home.sync = sync; show(today);

  // the calendar: every one of the 5423 days is a dot. Today is the sun, as tall as the strip; the days next to it
  // are large, and the further a day is from today the smaller it is drawn, so that all of them fit
  const cal = $('cal'); cal.innerHTML = '<canvas></canvas><span class="tip"></span>';
  const cv = cal.querySelector('canvas'), tip = cal.querySelector('.tip'), toldOn = new Map(days.map((e) => [e.day, e]));
  let cols = [], hot = 0;
  const pack = (H, m) => { const out = []; let c = null;
    for (let d = 1; d <= DAYS; d++) {
      const s = d === T ? H : Math.max(m, 40 * .8 ** (Math.abs(d - T) - 1));
      if (!c || d === T || c.today || c.h + s > H + .01 || Math.max(c.w, s) / Math.min(c.w, s) > 1.25) { c = { h: 0, w: s, today: d === T, dots: [] }; out.push(c); }
      c.dots.push({ d, y: c.h, s }); c.h += s; c.w = Math.max(c.w, s); }
    let x = 0; for (const c of out) { c.x = x; x += c.w; } return { out, w: x }; };
  const sun = (g, x, y, r) => { g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 - Math.PI / 2, q = i % 4 === 0 ? r : i % 2 ? r * .36 : r * .62; g.lineTo(x + q * Math.cos(a), y + q * Math.sin(a)); }
    g.closePath(); g.fillStyle = '#f2b544'; g.fill(); g.beginPath(); g.arc(x, y, r * .36, 0, 7); g.fillStyle = '#ffe2a0'; g.fill(); };
  const draw = () => { const W = cal.clientWidth, H = cal.clientHeight; if (!W) return;
    let lo = .3, hi = 30; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; pack(H, m).w <= W ? (lo = m) : (hi = m); }
    const p = pack(H, lo); cols = p.out; const off = (W - p.w) / 2, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
    for (const c of cols) { c.x += off; const top = (H - c.h) / 2;
      for (const o of c.dots) { const x = c.x + c.w / 2, y = top + o.y + o.s / 2, r = o.s * .4, e = toldOn.get(o.d); o.cx = x; o.cy = y;
        if (o.d === T) { sun(g, x, y, H * .46); continue; }
        g.beginPath(); g.arc(x, y, o.d === hot ? Math.max(r, 3) : r, 0, 7);
        if (e) { g.fillStyle = '#1f3a2c'; g.fill(); }
        else if (o.d === hot) { g.fillStyle = '#5f7f52'; g.fill(); }
        else if (r > 7 || o.d === DAYS) { g.fillStyle = '#f7f0e3'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = o.d === DAYS ? '#47604f' : '#dfd2b8'; g.stroke(); }
        else { g.fillStyle = '#dfd2b8'; g.fill(); }
        if (r >= 11 && !e) { g.fillStyle = '#7f8a78'; g.font = `500 ${Math.round(r * .8)}px Outfit, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.d, x, y + 1); } } } };
  const at = (ev) => { const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const c = cols.find((k) => x >= k.x && x < k.x + k.w); if (!c) return null;
    return c.dots.reduce((b, o) => (Math.abs(o.cy - y) < Math.abs(b.cy - y) ? o : b)); };
  const say = (d) => { const e = toldOn.get(d); return d === T ? `<b>Day ${n(d)}</b> · today · ${e.title}` : e ? `<b>Day ${n(d)}</b> · ${e.title}` : `<b>Day ${n(d)}</b> · ${d === T + 1 ? 'tomorrow' : 'not yet told'}`; };
  cv.onpointermove = (ev) => { const o = at(ev); if (!o || o.d === hot) return; hot = o.d; draw();
    tip.innerHTML = say(o.d); tip.style.left = Math.min(Math.max(o.cx, 110), cal.clientWidth - 110) + 'px'; tip.classList.add('on'); show(toldOn.get(o.d) || null); };
  cv.onclick = (ev) => { const e = toldOn.get(at(ev)?.d); if (e) story(stories.find((s) => s.id === e.id)); };
  cal.onpointerleave = () => { hot = 0; draw(); tip.classList.remove('on'); show(null); };
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 120); }); draw(); home.draw = draw;
}

[intents, stories] = await Promise.all([get('/api/intents').then((r) => r.json()), get('/api/stories').then((r) => r.json()).catch(() => [])]);
$('count').textContent = `${intents.length} intent${intents.length === 1 ? '' : 's'} · ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}`;
$('list').innerHTML = stories.length ? stories.map((s) => `<div class="card" data-id="${s.id}"><b>STORY ${s.id.slice(0, 4)}</b>${s.title}${s.film ? '<i>with a film</i>' : ''}</div>`).join('') : '<p class="empty">No stories yet. A story is spawned when an intent is proposed.</p>';
$('list').querySelectorAll('.card').forEach((c) => (c.onclick = () => story(stories.find((s) => s.id === c.dataset.id))));
board(); home();
if (stories.length) await story(stories[stories.length - 1], false);   // made ready, not shown: nothing loads a game it will not show
game('walk', false); tab('home');
