// The virtual camera: one free film camera for every stage of the build. It depends on nothing of
// the game but `window.__s8.camera`, so the same file shoots any commit (see cine/README.md).
// V turns it on. It takes the picture over from the walker: any place, any angle, lenses 12–180 mm.

const SENSOR_W = 36;                        // full frame, 36 mm wide: a lens frames the same width in any window
const LENSES = [12, 18, 24, 35, 50, 85, 135, 180];
const S = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, mm: 35 };
const keys = new Set();
let cam, on = false, locked = false, drag = false, last = 0;
let seqs = [{ name: 'scratch', secs: 5, keys: [] }], si = 0;   // sequences of keyframes; the first is yours
let play = null, stillWanted = false, rec = null, bars = false, clean = false;

const fovOf = (mm) => (2 * Math.atan(SENSOR_W / 2 / mm / (cam?.aspect || 1.5)) * 180) / Math.PI;   // three's fov is the vertical one
const hfov = (mm) => (2 * Math.atan(SENSOR_W / 2 / mm) * 180) / Math.PI;
const seq = () => seqs[si];

// ---- taking the camera over: its place and its turn are held against the game's own controls ----
let eulerSet;
function lock() {
  const p = cam.position;
  S.x = p.x; S.y = p.y; S.z = p.z; S.yaw = cam.rotation.y; S.pitch = cam.rotation.x; S.roll = 0;
  for (const k of ['x', 'y', 'z']) Object.defineProperty(p, k, { get: () => S[k], set() {}, configurable: true, enumerable: true });
  eulerSet = Object.getPrototypeOf(cam.rotation).set;
  cam.rotation.set = () => cam.rotation;
  cam.userData.fov0 = cam.fov;
}
function unlock() {
  for (const k of ['x', 'y', 'z']) Object.defineProperty(cam.position, k, { value: S[k], writable: true, configurable: true, enumerable: true });
  delete cam.rotation.set;
  cam.fov = cam.userData.fov0; cam.updateProjectionMatrix();
}
function apply() {
  eulerSet.call(cam.rotation, S.pitch, S.yaw, S.roll, 'YXZ');
  const f = fovOf(S.mm);
  if (Math.abs(cam.fov - f) > 1e-4) { cam.fov = f; cam.updateProjectionMatrix(); }
}
function toggle(v = !on) {
  if (v === on || !cam) return;
  on = v; if (on) { lock(); apply(); } else { unlock(); play = null; }
  ui();
}

// ---- keyframes ----
const key = () => ({ x: +S.x.toFixed(3), y: +S.y.toFixed(3), z: +S.z.toFixed(3), yaw: +S.yaw.toFixed(4), pitch: +S.pitch.toFixed(4), roll: +S.roll.toFixed(4), mm: +S.mm.toFixed(1) });
function at(K, u) { // the camera at u along the keys: places on a smooth curve, turns and lens eased
  const n = K.length, i = Math.min(Math.floor(u), n - 2), t = u - i;
  const a = K[Math.max(i - 1, 0)], b = K[i], c = K[i + 1], d = K[Math.min(i + 2, n - 1)];
  const cr = (k) => 0.5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t * t * t);
  const e = t * t * (3 - 2 * t), l = (k) => b[k] + (c[k] - b[k]) * e;
  S.x = cr('x'); S.y = cr('y'); S.z = cr('z'); S.yaw = l('yaw'); S.pitch = l('pitch'); S.roll = l('roll');
  S.mm = Math.exp(Math.log(b.mm) + (Math.log(c.mm) - Math.log(b.mm)) * e);
}
function startPlay(done) {
  const K = seq().keys; if (!K.length) return;
  toggle(true);
  if (K.length === 1) { Object.assign(S, K[0]); return; }
  play = { t: 0, T: (K.length - 1) * seq().secs, done };
}

// ---- each frame, before the game draws ----
function pre(now) {
  if (!cam) { cam = window.__s8?.camera; if (cam) boot(); else return; }
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  if (!on) return;
  if (play) {
    play.t += dt; const K = seq().keys, q = Math.min(play.t / play.T, 1), e = q * q * (3 - 2 * q);
    at(K, e * (K.length - 1));
    if (q >= 1) { const d = play.done; play = null; d?.(); ui(); }
  } else {
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), u = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    const v = 6 * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8 : 1) * (keys.has('AltLeft') || keys.has('AltRight') ? 0.15 : 1) * dt;
    const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
    S.x += (-sy * cp * f + cy * s) * v; S.z += (-cy * cp * f - sy * s) * v; S.y += (sp * f + u) * v;
    S.roll += ((keys.has('KeyX') ? 1 : 0) - (keys.has('KeyZ') ? 1 : 0)) * dt * 0.5;
  }
  apply();
  if (hud && !clean) hud.textContent = text();
}
// ---- and right after it has drawn ----
function post() {
  if (!stillWanted || !cam) return;
  stillWanted = false;
  canvas().toBlob((b) => save(b, `sandbox8-${stamp()}-${Math.round(S.mm)}mm.png`), 'image/png');
}

// ---- stills and film ----
const canvas = () => window.__s8.renderer.domElement;
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
function record(v = !rec) {
  if (!v) { rec?.stop(); return; }
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((t) => window.MediaRecorder?.isTypeSupported(t));
  if (!type) { console.warn('[cine] this browser records no video'); return; }
  const chunks = [], r = new MediaRecorder(canvas().captureStream(60), { mimeType: type, videoBitsPerSecond: 40e6 });
  r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  r.onstop = () => { save(new Blob(chunks, { type }), `sandbox8-${seq().name}-${stamp()}.${type.includes('mp4') ? 'mp4' : 'webm'}`); rec = null; ui(); };
  r.start(); rec = r; ui();
}

// ---- what is on screen ----
let hud, barEls = [];
function text() {
  const d = (r) => ((r * 180) / Math.PI).toFixed(1);
  return `CINE  ${S.mm.toFixed(0)} mm  (${hfov(S.mm).toFixed(1)}° wide)${rec ? '  ● REC' : ''}${play ? '  ▶' : ''}\n` +
    `${S.x.toFixed(1)}, ${S.y.toFixed(1)}, ${S.z.toFixed(1)}   yaw ${d(S.yaw)}  pitch ${d(S.pitch)}  roll ${d(S.roll)}\n` +
    `shot "${seq().name}"  ${seq().keys.length} keys  ${seq().secs} s each\n` +
    `WASD QE move · Shift fast · Alt slow · 1–8 lens · wheel zoom · Z X roll · 0 level\n` +
    `B key · Backspace undo · P play · [ ] shot · , . seconds · O export · Enter still · R record · L bars · H clean · V off`;
}
function ui() {
  if (!hud) return;
  hud.style.display = on && !clean ? 'block' : 'none';
  const h0 = document.getElementById('hud'), m0 = document.getElementById('msg');
  if (h0) h0.style.visibility = on && clean ? 'hidden' : ''; if (m0) m0.style.visibility = on ? 'hidden' : '';
  // 2.39 : 1 bars
  const h = Math.max(0, (innerHeight - innerWidth / 2.39) / 2);
  barEls.forEach((b) => { b.style.display = on && bars ? 'block' : 'none'; b.style.height = h + 'px'; });
}
function boot() {
  hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:8px;bottom:8px;color:#fff;background:rgba(0,0,0,.5);padding:6px 8px;border-radius:6px;white-space:pre;font:11px/1.4 ui-monospace,Menlo,monospace;pointer-events:none;z-index:9;display:none';
  document.body.append(hud);
  for (const side of ['top', 'bottom']) { const b = document.createElement('div'); b.style.cssText = `position:fixed;left:0;right:0;${side}:0;background:#000;z-index:8;display:none;pointer-events:none`; document.body.append(b); barEls.push(b); }
  addEventListener('resize', ui);
  // shots kept with the code, the same for every stage: cine/shots.json
  fetch('/cine/shots.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((list) => {
    try { const mine = JSON.parse(localStorage.getItem('s8.cine.scratch') || 'null'); if (mine) seqs[0] = mine; } catch {}
    seqs = seqs.concat(list);
    const q = new URLSearchParams(location.search);
    if (q.has('cam')) { // ?cam=x,y,z,yaw°,pitch°,roll°,mm
      const v = q.get('cam').split(',').map(Number); toggle(true);
      Object.assign(S, { x: v[0], y: v[1], z: v[2], yaw: ((v[3] || 0) * Math.PI) / 180, pitch: ((v[4] || 0) * Math.PI) / 180, roll: ((v[5] || 0) * Math.PI) / 180, mm: v[6] || 35 });
    }
    if (q.has('shot')) { const i = seqs.findIndex((s) => s.name === q.get('shot')); if (i >= 0) { si = i; toggle(true); Object.assign(S, seq().keys[0] || {}); } }
    if (q.has('clean')) clean = true;
    if (q.has('bars')) bars = true;
    if (q.has('play') && q.has('shot')) setTimeout(() => { if (q.has('rec')) record(true); startPlay(() => q.has('rec') && record(false)); }, 1500);
    ui();
  });
}

// ---- hands ----
addEventListener('keydown', (e) => {
  if (e.code === 'KeyV') { toggle(); return; }
  if (!on) return;
  keys.add(e.code);
  const d = e.code.match(/^Digit([1-8])$/);
  if (d) S.mm = LENSES[d[1] - 1];
  else if (e.code === 'Digit0') S.roll = 0;
  else if (e.code === 'KeyB') { seq().keys.push(key()); if (si === 0) localStorage.setItem('s8.cine.scratch', JSON.stringify(seq())); }
  else if (e.code === 'Backspace') { seq().keys.pop(); if (si === 0) localStorage.setItem('s8.cine.scratch', JSON.stringify(seq())); }
  else if (e.code === 'KeyP') { if (play) play = null; else startPlay(); }
  else if (e.code === 'BracketRight') { si = (si + 1) % seqs.length; if (seq().keys[0]) Object.assign(S, seq().keys[0]); }
  else if (e.code === 'BracketLeft') { si = (si + seqs.length - 1) % seqs.length; if (seq().keys[0]) Object.assign(S, seq().keys[0]); }
  else if (e.code === 'Period') seq().secs = Math.min(60, seq().secs + 1);
  else if (e.code === 'Comma') seq().secs = Math.max(1, seq().secs - 1);
  else if (e.code === 'KeyO') { const j = JSON.stringify(seq()); console.log('[cine] shot\n' + j); navigator.clipboard?.writeText(j).catch(() => {}); }
  else if (e.code === 'Enter') stillWanted = true;
  else if (e.code === 'KeyR') record();
  else if (e.code === 'KeyL') bars = !bars;
  else if (e.code === 'KeyH') clean = !clean;
  ui();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('mousedown', () => { drag = true; });
addEventListener('mouseup', () => { drag = false; });
document.addEventListener('pointerlockchange', () => { locked = !!document.pointerLockElement; });
document.addEventListener('mousemove', (e) => {
  if (!on || play || !(locked || drag)) return;
  const k = 0.0022 * (hfov(S.mm) / 90);     // a long lens turns as slowly as it sees narrowly
  S.yaw -= e.movementX * k; S.pitch = Math.max(-1.55, Math.min(1.55, S.pitch - e.movementY * k));
});
addEventListener('wheel', (e) => { if (on && !play) S.mm = Math.max(12, Math.min(180, S.mm * Math.exp(-e.deltaY * 0.0015))); }, { passive: true });

// every frame of the game now passes through the camera: before it draws, and after
const raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (cb) => raf((t) => { pre(t); cb(t); post(t); });
window.__cine = { S, toggle, startPlay, record, get seqs() { return seqs; } };
