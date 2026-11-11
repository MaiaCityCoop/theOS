// The virtual camera: a film camera inside the world, driven by an agent, not by hand. No keys, no
// readouts: only `window.__cine`. It holds the game's camera wherever it is told (any place, any
// angle, an anamorphic prime from 28 to 180 mm, framed 2.39 : 1) and plays a timeline of shots live in the real world.
// It needs nothing of the game but `window.__s8.camera`, so the same file shoots every stage of
// the build (cine/README.md).

import { LENSES, ANAMORPHIC } from './lenses.js';

const RAD = Math.PI / 180;
const S = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, mm: 35, fmt: ANAMORPHIC, lens: 'A35', focus: 10 };   // radians inside
let cam, on = false, eulerSet, last = 0;
let clips = [], starts = [], T = 0, t = 0, playing = false, stills = [], rec = null;
const pending = [];   // what was asked before the game's camera existed

const clampMm = (mm) => Math.max(28, Math.min(180, mm));   // between the primes only a zoom move passes
// three's fov is the vertical one, of the whole window. The lens fixes how wide the picture sees; where the
// window is wider than the picture's shape (bars left and right), it fixes how tall instead.
function vfov(mm) {
  const wa = cam?.aspect || 1.5, pa = S.fmt.aspect || wa;
  return (2 * Math.atan(S.fmt.w / 2 / mm / Math.max(wa, pa))) / RAD;
}

// ---- holding the camera against the game's own controls ----
function lock() {
  if (on) return; on = true;
  const p = cam.position;
  S.x = p.x; S.y = p.y; S.z = p.z; S.yaw = cam.rotation.y; S.pitch = cam.rotation.x; S.roll = 0;
  for (const k of ['x', 'y', 'z']) Object.defineProperty(p, k, { get: () => S[k], set() {}, configurable: true, enumerable: true });
  eulerSet = Object.getPrototypeOf(cam.rotation).set;
  cam.rotation.set = () => cam.rotation;
  cam.userData.fov0 = cam.fov;
}
function unlock() {
  if (!on) return; on = false; playing = false; frame();
  for (const k of ['x', 'y', 'z']) Object.defineProperty(cam.position, k, { value: S[k], writable: true, configurable: true, enumerable: true });
  delete cam.rotation.set; DOF.on = false;
  cam.fov = cam.userData.fov0; cam.updateProjectionMatrix();
}
function apply() {
  if (api.floor) S.y = Math.max(S.y, api.floor(S.x, S.z) + 0.15);   // never under the ground
  eulerSet.call(cam.rotation, S.pitch, S.yaw, S.roll, 'YXZ');
  const f = vfov(S.mm);
  if (Math.abs(cam.fov - f) > 1e-4) { cam.fov = f; cam.updateProjectionMatrix(); }
  // the lens, for the game's depth of field: always wide open
  DOF.on = api.dof; DOF.focus = S.focus; DOF.mm = S.mm; DOF.N = api.aperture; DOF.aspect = S.fmt.aspect; cam.userData.dof = DOF;
}
const DOF = { on: false, focus: 10, mm: 35, N: 1.9, aspect: 2.39 };
// a view: { pos: [x, y, z], look: [x, y, z] | yaw, pitch (degrees), roll (degrees), mm }
function aim(v) {
  if (v.pos) { S.x = v.pos[0]; S.y = v.pos[1]; S.z = v.pos[2]; }
  if (v.look) {
    const dx = v.look[0] - S.x, dy = v.look[1] - S.y, dz = v.look[2] - S.z;
    S.yaw = Math.atan2(-dx, -dz); S.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    S.focus = Math.hypot(dx, dy, dz);   // what the camera looks at is what it holds in focus
  } else { if (v.yaw != null) S.yaw = v.yaw * RAD; if (v.pitch != null) S.pitch = v.pitch * RAD; }
  if (v.focus != null) S.focus = v.focus;
  if (v.roll != null) S.roll = v.roll * RAD;
  if (v.lens && LENSES[v.lens]) { S.lens = v.lens; S.mm = LENSES[v.lens].mm; }
  else if (v.mm != null) { S.mm = clampMm(v.mm); S.lens = LENSES['A' + S.mm] ? 'A' + S.mm : ''; }
}

// ---- the timeline: clips cut one after the other; inside a clip the camera moves through its keys ----
// a clip: { name, kind, secs, ease, in, inSecs, out, keys: [{ pos, look, mm, roll }] }
//   ease: how the move starts and ends. 'inout' from rest to rest · 'in' from rest, leaves moving ·
//         'out' arrives moving, comes to rest · 'linear' moving through · 'soft' barely eased
//   in:   how the clip is cut in. 'cut' (the default) · 'dissolve' (the last frame of the shot before
//         melts into this one) · 'dip' (through the sky's colour); inSecs its length
//   out:  'dip' on the last clip fades the film out
// A cut on motion is a 'cut' between a clip that leaves moving and one that arrives moving.
function ease(kind, q) {
  if (kind === 'linear') return q;
  if (kind === 'soft') return q + (q * q * (3 - 2 * q) - q) * 0.5;
  const s0 = kind === 'out' ? 1.5 : 0, s1 = kind === 'in' ? 1.5 : 0, q2 = q * q, q3 = q2 * q;   // a curve with those speeds at its ends
  return (q3 - 2 * q2 + q) * s0 + (3 * q2 - 2 * q3) + (q3 - q2) * s1;
}
const P = [0, 0, 0], L = [0, 0, 0], V = { pos: P, look: L, roll: 0, mm: 35 };
function evalAt(time) {
  if (!clips.length) return;
  let i = clips.length - 1; while (i > 0 && starts[i] > time) i--;
  const c = clips[i], K = c.keys, n = K.length;
  let q = Math.max(0, Math.min(1, (time - starts[i]) / c.secs));
  q = ease(c.ease, q);
  if (n === 1) { aim(K[0]); return; }
  const f = q * (n - 1), j = Math.min(Math.floor(f), n - 2), u = f - j;
  const a = K[Math.max(j - 1, 0)], b = K[j], d = K[j + 1], e = K[Math.min(j + 2, n - 1)];
  for (let k = 0; k < 3; k++) {
    P[k] = cr(a.pos[k], b.pos[k], d.pos[k], e.pos[k], u);
    L[k] = cr(a.look[k], b.look[k], d.look[k], e.look[k], u);
  }
  V.roll = (b.roll || 0) + ((d.roll || 0) - (b.roll || 0)) * u;
  V.mm = Math.exp(Math.log(b.mm) + (Math.log(d.mm) - Math.log(b.mm)) * u);   // a zoom runs evenly in stops
  aim(V);
}
const cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

// ---- each frame: before the game draws, and right after ----
function pre(now) {
  if (!cam) { cam = window.__s8?.camera; if (!cam) return; while (pending.length) pending.shift()(); }
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  if (!on) return;
  if (playing) {
    t += dt;
    if (t >= T) { if (api.loop) t %= T; else { t = T; playing = false; if (rec) record(false); } }
    evalAt(t);
  }
  apply(); transitions(); frame();
}
// ---- transitions: a veil of the sky's colour (dip) and the frozen last frame of the shot before (dissolve) ----
let veil, frost, fctx, frozenFor = -1, bars = [];
function frame() { // the picture's shape: black where the lens's format leaves the window empty
  if (!bars.length) for (let i = 0; i < 2; i++) { const b = document.createElement('div'); b.style.cssText = 'position:fixed;background:#000;pointer-events:none;z-index:3;display:none'; document.body.append(b); bars.push(b); }
  const pa = on ? S.fmt.aspect : 0, wa = innerWidth / innerHeight;
  if (!pa || Math.abs(pa - wa) < 0.01) { bars[0].style.display = bars[1].style.display = 'none'; return; }
  const tb = pa > wa, size = tb ? (innerHeight - innerWidth / pa) / 2 : (innerWidth - innerHeight * pa) / 2;
  bars.forEach((b, i) => { b.style.display = 'block'; b.style.inset = tb ? (i ? `auto 0 0 0` : `0 0 auto 0`) : (i ? `0 0 0 auto` : `0 auto 0 0`); b.style.width = tb ? 'auto' : size + 'px'; b.style.height = tb ? size + 'px' : 'auto'; });
}
function overlays() {
  if (veil) return;
  veil = document.createElement('div'); frost = document.createElement('canvas'); fctx = frost.getContext('2d');
  for (const e of [frost, veil]) { e.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;opacity:0;z-index:2'; document.body.append(e); }
}
const clipAt = (time) => { let i = clips.length - 1; while (i > 0 && starts[i] > time) i--; return i; };
function transitions() {
  if (!veil || !clips.length) return;
  const i = clipAt(t), c = clips[i], n = clips[i + 1];
  let dip = 0;
  if (c.in === 'dip') { const d = c.inSecs || 1.2; dip = i === 0 ? 1 - (t - starts[i]) / d : 1 - (t - starts[i]) / (d / 2); }
  if (n?.in === 'dip') dip = Math.max(dip, 1 - (starts[i + 1] - t) / ((n.inSecs || 1.2) / 2));
  if (!n && c.out === 'dip') dip = Math.max(dip, 1 - (T - t) / 1.2);
  veil.style.background = api.dipColor; veil.style.opacity = Math.max(0, Math.min(1, dip));
  frost.style.opacity = frozenFor === i && c.in === 'dissolve' ? Math.max(0, 1 - (t - starts[i]) / (c.inSecs || 1)) : 0;
}
const grabs = [];
function post() {
  while (grabs.length) {
    const [w, r] = grabs.shift(), g = window.__s8.renderer.domElement, c = document.createElement('canvas');
    c.width = w; c.height = Math.round((w * g.height) / g.width); c.getContext('2d').drawImage(g, 0, 0, c.width, c.height); r(c);
  }
  if (playing && clips.length) { // the shot's last frames are kept, to melt into the next
    const i = clipAt(t), n = clips[i + 1];
    if (n?.in === 'dissolve' && starts[i + 1] - t < 0.05) {
      const g = window.__s8.renderer.domElement, w = Math.min(g.width, 1600), h = Math.round((w * g.height) / g.width);
      if (frost.width !== w || frost.height !== h) { frost.width = w; frost.height = h; }
      fctx.drawImage(g, 0, 0, w, h); frozenFor = i + 1;
    }
  }
  while (stills.length) stills.shift()(window.__s8.renderer.domElement.toDataURL('image/png'));
}
const ready = (fn) => (cam ? fn() : pending.push(fn));

function record(v) {
  if (!v) { rec?.stop(); return; }
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((x) => window.MediaRecorder?.isTypeSupported(x));
  if (!type) throw new Error('this browser records no video');
  const chunks = [], r = new MediaRecorder(window.__s8.renderer.domElement.captureStream(60), { mimeType: type, videoBitsPerSecond: 40e6 });
  r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  r.onstop = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type }));
    a.download = `sandbox8-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`; a.click(); rec = null;
  };
  r.start(); rec = r;
}

const api = (window.__cine = {
  lenses: LENSES,       // the kit: A28 … A180, the Master Anamorphic primes (cine/lenses.js)
  floor: null,          // (x, z) => the ground's height there; set, the camera never sinks under it
  loop: false,
  dof: true,            // depth of field, where the game can draw it
  aperture: 1.9,        // T1.9: the Master Anamorphics wide open, always
  dipColor: '#9fc2e6',  // what a 'dip' passes through: the sky
  /** Hold the camera at a view: { pos, look | yaw, pitch, roll, mm }. */
  take(view) { ready(() => { lock(); playing = false; aim(view); apply(); }); },
  /** Give the camera back to the walker. */
  release() { ready(unlock); },
  /** Load a timeline of clips; the camera stands on its first frame. */
  load(list) { for (const c of list) for (const k of c.keys) if (k.lens && LENSES[k.lens]) k.mm = LENSES[k.lens].mm;   // a key may name its lens
    clips = list; starts = []; T = 0; for (const c of list) { starts.push(T); T += c.secs; } t = 0; frozenFor = -1; ready(() => { overlays(); lock(); evalAt(0); apply(); }); },
  play() { ready(() => { lock(); if (t >= T) t = 0; playing = true; }); },
  pause() { playing = false; },
  /** Stand on the timeline's frame at `time` seconds. */
  seek(time) { t = Math.max(0, Math.min(T, time)); frozenFor = -1; ready(() => { lock(); evalAt(t); apply(); }); },
  /** The next drawn frame as a PNG data URL. */
  still() { return new Promise((r) => stills.push(r)); },
  /** Record the canvas to a video file until record(false), or until the timeline ends. */
  record,
  get time() { return t; }, get duration() { return T; }, get playing() { return playing; }, get clips() { return clips; }, get starts() { return starts; },
  get active() { return on; },
  /** Where the camera is now, in the units take() takes. */
  get view() { return { pos: [S.x, S.y, S.z], yaw: S.yaw / RAD, pitch: S.pitch / RAD, roll: S.roll / RAD, mm: S.mm, lens: S.lens, focus: S.focus }; },
  /** The next drawn frame as a small canvas, `width` pixels wide: for contact sheets. */
  grab(width = 480) { return new Promise((r) => grabs.push([width, r])); },
});

// ?cam=x,y,z,yaw,pitch,roll,mm : stand exactly there
const q = new URLSearchParams(location.search);
if (q.has('cam')) { const v = q.get('cam').split(',').map(Number); api.take({ pos: [v[0], v[1], v[2]], yaw: v[3] || 0, pitch: v[4] || 0, roll: v[5] || 0, mm: v[6] || 35, lens: q.get('lens') || undefined }); }   // &lens=A50 puts a lens of the kit on

// every frame of the game passes through the camera
const raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (cb) => raf((time) => { pre(time); cb(time); post(); });
