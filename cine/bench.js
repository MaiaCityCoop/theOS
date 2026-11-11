// The lens bench: the live world through one lens at a time. The bar at the bottom holds the kit;
// a lens puts the virtual camera on that lens's master shot, in the real, running world. From
// there the view can be turned and moved by hand, to judge and tune the land from every angle and
// distance; the lens's button (or R) goes back to the master.
import { masters, floor } from './trailer.js';
import { LENSES, hfov } from './lenses.js';

const cine = window.__cine, q = new URLSearchParams(location.search);
const list = masters(+(q.get('seed') || 1));
const bar = document.getElementById('lensbar'), info = document.getElementById('info');
let cur = Math.max(0, list.findIndex((m) => m.lens === q.get('lens')));
const v = { pos: [0, 0, 0], yaw: 0, pitch: 0 };   // where the hand has taken the camera
const keys = new Set();

function go(i) {
  cur = i; const m = list[i];
  cine.floor = floor;
  cine.take({ pos: m.pos, look: m.look, lens: m.lens, roll: 0 });
  requestAnimationFrame(() => { const w = cine.view; v.pos = w.pos.slice(); v.yaw = w.yaw; v.pitch = w.pitch; });
  bar.querySelectorAll('button').forEach((b, k) => b.classList.toggle('now', k === i));
  history.replaceState(null, '', `?lens=${m.lens}`);
}
list.forEach((m, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<b>${LENSES[m.lens].mm} mm</b><span>${m.name}</span><i>${hfov(LENSES[m.lens].mm).toFixed(1)}° wide</i>`;
  b.title = m.what; b.onclick = () => go(i);
  bar.append(b);
});

// the hand: drag turns, W A S D and Q E move, Shift faster, the wheel dollies
let drag = false, last = 0;
addEventListener('mousedown', (e) => { if (!e.target.closest('#panel, [data-menu]')) drag = true; });
addEventListener('mouseup', () => { drag = false; });
addEventListener('mousemove', (e) => {
  if (!drag) return;
  const k = 0.11 * (hfov(LENSES[list[cur].lens].mm) / 75);   // a long lens turns slowly
  v.yaw -= e.movementX * k; v.pitch = Math.max(-89, Math.min(89, v.pitch - e.movementY * k));
  cine.take({ pos: v.pos, yaw: v.yaw, pitch: v.pitch });
});
addEventListener('wheel', (e) => {
  if (e.altKey) cine.take({ focus: Math.max(0.3, cine.view.focus * Math.exp(-e.deltaY * 0.002)) });   // Alt: pull focus
  else move(-e.deltaY * 0.02, 0, 0);
}, { passive: true });
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'KeyR') go(cur); const d = e.code.match(/^Digit([1-9])$/); if (d && list[d[1] - 1]) go(d[1] - 1); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function move(f, s, u) {
  const y = (v.yaw * Math.PI) / 180, p = (v.pitch * Math.PI) / 180, sy = Math.sin(y), cy = Math.cos(y), cp = Math.cos(p);
  v.pos[0] += -sy * cp * f + cy * s; v.pos[2] += -cy * cp * f - sy * s; v.pos[1] += Math.sin(p) * f + u;
  cine.take({ pos: v.pos, yaw: v.yaw, pitch: v.pitch });
  v.pos = cine.view.pos.slice();
}
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), u = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
  if (f || s || u) { const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 30 : 4) * dt; move(f * sp, s * sp, u * sp); }
  const m = list[cur];
  info.textContent = `${LENSES[m.lens].name} · T${cine.aperture} · focus ${cine.view.focus.toFixed(1)} m   ${m.name}: ${m.what}   ·   drag turns · W A S D Q E move · wheel dollies · Alt+wheel pulls focus · R back to the master`;
}
go(cur); requestAnimationFrame(tick);
window.__bench = { list, go, get current() { return list[cur]; } };
