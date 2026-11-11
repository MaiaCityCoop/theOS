// First person: WASD, Shift to run, the mouse looks (click to lock it). F flies; Space / C rise and sink.
import { PLACES } from '../world/places.js';
import { heightAt, riverAt, aridAt } from '../world.js';
import { step, ceilingAt } from '../world/solids.js';

export function createControls(camera, canvas, msg) {
  const keys = new Set();
  let yaw = 0, pitch = -0.08, fly = false, locked = false, vy = 0;
  const idle = 'click (or drag) to look · WASD · Shift runs · F flies (Space / C up and down)';
  msg.textContent = idle;
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyF') fly = !fly;
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  let drag = false;
  canvas.addEventListener('mousedown', () => {
    drag = true;
    if (!locked) { try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); } catch {} }
  });
  addEventListener('mouseup', () => { drag = false; });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; msg.textContent = locked ? '' : idle; });
  document.addEventListener('mousemove', (e) => {
    if (!locked && !drag) return;
    yaw -= e.movementX * 0.0022; pitch -= e.movementY * 0.0022;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
  });
  camera.rotation.order = 'YXZ';
  return {
    get fly() { return fly; },
    place(x, z, facing) { camera.position.set(x, heightAt(x, z) + 1.7, z); yaw = facing; },
    update(dt) {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = fly ? (run ? 220 : 40) : (run ? 9 : 3.2);
      const n = f && s ? 0.7071 : 1, sy = Math.sin(yaw), cy = Math.cos(yaw), p = camera.position;
      const nx = p.x + (-sy * f + cy * s) * speed * n * dt, nz = p.z + (-cy * f - sy * s) * speed * n * dt;
      if (fly) { p.x = nx; p.z = nz; } else [p.x, p.z] = step(p.x, p.z, nx, nz);   // on foot, walls and things stop you; a door lets you in
      const ground = heightAt(p.x, p.z) + Math.max(0.6, Math.min(1.7, ceilingAt(p.x, p.z) - 0.25));   // under a low roof, you stoop
      if (fly) {
        vy = ((keys.has('Space') ? 1 : 0) - (keys.has('KeyC') ? 1 : 0)) * speed * 0.6;
        p.y = Math.max(ground, p.y + vy * dt);
      } else {
        p.y += (ground - p.y) * Math.min(1, dt * 14);   // the eye follows the ground, eased
      }
      camera.rotation.set(pitch, yaw, 0);
    },
  };
}

/** Where the walker starts: by the first tent (src/world/places.js), in front of its door, looking at it. The tent
    stands where story 01's film frames it, so the walker comes to it, not it to the walker. */
export function spawn(controls) {
  const t = PLACES.tent;
  if (t) {
    const dx = -Math.sin(t.yaw), dz = -Math.cos(t.yaw);   // the way its door looks (the door is towards -z in its own frame)
    controls.place(t.x + dx * 14, t.z + dz * 14, Math.atan2(dx, dz));   // 14 m out, facing back at it
    return;
  }
  spawnByRiver(controls);
}
/** The old start, kept for a world with no tent: on the bank of the nearest green stretch of river. */
function spawnByRiver(controls) {
  let x = 0, z = 0, found = false;
  for (let r = 0; r < 4000 && !found; r += 6) for (let a = 0; a < 6.283 && !found; a += 6 / (r + 6)) {
    x = Math.cos(a) * r; z = Math.sin(a) * r;
    if (riverAt(x, z).d < 4 && aridAt(x, z) < 0.05) found = true;
  }
  for (let i = 0; i < 12; i++) { const R = riverAt(x, z), g2 = R.gx * R.gx + R.gz * R.gz || 1e-9; x -= (R.r * R.gx) / g2; z -= (R.r * R.gz) / g2; } // onto the river's line
  const R = riverAt(x, z), gl = Math.hypot(R.gx, R.gz) || 1, nx = R.gx / gl, nz = R.gz / gl, off = R.w + 4;
  controls.place(x + nx * off - nz * 4, z + nz * off + nx * 4, Math.atan2(-(nz * 0.9 - nx * 0.45), -(-nx * 0.9 - nz * 0.45)));
}
