// The timeline view: the trailer's clips as a strip under the live world, a playhead, play and scrub.
// What it shows is the virtual camera moving through the real world as it plays; nothing is rendered ahead.
import { trailer, floor } from './trailer.js';

const cine = window.__cine, q = new URLSearchParams(location.search);
let seed = +(q.get('seed') || 1);
let kept = q.get('tl'), keptClips = null;   // ?tl=<name>: a kept timeline, cine/timelines/<name>.json, played as it was set
const COL = { wide: '#5b8def', drone: '#e0a43a', medium: '#59b56b', close: '#d9655f', 'low angle': '#a678d8', 'top down': '#3fb7b0', glide: '#8aa13c', tele: '#c7709f', crane: '#7d8796' };

const bar = document.getElementById('tl'), strip = document.getElementById('strip'), head = document.getElementById('head');
const info = document.getElementById('info'), btn = document.getElementById('play');
function build() {
  cine.floor = floor; cine.loop = true;
  cine.load(keptClips || trailer(seed));
  strip.querySelectorAll('.clip').forEach((e) => e.remove());
  cine.clips.forEach((c) => {
    const e = document.createElement('div'); e.className = 'clip'; e.style.flex = c.secs; e.style.background = COL[c.kind] || '#888';
    const mm = c.keys[0].mm === c.keys[c.keys.length - 1].mm ? `${c.keys[0].mm} mm` : `${c.keys[0].mm}→${c.keys[c.keys.length - 1].mm} mm`;
    e.innerHTML = `<b>${c.kind}</b><span>${c.name}</span><i>${mm} · ${c.secs} s</i>`;
    strip.append(e);
  });
  history.replaceState(null, '', kept ? `?tl=${kept}` : `?seed=${seed}`);
}
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
function tick() {
  requestAnimationFrame(tick);
  const d = cine.duration || 1, t = cine.time;
  head.style.left = (t / d) * 100 + '%';
  let i = cine.clips.length - 1; while (i > 0 && cine.starts[i] > t) i--;
  const c = cine.clips[i], v = cine.view;
  info.textContent = c ? `${fmt(t)} / ${fmt(d)}   shot ${i + 1}/${cine.clips.length}  ${c.kind} · ${c.name}   ${v.mm.toFixed(0)} mm   ${kept ? 'kept: ' + kept : 'seed ' + seed}` : '';
  btn.textContent = cine.playing ? '❚❚' : '▶';
  strip.querySelectorAll('.clip').forEach((e, k) => e.classList.toggle('now', k === i));
}
const toggle = () => (cine.playing ? cine.pause() : cine.play());
btn.onclick = toggle;
document.getElementById('next').onclick = () => { if (kept) { kept = keptClips = null; } else seed++; const p = cine.playing; build(); if (p) cine.play(); };
let scrub = false;
const seekTo = (e) => { const r = strip.getBoundingClientRect(); cine.seek(((e.clientX - r.left) / r.width) * cine.duration); };
strip.addEventListener('mousedown', (e) => { scrub = true; cine.pause(); seekTo(e); });
addEventListener('mousemove', (e) => scrub && seekTo(e));
addEventListener('mouseup', () => { scrub = false; });
addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); toggle(); } });

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
