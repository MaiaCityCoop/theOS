// The sky in TSL (intent 0008, step 2): the dome of src/world/sky.js as a node material, and the light of an hour written
// to the TSL light (terrain.tsl.js's LIGHT) from the same sun, moon and keys (world/sky.js). The clock comes with the
// switch (it lives with the WebGL sky today).
import * as THREE from 'three/webgpu';
import { Fn, float, vec3, vec4, uniform, positionGeometry, varying, normalize, max, mix, pow, smoothstep, step, sin, cos, dot, floor, fract } from 'three/tsl';
import { LIGHT, toScreen } from './terrain.tsl.js';
import { WATER } from './water.tsl.js';
import { sunAt, moonAt, lightAt } from '../world/sky.js';
import SKY from '../../world/sky.js';

const D = {
  zenith: uniform(new THREE.Vector3()), horizon: uniform(new THREE.Vector3()), glow: uniform(new THREE.Vector3()), sunL: uniform(new THREE.Vector3()),
  sunD: uniform(new THREE.Vector3(0, 1, 0)), moonD: uniform(new THREE.Vector3(0, -1, 0)), dark: uniform(0), phase: uniform(0.5),
};
const h3 = (p) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));

export function createSkyDome(camera) {
  const vDir = varying(positionGeometry);
  const frag = Fn(() => {
    const v = normalize(vDir), y = v.y;
    const col = mix(D.horizon, D.zenith, pow(max(y, 0), 0.55)).toVar();
    col.assign(y.lessThan(0).select(D.horizon.mul(mix(1, 0.75, smoothstep(0, -0.3, y))), col));
    const s = max(v.dot(D.sunD), 0);
    col.addAssign(D.glow.mul(pow(s, 5).mul(0.55).add(pow(s, 48).mul(0.6))).mul(float(1).sub(max(y, 0)).mul(0.4).add(0.6)));
    col.addAssign(D.sunL.mul(6).mul(smoothstep(0.99989, 0.99994, s)).mul(step(-0.02, D.sunD.y)));
    const m = v.dot(D.moonD);
    col.addAssign(vec3(0.85, 0.87, 0.92).mul(D.dark.mul(0.65).add(0.35)).mul(sin(D.phase.mul(Math.PI)).mul(0.75).add(0.25)).mul(step(-0.05, D.moonD.y)).mul(step(Math.cos(SKY.moon.size), m)));
    const c = floor(v.mul(260)), r = h3(c), q = fract(v.mul(260)).sub(0.5);
    const star = step(1 - SKY.stars.count, r).mul(smoothstep(0.22, 0, q.length())).mul(h3(c.add(7)).mul(0.6).add(0.4));
    col.addAssign(vec3(0.85, 0.9, 1).mul(star).mul(SKY.stars.bright).mul(D.dark).mul(smoothstep(0, 0.15, y)).mul(step(0, y)));
    return toScreen(col);
  });
  const mat = new THREE.NodeMaterial(); mat.fragmentNode = frag(); mat.side = THREE.BackSide; mat.depthWrite = false; mat.depthTest = false;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  dome.scale.setScalar(20000); dome.renderOrder = -100; dome.frustumCulled = false; dome.onBeforeRender = () => dome.position.copy(camera.position);
  return dome;
}

/** The light of an hour, as src/world/sky.js's apply(): the sun, then the moon; the sky, the haze, the exposure. */
export function lightHour(hour, renderer) {
  const RAD = Math.PI / 180, sun = sunAt(hour, SKY.day, SKY.latitude), moon = moonAt(hour, SKY.day, SKY.latitude), K = lightAt(sun.alt / RAD);
  const w = Math.min(1, Math.max(0, (sun.alt / RAD + 8) / 6)), ws = w * w * (3 - 2 * w), moonUp = Math.max(0, Math.sin(moon.alt)) * Math.sin(Math.PI * moon.phase);
  const dir = new THREE.Vector3(moon.dir.x, moon.dir.y, moon.dir.z).lerp(new THREE.Vector3(sun.dir.x, sun.dir.y, sun.dir.z), ws); if (dir.y < 0.02) dir.y = 0.02; dir.normalize();
  LIGHT.sunDir.value.copy(dir);
  LIGHT.sun.value.set(...K.sun.map((v, i) => v * ws + SKY.moon.light[i] * moonUp * (1 - ws)));
  LIGHT.amb.value.set(...K.amb); LIGHT.hazeCol.value.set(...K.horizon); LIGHT.exposure.value = K.exposure;
  WATER.sky.value.set(...K.horizon.map((h, i) => (h + K.zenith[i]) / 2));
  D.zenith.value.set(...K.zenith); D.horizon.value.set(...K.horizon); D.glow.value.set(...K.glow); D.sunL.value.set(...K.sun);
  D.sunD.value.set(sun.dir.x, sun.dir.y, sun.dir.z); D.moonD.value.set(moon.dir.x, moon.dir.y, moon.dir.z);
  D.dark.value = 1 - Math.min(1, Math.max(0, (sun.alt / RAD + 14) / 12)); D.phase.value = moon.phase;
  if (renderer) renderer.setClearColor(new THREE.Color().setRGB(...K.horizon.map((x) => Math.pow(1 - Math.exp(-x * 1.25 * K.exposure), 1 / 2.2)), THREE.LinearSRGBColorSpace));
}
