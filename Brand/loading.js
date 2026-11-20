// The world, loading: which still of it the veil is laid over (brand.css, html.os-loading). Read before the first paint
// (a plain script in the page's head), so the still is there from the start: the tent's as the world about to show will
// be, by what this browser kept of it (TheGame/src/core/store.js, 'maia.' and its key): snow where snow lies or falls
// (TheGame/src/world/weather: snow, snowfall), else by its hour (TheGame/src/world/sky.js: sky.hour): the morning's
// before ten, the day's (the meadow, or under the pines) till five, the evening's after, and through the night; before
// any was kept, one of the day's (TheGame/world/clock.js opens on a day). (2026-11-19: one start in five showed the
// snow's over a green meadow, the world snow-white behind the veil as it was made, and green at Ready.) The stills lie
// beside this script (Brand/loading/), named from where it was served, as brand.css names its pictures: a page under a
// base (the game's dev server at /game) finds them there too.
(() => {
  const kept = (k) => { try { return JSON.parse(localStorage.getItem('maia.' + k)); } catch { return null; } };
  const hour = kept('sky.hour'), snowy = kept('snow') > 0 || kept('snowfall') > 0;
  const fits = snowy ? ['tent-snow'] : hour == null ? ['tent-morning', 'tent-midday', 'tent-pines'] : hour >= 5 && hour < 10 ? ['tent-morning'] : hour >= 10 && hour < 17 ? ['tent-midday', 'tent-pines'] : ['tent-evening'];
  const pick = fits[Math.floor(Math.random() * fits.length)], still = new URL(`loading/${pick}.jpg`, document.currentScript.src);
  document.documentElement.style.setProperty('--os-load-still', `url('${still.href}')`);
})();

// A page that cannot go on, or a start held up (intent 0038): said on the veil, on a line under the step, with what may
// help and a button that reloads (#os-stuck, brand.css). Two ways in:
//   os:lost   the page cannot go on: a file of its build that did not load (below), a worker of the game that could
//             not start (src/core/workers.js), the GPU taken from it (src/core/waits.js gpuLost). The veil comes back
//             if it had gone, and stays (html.os-lost: src/ui/loading.js leaves it)
//   os:stuck  the start is held: a part it waits for failed, or a worker has not started (src/core/waits.js); the line
//             goes once it comes (a detail of null), or with the veil
// A file of its build: its code, a style or a worker of it, all named by their content (/assets/: a build's own, never
// another's in their place), and gone once the host serves a build two deploys newer (Deploy/deploy.sh serves the one
// before too). If the host serves another build now (the page, asked again, no longer names this one's entry), the page
// reloads into it, once for this build; otherwise the line says which file, and that a blocker may be stopping it. What
// tells it: the browser, of a script or a stylesheet that did not load (the entry's error stands for every module it
// imports); Vite, of an import() that did not (vite:preloadError); the game, of a worker that could not start (os:lost
// with its name).
(() => {
  const root = document.documentElement;
  const BLOCKED = 'An ad or content blocker may be stopping it: allow this site, then reload.';
  let lost = false, line = null;
  const now = (f) => (document.body ? f() : addEventListener('DOMContentLoaded', f, { once: true }));
  // the line: what happened (and why, where the browser said), what may help, and Reload
  const show = (d) => now(() => {
    if (!d) { line?.remove(); line = null; return; }
    if (!line) {
      const reload = document.createElement('button');
      reload.type = 'button'; reload.textContent = 'Reload'; reload.addEventListener('click', () => location.reload());
      line = document.createElement('div'); line.id = 'os-stuck'; line.setAttribute('role', 'alert');
      line.append(document.createElement('p'), document.createElement('p'), reload);
      document.body.append(line);
    }
    const what = d.what.charAt(0).toUpperCase() + d.what.slice(1);
    line.children[0].textContent = d.why ? `${what}: ${d.why}` : `${what}.`;
    line.children[1].textContent = d.hint ?? '';
  });
  // the page cannot go on: the veil back over it, the step and the line saying what happened
  const stop = (step, d) => { lost = true; now(() => { root.classList.remove('os-loaded'); root.classList.add('os-loading', 'os-lost'); document.body.dataset.step = step; delete document.body.dataset.count; document.getElementById('os-detail')?.remove(); }); show(d); };   // (the step alone: how many were made, and which, no longer say anything)
  const nameOf = (what) => { try { return /[/:]/.test(what) ? decodeURIComponent(new URL(what, location.href).pathname.split('/').pop()) || what : what; } catch { return what; } };   // (a file by its own name)
  const lose = async (what) => {
    console.error(`[lost] ${what}`);
    if (lost) return;
    lost = true;
    const own = document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src');
    try {
      const page = await fetch(location.href, { cache: 'no-store' });
      if (own && page.ok && !(await page.text()).includes(own) && sessionStorage.getItem('os-reloaded') !== own) { sessionStorage.setItem('os-reloaded', own); location.reload(); return; }
    } catch {}   // (the host not answering, or no storage to keep the once in: said, not reloaded)
    stop('Could not load the game', { what: `could not load ${nameOf(what)}`, hint: BLOCKED });
  };
  addEventListener('error', (e) => {
    const t = e.target, url = t instanceof HTMLScriptElement ? t.src : t instanceof HTMLLinkElement ? t.href : '';
    if (url && new URL(url).pathname.includes('/assets/')) lose(url);
  }, true);   // (a file's error does not bubble: seen on its way down)
  addEventListener('vite:preloadError', (e) => lose(e.payload?.message ?? 'an import'));
  addEventListener('os:lost', (e) => { const d = e.detail; if (!d || typeof d === 'string') lose(d || 'a file'); else { console.error(`[lost] ${d.what}: ${d.why ?? ''}`); stop('The game stopped', d); } });
  addEventListener('os:stuck', (e) => { if (!lost) show(e.detail); });
})();
