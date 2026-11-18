// The fire pit: the second thing in Maia City, out on the grass in front of the tent (world/places.js). A ring of
// river stones sooted black on their inner faces, a bed of ash with charcoal and half-burnt ends still in it, a live
// fire over it, and log rounds cut from a pine to sit on.
//
// It is made of four of the world's materials (`materials` below), each wrapped round the shape from three sides by
// the shader (src/world/place.js) exactly as the world's rocks wear theirs, so the stone is real stone and the bark
// real bark. A face's own colour (one, or one per corner) is then only a tint on the material it names: 1 leaves it as it is, less darkens it
// (the soot on the stones' inner faces, the char on a burnt end), more lifts it. The shapes still carry what no
// material can: the stones' worn round bodies, the ridges of the bark, the rings of a sawn end. Units are metres; the
// origin is the middle of the fire, on the ground.
import { noise3 } from './kit/blob.js';
import { lerp } from './kit/math.js';
import { lcg } from '../src/core/hash.js';
// What a real one measures, and where that is known from (intent 0035): next to what it is, read against the
// world's one scale (world/scale.js) and measured against what it draws by `bun tools/scale.js`.
const MEASURE = {
  real: 'a ring of stones round a fire on the ground, seats round it',
  ring: 0.62,                        // the ring's radius, to its stones' middle: 1.24 m across, a group's fire ring
  seat: { height: 0.44, width: 0.48, from: 1.74 },   // a seat's height and width, and how far it stands from the fire's middle
  typical: [0.4, 0.5],               // what stands highest of it: its seats
  most: 0.6,
  own: ['seat.from: how far the seats stand from the fire'],
  source: [
    'campfire rings, makers\' sheets read 2026-11-16: 0.61 and 0.76 m inside for one camp (Pilot Rock FSW-26/7, FA-30), 1.17 and 1.37 m for a group (FS-48, FSW-56)',
    'a campfire 0.9 m across or less (Minnesota DNR, campfire safety)',
    'seats: 0.43 to 0.48 m high (Sunshine Coast Council\'s design guide: most at 0.45 m; Inclusive Mobility 2021: 0.47 to 0.48 m)',
  ],
};

const RING = MEASURE.ring, SEAT_R = MEASURE.seat.from, SEAT_H = MEASURE.seat.height, SEAT_W = MEASURE.seat.width;

// tints on the stone (the river's pebble): its own grey, a little warm or cool; where it faces the fire, sooted near black
const stone = [0.8, 0.78, 0.76], stoneWarm = [0.9, 0.8, 0.69], stoneCool = [0.7, 0.75, 0.82], soot = [0.12, 0.115, 0.11];
// the charcoal in the ash
const coal = [0.13, 0.13, 0.13];
// on the bark and on a sawn face: the ridges catching the light, the splits between them, and wood burnt to charcoal
const bark = [1, 1, 1], charred = [0.1, 0.1, 0.105];
const wood0 = [0.82, 0.8, 0.77], grain = [0.66, 0.61, 0.56];

/** A tint nudged a little: no two stones, no two ridges quite alike, under the same material. */
const vary = (c, R, k = 0.07) => { const d = (R() - 0.5) * 2 * k; return [Math.max(0, c[0] + d), Math.max(0, c[1] + d), Math.max(0, c[2] + d)]; };

/** A smooth surface from a grid of points P[row][col] and their colours C, shaded smooth across its faces (a normal
    at every corner, the faces round it summed). `poles`: [first, last], which of its first and last rows are one point
    each (a ball's both; a mound's middle). Its
    columns wrap round (a ball, a log) unless `open`. */
function skin(f, P, C, part, poles = [false, false], open = false) {
  const rows = P.length - 1, N = P[0].length, cols = open ? N - 1 : N;
  const Nn = P.map((row) => row.map(() => [0, 0, 0])), add = (n, v) => { n[0] += v[0]; n[1] += v[1]; n[2] += v[2]; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], quads = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const i1 = (i + 1) % N, q = [[j, i], [j, i1], [j + 1, i1], [j + 1, i]];
    const d1 = sub(P[j + 1][i1], P[j][i]), d2 = sub(P[j + 1][i], P[j][i1]);   // across its diagonals (a quad at a pole has two corners in one)
    const n = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
    for (const [a, b] of q) add(Nn[a][b], n);
    quads.push(q);
  }
  for (const j of [poles[0] ? 0 : -1, poles[1] ? rows : -1]) { if (j < 0) continue; const n = [0, 0, 0]; for (let i = 0; i < N; i++) add(n, Nn[j][i]); for (let i = 0; i < N; i++) Nn[j][i] = n; }
  const unit = (n) => { const l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l]; };
  for (const q of quads) {
    const [a, b, c, d] = q.map(([j, i]) => ({ p: P[j][i], c: C[j][i], n: unit(Nn[j][i]) }));
    if (!(poles[0] && q[0][0] === 0)) f.push([a.p, c.p, b.p, [a.c, c.c, b.c], part, [a.n, c.n, b.n]]);
    if (!(poles[1] && q[2][0] === rows)) f.push([a.p, d.p, c.p, [a.c, d.c, c.c], part, [a.n, d.n, c.n]]);
  }
}

/** A river stone (intent 0018): worn round, no flat facet anywhere. A ball of `rows` bands of `N` sides, stretched
    along the ring (`along`, the way round it) and squashed low, its outline pulled in and out by slow noise so no two
    are alike, its foot sunk in the ground; shaded smooth across its faces (a normal at every corner). The soot lies on
    the side that faces the fire, thickest low down where the flames lick it, fading over its top; the rest the river's
    own grey, a little warm or cool. `part` and `tint` as for the boulder: the lumps in the bed wear the ash, as coal. */
function riverStone(f, x, z, r, h, R, inward, along, N = 16, rows = 8, part = 'stone', tint = null, y0 = 0) {
  const s = Math.floor(R() * 1e6), el = 1.0 + R() * 0.5, sq = 1 / el, ca = Math.cos(along), sa = Math.sin(along);
  const own = tint ?? vary([stone, stoneWarm, stoneCool][Math.floor(R() * 3)], R, 0.06), toX = Math.cos(inward), toZ = Math.sin(inward);
  const P = [], C = [];
  for (let j = 0; j <= rows; j++) {
    const phi = (j / rows) * Math.PI, row = [], crow = [];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * 2 * Math.PI, ux = Math.sin(phi) * Math.cos(th), uy = Math.cos(phi), uz = Math.sin(phi) * Math.sin(th);
      // its shape: a squashed ball, lumpy in a slow way and only a little in a fine one (worn by water, not broken)
      const k = 1 + 0.14 * (noise3(ux * 1.6 + 3, uy * 1.6, uz * 1.6, s) - 0.5) * 2 + 0.035 * (noise3(ux * 4.5, uy * 4.5 + 7, uz * 4.5, s + 1) - 0.5) * 2;
      const lx = ux * r * el * k, lz = uz * r * sq * k, ly = uy * h * 0.5 * k * (uy > 0 ? 1 : 0.8);   // (flatter underneath: it has settled)
      const wx = x + lx * ca - lz * sa, wz = z + lx * sa + lz * ca, wy = y0 + h * 0.42 + ly - 0.04;   // (its foot in the ground, or in the ash: y0)
      row.push([wx, wy, wz]);
      // soot: how far this point faces the fire, and how low it is
      const face = ((wx - x) * toX + (wz - z) * toZ) / (r * el), low = 1 - Math.min(1, Math.max(0, wy / (h * 0.9)));
      const black = Math.min(1, Math.max(0, (face + 0.4) * 1.1)) * (0.5 + 0.5 * low) * (0.85 + 0.3 * noise3(ux * 3, uy * 3, uz * 3, s + 2));   // (in patches)
      crow.push(tint ? lerp(tint, soot, black * 0.3) : lerp(own, soot, Math.min(1, black * 0.95)));
    }
    P.push(row); C.push(crow);
  }
  skin(f, P, C, part, [true, true]);
}

const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** A piece of wood (intent 0018): a round, a log, a stick. From `c0` along the unit axis `A` for `len` metres, `r`
    thick at its foot; a little thinner towards its other end, its girth swelling and pinching as wood does, never a
    straight tube; bark all round, shaded smooth. Its ends (`caps`: which of the two are drawn) sawn: the end grain in
    rings, heartwood dark in the middle, a band of bark round it. `char` 0 … 1: how much of it the fire has had, from
    the middle out (charcoal, cracked; its ends then burnt too, not sawn). `N` sides, `K` rings along it. */
function wood(f, c0, A, len, r, R, { N = 18, K = 8, caps = [true, true], char = 0, taper = 0.12, seed = 0 } = {}) {
  A = norm3(A);
  const up = Math.abs(A[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = norm3(add3(up, A, -(up[0] * A[0] + up[1] * A[1] + up[2] * A[2]))), e2 = cross3(A, e1);
  const s = seed || Math.floor(R() * 1e6), P = [], C = [], rad = [];
  const tone = vary(bark, R, 0.05);
  for (let k = 0; k <= K; k++) {
    const u = k / K, row = [], crow = [], mid = 1 - Math.abs(u - 0.5) * 2, burn = char > 0 ? Math.min(1, Math.max(0, (mid - (1 - char)) * 3)) : 0;
    const ru = r * (1 - taper * u) * (1 - 0.25 * burn);   // (thinner where it has burned away)
    rad.push(ru);
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 2 * Math.PI, ct = Math.cos(t), st = Math.sin(t);
      // girth: a slow swell along it and round it, and the bark's plates, a little proud of the splits between them
      const swell = 1 + 0.06 * (noise3(u * len * 2.2, ct * 0.8, st * 0.8, s) - 0.5) * 2;
      const plates = 1 + 0.025 * (noise3(u * len * 9, ct * 2.5, st * 2.5, s + 1) - 0.5) * 2;
      const rr = ru * swell * plates, dir = add3(add3([0, 0, 0], e1, ct), e2, st);
      row.push(add3(add3(c0, A, u * len), dir, rr));
      const lit = (plates - 1) * 8;   // the plates catch the light, the splits between them stay dark
      const b0 = [tone[0] * (1 + lit * 0.4), tone[1] * (1 + lit * 0.4), tone[2] * (1 + lit * 0.4)];
      crow.push(burn > 0 ? lerp(b0, lerp(charred, [0.08, 0.08, 0.085], noise3(u * 30, ct * 4, st * 4, s + 2)), burn) : b0);
    }
    P.push(row); C.push(crow);
  }
  skin(f, P, C, 'bark');
  // the ends: sawn, the end grain in rings; or, where it has burned, charcoal
  for (const [e, on] of [[0, caps[0]], [K, caps[1]]]) {
    if (!on) continue;
    const o = add3(c0, A, (e / K) * len), n = e === 0 ? A.map((v) => -v) : A, burnt = char > 0.6;
    const rings = 4, ring = (k) => k / rings;
    for (let k = 0; k < rings; k++) {
      // heartwood dark in the middle, sapwood pale, and the bark's own band at the rim
      const col = burnt ? charred : k === rings - 1 ? lerp(tone, grain, 0.3) : lerp(grain, wood0, ring(k + 0.5) * 1.1);
      for (let i = 0; i < N; i++) {
        const i1 = (i + 1) % N, pt = (kk, ii) => (kk === 0 ? o : add3(o, add3(P[e][ii], o, -1), ring(kk) * (kk === rings ? 1 : 0.97)));
        const a = pt(k, i), b = pt(k + 1, i), c = pt(k + 1, i1), d = pt(k, i1), cc = vary(col, R, 0.03), part = burnt ? 'bark' : 'sawn';
        f.push([a, b, c, cc, part, [n, n, n]]);
        if (k > 0) f.push([a, c, d, cc, part, [n, n, n]]);
      }
    }
  }
  return rad;
}

/** A log on end, to sit on: a round sawn from a pine, its top in rings of heartwood, its foot in the ground. */
function seat(f, x, z, r, y1, n, R) {
  wood(f, [x, -0.04, z], [0, 1, 0], y1 + 0.04, r, R, { N: n, K: Math.max(2, Math.round(n / 4)), caps: [false, true], taper: 0.03 });
}

/** How high the ash lies at (x, z), over the pit's foot: heaped in the middle, in drifts and lumps (a fire's ash is
    never flat: it lies where it fell, heaped round where the logs burned, hollowed where it was raked), down under
    the stones at the rim. Units as the pit's: its foot is 3 cm into the ground (src/world/place.js). */
const ASH_R = RING * 0.97;
function ashAt(x, z) {
  const s = 4242, r = Math.hypot(x, z), u = Math.min(1, r / ASH_R);
  const heap = 0.045 * Math.max(0, 1 - u * u);
  const drift = 0.034 * (noise3(x * 3.6, z * 3.6, 1, s + 1) - 0.5) * 2 + 0.016 * (noise3(x * 8, z * 8, 3, s + 3) - 0.5) * 2;   // the heaps and hollows
  const lumps = 0.012 * (noise3(x * 16, z * 16, 4, s + 4) - 0.5) * 2 + 0.005 * (noise3(x * 40, z * 40, 5, s + 5) - 0.5) * 2;   // clinkers, crumbs
  return 0.022 + heap + (drift + lumps) * (1 - u * 0.7) - (u > 0.85 ? (u - 0.85) * 0.25 : 0);
}

/** The bed under the fire (intent 0018): no ground of the meadow under a fire, and none of it spilled past the
    stones. Ash heaped inside the ring in drifts and lumps, white where it burned hottest, grey out from it, dark
    with charcoal where it runs in under the stones; flecked all over with charcoal crumbs. */
function ashBed(f, K, N) {
  const P = [], C = [], s = 4242;
  const white = [0.66, 0.65, 0.63], pale = [0.44, 0.435, 0.43], grey = [0.25, 0.245, 0.24], dark = [0.11, 0.105, 0.1];
  for (let k = 0; k <= K; k++) {
    const u = k / K, row = [], crow = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 2 * Math.PI, ct = Math.cos(t), st = Math.sin(t), r = u * ASH_R, x = ct * r, z = st * r, h = ashAt(x, z);
      row.push([x, h, z]);
      // colour: by how hot it burned there, and lighter on the tops of the drifts, darker in their hollows
      const top = (h - (0.022 + 0.045 * Math.max(0, 1 - u * u))) / 0.03, fleck = noise3(x * 70, z * 70, 2, s + 2);
      let c = u < 0.3 ? lerp(white, pale, u / 0.3) : u < 0.65 ? lerp(pale, grey, (u - 0.3) / 0.35) : lerp(grey, dark, Math.min(1, (u - 0.65) / 0.25));
      c = lerp(c, top > 0 ? white : dark, Math.min(0.55, Math.abs(top) * 0.5));   // (pale on the drifts' crests, dark in their hollows)
      c = lerp(c, coal, Math.min(1, Math.max(0, fleck - 0.72) * 3.5) * (u > 0.2 ? 0.7 : 0.3));   // charcoal crumbs in it
      crow.push(c);
    }
    P.push(row); C.push(crow);
  }
  // (its middle a single point: the first row's points all at the middle)
  skin(f, P, C, 'ash', [true, false]);
}

/** The pit: `stones` round the ring, `sides` to every round thing. */
function pit(stones, sides) {
  const f = [], R = lcg(90210), N = sides * 2 + 2;   // (sides round a round thing)
  {
    ashBed(f, Math.max(5, sides * 3), Math.max(12, sides * 7));
    // charcoal in the ash: lumps of it, more towards the middle, and the ends of sticks that did not burn through
    for (let k = 0; k < 30; k++) {
      const C = lcg(3000 + k * 13), t = C() * 2 * Math.PI, d = Math.sqrt(C()) * RING * 0.8, s = 0.022 + C() * C() * 0.07;
      const y0 = ashAt(Math.cos(t) * d, Math.sin(t) * d) + 0.04 - s * 0.3;   // (half sunk in the ash: ashAt)
      riverStone(f, Math.cos(t) * d, Math.sin(t) * d, s, s * 0.9, C, t + Math.PI, C() * 6.3, Math.max(5, sides), Math.max(3, Math.round(sides / 2)), 'ash', coal, y0);
    }
    for (let k = 0; k < 4; k++) {   // burnt sticks lying across the coals, their middles gone to charcoal
      const C = lcg(4000 + k * 7), a = k * 1.7 + C() * 0.5, len = 0.42 + C() * 0.25, r = 0.028 + C() * 0.022, d = RING * 0.12 * k;
      const ca = Math.cos(a), sa = Math.sin(a), ox = Math.cos(k * 2.3) * d, oz = Math.sin(k * 2.3) * d;
      wood(f, [ox - ca * len / 2, ashAt(ox, oz) + r * 0.4 + k * 0.012, oz - sa * len / 2], [ca, (C() - 0.5) * 0.15, sa], len, r, C, { N: Math.max(6, sides + 1), K: 6, char: 0.85 + C() * 0.15 });
    }
  }
  // the ring itself: river stones laid end to end round it, each its own worn round body, sooted on the inside. Each
  // stone has its own seed
  for (let i = 0; i < stones; i++) {
    const S = lcg(1000 + i * 17), t = (i / stones) * 2 * Math.PI + (S() - 0.5) * 0.14, d = RING * (1.03 + S() * 0.08);
    riverStone(f, Math.cos(t) * d, Math.sin(t) * d, 0.11 + S() * 0.07, 0.13 + S() * 0.12, S, t + Math.PI, t + Math.PI / 2 + (S() - 0.5) * 0.5, Math.max(5, sides * 2 - 2), Math.max(3, sides - 1));
  }
  {   // the wood still to go on, stacked clear of the flame: two side by side, one across them
    const t = 2.25, cx = Math.cos(t) * (RING + 0.5), cz = Math.sin(t) * (RING + 0.5), along = t + Math.PI / 2, ca = Math.cos(along), sa = Math.sin(along);
    const W = lcg(5000), L = 0.78;
    for (const [off, y, turn, r] of [[-0.09, 0.07, 0, 0.068], [0.08, 0.065, 0.06, 0.062], [0.0, 0.19, 0.35, 0.058]]) {
      const a = along + turn, c = Math.cos(a), sn = Math.sin(a), px = cx - sa * off, pz = cz + ca * off;
      wood(f, [px - c * L / 2, y - 0.01, pz - sn * L / 2], [c, 0, sn], L, r, W, { N, K: 6, taper: 0.08 });
    }
  }
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * 2 * Math.PI - 0.5;
    seat(f, Math.cos(t) * SEAT_R, Math.sin(t) * SEAT_R, (SEAT_W / 2) * (0.92 + R() * 0.16), SEAT_H + (R() - 0.5) * 0.06, N + 4, lcg(6000 + i));
  }
  {   // a pine log lying on the ground to sit on: round, a little sunk in, sawn at both ends
    const a = 2.6 + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), cx = Math.cos(2.6) * (SEAT_R + 0.12), cz = Math.sin(2.6) * (SEAT_R + 0.12), L = 1.6, r = 0.2;
    wood(f, [cx - ca * L / 2, r * 0.86, cz - sa * L / 2], [ca, 0.012, sa], L, r, lcg(7000), { N: N + 6, K: 10, taper: 0.14 });
  }
  return f;
}

export default {
  uid: '23566c8c-0864-4278-a2f7-a3e072300223',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Fire pit',
  kind: 'default',
  about: 'A ring of sooted river stones round a bed of ash and charcoal, the wood that will burn on it, wood stacked ready, and log rounds cut from a pine to sit on. It stands out on the grass in front of the tent.',
  measure: MEASURE,
  size: { length: 2 * (SEAT_R + SEAT_W), width: 2 * (SEAT_R + SEAT_W), height: 0.95 },
  // what it is made of: the world's own materials, wrapped round it from three sides (src/world/place.js). A face
  // names one of these and tints it; the order here is the order the shapes name them by.
  materials: {
    stone: 'f4a707ab-dcac-4c3a-a4d6-7a929d0e945e' /* pebble: the river stones of the ring, worn smooth */,
    bark: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark: the seats' sides, the stacked wood, the burnt ends */,
    sawn: '5e888d71-827c-4efc-8d13-50717c7f1dc8' /* pine log end: the sawn tops of the seats */,
    ash: 'c0092c17-16c9-4470-b98e-b030175d561b' /* wood ash: the bed, and the charcoal sat in it */,
  },
  texture: 0.42,   // metres a tile of them spans: the stone's plates and the bark's ridges at the size they really are
  relief: 1.4,     // their bumps read deep: rough stone, ridged bark
  colours: { stone: [0.33, 0.31, 0.29], soot: [0.07, 0.06, 0.06], ash: [0.57, 0.55, 0.52], coal: [0.09, 0.09, 0.09], wood: [0.67, 0.52, 0.34], bark: [0.36, 0.2, 0.12] },   // (for a picture without the materials)
  // all it is, up close, every facet of every stone and the rings of the sawn seats: every coarser version of it is the
  // builder's (assets/kit/made.js)
  faces: pit(13, 9),
  placement: { at: 'places', clearsGround: 2.6 },
  // what a walker cannot pass: the seats and the bench. The stone ring is ankle high and is stepped over.
  solid: {
    posts: [
      { x: Math.cos(-0.5) * SEAT_R, z: Math.sin(-0.5) * SEAT_R, r: SEAT_W / 2 },
      { x: Math.cos(-0.5 + (2 * Math.PI) / 3) * SEAT_R, z: Math.sin(-0.5 + (2 * Math.PI) / 3) * SEAT_R, r: SEAT_W / 2 },
      { x: Math.cos(-0.5 + (4 * Math.PI) / 3) * SEAT_R, z: Math.sin(-0.5 + (4 * Math.PI) / 3) * SEAT_R, r: SEAT_W / 2 },
    ],
    boxes: [{ x: Math.cos(2.6) * (SEAT_R + 0.12), z: Math.sin(2.6) * (SEAT_R + 0.12), w: 1.6, d: 0.4, a: 2.6 + Math.PI / 2 }],
  },
};
