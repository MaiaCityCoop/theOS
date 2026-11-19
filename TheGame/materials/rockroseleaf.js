// Rockrose sprig: one card of a cistus's foliage, painted once: a fan of twigs with soft, wrinkled, grey-green leaves,
// broader and fewer than a holm oak's, and here and there a flower, five white petals round a yellow middle. Not a
// tiling texture: the card's whole picture, its height the cut-out (src/scatter/trees.js). A leaf to a cell of a grid,
// a point looking at the nine cells round it (as materials/holmoakleaf.js).
import { float, vec2, vec3, mix, smoothstep, max, abs, sin, cos, pow, clamp, floor, fract, dot, length, atan } from 'three/tsl';
import { pn } from '../src/materials/paint.js';
import FAN from './holmoakleaf.twigs.js';

const N = 15;   // cells across the card: a leaf is about two of them long (an eighth of the card)
const TWIGS = FAN.twigs, BOW = FAN.bow;   // its twigs, the holm oak sprig's fan (materials/holmoakleaf.twigs.js: a rockrose's finest level lays each out as a card of its own, materials/rockrosetwig.js): their angle from upright, their length; each bows outward
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
    const foot = vec2(...FAN.foot);
    // the fan's outline: how far it reaches from its foot each way (uneven, less to the sides); a leaf whose middle lies
    // within it is there whole
    const inFan = (p) => {
      const d = p.sub(foot), r = length(d), a = atan(d.x, d.y), reach = pn(vec2(a.mul(2.6).add(4), 0.5), 8, 41).mul(0.3).add(0.62).mul(float(1).sub(smoothstep(0.8, 1.25, abs(a))));
      return float(1).sub(smoothstep(reach.mul(0.9), reach, r)).mul(smoothstep(0.02, 0.07, r));
    };
    // (where nothing is drawn the card is leaf green too: a far-off card's texels are means of their neighbours, and must not turn grey)
    const alpha = float(0).toVar(), col = vec3(0.09, 0.115, 0.075).toVar(), twig = float(0).toVar();
    TWIGS.forEach(([ang, L]) => {
      const dir = vec2(Math.sin(ang), Math.cos(ang)), perp = vec2(Math.cos(ang), -Math.sin(ang)), d = uv.sub(foot), along = d.dot(dir), off = d.dot(perp).sub(along.mul(along).mul(BOW * Math.sign(ang || 1)));   // the twig, bowing outward
      twig.assign(max(twig, float(1).sub(smoothstep(0.003, 0.007, abs(off))).mul(smoothstep(0, 0.02, along)).mul(float(1).sub(smoothstep(L * 0.95, L, along)))));
    });
    col.assign(mix(col, vec3(0.16, 0.13, 0.1), twig));   // the twigs, under the leaves
    const cell = floor(uv.mul(N));
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {   // the leaves of the nine cells round this point, laid one over another
      const c = cell.add(vec2(i, j)), mid = c.add(0.5).add(vec2(hash(c, 1), hash(c, 2)).sub(0.5).mul(0.8)).div(N), out = mid.sub(foot);
      const turn = atan(out.x, out.y).add(hash(c, 3).sub(0.5).mul(1.9)), ax = vec2(sin(turn), cos(turn));   // it points out of the fan, more or less
      const len = hash(c, 4).mul(0.7).add(1.55).div(N), wide = len.mul(hash(c, 5).mul(0.06).add(0.27)), there = inFan(mid).mul(smoothstep(0.12, 0.16, hash(c, 6)));
      const e = uv.sub(mid.sub(ax.mul(len.mul(0.5)))), u = e.dot(ax).div(len).toVar(), w = e.dot(vec2(ax.y, ax.x.negate())).toVar();   // along the leaf 0..1 from its foot, and across it
      const half = pow(sin(pow(clamp(u, 0, 1), 0.8).mul(Math.PI)), 0.85).mul(wide);   // a pointed oval, rounder at its foot
      const leaf = float(1).sub(smoothstep(half.mul(0.7), half, abs(w))).mul(smoothstep(0, 0.05, u)).mul(float(1).sub(smoothstep(0.96, 1, u))).mul(there).toVar();
      rockroseLeafIn(col, alpha, c, { u, w, leaf }, len, wide, smoothstep(0.45, 0.8, length(out)).mul(hash(c, 8)));
      rockroseFlowerIn(col, alpha, c, uv, mid, N, inFan(mid).mul(smoothstep(0.3, 0.5, length(out))));   // (towards the fan's edge)
    }
    return { h: clamp(max(alpha, twig), 0, 1), col: col.mul(pn(uv.mul(46), 46, 30).mul(0.2).add(0.9)), rough: float(0.55) };
  },
};
