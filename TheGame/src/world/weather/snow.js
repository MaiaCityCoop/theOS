// The snow: how deep it lies (metres), written to the shared uniforms (uSnow), so every surface takes it: it settles on
// what faces up (src/world/light.js: snowCover), the ground rises under it and what stands sinks in, the grass shorter
// than it is buried. The weather panel sets it, from none to 30 cm, and keeps it; a film may set it per shot.
import { U } from '../../core/uniforms.js';

const MAX = 0.3, read = (m) => (m < 0.0025 ? 'No snow' : `Snow ${Math.round(m * 100)} cm`);

/** A weather condition (src/world/weather/index.js): the snow's depth, metres. */
export default {
  id: 'snow', label: 'Snow', order: 20, range: [0, MAX, 0.005], start: 0,
  read: (m) => (m < 0.0025 ? '' : read(m)),
  apply(m) { U.uSnow.value = m; },
};
