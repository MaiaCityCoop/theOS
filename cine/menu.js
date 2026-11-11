// The menu, on every page: choose between walking the world yourself and the timelines
// (a freshly composed trailer, or one of the kept ones).
const here = location.pathname.includes('timeline') ? new URLSearchParams(location.search).get('tl') || 'trailer' : 'walk';
const box = document.createElement('div');
box.style.cssText = 'position:fixed;right:8px;top:8px;z-index:6;font:12px/1.4 ui-monospace,Menlo,monospace;color:#e8eaee;background:rgba(12,14,18,.78);border-radius:8px;padding:6px;min-width:190px;backdrop-filter:blur(6px)';
const row = (label, note, href, on) => `<a href="${href}" style="display:flex;justify-content:space-between;gap:14px;padding:5px 8px;border-radius:5px;text-decoration:none;color:${on ? '#0d0f12' : '#e8eaee'};background:${on ? '#e8eaee' : 'transparent'}"><span>${label}</span><span style="opacity:.6">${note}</span></a>`;
const head = (t) => `<div style="padding:6px 8px 2px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.55">${t}</div>`;
function draw(kept) {
  box.innerHTML = head('Sandbox 8') + row('Walk the world', 'you', '/', here === 'walk') +
    head('Timelines') + row('Trailer', 'composed', '/timeline.html', here === 'trailer') +
    kept.map((n) => row(n, 'kept', `/timeline.html?tl=${n}`, here === n)).join('');
}
draw([]);
document.body.append(box);
fetch('/cine/list').then((r) => (r.ok ? r.json() : [])).then(draw).catch(() => {});
