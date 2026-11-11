// The timeline view: a film's controls under the live world. The film is drawn as a line, one
// stretch per shot, its acts named under it; a sun is the playhead; play, and scrub by the line.
// What it shows is the virtual camera moving through the real world as it plays; nothing is rendered ahead.
import { trailer, floor } from './trailer.js';

const cine = window.__cine, q = new URLSearchParams(location.search), BASE = import.meta.env.BASE_URL.replace(/\/$/, '');   // '/game' inside the dashboard's server
let seed = +(q.get('seed') || 1);
const storyId = q.get('story');             // ?story=<id>: an intent's story, ../Stories/<id>/timeline.json: its camera and its captions
let kept = storyId ? null : q.get('tl') || (q.has('seed') ? null : 'river-story'), keptClips = null, captions = [], story = null;   // ?tl=<name>: a kept timeline, cine/timelines/<name>.json, played as it was set

const $ = (id) => document.getElementById(id);
const track = $('track'), segs = $('segs'), cues = $('cues'), head = $('head'), acts = $('acts'), btn = $('play');
const lensOf = (c) => { const a = c.keys[0].mm, b = c.keys[c.keys.length - 1].mm; return a === b ? `${a} mm` : `${a} → ${b} mm`; };
const cutOf = (c, k) => (k === 0 ? (c.in === 'dip' ? 'fades in' : 'opens') : c.in === 'dissolve' ? 'dissolve' : c.in === 'dip' ? 'through the sky' : 'cut');
function build() {
  cine.floor = floor; cine.loop = true;
  cine.load(keptClips || trailer(seed));
  // the film as a line: one stretch per shot, as long as the shot
  segs.innerHTML = cine.clips.map((c, k) => `<div class="seg ${k ? c.in || 'cut' : c.in || ''}" style="flex:${c.secs}" title="${k + 1} · ${c.name} · ${lensOf(c)} · ${c.secs} s · ${cutOf(c, k)}"><u></u></div>`).join('');
  // the acts, each under its shots
  const groups = [];
  for (const c of cine.clips) { const g = groups[groups.length - 1]; if (g && g.act === (c.act || '')) { g.secs += c.secs; g.n++; } else groups.push({ act: c.act || '', secs: c.secs, n: 1 }); }
  acts.innerHTML = groups.map((g) => `<span style="flex:${g.secs};margin-right:${(g.n - 1) * 0}px" data-act="${g.act}">${g.act}</span>`).join('');
  cues.innerHTML = captions.map((c) => `<div class="cue" style="left:${(c.at / cine.duration) * 100}%;width:${(c.for / cine.duration) * 100}%"></div>`).join('');
  history.replaceState(null, '', (storyId ? `?story=${storyId}` : kept ? `?tl=${kept}` : `?seed=${seed}`) + (q.has('in') ? `&in=${q.get('in')}` : '') + (q.has('embed') ? '&embed' : ''));
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// While the film plays the governor is held: it settles in the first two seconds, then its dials stay put. Paused, it may move again.
let since = 0;
function hold() { const g = window.__s8?.governor; if (!g) return; if (!cine.playing) { since = 0; g.hold(false); return; } if (!since) since = performance.now(); g.hold(performance.now() - since > 2000); }
let lastI = -1, lastSec = -1, lastCap = -2;
const embedded = document.body.classList.contains('embed');   // as a picture: its own controls are hidden, so they are not kept up
function tick() {
  requestAnimationFrame(tick); hold();
  const d = cine.duration || 1, t = cine.time;
  caption(t);
  if (embedded) return;   // nothing else on this page is seen: no work, no garbage, every frame
  head.style.left = (t / d) * 100 + '%';
  let i = cine.clips.length - 1; while (i > 0 && cine.starts[i] > t) i--;
  const c = cine.clips[i];
  if (!c) return;
  const els = segs.children;
  if (els[i]) els[i].firstChild.style.width = ((t - cine.starts[i]) / c.secs) * 100 + '%';   // only the running shot's bar moves
  if (i !== lastI) {
    lastI = i;
    for (let k = 0; k < els.length; k++) { els[k].classList.toggle('now', k === i); els[k].firstChild.style.width = k < i ? '100%' : k > i ? '0' : els[k].firstChild.style.width; }
    $('act').textContent = `${i + 1} / ${cine.clips.length}`;
    $('shot').textContent = c.name; $('lens').textContent = `${c.kind} · ${lensOf(c)}`; $('why').textContent = c.why || '';
    acts.querySelectorAll('span').forEach((s) => s.classList.toggle('now', s.dataset.act === (c.act || '')));
  }
  const sec = Math.floor(t); if (sec !== lastSec) { lastSec = sec; $('time').innerHTML = `<b>${fmt(t)}</b> / ${fmt(d)}`; }   // the clock's text changes once a second, so it is written once a second
  const on = cine.playing; if (on !== tick.on) { tick.on = on; btn.classList.toggle('on', on); }
}
const toggle = () => (cine.playing ? cine.pause() : cine.play());
btn.onclick = toggle;
let scrub = false;
const seekTo = (e) => { const r = track.getBoundingClientRect(); cine.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * cine.duration); };
track.addEventListener('mousedown', (e) => { scrub = true; cine.pause(); seekTo(e); });
addEventListener('mousemove', (e) => scrub && seekTo(e));
addEventListener('mouseup', () => { scrub = false; });
addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); toggle(); } });

// captions: the documentary lines of a story, over the picture, each for its stretch of the film
const cap = document.getElementById('cap');
let shown = null;
function caption(t) {
  let c = null; for (const k of captions) if (t >= k.at && t < k.at + k.for) c = k;
  if (c !== shown) {
    shown = c; cap.className = c ? 'on ' + c.kind : '';
    if (c) { cap.textContent = c.text; if (c.kind === 'title' && c.over) cap.insertAdjacentHTML('afterbegin', `<small>${c.over}</small>`); cap.dataset.who = { samuel: 'Samuel', maia: 'Maia' }[c.kind] || ''; }
  }
  if (c) { const o = Math.min(1, (t - c.at) / (c.kind === 'title' ? 0.8 : 0.18), (c.at + c.for - t) / (c.kind === 'title' ? 0.8 : 0.18)).toFixed(2); if (o !== lastCap) { lastCap = o; cap.style.opacity = o; } }   // a subtitle comes and goes at once; a title breathes. Written only when it changes
}
if (storyId) {
  story = await fetch(`${BASE}/story/${storyId}/timeline.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (story) { keptClips = story.clips; captions = story.captions || []; document.title = `${story.title} · story`; }
}
if (kept) keptClips = await fetch(`${BASE}/cine/timelines/${kept}.json`).then((r) => r.json()).catch(() => { kept = null; return null; });
build(); cine.play(); tick();
// keep what is loaded as cine/timelines/<name>.json (places rounded to the centimetre)
async function keep(name) {
  const r2 = (v) => v.map((x) => +x.toFixed(2));
  const clips = cine.clips.map((c) => ({ ...c, keys: c.keys.map((k) => ({ ...k, pos: r2(k.pos), look: r2(k.look) })) }));
  const res = await fetch(`${BASE}/cine/keep?name=${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(clips) });
  if (!res.ok) throw new Error(await res.text());
  return `${BASE}/timeline.html?tl=${name}`;
}
// the story's preview picture, taken again from the live scene at the camera the story names ("preview": pos, look, mm)
async function preview() {
  if (!story?.preview) throw new Error('this story names no preview camera');
  const k = { pos: story.preview.pos, look: story.preview.look, mm: story.preview.mm || 28 };
  cine.load([{ name: 'preview', kind: 'wide', secs: 30, ease: 'inout', keys: [k, k] }]); cine.seek(5); cine.play();
  await new Promise((r) => setTimeout(r, 3000)); cine.pause();
  const { renderer, scene, camera } = window.__s8, g = renderer.domElement; renderer.render(scene, camera);
  const c = document.createElement('canvas'); c.width = 1600; c.height = Math.round((1600 * g.height) / g.width); c.getContext('2d').drawImage(g, 0, 0, c.width, c.height);
  const res = await fetch(`${BASE}/story-preview?id=${storyId}`, { method: 'POST', body: c.toDataURL('image/jpeg', 0.86) });
  build(); cine.play(); return res.text();
}
window.__timeline = { get seed() { return seed; }, set seed(v) { kept = keptClips = null; seed = v; build(); }, keep, preview };

// In a frame (the dashboard's story editor): say what is playing, keep the frame told of the time, and take its
// play, pause, seek, and a request for one still from the middle of every shot, for the editor's picture track.
if (parent !== window) {
  const send = (m) => parent.postMessage({ maia: 1, ...m }, '*');
  const film = () => send({ type: 'film', duration: cine.duration, clips: cine.clips.map((c) => ({ name: c.name, secs: c.secs, act: c.act || '', kind: c.kind })), captions });
  film();
  setInterval(() => send({ type: 'time', t: cine.time, playing: cine.playing }), 80);
  let busy = false;
  addEventListener('message', async (ev) => {
    const m = ev.data || {}; if (!m.maia) return;
    if (m.cmd === 'play') cine.play(); if (m.cmd === 'pause') cine.pause(); if (m.cmd === 'seek') cine.seek(m.t); if (m.cmd === 'film') film();
    if (m.cmd === 'preview') send({ type: 'preview', ok: await preview().then(() => true, () => false) });
    if (m.cmd === 'thumbs' && !busy) {
      busy = true; const was = cine.playing, at = cine.time; cine.pause();
      for (let i = 0; i < cine.clips.length; i++) {
        cine.seek(cine.starts[i] + cine.clips[i].secs * 0.5); cine.play();      // the picture is only drawn while it runs
        await new Promise((r) => setTimeout(r, 300)); cine.pause();   // a moment, so the ground has filled in
        const { renderer, scene, camera } = window.__s8, g = renderer.domElement;
        renderer.render(scene, camera);                       // drawn now and copied in the same moment, before the browser clears it
        const c = document.createElement('canvas'); c.width = 360; c.height = Math.round((360 * g.height) / g.width);
        c.getContext('2d').drawImage(g, 0, 0, c.width, c.height); const src = c.toDataURL('image/jpeg', 0.75); send({ type: 'thumb', i, src });
        if (storyId) fetch(`${BASE}/story-shot?id=${storyId}&i=${i}`, { method: 'POST', body: src }).catch(() => {});   // kept with the story: taken once
      }
      cine.seek(at); if (was || at < 0.5) cine.play(); busy = false;   // a film that had not begun yet plays on
    }
  });
}
