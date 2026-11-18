// The eye's view, for the scatter: what stands outside it is dropped one by one, before its vertices are worked out. A
// tier draws the patches that touch the view, but a patch is tens to hundreds of metres wide: about half of what stands
// in those patches is outside it. An engine's `live` asks inView(pos, …); its tier then keys its packing on the view
// too (tier.viewKeyed), so it is made again when the camera has turned. The view is widened by MARGIN, and the packing
// made again when the camera has turned by about a third of that (TURN, of its quaternion): nothing pops in at the edge.
import { vec4, abs, length } from 'three/tsl';
import { U } from '../core/uniforms.js';

const MARGIN = (5 * Math.PI) / 180, TURN = 0.015;

/** The camera's view written to the shared uniforms (uView, uViewK); returns what of it a packing depends on (a key). */
export function setView(camera) {
  const e = camera.projectionMatrix.elements, M = camera.matrixWorldInverse.elements, q = camera.quaternion, r = (x) => Math.round(x / TURN);
  const k = 1 / Math.tan(Math.min(1.5, Math.atan(1 / e[0]) + MARGIN));   // the widened view's half angle across, as a cotangent
  U.uView.value.copy(camera.matrixWorldInverse); U.uViewK.value.set(k, Math.abs(M[6]) + Math.abs(M[4]), Math.hypot(k, 1));   // (then how far the view is tilted off level, and the side plane's length)
  return `${r(q.x)},${r(q.y)},${r(q.z)},${r(q.w)},${e[0].toFixed(2)}`;
}

/** True where a thing standing at pos (x, z), r metres round and up to `high` tall, can be in the eye's view (to the sides:
    the land's rise and its own height are allowed for above and below, more the more the view is tilted). */
export const inView = (pos, r, high = 0) => {
  const v = U.uView.mul(vec4(pos.x, U.uCam.y.sub(U.uAirH), pos.y, 1)), far = length(pos.sub(U.uCam.xz));
  return abs(v.x).mul(U.uViewK.x).add(v.z).lessThan(far.mul(0.32).add(6 + high).mul(U.uViewK.y).add(r).mul(U.uViewK.z));
};
