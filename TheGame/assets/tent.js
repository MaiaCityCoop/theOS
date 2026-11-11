// A ridge tent of canvas: the first thing in Maia City. An asset, in the one recipe every asset follows
// (assets/index.js): what it is, its size, its colours, its levels of detail, and how it is placed.
//
// Units are metres. The origin is the middle of its floor; +y is up; the ridge runs along z and the door is
// the end at -z.
const L = 3.4, W = 1.25, H = 1.6, a = L / 2;   // long, half as wide, high
const R0 = [0, H, -a], R1 = [0, H, a], A0 = [-W, 0, -a], A1 = [-W, 0, a], B0 = [W, 0, -a], B1 = [W, 0, a];
const canvas = [0.60, 0.53, 0.38], shade = [0.5, 0.44, 0.31], inside = [0.05, 0.045, 0.035];
const roof = [[A0, A1, R1, canvas], [A0, R1, R0, canvas], [B1, B0, R0, shade], [B1, R0, R1, shade]];

export default {
  id: 'tent',
  name: 'Ridge tent',
  kind: 'shelter',
  about: 'A plain ridge tent of canvas, sleeping two. The first thing that stands in Maia City.',
  size: { length: L, width: 2 * W, height: H },
  colours: { canvas, shade, inside },
  // levels of detail, near to far: each is drawn up to `far` metres; past the last, nothing
  lods: [
    { far: 90, faces: [...roof, [A1, B1, R1, canvas], [B0, A0, R0, inside],
      [[-W * 0.42, 0, -a - 0.01], [-W, 0, -a - 0.01], [0, H, -a - 0.01], canvas], [[W, 0, -a - 0.01], [W * 0.42, 0, -a - 0.01], [0, H, -a - 0.01], canvas]] },
    { far: 700, faces: [...roof, [A1, B1, R1, canvas], [B0, A0, R0, shade]] },   // further out: no door, no flaps
  ],
  placement: { at: 'places', clearsGround: 2.2 },   // stood at a named place (src/world/places.js); no grass on its floor
};
