// The camera's one source of truth (intent 0003): how high the camera is decides everything else. One value, the
// height above the ground, from the walker's eyes to the whole city; scrolling moves it, nothing switches mode.
// Between the keys below every value follows a smooth curve over the height's logarithm. Change a number here and
// the game's camera changes; the controls hold none of these numbers (src/camera/rig.js).
//
//   h       metres above the ground
//   band    the name shown for it
//   pitch   how far it looks down at this height when left alone (radians); null at eye level, where it looks ahead
//   mm      the lens: a focal length of the film camera's kit (cine/lenses.js: the Master Anamorphics, the same glass
//           the films see through), framed 16 : 9; between keys it zooms, evenly in stops (intent 0034)
//   speed   metres a second the keys move it; run: with Shift
//   orbit   0: the camera is the walker's eyes; 1: it hangs back from a point on the ground it looks at
//   lock    the mouse is held for looking (pointer lock) in this band, POV; elsewhere it is a free pointer, to point and pick
//
// At every height the view looks around (intent 0014): where the mouse is held by moving it, elsewhere by a drag; left
// and right turns, up and down tilts the view away from the height's own pitch. `tilt` says how far: up and down the bounds of the pitch (radians), drag
// radians per pixel, fade how fast a tilt eases back to the height's own as the height changes (per unit of its
// logarithm: a small scroll keeps the tilt you chose, a long one comes to the height's natural view).
import { WALKER } from '../world/scale.js';

export default {
  eye: WALKER.eye,     // the walker's eyes: the person's (world/scale.js)
  walk: 4,             // under this height the point the camera hangs over is a walker: what is solid stops him, and ground
                       // too steep to walk up; higher, it moves freely over the city (zoomed out, nothing on the ground is hit)
  top: 12000,          // the highest it goes: the city and the horizon (the height fog thins the air up there, src/world/light.js)
  wheel: 0.0016,       // how fast the wheel changes the height (its logarithm per wheel step)
  climb: 0.75,         // on foot: the steepest ground walked up (metres up per metre on); steeper stops you, as a cut bank does
  stepUp: 0.25,        // a rise lower than this is stepped up whatever its slope (a kerb, a root)
  tilt: { up: 1.2, down: -1.5, drag: 0.0022, fade: 0.5 },
  glass: 1,            // how much of the film camera's glass the walker looks through (its barrel and the light lost at the
                       // corners: src/core/temporal.js); 0: none. ?glass= tries another
  keys: [
    { h: WALKER.eye, band: 'eye', pitch: null, mm: 28, speed: 3.2, run: 9, orbit: 0, lock: true },        // the kit's widest: the anamorphic walk
    { h: 5, band: 'street', pitch: -0.32, mm: 35, speed: 7, run: 20, orbit: 1, lock: true },
    { h: 40, band: 'town', pitch: -0.62, mm: 40, speed: 40, run: 120, orbit: 1, lock: false },
    { h: 800, band: 'skyline', pitch: -0.9, mm: 50, speed: 500, run: 1500, orbit: 1, lock: false },      // a long lens over the city: the aerial look
    { h: 12000, band: 'skyline', pitch: -1.05, mm: 50, speed: 6000, run: 18000, orbit: 1, lock: false },
  ],
};
