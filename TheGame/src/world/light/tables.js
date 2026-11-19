// The light's small tables, in one texture every lit material binds once (intent 0038): a stage of a shader holds at
// most so many sampled textures (the device's maxSampledTexturesPerShaderStage, 16 by default: CI builds every layout on a
// device with the game's limits, tools/gate/wgsl.js), and the light reaches every lit material, so its tables are packed here, not a texture each. Half
// floats, which every GPU filters (a noise rank, k/255, within a half float's step):
//   the blue noise   its tile (light/noise.js), rows 0 … BLUE_NOISE_SIDE - 1, read texel by texel
//   the sky          its light along every way (sky/dome.js skyAlong; laid by the sky, src/world/sky.js), its rows after,
//                    its columns the sky's round from the first, and the first again after the last (so the round
//                    closes between texels), read between them
import * as THREE from 'three/webgpu';
import { texture } from 'three/tsl';
import { BLUE_NOISE_SIDE } from '../../core/method.js';
import { ROWS, COLS } from '../sky/air.js';

/** The sky's columns (the whole round: twice the air's one side of a source) and its first row here. */
export const SKY_W = 2 * COLS, SKY_Y = BLUE_NOISE_SIDE;
/** The texture's size (the sky's round and its first column again). */
export const TABLE_W = Math.max(BLUE_NOISE_SIDE, SKY_W + 1), TABLE_H = BLUE_NOISE_SIDE + ROWS;
export const TABLES = Object.assign(new THREE.DataTexture(new Uint16Array(TABLE_W * TABLE_H * 4), TABLE_W, TABLE_H, THREE.RGBAFormat, THREE.HalfFloatType), {
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, generateMipmaps: false, needsUpdate: true,
});
/** The one node every read takes: one binding a shader, however many terms read it. */
export const tables = texture(TABLES);
