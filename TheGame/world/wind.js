// The wind. Change a number here and the world's air changes; the code (src/world/wind.js) holds none. North is -z,
// east +x. Every surface that sways reads it through the shading contract (src/world/light.js: windAt).
//
//   from        where it blows from, as a compass bearing (degrees: 0 north, 90 east, 270 west)
//   strength    how hard when the game opens: 0 calm, 1 a storm (the dial in the top right sets it)
//   gust        the gusts that roll over the land: how far apart (m), and how fast they travel in a calm and in a storm (m/s)
//   names       what the dial calls a strength, from that strength up
export default {
  from: 250,
  strength: 0.05,
  gust: { spacing: 38, calm: 3, storm: 22 },
  names: [[0, 'Calm'], [0.08, 'Breeze'], [0.35, 'Wind'], [0.65, 'Gale'], [0.85, 'Storm']],
};
