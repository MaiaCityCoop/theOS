// The bell tent, the first thing in Maia City (it stands by the river, world/places.js). Canvas: round, a short wall, a cone of roof on one centre pole, a door with its flaps tied back,
// guy ropes to pegs all round, a groundsheet. The detailed one of the library: four levels of detail, each its own
// shape, from every rope and peg up close (and an inside to walk into, through the door) to a plain six-sided cone far away. An asset in the one recipe
// (assets/index.js). Units are metres; the origin is the middle of its floor; the door faces -z.
const R = 2.5, WALL = 0.62, PEAK = 3.0;
const canvas = [0.86, 0.82, 0.71], shade = [0.74, 0.69, 0.57], inside = [0.07, 0.06, 0.05], rope = [0.58, 0.5, 0.37], wood = [0.42, 0.31, 0.2], sheet = [0.24, 0.29, 0.22];
const floorPale = [0.8, 0.76, 0.66], lining = [0.74, 0.55, 0.3], lining2 = [0.66, 0.48, 0.26], rug = [0.55, 0.27, 0.16], rug2 = [0.78, 0.6, 0.32], linen = [0.84, 0.8, 0.7], wool = [0.3, 0.38, 0.29], lamp = [1.0, 0.82, 0.42];
const DOOR_W = 0.36, DOOR_H = 2.05;   // the door: half its width as an angle round the tent, and how high it reaches into the roof
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

function bell(n, { door = true, open = false, bare = false, flaps = false, ropes = 0, pegs = false, pole = false, groundsheet = false } = {}) {
  const f = [], top = [0, PEAK, 0];
  if (open) {   // up close the door is a real opening, and there is an inside to walk into
    skin(f, n, R, (t) => doorTop(t + Math.PI / 2), lit, 6); furnish(f, n); door = false;
  } else if (bare) {   // further off, still an opening: a pale floor and the lit canvas within, nothing else
    skin(f, n, R, (t) => doorTop(t + Math.PI / 2), lit, 3); skin(f, n, R - 0.03, (t) => doorTop(t + Math.PI / 2), () => lining, 3);
    disc(f, 0, 0, R - 0.05, 0.06, floorPale, n); door = false;
  } else for (let i = 0; i < n; i++) {
    const t0 = -Math.PI / 2 + (i / n) * 2 * Math.PI + Math.PI / n, t1 = t0 + (2 * Math.PI) / n;   // a seam, not a face, faces the door's middle
    const a0 = at(R, 0, t0), a1 = at(R, 0, t1), b0 = at(R, WALL, t0), b1 = at(R, WALL, t1), c = lit((t0 + t1) / 2);
    f.push([a0, a1, b1, c], [a0, b1, b0, c]);   // the wall
    f.push([b0, b1, top, c]);                                                               // the roof
  }
  if (door) {   // the open door, laid just outside the canvas: from the ground, through the wall, up into the roof to a point
    // in small pieces that follow the curve of wall and roof: a flat door across a round tent would sink into it
    const m = -Math.PI / 2, e = 0.02, H = 8, Wn = 6;
    const half = (y) => (y <= WALL ? DOOR_W * (1 - 0.06 * y / WALL) : DOOR_W * 0.94 * (1 - (y - WALL) / (DOOR_H - WALL)));
    const on = (y, k) => { const w = half(y), t = m - w + (2 * w * k) / Wn; return at((y <= WALL ? R : coneR(y)) + e, y, t); };
    const ys = [0, WALL / 2, WALL]; for (let j = 1; j <= H; j++) ys.push(WALL + ((DOOR_H - WALL) * j) / H);   // a break exactly where the wall meets the roof
    for (let j = 0; j < ys.length - 1; j++) { const y0 = ys[j], y1 = ys[j + 1];
      for (let k = 0; k < Wn; k++) f.push([on(y0, k), on(y0, k + 1), on(y1, k + 1), inside], [on(y0, k), on(y1, k + 1), on(y1, k), inside]); }
    if (flaps) for (const s of [-1, 1]) {   // its two flaps, rolled back and tied beside it
      const t = m + s * (DOOR_W + 0.06), u = m + s * (DOOR_W + 0.3);
      f.push([at(R + e * 2, 0, t), at(R + e * 2, 0, u), at(coneR(DOOR_H * 0.82) + e * 2, DOOR_H * 0.82, t), shade]);
    }
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
  size: { length: 2 * R * 1.75, width: 2 * R * 1.75, height: PEAK + 0.18 },
  colours: { canvas, shade, inside, rope, wood, groundsheet: sheet },
  // levels of detail, near to far, each its own shape: up close every rope and peg; then fewer seams; far, a cone
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, shelter (assets/kinds.js)
  detail: {
    levels: [
      { faces: bell(32, { open: true, flaps: true, ropes: 8, pegs: true, pole: true, groundsheet: true }) },
      { faces: bell(16, { bare: true, flaps: true, ropes: 8 }) },
      { faces: bell(10, { bare: true }) },
      { faces: bell(6, { door: false }) },
    ],
  },
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
