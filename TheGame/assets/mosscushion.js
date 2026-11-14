// A moss cushion: a low green dome on the wood's floor, two or three grown into one another, where the litter lies thin
// and the ground keeps damp. With the dead wood, what makes the floor a thing with bodies on it.
// Built with the tree kit's builder (assets/kit/tree.js): a closed, solid body (part 2: no sprig cut out of it), its
// skin the moss the rocks wear; two shapes, two levels of its own, none farther. An asset in the one recipe
// (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by the trees' engine in the pine forest's litter
// (biomes/pineforest.js `litter`), more of it in the shade.
import { tree, builder, rng, norm } from './kit/tree.js';

const woodCol = [0.1, 0.16, 0.05], leafCol = [0.1, 0.16, 0.05];   // (for a picture without the textures)
const FOOT = 0.15;   // what stands in a stand is set this deep into the ground (src/scatter/trees.js): its skirt goes down that far

// a level of it: q 0 near (round), 1 further (coarser); S its shape: its domes
function grow(q, S) {
  const R0 = rng(S.seed), b = builder({ colours: [woodCol, leafCol] }), sides = q ? 6 : 10, rings = q ? 2 : 4;
  for (let d = 0; d < S.domes; d++) {
    const a = R0() * 2 * Math.PI, off = d ? S.r * (0.6 + 0.5 * R0()) : 0, c = [Math.cos(a) * off, 0, Math.sin(a) * off], r = S.r * (d ? 0.5 + 0.35 * R0() : 1), h = S.h * (d ? 0.55 + 0.4 * R0() : 1);
    const wob = Array.from({ length: sides }, () => 0.82 + 0.36 * R0()), row = [];
    // rings from its skirt (under the ground) up to its top, each corner lit as the dome faces there, darker low
    for (let i = 0; i <= rings; i++) {
      const u = i / rings, ang = u * Math.PI * 0.5, rr = r * Math.cos(ang) * (i ? 1 : 1.08), y = i ? FOOT + h * Math.sin(ang) : 0, ring = [];
      for (let k = 0; k <= sides; k++) {
        const t = (k / sides) * 2 * Math.PI, w = wob[k % sides], p = [c[0] + Math.cos(t) * rr * w, y, c[2] + Math.sin(t) * rr * w];
        const nrm = norm([Math.cos(t) * Math.cos(ang) * 0.7, Math.sin(ang) * 0.7 + 0.6, Math.sin(t) * Math.cos(ang) * 0.7]);
        ring.push(b.v(p, nrm, [p[0] / 0.45, p[2] / 0.45], 2, 0.55 + 0.45 * u, [0, 1, 0], [c[0], FOOT, c[2]]));
      }
      row.push(ring);
    }
    for (let i = 0; i < rings; i++) for (let k = 0; k < sides; k++) { const p0 = row[i][k], p1 = row[i][k + 1], p2 = row[i + 1][k], p3 = row[i + 1][k + 1]; b.index.push(p0, p2, p3, p0, p3, p1); }
  }
  return b;
}

export default tree({
  uid: '35e25aab-5b51-41bc-9914-31cd4b9915ec',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'asset',
  name: 'Moss cushion',
  kind: 'shrub',
  about: 'A low cushion of moss on the wood’s floor, a few grown together: green where the needles lie thin and the shade keeps the ground damp.',
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'bf97f33b-56bd-4df4-89ba-949e77ce8c27' /* pine bark (it has no wood: the engine asks for one) */, leaves: 'ae3df398-9f52-4a4a-b54f-a2db2eafb0c8' /* the moss the rocks wear */ },
  foliage: { wrap: 0.5, through: 0, flutter: 0, tint: [0.75, 0.95, 0.6] },
  wind: { sway: 0 },   // it lies: no wind moves it
  shapes: [{ r: 0.42, h: 0.13, domes: 3, seed: 721 }, { r: 0.28, h: 0.09, domes: 2, seed: 722 }],
  grow,
  // its levels of detail, near to far (src/detail): where each ends comes from its kind, shrub (assets/kinds.js)
  levels: [{ P: 4, most: [178, 260] }, { P: 8, most: [68, 78] }],   // most: the most vertices and triangles a shape of it has at that level (its place in the heap: src/scatter/heap.js; a recipe that grows past it is told so)
  far: false,
  // where it lies: the pine forest's litter, of which it takes its share; most of it in the shade of the groves
  placement: { at: 'scatter', engine: 'trees', stand: 'litter', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, share: 0.4, scale: [0.8, 1.25], lean: 0,
    where: { field: 'glade', from: 1, to: 0.25 }, seed: 720 },
});
