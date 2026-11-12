// The sun and the sky (intent 0007): one time of day drives the light. From the hour, the date and the latitude
// (world/sky.js) the sun's and the moon's places; from the sun's height the sky's colours, the sun's light, the sky's
// light, the haze and the exposure, written to the shading contract's uniforms (src/core/uniforms.js), so every material follows;
// and a dome round the camera that draws the sky itself, with the sun, the moon and the stars. A small clock in the top
// right corner steers it by hand or lets it run.
import * as THREE from 'three/webgpu';
import { Fn, float, vec3, uniform, varying, positionGeometry, normalize, max, mix, pow, smoothstep, step, sin, dot, floor, fract } from 'three/tsl';
import SKY from '../../world/sky.js';
import { U } from '../core/uniforms.js';
import { toScreen } from './light.js';

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

// the dome's own uniforms: its colours by the hour, where the sun and the moon stand, how dark it is, the moon's phase
const D = {
  zenith: uniform(new THREE.Vector3()), horizon: uniform(new THREE.Vector3()), glow: uniform(new THREE.Vector3()), sunL: uniform(new THREE.Vector3()),
  sunD: uniform(new THREE.Vector3(0, 1, 0)), moonD: uniform(new THREE.Vector3(0, -1, 0)), dark: uniform(0), phase: uniform(0.5),
};
const h3 = (p) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
function dome(camera) {
  const vDir = varying(positionGeometry);
  const mat = new THREE.NodeMaterial(); mat.side = THREE.BackSide; mat.depthWrite = false; mat.depthTest = false;
  mat.fragmentNode = Fn(() => {
    const v = normalize(vDir), y = v.y;
    const col = mix(D.horizon, D.zenith, pow(max(y, 0), 0.55)).toVar();                                   // the sky from the horizon up
    col.assign(y.lessThan(0).select(D.horizon.mul(mix(1, 0.75, smoothstep(0, -0.3, y))), col));          // below the horizon: what the far land hides
    const s = max(v.dot(D.sunD), 0);
    col.addAssign(D.glow.mul(pow(s, 5).mul(0.55).add(pow(s, 48).mul(0.6))).mul(float(1).sub(max(y, 0)).mul(0.4).add(0.6)));   // the glow round the sun, strongest low
    col.addAssign(D.sunL.mul(6).mul(smoothstep(0.99989, 0.99994, s)).mul(step(-0.02, D.sunD.y)));       // the sun's disc
    col.addAssign(vec3(0.85, 0.87, 0.92).mul(D.dark.mul(0.65).add(0.35)).mul(sin(D.phase.mul(Math.PI)).mul(0.75).add(0.25))
      .mul(step(-0.05, D.moonD.y)).mul(step(Math.cos(SKY.moon.size), v.dot(D.moonD))));                 // the moon, brighter full and by night
    const c = floor(v.mul(260)), q = fract(v.mul(260)).sub(0.5);                                           // the stars, as the sky darkens
    const star = step(1 - SKY.stars.count, h3(c)).mul(smoothstep(0.22, 0, q.length())).mul(h3(c.add(7)).mul(0.6).add(0.4));
    col.addAssign(vec3(0.85, 0.9, 1).mul(star).mul(SKY.stars.bright).mul(D.dark).mul(smoothstep(0, 0.15, y)).mul(step(0, y)));
    return toScreen(col);
  })();
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  m.scale.setScalar(20000); m.renderOrder = -100; m.frustumCulled = false; m.onBeforeRender = () => m.position.copy(camera.position);
  return m;
}

export function createSky(scene, camera, renderer) {
  const keep = (k, v) => { try { localStorage.setItem('maia.sky.' + k, JSON.stringify(v)); } catch {} };
  const kept = (k, d) => { try { const v = JSON.parse(localStorage.getItem('maia.sky.' + k)); return v ?? d; } catch { return d; } };
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
    const c = L.horizon.map((x) => Math.pow(1 - Math.exp(-x * 1.25 * L.exposure), 1 / 2.2)); renderer.setClearColor(new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace));
  }

  // the clock, top right: the hour, a slider, Auto (not on a film's page, nor as a picture)
  let ui = null;
  const film = /(timeline|library)\.html$/.test(location.pathname) || new URLSearchParams(location.search).has('embed');   // a film sets its own hour; the library keeps its own light
  if (!film) {
    ui = document.createElement('div'); ui.className = 'os-clock glass'; ui.setAttribute('aria-label', 'Time of day');
    ui.innerHTML = '<b></b><input type="range" id="sky-hour" min="0" max="24" step="0.05" aria-label="Time of day"><button type="button" class="g-btn quiet">Auto</button>';
    document.body.append(ui); document.body.classList.add('has-clock');
    const range = ui.querySelector('input'), btn = ui.querySelector('button');
    range.addEventListener('input', () => { hour = +range.value; auto = false; keep('auto', false); keep('hour', hour); show(); });
    btn.addEventListener('click', () => { auto = !auto; keep('auto', auto); show(); });
    ui.addEventListener('pointerdown', (e) => e.stopPropagation()); ui.addEventListener('wheel', (e) => e.stopPropagation());
  }
  function show() {
    if (!ui) return;
    const hh = Math.floor(hour) % 24, mm = Math.floor((hour - Math.floor(hour)) * 60);
    ui.querySelector('b').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const r = ui.querySelector('input'); if (document.activeElement !== r) r.value = hour;
    const b = ui.querySelector('button'); b.classList.toggle('quiet', !auto); b.textContent = auto ? 'Auto · on' : 'Auto';
  }
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
