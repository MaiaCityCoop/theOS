// A moss cushion: a low green dome on the wood's floor, two or three grown into one another, where the litter lies thin
// and the ground keeps damp. With the dead wood, what makes the floor a thing with bodies on it.
// Built with the tree kit's builder (assets/kit/tree.js): a closed, solid body (one piece: no sprig cut out of it), its
// skin the moss the rocks wear; two shapes, two levels (first shares of each), none farther. An asset in the one recipe
// (assets/index.js), of kind `shrub` (assets/kinds.js), scattered by the trees' engine in the pine forest's litter
// (biomes/pineforest.js `litter`), more of it in the shade.
import { tree, builder } from './kit/tree.js';
import { norm } from './kit/math.js';
import { rng } from '../src/core/hash.js';

const woodCol = [0.1, 0.16, 0.05], leafCol = [0.1, 0.16, 0.05];   // (for a picture without the textures)
const FOOT = 0.15;   // what stands in a stand is set this deep into the ground (src/scatter/trees.js): its skirt goes down that far

// the cushion, round; S its shape: its domes
function grow(S) {
  const R0 = rng(S.seed), b = builder({ colours: [woodCol, leafCol] }), sides = 10, rings = 4;
  for (let d = 0; d < S.domes; d++) {
    const a = R0() * 2 * Math.PI, off = d ? S.r * (0.6 + 0.5 * R0()) : 0, c = [Math.cos(a) * off, 0, Math.sin(a) * off], r = S.r * (d ? 0.5 + 0.35 * R0() : 1), h = S.h * (d ? 0.55 + 0.4 * R0() : 1);
    const wob = Array.from({ length: sides }, () => 0.82 + 0.36 * R0()), row = [];
    // rings from its skirt (under the ground) up to its top, each corner lit as the dome faces there, darker low
    for (let i = 0; i <= rings; i++) {
      const u = i / rings, ang = u * Math.PI * 0.5, rr = r * Math.cos(ang) * (i ? 1 : 1.08), y = i ? FOOT + h * Math.sin(ang) : 0, ring = [];
      for (let k = 0; k <= sides; k++) {
        const t = (k / sides) * 2 * Math.PI, w = wob[k % sides], p = [c[0] + Math.cos(t) * rr * w, y, c[2] + Math.sin(t) * rr * w];
        const nrm = norm([Math.cos(t) * Math.cos(ang) * 0.7, Math.sin(ang) * 0.7 + 0.6, Math.sin(t) * Math.cos(ang) * 0.7]);
        ring.push(b.v(p, nrm, [p[0] / 0.45, p[2] / 0.45], 0, 0.55 + 0.45 * u, [0, 1, 0], [c[0], FOOT, c[2]]));
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
  kind: 'litter',
  about: 'A low cushion of moss on the damp, shaded wood floor.',
  // what a real one measures, and where that is known from (intent 0035; world/scale.js: the scale it is read against)
  measure: {
    real: 'Leucobryum glaucum, cushion moss: cushions on the wood\'s floor, two or three grown together',
    typical: [0.05, 0.15],
    most: 0.3,
    source: ['Gardenia: cushions 5 to 15 cm high, 20 to 60 cm across; an EOL record: up to 50 × 45 cm and almost 30 cm thick; Minnesota Seasons: up to 13 cm tall and 1 m across'],
  },
  colours: { wood: woodCol, leaves: leafCol },
  materials: { wood: 'ae3df398-9f52-4a4a-b54f-a2db2eafb0c8' /* the moss the rocks wear, its skin */, leaves: 'ae3df398-9f52-4a4a-b54f-a2db2eafb0c8' /* (it bears none: the engine asks for one) */ },
  foliage: { wrap: 0.5, through: 0, flutter: 0, tint: [0.75, 0.95, 0.6] },
  wind: { sway: 0 },   // it lies: no wind moves it
  shapes: [{ r: 0.42, h: 0.13, domes: 3, seed: 721 }, { r: 0.28, h: 0.09, domes: 2, seed: 722 }],
  grow,
  // where it lies (src/scatter/rule.js): the pine forest's floor, most of it in the shade (light: how thick in deep
  // shade and in the open)
  placement: { at: 'scatter', engine: 'trees', biome: '170e8df4-254e-4df2-95e2-c584380cf14b' /* pine forest */, cover: 0.12, light: [1, 0.25], scale: [0.8, 1.25], lean: 0, seed: 720 },
});
