// Snow falling. Change a number here and the world's snowfall changes; the code (src/world/snowfall.js) holds none.
//
//   flakes     how many fall round the camera at the heaviest
//   box        the side of the box of air round the camera they fall in, metres (it moves with the camera)
//   fall       how fast a flake falls, m/s; each its own share of it, and the wind carries it
//   size       a flake's size, metres, smallest to largest
//   haze       how much the falling snow thickens the air at the heaviest (the weather's fog)
//   names      what the panel calls an amount, from that amount up
export default {
  flakes: 24000,
  box: 16,
  fall: 1.1,
  size: [0.02, 0.045],
  haze: 0.06,
  names: [[0, ''], [0.02, 'Light snowfall'], [0.4, 'Snowfall'], [0.75, 'Heavy snowfall']],
};
