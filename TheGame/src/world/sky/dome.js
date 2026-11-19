// The sky dome's own uniforms: its colours by the hour, where the sun and the moon stand, how dark it is, the moon's
// phase. The sky (src/world/sky.js) writes them from the hour; the dome's layers (the files beside this one) read them.
import * as THREE from 'three/webgpu';
import { uniform, mix, pow, max } from 'three/tsl';

export const D = {
  zenith: uniform(new THREE.Vector3()), horizon: uniform(new THREE.Vector3()), glow: uniform(new THREE.Vector3()), sunL: uniform(new THREE.Vector3()),
  sunD: uniform(new THREE.Vector3(0, 1, 0)), moonD: uniform(new THREE.Vector3(0, -1, 0)), dark: uniform(0), phase: uniform(0.5),
};
/** The sky's own colour along the way v (normalized; node): the hour's, from the horizon up (under the horizon the
    horizon's: the far land melts into it). What the dome draws under its layers, and what a water mirrors where it
    shows the sky (src/terrain/water.js). */
export const skyAlong = (v) => mix(D.horizon, D.zenith, pow(max(v.y, 0), 0.55));
