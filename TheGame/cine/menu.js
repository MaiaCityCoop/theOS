// The game's pill, on every page opened on its own, as in the dashboard: Home (the dashboard), the large round star (the intents),
// and the city's badge (the front page). Framed inside the dashboard (?in=os) the dashboard has its own;
// as a picture (?embed) there is none.
const qs = new URLSearchParams(location.search);
if (qs.has('embed')) document.body.classList.add('embed');
if (qs.get('in') === 'os') document.body.classList.add('framed');
document.getElementById('hud')?.classList.add('glass');
const OS = import.meta.env.VITE_OS || (import.meta.env.BASE_URL === '/game/' ? '' : `http://${location.hostname}:5180`);   // one server: the dashboard is this origin's root
const bar = document.createElement('nav');
bar.dataset.menu = '1'; bar.className = 'os-pill glass';
bar.innerHTML = `<a class="back" href="${OS}/#city" aria-label="Home, the dashboard"><svg viewBox="0 0 24 22"><path d="M3 10.5 12 3l9 7.5M5.5 8.5V19h4.5v-5.5h4V19h4.5V8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>` +
  `<a class="home" href="${OS}/#intents" aria-label="Intents"></a><a class="badge" href="${OS}/" title="Maia City, the front page">MC</a>`;
document.body.append(bar);
