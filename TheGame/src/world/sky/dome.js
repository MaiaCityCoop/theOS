// The sky dome's own numbers: the sky's light along every way up, as the air gives it (src/world/sky/air.js; laid into the
// light's tables by the sky as the sun and the moon move: src/world/light/tables.js, src/world/sky.js), where the sun and the moon stand and their discs'
// light, whether the stars show, the moon's phase. The sky writes them from the hour; the dome's layers (the files
// beside this one) read them.
import * as THREE from 'three/webgpu';
import { uniform, vec2, asin, atan, clamp, sqrt, fract } from 'three/tsl';
import { ROWS } from './air.js';
import { tables, SKY_W, SKY_Y, TABLE_W, TABLE_H } from '../light/tables.js';

export const D = {
  sunL: uniform(new THREE.Vector3()), moonL: uniform(new THREE.Vector3()),   // (their discs' light: as the air lets it through, as bright as the screen shows at most)
  sunD: uniform(new THREE.Vector3(0, 1, 0)), moonD: uniform(new THREE.Vector3(0, -1, 0)), dark: uniform(0), phase: uniform(0.5),
  skyK: uniform(1),   // (what the sky's rows of the tables hold is its light times the exposure it was laid at, which half floats hold from noon to midnight: this takes it back)
};
/** The sky's own light along the way v (normalized; node): the air's, as the sky laid it (under the horizon the
    horizon's: the far land melts into it). What the dome draws under its layers, what the air between the eye and a
    thing glows with (src/world/light.js airOf), and what a water mirrors where it shows the sky (src/terrain/water.js). */
export const skyAlong = (v) => {
  const u = atan(v.z, v.x).div(2 * Math.PI).add(0.5), h = sqrt(asin(clamp(v.y, 0, 1)).div(Math.PI / 2));   // (its turn round and its height, each 0 … 1 over the sky's columns and rows)
  // (between the column it falls in and the next, read from half a column on: the last's next the first again; its rows held off the noise's under them)
  return tables.sample(vec2(fract(u.sub(0.5 / SKY_W)).mul(SKY_W).add(0.5).div(TABLE_W), clamp(h.mul(ROWS).add(SKY_Y), SKY_Y + 0.5, SKY_Y + ROWS - 0.5).div(TABLE_H))).level(0).rgb.mul(D.skyK);
};
