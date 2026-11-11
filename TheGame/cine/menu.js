// The game's top bar, on every page: where you are, and where else you can go: walk the world,
// the lens bench, the kept timelines, the stories. Liquid glass, from the brand.
// Framed inside the dashboard (?in=os) the dashboard is the menu; as a picture (?embed) there is none.
const qs = new URLSearchParams(location.search);
if (qs.has('embed')) document.body.classList.add('embed');
if (qs.get('in') === 'os') document.body.classList.add('framed');
document.getElementById('hud')?.classList.add('glass');
const here = location.pathname.includes('lenses') ? 'lenses' : location.pathname.includes('timeline') ? (qs.get('story') ? 'story:' + qs.get('story') : 'tl:' + (qs.get('tl') || 'river-story')) : 'walk';
const bar = document.createElement('nav');
bar.dataset.menu = '1'; bar.className = 'os-top glass';
let kept = [], stories = [];
const go = (label, href, id) => `<a class="go ${here === id ? 'on' : ''}" href="${href}">${label}</a>`;
function draw() {
  bar.innerHTML = `<a class="mark" href="http://${location.hostname}:5180/">The<b>OS</b></a>` +
    go('Walk', '/', 'walk') + go('Lenses', '/lenses.html', 'lenses') +
    (kept.length || stories.length ? '<i></i>' : '') +
    stories.map((s) => go(s.title, `/timeline.html?story=${s.id}`, 'story:' + s.id)).join('') +
    kept.map((n) => go(n, `/timeline.html?tl=${n}`, 'tl:' + n)).join('');
}
draw();
document.body.append(bar);
fetch('/cine/list').then((r) => (r.ok ? r.json() : [])).then((l) => { kept = l; draw(); }).catch(() => {});
fetch('/story/list').then((r) => (r.ok ? r.json() : [])).then((l) => { stories = l; draw(); }).catch(() => {});
