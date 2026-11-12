// The clouds (world/clouds.js): how much of the sky they cover and where they have drifted to, written to the shared
// uniforms (uClouds, uCloudOff), so the sky draws them (src/world/sky.js) and every surface takes their shadow
// (src/world/light.js: cloudAt). The weather panel sets the cover; a film may set it per shot.
import CLOUDS from '../../world/clouds.js';
import { U } from '../core/uniforms.js';
import { weatherRow } from '../ui/weather.js';
import { load, save } from '../core/store.js';

const nameOf = (c) => CLOUDS.names.filter(([at]) => c >= at).at(-1)[1];

export function createClouds() {
  const set = (c) => { U.uClouds.value = Math.min(1, Math.max(0, c)); };
  set(load('clouds', CLOUDS.cover));
  const row = weatherRow({ label: 'Clouds', min: 0, max: 1, step: 0.01, value: U.uClouds.value, read: nameOf, input: (c) => { set(c); save('clouds', U.uClouds.value); } });
  return {
    get cover() { return U.uClouds.value; },
    /** 0 clear … 1 overcast (a film may set it per shot) */
    set(c) { set(c); row?.set(U.uClouds.value); },
    /** drift with the wind (uWind: its way, its strength) */
    update(dt) {
      const w = U.uWind.value, v = CLOUDS.drift.calm + (CLOUDS.drift.storm - CLOUDS.drift.calm) * w.z;
      U.uCloudOff.value.x -= w.x * v * dt; U.uCloudOff.value.y -= w.y * v * dt;   // the field moves with the wind: its sampling point against it
    },
  };
}
