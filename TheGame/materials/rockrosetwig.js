// Rockrose twig: one leafy twig of a rockrose (Cistus salviifolius), whole, painted once: the twig up the card's middle
// and along it its soft, wrinkled, grey-green leaves, broad ovals, a few turned to show their felted underside, and now
// and then a flower towards its tip, five white petals round a yellow middle. The rockrose sprig's painting
// (materials/rockroseleaf.js) is a fan of six such twigs, laid on the holm oak sprig's fan (materials/holmoakleaf.twigs.js);
// this is one alone, nothing beside it, so a card of it can stand anywhere without cutting through another's leaves: what
// a rockrose's finest level is made of (assets/kit/tree.js: splayOf). Not a tiling texture: its height the cut-out. The
// leaves as the sprig's are: a grid of cells, a leaf to a cell, nine looked at.
import { float, vec2, vec3, mix, smoothstep, max, sin, cos, clamp, floor, fract, dot, atan } from 'three/tsl';
import { pn, ovalLeaf } from '../src/materials/paint.js';
import { oneTwig } from './holmoaktwig.js';
import { rockroseLeafIn, rockroseFlowerIn } from './rockroseleaf.js';
import FAN from './holmoakleaf.twigs.js';

const TWIG = FAN.twig;   // (the twig's foot, its length, how far either side its leaves reach: its fan's numbers)
const hash = (c, k) => fract(sin(dot(c, vec2(127.1, 311.7)).add(k * 17.3)).mul(43758.5453));   // a cell's own number, 0..1 (k: which)

export default {
  uid: '82945b8b-cc3f-48e4-8843-01708f2ecf82',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Rockrose twig',
  kind: 'foliage',
  about: 'One leafy twig, whole: the card of the nearest rockrose.',
  usedBy: 'the rockroses, seen close',
  swatch: [0.11, 0.14, 0.09],
  bump: 0.05,
  paint: (uv) => {
    const N = 11;   // cells across the card: a leaf about two of them long (the sprig's leaves on one of its twigs, as large)
    const { foot, L, onTwig, twig } = oneTwig(uv, TWIG, 0.12);   // (its leaves' middles as far as 0.12 of the card from it: the twig's half holds its broad leaves)
    // (where nothing is drawn the card is leaf green too: a far-off card's texels are means of their neighbours, and must not turn grey)
    const alpha = float(0).toVar(), col = vec3(0.09, 0.115, 0.075).toVar();
    col.assign(mix(col, vec3(0.16, 0.13, 0.1), twig));   // the twig, under the leaves
    const cells = floor(uv.mul(N));
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {   // its nine cells' leaves, laid one over another
      const c = cells.add(vec2(i, j)), mid = c.add(0.5).add(vec2(hash(c, 1), hash(c, 2)).sub(0.5).mul(0.8)).div(N), up = mid.y.sub(foot.y).div(L);
      const out = vec2(mid.x.sub(foot.x).mul(2.2), float(0.6)), ax = vec2(sin(atan(out.x, out.y).add(hash(c, 3).sub(0.5).mul(1.3))), cos(atan(out.x, out.y).add(hash(c, 3).sub(0.5).mul(1.3))));   // it points out from the twig and up
      const len = hash(c, 4).mul(0.7).add(1.55).div(N), wide = len.mul(hash(c, 5).mul(0.06).add(0.27));
      rockroseLeafIn(col, alpha, c, ovalLeaf(uv, mid, ax, len, wide, onTwig(mid).mul(smoothstep(0.12, 0.16, hash(c, 6)))), len, wide, smoothstep(0.6, 0.95, up).mul(hash(c, 8)));
      rockroseFlowerIn(col, alpha, c, uv, mid, N, onTwig(mid).mul(smoothstep(0.5, 0.7, up)));   // (towards its tip)
    }
    // (rough as its leaves are: wrinkled, and felted on both sides with star-shaped hairs, a sage-leaved cistus's)
    return { h: clamp(max(alpha, twig), 0, 1), col: col.mul(pn(uv.mul(46), 46, 30).mul(0.2).add(0.9)), rough: float(0.85) };
  },
};
