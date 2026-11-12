// The stone pine (Pinus pinea): the umbrella pine of the Mediterranean, as it stands in a pineta. A long, slender trunk of
// reddish-grey plated bark, bending in a slow S, bare to well over half its height; there it forks, and forks again, into
// six long, thin limbs that fan up and out like the ribs of an umbrella; they split into branches, the branches into
// twigs, and at the twigs' ends brushes of long needles heap into puffs, rounded like clouds, that together make one
// broad dome, flat underneath. Built with the tree kit (assets/kit/tree.js) as a mesh per level of detail and shape: the
// wood as tubes wrapped in bark (materials/pinebark.js), the needles as crossed cards cut out of a painted tuft (materials/pinetuft.js), each card's
// normal its puff's and the dome's (so a puff is lit as a ball: bright on top, dark under). An asset in the one recipe
// (assets/index.js), scattered by the trees' engine (src/scatter/trees.js) where the pine forest lies (biomes/
// pineforest.js). Units are metres; a shape is a stage of its growth at its own height; the origin is the foot of its trunk.
import { tree, builder, tube, cards, outward, rng, add, sub, mul, norm, lerp, bez } from './kit/tree.js';

// how it grows: a stone pine of five is a bush of a metre and a half, a ball of needles from the ground; at fifteen an
// egg of four metres on a short trunk; from about thirty it lifts its crown, the lower limbs shed, the trunk forks; at
// seventy a tall bare trunk under an umbrella; at a hundred and fifty twenty metres, its dome broad and flat. Its height
// by age (metres), and its numbers at an age: where the trunk forks (and how its S bends), its crown's flat underside,
// its dome's height and reach, how its limbs branch (stems from the fork, limbs from each stem). v: one of its variants.
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const height = (year) => 20 * (1 - Math.exp(-year / 55)) ** 1.1;
function form(year, v) {
  const R0 = rng(101 + v * 31 + year * 7), H = height(year), old = sstep(10, 90, year), side = v % 2 ? -1 : 1;
  const base = H * (0.14 + 0.64 * old), r = H * (0.42 + 0.1 * old) * (0.94 + 0.12 * R0());
  const stems = year < 25 ? 1 : v % 2 ? 3 : 2, limbs = stems === 1 ? 5 : stems === 2 ? 3 : 2;
  const forkY = stems === 1 ? base : base * (0.68 + 0.08 * R0());
  return { seed: 11 + v * 12 + year, fork: [side * (0.15 + 0.6 * old), forkY, (R0() - 0.5) * 0.7 * old], base, dome: H - base, r, stems, limbs, bend: side * (0.1 + 0.5 * old) };
}
let FORK, BASE, DOME, R, MID;   // the shape being built (use sets them)
const barkCol = [0.33, 0.22, 0.15], needleCol = [0.1, 0.18, 0.06];   // (for a picture without the textures: the library's list)

// the dome's top over a point r metres out from its middle
const topAt = (r) => BASE + DOME * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
// light inside the crown: the deeper under its dome and the nearer its middle, the less
const aoAt = (p) => { const r = Math.hypot(p[0] - MID[0], p[2] - MID[2]), depth = (topAt(r) - p[1]) / DOME; return Math.min(1, Math.max(0.3, 1 - depth * 0.55 + (r / R) * 0.15)); };
// a shape taken up: its numbers, and the builder its wood is lit in (darker under the crown, lighter down the bare trunk)
const use = (T) => { FORK = T.fork; BASE = T.base; DOME = T.dome; R = T.r; MID = [T.fork[0] * 1.1, 0, T.fork[2] * 1.1]; return builder({ ao: (p) => aoAt(p) * 0.8 + 0.2 * Math.min(1, p[1] / Math.max(FORK[1], 0.5)), barkTile: 1.1, colours: [barkCol, needleCol] }); };
// how many puffs its crown takes, to the classic's: its skin (reach times reach and height) over a puff's size squared
const fill = (g) => Math.min(1.8, Math.max(0.3, (R * (R + DOME)) / (7.2 * 10.1) / (g * g)));
// the trunk from its foot to the fork: a cubic curve that leans out one way low and back the other higher up, and comes
// into the fork nearly upright, so the stems carry on from it without a kink; t 0..1 up it
const trunkAt = (T, t) => {
  const P1 = [T.bend * 0.9, FORK[1] * 0.33, T.bend * 0.3], P2 = [FORK[0] - T.bend * 0.5, FORK[1] * 0.72, FORK[2] - T.bend * 0.2], u = 1 - t;
  return add(add(mul(P1, 3 * u * u * t), mul(P2, 3 * u * t * t)), mul(FORK, t * t * t));
};

// ---- the tree at a level: q 0 near (every twig), 1 middle (branches, larger tufts), 2 far (limbs, a few big tufts), 3 farthest
// (a trunk, its stems and a dozen great tufts: a tree a few dozen pixels high); T its shape (an age's form), v which ----
function pine(q, T, v) {
  const b = use(T), R0 = rng(T.seed), S = [12, 7, 5, 3][q], s2 = [8, 5, 4, 3][q], k = R / 7.2, H = BASE + DOME;
  const thick = Math.min(1.4, Math.max(0.12, H / 14)), g = Math.min(1.25, Math.max(0.3, 0.3 + 0.7 * k));   // thick: its wood's girth to the classic's; g: its puffs' and brushes' size
  // the trunk: flared at its foot, bending in a slow S as it climbs to the fork
  const nT = q === 3 ? 4 : 10, trunk = Array.from({ length: nT }, (_, i) => trunkAt(T, i / (nT - 1))), rT = (t) => thick * (0.24 + 0.12 * (1 - t) + 0.2 * Math.max(0, 1 - t * 7) ** 2);
  tube(b, trunk, trunk.map((_, i) => rT(i / (nT - 1))), S, { body: true });
  if (q === 0 && FORK[1] > 3) for (const [y, a] of [[0.5, 0.6], [0.68, 2.9], [0.85, 4.8]]) {   // the stubs of limbs it shed long ago
    const at = trunkAt(T, y), d = norm([Math.cos(a + v), 0.3, Math.sin(a + v)]);
    tube(b, [at, add(at, mul(d, 0.5 * thick))], [0.06 * thick, 0.025 * thick], 5);
  }
  // the puffs: rounded heaps of needles over the dome, most along its top, a ring of them making its flat underside's rim
  const nP = Math.round([140, 56, 20, 9][q] * fill(g)), puffs = [];   // as many as its crown's skin needs, puffs of its size
  for (let i = 0; i < nP; i++) {
    const a = R0() * 2 * Math.PI, rim = R0() < 0.35, r = R * (rim ? 0.62 + 0.36 * R0() : Math.sqrt(0.04 + 0.92 * R0())), pr = [1, 1.4, 1.4, 1.8][q] * (0.8 + 0.45 * R0()) * g;
    const y = rim ? BASE + (0.15 + R0() * 0.45) * g : topAt(r) - pr * (0.7 + 0.25 * R0());   // the rim's puffs make the flat underside
    puffs.push({ a, pr, p: [MID[0] + Math.cos(a) * r, y, MID[2] + Math.sin(a) * r] });
  }
  // stems from the fork, each forking again into limbs, fanning up and out like an umbrella's ribs; they start a little
  // inside the trunk's top and leave it the way it was going (one stem: the young tree's leader, up into its crown)
  const limbs = [], nL = T.stems * T.limbs, rise = T.stems === 1 ? DOME * 0.45 : (BASE - FORK[1]) * 0.5;
  const from = trunkAt(T, 0.94), way = norm(sub(FORK, trunkAt(T, 0.85))), r0 = rT(0.94) * (T.stems === 1 ? 1 : 0.82);
  for (let j = 0; j < T.stems; j++) {
    const sa = 0.3 + v + (j * 2 * Math.PI) / T.stems, so = [Math.cos(sa), 0, Math.sin(sa)], top = add(FORK, add(mul(so, 0.9 * k * (T.stems > 1)), [0, rise * (0.9 + R0() * 0.25), 0]));
    tube(b, bez(from, add(from, mul(way, rise * 0.7)), top, q === 3 ? 1 : 4), [1, 0.9, 0.82, 0.75, 0.7].slice(0, q === 3 ? 2 : 5).map((x) => x * r0), s2);
    for (let l = 0; l < T.limbs; l++) limbs.push({ from: top, a: sa + (l - (T.limbs - 1) / 2) * ((2 * Math.PI) / nL) + (R0() - 0.5) * 0.3 });
  }
  const near = (a) => limbs.reduce((m, l, k) => (Math.abs(Math.atan2(Math.sin(a - l.a), Math.cos(a - l.a))) < Math.abs(Math.atan2(Math.sin(a - limbs[m].a), Math.cos(a - limbs[m].a))) ? k : m), 0);
  limbs.forEach((L, li) => {
    const out = [Math.cos(L.a), 0, Math.sin(L.a)], reach = R * (0.5 + 0.2 * R0()), end = [MID[0] + out[0] * reach, BASE - 0.1 * g + R0() * 0.5 * g, MID[2] + out[2] * reach];
    if (q < 3) tube(b, bez(L.from, add(lerp(L.from, end, 0.45), [0, 1.3 * k, 0]), end, 6), [0.11, 0.1, 0.09, 0.08, 0.07, 0.06, 0.055].map((x) => x * thick), q ? 4 : 6);   // long and thin, bowed upward
    const mine = puffs.filter((c) => near(c.a) === li);
    const nG = q >= 2 ? 1 : q ? 2 : 3, groups = Array.from({ length: nG }, () => []);
    mine.sort((x, y) => Math.hypot(x.p[0] - MID[0], x.p[2] - MID[2]) - Math.hypot(y.p[0] - MID[0], y.p[2] - MID[2])).forEach((c, i) => groups[Math.floor((i * nG) / mine.length)].push(c));
    for (const gr of groups) {
      if (!gr.length) continue;
      const G = sub(mul(gr.reduce((s, c) => add(s, c.p), [0, 0, 0]), 1 / gr.length), [0, 0.6 * g, 0]);
      if (q < 2) tube(b, bez(lerp(L.from, end, 0.6), add(lerp(end, G, 0.5), [0, 0.6 * g, 0]), G, 4), [0.06, 0.05, 0.042, 0.035, 0.03].map((x) => x * g), q ? 3 : 5);
      for (const c of gr) {
        if (q === 0) tube(b, bez(G, add(lerp(G, c.p, 0.5), [0, 0.3 * g, 0]), c.p, 2), [0.03, 0.02, 0.013].map((x) => x * g), 4);
        // the puff: brushes standing out all over its upper side, each lit as the ball it makes (and the dome it is part of)
        const dome = norm(sub(c.p, [MID[0], BASE - DOME * 1.2, MID[2]])), n = [11, 6, 4, 3][q];
        for (let t = 0; t < n; t++) {
          const d = outward(R0, q >= 2 ? 0.55 : 0.25), size = [1.15, 2.6, 4.4, 6][q] * (0.8 + R0() * 0.4) * g, dir = norm(add(d, [0, 0.35, 0]));
          // its foot: on the puff's skin; a coarser level's larger brush sunk into it by the part it is larger, so every level
          // has the same outline (no fringe of the coarser one round the finer while they hand over)
          const at = sub(add(c.p, mul(d, c.pr * 0.35)), mul(dir, Math.max(0, size - 1.15 * g) * 0.8)), light = norm(add(mul(d, 0.35), mul(dome, 0.85)));   // mostly the dome's: the needle mass reads as one surface, the puffs as its swell
          const ao = Math.max(0.22, aoAt(at) * (0.6 + 0.4 * Math.max(0, d[1])));   // a puff's underside in its own shade
          cards(b, at, dir, size, light, ao, R0);
        }
      }
    }
  });
  return b;
}
// ---- its shade: what the shadow map is drawn from. The trunk and the limbs, and over each puff one pair of crossed cards
// as large as the puff: its outline and its dappling, with a quarter of the card area a level's brushes stack up ----
function shade(T, v) {
  const b = use(T), R0 = rng(T.seed + 7), k = R / 7.2, H = BASE + DOME, thick = Math.min(1.4, Math.max(0.12, H / 14)), g = Math.min(1.25, Math.max(0.3, 0.3 + 0.7 * k));
  const trunk = Array.from({ length: 6 }, (_, i) => trunkAt(T, i / 5));
  tube(b, trunk, trunk.map((_, i) => thick * (0.24 + 0.12 * (1 - i / 5))), 5);
  const nL = T.stems * T.limbs;
  for (let l = 0; l < nL; l++) {   // the limbs, straight from the fork to the crown's underside
    const a = 0.3 + v + (l * 2 * Math.PI) / nL, end = [MID[0] + Math.cos(a) * R * 0.6, BASE, MID[2] + Math.sin(a) * R * 0.6];
    tube(b, [FORK, lerp(FORK, end, 0.5), end], [0.15, 0.1, 0.06].map((x) => x * thick), 3);
  }
  const nP = Math.round(36 * fill(g));
  for (let i = 0; i < nP; i++) {
    const a = R0() * 2 * Math.PI, r = R * Math.sqrt(0.05 + 0.9 * R0()), pr = (1.5 + 0.7 * R0()) * g, y = Math.max(BASE + 0.4 * g, topAt(r) - pr * 0.8);
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
  // its stages of growth, by age (years), and how many variants of each; a tree in the world is as old as its stand says
  growth: { years: [5, 15, 35, 70, 150], variants: [1, 1, 2, 2, 2], form, height, min: 2, max: 220 },
  grow: pine, shade,
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, tree (assets/kinds.js); P: cells per patch side
  levels: [{ P: 4 }, { P: 8 }, { P: 16 }, { P: 32 }],
  // scattered where the pine forest lies: a cell holds one tree at most, as many as the biome's share and its groves say
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cell: 10, density: 0.75, clumps: 55, scale: [0.93, 1.07], lean: 0.1, seed: 300, age: { stand: [30, 150], young: 0.18, min: 3 } },   // scale: one tree's own, about its age's height; age: a stand's age (a slow noise between the two), one in `young` a sapling from min years; clumps: metres across the groves and glades a stand is made of; lean: how far a trunk may lean
});
