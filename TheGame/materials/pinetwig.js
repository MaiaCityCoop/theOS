// Pine twig: one twig of a stone pine, whole, painted once: the twig rising up the card's middle, and along it the
// brushes of long paired needles fanning out all round, dark at their base, lighter at the tips. The pine tuft's
// painting (materials/pinetuft.js) is a spray of five such twigs; this is one of them alone, nothing beside it, so a
// card of it can stand anywhere without cutting through another's needles: what a stone pine's finest level is made
// of (assets/kit/tree.js: splayOf, each twig of a sprig a card of this). Not a tiling texture: its height the cut-out.
import { float, vec2, vec3, mix, smoothstep, max, abs, atan, fract, length, clamp } from 'three/tsl';
import { pn } from '../src/materials/paint.js';
import SPRIG from './pinetuft.twigs.js';

// the twig: from its foot up the middle, its length (of the card); along it the brushes of needles: where (along the
// twig), how far their needles reach, how many go round. TWIG.half: how far either side of the middle it reaches (a
// card of it is that wide: nothing of it lies outside)
const TWIG = SPRIG.twig;   // (its numbers apart, with its sprig's: materials/pinetuft.twigs.js)
const BRUSHES = [[0.22, 0.12, 46], [0.38, 0.15, 52], [0.54, 0.17, 56], [0.7, 0.19, 60], [0.86, 0.18, 58], [0.98, 0.14, 50]];

export default {
  uid: '8c41d228-0e3e-4fd6-b47c-9ee7929ae713',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Pine twig',
  kind: 'foliage',
  about: "One twig of a stone pine, alone and whole: brushes of long paired needles fanning out all round it, dark at their base: the card a stone pine's nearest crown is made of.",
  usedBy: 'the crowns of the stone pines, seen close (a cut-out card, a twig each)',
  swatch: [0.16, 0.25, 0.1],
  bump: 0.05,
  paint: (uv) => {
    const foot = vec2(...TWIG.foot), L = TWIG.length, d = uv.sub(foot), along = d.y, off = d.x;
    const twig = float(1).sub(smoothstep(0.005, 0.011, abs(off))).mul(smoothstep(0, 0.02, along)).mul(float(1).sub(smoothstep(L * 0.92, L, along)));
    let a = float(0), tip = float(0);
    BRUSHES.forEach(([t, len, n], i) => {
      const c = foot.add(vec2(0, L * t)), e = uv.sub(c), r = length(e), an = atan(e.y, e.x), k = an.div(6.2831853).mul(n).add(i * 0.37), s1 = fract(k), id = k.floor();
      const reach = float(len).mul(pn(vec2(id, i * 3.1), [n, 64], 20 + i).mul(0.5).add(0.6));
      const tt = r.div(reach), w = mix(0.45, 0.14, tt);
      const needle = float(1).sub(smoothstep(w.mul(0.6), w, abs(s1.sub(0.5)))).mul(float(1).sub(smoothstep(0.9, 1, tt))).mul(smoothstep(0.004, 0.012, r));
      a = max(a, needle); tip = max(tip, needle.mul(tt));
    });
    const alpha = clamp(max(a, twig), 0, 1);
    const green = mix(vec3(0.05, 0.095, 0.035), vec3(0.1, 0.17, 0.055), smoothstep(0.3, 1, tip)).mul(pn(uv.mul(40), 40, 31).mul(0.25).add(0.85));   // the pine tuft's greens
    const col = mix(green, vec3(0.3, 0.2, 0.12), twig.mul(float(1).sub(a.mul(0.7))));
    return { h: alpha, col, rough: float(0.8) };
  },
};
