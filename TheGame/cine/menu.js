// The game's pill, on every page opened on its own, as in the dashboard: Back, one large round home (the dashboard),
// and the city's badge (the front page). Framed inside the dashboard (?in=os) the dashboard has its own;
// as a picture (?embed) there is none.
const qs = new URLSearchParams(location.search);
if (qs.has('embed')) document.body.classList.add('embed');
if (qs.get('in') === 'os') document.body.classList.add('framed');
document.getElementById('hud')?.classList.add('glass');
const OS = import.meta.env.VITE_OS || `http://${location.hostname}:5180`;
const bar = document.createElement('nav');
bar.dataset.menu = '1'; bar.className = 'os-pill';
bar.innerHTML = `<a class="back" href="${OS}/#city"><svg viewBox="0 0 26 20"><path d="M24 10H3M10 2.5 2.5 10 10 17.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Back</a>` +
  `<a class="home" href="${OS}/#city" aria-label="Dashboard"></a><a class="badge" href="${OS}/" title="Maia City, the front page">MC</a>`;
bar.querySelector('.back').onclick = (e) => { if (history.length > 1 && document.referrer) { e.preventDefault(); history.back(); } };
document.body.append(bar);
