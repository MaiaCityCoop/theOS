// The holm oak (Quercus ilex): the evergreen oak of the Mediterranean, as it stands among the pines. A short, stout
// trunk of dark bark cracked into small plates; a low fork into heavy limbs that rise and spread; and a broad, dense,
// rounded crown, as wide as it is high when old, its foliage down to head height, so dark a green it reads nearly black
// from afar. Slow to grow and long to live. Built with the tree kit (assets/kit/tree.js) as a mesh per level of detail
// and shape: the wood as tubes wrapped in its bark (materials/holmoakbark.js), the leaves as crossed cards cut out of a
// painted sprig (materials/holmoakleaf.js), lit as the ball its crown makes. An asset in the one recipe
// (assets/index.js), scattered by the trees' engine (src/scatter/trees.js) in the pine forest's stand, of which it takes
// its share (biomes/pineforest.js). Units are metres; a shape is a stage of its growth at its own height.
import { tree, builder, tube, cards, crown, rng, add, sub, mul, norm, lerp } from './kit/tree.js';

// how it grows: at six a dense bush a little over a metre; at eighteen a tall bush of four metres, leaves to the ground;
// at forty a small round tree on a short bole; at ninety fifteen metres, its crown as wide; at two hundred a great dome
// over twenty metres across. Its height by age (metres), and its numbers at an age: its height, where its crown begins,
// its crown's reach, how far its crown's widest part lies up it (squat), how many great limbs leave its fork, its lean.
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const height = (year) => 21 * (1 - Math.exp(-year / 70)) ** 1.15;
function form(year, v, seed = 410) {
  const R0 = rng(seed * 7919 + v * 31 + year * 7), H = height(year), old = sstep(12, 110, year), side = v % 2 ? -1 : 1;
  return {
    seed: seed * 104729 + v * 12 + year, H, base: H * (0.07 + 0.2 * old), r: H * (0.34 + 0.2 * old) * (0.93 + 0.14 * R0()), squat: 0.38 + 0.1 * R0(),
    limbs: year < 14 ? 1 : 5 + ((v + (year > 60 ? 1 : 0)) % 2) * 2, lean: [side * (0.04 + 0.3 * old), (R0() - 0.5) * 0.5 * old],
  };
}
let H, BASE, R, C, UP, DN, FORK;   // the shape being built (use sets them): its height, its crown's foot and reach, its crown's middle and how far it rises and hangs from there, its fork
const barkCol = [0.15, 0.135, 0.115], leafCol = [0.045, 0.08, 0.035];   // (for a picture without the textures)

// how far out of its crown's middle a point is: 0 at the middle, 1 on its skin; and the crown's outward way there
const rho = (p) => Math.hypot((p[0] - C[0]) / R, (p[1] - C[1]) / (p[1] > C[1] ? UP : DN), (p[2] - C[2]) / R);
const out = (p) => norm([(p[0] - C[0]) / (R * R), (p[1] - C[1]) / (p[1] > C[1] ? UP : DN) ** 2, (p[2] - C[2]) / (R * R)]);
// light inside the crown: less the deeper in, and less under it than on top (a holm oak's crown is dense: dark within)
const aoAt = (p) => { const k = Math.min(1, rho(p)), up = (p[1] - (C[1] - DN)) / (UP + DN); return Math.min(1, Math.max(0.2, (0.2 + 0.8 * k ** 1.6) * (0.6 + 0.4 * Math.min(1, Math.max(0, up * 1.3))))); };
// a shape taken up: its numbers, and the builder its wood is lit in (in its crown's shade, a little lighter down the bole)
const use = (T) => {
  H = T.H; BASE = T.base; R = T.r; DN = (H - BASE) * T.squat; UP = H - BASE - DN;
  FORK = [T.lean[0], BASE * 0.92, T.lean[1]]; C = [T.lean[0] * 1.3, BASE + DN, T.lean[1] * 1.3];
  return builder({ ao: (p) => (rho(p) < 1 ? aoAt(p) * 0.85 : 0.5 + 0.3 * Math.max(0, 1 - p[1] / Math.max(BASE, 0.3))), barkTile: 0.9, colours: [barkCol, leafCol] });
};
// how many puffs its crown takes, to a grown pine's: its skin over a puff's size squared
const fill = (g) => Math.min(2.2, Math.max(0.3, (R * (R + UP + DN)) / (7.2 * 10.1) / (g * g)));
const sizes = (T) => { const k = R / 7.2; return { thick: Math.min(1.5, Math.max(0.1, H / 15)), g: Math.min(1.25, Math.max(0.3, 0.3 + 0.7 * k)) }; };
// its bole: stout, flared at its foot, leaning a little as it rises to the fork; t 0..1 up it
const boleAt = (t) => [FORK[0] * t * t, FORK[1] * t, FORK[2] * t * t];
// a puff's place: on its crown's skin (most) or within (some: no looking through it), more of them above than under
const puffAt = (R0, pr) => {
  const th = R0() * 2 * Math.PI, u = -0.72 + 1.72 * R0() ** 0.85, k = R0() < 0.14 ? 0.45 + 0.35 * R0() : 0.84 + 0.14 * R0(), c = Math.sqrt(Math.max(0, 1 - u * u));
  return { pr, p: [C[0] + Math.cos(th) * c * R * k, C[1] + u * (u > 0 ? UP : DN) * k, C[2] + Math.sin(th) * c * R * k] };
};
// its great limbs: from the bole's top, one below another (not all from one point), rising and spreading, by turns steep
// (into the crown's top) and flat (out to its rim); young, a single leader up through its crown
const limbsOf = (T, v, R0) => (T.limbs === 1 ? [{ from: FORK, end: add(C, [0, UP * 0.25, 0]) }]
  : Array.from({ length: T.limbs }, (_, j) => {
    const a = 0.4 + v * 1.3 + (j * 2 * Math.PI) / T.limbs + (R0() - 0.5) * 0.5, steep = j % 2 === 0, reach = R * (steep ? 0.22 + 0.15 * R0() : 0.55 + 0.15 * R0());
    return { from: boleAt(1 - 0.28 * (j / (T.limbs - 1)) * (steep ? 0.5 : 1)), end: [C[0] + Math.cos(a) * reach, C[1] + (steep ? UP * (0.4 + 0.25 * R0()) : UP * 0.1 - DN * 0.3 * R0()), C[2] + Math.sin(a) * reach] };
  }));

// ---- the tree at a level: q 0 near (every twig), 1 middle (branches, larger sprigs), 2 far (limbs, a few big sprigs), 3 farthest
// (its bole and a dozen great sprigs: a tree a few dozen pixels high); T its shape (an age's form), v which ----
function oak(q, T, v) {
  const b = use(T), R0 = rng(T.seed), { thick, g } = sizes(T);
  const nT = q === 3 ? 3 : 7, rT = (t) => thick * (0.28 + 0.08 * (1 - t) + 0.18 * Math.max(0, 1 - t * 5) ** 2);
  tube(b, Array.from({ length: nT }, (_, i) => boleAt(i / (nT - 1))), Array.from({ length: nT }, (_, i) => rT(i / (nT - 1))), [12, 7, 5, 3][q], { body: true });
  const puffs = Array.from({ length: Math.round([150, 60, 22, 8][q] * fill(g)) }, () => puffAt(R0, [0.95, 1.35, 1.5, 1.9][q] * (0.8 + 0.45 * R0()) * g));
  crown(b, q, {
    limbs: limbsOf(T, v, R0), puffs, thick, g, girth: [0.2, 0.07], bow: 0.9, count: [10, 6, 4, 3], size: [0.95, 2.1, 3.6, 5.4], lift: 0, R0,
    dirOf: (p, d) => norm(add(mul(out(p), 0.9), mul(d, 0.75))),   // its sprigs stand out of its crown, all round it
    light: (p, d) => norm(add(mul(d, 0.35), add(mul(out(p), 0.85), [0, 0.15, 0]))),   // mostly its crown's: the leaf mass reads as one body, the puffs as its swell
    ao: (p, d) => Math.max(0.2, aoAt(p) * (0.65 + 0.35 * Math.max(0, d[0] * out(p)[0] + d[1] * out(p)[1] + d[2] * out(p)[2]))),   // a puff's inner side in its own shade
  });
  return b;
}
// ---- its shade: what the shadow map is drawn from. Its bole and limbs, and over each puff one pair of crossed cards as
// large as the puff: its outline and its dappling at a fraction of a level's cards ----
function shade(T, v) {
  const b = use(T), R0 = rng(T.seed + 7), { thick, g } = sizes(T);
  tube(b, [0, 0.5, 1].map(boleAt), [0.4, 0.32, 0.28].map((x) => x * thick), 5);
  for (const L of limbsOf(T, v, R0)) tube(b, [L.from, lerp(L.from, L.end, 0.5), L.end], [0.2, 0.13, 0.07].map((x) => x * thick), 3);
  for (let i = 0, n = Math.round(40 * fill(g)); i < n; i++) {
    const c = puffAt(R0, (1.5 + 0.7 * R0()) * g), h = R0() * 2 * Math.PI, dir = norm([Math.cos(h), 0.25, Math.sin(h)]), s = c.pr * 1.8;
    cards(b, sub(c.p, mul(dir, s / 2)), dir, s, [0, 1, 0], 1, R0);
  }
  return b;
}

export default tree({
  uid: '40cb573a-5aa3-4e2f-90ff-41e69d20915e',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Holm oak',
  kind: 'tree',
  about: 'The evergreen oak of the Mediterranean: a short, stout trunk of dark, finely cracked bark, a low fork into heavy spreading limbs, and a broad, dense, rounded crown of small leathery leaves, nearly black from afar.',
  colours: { bark: barkCol, leaves: leafCol },
  materials: { wood: 'fb5ce908-7437-45b6-879f-154de32d12b9' /* holm oak bark */, leaves: 'c4cbd29b-9dd2-494d-913b-9a80c40ab8e6' /* holm oak sprig */ },
  foliage: { wrap: 0.32, through: 0.16, flutter: 0.55 },   // leathery leaves: little light through them, and they tremble less than needles
  wind: { sway: 0.2 },   // a stout tree: its crown gives less
  // its stages of growth, by age (years), and how many variants of each; a tree in the world is as old as its stand says
  growth: { years: [6, 18, 40, 90, 200], variants: [1, 1, 2, 2, 2], form, height, min: 2, max: 400 },
  grow: oak, shade,
  // what it drops: the ground under it where it leads in its stand (the land lays it: src/terrain/material.js)
  litter: { material: 'd269b213-283d-4f8f-92b0-66b57ac2e8b6' /* oak litter */, tile: [1.9, 3.1] },
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, tree (assets/kinds.js); P: cells per patch side
  levels: [{ P: 4 }, { P: 8 }, { P: 16 }, { P: 32 }],
  // where it grows: the pine forest's stand (its cells, its groves, its ages: biomes/pineforest.js `trees`), of which it
  // takes its share; scale: one tree's own size about its age's height; lean: how far a trunk may lean; seed: its shapes'
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, share: 0.3, scale: [0.9, 1.1], lean: 0.06, seed: 410 },
});
