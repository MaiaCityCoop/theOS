// The wind (world/wind.js): which way the air moves and how hard, written to the shared uniforms (uWind: the way it
// blows to, x and z; its strength; how fast its gusts travel), so every surface that sways follows: the grass bends
// and flutters, the water roughens. A dial under the clock sets it, from calm to a storm, and keeps it.
import WIND from '../../world/wind.js';
import { U } from '../core/uniforms.js';
import { createDial } from '../core/dial.js';
import { load, save } from '../core/store.js';

const nameOf = (s) => WIND.names.filter(([at]) => s >= at).at(-1)[1];

export function createWind() {
  const rad = (WIND.from * Math.PI) / 180, to = [-Math.sin(rad), Math.cos(rad)];   // blowing away from the bearing it comes from (north -z)
  const set = (s) => { strength = Math.min(1, Math.max(0, s)); U.uWind.value.set(to[0], to[1], strength, WIND.gust.calm + (WIND.gust.storm - WIND.gust.calm) * strength); };
  let strength = 0; set(load('wind', WIND.strength));
  const dial = createDial({ label: 'Wind', min: 0, max: 1, step: 0.01, value: strength, read: nameOf, input: (v) => { set(v); save('wind', strength); } });
  return {
    get strength() { return strength; },
    /** 0 calm … 1 storm (a film may set it per shot) */
    set(s) { set(s); dial?.set(strength); },
  };
}
