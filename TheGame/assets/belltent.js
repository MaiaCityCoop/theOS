// The bell tent, the first thing in Maia City (it stands by the river, world/places.js). Canvas: round, a short wall, a
// cone of roof on one centre pole, its door open, guy ropes to pegs all round, a groundsheet, and an
// inside to walk into, through the door. It says only what it is, every rope and peg: every coarser version of it is the
// builder's (assets/kit/made.js). An asset in the one recipe (assets/index.js). Units are metres; the origin is the
// middle of its floor; the door faces -z.
// What a real one measures, and where that is known from (intent 0035): next to what it is, read against the
// world's one scale (world/scale.js) and measured against what it draws by `bun tools/scale.js`.
const MEASURE = {
  real: 'a 5 m cotton-canvas bell tent on one centre pole',
  diameter: 5,                       // its round, on the ground
  wall: 0.62,                        // its short wall, ground to roof
  peak: 3.0,                         // the roof's point, on the pole
  cap: 0.18,                         // the pole's top over the peak
  door: { height: 1.8, width: 1.32 },  // the opening: how high it reaches into the roof, how wide it is at the ground
  typical: [3.0, 3.3],               // its peak and the pole's cap over it
  most: 3.4,
  own: ['cap: the pole\'s top over the canvas'],
  source: [
    'makers\' sheets of 5 m bell tents, read 2026-11-16: centre pole 3.0 m (Mountain Warehouse, Stonegate; 3.1 m the Kokoon Deluxe XL); walls about 0.6 m (0.8 m on the XL); doors 1.5 m (Mountain Warehouse Lite), 1.68 m high and 1.32 m wide (Trade Tested 5 m Pro), 1.7 m (Stonegate 500), 1.8 m (Mountain Warehouse polycotton), 2.0 m (Boutique Camping, the Kokoon XL with its taller walls)',
  ],
};
const R = MEASURE.diameter / 2, WALL = MEASURE.wall, PEAK = MEASURE.peak, CAP = MEASURE.cap;
const canvas = [0.86, 0.82, 0.71], shade = [0.74, 0.69, 0.57], inside = [0.07, 0.06, 0.05], rope = [0.58, 0.5, 0.37], wood = [0.42, 0.31, 0.2], sheet = [0.24, 0.29, 0.22];
const lining = [0.74, 0.55, 0.3], lining2 = [0.66, 0.48, 0.26], rug = [0.55, 0.27, 0.16], rug2 = [0.78, 0.6, 0.32], linen = [0.84, 0.8, 0.7], wool = [0.3, 0.38, 0.29], lamp = [1.0, 0.82, 0.42];
const DOOR_W = MEASURE.door.width / 2 / R, DOOR_H = MEASURE.door.height;   // the door: half its width as an angle round the tent, and how high it reaches into the roof
const at = (r, y, t) => [r * Math.cos(t), y, r * Math.sin(t)];
const coneR = (y) => R * (PEAK - y) / (PEAK - WALL);   // the roof's radius at a height
const lit = (t) => (Math.cos(t - 0.9) > 0 ? canvas : shade);   // the side towards the sun is lighter

// how high the open door reaches at an angle d from its middle (0 where there is no door)
function doorTop(d) {
  const w0 = DOOR_W, w1 = DOOR_W * 0.94; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
  if (d >= w0) return 0;
  if (d >= w1) return WALL * (w0 - d) / (w0 - w1);
  return WALL + (DOOR_H - WALL) * (1 - d / w1);
}
// a box: centre (x, z), sizes w (along x) × d (along z), from y0 to y1, turned by a about the up axis; no bottom
function box(f, x, z, w, d, y0, y1, c, a = 0, ctop = c) {
  const ca = Math.cos(a), sa = Math.sin(a), p = (u, v, y) => [x + u * ca - v * sa, y, z + u * sa + v * ca], u = w / 2, v = d / 2;
  const q = [[-u, -v], [u, -v], [u, v], [-u, v]];
  for (let i = 0; i < 4; i++) { const [a0, b0] = q[i], [a1, b1] = q[(i + 1) % 4]; f.push([p(a0, b0, y0), p(a1, b1, y0), p(a1, b1, y1), c], [p(a0, b0, y0), p(a1, b1, y1), p(a0, b0, y1), c]); }
  f.push([p(-u, -v, y1), p(u, -v, y1), p(u, v, y1), ctop], [p(-u, -v, y1), p(u, v, y1), p(-u, v, y1), ctop]);
}
// a flat round on the floor
function disc(f, x, z, r, y, c, n = 20) { for (let i = 0; i < n; i++) { const t0 = (i / n) * 2 * Math.PI, t1 = ((i + 1) / n) * 2 * Math.PI; f.push([[x, y, z], [x + r * Math.cos(t1), y, z + r * Math.sin(t1)], [x + r * Math.cos(t0), y, z + r * Math.sin(t0)], c]); } }

// the canvas as thin strips round the tent, from a bottom (where the door is open, above it) up to the peak; at radius rr
function skin(f, n, rr, bottom, colour, sub) {
  const top = [0, PEAK, 0], cr = (y) => coneR(y) * rr / R;
  for (let i = 0; i < n; i++) for (let k = 0; k < sub; k++) {
    const t0 = -Math.PI / 2 + Math.PI / n + ((i + k / sub) / n) * 2 * Math.PI, t1 = t0 + (2 * Math.PI) / n / sub;
    const c = colour((-Math.PI / 2 + Math.PI / n + ((i + 0.5) / n) * 2 * Math.PI)), ya = bottom(t0), yb = bottom(t1);   // each edge its own bottom: the door's line, not steps
    const b0 = at(rr, WALL, t0), b1 = at(rr, WALL, t1);
    if (ya < WALL || yb < WALL) { const a0 = at(rr, Math.min(ya, WALL), t0), a1 = at(rr, Math.min(yb, WALL), t1); f.push([a0, a1, b1, c], [a0, b1, b0, c]); }
    const ra = Math.max(ya, WALL), rb = Math.max(yb, WALL);
    if (ra < PEAK - 1e-3 || rb < PEAK - 1e-3) f.push([at(cr(ra), ra, t0), at(cr(rb), rb, t1), top, c]);
  }
}

// the inside: a lining to the canvas, a rug, a cot along the back, a crate for a table, a stool, a lantern on the pole
function furnish(f, n) {
  const m = -Math.PI / 2;
  let k = 0; skin(f, n, R - 0.025, (t) => doorTop(t - m), () => (Math.floor(k++ / 6) & 1 ? lining : lining2), 6);   // the sun through the canvas: warm, panel by panel
  disc(f, 0, 0.15, 1.25, 0.08, rug, 28); disc(f, 0, 0.15, 0.95, 0.084, rug2, 28); disc(f, 0, 0.15, 0.8, 0.088, rug, 28);
  box(f, 0, 1.55, 1.95, 0.82, 0, 0.3, wood);                                   // the cot: a frame,
  box(f, 0, 1.55, 1.85, 0.74, 0.3, 0.42, linen);                               // its mattress,
  box(f, 0.25, 1.55, 1.3, 0.78, 0.42, 0.47, wool);                             // a blanket
  box(f, -0.72, 1.55, 0.36, 0.5, 0.42, 0.53, linen);                           // and a pillow
  box(f, 1.35, 0.35, 0.5, 0.5, 0, 0.48, wood, 0.4, [0.5, 0.38, 0.24]);         // a crate, the table
  box(f, 1.3, 0.38, 0.12, 0.12, 0.48, 0.66, [0.2, 0.2, 0.22], 0.4, lamp);      // a candle lamp on it
  box(f, 0.7, -0.35, 0.34, 0.34, 0, 0.42, wood, 0.9);                           // a stool
  box(f, -1.2, 0.6, 0.6, 0.4, 0, 0.36, [0.36, 0.29, 0.2], -0.5, [0.44, 0.35, 0.24]); // a chest for things
  box(f, 0.11, 0, 0.1, 0.1, 1.82, 2.02, [0.16, 0.15, 0.14], 0, lamp);          // the lantern, hung on the pole
  box(f, 0.11, 0, 0.13, 0.13, 2.02, 2.05, [0.16, 0.15, 0.14]);
}

function bell(n, { ropes = 0, pegs = false, pole = false, groundsheet = false } = {}) {
  const f = [];
  // the door a real opening, and an inside to walk into
  skin(f, n, R, (t) => doorTop(t + Math.PI / 2), lit, 6); furnish(f, n);
  if (pole) {   // the centre pole, through the peak
    const w = 0.035, p = (x, z, y) => [x, y, z];
    for (const [x0, z0, x1, z1] of [[-w, -w, w, -w], [w, -w, w, w], [w, w, -w, w], [-w, w, -w, -w]]) f.push([p(x0, z0, 0), p(x1, z1, 0), p(x1, z1, PEAK + CAP), wood], [p(x0, z0, 0), p(x1, z1, PEAK + CAP), p(x0, z0, PEAK + CAP), wood]);
  }
  for (let k = 0; k < ropes; k++) {   // guy ropes from the roof's edge out to the ground, thin as a rope's shadow
    const t = -Math.PI / 2 + Math.PI / ropes + (k / ropes) * 2 * Math.PI, from = at(R * 0.92, WALL + 0.32, t), to = at(R * 1.75, 0.02, t);
    const sx = -Math.sin(t) * 0.012, sz = Math.cos(t) * 0.012;
    f.push([[from[0] - sx, from[1], from[2] - sz], [to[0] - sx, to[1], to[2] - sz], [to[0] + sx, to[1], to[2] + sz], rope], [[from[0] - sx, from[1], from[2] - sz], [to[0] + sx, to[1], to[2] + sz], [from[0] + sx, from[1], from[2] + sz], rope]);
    if (pegs) { const [x, , z] = to, s = 0.025; f.push([[x - s, 0, z], [x + s, 0, z], [x, 0.16, z], wood], [[x, 0, z - s], [x, 0, z + s], [x, 0.16, z], wood]); }
  }
  if (groundsheet) {   // the floor: a heavy sewn-in groundsheet over the whole round, turned up the wall a hand high (a bathtub floor), its seams in panels; and a sill across the door
    const g = R - 0.04, y = 0.07, lip = 0.16, floorA = [0.27, 0.31, 0.23], floorB = [0.24, 0.28, 0.2];
    for (let i = 0; i < n; i++) { const t0 = (i / n) * 2 * Math.PI, t1 = ((i + 1) / n) * 2 * Math.PI, c = i & 1 ? floorA : floorB;
      f.push([[0, y, 0], at(g, y, t1), at(g, y, t0), c]);
      if (Math.abs(Math.atan2(Math.sin((t0 + t1) / 2 + Math.PI / 2), Math.cos((t0 + t1) / 2 + Math.PI / 2))) > DOOR_W) f.push([at(g, y, t0), at(g, y, t1), at(g, y + lip, t1), c], [at(g, y, t0), at(g, y + lip, t1), at(g, y + lip, t0), c]); }
    for (let k = 0; k < 6; k++) { const t0 = -Math.PI / 2 - DOOR_W + (k / 6) * 2 * DOOR_W, t1 = t0 + (2 * DOOR_W) / 6;   // the door's sill: the floor's edge, a step over it
      f.push([at(g, y, t0), at(g, y, t1), at(g, y + 0.05, t1), floorB], [at(g, y, t0), at(g, y + 0.05, t1), at(g, y + 0.05, t0), floorB]); }
  }
  return f;
}

export default {
  uid: '104dde1e-c26e-42fd-9aab-c6612fbe8222',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Bell tent',
  kind: 'shelter',
  roofed: 2.45,   // metres round its middle under its roof: no snow falls there (kinds.js: snow)
  about: 'A round canvas bell tent on one centre pole, five metres across, guyed out on eight ropes. The first thing that stands in Maia City.',
  measure: MEASURE,
  size: { length: 2 * R * 1.75, width: 2 * R * 1.75, height: PEAK + CAP },
  colours: { canvas, shade, inside, rope, wood, groundsheet: sheet },
  // all it is, up close: every coarser version of it is the builder's (assets/kit/made.js)
  faces: bell(32, { ropes: 8, pegs: true, pole: true, groundsheet: true }),
  placement: { at: 'places', clearsGround: 3.2 },
  // what a walker cannot pass, in its own frame (the origin the middle of its floor, the door towards -z):
  // walls (a round, with the gaps that can be walked through), posts, boxes; and the height of what is overhead
  solid: {
    walls: [{ round: R - 0.05, gaps: [[-Math.PI / 2, DOOR_W * 0.8]] }],
    posts: [{ x: 0, z: 0, r: 0.05 }],
    boxes: [{ x: 0, z: 1.55, w: 1.95, d: 0.82 }, { x: 1.35, z: 0.35, w: 0.5, d: 0.5, a: 0.4 }, { x: -1.2, z: 0.6, w: 0.6, d: 0.4, a: -0.5 }],
    ceiling: (x, z) => { const r = Math.hypot(x, z); if (r > R) return Infinity; const d = Math.atan2(z, x) + Math.PI / 2; return Math.max(PEAK - (r * (PEAK - WALL)) / R, Math.abs(d) < DOOR_W * 0.8 && r > R - 0.4 ? DOOR_H : 0); },
  },
};
