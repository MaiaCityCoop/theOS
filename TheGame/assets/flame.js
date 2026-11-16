// The flame over the fire pit: its own asset so that only it moves. A placed thing takes the wind through `swayOf`
// (src/world/place.js): held at its foot, moving most at the top, each vertex pushed along its own normal by a sine
// of the time. On a cone that reads as canvas billowing; on tongues of fire it reads as fire. The pit itself
// (assets/firepit.js) stands still beside it, and the two are placed at the same spot (world/places.js).
//
// Units are metres; the origin is the middle of the fire, on the ground.
import { lerp } from './kit/math.js';
import { lcg } from '../src/core/hash.js';
// What a real one measures, and where that is known from (intent 0035): next to what it is, read against the
// world's one scale (world/scale.js) and measured against what it draws by `bun tools/scale.js`.
const MEASURE = {
  real: 'the flames of a campfire',
  hot: 0.9,                          // how high its tallest tongue reaches
  typical: [0.5, 1.2],
  most: 1.5,
  own: ['hot, typical, most: no source with measured flame heights of a campfire was found; the size of the fire under them is sourced'],
  source: [
    'a recreational fire: fuel 0.91 m across or less and 0.61 m high or less (the International Fire Code\'s definition, as fire services quote it)',
  ],
};
const HOT = MEASURE.hot;   // how high the tallest tongue reaches

// a fire's colours, from the heart out: the base is dull red where there is no air, the tips nearly white
const fDeep = [0.55, 0.07, 0.02], fRed = [0.86, 0.16, 0.03], fOrange = [1.0, 0.45, 0.06], fAmber = [1.0, 0.72, 0.16], fPale = [1.0, 0.93, 0.62];
/** A fire's colour at a height up a tongue: dull red at the foot, white at the tip. */
const heat = (v) => (v < 0.18 ? lerp(fDeep, fRed, v / 0.18) : v < 0.45 ? lerp(fRed, fOrange, (v - 0.18) / 0.27) : v < 0.75 ? lerp(fOrange, fAmber, (v - 0.45) / 0.3) : lerp(fAmber, fPale, (v - 0.75) / 0.25));

/** One tongue: a twisted taper from a wide foot to a point, leaning and curling its own way. */
function tongue(f, R, n, scale, reach, lean, seed) {
  const a = seed, rows = 5, base = (0.06 + R() * 0.09) * scale, H = reach, p = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    // the width pinches in and out up the tongue, so it is not a plain cone
    const w = base * (1 - v) ** 1.4 * (1 + 0.55 * Math.sin(v * 5.5 + a));
    const cx = Math.cos(a) * (0.05 + v * lean) * scale + Math.sin(v * 4.2 + a) * 0.035 * scale;
    const cz = Math.sin(a) * (0.05 + v * lean) * scale + Math.cos(v * 3.4 + a) * 0.035 * scale;
    const ring = [];
    for (let i = 0; i < n; i++) { const t = (i / n) * 2 * Math.PI + v * 1.1; ring.push([cx + w * Math.cos(t), 0.03 + v * H, cz + w * Math.sin(t)]); }
    p.push(ring);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) {
    const c = heat((j + 0.5) / rows);
    f.push([p[j][i], p[j][(i + 1) % n], p[j + 1][(i + 1) % n], c], [p[j][i], p[j + 1][(i + 1) % n], p[j + 1][i], c]);
  }
}

/** The fire at one level: `tongues` of `sides` each, and the glow lying on the coals under them. */
function fire(tongues, sides, { bed = true } = {}) {
  const f = [], R = lcg(31337);
  if (bed) {   // what the fire sits in: the coals lit from inside, brightest in the middle
    const n = Math.max(7, sides + 3);
    for (const [r, y, c] of [[0.42, 0.012, lerp(fDeep, [0.18, 0.05, 0.03], 0.5)], [0.3, 0.022, fRed], [0.17, 0.032, fOrange]])
      for (let i = 0; i < n; i++) { const t0 = (i / n) * 2 * Math.PI, t1 = ((i + 1) / n) * 2 * Math.PI, w = 0.85 + R() * 0.3;
        f.push([[0, y + 0.003, 0], [r * w * Math.cos(t1), y, r * w * Math.sin(t1)], [r * w * Math.cos(t0), y, r * w * Math.sin(t0)], c]); }
  }
  // a tall heart with shorter tongues round it, so the fire has a shape rather than a fan of equal spikes
  tongue(f, R, sides, 1.15, HOT, 0.1, 0.4);
  for (let k = 0; k < tongues - 1; k++) {
    const a = (k / (tongues - 1)) * 2 * Math.PI + R() * 0.6;
    tongue(f, R, sides, 0.7 + R() * 0.45, HOT * (0.4 + R() * 0.42), 0.14 + R() * 0.12, a);
  }
  return f;
}

export default {
  uid: 'dea9b8e4-28a7-4b88-b32e-ee498eb7a862',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Flame',
  kind: 'shrub',   // nothing a walker cannot pass, and it casts no shadow of its own (assets/kinds.js)
  about: 'The fire burning over a fire pit: a tall heart with shorter tongues round it, dull red at the foot and near-white at the tips, moving in the wind.',
  measure: MEASURE,
  size: { length: 0.9, width: 0.9, height: HOT + 0.05 },
  colours: { deep: fDeep, red: fRed, orange: fOrange, amber: fAmber, pale: fPale },
  // it is all flutter and no lean: a fire is not pushed over by a breeze, it licks. Held at the coals, wildest at the
  // tips, which is what `hold` in swayOf already does (src/world/place.js)
  wind: { flap: 0.075, billow: 0.012, sway: 0.02 },
  // near to far: every tongue; then fewer and coarser; then the heart alone over its coals
  detail: {
    levels: [
      { faces: fire(7, 7) },
      { faces: fire(5, 5) },
      { faces: fire(3, 4) },
      { faces: fire(1, 4, { bed: false }) },
    ],
  },
  // in the world it is drawn as light, not as these faces (src/world/fire.js, intent 0018): its coals, its flames, its
  // sparks and its smoke, and its light on what stands round it. The faces below are only its picture in the library.
  // width, height: the flames' (metres); bed: the coals' radius; sparks: how many; smoke: how thick; strength: its light
  fire: { width: 0.9, height: 1.05, bed: 0.4, sparks: 48, smoke: 0.7, strength: 1.0 },
  placement: { at: 'places' },
  solid: {},   // you can walk into a fire. Whether you should is your own business
};
