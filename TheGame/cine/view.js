// The timeline view: the trailer's clips as a strip under the live world, a playhead, play and scrub.
// What it shows is the virtual camera moving through the real world as it plays; nothing is rendered ahead.
import { trailer, floor } from './trailer.js';

const cine = window.__cine, q = new URLSearchParams(location.search);
let seed = +(q.get('seed') || 1);
const storyId = q.get('story');             // ?story=<id>: an intent's story, ../Stories/<id>/timeline.json: its camera and its captions
let kept = storyId ? null : q.get('tl') || (q.has('seed') ? null : 'river-story'), keptClips = null, captions = [], story = null;   // ?tl=<name>: a kept timeline, cine/timelines/<name>.json, played as it was set
const COL = { wide: '#dbe8ea', drone: '#f6e1ba', medium: '#dfe7d8', close: '#f3d9c4', 'low angle': '#e6e2c4', 'top down': '#cfe2de', glide: '#dfe4c6', tele: '#ecdcc8', crane: '#e9e4d8' };   // the mark's colours, pale


const bar = document.getElementById('tl'), strip = document.getElementById('strip'), head = document.getElementById('head');
const why = document.getElementById('why');
const info = document.getElementById('info'), btn = document.getElementById('play');
function build() {
  cine.floor = floor; cine.loop = true;
  cine.load(keptClips || trailer(seed));
  strip.querySelectorAll('.clip').forEach((e) => e.remove());
  cine.clips.forEach((c, k) => {
    const e = document.createElement('div'); e.className = 'clip'; e.style.flex = c.secs; e.style.background = COL[c.kind] || '#888';
    const mm = c.keys[0].mm === c.keys[c.keys.length - 1].mm ? `${c.keys[0].mm} mm` : `${c.keys[0].mm}→${c.keys[c.keys.length - 1].mm} mm`;
    const cut = k === 0 ? (c.in === 'dip' ? 'fade in' : '') : c.in === 'dissolve' ? 'dissolve' : c.in === 'dip' ? 'dip' : 'cut';
    e.title = c.why || '';
    e.innerHTML = `<b>${cut ? cut + ' → ' : ''}${c.kind}</b><span>${c.name}</span><i>${mm} · ${c.secs} s</i>`;
    strip.append(e);
  });
  history.replaceState(null, '', storyId ? `?story=${storyId}` : kept ? `?tl=${kept}` : `?seed=${seed}`);
  strip.querySelectorAll('.cue').forEach((e) => e.remove());
  for (const c of captions) { const e = document.createElement('div'); e.className = 'cue ' + c.kind; e.style.left = (c.at / cine.duration) * 100 + '%'; e.style.width = (c.for / cine.duration) * 100 + '%'; strip.append(e); }
}
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
function tick() {
  requestAnimationFrame(tick);
  const d = cine.duration || 1, t = cine.time;
  head.style.left = (t / d) * 100 + '%';
  let i = cine.clips.length - 1; while (i > 0 && cine.starts[i] > t) i--;
  const c = cine.clips[i], v = cine.view;
  info.textContent = c ? `${fmt(t)} / ${fmt(d)}   ${c.act ? c.act.toUpperCase() + ' · ' : ''}shot ${i + 1}/${cine.clips.length}  ${c.name}   ${v.mm.toFixed(0)} mm   ${story ? 'story: ' + storyId : kept ? 'kept: ' + kept : 'seed ' + seed}` : '';
  why.textContent = c?.why || '';
  caption(t);
  btn.textContent = cine.playing ? '❚❚' : '▶';
  strip.querySelectorAll('.clip').forEach((e, k) => e.classList.toggle('now', k === i));
}
const toggle = () => (cine.playing ? cine.pause() : cine.play());
btn.onclick = toggle;
let scrub = false;
const seekTo = (e) => { const r = strip.getBoundingClientRect(); cine.seek(((e.clientX - r.left) / r.width) * cine.duration); };
strip.addEventListener('mousedown', (e) => { scrub = true; cine.pause(); seekTo(e); });
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
    if (c) { cap.textContent = c.text; if (c.kind === 'title' && c.over) cap.insertAdjacentHTML('afterbegin', `<small>${c.over}</small>`); }
  }
  if (c) cap.style.opacity = Math.min(1, (t - c.at) / (c.kind === 'title' ? 0.8 : 0.18), (c.at + c.for - t) / (c.kind === 'title' ? 0.8 : 0.18));   // a subtitle comes and goes at once; a title breathes
}
if (storyId) {
  story = await fetch(`/story/${storyId}/timeline.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (story) { keptClips = story.clips; captions = story.captions || []; document.title = `${story.title} · story`; }
}
if (kept) keptClips = await fetch(`/cine/timelines/${kept}.json`).then((r) => r.json()).catch(() => { kept = null; return null; });
build(); cine.play(); tick();
// keep what is loaded as cine/timelines/<name>.json (places rounded to the centimetre)
async function keep(name) {
  const r2 = (v) => v.map((x) => +x.toFixed(2));
  const clips = cine.clips.map((c) => ({ ...c, keys: c.keys.map((k) => ({ ...k, pos: r2(k.pos), look: r2(k.look) })) }));
  const res = await fetch(`/cine/keep?name=${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(clips) });
  if (!res.ok) throw new Error(await res.text());
  return `/timeline.html?tl=${name}`;
}
window.__timeline = { get seed() { return seed; }, set seed(v) { kept = keptClips = null; seed = v; build(); }, keep };
