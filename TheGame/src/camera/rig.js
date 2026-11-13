// The game's one camera (intent 0003): a rig hung over a point on the ground, driven by one value, its height. At
// the walker's eyes it is first person (walk, look, go in at doors); higher up it hangs back from that point and looks
// down at it, a city-builder's camera (move, turn); at the top, the whole city. At every height it looks around
// (intent 0014): held mouse in POV (camera/rig.js: lock), a drag above it; the height sets where the camera stands and how it looks when left alone, the
// drag tilts the view from there. Every number of how it behaves at a
// height is in camera/rig.js; here only the mechanics. Walls, rocks and the ground stop it (src/world/solids.js).
import RIG from '../../camera/rig.js';
import { heightAt } from '../world/land.js';
import { step, ceilingAt, clear, within } from '../world/solids.js';
import { createTouch } from './touch.js';
import { Raycaster, Vector2 } from 'three/webgpu';
import { moverOnLine } from '../world/movers.js';

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

/** The height's own pitch (where it looks when left alone: ahead at eye level, down from above), and the pitch with a
    tilt of `look` on it, held within camera/rig.js's tilt. */
const own = (v) => v.pitch * (1 - v.free);
const tilted = (v, look) => Math.max(RIG.tilt.down, Math.min(RIG.tilt.up, own(v) + look));
/** How far the camera hangs back from its point at a height: by the height's own pitch, never the tilt, so looking
    up and down turns the view where the camera is and never moves it. */
const backAt = (v, h) => v.orbit * Math.max(0, h - RIG.eye) / Math.tan(Math.max(0.05, -own(v) || 0.05));

/** Where the camera stands and looks for a point on the ground, a heading, a height and a tilt up or down from that
    height's own pitch: the rig's one pose, for the game, the films and the library alike. { pos, pitch, yaw, fov } */
export function poseAt(x, z, yaw, h, look = 0) {
  const v = at(h), pitch = tilted(v, look);
  const back = backAt(v, h);
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
  let following = null, Lwant = null;   // the mover followed (src/world/movers.js) and the height the camera comes to behind it
  const pivot = { x: 0, z: 0 };
  const hints = { eye: 'Click to look · WASD · Shift runs · scroll out to rise', street: 'Click to look · WASD · scroll in to walk, out to rise', town: 'Drag to look around · WASD moves · Q E turn · scroll in and out', skyline: 'Drag to look around · WASD moves · scroll in to come down' };
  let band = 'eye';
  const hint = () => { msg.textContent = following ? `Following ${following.name || 'it'} · WASD or Esc lets go` : locked ? '' : hints[band] || ''; };   // the line under the pill: what the camera does now
  hint();
  addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && following) letGo(); });
  addEventListener('blur', () => keys.clear());
  // looking around at every height: in POV the mouse is held (a click takes it), above it a drag; left and right turns, up and down tilts
  let lockHere = true;
  const take = () => { if (!locked && lockHere) { try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); } catch {} } };   // only in a band that holds the mouse (camera/rig.js: lock)
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) drag = true; take(); });
  addEventListener('keydown', (e) => { if (/^(Key[WASDQE]|Arrow)/.test(e.code)) take(); });   // coming back down, a click or a key takes it again (a scroll cannot: the browser asks for a click or a key)
  addEventListener('mouseup', () => { drag = false; });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; hint(); });
  document.addEventListener('mousemove', (e) => {
    if (!locked && !drag) return;
    yaw -= e.movementX * RIG.tilt.drag; look -= e.movementY * RIG.tilt.drag;
  });
  // fingers: the same move, turn and look, and height, from a joystick, a drag and a pinch (src/camera/touch.js)
  const touch = createTouch(canvas, {
    look: (dyaw, dlook, turnOnly) => { yaw -= dyaw; if (!turnOnly) look -= dlook; },
    height: (dL) => { Lwant = null; L = Math.max(L0, Math.min(L1, L + dL)); },
  }).move;
  canvas.addEventListener('wheel', (e) => {   // the one zoom: the height, from the eyes to the city
    e.preventDefault(); Lwant = null;
    L = Math.max(L0, Math.min(L1, L + e.deltaY * RIG.wheel * (e.deltaMode ? 30 : 1)));
  }, { passive: false });
  // following (intent 0015): a click (not a drag) on something that moves hangs the camera behind it: where the mouse
  // is free, what is under the pointer; in POV, the mouse held, what is under the crosshair in the middle (it lights
  // when something there can be followed). It follows until a move key, Esc or a click on the bare ground. A click
  // that finds a mover is the follow's alone (the city's plots under it are not picked)
  const follow = (m) => {
    following = m;
    if (m) { Lwant = Math.log(Math.min(RIG.top, Math.max(RIG.eye, RIG.follow.h))); look = 0; }
    hint();
  };
  function letGo() { following = null; Lwant = null; hint(); }
  const ray = new Raycaster(), ndc = new Vector2();
  /** The mover on the line of sight through a point of the screen (the middle when the mouse is held), or null. */
  const moverAt = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(locked ? 0 : ((cx - r.left) / r.width) * 2 - 1, locked ? 0 : -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const o = ray.ray.origin, d = ray.ray.direction;
    return moverOnLine([o.x, o.y, o.z], [d.x, d.y, d.z], (RIG.follow.reach * 2 * Math.tan((camera.fov * Math.PI) / 360)) / innerHeight);   // (the reach in pixels, as metres a metre off)
  };
  let press = null;
  canvas.addEventListener('pointerdown', (e) => { press = e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, held: locked } : null; }, true);
  document.addEventListener('mousemove', (e) => { if (press) press.moved += Math.hypot(e.movementX, e.movementY); });
  canvas.addEventListener('pointerup', (e) => {
    // a click, not a drag that turns the view (held, the pointer stays put: what the mouse moved counts)
    if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5 || press.moved > 8 || performance.now() - press.t > 500) return;
    const held = press.held; press = null;
    const m = moverAt(e.clientX, e.clientY);
    if (m) { follow(m); e.stopImmediatePropagation(); } else if (following && !held) letGo();
  }, true);
  // the crosshair: only while the mouse is held; lit when what is under it can be followed (looked for a few times a second)
  const cross = document.createElement('div'); cross.className = 'rig-cross'; cross.hidden = true; document.body.append(cross);
  const crossStyle = document.createElement('style');
  crossStyle.textContent = `.rig-cross{position:fixed;left:50%;top:50%;z-index:3;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:rgba(255,255,255,.75);box-shadow:0 0 0 1px rgba(12,28,22,.35);pointer-events:none;transition:all .15s}
  .rig-cross.on{width:18px;height:18px;margin:-9px 0 0 -9px;background:transparent;border:2px solid #fff}`;
  document.head.append(crossStyle);
  let aimAt = 0;
  camera.rotation.order = 'YXZ';
  let eyeY = null, hPrev = RIG.eye, fromAbove = false, shown = '', glide = null, backNow = 0, LPrev = L;
  return {
    get fly() { return band !== 'eye'; },
    get band() { return band; },
    get height() { return Math.exp(L); },
    /** The mover followed (src/world/movers.js), or null; set it to follow one, null to let go. */
    get following() { return following; },
    set following(m) { if (m) follow(m); else letGo(); },
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
      if (v.band !== band) { band = v.band; hint(); }
      cross.hidden = !locked;
      if (locked && performance.now() - aimAt > 200) { aimAt = performance.now(); cross.classList.toggle('on', !!moverAt(0, 0)); }
      if (v.lock !== lockHere) { lockHere = v.lock; if (!lockHere && locked) document.exitPointerLock?.(); }   // up in town the mouse is free again
      // the tilt: kept through a small change of height, eased back to the height's own over a long one; never past the bounds
      look *= Math.exp(-RIG.tilt.fade * Math.abs(L - LPrev)); LPrev = L;
      look = Math.max(RIG.tilt.down - own(v), Math.min(RIG.tilt.up - own(v), look));
      // move the point on the ground: by the keys, at this height's speed; on foot (low), walls and things stop it
      let f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      let s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      f = Math.max(-1, Math.min(1, f + touch.y)); s = Math.max(-1, Math.min(1, s + touch.x));   // the joystick adds its push
      yaw += ((keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0)) * 1.4 * dt;
      // following: the point is the mover's, the camera swings round behind it and comes to its height; a move key lets go
      if (following && (f || s)) letGo();
      if (following) {
        const o = following.at();
        if (!o) letGo();
        else {
          pivot.x = o.x; pivot.z = o.z; glide = null;
          if (o.yaw != null) yaw += Math.atan2(Math.sin(o.yaw - yaw), Math.cos(o.yaw - yaw)) * Math.min(1, dt * RIG.follow.turn);
          if (Lwant != null) { L += (Lwant - L) * Math.min(1, dt * RIG.follow.come); if (Math.abs(Lwant - L) < 0.005) Lwant = null; }
        }
      }
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
      const pitch = tilted(v, look), back = backAt(v, h);
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
