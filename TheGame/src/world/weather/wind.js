// The wind (world/wind.js): which way the air moves and how hard, written to the shared uniforms (uWind: the way it
// blows to, x and z; its strength; how fast its gusts travel), so every surface that sways follows: the grass bends
// and flutters, the water roughens. The weather panel (src/ui/weather.js) sets it, from calm to a storm, and keeps it.
import WIND from '../../../world/wind.js';
import { U } from '../../core/uniforms.js';

const nameOf = (s) => WIND.names.filter(([at]) => s >= at).at(-1)[1];

const rad = (WIND.from * Math.PI) / 180, to = [-Math.sin(rad), Math.cos(rad)];   // blowing away from the bearing it comes from (north -z)

/** A weather condition (src/world/weather/index.js): the wind's strength, 0 calm … 1 storm. */
export default {
  id: 'wind', label: 'Wind', order: 10, range: [0, 1, 0.01], start: WIND.strength,
  read: nameOf,
  apply(s) { U.uWind.value.set(to[0], to[1], s, WIND.gust.calm + (WIND.gust.storm - WIND.gust.calm) * s); },
};
