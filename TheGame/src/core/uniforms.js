// What every material shares: where the camera is, the lens's measure of distance, the time, the
// light. One object of uniforms, spread into each material, so a change here reaches them all.
import * as THREE from 'three';

export function createUniforms(camera, skyHex) {
  const sky = new THREE.Color(skyHex).convertSRGBToLinear();
  return {
    uCam: { value: camera.position }, uDy: { value: 0 }, uLodInv: { value: 1 }, uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.78, 0.36).normalize() },
    uSun: { value: new THREE.Vector3(1.75, 1.66, 1.5) }, uAmb: { value: new THREE.Vector3(0.50, 0.56, 0.66) },
    uSand: { value: new THREE.Vector4(0, 0, 0, 0) },
    // the shading contract (intent 0002): the measure of size on screen, the wind, the weather, the clouds; all still today
    uPxK: { value: 1 }, uWind: { value: new THREE.Vector4(1, 0, 0, 0) }, uWeather: { value: new THREE.Vector4(0, 0, 0, 0) }, uClouds: { value: 0 },
    uAirH: { value: 0 }, uAirScale: { value: 1200 },
    uExposure: { value: 1 },   // the picture's exposure (the sky sets it by the hour, src/world/sky.js)   // the height fog (LIGHT_GLSL's haze): the camera's height above the ground, the air's thinning   // the library's sandbox (src/world/biomes.glsl.js): off
    uSky: { value: new THREE.Vector3(sky.r, sky.g, sky.b) }, uHaze: { value: 1 / 6500 },
    // the sky's colour as a light that comes out of toScreen() as exactly the sky
    uHazeCol: { value: new THREE.Vector3(-Math.log(1 - sky.r) / 1.25, -Math.log(1 - sky.g) / 1.25, -Math.log(1 - sky.b) / 1.25) },
  };
}
