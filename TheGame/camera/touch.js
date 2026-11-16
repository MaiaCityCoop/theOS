// The camera on touch screens (intent 0003): the same rig as with keys and a mouse (camera/rig.js), its inputs from
// fingers. Change a number here and phones and tablets change; the controls hold none (src/camera/touch.js).
//
//   stick   the joystick, in the bottom left corner above the bottom line: its size, its knob, how far in from the corner, the share of its reach that does
//           nothing (so a resting thumb does not walk), and `run`: how far past its rim, in its radii, the thumb goes for Shift's run. Inside the
//           rim it walks, as fast as it is pushed; from the rim out it speeds up evenly to the run, the knob following the thumb out there
//   look    one finger anywhere else: radians per pixel dragged (turning, and tilting up and down at every height)
//   pinch   two fingers: spreading them brings the camera down, pinching takes it up; `speed` is how much height (its
//           logarithm) per doubling of the spread; turning the two fingers turns the camera
export default {
  stick: { size: 112, knob: 46, margin: 0, dead: 0.12, run: 1 },
  look: { speed: 0.0052 },
  pinch: { speed: 1.6, turn: 1 },
};
