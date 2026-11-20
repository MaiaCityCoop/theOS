// The wind (world/wind.js): which way the air moves and how hard, written to the shared uniforms (uWind: the way it
// blows to, x and z; its strength; how fast its gusts travel), so every surface that sways follows: the grass bends
// and flutters, the water roughens. The weather panel (src/ui/weather.js) sets it, from calm to a storm, and keeps it.
import { Fn, vec2, sin, mix } from 'three/tsl';
import WIND from '../../../world/wind.js';
import { U } from '../../core/uniforms.js';

const nameOf = (s) => WIND.names.filter(([at]) => s >= at).at(-1)[1];

const rad = (WIND.from * Math.PI) / 180, to = [-Math.sin(rad), Math.cos(rad)];   // blowing away from the bearing it comes from (north -z)

/** the way it blows to (x, z), and how hard, 0 calm … 1 storm */
export const windDir = U.uWind.xy, windStrength = U.uWind.z;
// its push at a point on the land, (x, z) per unit of sway. Gusts roll over the land along the wind, a long swell and a
// shorter, quicker one across it; the harder it blows, the deeper they are and the faster they come (uWind.w: how fast
// its gusts travel, m/s).
const SPACING = 38;
export const windAt = Fn(([p]) => {
  const dir = U.uWind.xy, s = U.uWind.z, along = p.dot(dir), across = p.dot(vec2(dir.y.negate(), dir.x)), t = U.uTime.mul(U.uWind.w);
  const swell = sin(along.sub(t).mul(6.2831853 / SPACING)).mul(0.5).add(0.5), chop = sin(along.mul(2.3).add(across.mul(0.9)).sub(t.mul(1.9)).mul(6.2831853 / SPACING)).mul(0.5).add(0.5);
  const gust = mix(0.75, 0.25, s).add(swell.mul(mix(0.25, 0.6, s))).add(chop.mul(s).mul(0.3));
  return dir.mul(s.mul(gust)).mul(s.mul(s).mul(0.6).add(1));   // the top of the range blows harder still: a storm, not a strong wind
});

/** A weather condition (index.js): the wind's strength, 0 calm … 1 storm. */
export default {
  id: 'wind', label: 'Wind', order: 10, range: [0, 1, 0.01], start: WIND.strength,
  read: nameOf,
  apply(s) { U.uWind.value.set(to[0], to[1], s, WIND.gust.calm + (WIND.gust.storm - WIND.gust.calm) * s); },
};
