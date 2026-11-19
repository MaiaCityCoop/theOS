// The sun and the sky (intent 0007): one time of day drives the light. From the hour and the date (the clock's:
// world/clock.js) and the latitude (world/sky.js) the sun's and the moon's places; from where they stand, the air's light
// (src/world/sky/air.js: the sky along every way, the sun's and the moon's light as it lets them through, the sky's on
// open ground), the haze, and the exposure as a camera's meter sets it; written to the shading contract's uniforms
// (src/core/uniforms.js), so every material follows; and a dome round the camera that draws the sky itself, in layers
// (the sun, the moon, the stars: src/world/sky/*.js; the clouds: the weather's). The weather panel (src/ui/weather.js)
// steers it by hand or lets it run.
import * as THREE from 'three/webgpu';
import { Fn, varying, positionGeometry, normalize, max, vec3, vec4, cameraProjectionMatrix, cameraViewMatrix, modelWorldMatrix } from 'three/tsl';
import SKY from '../../world/sky.js';
import CLOCK from '../../world/clock.js';   // the date, the hour the game opens at, how fast a day runs: set there, nowhere else
import { U } from '../core/uniforms.js';
import { toScreen } from './light.js';
import { D, skyAlong } from './sky/dome.js';
import { TABLES, TABLE_W, SKY_W, SKY_Y } from './light/tables.js';
import { through, skyOf, ROWS, rowEl, GROUND_EXTINCTION } from './sky/air.js';
import { STAR_MOST } from './sky/stars.js';
import { skyHooks } from './weather/index.js';
import { weatherRow } from '../ui/weather.js';
import { load, save } from '../core/store.js';
import { SUN_DIAMETER, SOLAR_ILLUMINANCE, AEROSOL, MOON } from './light/physics.js';

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

// a colour's luminance (its light as the eye weighs it). source: ITU 2015, Recommendation ITU-R BT.709-6 (Rec. 709's primaries)
const LUMA = [0.2126, 0.7152, 0.0722];
const lum = (c) => c.reduce((s, v, i) => s + v * LUMA[i], 0);
// the exposure: as a camera's meter sets it from the light on open ground, an 18% grey there shown at 118/255 through
// the screen's curve (src/world/light.js display: ISO 12232's standard output sensitivity), but no further than the eye
// adapts (under 0.005 cd/m², the grey's luminance there, sight is scotopic: CIE 191). source: ISO 2019, ISO 12232:2019
// Photography, digital still cameras: exposure index, ISO speed ratings, standard output sensitivity and recommended
// exposure index; CIE 2010, CIE 191:2010 Recommended system for mesopic photometry based on visual performance
const METER = { grey: 0.18, shown: 118 / 255, scotopic: 0.005 };
/** The light the screen's curve shows as `shown` (0 … 1) at an exposure: display's inverse (src/world/light.js). */
const curveIn = (shown, exposure = 1) => -Math.log(1 - shown ** 2.2) / (1.25 * exposure);
/** The exposure a camera's meter sets for G, the light on open ground (the code's: the sun's at the top of the air 1). */
const exposureFor = (G) => curveIn(METER.shown) / (METER.grey * Math.max(G, (METER.scotopic * Math.PI) / (METER.grey * SOLAR_ILLUMINANCE)));
/** The moon's light, a share of the sun's, by its phase (0 new, 0.5 full): its brightness by its phase angle from full
    (physics.js MOON: Krisciunas & Schaefer's). */
const moonShare = (phase) => { const a = 180 * Math.abs(1 - 2 * phase), [m0, m1, m2] = MOON.magnitude; return 10 ** (-0.4 * (m0 + m1 * a + m2 * a ** 4 - MOON.sun)); };
/** How far an angle lies from 0, either way (0 … π). */
const turnOf = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
/** A disc's light along it (light: what of it reaches the ground, [r, g, b]; solid: its size, steradians): its own over
    its size, as the screen's white at the most (the screen shows no more; a disc so bright is drawn no brighter). */
const discOf = (light, solid, exposure) => { const k = Math.min(Math.PI / solid, curveIn(254.5 / 255, exposure) / Math.max(...light, 1e-30)); return light.map((c) => c * k); };

// what is drawn into the dome over its own colours, in order: its bodies (src/world/sky/*.js: the sun, the moon, the
// stars; another body is another file there) and what the weather's conditions draw (their `sky`: the clouds). Each a
// layer { id, order, draw({ v, y, s, col, D, horizon }) }; a body may also say update(state), each time the hour moves.
const BODIES = Object.values(import.meta.glob('./sky/*.js', { eager: true })).map((m) => m.default).filter((l) => l?.id);
const layers = () => [...BODIES, ...skyHooks()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

function dome(camera) {
  const vDir = varying(positionGeometry);
  // drawn after the land, on the far plane, with the depth test: only where nothing stands is the sky worked out (drawn
  // first under everything, its clouds were worked out for every pixel the land then covered). On the far plane to the
  // last bit of a float (0.9999999): a hair nearer (0.99999) it stood before all land farther than ten kilometres,
  // and from high up the land ended there in a ragged edge
  const mat = new THREE.NodeMaterial(); mat.side = THREE.BackSide; mat.depthWrite = false; mat.depthTest = true;
  mat.vertexNode = Fn(() => { const c = cameraProjectionMatrix.mul(cameraViewMatrix).mul(modelWorldMatrix.mul(vec4(positionGeometry, 1))); return vec4(c.xy, c.w.mul(0.9999999), c.w); })();
  mat.fragmentNode = Fn(() => {
    const v = normalize(vDir), y = v.y;
    // the sky's own light along the way: the air's (src/world/sky/air.js)
    const col = skyAlong(v).toVar();
    // (below the horizon the horizon's own colour: the far land melts into it (light.js: airOf), so from high up, where
    // the land ends below the horizon, there is no band of another colour between them)
    const s = max(v.dot(D.sunD), 0);
    for (const L of layers()) L.draw({ v, y, s, col, D, horizon: skyAlong(normalize(vec3(v.x, 0, v.z))) });
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
  let hour = kept('hour', CLOCK.hour), auto = kept('auto', CLOCK.auto), shown = -1;
  scene.add(dome(camera));
  const v3 = (u, a) => u.value.set(a[0], a[1], a[2]);

  // the sky's texture, laid from the air's light as the sun stands, and the moon's as it stands while the sun is down:
  // each source's sky worked out again (air.js skyOf) once it has moved by half the sun's width, the texture laid again
  // round them (each way by its turn from each source) once either has
  let laid = null;
  const lay = (sun, moon, iMoon, exposure, skies) => {
    const near = (a, b) => Math.abs(a - b) < SUN_DIAMETER / 2, sAz = Math.atan2(sun.dir.z, sun.dir.x), mAz = Math.atan2(moon.dir.z, moon.dir.x), withMoon = !!skies.M;
    const stays = (L) => L && near(L.sunAlt, sun.alt) && near(L.sunAz, sAz) && L.withMoon === withMoon && (!withMoon || (near(L.moonAlt, moon.alt) && near(L.moonAz, mAz))) && Math.abs(Math.log(L.k / exposure)) < Math.LN2;   // (and laid again once the exposure has moved by a stop: what it holds stays in the half floats' range)
    if (stays(laid)) return laid;
    const k = exposure;   // (held times the exposure it is laid at: half floats then hold it, from noon's light to the night's; D.skyK takes it back)
    const S = skies.S, M = skies.M, data = TABLES.image.data, at = (y, x) => ((SKY_Y + y) * TABLE_W + x) * 4;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < SKY_W; x++) {
      const a = ((x + 0.5) / SKY_W) * 2 * Math.PI - Math.PI, l = S.at(rowEl(y), turnOf(a - sAz)), m = M ? M.at(rowEl(y), turnOf(a - mAz)) : null, o = at(y, x);
      for (let c = 0; c < 3; c++) data[o + c] = THREE.DataUtils.toHalfFloat((l[c] + (m ? iMoon * m[c] : 0)) * k);
      data[o + 3] = THREE.DataUtils.toHalfFloat(1);
    }
    for (let y = 0; y < ROWS; y++) for (let c = 0; c < 4; c++) data[at(y, SKY_W) + c] = data[at(y, 0) + c];   // (the first column again after the last: the round closes)
    TABLES.needsUpdate = true; D.skyK.value = 1 / k;
    return (laid = { sunAlt: sun.alt, sunAz: sAz, moonAlt: moon.alt, moonAz: mAz, withMoon, S, M, k });
  };

  function apply() {
    const sun = sunAt(hour, CLOCK.day, SKY.latitude), moon = moonAt(hour, CLOCK.day, SKY.latitude), iMoon = moonShare(moon.phase), withMoon = sun.alt < 0;
    // the light on the land: the sun's as the air lets it through, and the moon's (its share of the sun's); its way the
    // brighter's, by how bright each is; the sky's on open ground, from the sun and from the moon (air.js); the sky's
    // texture laid from them at the exposure they meter
    const S = laid && Math.abs(laid.sunAlt - sun.alt) < SUN_DIAMETER / 2 ? laid.S : skyOf(sun.alt), Mg = withMoon ? (laid?.M && Math.abs(laid.moonAlt - moon.alt) < SUN_DIAMETER / 2 ? laid.M : skyOf(moon.alt)) : null;
    const ts = through(sun.alt), tm = through(moon.alt).map((v) => v * iMoon), amb = [0, 1, 2].map((c) => S.ground[c] + (Mg ? iMoon * Mg.ground[c] : 0));
    const ws = lum(ts), wm = lum(tm), dir = ws + wm > 0 ? new THREE.Vector3().addScaledVector(sun.dir, ws).addScaledVector(moon.dir, wm) : sun.dir.clone(); if (dir.y < 0.02) dir.y = 0.02; dir.normalize();
    U.uSunDir.value.copy(dir);
    U.uSun.value.set(ts[0] + tm[0], ts[1] + tm[1], ts[2] + tm[2]);
    v3(U.uAmb, amb);
    // the exposure, metered off the light on open ground; the haze, what a metre of air at the ground takes (the green
    // channel's, one for all: its colour is the sky's behind it, src/world/light.js airOf), thinning upwards as the
    // aerosols do
    const exposure = exposureFor(ws * Math.max(Math.sin(sun.alt), 0) + wm * Math.max(Math.sin(moon.alt), 0) + lum(amb)), sky = lay(sun, moon, iMoon, exposure, { S, M: Mg });
    U.uExposure.value = exposure; U.uHaze.value = GROUND_EXTINCTION[1]; U.uAirScale.value = AEROSOL.height;
    // the discs, each its light over its size; the stars while the brightest of them would show a step of the screen's
    // over the sky's own light round the zenith
    const zenith = lum(sky.S.at(Math.PI / 2, 0)) + (sky.M ? iMoon * lum(sky.M.at(Math.PI / 2, 0)) : 0), shows = (x) => (1 - Math.exp(-x * 1.25 * exposure)) ** (1 / 2.2);
    v3(D.sunL, discOf(ts, Math.PI * (SUN_DIAMETER / 2) ** 2, exposure)); v3(D.moonL, discOf(tm, Math.PI * SKY.moon.size ** 2, exposure));
    D.sunD.value.copy(sun.dir); D.moonD.value.copy(moon.dir); D.phase.value = moon.phase; D.dark.value = shows(zenith + STAR_MOST) - shows(zenith) >= 0.5 / 255 ? 1 : 0;
    for (const B of BODIES) B.update?.({ hour, day: CLOCK.day, latitude: SKY.latitude, sun, moon });   // a body with uniforms of its own
    // the canvas cleared to the horizon's light, as the screen shows it
    const h = [0, 0, 0];
    for (let x = 0; x < SKY_W; x++) { const a = ((x + 0.5) / SKY_W) * 2 * Math.PI - Math.PI, l = sky.S.at(0, turnOf(a - sky.sunAz)), m = sky.M ? sky.M.at(0, turnOf(a - sky.moonAz)) : null; for (let c = 0; c < 3; c++) h[c] += (l[c] + (m ? iMoon * m[c] : 0)) / SKY_W; }
    const c = h.map((x) => Math.pow(1 - Math.exp(-x * 1.25 * exposure), 1 / 2.2)); renderer.setClearColor(new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace));
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
      if (auto) { hour = (hour + (dt * CLOCK.speed) / 60) % 24; if ((saved += dt) > 5) { saved = 0; keep('hour', hour); } }
      if (hour !== shown) { shown = hour; apply(); if (auto) show(); }
    },
  };
}
