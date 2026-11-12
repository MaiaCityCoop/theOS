// The camera's one source of truth (intent 0003): how high the camera is decides everything else. One value, the
// height above the ground, from the walker's eyes to the whole city; scrolling moves it, nothing switches mode.
// Between the keys below every value follows a smooth curve over the height's logarithm. Change a number here and
// the game's camera changes; the controls hold none of these numbers (src/camera/rig.js).
//
//   h       metres above the ground
//   band    the name shown for it
//   pitch   how far it looks down (radians); null at eye level, where the mouse looks freely
//   fov     the lens: the picture's height in degrees
//   speed   metres a second the keys move it; run: with Shift
//   orbit   0: the camera is the walker's eyes; 1: it hangs back from a point on the ground it looks at
//   lock    the mouse is held for looking (pointer lock) in this band; elsewhere it is a free pointer, to point and pick
export default {
  eye: 1.7,            // the walker's eyes
  top: 12000,          // the highest it goes: the city and the horizon (the height fog thins the air up there, src/world/light.js)
  wheel: 0.0016,       // how fast the wheel changes the height (its logarithm per wheel step)
  climb: 0.75,         // on foot: the steepest ground walked up (metres up per metre on); steeper stops you, as a cut bank does
  stepUp: 0.25,        // a rise lower than this is stepped up whatever its slope (a kerb, a root)
  keys: [
    { h: 1.7, band: 'eye', pitch: null, fov: 68, speed: 3.2, run: 9, orbit: 0, lock: true },
    { h: 5, band: 'street', pitch: -0.32, fov: 64, speed: 7, run: 20, orbit: 1, lock: true },
    { h: 40, band: 'town', pitch: -0.62, fov: 54, speed: 40, run: 120, orbit: 1, lock: false },
    { h: 800, band: 'skyline', pitch: -0.9, fov: 44, speed: 500, run: 1500, orbit: 1, lock: false },
    { h: 12000, band: 'skyline', pitch: -1.05, fov: 40, speed: 6000, run: 18000, orbit: 1, lock: false },
  ],
};
