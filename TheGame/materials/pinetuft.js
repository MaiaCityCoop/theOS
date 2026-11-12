// Pine tuft: one card of a stone pine's foliage, painted once: a twig rising up the middle, and along it brushes of long
// needles, in pairs, fanning out all round and up, dark at their base, lighter and yellower at the tips. Not a tiling
// texture: the card's whole picture, its height the cut-out (what is not needle or twig is not drawn; src/scatter/trees.js).
import { float, vec2, vec3, mix, smoothstep, max, abs, atan, fract, length, clamp } from 'three/tsl';
import { pn } from '../src/materials/paint.js';

// the brushes along the twig: where (along it, 0 foot … 1 tip), how far their needles reach, how many go round
const TUFTS = [[0.22, 0.26, 70], [0.32, 0.3, 80], [0.42, 0.33, 86], [0.52, 0.35, 92], [0.62, 0.36, 96], [0.72, 0.35, 96], [0.81, 0.32, 90], [0.89, 0.26, 80]];

export default {
  uid: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Pine tuft',
  kind: 'foliage',
  about: "A stone pine's twig with brushes of long paired needles fanning out all round, dark at the base, lighter at the tips: one foliage card.",
  usedBy: 'the crowns of the stone pines (a cut-out card)',
  swatch: [0.16, 0.25, 0.1],
  bump: 0.05,
  paint: (uv) => {
    const twigAt = (y) => float(0.5).add(y.sub(0.5).mul(y.sub(0.5)).mul(0.12));   // the twig bends a little
    const tw = abs(uv.x.sub(twigAt(uv.y))), twig = float(1).sub(smoothstep(0.006, 0.014, tw)).mul(smoothstep(0.02, 0.06, uv.y)).mul(float(1).sub(smoothstep(0.86, 0.92, uv.y)));
    let a = float(0), tip = float(0);
    TUFTS.forEach(([y0, len, n], i) => {
      const d = uv.sub(vec2(twigAt(float(y0)), y0)), r = length(d), ang = atan(d.y, d.x);
      const k = ang.div(6.2831853).mul(n).add(i * 0.37), s = fract(k), id = k.floor();
      const reach = float(len).mul(pn(vec2(id, i * 3.1), [n, 64], 20 + i).mul(0.45).add(0.6)).mul(smoothstep(-0.6, 0.4, d.y.div(r.max(1e-4))).mul(0.35).add(0.65));   // each needle its own length; the upper ones longer
      const t = r.div(reach), w = mix(0.34, 0.08, t);   // thinner towards its tip
      const needle = float(1).sub(smoothstep(w.mul(0.6), w, abs(s.sub(0.5)))).mul(float(1).sub(smoothstep(0.92, 1, t))).mul(smoothstep(0.01, 0.03, r));
      const s2 = fract(k.add(0.5).mul(1.07)), needle2 = float(1).sub(smoothstep(w.mul(0.6), w, abs(s2.sub(0.5)))).mul(float(1).sub(smoothstep(0.75, 0.82, t))).mul(smoothstep(0.01, 0.03, r));   // a second, shorter fan between: the brush is full
      a = max(a, max(needle, needle2)); tip = max(tip, max(needle.mul(t), needle2.mul(t.mul(1.2))));
    });
    const alpha = clamp(max(a, twig), 0, 1);
    const green = mix(vec3(0.035, 0.065, 0.03), vec3(0.11, 0.17, 0.07), tip.mul(tip)).mul(pn(uv.mul(40), 40, 30).mul(0.25).add(0.85));
    const col = mix(green, vec3(0.3, 0.2, 0.12), twig.mul(float(1).sub(a.mul(0.7))));
    return { h: alpha, col, rough: float(0.8) };
  },
};
