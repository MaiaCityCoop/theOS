// Your person on the library's stage (me.html, intent 0024): a fixed flat spot in the meadow (world/places.js, STAGE),
// the person the card chooses (card.js, the event `me:person`) built by the human kit (characters/kit/human.js) a
// moment after the last change, and the camera circling them under the library's studio light.
// The world (src/main.js) is loaded from here, not by the page: the card (card.js) must never wait for it, and a
// build would otherwise run the world's chunk, which waits for the GPU, before the card.
import * as THREE from 'three/webgpu';
import { recipes } from '../core/registry.js';
import { BIOMES, BASE } from '../world/biomes.js';
import { poseAt, heightFor } from '../camera/rig.js';
import { STAGE } from '../../world/places.js';
import { heightAt } from '../world/land.js';
import { humanOf } from '../../characters/kit/human.js';
import { personOf } from '../../characters/kit/avatar.js';

const SETTLER = recipes('character').find((c) => c.uid === '944dc52a-5094-480c-9396-5ceedbbf03b1');   // characters/settler.js: the cloth and the moves a person wears

await import('../main.js');
while (!window.__game?.U || !window.__game?.ground || !window.__game?.sky) await new Promise((r) => setTimeout(r, 50));
window.__game.sky.hold(11);   // one day's light, held; the key light follows the camera (frame)
const { scene, U, ground, tex } = window.__game, cine = window.__cine;
ground.stage(STAGE.x, STAGE.z, STAGE.r); ground.sandbox(STAGE.x, STAGE.z, BIOMES.indexOf(BASE));   // round the stage, the land is all meadow

let person = null, staged = null, built = null, H = 2.2, timer = 0;
function stage({ avatar, name, move }) {
  const key = JSON.stringify([avatar, name]);
  if (key !== built) {
    const P = humanOf(tex, personOf(avatar, SETTLER, name));
    if (staged) { scene.remove(staged); person.mesh.geometry.dispose(); person.material?.dispose?.(); }
    staged = new THREE.Group(); staged.position.set(STAGE.x, heightAt(STAGE.x, STAGE.z), STAGE.z); staged.add(P.object); scene.add(staged);
    P.setMove(person?.move ?? 'idle'); P.step(0); person = P; built = key; H = P.height * 1.25;
  }
  person.setMove(move);
}
const want = (w) => { clearTimeout(timer); timer = setTimeout(() => stage(w), 90); };
document.addEventListener('me:person', (e) => want(e.detail));
if (window.__mePerson) want(window.__mePerson);

// the camera: circling the person, as in the library
let yaw = 2.6, pitch = 0.2, dist = 4.2, spin = true, lastT = 0;
const orbit = document.getElementById('orbit');
orbit.onpointerdown = (e) => { spin = false; orbit.setPointerCapture(e.pointerId); orbit.onpointermove = (m) => { yaw -= m.movementX * 0.008; pitch = Math.max(0.06, Math.min(1.35, pitch + m.movementY * 0.006)); }; };
orbit.onpointerup = () => { orbit.onpointermove = null; };
orbit.onwheel = (e) => { e.preventDefault(); dist = Math.max(2.2, Math.min(40, dist * Math.exp(e.deltaY * 0.001))); };
const ground0 = heightAt(STAGE.x, STAGE.z), mid = [STAGE.x, STAGE.z], whereNow = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now;
  if (spin) yaw += dt * 0.15;   // by the clock, not the frame
  if (person) { const e = U.uCam.value; person.step(dt, { x: e.x - STAGE.x, z: e.z - STAGE.z }); }   // turned to the eye when it waves
  // Rembrandt light: the key 45° to the camera's left and 40° up, wherever the camera is
  const sy = Math.sin(yaw), cy = Math.cos(yaw), kx = sy - cy, kz = cy + sy, kl = Math.hypot(kx, kz), up = 40 * Math.PI / 180;
  U.uSunDir.value.set((kx / kl) * Math.cos(up), Math.sin(up), (kz / kl) * Math.cos(up));
  // a walk goes round the stage: the camera follows the person, eased
  if (person) { const w = person.object.getWorldPosition(whereNow), k = Math.min(1, dt * 3); mid[0] += (w.x - mid[0]) * k; mid[1] += (w.z - mid[1]) * k; }
  const p = poseAt(mid[0], mid[1], yaw, heightFor(mid[0], mid[1], yaw, dist));   // the game's one camera, held over the stage (intent 0003)
  cine.take({ pos: p.pos, look: [mid[0], ground0 + H * 0.45, mid[1]], mm: 35 });
}
requestAnimationFrame(frame);
