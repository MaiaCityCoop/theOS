// Holm oak sprig: one card of a holm oak's foliage (Quercus ilex), painted once: a fan of leafy twigs rising from the
// card's foot, some four hundred small leathery leaves, pointed ovals, a dark glossy green above with a pale midrib, a few
// turned to show their grey-felted underside, the youngest at the fan's edge lighter. Not a tiling texture: the card's
// whole picture, its height the cut-out (what is not leaf or twig is not drawn; src/scatter/trees.js).
//
// The leaves are not painted one by one: the card is a grid of cells, a leaf to a cell (where it lies, how it turns, its
// size and its green all from the cell's own hash), and a point looks only at the nine cells round it. So the leaves
// can be as many and as small as a real sprig's at no more work than nine.
import { float, vec2, vec3, mix, smoothstep, max, abs, sin, cos, pow, clamp, floor, fract, dot, length, atan } from 'three/tsl';
import { pn, nine, ovalLeaf, twigsAt } from '../src/materials/paint.js';
import SPRIG from './holmoakleaf.twigs.js';

const N = 24;   // cells across the card: a leaf is about two of them long (a fourteenth of the card)
const TWIGS = SPRIG.twigs, BOW = SPRIG.bow;   // (its numbers apart: holmoakleaf.twigs.js; a tree's finest level lays each twig out as a card of its own by them)   // its twigs: their angle from upright, their length; each bows outward
const hash = (c, k) => fract(sin(dot(c, vec2(127.1, 311.7)).add(k * 17.3)).mul(43758.5453));   // a cell's own number, 0..1 (k: which)

/** A sprig as the holm oak's is painted (and the rockrose's: materials/rockroseleaf.js): its fan of twigs from its foot
    (holmoakleaf.twigs.js), and its leaves, a grid of N cells across the card, a leaf a cell, each pointing out of the fan,
    a pointed oval (ovalLeaf) as long as two cells and as wide as wide(len, c) says, there where its middle lies in the
    fan's uneven outline: each painted by leafIn(col, alpha, c, L, { len, wide, out, mid, inFan }) over the card's own
    green (base: where nothing is drawn the card is leaf green too: a far-off card's texels are means of their
    neighbours, and must not turn grey) and the twigs. { alpha, col, twig }. Node code, in a Fn. */
export function fanSprigOf(uv, { N: cells, base, wide, leafIn }) {
  const foot = vec2(...SPRIG.foot);
  // the fan's outline: how far it reaches from its foot each way (uneven, less to the sides); a leaf whose middle lies
  // within it is there whole
  const inFan = (p) => {
    const d = p.sub(foot), r = length(d), a = atan(d.x, d.y), reach = pn(vec2(a.mul(2.6).add(4), 0.5), 8, 41).mul(0.3).add(0.62).mul(float(1).sub(smoothstep(0.8, 1.25, abs(a))));
    return float(1).sub(smoothstep(reach.mul(0.9), reach, r)).mul(smoothstep(0.02, 0.07, r));
  };
  const alpha = float(0).toVar(), col = vec3(...base).toVar(), twig = twigsAt(uv, foot, TWIGS, BOW);   // (the twigs: under the leaves)
  col.assign(mix(col, vec3(0.16, 0.13, 0.1), twig));   // the twigs, under the leaves
  const cell = floor(uv.mul(cells));
  nine((o) => {   // the leaves of the nine cells round this point, laid one over another
    const c = cell.add(o), mid = c.add(0.5).add(vec2(hash(c, 1), hash(c, 2)).sub(0.5).mul(0.8)).div(cells), out = mid.sub(foot);
    const turn = atan(out.x, out.y).add(hash(c, 3).sub(0.5).mul(1.9)), ax = vec2(sin(turn), cos(turn));   // it points out of the fan, more or less
    const len = hash(c, 4).mul(0.7).add(1.55).div(cells), w = wide(len, c), there = inFan(mid).mul(smoothstep(0.12, 0.16, hash(c, 6)));
    leafIn(col, alpha, c, ovalLeaf(uv, mid, ax, len, w, there), { len, wide: w, out, mid, inFan });   // (ovalLeaf: along it 0..1 from its foot, across it, how much of uv it covers)
  });
  return { alpha, col, twig };
}
/** A holm oak leaf of cell c painted over col and alpha where it lies (L: ovalLeaf's along, across and cover; wide: its
    width; rib: its midrib; young: how young it is): dark and glossy above, one half taking the light, the youngest lighter,
    its midrib pale, a few turned to show their grey felted underside (the sprig's leaves, and its twig's:
    materials/holmoaktwig.js). Node code, in a Fn. */
export const holmLeafIn = (col, alpha, c, { u, w, leaf }, wide, rib, young) => {
  const tone = hash(c, 7).mul(0.5).add(0.72), green = mix(vec3(0.038, 0.072, 0.032), vec3(0.075, 0.128, 0.054), smoothstep(wide.negate(), wide, w)).mul(tone);
  const top = mix(mix(green, vec3(0.085, 0.14, 0.05), young.mul(0.8)), vec3(0.11, 0.15, 0.075), rib.mul(0.7)), under = mix(vec3(0.12, 0.15, 0.105), vec3(0.17, 0.2, 0.15), rib.mul(0.6)).mul(tone);
  col.assign(mix(col, mix(top, under, smoothstep(0.9, 0.92, hash(c, 9))).mul(u.mul(0.25).add(0.85)), leaf)); alpha.assign(max(alpha, leaf));
};

export default {
  uid: 'c4cbd29b-9dd2-494d-913b-9a80c40ab8e6',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Holm oak sprig',
  kind: 'foliage',
  about: 'A fan of twigs thick with small dark leaves. A foliage card.',
  usedBy: 'holm oak crowns',
  swatch: [0.06, 0.1, 0.045],
  bump: 0.05,
  paint: (uv) => {
    const { alpha, col, twig } = fanSprigOf(uv, { N, base: [0.05, 0.09, 0.04], wide: (len, c) => len.mul(hash(c, 5).mul(0.05).add(0.2)),
      leafIn: (col, alpha, c, L, { wide, out }) => holmLeafIn(col, alpha, c, L, wide, float(1).sub(smoothstep(0.0008, 0.0026, abs(L.w))), smoothstep(0.45, 0.8, length(out)).mul(hash(c, 8))) });
    return { h: clamp(max(alpha, twig), 0, 1), col: col.mul(pn(uv.mul(46), 46, 30).mul(0.2).add(0.9)), rough: float(0.55) };
  },
};
