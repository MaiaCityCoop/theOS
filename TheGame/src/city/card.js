// A village's card: what the picked plot is, on the brand's clear glass (brand/brand.css: .glass, .g-*), at the left.
// Its name, who lives there now and how many it is a home for, its land, where it lies, and whether it is open; a village
// beside an open one can be opened from here.
import CITY from '../../world/city.js';

const n = (v) => Math.round(v).toLocaleString('en');
const km = (m) => (m >= 10000 ? `${Math.round(m / 1000)} km` : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

export function createCard({ city, open, citizens, stateOf, openPlot, close }) {
  const byId = new Map(city.plots.map((p) => [p.id, p])), total = city.plots.length;
  const el = document.createElement('aside');
  el.className = 'city-card glass'; el.hidden = true; el.setAttribute('aria-label', 'Village');
  document.body.append(el);
  const style = document.createElement('style');
  style.textContent = `.city-card{position:fixed;left:var(--edge);top:calc(var(--edge) + 48px);z-index:7;width:272px;box-sizing:border-box;padding:16px 16px 14px;border-radius:var(--radius,22px);display:grid;gap:13px;max-height:calc(100vh - 2 * var(--edge) - 120px);overflow:auto}
  .city-card[hidden]{display:none}
  .city-card header{display:grid;grid-template-columns:1fr auto;align-items:start;gap:8px}
  .city-card header .g-title{margin-top:7px}
  .city-card .x{width:28px;height:28px;border-radius:999px;border:0;background:rgba(255,255,255,.12);color:#fff;font:500 15px/1 var(--sans);cursor:pointer}
  .city-card .x:hover{background:var(--glass-hover)}
  .city-card .state{display:inline-flex;align-items:center;gap:7px;margin-top:9px}
  .city-card .dot{width:8px;height:8px;border-radius:50%;background:#fff}
  .city-card .dot.open{background:#ffd684;box-shadow:0 0 8px #ffd684}.city-card .dot.next{background:#c9ffd9}.city-card .dot.plain{background:rgba(255,255,255,.55)}
  .city-card .bar{display:flex;height:7px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.12);margin:9px 0 9px}
  .city-card .bar i{display:block;height:100%}
  .city-card .keys{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px}
  .city-card .keys span{display:flex;align-items:center;gap:6px;font:500 11.5px/1.2 var(--glass-font);color:var(--on-glass-2);white-space:nowrap}
  .city-card .keys b{font-weight:650;color:var(--on-glass);font-variant-numeric:tabular-nums}
  .city-card .keys em{width:8px;height:8px;border-radius:2px;flex:none}
  .city-card dl{display:grid;grid-template-columns:auto 1fr;gap:7px 12px;margin:0}
  .city-card dt{font:600 10.5px/1.25 var(--glass-font);letter-spacing:.14em;text-transform:uppercase;color:var(--on-glass-3);padding-top:1px}
  .city-card dd{margin:0;font:500 12.5px/1.3 var(--glass-font);color:var(--on-glass);text-align:right;font-variant-numeric:tabular-nums}
  .city-card .act{display:grid;gap:9px}
  .city-card .act .g-btn{justify-self:start;padding:9px 14px;font-size:12.5px}
  @media (max-width:600px){.city-card{left:16px;right:16px;width:auto;top:auto;bottom:calc(var(--edge-b) + 64px);max-height:46vh}}`;
  document.head.append(style);
  for (const e of ['pointerdown', 'pointerup', 'wheel', 'keydown', 'mousedown']) el.addEventListener(e, (ev) => ev.stopPropagation());   // the camera does not take what the card does
  const COL = { meadow: '#cfe3a2', forest: '#6f9a72', dry: '#e8cd8e', shore: '#8fc6c4' };
  let shown = null;

  function render(p) {
    const st = stateOf(p), now = p.id === 1 ? citizens() : 0;
    const beside = p.neighbours.map((id) => byId.get(id)), openBeside = beside.filter((q) => open.has(q.id));
    const stateTxt = st === 'open' ? 'Open' : st === 'next' ? 'Ready to open' : 'Not open yet';
    const land = Object.entries(p.shares).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
    const lead = land[0] ? CITY.land[land[0][0]] : null;
    const act = st === 'open'
      ? `<p class="g-text">${p.id === 1 ? 'Where the tent stands: the city begins here.' : now ? '' : 'Open, and waiting for its first citizens.'}</p>`
      : st === 'next'
        ? `<p class="g-text">It shares a road with ${openBeside.map((q) => q.name).join(', ')}. Open it, and the villages round it can follow.</p><button type="button" class="g-btn" data-do="open">Open ${p.name}</button>`
        : `<p class="g-text">It opens once a village beside it is open: ${beside.slice(0, 3).map((q) => q.name).join(', ')}${beside.length > 3 ? '…' : ''}.</p>`;
    el.innerHTML = `<header><div><span class="g-label">Village ${p.id} of ${n(total)}</span><h2 class="g-title">${p.name}</h2><span class="state g-chip"><i class="dot ${st}"></i>${stateTxt}</span></div><button type="button" class="x" data-do="close" aria-label="Close">×</button></header>
      <div class="g-figs"><div><span class="g-label">Citizens now</span><span class="g-fig">${n(now)}</span></div><div><span class="g-label">A home for</span><span class="g-fig">${n(p.people)}</span></div></div>
      <div class="g-part"><span class="g-label">Its land${lead ? ` · gives ${lead.gives}` : ''}</span><div class="bar">${land.map(([k, v]) => `<i style="width:${(v * 100).toFixed(1)}%;background:${COL[k]}"></i>`).join('')}</div>
        <div class="keys">${land.map(([k, v]) => `<span><em style="background:${COL[k]}"></em>${CITY.land[k].label} <b>${Math.round(v * 100)}%</b></span>`).join('')}</div></div>
      <dl class="g-part"><dt>Area</dt><dd>${(p.area / 1e6).toFixed(2)} km² · ${n(p.area / p.people)} m² each</dd>
        <dt>Lies</dt><dd>${Math.round(p.elev.mean)} m · ${Math.round(p.elev.min)} to ${Math.round(p.elev.max)} m</dd>
        <dt>Water</dt><dd>${p.river ? 'A river runs along it' : 'Away from the rivers'}</dd>
        <dt>From ${byId.get(1).name.split(' ')[0]}</dt><dd>${p.id === 1 ? 'Here' : km(p.dist)}</dd>
        <dt>Beside it</dt><dd>${beside.length} villages · ${openBeside.length} open</dd></dl>
      <div class="act g-part">${act}</div>`;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]'); if (!b) return;
    if (b.dataset.do === 'close') close();
    if (b.dataset.do === 'open' && shown) openPlot(shown);
  });
  return {
    show(p) { shown = p; el.hidden = !p; if (p) render(p); },
    refresh() { if (shown) render(shown); },
  };
}
