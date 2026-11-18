// The world, loading: which still of it the veil is laid over (brand.css, html.os-loading). Read before the first paint
// (a plain script in the page's head), so the still is there from the start: one of the tent's, chosen at random.
(() => {
  const STILLS = ['tent-morning', 'tent-midday', 'tent-evening', 'tent-snow', 'tent-pines'];
  const pick = STILLS[Math.floor(Math.random() * STILLS.length)];
  document.documentElement.style.setProperty('--os-load-still', `url('/brand/loading/${pick}.jpg')`);
})();

// A page that loses a file of its build (intent 0038): its code, a style or a worker of it, all named by their content
// (/assets/: a build's own, never another's in their place), and gone once the host serves a build two deploys newer
// (deploy/deploy.sh serves the one before too). The page cannot go on then, and waiting would leave it veiled for ever.
// So if the host serves another build now (the page, asked again, no longer names this one's entry), it reloads into
// it, once for this build; otherwise the veil says so, and stays (html.os-lost: src/ui/loading.js leaves it). What
// tells it: the browser, of a script or a stylesheet that did not load (the entry's error stands for every module it
// imports); Vite, of an import() that did not (vite:preloadError); the game, of a worker that could not start
// (os:lost, src/core/workers.js).
(() => {
  const root = document.documentElement;
  let lost = false;
  const lose = async (what) => {
    console.error(`[lost] ${what}`);
    if (lost) return;
    lost = true;
    const own = document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src');
    try {
      const page = await fetch(location.href, { cache: 'no-store' });
      if (own && page.ok && !(await page.text()).includes(own) && sessionStorage.getItem('os-reloaded') !== own) { sessionStorage.setItem('os-reloaded', own); location.reload(); return; }
    } catch {}   // (the host not answering, or no storage to keep the once in: said, not reloaded)
    const say = () => { root.classList.remove('os-loaded'); root.classList.add('os-loading', 'os-lost'); document.body.dataset.step = 'Could not load the game. Please reload.'; };
    if (document.body) say(); else addEventListener('DOMContentLoaded', say);
  };
  addEventListener('error', (e) => {
    const t = e.target, url = t instanceof HTMLScriptElement ? t.src : t instanceof HTMLLinkElement ? t.href : '';
    if (url && new URL(url).pathname.includes('/assets/')) lose(url);
  }, true);   // (a file's error does not bubble: seen on its way down)
  addEventListener('vite:preloadError', (e) => lose(e.payload?.message ?? 'an import'));
  addEventListener('os:lost', (e) => lose(e.detail));
})();
