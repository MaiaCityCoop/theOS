// Pine tuft: one card of a stone pine's foliage, painted once: a twig rising up the middle, and along it brushes of long
// needles, in pairs, fanning out all round and up, dark at their base, lighter and yellower at the tips. Not a tiling
// texture: the card's whole picture, its height the cut-out (what is not needle or twig is not drawn; src/scatter/trees.js).
import { float, vec2, vec3, mix, smoothstep, max, abs, atan, fract, length, clamp } from 'three/tsl';
import { pn } from '../src/materials/paint.js';

// the sprig: twigs fanning up from the card's foot (their angle from upright, their length), and along each the brushes of
// needles: where (along the twig), how far their needles reach, how many go round
const TWIGS = [[-0.62, 0.5], [-0.3, 0.72], [0.0, 0.86], [0.28, 0.76], [0.58, 0.54]];
const BRUSHES = [[0.3, 0.13, 48], [0.46, 0.16, 54], [0.62, 0.18, 58], [0.78, 0.19, 60], [0.93, 0.16, 56]];

export default {
  uid: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Pine tuft',
  kind: 'foliage',
  about: "A stone pine's sprig: four twigs fanning from its foot, each with brushes of long paired needles fanning out all round, dark at their base: one foliage card.",
  usedBy: 'the crowns of the stone pines (a cut-out card)',
  swatch: [0.16, 0.25, 0.1],
  bump: 0.05,
  paint: (uv) => {
    const foot = vec2(0.5, 0.04);
    let twig = float(0), a = float(0), tip = float(0);
    TWIGS.forEach(([ang, L], j) => {
      const dir = vec2(Math.sin(ang), Math.cos(ang)), d = uv.sub(foot), along = d.dot(dir), off = d.x.mul(dir.y).sub(d.y.mul(dir.x)).sub(along.mul(along).mul(0.25 * Math.sign(ang || 1)));   // the twig, bowing outward
      twig = max(twig, float(1).sub(smoothstep(0.004, 0.009, abs(off))).mul(smoothstep(0, 0.02, along)).mul(float(1).sub(smoothstep(L * 0.92, L, along))));
      BRUSHES.forEach(([t, len, n], i) => {
        const c = foot.add(dir.mul(L * t)).add(vec2(Math.cos(ang), -Math.sin(ang)).mul(-(L * t) * (L * t) * 0.25 * Math.sign(ang || 1)));   // on the bowed twig
        const e = uv.sub(c), r = length(e), an = atan(e.y, e.x), k = an.div(6.2831853).mul(n).add(i * 0.37 + j * 0.61), s1 = fract(k), id = k.floor();
        const reach = float(len).mul(pn(vec2(id, i * 3.1 + j * 7.3), [n, 64], 20 + i + j * 5).mul(0.5).add(0.6));
        const tt = r.div(reach), w = mix(0.45, 0.14, tt);
        const needle = float(1).sub(smoothstep(w.mul(0.6), w, abs(s1.sub(0.5)))).mul(float(1).sub(smoothstep(0.9, 1, tt))).mul(smoothstep(0.004, 0.012, r));
        a = max(a, needle); tip = max(tip, needle.mul(tt));
      });
    });
    const alpha = clamp(max(a, twig), 0, 1);
    const green = mix(vec3(0.05, 0.095, 0.035), vec3(0.1, 0.17, 0.055), smoothstep(0.3, 1, tip)).mul(pn(uv.mul(40), 40, 30).mul(0.25).add(0.85));   // a stone pine's needles: a full, deep green, a little lighter towards their tips
    const col = mix(green, vec3(0.3, 0.2, 0.12), twig.mul(float(1).sub(a.mul(0.7))));
    return { h: alpha, col, rough: float(0.8) };
  },
};
