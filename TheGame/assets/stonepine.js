// The stone pine (Pinus pinea): the umbrella pine of the Mediterranean. A thick trunk of reddish plated bark, leaning a
// little, that forks high up into three limbs; they split into branches, the branches into twigs, and at the twigs' ends
// brushes of long needles make one broad, flat-topped crown, dense on top, its limbs seen from below. Built here as a
// mesh per level of detail: the wood as tubes wrapped in bark (materials/pinebark.js), the needles as crossed cards cut
// out of a painted tuft (materials/pinetuft.js). An asset in the one recipe (assets/index.js), scattered by the trees'
// engine (src/scatter/trees.js) where the pine forest lies (biomes/pineforest.js). Units are metres for a tree of scale 1
// (about 13 m high); the origin is the foot of its trunk.
const FORK = [0.8, 7.2, 0.3], CROWN = [0.75, 10.6, 0.3], R = 6.2, RY = 1.9;   // where the trunk forks; the crown's middle, reach and depth
const BARK_TILE = 1.1;   // metres of trunk one tile of bark covers
const barkCol = [0.3, 0.17, 0.1], needleCol = [0.07, 0.12, 0.05];   // (for a picture without the textures: the library's list)

// ---- small vector help ----
const add = (a, b) => a.map((x, i) => x + b[i]), sub = (a, b) => a.map((x, i) => x - b[i]), mul = (a, s) => a.map((x) => x * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(...a), norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
const bez = (a, c, b, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return add(add(mul(a, (1 - t) ** 2), mul(c, 2 * t * (1 - t))), mul(b, t * t)); });   // a curved limb through a, bent towards c, to b
const rng = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- the mesh: positions, normals, uv, which part (0 wood, 1 needles), how much light reaches in (ao) ----
function builder() {
  const b = { position: [], normal: [], uv: [], part: [], ao: [], color: [] };
  b.v = (p, n, uv, part, ao) => { b.position.push(...p); b.normal.push(...n); b.uv.push(...uv); b.part.push(part); b.ao.push(ao); b.color.push(...(part ? needleCol : barkCol)); };
  return b;
}
// light inside the crown: the deeper under its top and the nearer its middle, the less
const aoAt = (p) => { const r = Math.hypot(p[0] - CROWN[0], p[2] - CROWN[2]) / R, up = (p[1] - CROWN[1]) / RY; return Math.min(1, Math.max(0.32, 0.55 + 0.35 * up + 0.25 * r)); };

// a tube along pts, radius rad[i] at each, `sides` round: its rings carried along the curve without twisting, its bark
// wrapped round a whole number of times so it meets itself
function tube(b, pts, rad, sides) {
  const n = pts.length, T = pts.map((_, i) => norm(sub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)])));
  let N = norm(cross(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), along = 0;
  const reps = Math.max(1, Math.round((2 * Math.PI * rad[0]) / BARK_TILE)), rings = [];
  for (let i = 0; i < n; i++) {
    if (i) { along += len(sub(pts[i], pts[i - 1])); N = norm(sub(N, mul(T[i], dot(N, T[i])))); }
    const B = cross(T[i], N), ring = [];
    for (let k = 0; k <= sides; k++) { const a = (k / sides) * 2 * Math.PI, d = add(mul(N, Math.cos(a)), mul(B, Math.sin(a))); ring.push([add(pts[i], mul(d, rad[i])), d, [(k / sides) * reps, along / BARK_TILE]]); }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = rings[i][k], c = rings[i][k + 1], d = rings[i + 1][k], e = rings[i + 1][k + 1];
    for (const [p, nn, uv] of [a, d, e, a, e, c]) b.v(p, nn, uv, 0, aoAt(p) * 0.85 + 0.15 * Math.min(1, p[1] / FORK[1]));
  }
}
// a tuft: two cards crossed along `dir`, their foot at p, s metres long, cut out of the painted tuft
function tuft(b, p, dir, s, R0) {
  const side0 = norm(cross(dir, Math.abs(dir[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0])), turn = R0() * Math.PI;
  for (const q of [0, Math.PI / 2]) {
    const side = norm(add(mul(side0, Math.cos(turn + q)), mul(cross(dir, side0), Math.sin(turn + q)))), nrm = norm(cross(side, dir));
    const w = mul(side, s * 0.5), h = mul(dir, s), c0 = sub(p, w), c1 = add(p, w), c2 = add(c1, h), c3 = add(c0, h);
    const ao = aoAt(add(p, mul(dir, s * 0.5)));
    for (const [v, uv] of [[c0, [0, 0]], [c1, [1, 0]], [c2, [1, 1]], [c0, [0, 0]], [c2, [1, 1]], [c3, [0, 1]]]) b.v(v, nrm, uv, 1, ao);
  }
}

// ---- the tree at a level: q 0 near (every twig), 1 middle (branches, larger tufts), 2 far (limbs, a few big tufts) ----
function pine(q) {
  const b = builder(), R0 = rng(7), S = [12, 7, 5][q], s2 = [8, 5, 4][q];
  // the trunk: flared at its foot, a gentle bend, tapering to the fork
  const trunk = Array.from({ length: 8 }, (_, i) => { const t = i / 7; return [FORK[0] * t * t + Math.sin(t * 3) * 0.12, FORK[1] * t, FORK[2] * t * t]; });
  tube(b, trunk, trunk.map((_, i) => { const t = i / 7; return 0.3 + 0.16 * (1 - t) + 0.22 * Math.max(0, 1 - t * 6) ** 2; }), S);
  if (q === 0) for (const [y, a] of [[3.1, 0.6], [4.4, 2.9], [5.6, 4.8]]) {   // the stubs of limbs it shed long ago
    const at = trunk[Math.round((y / FORK[1]) * 7)], d = norm([Math.cos(a), 0.25, Math.sin(a)]);
    tube(b, [at, add(at, mul(d, 0.55))], [0.07, 0.03], 5);
  }
  // the needles' clusters: over the crown's dome, most on its upper side, a few lower round its rim
  const nC = [230, 60, 20][q], clusters = [];
  for (let i = 0; i < nC; i++) {
    const a = R0() * 2 * Math.PI, r = R * Math.sqrt(0.06 + 0.94 * R0()), shell = Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
    clusters.push({ a, p: [CROWN[0] + Math.cos(a) * r, CROWN[1] + RY * shell * (0.2 + 0.8 * R0()) - 0.6 * (1 - shell), CROWN[2] + Math.sin(a) * r] });
  }
  // three limbs from the fork, each with its share of the crown (the clusters nearest its way round)
  const limbs = [0, 1, 2].map((k) => (k / 3) * 2 * Math.PI + 0.4 + (R0() - 0.5) * 0.5);
  const near = (a) => limbs.reduce((m, l, k) => (Math.abs(Math.atan2(Math.sin(a - l), Math.cos(a - l))) < Math.abs(Math.atan2(Math.sin(a - limbs[m]), Math.cos(a - limbs[m]))) ? k : m), 0);
  limbs.forEach((la, k) => {
    const out = [Math.cos(la), 0, Math.sin(la)], end = add(CROWN, add(mul(out, R * 0.42), [0, -1.1, 0]));
    tube(b, bez(FORK, add(FORK, add(mul(out, 0.6), [0, 1.9, 0])), end, 6), [0.24, 0.22, 0.2, 0.18, 0.16, 0.14, 0.13], s2);
    const mine = clusters.filter((c) => near(c.a) === k);
    if (q === 2) { mine.forEach((c) => { for (let t = 0; t < 3; t++) tuft(b, sub(c.p, [0, 1.0, 0]), norm(add([0, 1, 0], mul(sub(c.p, CROWN), 0.12 + 0.2 * R0()))), 3.3 + R0() * 0.7, R0); }); return; }
    // its branches: the limb's share of the crown in three or four groups, a branch to each, twigs from there
    const nG = q ? 3 : 4, groups = Array.from({ length: nG }, () => []);
    mine.sort((x, y) => x.a - y.a).forEach((c, i) => groups[Math.floor((i * nG) / mine.length)].push(c));
    for (const g of groups) {
      if (!g.length) continue;
      const G = sub(mul(g.reduce((s, c) => add(s, c.p), [0, 0, 0]), 1 / g.length), [0, 0.7, 0]), mid = lerp(end, G, 0.5);
      tube(b, bez(end, add(mid, [0, 0.8, 0]), G, 4), [0.12, 0.1, 0.085, 0.07, 0.06], s2 - 1);
      for (const c of g) {
        const out2 = norm(add(mul(sub(c.p, CROWN), 0.18), [0, 1, 0]));   // the brushes stand up and a little out
        if (q === 0) {
          tube(b, bez(G, add(lerp(G, c.p, 0.5), [0, 0.35, 0]), c.p, 2), [0.045, 0.032, 0.02], 4);
          for (let t = 0; t < 7; t++) tuft(b, add(c.p, [(R0() - 0.5) * 0.7, -0.2 - R0() * 0.3, (R0() - 0.5) * 0.7]), norm(add(out2, [(R0() - 0.5) * 1.1, 0, (R0() - 0.5) * 1.1])), 0.8 + R0() * 0.4, R0);
        } else for (let t = 0; t < 4; t++) tuft(b, add(c.p, [(R0() - 0.5) * 1.2, -0.5, (R0() - 0.5) * 1.2]), norm(add(out2, [(R0() - 0.5) * 0.9, 0, (R0() - 0.5) * 0.9])), 1.75 + R0() * 0.5, R0);
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
  about: 'The umbrella pine of the Mediterranean: a thick trunk of reddish plated bark that forks high into three limbs, branches and twigs under one broad, flat-topped crown of long needles.',
  size: { length: 2 * R * 1.1, width: 2 * R * 1.1, height: CROWN[1] + RY },
  colours: { bark: barkCol, needles: needleCol },
  crown: [...CROWN, R],   // its crown's middle and reach: the light rounds over it as over one dome (src/scatter/trees.js)
  materials: { wood: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark */, needles: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742' /* pine tuft */ },
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, tree (assets/kinds.js); P: cells per patch side
  detail: { levels: [{ mesh: pine(0), P: 4 }, { mesh: pine(1), P: 8 }, { mesh: pine(2), P: 16 }] },
  // scattered where the pine forest lies: a cell holds one tree at most, as many as the biome's share and its groves say
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cell: 9, density: 0.75, clumps: 55, scale: [0.6, 1.25], lean: 0.12, seed: 300 },   // clumps: metres across the groves and glades a stand is made of; lean: how far a trunk may lean
};
