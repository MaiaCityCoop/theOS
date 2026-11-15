// Holm oak twig: one leafy twig of a holm oak (Quercus ilex), whole, painted once: the twig up the card's middle and
// along it small leathery leaves, pointed ovals, a dark glossy green above with a pale midrib, a few turned to show their
// grey-felted underside, the youngest at its tip lighter. The holm oak sprig's painting (materials/holmoakleaf.js) is a
// fan of six such twigs; this is one alone, nothing beside it, so a card of it can stand anywhere without cutting
// through another's leaves: what a holm oak's finest level is made of (assets/kit/tree.js: splayOf). Not a tiling
// texture: its height the cut-out. The leaves as the sprig's are: a grid of cells, a leaf to a cell, nine looked at.
import { float, vec2, vec3, mix, smoothstep, max, abs, sin, cos, pow, clamp, floor, fract, dot, atan } from 'three/tsl';
import { pn } from '../src/materials/paint.js';
import SPRIG from './holmoakleaf.twigs.js';

// the twig: its foot, its length (of the card), how far either side of the middle its leaves reach (a card of it is
// that wide: nothing of it lies outside)
const TWIG = SPRIG.twig;   // (its numbers apart, with its sprig's: materials/holmoakleaf.twigs.js)
const N = 18;   // cells across the card: a leaf is about two of them long (a ninth of the card: the twig is a sprig's twig, its leaves the sprig's leaves)
const hash = (c, k) => fract(sin(dot(c, vec2(127.1, 311.7)).add(k * 17.3)).mul(43758.5453));

export default {
  uid: '8ee46707-6ec8-4c04-96e9-70151301427f',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Holm oak twig',
  kind: 'foliage',
  about: "One leafy twig of a holm oak, alone and whole: small leathery leaves, dark glossy green, a few showing their pale underside: the card a holm oak's nearest crown is made of.",
  usedBy: 'the crowns of the holm oaks, seen close (a cut-out card, a twig each)',
  swatch: [0.06, 0.1, 0.045],
  bump: 0.05,
  paint: (uv) => {
    const foot = vec2(...TWIG.foot), L = TWIG.length;
    // where a leaf's middle may lie: along the twig, as far from it as the leaves reach there (less at its foot and tip)
    const onTwig = (p) => {
      const t = p.y.sub(foot.y).div(L), reach = smoothstep(0, 0.25, t).mul(float(1).sub(smoothstep(0.85, 1.12, t))).mul(0.15).add(0.02);
      return float(1).sub(smoothstep(reach.mul(0.8), reach, abs(p.x.sub(foot.x)))).mul(smoothstep(0.04, 0.1, t)).mul(float(1).sub(smoothstep(1.02, 1.1, t)));
    };
    const alpha = float(0).toVar(), col = vec3(0.05, 0.09, 0.04).toVar();
    const along = uv.y.sub(foot.y), twig = float(1).sub(smoothstep(0.004, 0.008, abs(uv.x.sub(foot.x)))).mul(smoothstep(0, 0.02, along)).mul(float(1).sub(smoothstep(L * 0.95, L, along)));
    col.assign(mix(col, vec3(0.16, 0.13, 0.1), twig));
    const cell = floor(uv.mul(N));
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const c = cell.add(vec2(i, j)), mid = c.add(0.5).add(vec2(hash(c, 1), hash(c, 2)).sub(0.5).mul(0.8)).div(N);
      const side = mid.x.sub(foot.x), out = vec2(side.mul(2.2), float(0.6)), turn = atan(out.x, out.y).add(hash(c, 3).sub(0.5).mul(1.3)), ax = vec2(sin(turn), cos(turn));   // it points out from the twig and up
      const len = hash(c, 4).mul(0.6).add(1.6).div(N), wide = len.mul(hash(c, 5).mul(0.05).add(0.2)), there = onTwig(mid).mul(smoothstep(0.1, 0.14, hash(c, 6)));
      const e = uv.sub(mid.sub(ax.mul(len.mul(0.5)))), u = e.dot(ax).div(len).toVar(), w = e.dot(vec2(ax.y, ax.x.negate())).toVar();
      const half = pow(sin(pow(clamp(u, 0, 1), 0.8).mul(Math.PI)), 0.85).mul(wide);
      const leaf = float(1).sub(smoothstep(half.mul(0.7), half, abs(w))).mul(smoothstep(0, 0.05, u)).mul(float(1).sub(smoothstep(0.96, 1, u))).mul(there).toVar();
      const rib = float(1).sub(smoothstep(0.001, 0.003, abs(w))), tone = hash(c, 7).mul(0.5).add(0.72), young = smoothstep(0.6, 0.95, mid.y.sub(foot.y).div(L)).mul(hash(c, 8));
      const green = mix(vec3(0.038, 0.072, 0.032), vec3(0.075, 0.128, 0.054), smoothstep(wide.negate(), wide, w)).mul(tone);
      const top = mix(mix(green, vec3(0.085, 0.14, 0.05), young.mul(0.8)), vec3(0.11, 0.15, 0.075), rib.mul(0.7));
      const under = mix(vec3(0.12, 0.15, 0.105), vec3(0.17, 0.2, 0.15), rib.mul(0.6)).mul(tone);
      col.assign(mix(col, mix(top, under, smoothstep(0.9, 0.92, hash(c, 9))).mul(u.mul(0.25).add(0.85)), leaf)); alpha.assign(max(alpha, leaf));
    }
    return { h: clamp(max(alpha, twig), 0, 1), col: col.mul(pn(uv.mul(46), 46, 31).mul(0.2).add(0.9)), rough: float(0.55) };
  },
};
