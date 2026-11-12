// The weather's shared lanes: what any condition may add to, and what every surface, the air and the sun take from,
// whichever conditions there are. A condition says `lanes: (v) => ({ wet, fog, dim })`, what its value adds to each
// (0..1); the host (index.js) sums them. The light's contract (src/world/light.js) reads them: `wet` darkens what it
// lies on, `fog` thickens the air, `dim` holds back the sun's light (a storm's sky). A rain, a mist or a storm is then
// one file of its own, and no material knows it by name.
import { U } from '../../core/uniforms.js';

const AT = { wet: 'x', fog: 'z', dim: 'w' };   // where each lies in uWeather (y is free)
/** the lanes, as nodes */
export const lane = { wet: U.uWeather.x, fog: U.uWeather.z, dim: U.uWeather.w };
/** The sums, written (the host, after any condition's value changed). */
export function writeLanes(sum) { for (const [k, c] of Object.entries(AT)) U.uWeather.value[c] = Math.max(0, sum[k] ?? 0); }
