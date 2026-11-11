// The bell tent, the first thing in Maia City (it stands by the river, src/world/places.js). Canvas: round, a short wall, a cone of roof on one centre pole, a door with its flaps tied back,
// guy ropes to pegs all round, a groundsheet. The detailed one of the library: four levels of detail, each its own
// shape, from every rope and peg up close to a plain six-sided cone far away. An asset in the one recipe
// (assets/index.js). Units are metres; the origin is the middle of its floor; the door faces -z.
const R = 2.5, WALL = 0.62, PEAK = 3.0;
const canvas = [0.86, 0.82, 0.71], shade = [0.74, 0.69, 0.57], inside = [0.07, 0.06, 0.05], rope = [0.58, 0.5, 0.37], wood = [0.42, 0.31, 0.2], sheet = [0.24, 0.29, 0.22];
const DOOR = [-Math.PI / 2 - 0.32, -Math.PI / 2 + 0.32];   // the door: the stretch of wall facing -z
const at = (r, y, t) => [r * Math.cos(t), y, r * Math.sin(t)];
const inDoor = (t0, t1) => { const m = (t0 + t1) / 2; return m > DOOR[0] && m < DOOR[1]; };
const lit = (t) => (Math.cos(t - 0.9) > 0 ? canvas : shade);   // the side towards the sun is lighter

function bell(n, { door = true, flaps = false, ropes = 0, pegs = false, pole = false, groundsheet = false } = {}) {
  const f = [], top = [0, PEAK, 0];
  for (let i = 0; i < n; i++) {
    const t0 = -Math.PI / 2 + (i / n) * 2 * Math.PI + Math.PI / n, t1 = t0 + (2 * Math.PI) / n;   // a seam, not a face, faces the door's middle
    const a0 = at(R, 0, t0), a1 = at(R, 0, t1), b0 = at(R, WALL, t0), b1 = at(R, WALL, t1), c = lit((t0 + t1) / 2);
    if (door && inDoor(t0, t1)) { f.push([a0, a1, b1, inside], [a0, b1, b0, inside]); }   // the open door: dark inside
    else { f.push([a0, a1, b1, c], [a0, b1, b0, c]); }                                     // the wall
    f.push([b0, b1, top, c]);                                                               // the roof
  }
  if (door && flaps) {   // the two flaps, tied back beside the door
    for (const s of [-1, 1]) { const t = -Math.PI / 2 + s * 0.42; f.push([at(R + 0.02, 0, t), at(R + 0.02, 0, t + s * 0.22), at(R + 0.02, WALL * 1.15, t), canvas]); }
  }
  if (pole) {   // the centre pole, through the peak
    const w = 0.035, p = (x, z, y) => [x, y, z];
    for (const [x0, z0, x1, z1] of [[-w, -w, w, -w], [w, -w, w, w], [w, w, -w, w], [-w, w, -w, -w]]) f.push([p(x0, z0, 0), p(x1, z1, 0), p(x1, z1, PEAK + 0.18), wood], [p(x0, z0, 0), p(x1, z1, PEAK + 0.18), p(x0, z0, PEAK + 0.18), wood]);
  }
  for (let k = 0; k < ropes; k++) {   // guy ropes from the roof's edge out to the ground, thin as a rope's shadow
    const t = -Math.PI / 2 + Math.PI / ropes + (k / ropes) * 2 * Math.PI, from = at(R * 0.92, WALL + 0.32, t), to = at(R * 1.75, 0.02, t);
    const sx = -Math.sin(t) * 0.012, sz = Math.cos(t) * 0.012;
    f.push([[from[0] - sx, from[1], from[2] - sz], [to[0] - sx, to[1], to[2] - sz], [to[0] + sx, to[1], to[2] + sz], rope], [[from[0] - sx, from[1], from[2] - sz], [to[0] + sx, to[1], to[2] + sz], [from[0] + sx, from[1], from[2] + sz], rope]);
    if (pegs) { const [x, , z] = to, s = 0.025; f.push([[x - s, 0, z], [x + s, 0, z], [x, 0.16, z], wood], [[x, 0, z - s], [x, 0, z + s], [x, 0.16, z], wood]); }
  }
  if (groundsheet) {   // a groundsheet just showing at the door
    const g = R + 0.06; for (let i = 0; i < 12; i++) { const t0 = (i / 12) * 2 * Math.PI, t1 = ((i + 1) / 12) * 2 * Math.PI; f.push([[0, 0.012, 0], at(g, 0.012, t1), at(g, 0.012, t0), sheet]); }
  }
  return f;
}

export default {
  id: 'belltent',
  name: 'Bell tent',
  kind: 'shelter',
  about: 'A round canvas bell tent on one centre pole, five metres across, guyed out on eight ropes. The first thing that stands in Maia City.',
  size: { length: 2 * R * 1.75, width: 2 * R * 1.75, height: PEAK + 0.18 },
  colours: { canvas, shade, inside, rope, wood, groundsheet: sheet },
  // levels of detail, near to far, each its own shape: up close every rope and peg; then fewer seams; far, a cone
  lods: [
    { far: 30, faces: bell(32, { flaps: true, ropes: 8, pegs: true, pole: true, groundsheet: true }) },
    { far: 110, faces: bell(16, { flaps: true, ropes: 8 }) },
    { far: 350, faces: bell(10) },
    { far: 1000, faces: bell(6, { door: false }) },
  ],
  placement: { at: 'places', clearsGround: 3.2 },
};
