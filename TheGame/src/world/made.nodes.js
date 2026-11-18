// How a made thing moves in the wind and takes the light, on the GPU. It is said once for both who draw one: the one
// drawer's list (src/scatter/placed.js: what stands at a spot of its own) and a thing of its own (src/world/place.js:
// the library's stage, the WebGL fallback). Its numbers are its kind's (assets/kinds.js: wind, surface, snow), as JS
// numbers or as nodes.
import { float, uint, normalize, max, clamp, length, smoothstep, sin } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { lit, weathered, snowCover, snowLift, snowDepth } from './light.js';
import { vnoise } from './noise.nodes.js';
import { fireLight } from './fire.js';

/** p, its place in its own frame (metres, its foot at 0), moved by the wind: pushed downwind with the gust (billow) and
    fluttering along its normal n (flap), held still at the ground and along its middle, moving most halfway up and
    out; a crown pushed downwind the more the higher (sway). H: its height, R: its half length; along: the wind's push
    in its own frame; strength: the wind's; time: the clock's (none: now; the prepass asks a frame ago, src/core/pass.js). */
export const swayed = (p, n, { H, R, billow = 0, flap = 0, sway = 0 }, along, strength, time = U.uTime) => {
  const hold = smoothstep(0.02, 0.45, p.y.div(H)).mul(float(1).sub(smoothstep(0.8, 1, p.y.div(H)).mul(0.8))).mul(smoothstep(0.08, 0.55, length(p.xz).div(R)));
  const f = sin(time.mul(strength.mul(10).add(4)).add(p.y.mul(3.1)).add(p.x.mul(1.7)).add(p.z.mul(2.3))).mul(strength).mul(flap);   // (no angle round its middle: at a pole's tip it has none)
  const up = clamp(p.y.div(H), 0, 1);
  return p.add(along.mul(billow).add(n.mul(f)).mul(hold)).add(along.mul(up.mul(up).mul(sway)));
};
/** A face's normal n turned to the side the eye sees, at w (a face's winding is not to be trusted). */
export const facing = (n, w) => n.dot(U.uCam.sub(w)).lessThan(0).select(n.negate(), n);
/** Its colour where it wears no material of the world: faintly mottled, so no face is quite one even colour. */
export const mottled = (col, w) => col.mul(vnoise(w.xz.mul(1.3).add(w.y), uint(301)).sub(0.5).mul(0.12).add(1));
/** The light on a made thing at w, finished (hazed as the land is). own: its colour; n: its normal, the side the eye
    sees; up: metres over its foot (darker where it meets the ground); wrap: how far soft things take the light round
    their edge; through: how far the sun behind a thin thing shines through it; clumps: how its snow lies. */
export const madeLit = (own, n, w, up, { wrap = 0, through = 0, clumps = 0.08 }) => {
  // snow lies on what faces up, in clumps where it held and slid off between them (so it reads even on pale canvas),
  // and what is under it is darker, damp; a fire that burns near lights it (src/world/fire.js); no light comes
  // through where snow lies on it. Darker where it meets the ground; the sun's light wraps a little round everything
  const lift = snowLift(w, clumps), damp = float(1).sub(clamp(snowDepth.mul(1.5), 0, 0.18));
  const ndl = n.dot(U.uSunDir).add(wrap).div(float(wrap).add(1)).max(0).mul(0.8).add(0.2);
  const thru = float(through).mul(max(n.dot(U.uSunDir).negate(), 0).mul(0.6).add(0.4)).mul(float(1).sub(snowCover(n, lift)));
  return lit({ colour: weathered(own.mul(damp), n, lift), n, w, ndl, through: thru, sky: smoothstep(0, 0.7, up).mul(0.4).add(0.6), extra: fireLight(w, n) });
};
