// What a tool's page that draws one thing alone sets up (tools/body.page.js, tools/figure.page.js): the address read,
// the renderer, the camera where the address puts it, the key light, and a stand-in for what the world's materials
// read, with none of the world round it. The address says the view (all optional):
//   y, x, z      what the camera looks at (m)                                               d      how far off (m)
//   yaw, pitch   where it stands round and over that (degrees; 0: in front)                  fov    its lens (degrees)
//   sun, suna    the key light: degrees to the camera's left, and up (the library's: 45, 40)  exp    the exposure
//   gpu          through WebGPU (as the game draws); without it WebGL 2, which a machine without a GPU can draw too
import * as THREE from 'three/webgpu';
import { texture } from 'three/tsl';
import { useTiles } from '../src/world/tile.js';
import { U } from '../src/core/uniforms.js';

// (no baked materials here: what reads one, the clouds' field, reads grey)
{ const grey = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); grey.needsUpdate = true; useTiles({ a: (m, uv) => texture(grey, uv), n: (m, uv) => texture(grey, uv), layer: () => 0 }); }
export const q = new URLSearchParams(location.search), num = (k, d) => (q.get(k) == null ? d : +q.get(k));
const rad = (k, d) => THREE.MathUtils.degToRad(num(k, d));
export const renderer = new THREE.WebGPURenderer({ canvas: document.getElementById('c'), antialias: true, forceWebGL: !q.has('gpu') });
await renderer.init();
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;   // (the screen's curve is the material's own: src/world/light.js toScreen)
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false); renderer.setClearColor(new THREE.Color(0.2, 0.2, 0.21));
export const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(num('fov', 28), innerWidth / innerHeight, 0.05, 100);
// (no shadow is cast here, but a material reads the shadow's map all the same: through WebGPU the game's stand-in for it is
// taken for the picture's own depth and gets no sampler, so the page keeps a small map of its own, made as
// src/world/shadow.js makes the real one)
{ const rt = new THREE.RenderTarget(4, 4, { count: 0, depthBuffer: true }); rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType; rt.depthTexture.compareFunction = THREE.LessEqualCompare; rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.LinearFilter; U.tShadow.value = rt.depthTexture; }
U.uCam.value = camera.position; U.uHaze.value = 0; U.uExposure.value = num('exp', 1);
const yaw = rad('yaw', 0), pitch = rad('pitch', 0), d = num('d', 4.3);
/** What the camera looks at; aim() sets the camera by it again (a page may move it: to a figure's eyes, however tall). */
export const at = [num('x', 0), num('y', 0.9), num('z', 0)];
export const aim = () => { camera.position.set(at[0] + Math.sin(yaw) * Math.cos(pitch) * d, at[1] + Math.sin(pitch) * d, at[2] + Math.cos(yaw) * Math.cos(pitch) * d); camera.lookAt(...at); }; aim();
const sa = rad('sun', 45), su = rad('suna', 40);   // (the library's key: 45° to the camera's left, 40° up)
U.uSunDir.value.set(Math.sin(yaw - sa) * Math.cos(su), Math.sin(su), Math.cos(yaw - sa) * Math.cos(su)).normalize();
