// The sun and the sky (intent 0007): one time of day drives the light. From the hour, the date and the latitude
// (world/sky.js) the sun's and the moon's places; from the sun's height the sky's colours, the sun's light, the sky's
// light, the haze and the exposure, written to the shading contract's uniforms (src/core/uniforms.js), so every material follows;
// and a dome round the camera that draws the sky itself, in layers (the sun, the moon, the stars: src/world/sky/*.js;
// the clouds: the weather's). The weather panel
// (src/ui/weather.js) steers it by hand or lets it run.
import * as THREE from 'three/webgpu';
import { Fn, varying, positionGeometry, normalize, max, mix, pow, smoothstep, vec4, cameraProjectionMatrix, cameraViewMatrix, modelWorldMatrix } from 'three/tsl';
import SKY from '../../world/sky.js';
import { U } from '../core/uniforms.js';
import { toScreen } from './light.js';
import { D } from './sky/dome.js';
import { skyHooks } from './weather/index.js';
import { weatherRow } from '../ui/weather.js';
import { load, save } from '../core/store.js';

const RAD = Math.PI / 180;

/** Where a body stands for an observer at `lat`: its height (alt) and azimuth from north, clockwise, and its direction
    in the world (north -z, east +x). The sun: hour angle from local noon, declination from the day of the year. */
export function sunAt(hour, day, lat) {
  const dec = -23.44 * RAD * Math.cos((2 * Math.PI * (day + 10)) / 365), H = (hour - 12) * 15 * RAD, phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  return { alt, az, dir: new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)) };
}
/** The moon, near enough: it lags the sun by its phase (a day of 29.53 days a cycle), its path as the sun's of that
    many days on; phase 0 new, 0.5 full. */
export function moonAt(hour, day, lat) {
  const phase = (((day - 6) / 29.53) % 1 + 1) % 1, lag = phase * 24;
  return { ...sunAt(hour - lag, day + phase * 365, lat), phase };
}

const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
/** The light by the sun's height (degrees): the file's keys, eased between. */
export function lightAt(altDeg) {
  const K = SKY.keys; let i = 0;
  if (altDeg <= K[0].alt) return { ...K[0] };
  while (i < K.length - 2 && altDeg > K[i + 1].alt) i++;
  const a = K[i], b = K[i + 1], t0 = Math.min(1, Math.max(0, (altDeg - a.alt) / (b.alt - a.alt))), t = t0 * t0 * (3 - 2 * t0);
  return { zenith: lerp3(a.zenith, b.zenith, t), horizon: lerp3(a.horizon, b.horizon, t), sun: lerp3(a.sun, b.sun, t), amb: lerp3(a.amb, b.amb, t), glow: lerp3(a.glow, b.glow, t), exposure: a.exposure + (b.exposure - a.exposure) * t };
}

// what is drawn into the dome over its own colours, in order: its bodies (src/world/sky/*.js: the sun, the moon, the
// stars; another body is another file there) and what the weather's conditions draw (their `sky`: the clouds). Each a
// layer { id, order, draw({ v, y, s, col, D, horizon }) }; a body may also say update(state), each time the hour moves.
const BODIES = Object.values(import.meta.glob('./sky/*.js', { eager: true })).map((m) => m.default).filter((l) => l?.id);
const layers = () => [...BODIES, ...skyHooks()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

function dome(camera) {
  const vDir = varying(positionGeometry);
  // drawn after the land, on the far plane, with the depth test: only where nothing stands is the sky worked out (drawn
  // first under everything, its clouds were worked out for every pixel the land then covered)
  const mat = new THREE.NodeMaterial(); mat.side = THREE.BackSide; mat.depthWrite = false; mat.depthTest = true;
  mat.vertexNode = Fn(() => { const c = cameraProjectionMatrix.mul(cameraViewMatrix).mul(modelWorldMatrix.mul(vec4(positionGeometry, 1))); return vec4(c.xy, c.w.mul(0.99999), c.w); })();
  mat.fragmentNode = Fn(() => {
    const v = normalize(vDir), y = v.y;
    const col = mix(D.horizon, D.zenith, pow(max(y, 0), 0.55)).toVar();                                   // the sky from the horizon up
    col.assign(y.lessThan(0).select(D.horizon.mul(mix(1, 0.75, smoothstep(0, -0.3, y))), col));          // below the horizon: what the far land hides
    const s = max(v.dot(D.sunD), 0);
    for (const L of layers()) L.draw({ v, y, s, col, D, horizon: D.horizon });
    return toScreen(col);
  })();
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  // after the land (10), before the water (20); round the camera, wherever it is (its directions are the eye's)
  m.scale.setScalar(20000); m.renderOrder = 15; m.frustumCulled = false;
  m.onBeforeRender = () => { m.position.copy(camera.position); m.updateMatrixWorld(); };
  return m;
}

export function createSky(scene, camera, renderer) {
  const keep = (k, v) => save('sky.' + k, v), kept = (k, d) => load('sky.' + k, d);
  let hour = kept('hour', SKY.hour), auto = kept('auto', SKY.auto), shown = -1;
  scene.add(dome(camera));
  const v3 = (u, a) => u.value.set(a[0], a[1], a[2]);

  function apply() {
    const sun = sunAt(hour, SKY.day, SKY.latitude), moon = moonAt(hour, SKY.day, SKY.latitude), L = lightAt(sun.alt / RAD);
    // the light: the sun's by day; as it sets, the moon's takes over (its light by its phase and height)
    const w = Math.min(1, Math.max(0, (sun.alt / RAD + 8) / 6)), ws = w * w * (3 - 2 * w), moonUp = Math.max(0, Math.sin(moon.alt)) * Math.sin(Math.PI * moon.phase);
    const dir = new THREE.Vector3().copy(moon.dir).lerp(sun.dir, ws); if (dir.y < 0.02) dir.y = 0.02; dir.normalize();
    U.uSunDir.value.copy(dir);
    U.uSun.value.set(L.sun[0] * ws + SKY.moon.light[0] * moonUp * (1 - ws), L.sun[1] * ws + SKY.moon.light[1] * moonUp * (1 - ws), L.sun[2] * ws + SKY.moon.light[2] * moonUp * (1 - ws));
    v3(U.uAmb, L.amb);
    U.uSky.value.set((L.horizon[0] + L.zenith[0]) / 2, (L.horizon[1] + L.zenith[1]) / 2, (L.horizon[2] + L.zenith[2]) / 2);   // the sky as the water mirrors it
    v3(U.uHazeCol, L.horizon);   // the far land melts into the sky's horizon of this hour
    U.uExposure.value = L.exposure;
    v3(D.zenith, L.zenith); v3(D.horizon, L.horizon); v3(D.glow, L.glow); v3(D.sunL, L.sun); D.sunD.value.copy(sun.dir); D.moonD.value.copy(moon.dir);
    D.dark.value = 1 - Math.min(1, Math.max(0, (sun.alt / RAD + 14) / 12)); D.phase.value = moon.phase;
    for (const B of BODIES) B.update?.({ hour, day: SKY.day, latitude: SKY.latitude, sun, moon, light: L });   // a body with uniforms of its own
    const c = L.horizon.map((x) => Math.pow(1 - Math.exp(-x * 1.25 * L.exposure), 1 / 2.2)); renderer.setClearColor(new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace));
  }

  // the hour in the weather panel (src/ui/weather.js): a slider and Auto
  const hhmm = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h - Math.floor(h)) * 60)).padStart(2, '0')}`;
  const row = weatherRow({
    label: 'Time', min: 0, max: 24, step: 0.05, value: hour, read: hhmm,
    input: (v) => { hour = v; auto = false; keep('auto', false); keep('hour', hour); apply(); show(); },
    button: { text: 'Auto', click: () => { auto = !auto; keep('auto', auto); show(); } },
  });
  function show() { row?.set(hour); row?.button(auto ? 'Auto · on' : 'Auto', auto); }
  apply(); show();
  let saved = 0;
  return {
    get hour() { return hour; },
    set(h) { hour = ((h % 24) + 24) % 24; apply(); show(); },
    /** Hold the day at an hour, Auto off, without keeping it (the library's studio light). */
    hold(h) { hour = ((h % 24) + 24) % 24; auto = false; apply(); show(); },
    update(dt) {
      if (auto) { hour = (hour + (dt * SKY.speed) / 60) % 24; if ((saved += dt) > 5) { saved = 0; keep('hour', hour); } }
      if (hour !== shown) { shown = hour; apply(); if (auto) show(); }
    },
  };
}
