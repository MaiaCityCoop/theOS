// The snow: how deep it lies (metres), written to the shared uniforms (uSnow), so every surface takes it: it settles on
// what faces up (src/world/light.js: snowCover), the ground rises under it and what stands sinks in, the grass shorter
// than it is buried. The weather panel sets it, from none to 30 cm, and keeps it; a film may set it per shot.
import { U } from '../core/uniforms.js';
import { weatherRow } from '../ui/weather.js';
import { load, save } from '../core/store.js';

const MAX = 0.3, read = (m) => (m < 0.0025 ? 'No snow' : `Snow ${Math.round(m * 100)} cm`);

export function createSnow() {
  const set = (m) => { U.uSnow.value = Math.min(MAX, Math.max(0, m)); };
  set(load('snow', 0));
  const row = weatherRow({ label: 'Snow', min: 0, max: MAX, step: 0.005, value: U.uSnow.value, read: (m) => (m < 0.0025 ? '' : read(m)), input: (m) => { set(m); save('snow', U.uSnow.value); } });
  return {
    get depth() { return U.uSnow.value; },
    /** metres of snow (a film may set it per shot) */
    set(m) { set(m); row?.set(U.uSnow.value); },
  };
}
