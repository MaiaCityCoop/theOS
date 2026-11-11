// The sun and the sky (intent 0007): one time of day drives the light. Change a number here and the day changes;
// the code (src/world/sky.js) holds none. The world's north is -z, its east +x.
//
//   latitude    where Maia City lies (degrees north): how high the sun climbs
//   day         the date, as the day of the year (1 January = 1): the sun's height through the seasons; the moon's phase
//   hour        the time of day the game opens at (0 to 24)
//   speed       in Auto: game hours per real minute (24 = a day in an hour; 1440 = a day in a minute)
//   auto        whether the day runs on its own when the game opens
//   keys        the light by the sun's height (degrees; below 0 it has set): the sky overhead and at the horizon, the
//               sun's light, the light the sky gives (ambient), the glow round the sun, and the exposure; eased between
//   moon        its light at full, its size; stars: how many show and how bright, by how dark the sky is
export default {
  latitude: 41.2,
  day: 172,
  hour: 10,
  speed: 24,
  auto: false,
  keys: [
    { alt: -18, zenith: [0.006, 0.009, 0.022], horizon: [0.012, 0.017, 0.032], sun: [0, 0, 0], amb: [0.035, 0.045, 0.075], glow: [0, 0, 0], exposure: 2.6 },
    { alt: -8, zenith: [0.02, 0.035, 0.09], horizon: [0.08, 0.09, 0.16], sun: [0, 0, 0], amb: [0.08, 0.1, 0.17], glow: [0.12, 0.07, 0.09], exposure: 1.8 },
    { alt: -2, zenith: [0.07, 0.12, 0.27], horizon: [0.5, 0.33, 0.28], sun: [0.25, 0.1, 0.04], amb: [0.2, 0.2, 0.28], glow: [0.7, 0.32, 0.18], exposure: 1.3 },
    { alt: 3, zenith: [0.14, 0.24, 0.48], horizon: [0.85, 0.55, 0.36], sun: [1.3, 0.72, 0.36], amb: [0.32, 0.33, 0.42], glow: [0.95, 0.5, 0.25], exposure: 1.1 },
    { alt: 12, zenith: [0.2, 0.36, 0.66], horizon: [0.62, 0.66, 0.68], sun: [1.6, 1.32, 1.0], amb: [0.42, 0.48, 0.6], glow: [0.5, 0.36, 0.2], exposure: 1.02 },
    { alt: 35, zenith: [0.24, 0.43, 0.76], horizon: [0.58, 0.72, 0.86], sun: [1.75, 1.66, 1.5], amb: [0.5, 0.56, 0.66], glow: [0.25, 0.22, 0.15], exposure: 1 },
    { alt: 90, zenith: [0.22, 0.42, 0.78], horizon: [0.56, 0.71, 0.87], sun: [1.8, 1.72, 1.58], amb: [0.52, 0.58, 0.68], glow: [0.2, 0.18, 0.12], exposure: 1 },
  ],
  moon: { light: [0.09, 0.11, 0.16], size: 0.009 },
  stars: { count: 0.0035, bright: 1.4 },
};
