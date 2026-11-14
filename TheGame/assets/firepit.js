// The fire pit: the second thing in Maia City, out on the grass in front of the tent (world/places.js). A ring of
// river stones sooted black on their inner faces, a bed of ash with charcoal and half-burnt ends still in it, a live
// fire over it, and log rounds cut from a pine to sit on.
//
// A faces asset carries one colour a face and no texture (assets/index.js), so everything that would be a texture is
// built: every stone is a rough boulder whose facets each take their own cast, every log its bark ridges and the
// rings of its sawn end, and the flame is tongues of geometry from a red heart out to a pale tip. Units are metres;
// the origin is the middle of the fire, on the ground.
const RING = 0.62, SEAT_R = 1.74, SEAT_H = 0.44, SEAT_W = 0.48;

const stone = [0.49, 0.47, 0.44], stoneWarm = [0.56, 0.52, 0.46], stoneCool = [0.42, 0.43, 0.44], soot = [0.17, 0.16, 0.15];
const ashPale = [0.78, 0.76, 0.72], ashGrey = [0.57, 0.55, 0.52], ashDark = [0.36, 0.34, 0.32], coal = [0.1, 0.09, 0.09], glow = [0.62, 0.2, 0.05];
const wood = [0.76, 0.62, 0.42], grain = [0.66, 0.51, 0.33], bark = [0.27, 0.2, 0.14], barkLit = [0.34, 0.26, 0.18], charred = [0.12, 0.11, 0.1];

const rnd = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
/** A colour nudged a little: what gives a flat face the unevenness a texture would. */
const vary = (c, R, k = 0.07) => { const d = (R() - 0.5) * 2 * k; return [Math.max(0, c[0] + d), Math.max(0, c[1] + d), Math.max(0, c[2] + d)]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A rough stone: a ball of eight sides pulled in and out so no two facets lie flat, sooted on the side that faces
    the fire and paler where the weather gets at it. `inward` is the way to the fire. */
function boulder(f, x, z, r, h, R, inward, N = 7, rows = 3) {
  const p = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, ring = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 2 * Math.PI + v * 0.4, rr = r * Math.sin(v * Math.PI * 0.92 + 0.14) * (0.78 + R() * 0.44);
      ring.push([x + rr * Math.cos(t), -0.05 + h * v * (0.85 + R() * 0.3), z + rr * Math.sin(t)]);
    }
    p.push(ring);
  }
  const top = [x + (R() - 0.5) * r * 0.2, h * (0.92 + R() * 0.16) - 0.05, z + (R() - 0.5) * r * 0.2];
  for (let j = 0; j < rows; j++) for (let i = 0; i < N; i++) {
    const a = p[j][i], b = p[j][(i + 1) % N], c = p[j + 1][(i + 1) % N], d = p[j + 1][i];
    const t = (i / N) * 2 * Math.PI, toward = Math.cos(t - inward) > 0.25;   // the face turned to the fire
    const base = toward ? mix(stone, soot, 0.55 + R() * 0.35) : [stone, stoneWarm, stoneCool][i % 3];
    f.push([a, b, c, vary(base, R)], [a, c, d, vary(base, R)]);
  }
  for (let i = 0; i < N; i++) f.push([p[rows][i], p[rows][(i + 1) % N], top, vary(stoneWarm, R, 0.09)]);
}

/** A log on end, to sit on: bark in ridges, and the sawn top in rings of heartwood. */
function seat(f, x, z, r, y1, n, R) {
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * 2 * Math.PI, t1 = ((i + 1) / n) * 2 * Math.PI, rr = r * (0.97 + R() * 0.06);
    const a0 = [x + rr * Math.cos(t0), 0, z + rr * Math.sin(t0)], a1 = [x + r * Math.cos(t1), 0, z + r * Math.sin(t1)];
    const b0 = [x + rr * Math.cos(t0), y1, z + rr * Math.sin(t0)], b1 = [x + r * Math.cos(t1), y1, z + r * Math.sin(t1)];
    const c = vary(i % 3 === 0 ? barkLit : bark, R, 0.05);   // the ridges catch the light, the splits between them do not
    f.push([a0, a1, b1, c], [a0, b1, b0, c]);
  }
  const rings = 3;   // the sawn face: heartwood out to sapwood, each ring its own tone
  for (let k = 0; k < rings; k++) {
    const r0 = r * (k / rings) * 0.94, r1 = r * ((k + 1) / rings) * 0.94, c = mix(grain, wood, k / (rings - 1));
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * 2 * Math.PI, t1 = ((i + 1) / n) * 2 * Math.PI;
      const q = (rr, t) => [x + rr * Math.cos(t), y1 + 0.004, z + rr * Math.sin(t)];
      if (k === 0) f.push([q(0, 0), q(r1, t1), q(r1, t0), vary(c, R, 0.04)]);
      else f.push([q(r0, t0), q(r1, t1), q(r1, t0), vary(c, R, 0.04)], [q(r0, t0), q(r0, t1), q(r1, t1), vary(c, R, 0.04)]);
    }
  }
}

/** A branch lying across the fire, burnt through in the middle: bark at the ends, charcoal where it has been alight. */
function burnt(f, x, z, len, r, y, a, n, R, char = 0.6) {
  const ca = Math.cos(a), sa = Math.sin(a), p = (u, v, w) => [x + u * ca - w * sa, y + v, z + u * sa + w * ca];
  const seg = 4;
  for (let s = 0; s < seg; s++) {
    const u0 = -len / 2 + (s / seg) * len, u1 = -len / 2 + ((s + 1) / seg) * len;
    const mid = Math.abs((s + 0.5) / seg - 0.5) * 2;   // 0 in the middle, 1 at the ends
    const c0 = mid < char ? charred : bark, rr = r * (0.7 + 0.3 * mid);
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * 2 * Math.PI, t1 = ((i + 1) / n) * 2 * Math.PI;
      const c = vary(mid < char * 0.5 ? mix(charred, glow, 0.25) : c0, R, 0.05);
      f.push([p(u0, rr + rr * Math.sin(t0), rr * Math.cos(t0)), p(u0, rr + rr * Math.sin(t1), rr * Math.cos(t1)), p(u1, rr + rr * Math.sin(t1), rr * Math.cos(t1)), c],
        [p(u0, rr + rr * Math.sin(t0), rr * Math.cos(t0)), p(u1, rr + rr * Math.sin(t1), rr * Math.cos(t1)), p(u1, rr + rr * Math.sin(t0), rr * Math.cos(t0)), c]);
    }
  }
}

/** The pit at one level: `stones` round the ring, `sides` to every round thing, and what else it carries. */
function pit(stones, sides, { ash = true, coals = true, logs = true, seats = true, bench = true } = {}) {
  const f = [], R = rnd(90210);
  if (ash) {
    // the bed, heaped a little in the middle: dark earth, grey ash over it, pale ash and white where it is hottest
    const beds = [[RING * 1.0, 0.012, ashDark], [RING * 0.82, 0.028, ashGrey], [RING * 0.6, 0.044, ashPale], [RING * 0.3, 0.058, mix(ashPale, [1, 1, 1], 0.4)]];
    for (const [r, y, c] of beds) {
      const n = Math.max(7, stones);
      for (let i = 0; i < n; i++) { const t0 = (i / n) * 2 * Math.PI, t1 = ((i + 1) / n) * 2 * Math.PI, w = 0.9 + R() * 0.2;
        f.push([[0, y + 0.004, 0], [r * w * Math.cos(t1), y, r * w * Math.sin(t1)], [r * w * Math.cos(t0), y, r * w * Math.sin(t0)], vary(c, R, 0.05)]); }
    }
    // charcoal lumps and the ends that did not burn through, sat in the ash
    if (coals) for (let k = 0; k < 7; k++) {
      const t = R() * 2 * Math.PI, d = R() * RING * 0.6, s = 0.05 + R() * 0.07;
      boulder(f, Math.cos(t) * d, Math.sin(t) * d, s, s * 1.2, R, t + Math.PI, Math.max(4, sides - 4), 2);
    }
    if (coals) for (let k = 0; k < 3; k++) burnt(f, Math.cos(k * 2.1) * RING * 0.34, Math.sin(k * 2.1) * RING * 0.34, 0.5 + R() * 0.25, 0.045, 0.05, k * 2.1 + 0.8, Math.max(3, sides - 4), R, 0.85);
  }
  // the ring itself: every stone its own rough body, sooted on the inside
  for (let i = 0; i < stones; i++) {
    const t = (i / stones) * 2 * Math.PI + (R() - 0.5) * 0.18, d = RING * (1.02 + R() * 0.1);
    boulder(f, Math.cos(t) * d, Math.sin(t) * d, 0.12 + R() * 0.06, 0.15 + R() * 0.1, R, t + Math.PI, Math.max(4, sides - 2), sides > 7 ? 3 : sides > 5 ? 2 : 1);
  }
  if (logs) for (let i = 0; i < 3; i++) {   // the wood still to go on, stacked clear of the flame
    const t = 2.0 + i * 0.26;
    burnt(f, Math.cos(t) * (RING + 0.42), Math.sin(t) * (RING + 0.42), 0.8, 0.06, i * 0.1, t + Math.PI / 2 + i * 0.2, Math.max(4, sides - 3), R, 0);
  }
  if (seats) for (let i = 0; i < 3; i++) {
    const t = (i / 3) * 2 * Math.PI - 0.5;
    seat(f, Math.cos(t) * SEAT_R, Math.sin(t) * SEAT_R, (SEAT_W / 2) * (0.92 + R() * 0.16), SEAT_H + (R() - 0.5) * 0.06, sides, R);
  }
  if (bench) burnt(f, Math.cos(2.6) * (SEAT_R + 0.12), Math.sin(2.6) * (SEAT_R + 0.12), 1.6, 0.2, 0, 2.6 + Math.PI / 2, Math.max(5, sides), R, 0);
  return f;
}

export default {
  uid: '23566c8c-0864-4278-a2f7-a3e072300223',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Fire pit',
  kind: 'default',
  about: 'A ring of sooted river stones round a bed of ash and charcoal, the wood that will burn on it, wood stacked ready, and log rounds cut from a pine to sit on. It stands out on the grass in front of the tent.',
  size: { length: 2 * (SEAT_R + SEAT_W), width: 2 * (SEAT_R + SEAT_W), height: 0.95 },
  colours: { stone, soot, ash: ashPale, coal, wood, bark },
  // near to far: every facet of every stone and the rings of the sawn seats; then fewer sides; then no fire and no ash
  detail: {
    levels: [
      { faces: pit(12, 9) },
      { faces: pit(9, 6) },
      { faces: pit(7, 5, { logs: false, coals: false }) },
      { faces: pit(5, 4, { ash: false, coals: false, logs: false, bench: false }) },
    ],
  },
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
