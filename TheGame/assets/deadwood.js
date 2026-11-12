// Dead wood: a fallen branch on the forest's floor, weathered grey, a few twigs still on it, some of them snapped. What a
// pine wood's floor is strewn with between its bushes: it gives the ground things that lie on it and cast their shade.
// Built with the tree kit (assets/kit/tree.js): tubes only, no foliage; three shapes, two levels of its own, none
// farther (a stick is gone before it is a pixel wide). An asset in the one recipe (assets/index.js), of kind `shrub`
// (assets/kinds.js), scattered by the trees' engine in the pine forest's litter (biomes/pineforest.js `litter`).
import { tree, builder, tube, rng, add, mul, norm, cross } from './kit/tree.js';

const woodCol = [0.2, 0.17, 0.14], leafCol = [0.2, 0.17, 0.14];   // (for a picture without the textures)
const FOOT = 0.15;   // what stands in a stand is set this deep into the ground (src/scatter/trees.js): a thing that lies on it is built that much higher

// a level of it: q 0 near (round, every twig), 1 further (three-sided, its larger twigs); S its shape
function grow(q, S) {
  const R0 = rng(S.seed), b = builder({ ao: () => 1, barkTile: 0.35, colours: [woodCol, leafCol] });
  const sides = q ? 3 : 6, n = q ? 3 : 6, a0 = R0() * Math.PI, dir = [Math.cos(a0), 0, Math.sin(a0)], side = cross(dir, [0, 1, 0]);
  // the branch: lying, bowed a little sideways, its thin end lifted off the ground where its twigs prop it
  const at = (t) => add(add(mul(dir, (t - 0.5) * S.len), mul(side, Math.sin(t * Math.PI) * S.bow)), [0, FOOT + S.r * (1 - 0.6 * t) + t * t * S.lift, 0]);
  const pts = Array.from({ length: n + 1 }, (_, i) => at(i / n)), rad = pts.map((_, i) => S.r * (1 - 0.72 * (i / n)));
  tube(b, pts, rad, sides);
  // its twigs: off to either side and up, the lower ones resting on the ground
  for (let k = 0; k < (q ? Math.ceil(S.twigs / 2) : S.twigs); k++) {
    const t = 0.25 + 0.65 * R0(), p = at(t), sgn = R0() < 0.5 ? -1 : 1, up = R0() * 0.9 - 0.15, L = S.len * (0.14 + 0.2 * R0()) * (1 - 0.4 * t), r = S.r * (1 - 0.72 * t) * 0.55;
    const d = norm(add(add(mul(side, sgn), mul(dir, 0.5 + 0.6 * R0())), [0, up, 0])), e = add(p, mul(d, L));
    if (e[1] < FOOT + r) e[1] = FOOT + r;
    tube(b, [p, add(add(p, mul(d, L * 0.5)), [0, L * 0.06, 0]), e], [r, r * 0.75, r * 0.4], q ? 3 : 4);
  }
  return b;
}

export default tree({
  uid: '43ceb501-3788-47fc-bb64-fa4df1bcafa1',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Dead wood',
  kind: 'shrub',
  about: 'A fallen branch on the wood’s floor: grey bark, a few twigs still on it, lying where it came down.',
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'fb5ce908-7437-45b6-879f-154de32d12b9' /* holm oak bark: grey, as wood weathers */, needles: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742' /* pine tuft (it bears none: the engine asks for one) */ },
  wind: { sway: 0 },   // it lies: no wind moves it
  shapes: [{ len: 2.9, r: 0.075, bow: 0.3, lift: 0.14, twigs: 6, seed: 711 }, { len: 1.8, r: 0.05, bow: 0.16, lift: 0.07, twigs: 4, seed: 712 }, { len: 1.1, r: 0.034, bow: 0.07, lift: 0.03, twigs: 3, seed: 713 }],
  grow,
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, shrub (assets/kinds.js)
  levels: [{ P: 4 }, { P: 8 }],
  far: false,
  // where it lies: the pine forest's litter, of which it takes its share
  placement: { at: 'scatter', engine: 'trees', stand: 'litter', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, share: 0.6, scale: [0.85, 1.15], lean: 0, seed: 710 },
});
