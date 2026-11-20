// How the walker moves among what is solid: every body of every world, whoever placed it (src/world/bodies.js: the
// tent's walls and doors and the fire pit's seats, the rocks, the trees' trunks and the shrubs' leaves, the stress
// stand's thicket and its herds), each by its own outline. Here only how a step goes; what is solid, and where, is
// the engine's. The camera (src/camera/rig.js) asks the same: where the eyes may stand, a line of sight, the way in.
import { pushOut, bodiesNear, want, within, ceilingAt, clear } from './bodies.js';
export { within, ceilingAt, clear };
const BODY = 0.3;   // how wide the walker is, from the middle: a step keeps this far off anything
const SUB = 0.25;   // no part of a step is longer than this: a long step (a slow frame, a run) goes in parts, so it cannot pass over a thin trunk or a wall

/** A step from (px, pz) to (x, z): where it really ends, kept out of every solid. Stopped short by something, it is
    tried again a little to either side, and the one that gets further the way that was asked is taken: a walker held
    against a rock or between two bushes goes round, as feet do. Where nothing gets him on (a pocket among things), he
    goes along what holds him and a little back, out of it, to the side he last took (kept for a moment: he does not
    swing to and fro). No step is longer than the one asked. */
let side = 1, sideAt = -1e9;
export function step(px, pz, x, z) {
  want(px, pz);   // (bodies are made round the walker: src/world/bodies.js wanted)
  const far = Math.hypot(x - px, z - pz), near = bodiesNear(px, pz, far + BODY + 3, true);   // (the bodies round the whole step, asked once)
  if (!near.length) return [x, z];
  if (far < 1e-4) return pushOut(x, z, BODY, 0.3, 1.8, 0.55, [px, pz], near);   // (standing still: out of what has come where he stands)
  const n = Math.ceil(far / SUB); let cx = px, cz = pz;
  for (let i = 0; i < n; i++) [cx, cz] = part(cx, cz, cx + (x - px) / n, cz + (z - pz) / n, near);
  return [cx, cz];
}
function part(px, pz, x, z, near) {
  const wx = x - px, wz = z - pz, want = Math.hypot(wx, wz), held = (r) => { const m = Math.hypot(r[0] - px, r[1] - pz); return m > want ? [px + ((r[0] - px) * want) / m, pz + ((r[1] - pz) * want) / m] : r; };   // (pushed out of a thing it may land further on than it stepped: no faster than he walks)
  const once = (qx, qz) => pushOut(qx, qz, BODY, 0.3, 1.8, 0.55, [px, pz], near);
  const q = once(x, z);
  const on = (r) => ((r[0] - px) * wx + (r[1] - pz) * wz) / want, turned = (a) => { const c = Math.cos(a), n = Math.sin(a); return once(px + wx * c - wz * n, pz + wx * n + wz * c); }, made = on(q);
  if (made > want * 0.35) return held(q);
  let best = q, most = made;
  for (const a of [0.9, -0.9, 1.5, -1.5]) {   // (half a right angle to either side, then nearly square: along what stops it)
    const r = turned(a), m = on(r) + Math.hypot(r[0] - px, r[1] - pz) * 0.25;   // (what gets on counts, and a little what moves at all: out of a corner)
    if (m > most + 1e-4) { most = m; best = r; }
  }
  if (most < want * 0.2) {   // a pocket: out of it sideways and back
    const now = performance.now(); if (now - sideAt > 2000) side = Math.hypot(...turned(1.9).map((v, i) => v - (i ? pz : px))) >= Math.hypot(...turned(-1.9).map((v, i) => v - (i ? pz : px))) ? 1 : -1;
    for (const sg of [side, -side]) for (const a of [1.9, 2.4]) { const r = turned(a * sg); if (Math.hypot(r[0] - px, r[1] - pz) > want * 0.6) { side = sg; sideAt = now; return held(r); } }
  }
  return held(best);
}
