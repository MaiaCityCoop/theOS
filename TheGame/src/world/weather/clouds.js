// The clouds (world/clouds.js): how much of the sky they cover and where they have drifted to, written to the shared
// uniforms (uClouds, uCloudOff), so the sky draws them (src/world/sky.js) and every surface takes their shadow
// (src/world/light.js: cloudAt). The weather panel sets the cover; a film may set it per shot.
import CLOUDS from '../../../world/clouds.js';
import { U } from '../../core/uniforms.js';

const nameOf = (c) => CLOUDS.names.filter(([at]) => c >= at).at(-1)[1];

/** A weather condition (src/world/weather/index.js): the cover, 0 clear … 1 overcast; the field drifts with the wind. */
export default {
  id: 'clouds', label: 'Clouds', order: 40, range: [0, 1, 0.01], start: CLOUDS.cover,
  read: nameOf,
  apply(c) { U.uClouds.value = c; },
  update(dt) {   // drift with the wind (uWind: its way, its strength)
    const w = U.uWind.value, v = CLOUDS.drift.calm + (CLOUDS.drift.storm - CLOUDS.drift.calm) * w.z;
    U.uCloudOff.value.x -= w.x * v * dt; U.uCloudOff.value.y -= w.y * v * dt;   // the field moves with the wind: its sampling point against it
  },
};
