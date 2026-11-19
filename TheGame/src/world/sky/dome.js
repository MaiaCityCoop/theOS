// The sky dome's own numbers: the sky's light along every way up, as the air gives it (src/world/sky/air.js; laid into a
// texture by the sky as the sun and the moon move: src/world/sky.js), where the sun and the moon stand and their discs'
// light, whether the stars show, the moon's phase. The sky writes them from the hour; the dome's layers (the files
// beside this one) read them.
import * as THREE from 'three/webgpu';
import { uniform, texture, vec2, asin, atan, clamp, sqrt } from 'three/tsl';
import { ROWS, COLS } from './air.js';

export const D = {
  sunL: uniform(new THREE.Vector3()), moonL: uniform(new THREE.Vector3()),   // (their discs' light: as the air lets it through, as bright as the screen shows at most)
  sunD: uniform(new THREE.Vector3(0, 1, 0)), moonD: uniform(new THREE.Vector3(0, -1, 0)), dark: uniform(0), phase: uniform(0.5),
  skyK: uniform(1),   // (what the sky's texture holds is its light times the exposure it was laid at, which half floats hold from noon to midnight: this takes it back)
};
/** The sky's light along every way up, as the code's light (src/world/sky/air.js): a column for every turn round (from
    east, +x, towards south, +z: the whole round, twice the air's columns one side of a source), a row for every height
    (air.js rowEl: finest at the horizon); half floats, which every GPU filters. */
export const SKY_W = 2 * COLS;
export const SKY_TEX = Object.assign(new THREE.DataTexture(new Uint16Array(SKY_W * ROWS * 4), SKY_W, ROWS, THREE.RGBAFormat, THREE.HalfFloatType), { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, needsUpdate: true });
const SKY = texture(SKY_TEX);
/** The sky's own light along the way v (normalized; node): the air's, as the sky laid it (under the horizon the
    horizon's: the far land melts into it). What the dome draws under its layers, what the air between the eye and a
    thing glows with (src/world/light.js airOf), and what a water mirrors where it shows the sky (src/terrain/water.js). */
export const skyAlong = (v) => SKY.sample(vec2(atan(v.z, v.x).div(2 * Math.PI).add(0.5), sqrt(asin(clamp(v.y, 0, 1)).div(Math.PI / 2)))).level(0).rgb.mul(D.skyK);
