// The stone pine (Pinus pinea): the umbrella pine of the Mediterranean, as it stands in a pineta. A long, slender trunk of
// reddish-grey plated bark, bending in a slow S, bare to well over half its height; there it forks, and forks again, into
// six long, thin limbs that fan up and out like the ribs of an umbrella; they split into branches, the branches into
// twigs, and at the twigs' ends brushes of long needles heap into puffs, rounded like clouds, that together make one
// broad dome, flat underneath. Built with the tree kit (assets/kit/tree.js) as a mesh per level of detail and shape: the
// wood as tubes wrapped in bark (materials/pinebark.js), the needles as crossed cards cut out of a painted tuft (materials/pinetuft.js), each card's
// normal its puff's and the dome's (so a puff is lit as a ball: bright on top, dark under). An asset in the one recipe
// (assets/index.js), scattered by the trees' engine (src/scatter/trees.js) where the pine forest lies (biomes/
// pineforest.js). Units are metres for a tree of scale 1 (13 to 14 m high, a young one 8.5); the origin is the foot of its trunk.
import { tree, builder, tube, cards, outward, rng, add, sub, mul, norm, lerp, bez } from './kit/tree.js';

// its shapes: no two pines of a stand alike. Each a seed, where its trunk forks (and how its S bends), its crown's flat
// underside, its dome's height and reach, and how its limbs branch (stems from the fork, limbs from each stem); the last a
// young one, forking low into a rounder, smaller crown. A cell picks one (src/scatter/trees.js).
const SHAPES = [
  { seed: 11, fork: [0.9, 7.2, 0.35], base: 10.2, dome: 2.9, r: 7.2, stems: 2, limbs: 3, bend: 0.5 },    // the classic: tall, bare, its umbrella broad
  { seed: 23, fork: [-0.7, 8.6, 0.9], base: 11.4, dome: 2.5, r: 7.9, stems: 2, limbs: 3, bend: -0.7 },   // taller still, flatter, broader
  { seed: 37, fork: [0.6, 5.8, -0.8], base: 8.8, dome: 3.3, r: 6.5, stems: 3, limbs: 2, bend: 0.8 },     // forked low into three stems, its dome rounder
  { seed: 51, fork: [0.25, 3.6, 0.2], base: 5.4, dome: 3.1, r: 4.2, stems: 1, limbs: 4, bend: 0.25 },    // young: a short trunk, a round crown
];
let FORK, BASE, DOME, R, MID;   // the shape being built (use sets them)
const barkCol = [0.33, 0.22, 0.15], needleCol = [0.1, 0.18, 0.06];   // (for a picture without the textures: the library's list)

// the dome's top over a point r metres out from its middle
const topAt = (r) => BASE + DOME * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
// light inside the crown: the deeper under its dome and the nearer its middle, the less
const aoAt = (p) => { const r = Math.hypot(p[0] - MID[0], p[2] - MID[2]), depth = (topAt(r) - p[1]) / DOME; return Math.min(1, Math.max(0.3, 1 - depth * 0.55 + (r / R) * 0.15)); };
// a shape taken up: its numbers, and the builder its wood is lit in (darker under the crown, lighter down the bare trunk)
const use = (T) => { FORK = T.fork; BASE = T.base; DOME = T.dome; R = T.r; MID = [T.fork[0] * 1.1, 0, T.fork[2] * 1.1]; return builder({ ao: (p) => aoAt(p) * 0.8 + 0.2 * Math.min(1, p[1] / FORK[1]), barkTile: 1.1, colours: [barkCol, needleCol] }); };

// ---- the tree at a level: q 0 near (every twig), 1 middle (branches, larger tufts), 2 far (limbs, a few big tufts), 3 farthest
// (a trunk, its stems and a dozen great tufts: a tree a few dozen pixels high); v its shape ----
function pine(q, T, v) {
  const b = use(T), R0 = rng(T.seed), S = [12, 7, 5, 3][q], s2 = [8, 5, 4, 3][q], k = R / 7.2, thick = 0.55 + 0.45 * k;   // k: its crown's reach to the classic's
  // the trunk: flared at its foot, bending in a slow S as it climbs to the fork
  const nT = q === 3 ? 4 : 10, trunk = Array.from({ length: nT }, (_, i) => { const t = i / (nT - 1); return [FORK[0] * t + Math.sin(t * Math.PI) * T.bend, FORK[1] * t, FORK[2] * t + Math.sin(t * Math.PI * 2) * 0.2 * Math.sign(T.bend)]; });   // (the S comes back to the fork: its stems start where it ends)
  tube(b, trunk, trunk.map((_, i) => { const t = i / (nT - 1); return thick * (0.24 + 0.12 * (1 - t) + 0.2 * Math.max(0, 1 - t * 7) ** 2); }), S, { body: true });
  if (q === 0) for (const [y, a] of [[0.5, 0.6], [0.68, 2.9], [0.85, 4.8]]) {   // the stubs of limbs it shed long ago
    const at = trunk[Math.round(y * 9)], d = norm([Math.cos(a + v), 0.3, Math.sin(a + v)]);
    tube(b, [at, add(at, mul(d, 0.5 * thick))], [0.06 * thick, 0.025 * thick], 5);
  }
  // the puffs: rounded heaps of needles over the dome, most along its top, a ring of them making its flat underside's rim
  const nP = Math.round([140, 56, 20, 9][q] * Math.max(0.55, k * k)), puffs = [];
  for (let i = 0; i < nP; i++) {
    const a = R0() * 2 * Math.PI, rim = R0() < 0.35, r = R * (rim ? 0.62 + 0.36 * R0() : Math.sqrt(0.04 + 0.92 * R0())), pr = [1, 1.4, 1.4, 1.8][q] * (0.8 + 0.45 * R0());
    const y = rim ? BASE + 0.15 + R0() * 0.45 : topAt(r) - pr * (0.7 + 0.25 * R0());   // the rim's puffs make the flat underside
    puffs.push({ a, pr, p: [MID[0] + Math.cos(a) * r, y, MID[2] + Math.sin(a) * r] });
  }
  // stems from the fork, each forking again into limbs, fanning up and out like an umbrella's ribs
  const limbs = [], nL = T.stems * T.limbs, rise = (BASE - FORK[1]) * 0.5;
  for (let j = 0; j < T.stems; j++) {
    const sa = 0.3 + v + (j * 2 * Math.PI) / T.stems, so = [Math.cos(sa), 0, Math.sin(sa)], top = add(FORK, add(mul(so, 0.9 * k * (T.stems > 1)), [0, rise * (0.9 + R0() * 0.25), 0]));
    tube(b, bez(FORK, add(FORK, [0, rise * 0.6, 0]), top, q === 3 ? 1 : 4), [0.2, 0.18, 0.165, 0.15, 0.14].slice(0, q === 3 ? 2 : 5).map((x) => x * thick), s2);
    for (let l = 0; l < T.limbs; l++) limbs.push({ from: top, a: sa + (l - (T.limbs - 1) / 2) * ((2 * Math.PI) / nL) + (R0() - 0.5) * 0.3 });
  }
  const near = (a) => limbs.reduce((m, l, k) => (Math.abs(Math.atan2(Math.sin(a - l.a), Math.cos(a - l.a))) < Math.abs(Math.atan2(Math.sin(a - limbs[m].a), Math.cos(a - limbs[m].a))) ? k : m), 0);
  limbs.forEach((L, li) => {
    const out = [Math.cos(L.a), 0, Math.sin(L.a)], reach = R * (0.5 + 0.2 * R0()), end = [MID[0] + out[0] * reach, BASE - 0.1 + R0() * 0.5, MID[2] + out[2] * reach];
    if (q < 3) tube(b, bez(L.from, add(lerp(L.from, end, 0.45), [0, 1.3 * k, 0]), end, 6), [0.11, 0.1, 0.09, 0.08, 0.07, 0.06, 0.055].map((x) => x * thick), q ? 4 : 6);   // long and thin, bowed upward
    const mine = puffs.filter((c) => near(c.a) === li);
    const nG = q >= 2 ? 1 : q ? 2 : 3, groups = Array.from({ length: nG }, () => []);
    mine.sort((x, y) => Math.hypot(x.p[0] - MID[0], x.p[2] - MID[2]) - Math.hypot(y.p[0] - MID[0], y.p[2] - MID[2])).forEach((c, i) => groups[Math.floor((i * nG) / mine.length)].push(c));
    for (const g of groups) {
      if (!g.length) continue;
      const G = sub(mul(g.reduce((s, c) => add(s, c.p), [0, 0, 0]), 1 / g.length), [0, 0.6, 0]);
      if (q < 2) tube(b, bez(lerp(L.from, end, 0.6), add(lerp(end, G, 0.5), [0, 0.6, 0]), G, 4), [0.06, 0.05, 0.042, 0.035, 0.03], q ? 3 : 5);
      for (const c of g) {
        if (q === 0) tube(b, bez(G, add(lerp(G, c.p, 0.5), [0, 0.3, 0]), c.p, 2), [0.03, 0.02, 0.013], 4);
        // the puff: brushes standing out all over its upper side, each lit as the ball it makes (and the dome it is part of)
        const dome = norm(mul(sub(c.p, [MID[0], BASE - 3.5, MID[2]]), 1)), n = [11, 6, 4, 3][q];
        for (let t = 0; t < n; t++) {
          const d = outward(R0, q >= 2 ? 0.55 : 0.25), at = add(c.p, mul(d, c.pr * 0.35)), light = norm(add(mul(d, 0.35), mul(dome, 0.85)));   // mostly the dome's: the needle mass reads as one surface, the puffs as its swell
          const ao = Math.max(0.22, aoAt(at) * (0.6 + 0.4 * Math.max(0, d[1])));   // a puff's underside in its own shade
          cards(b, at, norm(add(d, [0, 0.35, 0])), [1.15, 2.6, 4.4, 6][q] * (0.8 + R0() * 0.4), light, ao, R0);
        }
      }
    }
  });
  return b;
}
// ---- its shade: what the shadow map is drawn from. The trunk and the limbs, and over each puff one pair of crossed cards
// as large as the puff: its outline and its dappling, with a quarter of the card area a level's brushes stack up ----
function shade(T, v) {
  const b = use(T), R0 = rng(T.seed + 7), k = R / 7.2, thick = 0.55 + 0.45 * k;
  const trunk = Array.from({ length: 6 }, (_, i) => { const t = i / 5; return [FORK[0] * t + Math.sin(t * Math.PI) * T.bend, FORK[1] * t, FORK[2] * t + Math.sin(t * Math.PI * 2) * 0.2 * Math.sign(T.bend)]; });
  tube(b, trunk, trunk.map((_, i) => thick * (0.24 + 0.12 * (1 - i / 5))), 5);
  const nL = T.stems * T.limbs;
  for (let l = 0; l < nL; l++) {   // the limbs, straight from the fork to the crown's underside
    const a = 0.3 + v + (l * 2 * Math.PI) / nL, end = [MID[0] + Math.cos(a) * R * 0.6, BASE, MID[2] + Math.sin(a) * R * 0.6];
    tube(b, [FORK, lerp(FORK, end, 0.5), end], [0.15, 0.1, 0.06].map((x) => x * thick), 3);
  }
  const nP = Math.round(36 * Math.max(0.55, k * k));
  for (let i = 0; i < nP; i++) {
    const a = R0() * 2 * Math.PI, r = R * Math.sqrt(0.05 + 0.9 * R0()), pr = 1.5 + 0.7 * R0(), y = Math.max(BASE + 0.4, topAt(r) - pr * 0.8);
    const p = [MID[0] + Math.cos(a) * r, y, MID[2] + Math.sin(a) * r], h = R0() * 2 * Math.PI, dir = [Math.cos(h), 0.25, Math.sin(h)], s = pr * 1.8;
    cards(b, sub(p, mul(norm(dir), s / 2)), norm(dir), s, [0, 1, 0], 1, R0);
  }
  return b;
}
export default tree({
  uid: 'e4f1685f-2db4-41a6-89df-e818cb470fdd',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Stone pine',
  kind: 'tree',
  about: 'The umbrella pine of the Mediterranean: a long, slender trunk bending in a slow S, bare to over half its height, six thin limbs fanning up like an umbrella’s ribs, and one broad dome of rounded needle puffs, flat underneath.',
  colours: { bark: barkCol, needles: needleCol },
  materials: { wood: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark */, leaves: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742' /* pine tuft */ },
  shapes: SHAPES, grow: pine, shade,
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, tree (assets/kinds.js); P: cells per patch side
  levels: [{ P: 4 }, { P: 8 }, { P: 16 }, { P: 32 }],
  // scattered where the pine forest lies: a cell holds one tree at most, as many as the biome's share and its groves say
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cell: 10, density: 0.75, clumps: 55, scale: [0.6, 1.45], lean: 0.1, seed: 300 },   // scale: the young ones small, the old a good 20 m; clumps: metres across the groves and glades a stand is made of; lean: how far a trunk may lean
});
