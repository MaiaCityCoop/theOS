// The camera on touch screens (intent 0003): the same rig as with keys and a mouse (camera/rig.js), its inputs from
// fingers. Change a number here and phones and tablets change; the controls hold none (src/camera/touch.js).
//
//   stick   the joystick, in the bottom left corner above the bottom line: its size, its knob, how far in from the corner, the share of its reach that does
//           nothing (so a resting thumb does not walk), and Shift's run when pushed past `run` of its reach
//   look    one finger anywhere else: radians per pixel dragged (turning, and tilting up and down at every height)
//   pinch   two fingers: spreading them brings the camera down, pinching takes it up; `speed` is how much height (its
//           logarithm) per doubling of the spread; turning the two fingers turns the camera
export default {
  stick: { size: 112, knob: 46, margin: 0, dead: 0.12, run: 0.92 },
  look: { speed: 0.0052 },
  pinch: { speed: 1.6, turn: 1 },
};
