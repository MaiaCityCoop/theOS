// The game's one camera (intent 0003): a rig hung over a point on the ground, driven by one value, its height. At
// the walker's eyes it is first person (walk, look, go in at doors); higher up it hangs back from that point and looks
// down at it, a city-builder's camera (move, turn); at the top, the whole city. Every number of how it behaves at a
// height is in camera/rig.js; here only the mechanics. Walls, rocks and the ground stop it (src/world/solids.js).
import RIG from '../../camera/rig.js';
import { heightAt } from '../world.js';
import { step, ceilingAt, clear } from '../world/solids.js';

const L0 = Math.log(RIG.eye), L1 = Math.log(RIG.top);
const ease = (t) => t * t * (3 - 2 * t);
/** The rig's values at a height: each key's numbers, eased between keys over the height's logarithm. */
export function at(h) {
  const L = Math.log(h), K = RIG.keys; let i = 0;
  while (i < K.length - 2 && L > Math.log(K[i + 1].h)) i++;
  const a = K[i], b = K[i + 1], t = ease(Math.min(1, Math.max(0, (L - Math.log(a.h)) / (Math.log(b.h) - Math.log(a.h)))));
  const mix = (k) => a[k] + (b[k] - a[k]) * t;
  return { band: t < 0.5 ? a.band : b.band, pitch: a.pitch === null ? (b.pitch ?? 0) : mix('pitch'), free: a.pitch === null ? 1 - t : 0, fov: mix('fov'), speed: mix('speed'), run: mix('run'), orbit: mix('orbit') };
}

export function createControls(camera, canvas, msg) {
  const keys = new Set();
  let yaw = 0, look = -0.08, L = L0, locked = false, drag = false;
  const pivot = { x: 0, z: 0 };
  const hints = { eye: 'Click to look · WASD · Shift runs · scroll out to rise', street: 'Drag to turn · WASD · scroll in to walk, out to rise', town: 'Drag to turn · WASD moves · Q E turn · scroll in and out', skyline: 'Drag to turn · WASD moves · scroll in to come down' };
  let band = 'eye'; msg.textContent = hints.eye;
  addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousedown', () => {
    drag = true;
    if (!locked && band === 'eye') { try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); } catch {} }   // pointer lock only at eye level
  });
  addEventListener('mouseup', () => { drag = false; });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; msg.textContent = locked ? '' : hints[band]; });
  document.addEventListener('mousemove', (e) => {
    if (!locked && !drag) return;
    yaw -= e.movementX * 0.0022; look = Math.max(-1.5, Math.min(1.5, look - e.movementY * 0.0022));
  });
  canvas.addEventListener('wheel', (e) => {   // the one zoom: the height, from the eyes to the city
    e.preventDefault();
    L = Math.max(L0, Math.min(L1, L + e.deltaY * RIG.wheel * (e.deltaMode ? 30 : 1)));
    if (L > L0 + 0.05 && locked) document.exitPointerLock?.();
  }, { passive: false });
  camera.rotation.order = 'YXZ';
  let eyeY = null;
  return {
    get fly() { return band !== 'eye'; },
    get band() { return band; },
    get height() { return Math.exp(L); },
    set height(h) { L = Math.max(L0, Math.min(L1, Math.log(h))); },
    place(x, z, facing) { pivot.x = x; pivot.z = z; yaw = facing; L = L0; eyeY = null; },
    update(dt) {
      const h = Math.exp(L), v = at(h);
      if (v.band !== band) { band = v.band; if (!locked) msg.textContent = hints[band] || ''; }
      // move the point on the ground: by the keys, at this height's speed; on foot (low), walls and things stop it
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      yaw += ((keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0)) * 1.4 * dt;
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? v.run : v.speed, n = f && s ? 0.7071 : 1, sy = Math.sin(yaw), cy = Math.cos(yaw);
      const nx = pivot.x + (-sy * f + cy * s) * speed * n * dt, nz = pivot.z + (-cy * f - sy * s) * speed * n * dt;
      if (h < 4) [pivot.x, pivot.z] = step(pivot.x, pivot.z, nx, nz); else { pivot.x = nx; pivot.z = nz; }
      // the camera: at eye level the walker's eyes (stooping under a low roof); higher, hung back from the point
      const g = heightAt(pivot.x, pivot.z), stoop = Math.max(0.6, Math.min(RIG.eye, ceilingAt(pivot.x, pivot.z) - 0.25));
      const pitch = v.pitch * (1 - v.free) + look * v.free;
      const back = v.orbit * Math.max(0, h - RIG.eye) / Math.tan(Math.max(0.05, -pitch || 0.05));
      let cx = pivot.x + sy * back, cz = pivot.z + cy * back;
      if (back > 0.01) { const t = clear(pivot.x, pivot.z, cx, cz); cx = pivot.x + (cx - pivot.x) * t; cz = pivot.z + (cz - pivot.z) * t; }   // a wall between: come in front of it
      const y = Math.max(g + Math.min(h, stoop) + Math.max(0, h - RIG.eye), heightAt(cx, cz) + 0.5);   // never under the ground
      eyeY = eyeY === null || h > 2 ? y : eyeY + (y - eyeY) * Math.min(1, dt * 14);   // at eye level the eyes follow the ground, eased
      camera.position.set(cx, eyeY, cz);
      camera.rotation.set(pitch, yaw, 0);
      if (Math.abs(camera.fov - v.fov) > 1e-3) { camera.fov = v.fov; camera.updateProjectionMatrix(); }
    },
  };
}
