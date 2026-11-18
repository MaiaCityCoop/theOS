// The library's stage (intent 0038, stage 3): one fixed, flat spot in the meadow (STAGE in world/places.js), a round of
// bare ground in its middle, the subject on it, and the camera circling it under the studio's light. The library
// (src/library) and your person's page (src/me/stage.js) are both this, each with what it shows; the world under it is
// the stage's (src/boot.js: profile 'stage').
//
// The light: the day held at 11:00, and the key 45° to the camera's left and 40° up wherever the camera is (Rembrandt
// light), so the subject always turns under the same light. The camera: the game's one camera (src/camera/rig.js), held
// over the stage at a distance, circling by the clock; nearer than the rig hangs, it comes in along its own line to what
// it looks at, its lens stopped down as it comes, so the whole of a head or a hand stays sharp. A person on the stage
// moves on the same clock, turned to the eye when it waves, and is followed, eased, when it walks. A drag circles (and,
// on a person, moves what is looked at up and down them, as far as the pointer goes), the wheel comes closer.
//
//   createStudio(game, { orbit, near, far }) -> the studio: what the page sets (H, dist, pitch, yaw, spin, look, person,
//   line), and the stage's ground (round, sandbox) and what grows on it (grow)
import * as THREE from 'three/webgpu';
import { poseAt, heightFor } from '../camera/rig.js';
import { STAGE } from '../../world/places.js';
import { WALKER } from '../../world/scale.js';
import { heightAt, SAND } from '../world/land.js';
import { BIOMES, BASE } from '../world/biomes.js';
import { U } from '../core/uniforms.js';
import { settling } from '../core/settle.js';

/** The stage for the game (src/boot.js, profile 'stage'). orbit: the element a drag and the wheel are taken from; near,
    far: how near and how far the wheel brings the camera (m; near may be a function of the studio). */
export function createStudio(game, { orbit = document.getElementById('orbit'), near = 3, far = 1500 } = {}) {
  const cine = window.__cine, ground0 = heightAt(STAGE.x, STAGE.z), mid = [STAGE.x, STAGE.z], now = new THREE.Vector3();
  cine.fill = true;   // (it looks through the film camera's lens but is no film: its picture fills the window, upright on a phone too, with no black bars of the film's 16 : 9)
  game.sky.hold(11);   // the studio's day: one hour's light, held; the key light follows the camera (frame)
  const S = {
    /** How tall the subject is (m): the camera looks at its middle. */
    H: 1,
    /** The camera: how far from what it looks at (m), how far down it looks (radians), its turn round the stage, and
        whether it circles by itself (a drag stops it). */
    dist: 9, pitch: 0.32, yaw: 2.6, spin: true,
    /** What is looked at on a person, metres over the ground (null: their middle, as every subject's). */
    look: null,
    /** A person on the stage (characters/kit: { object, height, step }): moved by the studio's clock, and followed. */
    person: null,
    /** [x, z]: a line of things looked at square on from the walker's eyes, the camera's height its gold line (the
        library's lineup); null: the stage's subject, circled. */
    line: null,
    /** The stage's round of bare ground: r metres across its middle (0: none), laid in a material (its recipe or uid;
        none: the base biome's bare earth) at tile metres a tile. Read by the land's nodes (src/world/land.nodes.js). */
    round(r = STAGE.r, material = null, tile = 2) { U.uStage.value.set(STAGE.x, STAGE.z, r); U.uStageGround.value.set(material ? game.tex.layer(material) : -1, tile); },
    /** Round the stage the land is all one biome (its recipe: by default the base's, the meadow; null: the land as it is). */
    sandbox(biome = BASE) { const b = biome ? BIOMES.indexOf(biome) : -1; U.uSand.value.set(STAGE.x, STAGE.z, b < 0 ? 0 : 1, b); Object.assign(SAND, { on: b >= 0, x: STAGE.x, z: STAGE.z, river: !!BIOMES[b]?.water }); },
    /** What grows on the land round the stage (the meadow's grass, a biome's stones and trees): shown, or hidden (the
        world's own, started the first time it is asked for: src/boot.js). */
    grow: (on = true) => game.grow(on),
  };
  S.round(); S.sandbox();

  // the hand: a drag circles, the wheel comes closer
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), nearest = () => (typeof near === 'function' ? near(S) : near);
  orbit.onpointerdown = (e) => {
    S.spin = false; orbit.setPointerCapture(e.pointerId);
    orbit.onpointermove = (m) => {
      S.yaw -= m.movementX * 0.008; S.pitch = clamp(S.pitch + m.movementY * 0.006, 0.06, 1.35);
      if (S.person) S.look = clamp((S.look ?? S.H * 0.45) + m.movementY * 0.0008 * Math.min(6, S.dist), 0.03, S.person.height * 1.04);
    };
  };
  orbit.onpointerup = () => { orbit.onpointermove = null; };
  orbit.onwheel = (e) => { e.preventDefault(); S.dist = clamp(S.dist * Math.exp(e.deltaY * 0.001), nearest(), far); };

  let lastT = 0, followed = null;
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
    // the circling is by the clock, not the frame (a slow frame does not show as a jerk); it stands while something waits
    // for the world to settle (the page's first view, a still: src/core/settle.js), which it never would while moving
    if (S.spin && !settling()) S.yaw += dt * 0.15;
    const P = S.person;
    if (P) { const e = U.uCam.value; P.step(dt, { x: e.x - STAGE.x, z: e.z - STAGE.z }); }   // a person moves on the same clock, turned to the eye when it waves
    // Rembrandt light: the key 45° to the camera's left and 40° up, wherever the camera is (the sky's day held at 11:00)
    const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw), kx = sy - cy, kz = cy + sy, kl = Math.hypot(kx, kz), up = (40 * Math.PI) / 180;
    U.uSunDir.value.set((kx / kl) * Math.cos(up), Math.sin(up), (kz / kl) * Math.cos(up));
    // what the camera circles: a person where they are now (eased, so a walk is followed smoothly; from where they stand
    // when they come), a line's middle, or the stage's
    if (P) {
      const w = P.object.getWorldPosition(now), k = P === followed ? Math.min(1, dt * 3) : 1; followed = P;
      mid[0] += (w.x - mid[0]) * k; mid[1] += (w.z - mid[1]) * k;
    } else { followed = null; [mid[0], mid[1]] = S.line ?? [STAGE.x, STAGE.z]; }
    cine.aperture = 1.9;   // (the lens wide open, as ever; only a close look stops it down, below)
    if (S.line) {   // a line, square on from the walker's eyes (the wheel goes back, a drag turns): the gold line on the horizon
      cine.take({ pos: [mid[0] + Math.sin(S.yaw) * S.dist, ground0 + WALKER.eye + S.dist * Math.tan(S.pitch), mid[1] + Math.cos(S.yaw) * S.dist], look: [mid[0], ground0 + WALKER.eye, mid[1]], mm: 28 });
      return;
    }
    const ty = ground0 + (P && S.look != null ? S.look : S.H * 0.45);
    const p = poseAt(mid[0], mid[1], S.yaw, heightFor(mid[0], mid[1], S.yaw, Math.max(3, S.dist)));   // the game's one camera, held over the stage at this distance (intent 0003)
    // (nearer than the rig hangs, the camera comes in along its own line to what it looks at, its lens stopped down as it
    // comes, so the whole of a head or a hand stays sharp)
    const k = Math.min(1, S.dist / 3), pos = k < 1 ? [mid[0] + (p.pos[0] - mid[0]) * k, ty + (p.pos[1] - ty) * k, mid[1] + (p.pos[2] - mid[1]) * k] : p.pos;
    if (k < 1) cine.aperture = 1.9 + (1 - k) * 14;
    cine.take({ pos, look: [mid[0], ty, mid[1]], mm: 35 });
  }
  requestAnimationFrame(frame);
  return S;
}
