// The camera's one source of truth (intent 0003): how high the camera is decides everything else. One value, the
// height above the ground, from the walker's eyes to the whole city; scrolling moves it, nothing switches mode.
// Between the keys below every value follows a smooth curve over the height's logarithm. Change a number here and
// the game's camera changes; the controls hold none of these numbers (src/camera/rig.js).
//
//   h       metres above the ground
//   band    the name shown for it
//   pitch   how far it looks down at this height when left alone (radians); null at eye level, where it looks ahead
//   fov     the lens: the picture's height in degrees
//   speed   metres a second the keys move it; run: with Shift
//   orbit   0: the camera is the walker's eyes; 1: it hangs back from a point on the ground it looks at
//
// At every height a drag looks around (intent 0014): left and right turns, up and down tilts the view away from the
// height's own pitch, the mouse never held. `tilt` says how far: up and down the bounds of the pitch (radians), drag
// radians per pixel, fade how fast a tilt eases back to the height's own as the height changes (per unit of its
// logarithm: a small scroll keeps the tilt you chose, a long one comes to the height's natural view).
export default {
  eye: 1.7,            // the walker's eyes
  top: 12000,          // the highest it goes: the city and the horizon (the height fog thins the air up there, src/world/light.js)
  wheel: 0.0016,       // how fast the wheel changes the height (its logarithm per wheel step)
  climb: 0.75,         // on foot: the steepest ground walked up (metres up per metre on); steeper stops you, as a cut bank does
  stepUp: 0.25,        // a rise lower than this is stepped up whatever its slope (a kerb, a root)
  tilt: { up: 1.2, down: -1.5, drag: 0.0022, fade: 0.5 },
  keys: [
    { h: 1.7, band: 'eye', pitch: null, fov: 68, speed: 3.2, run: 9, orbit: 0 },
    { h: 5, band: 'street', pitch: -0.32, fov: 64, speed: 7, run: 20, orbit: 1 },
    { h: 40, band: 'town', pitch: -0.62, fov: 54, speed: 40, run: 120, orbit: 1 },
    { h: 800, band: 'skyline', pitch: -0.9, fov: 44, speed: 500, run: 1500, orbit: 1 },
    { h: 12000, band: 'skyline', pitch: -1.05, fov: 40, speed: 6000, run: 18000, orbit: 1 },
  ],
};
