// The clock: the world's date and its time of day, and how fast a day runs. Change a number here and the world's time
// changes; the code (src/world/sky.js) holds none. The one place the world's time is set: what is to come of it (the
// seasons: the date running on; more than one speed) is to be set here too, nowhere else.
//
//   day      the date, as the day of the year (1 January = 1): the sun's height through the seasons; the moon's phase
//   hour     the time of day the game opens at (0 to 24)
//   auto     whether the day runs on its own when the game opens (the weather panel's Auto)
//   speed    in Auto: game hours per real minute (2 = a day in twelve minutes; 6 = a day in four; 24 = a day in a minute)
export default {
  day: 172,
  hour: 10,
  auto: false,
  speed: 2,
};
