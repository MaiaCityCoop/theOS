// The stone pine (Pinus pinea): the umbrella pine of the Mediterranean. A bare trunk, leaning, that forks high up into a
// few limbs, and over them one broad, flat crown of dark needle clumps, like a parasol. An asset in the one recipe
// (assets/index.js), scattered by the trees' engine (src/scatter/trees.js) where the pine forest lies (biomes/
// pineforest.js). Units are metres for a tree of scale 1 (about 12 m high); the origin is the foot of its trunk.
const H = 12, FORK = 7.4, CROWN_Y = 9.6, CROWN_R = 5.4, LEAN = [0.75, 0.3];   // its height, where the trunk forks, the crown's middle and reach, the lean at the fork
const bark = [0.27, 0.19, 0.14], bark2 = [0.36, 0.27, 0.2], top = [0.085, 0.15, 0.055], mid = [0.06, 0.105, 0.04], under = [0.035, 0.05, 0.025];   // a stone pine's crown is dark: deep green on top, near black under

// a seeded random, so the tree is the same each time it is built
const rng = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

// a tapering tube from a to b, radius r0 to r1, `sides` round, its bark a little lighter on one side
function tube(f, a, b, r0, r1, sides) {
  const d = b.map((x, i) => x - a[i]), L = Math.hypot(...d), u = d.map((x) => x / L);
  const s = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], n1 = norm(cross(u, s)), n2 = cross(u, n1);
  const ring = (c, r, t) => [c[0] + r * (Math.cos(t) * n1[0] + Math.sin(t) * n2[0]), c[1] + r * (Math.cos(t) * n1[1] + Math.sin(t) * n2[1]), c[2] + r * (Math.cos(t) * n1[2] + Math.sin(t) * n2[2])];
  for (let k = 0; k < sides; k++) {
    const t0 = (k / sides) * 2 * Math.PI, t1 = ((k + 1) / sides) * 2 * Math.PI, c = Math.cos(t0 - 0.8) > 0 ? bark2 : bark;
    f.push([ring(a, r0, t0), ring(b, r1, t1), ring(a, r0, t1), c], [ring(a, r0, t0), ring(b, r1, t0), ring(b, r1, t1), c]);
  }
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

// a clump of needles: a squashed dome, darker underneath, `seg` round and `rings` up
function clump(f, c, rx, ry, rz, seg, rings) {
  const p = (i, j) => { const t = (i / seg) * 2 * Math.PI, ph = -Math.PI / 2 + (j / rings) * Math.PI; return [c[0] + rx * Math.cos(ph) * Math.cos(t), c[1] + ry * Math.sin(ph), c[2] + rz * Math.cos(ph) * Math.sin(t)]; };
  for (let j = 0; j < rings; j++) {
    const k = (j + 0.5) / rings, col = k < 0.45 ? lerp(under, mid, k / 0.45) : lerp(mid, top, (k - 0.45) / 0.55);
    for (let i = 0; i < seg; i++) f.push([p(i, j), p(i + 1, j + 1), p(i + 1, j), col], [p(i, j), p(i, j + 1), p(i + 1, j + 1), col]);
  }
}

// the tree at a level: q 0 near (each limb and clump), 1 middle, 2 far (one crown on a trunk)
function pine(q) {
  const f = [], R = rng(7), fork = [LEAN[0], FORK, LEAN[1]];
  tube(f, [0, 0, 0], fork, 0.46, 0.24, [7, 5, 4][q]);
  const n = [11, 6, 0][q];
  if (q === 2) { clump(f, [LEAN[0], CROWN_Y, LEAN[1]], CROWN_R, 2.1, CROWN_R * 0.92, 7, 3); return f; }
  // the limbs: from the fork out and up to where the crown's clumps sit
  const limbs = [0, 2.1, 4.2].map((a) => a + R() * 0.6);
  for (const a of limbs) tube(f, fork, [LEAN[0] + Math.cos(a) * CROWN_R * 0.45, CROWN_Y - 0.6, LEAN[1] + Math.sin(a) * CROWN_R * 0.45], 0.16, 0.08, q ? 3 : 4);
  // the crown: one broad, flat clump in the middle, and a ring of smaller ones round it, a little up and down
  clump(f, [LEAN[0], CROWN_Y + 0.4, LEAN[1]], CROWN_R * 0.66, 1.9, CROWN_R * 0.62, q ? 8 : 14, q ? 3 : 6);   // a dense dome, not a flat plate
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI + R() * 0.5, r = CROWN_R * (0.55 + R() * 0.25), s = 1.5 + R() * 0.9;
    clump(f, [LEAN[0] + Math.cos(a) * r, CROWN_Y + (R() - 0.5) * 1.1, LEAN[1] + Math.sin(a) * r], s, s * 0.62, s * (0.8 + R() * 0.3), q ? 6 : 10, q ? 3 : 5);
  }
  return f;
}

export default {
  uid: 'e4f1685f-2db4-41a6-89df-e818cb470fdd',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Stone pine',
  kind: 'tree',
  about: 'The umbrella pine of the Mediterranean: a bare, leaning trunk that forks high into a few limbs under one broad, flat crown of dark needles.',
  size: { length: 2 * CROWN_R * 1.2, width: 2 * CROWN_R * 1.2, height: H },
  colours: { bark, needles: top, shade: under },
  crown: [LEAN[0], CROWN_Y, LEAN[1], CROWN_R],   // its crown's middle and reach: the light rounds over it as over one dome (src/scatter/trees.js)
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, tree (assets/kinds.js); P: cells per patch side
  detail: { levels: [{ faces: pine(0), P: 4 }, { faces: pine(1), P: 8 }, { faces: pine(2), P: 16 }] },
  // scattered where the pine forest lies: a cell of 11 m holds one tree at most, as many as the biome's share says
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cell: 9, density: 0.75, clumps: 55, scale: [0.6, 1.3], lean: 0.12, seed: 300 },   // clumps: metres across the groves and glades a stand is made of; lean: how far a trunk may lean
};
