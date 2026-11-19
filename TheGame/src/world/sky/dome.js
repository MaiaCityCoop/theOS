// The sky dome's own uniforms: its colours by the hour, where the sun and the moon stand, how dark it is, the moon's
// phase. The sky (src/world/sky.js) writes them from the hour; the dome's layers (the files beside this one) read them.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export const D = {
  zenith: uniform(new THREE.Vector3()), horizon: uniform(new THREE.Vector3()), glow: uniform(new THREE.Vector3()), sunL: uniform(new THREE.Vector3()),
  sunD: uniform(new THREE.Vector3(0, 1, 0)), moonD: uniform(new THREE.Vector3(0, -1, 0)), dark: uniform(0), phase: uniform(0.5),
};
