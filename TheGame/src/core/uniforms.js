// What every material shares: where the camera is, the lens's measure of distance, the time, the light. One set of
// node uniforms (TSL, intent 0008), read by every material's nodes, so a change here reaches them all. Each is a uniform
// node with a `value`, so code that steers the world writes `U.uSunDir.value.copy(…)` as before.
import * as THREE from 'three/webgpu';
import { uniform, texture } from 'three/tsl';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const placeholder = Object.assign(new THREE.DepthTexture(1, 1), { compareFunction: THREE.LessEqualCompare });   // the shadow map until src/world/shadow.js gives the real one (read with a comparison sampler as it is)
const lit = Object.assign(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), { needsUpdate: true });   // the clouds' shadow map until src/world/cloudmap.js draws one: all in the sun

/** The one set, for node code that reads it directly. */
export const U = {
  uCam: uniform(v3(0, 0, 0)), uDy: uniform(0), uLodInv: uniform(1), uTime: uniform(0),
  uSunDir: uniform(v3(0.5, 0.78, 0.36).normalize()), uSun: uniform(v3(1.75, 1.66, 1.5)), uAmb: uniform(v3(0.5, 0.56, 0.66)),
  uSand: uniform(new THREE.Vector4(0, 0, 0, 0)),   // the library's sandbox (src/world/land.nodes.js): off
  uStage: uniform(v3(0, 0, 0)),                    // the library's stage: (x, z, radius), radius 0: none
  uStageGround: uniform(new THREE.Vector2(-1, 2)),  // the ground laid on it: (a material's layer, -1 the base biome's bare earth; metres a tile)
  // the shading contract (intent 0002): the measure of size on screen, the wind, the weather, the clouds
  uPxK: uniform(1), uWind: uniform(new THREE.Vector4(1, 0, 0, 0)), uWeather: uniform(new THREE.Vector4(0, 0, 0, 0)), uClouds: uniform(0), uCloudOff: uniform(new THREE.Vector2(0, 0)), tCloudMap: texture(lit), uCloudMap: uniform(new THREE.Vector3(0, 0, 0)),   // the clouds' cover and how far they have drifted (src/world/clouds.js)
  uView: uniform(new THREE.Matrix4()), uViewK: uniform(new THREE.Vector3(1, 0, 1.414)),   // the eye's view, for what is dropped outside it before it is drawn (src/scatter/index.js: select)
  uAirH: uniform(0), uAirScale: uniform(1200),     // the height fog: the camera's height above the ground, the air's thinning
  uLandEnd: uniform(24000),                        // how far the land is drawn, metres from the eye (src/terrain/terrain.js): the air hides it by then
  uExposure: uniform(1),                           // the picture's exposure (the sky sets it by the hour)
  uSnow: uniform(0),                               // how deep the snow lies, metres (src/world/snow.js)
  uFine: uniform(1),                               // how much finer than the inside's pixels textures are read (built over time: src/core/temporal.js)
  uMark: uniform(0),                               // what moves by itself marks its pixels by it (src/world/light.js: stillness; set by src/core/temporal.js)
  uSnowFall: uniform(0),                           // how much snow is falling, 0 … 1 (src/world/snowfall.js)
  tShadow: texture(placeholder), uShadowM: uniform(new THREE.Matrix4()), uShadowOn: uniform(0), uShadowTexel: uniform(1 / 2048), uShadowPass: uniform(0),   // the shadow map (src/world/shadow.js)
  uSky: uniform(v3(0.4, 0.55, 0.7)), uHaze: uniform(1 / 6500), uHazeCol: uniform(v3(0.6, 0.7, 0.8)),
};

/** The set, bound to this camera, its sky at the start the given colour. */
export function createUniforms(camera, skyHex) {
  const sky = new THREE.Color(skyHex).convertSRGBToLinear();
  U.uCam.value = camera.position;
  U.uSky.value.set(sky.r, sky.g, sky.b);
  // the sky's colour as a light that comes out of toScreen() as exactly the sky
  U.uHazeCol.value.set(-Math.log(1 - sky.r) / 1.25, -Math.log(1 - sky.g) / 1.25, -Math.log(1 - sky.b) / 1.25);
  return U;
}
