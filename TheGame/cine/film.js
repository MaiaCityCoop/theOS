// The film page's start (timeline.html): what it has to load for what it is to play. A film of the live world loads the
// game (the camera films it as it runs). A scene of footage alone (no shot of it is a `world` shot) loads no game at all:
// no world is made, no shader compiled, the GPU is the video's; a small clock stands in for the camera's.
const q = new URLSearchParams(location.search), id = q.get('scene');
const scene = id ? await fetch(`/api/scenes/${id}/scene.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
window.__scene = scene;   // (the viewer reads it from here: fetched once)
const world = !scene || scene.tracks.some((t) => t.kind === 'shots' && t.clips.some((c) => c.world));

/** The film's clock without a camera: the part of cine's own that a viewer uses (load, play, pause, seek, time). */
function clock() {
  let clips = [], starts = [], T = 0, t = 0, playing = false, last = performance.now();
  const api = { loop: true, floor: null,
    load(list) { clips = list; starts = []; T = 0; for (const c of list) { starts.push(T); T += c.secs; } t = 0; },
    play() { if (t >= T) t = 0; playing = true; }, pause() { playing = false; }, seek(x) { t = Math.max(0, Math.min(T, x)); },
    get time() { return t; }, get duration() { return T; }, get playing() { return playing; }, get clips() { return clips; }, get starts() { return starts; } };
  const tick = (now) => { requestAnimationFrame(tick); const dt = Math.min((now - last) / 1000, 0.1); last = now; if (!playing) return; t += dt; if (t >= T) { if (api.loop) t %= T; else { t = T; playing = false; } } };
  requestAnimationFrame(tick);
  return api;
}

if (world) { await import('./cine.js'); await import('./menu.js'); import('../src/main.js'); }   // (the game starts beside the viewer, as before: it is not waited for)
else { window.__cine = clock(); document.body.classList.add('footage'); await import('./menu.js'); (await import('../src/ui/loading.js')).loadingDone(); }
await import('./view.js');
