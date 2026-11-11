// The game's one camera (intent 0003): a rig hung over a point on the ground, driven by one value, its height. At
// the walker's eyes it is first person (walk, look, go in at doors); higher up it hangs back from that point and looks
// down at it, a city-builder's camera (move, turn); at the top, the whole city. Every number of how it behaves at a
// height is in camera/rig.js; here only the mechanics. Walls, rocks and the ground stop it (src/world/solids.js).
import RIG from '../../camera/rig.js';
import { heightAt } from '../world.js';
import { step, ceilingAt, clear, within } from '../world/solids.js';
import { createTouch } from './touch.js';

const L0 = Math.log(RIG.eye), L1 = Math.log(RIG.top);
const ease = (t) => t * t * (3 - 2 * t);
/** The rig's values at a height: each key's numbers, eased between keys over the height's logarithm. */
export function at(h) {
  const L = Math.log(h), K = RIG.keys; let i = 0;
  while (i < K.length - 2 && L > Math.log(K[i + 1].h)) i++;
  const a = K[i], b = K[i + 1], t = ease(Math.min(1, Math.max(0, (L - Math.log(a.h)) / (Math.log(b.h) - Math.log(a.h)))));
  const mix = (k) => a[k] + (b[k] - a[k]) * t;
  return { band: t < 0.5 ? a.band : b.band, lock: t < 0.5 ? a.lock : b.lock, pitch: a.pitch === null ? (b.pitch ?? 0) : mix('pitch'), free: a.pitch === null ? 1 - t : 0, fov: mix('fov'), speed: mix('speed'), run: mix('run'), orbit: mix('orbit') };
}

/** Where the camera stands and looks for a point on the ground, a heading, a height and (at eye level) a look up or
    down: the rig's one pose, for the game, the films and the library alike. { pos, pitch, yaw, fov } */
export function poseAt(x, z, yaw, h, look = 0) {
  const v = at(h), pitch = v.pitch * (1 - v.free) + look * v.free;
  const back = v.orbit * Math.max(0, h - RIG.eye) / Math.tan(Math.max(0.05, -pitch || 0.05));
  const cx = x + Math.sin(yaw) * back, cz = z + Math.cos(yaw) * back;
  return { pos: [cx, Math.max(heightAt(x, z) + h, heightAt(cx, cz) + 0.5), cz], pitch, yaw, fov: v.fov, back, v };
}

/** A film's shot by the rig (intent 0003): { at: [x, z], height, yaw, look?, mm? } as the pose cine takes. */
export function shotAt({ at: [x, z], height, yaw = 0, look = 0, mm = 35 }) {
  const p = poseAt(x, z, yaw, height, look), c = Math.cos(p.pitch);
  return { pos: p.pos, look: [p.pos[0] - Math.sin(p.yaw) * c * 50, p.pos[1] + Math.sin(p.pitch) * 50, p.pos[2] - Math.cos(p.yaw) * c * 50], mm };
}
/** The rig's height for a distance from its point: the library holds the rig over its stage at a distance. */
export function heightFor(x, z, yaw, dist) {
  let lo = Math.log(RIG.eye), hi = Math.log(RIG.top * 3);
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, p = poseAt(x, z, yaw, Math.exp(m)), d = Math.hypot(p.pos[0] - x, p.pos[1] - heightAt(x, z), p.pos[2] - z); if (d < dist) lo = m; else hi = m; }
  return Math.exp((lo + hi) / 2);
}

/** The camera's height as words and a scale bar: '40 m · town', and how many metres a bar of px pixels spans. */
export function scaleAt(camera, x, z, px = 48) {
  const d = camera.position.distanceTo({ x, y: heightAt(x, z), z }), mPerPx = (2 * d * Math.tan((camera.fov * Math.PI) / 360)) / innerHeight;
  const raw = mPerPx * px, p10 = 10 ** Math.floor(Math.log10(raw)), nice = [1, 2, 5, 10].map((k) => k * p10).find((k) => k >= raw * 0.75) || 10 * p10;
  return { metres: nice, px: nice / mPerPx };
}
const fmt = (m) => (m >= 1000 ? `${+(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : m >= 10 ? `${Math.round(m)} m` : `${+m.toFixed(1)} m`);

export function createControls(camera, canvas, msg, stat) {
  const keys = new Set();
  let yaw = 0, look = -0.08, L = L0, locked = false, drag = false;
  const pivot = { x: 0, z: 0 };
  const hints = { eye: 'Click to look · WASD · Shift runs · scroll out to rise', street: 'Click to look · WASD · scroll in to walk, out to rise', town: 'Drag to turn · WASD moves · Q E turn · scroll in and out', skyline: 'Drag to turn · WASD moves · scroll in to come down' };
  let band = 'eye'; msg.textContent = hints.eye;
  addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  let lockHere = true;
  const take = () => { if (!locked && lockHere) { try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); } catch {} } };   // only in a band that holds the mouse (camera/rig.js: lock)
  canvas.addEventListener('mousedown', () => { drag = true; take(); });
  addEventListener('keydown', (e) => { if (/^(Key[WASDQE]|Arrow)/.test(e.code)) take(); });   // coming back down, a click or a key takes it again (a scroll cannot: the browser asks for a click or a key)
  addEventListener('mouseup', () => { drag = false; });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; msg.textContent = locked ? '' : hints[band]; });
  document.addEventListener('mousemove', (e) => {
    if (!locked && !drag) return;
    yaw -= e.movementX * 0.0022; look = Math.max(-1.5, Math.min(1.5, look - e.movementY * 0.0022));
  });
  // fingers: the same move, turn and look, and height, from a joystick, a drag and a pinch (src/camera/touch.js)
  const touch = createTouch(canvas, {
    look: (dyaw, dlook, turnOnly) => { yaw -= dyaw; if (!turnOnly) look = Math.max(-1.5, Math.min(1.5, look - dlook)); },
    height: (dL) => { L = Math.max(L0, Math.min(L1, L + dL)); },
  }).move;
  canvas.addEventListener('wheel', (e) => {   // the one zoom: the height, from the eyes to the city
    e.preventDefault();
    L = Math.max(L0, Math.min(L1, L + e.deltaY * RIG.wheel * (e.deltaMode ? 30 : 1)));
  }, { passive: false });
  camera.rotation.order = 'YXZ';
  let eyeY = null, hPrev = RIG.eye, fromAbove = false, shown = '', glide = null, backNow = 0;
  return {
    get fly() { return band !== 'eye'; },
    get band() { return band; },
    get height() { return Math.exp(L); },
    set height(h) { L = Math.max(L0, Math.min(L1, Math.log(h))); },
    place(x, z, facing) { pivot.x = x; pivot.z = z; yaw = facing; L = L0; eyeY = null; },
    update(dt) {
      const h = Math.exp(L), v = at(h);
      // into things by their doors: coming down from above into something's walls lands before its door, facing in;
      // rising from inside something that is left by its door goes out of the door first (its walls: src/world/solids.js)
      if (h > 6) fromAbove = true;
      // a thing left by its door (leave: 'door') is also come into by it: the point glides to before its door, never jumps;
      // a thing left through its roof (the tent) is come into from above, where you are
      if (h < 3 && hPrev >= 3 && fromAbove) { const w = within(pivot.x, pivot.z); if (w?.leave === 'door') glide = { ...w.door, t: 0 }; fromAbove = false; }
      if (h >= 2 && hPrev < 2) { const w = within(pivot.x, pivot.z); if (w?.leave === 'door') glide = { ...w.door, t: 0 }; }
      if (glide) { glide.t = Math.min(1, glide.t + dt * 1.6); const k = glide.t * glide.t * (3 - 2 * glide.t); pivot.x += (glide.x - pivot.x) * k; pivot.z += (glide.z - pivot.z) * k; if (glide.t >= 1) glide = null; }
      if (h < 2) fromAbove = false;
      hPrev = h;
      if (v.band !== band) { band = v.band; if (!locked) msg.textContent = hints[band] || ''; }
      if (v.lock !== lockHere) { lockHere = v.lock; if (!lockHere && locked) document.exitPointerLock?.(); }   // up in town the mouse is free again
      // move the point on the ground: by the keys, at this height's speed; on foot (low), walls and things stop it
      let f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      let s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      f = Math.max(-1, Math.min(1, f + touch.y)); s = Math.max(-1, Math.min(1, s + touch.x));   // the joystick adds its push
      yaw += ((keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0)) * 1.4 * dt;
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.run ? v.run : v.speed, n = Math.max(1, Math.hypot(f, s)) > 1 ? 1 / Math.hypot(f, s) : 1, sy = Math.sin(yaw), cy = Math.cos(yaw);
      const nx = pivot.x + (-sy * f + cy * s) * speed * n * dt, nz = pivot.z + (-cy * f - sy * s) * speed * n * dt;
      if (h < 4) {   // on foot: walls and rocks stop you, and ground too steep to walk up (camera/rig.js: climb); along it you slide
        const up = (ax, az, bx, bz) => { const rise = heightAt(bx, bz) - heightAt(ax, az), run = Math.hypot(bx - ax, bz - az); return rise <= RIG.stepUp * Math.min(1, run / 0.3) || rise / Math.max(run, 1e-6) <= RIG.climb; };
        const [qx, qz] = step(pivot.x, pivot.z, nx, nz);
        if (up(pivot.x, pivot.z, qx, qz)) { pivot.x = qx; pivot.z = qz; }
        else { const [ax, az] = step(pivot.x, pivot.z, qx, pivot.z), [bx, bz] = step(pivot.x, pivot.z, pivot.x, qz); if (up(pivot.x, pivot.z, ax, az)) { pivot.x = ax; pivot.z = az; } else if (up(pivot.x, pivot.z, bx, bz)) { pivot.x = bx; pivot.z = bz; } }
      } else { pivot.x = nx; pivot.z = nz; }
      // the camera: at eye level the walker's eyes (stooping under a low roof); higher, hung back from the point
      const g = heightAt(pivot.x, pivot.z), stoop = Math.max(0.6, Math.min(RIG.eye, ceilingAt(pivot.x, pivot.z) - 0.25));
      const pitch = v.pitch * (1 - v.free) + look * v.free;
      const back = v.orbit * Math.max(0, h - RIG.eye) / Math.tan(Math.max(0.05, -pitch || 0.05));
      let cx = pivot.x + sy * back, cz = pivot.z + cy * back;
      let want = back; if (back > 0.01 && h < 60) want = back * clear(pivot.x, pivot.z, cx, cz);   // a wall between: come in front of it
      backNow = want < backNow ? want : backNow + (want - backNow) * Math.min(1, dt * 3);   // in at once (never see through a wall), back out gently
      if (back > 0.01) { cx = pivot.x + sy * backNow; cz = pivot.z + cy * backNow; }
      const y = Math.max(g + Math.min(h, stoop) + Math.max(0, h - RIG.eye), heightAt(cx, cz) + 0.5);   // never under the ground
      eyeY = eyeY === null || h > 2 ? y : eyeY + (y - eyeY) * Math.min(1, dt * 14);   // at eye level the eyes follow the ground, eased
      camera.position.set(cx, eyeY, cz);
      camera.rotation.set(pitch, yaw, 0);
      if (Math.abs(camera.fov - v.fov) > 1e-3) { camera.fov = v.fov; camera.updateProjectionMatrix(); }
      if (stat) {   // the stat pill at the top: the height, its band, a scale bar
        const sc = scaleAt(camera, pivot.x, pivot.z), txt = `${fmt(h)} · ${band}|${fmt(sc.metres)}|${Math.round(sc.px)}`;
        if (txt !== shown) { shown = txt; stat.innerHTML = `<b>${fmt(h)}</b><span>${band}</span><i style="width:${Math.round(sc.px)}px"></i><span>${fmt(sc.metres)}</span>`; }
      }
    },
  };
}
