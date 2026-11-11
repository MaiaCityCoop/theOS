// A ridge tent of canvas: the first thing in Maia City. The asset alone, as data: what it is, how large, its
// colours and its faces. Nothing here knows where it stands or how it is lit; the library builds it
// (assets/index.js) and the world places it (src/world/places.js).
//
// Units are metres. The origin is the middle of its floor; +y is up; the ridge runs along z and the door is
// the end at -z.
const L = 3.4, W = 1.25, H = 1.6, a = L / 2;   // long, half as wide, high
const R0 = [0, H, -a], R1 = [0, H, a], A0 = [-W, 0, -a], A1 = [-W, 0, a], B0 = [W, 0, -a], B1 = [W, 0, a];
const canvas = [0.60, 0.53, 0.38], shade = [0.5, 0.44, 0.31], inside = [0.05, 0.045, 0.035];

export default {
  id: 'tent',
  name: 'Ridge tent',
  kind: 'shelter',
  about: 'A plain ridge tent of canvas, sleeping two. The first thing that stands in Maia City.',
  size: { length: L, width: 2 * W, height: H },
  colours: { canvas, shade, inside },
  clearsGround: 2.2,   // metres around it where no grass grows (src/scatter/ground.js keeps its floor clear)
  // each face: three corners and its colour
  faces: [
    [A0, A1, R1, canvas], [A0, R1, R0, canvas],     // one side of the roof
    [B1, B0, R0, shade], [B1, R0, R1, shade],       // the other
    [A1, B1, R1, canvas],                           // the closed end
    [B0, A0, R0, inside],                           // the open door: dark inside
    [[-W * 0.42, 0, -a - 0.01], [-W, 0, -a - 0.01], [0, H, -a - 0.01], canvas],   // the door's two flaps, tied back
    [[W, 0, -a - 0.01], [W * 0.42, 0, -a - 0.01], [0, H, -a - 0.01], canvas],
  ],
};
