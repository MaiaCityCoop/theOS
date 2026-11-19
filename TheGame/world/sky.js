// The sun and the sky (intent 0007): one time of day drives the light (src/world/sky.js). The sky's light is the air's,
// worked out from where the sun stands (src/world/sky/air.js, its numbers src/world/light/physics.js): no colour of it
// is set here. The world's north is -z, its east +x. The time itself (the date, the hour the game opens at, how fast a
// day runs) is the clock's: world/clock.js.
//
//   latitude    where Maia City lies (degrees north): how high the sun climbs
//   moon        its size (its disc's radius, radians)
//   stars       how many show: the share of the dome's cells that hold one, `cells` of them across a unit of it (each as
//               bright as the night sky's own are: src/world/sky/stars.js)
export default {
  latitude: 41.2,
  moon: { size: 0.009 },
  stars: { count: 0.0035, cells: 260 },
};
