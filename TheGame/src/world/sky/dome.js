// The sky dome's own uniforms: its colours by the hour, where the sun and the moon stand, how dark it is, the moon's
// phase. The sky (src/world/sky.js) writes them from the hour; the dome's layers (the files beside this one) read them.
import * as THREE from 'three/webgpu';
import { uniform, float, mix, pow, max } from 'three/tsl';

export const D = {
  zenith: uniform(new THREE.Vector3()), horizon: uniform(new THREE.Vector3()), glow: uniform(new THREE.Vector3()), sunL: uniform(new THREE.Vector3()),
  sunD: uniform(new THREE.Vector3(0, 1, 0)), moonD: uniform(new THREE.Vector3(0, -1, 0)), dark: uniform(0), phase: uniform(0.5),
};
/** The sky's own colour along the way v (normalized; node): the hour's, from the horizon up (under the horizon the
    horizon's: the far land melts into it). What the dome draws under its layers, and what a water mirrors where it
    shows the sky (src/terrain/water.js). */
export const skyAlong = (v) => mix(D.horizon, D.zenith, pow(max(v.y, 0), 0.55));
/** The glow round the sun along the way v (normalized; node): the hour's, as tight as the air throws the sun's light
    forward, strongest low over the horizon. What the dome lays round the sun (sky/sun.js) and what the air glows with
    looking towards it (src/world/light.js airOf): the far land melts into the very sky behind it. */
export const glowAlong = (v) => { const s = max(v.dot(D.sunD), 0); return D.glow.mul(pow(s, 5).mul(0.55).add(pow(s, 48).mul(0.6))).mul(float(1).sub(max(v.y, 0)).mul(0.4).add(0.6)); };
