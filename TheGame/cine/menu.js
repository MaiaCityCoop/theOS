// The menu, on every page: choose between walking the world yourself and the kept timelines.
const qs = new URLSearchParams(location.search);
const here = location.pathname.includes('lenses') ? 'lenses' : location.pathname.includes('timeline') ? (qs.get('story') ? 'story:' + qs.get('story') : qs.get('tl') || 'river-story') : 'walk';
const box = document.createElement('div');
box.dataset.menu = '1';
box.className = 'os-menu glass';
const row = (label, note, href, on) => `<a href="${href}" class="${on ? 'on' : ''}"><span>${label}</span><span>${note}</span></a>`;
const head = (t) => `<h6>${t}</h6>`;
let kept = [], stories = [];
function draw() {
  box.innerHTML = `<a class="mark" href="http://${location.hostname}:5180/" style="padding:8px 9px 4px">TheOS</a>` + head('The Game') + row('Walk the world', 'you', '/', here === 'walk') +
    (kept.length ? head('Timelines') : '') + kept.map((n) => row(n, 'kept', `/timeline.html?tl=${n}`, here === n)).join('') +
    (stories.length ? head('Stories') : '') + stories.map((n) => row(n, 'intent', `/timeline.html?story=${n}`, here === 'story:' + n)).join('') +
    head('Camera') + row('Lenses', 'live', '/lenses.html', here === 'lenses');
}
draw();
if (!qs.has('embed')) document.body.append(box);   // framed as a picture (the dashboard's front page), the game shows no menu
fetch('/cine/list').then((r) => (r.ok ? r.json() : [])).then((l) => { kept = l; draw(); }).catch(() => {});
fetch('/story/list').then((r) => (r.ok ? r.json() : [])).then((l) => { stories = l; draw(); }).catch(() => {});
