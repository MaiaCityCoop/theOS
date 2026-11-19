// Rockrose sprig: one card of a cistus's foliage, painted once: a fan of twigs with soft, wrinkled, grey-green leaves,
// broader and fewer than a holm oak's, and here and there a flower, five white petals round a yellow middle. Not a
// tiling texture: the card's whole picture, its height the cut-out (src/scatter/trees.js). A leaf to a cell of a grid,
// a point looking at the nine cells round it (as materials/holmoakleaf.js).
import { float, vec2, vec3, mix, smoothstep, max, abs, sin, cos, pow, clamp, floor, fract, dot, length, atan } from 'three/tsl';
import { pn, nine, ovalLeaf, twigsAt } from '../src/materials/paint.js';
import { fanSprigOf } from './holmoakleaf.js';

const N = 15;   // cells across the card: a leaf is about two of them long (an eighth of the card)
const hash = (c, k) => fract(sin(dot(c, vec2(127.1, 311.7)).add(k * 17.3)).mul(43758.5453));   // a cell's own number, 0..1 (k: which)
/** A rockrose leaf of cell c laid into col and alpha where it covers (L: ovalLeaf's { u, w, leaf }, `len` long and
    `wide` across; young: how young it is, 0 … 1): soft and grey-green, one half taking the light, the youngest lighter,
    its midrib pale, here and there turned to show its grey, felted underside. The sprig's (this card) and one twig's
    alone (materials/rockrosetwig.js) alike. */
export const rockroseLeafIn = (col, alpha, c, L, len, wide, young) => {
  const rib = float(1).sub(smoothstep(len.mul(0.006), len.mul(0.02), abs(L.w))), tone = hash(c, 7).mul(0.5).add(0.72);
  const green = mix(vec3(0.075, 0.105, 0.058), vec3(0.12, 0.158, 0.09), smoothstep(wide.negate(), wide, L.w)).mul(tone);
  const top = mix(mix(green, vec3(0.13, 0.17, 0.09), young.mul(0.8)), vec3(0.16, 0.19, 0.13), rib.mul(0.7));
  const under = mix(vec3(0.12, 0.15, 0.105), vec3(0.17, 0.2, 0.15), rib.mul(0.6)).mul(tone);
  col.assign(mix(col, mix(top, under, smoothstep(0.9, 0.92, hash(c, 9))).mul(L.u.mul(0.25).add(0.85)), L.leaf)); alpha.assign(max(alpha, L.leaf));
};
/** A rockrose card's picture once its leaves, twigs and flowers are laid (alpha: what they cover; twig: its twigs;
    col: their colour) at uv: { h, col, rough }, rough as its leaves are: wrinkled, and felted on both sides with
    star-shaped hairs, a sage-leaved cistus's (Flora iberica, Cistus salviifolius): no highlight to speak of, where a holm
    oak's and a mastic's waxy leaves have one. The sprig's and one twig's alike. */
export const rockroseCard = (alpha, twig, col, uv) => ({ h: clamp(max(alpha, twig), 0, 1), col: col.mul(pn(uv.mul(46), 46, 30).mul(0.2).add(0.9)), rough: float(0.85) });
/** A rockrose flower of cell c at uv, in one cell in twenty-five (mid: the cell's middle; N: cells across the card; where:
    how much it may be there), into col and alpha: five petals, crinkled, white, round a yellow middle. */
export const rockroseFlowerIn = (col, alpha, c, uv, mid, N, where) => {
  const fd = uv.sub(mid), fr = length(fd).mul(N), fa = atan(fd.x, fd.y).mul(5).add(hash(c, 11).mul(6.28));
  const petal = float(1).sub(smoothstep(0.6, 0.72, fr.div(cos(fa).mul(0.13).add(0.87)))).mul(smoothstep(0.955, 0.965, hash(c, 10))).mul(where);
  col.assign(mix(col, mix(vec3(0.74, 0.56, 0.13), vec3(0.84, 0.82, 0.78).mul(cos(fa.mul(2)).mul(0.05).add(0.95)), smoothstep(0.12, 0.2, fr)), petal)); alpha.assign(max(alpha, petal));
};

export default {
  uid: '4cdde33c-5114-41e7-badf-e9f69fcf42f5',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Rockrose sprig',
  kind: 'foliage',
  about: 'Soft grey-green leaves and a few white flowers. A foliage card.',
  usedBy: 'the rockroses',
  swatch: [0.11, 0.14, 0.09],
  bump: 0.05,
  paint: (uv) => {
    // the holm oak sprig's fan of twigs and grid of leaves (materials/holmoakleaf.js fanSprigOf: its twigs' numbers, whose
    // each a rockrose's finest level lays out as a card of its own, materials/rockrosetwig.js), its own leaves: wider,
    // softer, and its flowers
    const { alpha, col, twig } = fanSprigOf(uv, { N, base: [0.09, 0.115, 0.075], wide: (len, c) => len.mul(hash(c, 5).mul(0.06).add(0.27)),
      leafIn: (col, alpha, c, L, { len, wide, out, mid, inFan }) => {
        rockroseLeafIn(col, alpha, c, L, len, wide, smoothstep(0.45, 0.8, length(out)).mul(hash(c, 8)));
        rockroseFlowerIn(col, alpha, c, uv, mid, N, inFan(mid).mul(smoothstep(0.3, 0.5, length(out))));   // (towards the fan's edge)
      } });
    return rockroseCard(alpha, twig, col, uv);
  },
};
