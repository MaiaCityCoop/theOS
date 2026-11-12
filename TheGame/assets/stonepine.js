// The stone pine (Pinus pinea): the umbrella pine of the Mediterranean, as it stands in a pineta. A long, slender trunk of
// reddish-grey plated bark, bending in a slow S, bare to well over half its height; there it forks, and forks again, into
// six long, thin limbs that fan up and out like the ribs of an umbrella; they split into branches, the branches into
// twigs, and at the twigs' ends brushes of long needles heap into puffs, rounded like clouds, that together make one
// broad dome, flat underneath. Built here as a mesh per level of detail: the wood as tubes wrapped in bark
// (materials/pinebark.js), the needles as crossed cards cut out of a painted tuft (materials/pinetuft.js), each card's
// normal its puff's and the dome's (so a puff is lit as a ball: bright on top, dark under). An asset in the one recipe
// (assets/index.js), scattered by the trees' engine (src/scatter/trees.js) where the pine forest lies (biomes/
// pineforest.js). Units are metres for a tree of scale 1 (about 14.5 m high); the origin is the foot of its trunk.
const FORK = [0.9, 7.2, 0.35], BASE = 10.2, DOME = 2.9, R = 7.2;   // where the trunk forks; the crown's flat underside, its dome's height, its reach
const MID = [1.0, 0, 0.4];   // the crown's middle, over the trunk's lean
const BARK_TILE = 1.1;   // metres of trunk one tile of bark covers
const barkCol = [0.33, 0.22, 0.15], needleCol = [0.1, 0.18, 0.06];   // (for a picture without the textures: the library's list)

// ---- small vector help ----
const add = (a, b) => a.map((x, i) => x + b[i]), sub = (a, b) => a.map((x, i) => x - b[i]), mul = (a, s) => a.map((x) => x * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(...a), norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
const bez = (a, c, b, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return add(add(mul(a, (1 - t) ** 2), mul(c, 2 * t * (1 - t))), mul(b, t * t)); });   // a curved limb through a, bent towards c, to b
const rng = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// the dome's top over a point r metres out from its middle
const topAt = (r) => BASE + DOME * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));

// ---- the mesh: positions, normals, uv, which part (0 wood, 1 needles), how much light reaches in (ao) ----
function builder() {
  const b = { position: [], normal: [], uv: [], part: [], ao: [], color: [], index: [] };   // indexed: a corner shared by its triangles is one vertex
  b.v = (p, n, uv, part, ao) => { b.position.push(...p); b.normal.push(...n); b.uv.push(...uv); b.part.push(part); b.ao.push(ao); b.color.push(...(part ? needleCol : barkCol)); return b.ao.length - 1; };
  return b;
}
// light inside the crown: the deeper under its dome and the nearer its middle, the less
const aoAt = (p) => { const r = Math.hypot(p[0] - MID[0], p[2] - MID[2]), depth = (topAt(r) - p[1]) / DOME; return Math.min(1, Math.max(0.3, 1 - depth * 0.55 + (r / R) * 0.15)); };

// a tube along pts, radius rad[i] at each, `sides` round: its rings carried along the curve without twisting, its bark
// wrapped round a whole number of times so it meets itself
function tube(b, pts, rad, sides) {
  const n = pts.length, T = pts.map((_, i) => norm(sub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)])));
  let N = norm(cross(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), along = 0;
  const reps = Math.max(1, Math.round((2 * Math.PI * rad[0]) / BARK_TILE)), rings = [];
  for (let i = 0; i < n; i++) {
    if (i) { along += len(sub(pts[i], pts[i - 1])); N = norm(sub(N, mul(T[i], dot(N, T[i])))); }
    const B = cross(T[i], N), ring = [];
    for (let k = 0; k <= sides; k++) { const a = (k / sides) * 2 * Math.PI, d = add(mul(N, Math.cos(a)), mul(B, Math.sin(a))), p = add(pts[i], mul(d, rad[i])); ring.push(b.v(p, d, [(k / sides) * reps, along / BARK_TILE], 0, aoAt(p) * 0.8 + 0.2 * Math.min(1, p[1] / FORK[1]))); }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = rings[i][k], c = rings[i][k + 1], d = rings[i + 1][k], e = rings[i + 1][k + 1];
    b.index.push(a, d, e, a, e, c);
  }
}
// a tuft: two cards crossed along `dir`, their foot at p, s metres long, cut out of the painted tuft; `light` the normal
// its light is reckoned with (its puff's outward way, rounded with the dome's)
function tuft(b, p, dir, s, light, ao, R0) {
  const side0 = norm(cross(dir, Math.abs(dir[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0])), turn = R0() * Math.PI;
  for (const q of [0, Math.PI / 2]) {
    const side = norm(add(mul(side0, Math.cos(turn + q)), mul(cross(dir, side0), Math.sin(turn + q))));
    const w = mul(side, s * 0.5), h = mul(dir, s), c0 = sub(p, w), c1 = add(p, w), c2 = add(c1, h), c3 = add(c0, h);
    const [i0, i1, i2, i3] = [[c0, [0, 0]], [c1, [1, 0]], [c2, [1, 1]], [c3, [0, 1]]].map(([v, uv]) => b.v(v, light, uv, 1, ao));
    b.index.push(i0, i1, i2, i0, i2, i3);
  }
}
// a way picked at random on the upper side of a ball (more up than down)
const outward = (R0, lift) => { const a = R0() * 2 * Math.PI, y = lift + (1 - lift) * R0() * 2 - (1 - lift), r = Math.sqrt(Math.max(0, 1 - y * y)); return [Math.cos(a) * r, y, Math.sin(a) * r]; };

// ---- the tree at a level: q 0 near (every twig), 1 middle (branches, larger tufts), 2 far (limbs, a few big tufts) ----
function pine(q) {
  const b = builder(), R0 = rng(11), S = [12, 7, 5][q], s2 = [8, 5, 4][q];
  // the trunk: flared at its foot, bending in a slow S as it climbs to the fork
  const trunk = Array.from({ length: 10 }, (_, i) => { const t = i / 9; return [FORK[0] * t + Math.sin(t * Math.PI * 1.3) * 0.55, FORK[1] * t, FORK[2] * t + Math.sin(t * Math.PI * 0.9) * 0.25]; });
  tube(b, trunk, trunk.map((_, i) => { const t = i / 9; return 0.24 + 0.12 * (1 - t) + 0.2 * Math.max(0, 1 - t * 7) ** 2; }), S);
  if (q === 0) for (const [y, a] of [[3.6, 0.6], [4.9, 2.9], [6.1, 4.8]]) {   // the stubs of limbs it shed long ago
    const at = trunk[Math.round((y / FORK[1]) * 9)], d = norm([Math.cos(a), 0.3, Math.sin(a)]);
    tube(b, [at, add(at, mul(d, 0.5))], [0.06, 0.025], 5);
  }
  // the puffs: rounded heaps of needles over the dome, most along its top, a ring of them making its flat underside's rim
  const nP = [140, 56, 20][q], puffs = [];
  for (let i = 0; i < nP; i++) {
    const a = R0() * 2 * Math.PI, rim = R0() < 0.35, r = R * (rim ? 0.62 + 0.36 * R0() : Math.sqrt(0.04 + 0.92 * R0())), pr = (q ? 1.4 : 1) * (0.8 + 0.45 * R0());
    const y = rim ? BASE + 0.15 + R0() * 0.45 : topAt(r) - pr * (0.7 + 0.25 * R0());   // the rim's puffs make the flat underside
    puffs.push({ a, pr, p: [MID[0] + Math.cos(a) * r, y, MID[2] + Math.sin(a) * r] });
  }
  // two stems from the fork, each forking again into three limbs: six, fanning up and out like an umbrella's ribs
  const limbs = [];
  [0.3, 0.3 + Math.PI].forEach((sa, j) => {
    const so = [Math.cos(sa), 0, Math.sin(sa)], top = add(FORK, add(mul(so, 0.9), [0, 1.5 + R0() * 0.4, 0]));
    tube(b, bez(FORK, add(FORK, [0, 0.9, 0]), top, 4), [0.2, 0.18, 0.165, 0.15, 0.14], s2);
    for (let k = 0; k < 3; k++) limbs.push({ from: top, a: sa + (k - 1) * 1.05 + (R0() - 0.5) * 0.3 });
  });
  const near = (a) => limbs.reduce((m, l, k) => (Math.abs(Math.atan2(Math.sin(a - l.a), Math.cos(a - l.a))) < Math.abs(Math.atan2(Math.sin(a - limbs[m].a), Math.cos(a - limbs[m].a))) ? k : m), 0);
  limbs.forEach((L, k) => {
    const out = [Math.cos(L.a), 0, Math.sin(L.a)], reach = R * (0.5 + 0.2 * R0()), end = [MID[0] + out[0] * reach, BASE - 0.1 + R0() * 0.5, MID[2] + out[2] * reach];
    tube(b, bez(L.from, add(lerp(L.from, end, 0.45), [0, 1.3, 0]), end, 6), [0.13, 0.12, 0.11, 0.1, 0.09, 0.08, 0.07], q ? 4 : 6);   // long and thin, bowed upward
    const mine = puffs.filter((c) => near(c.a) === k);
    const nG = q === 2 ? 1 : q ? 2 : 3, groups = Array.from({ length: nG }, () => []);
    mine.sort((x, y) => Math.hypot(x.p[0] - MID[0], x.p[2] - MID[2]) - Math.hypot(y.p[0] - MID[0], y.p[2] - MID[2])).forEach((c, i) => groups[Math.floor((i * nG) / mine.length)].push(c));
    for (const g of groups) {
      if (!g.length) continue;
      const G = sub(mul(g.reduce((s, c) => add(s, c.p), [0, 0, 0]), 1 / g.length), [0, 0.6, 0]);
      if (q < 2) tube(b, bez(lerp(L.from, end, 0.6), add(lerp(end, G, 0.5), [0, 0.6, 0]), G, 4), [0.075, 0.065, 0.055, 0.045, 0.04], q ? 3 : 5);
      for (const c of g) {
        if (q === 0) tube(b, bez(G, add(lerp(G, c.p, 0.5), [0, 0.3, 0]), c.p, 2), [0.035, 0.025, 0.016], 4);
        // the puff: brushes standing out all over its upper side, each lit as the ball it makes (and the dome it is part of)
        const dome = norm(mul(sub(c.p, [MID[0], BASE - 3.5, MID[2]]), 1)), n = [11, 6, 4][q];
        for (let t = 0; t < n; t++) {
          const d = outward(R0, q === 2 ? 0.55 : 0.25), at = add(c.p, mul(d, c.pr * 0.35)), light = norm(add(mul(d, 0.35), mul(dome, 0.85)));   // mostly the dome's: the needle mass reads as one surface, the puffs as its swell
          const ao = Math.max(0.3, aoAt(at) * (0.72 + 0.28 * Math.max(0, d[1])));   // a puff's underside in its own shade
          tuft(b, at, norm(add(d, [0, 0.35, 0])), [1.15, 2.6, 4.4][q] * (0.8 + R0() * 0.4), light, ao, R0);
        }
      }
    }
  });
  return b;
}

export default {
  uid: 'e4f1685f-2db4-41a6-89df-e818cb470fdd',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Stone pine',
  kind: 'tree',
  about: 'The umbrella pine of the Mediterranean: a long, slender trunk bending in a slow S, bare to over half its height, six thin limbs fanning up like an umbrella’s ribs, and one broad dome of rounded needle puffs, flat underneath.',
  size: { length: 2 * R * 1.1, width: 2 * R * 1.1, height: BASE + DOME },
  colours: { bark: barkCol, needles: needleCol },
  crown: [MID[0], BASE + DOME * 0.5, MID[2], R],   // its crown's middle and reach (src/scatter/trees.js)
  materials: { wood: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark */, needles: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742' /* pine tuft */ },
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, tree (assets/kinds.js); P: cells per patch side
  detail: { levels: [{ mesh: pine(0), P: 4 }, { mesh: pine(1), P: 8 }, { mesh: pine(2), P: 16 }] },
  // scattered where the pine forest lies: a cell holds one tree at most, as many as the biome's share and its groves say
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cell: 10, density: 0.75, clumps: 55, scale: [0.65, 1.2], lean: 0.1, seed: 300 },   // clumps: metres across the groves and glades a stand is made of; lean: how far a trunk may lean
};
