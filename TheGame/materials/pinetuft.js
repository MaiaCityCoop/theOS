// Pine tuft: one card of a stone pine's foliage, painted once: a twig rising up the middle, and along it brushes of long
// needles, in pairs, fanning out all round and up, dark at their base, lighter and yellower at the tips. Not a tiling
// texture: the card's whole picture, its height the cut-out (what is not needle or twig is not drawn; src/scatter/trees.js).
import { float, vec2, vec3, mix, smoothstep, max, abs, atan, fract, length, clamp } from 'three/tsl';
import { pn, each } from '../src/materials/paint.js';
import SPRIG from './pinetuft.twigs.js';

// the sprig: twigs fanning up from the card's foot (their angle from upright, their length), and along each the brushes of
// needles: where (along the twig), how far their needles reach, how many go round
const TWIGS = SPRIG.twigs;   // (its numbers apart: pinetuft.twigs.js; a tree's finest level lays each twig out as a card of its own by them)
const BRUSHES = [[0.3, 0.13, 48], [0.46, 0.16, 54], [0.62, 0.18, 58], [0.78, 0.19, 60], [0.93, 0.16, 56]];

export default {
  uid: 'f0cd9e72-612d-4f2e-9790-0ef5f7257742',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Pine tuft',
  kind: 'foliage',
  about: 'Four twigs with brushes of long paired needles. A foliage card.',
  usedBy: 'stone pine crowns',
  swatch: [0.16, 0.25, 0.1],
  bump: 0.05,
  paint: (uv) => {
    const foot = vec2(...SPRIG.foot);
    const twig = float(0).toVar(), a = float(0).toVar(), tip = float(0).toVar();
    // the twigs, each bowing outward (its numbers: its way, its bow, where it ends)
    each(TWIGS, ([ang, L]) => ({ dir: [Math.sin(ang), Math.cos(ang)], bow: 0.25 * Math.sign(ang || 1), end: L * 0.92, L }), (T) => {
      const d = uv.sub(foot), along = d.dot(T.dir), off = d.x.mul(T.dir.y).sub(d.y.mul(T.dir.x)).sub(along.mul(along).mul(T.bow));
      twig.assign(max(twig, float(1).sub(smoothstep(0.004, 0.009, abs(off))).mul(smoothstep(0, 0.02, along)).mul(float(1).sub(smoothstep(T.end, T.L, along)))));
    }, 't');
    // each twig's brushes of needles, twig by twig (a brush's numbers: where it sits on its bowed twig, its twig's way and
    // its bow there, how many needles round it and their turn, the row and the dice of its reach's noise, its length)
    const brushes = TWIGS.flatMap(([ang, L], j) => BRUSHES.map(([t, len, n], i) => ({ dir: [Math.sin(ang), Math.cos(ang)], at: L * t, side: [Math.cos(ang), -Math.sin(ang)], bow: -(L * t) * (L * t) * 0.25 * Math.sign(ang || 1), n, turn: i * 0.37 + j * 0.61, row: i * 3.1 + j * 7.3, dice: 20 + i + j * 5, len })));
    each(brushes, (B) => B, (B) => {
      const c = foot.add(B.dir.mul(B.at)).add(B.side.mul(B.bow));   // on the bowed twig
      const e = uv.sub(c), r = length(e), an = atan(e.y, e.x), k = an.div(6.2831853).mul(B.n).add(B.turn), s1 = fract(k), id = k.floor();
      const reach = B.len.mul(pn(vec2(id, B.row), [B.n, 64], B.dice).mul(0.5).add(0.6));
      const tt = r.div(reach), w = mix(0.45, 0.14, tt);
      const needle = float(1).sub(smoothstep(w.mul(0.6), w, abs(s1.sub(0.5)))).mul(float(1).sub(smoothstep(0.9, 1, tt))).mul(smoothstep(0.004, 0.012, r));
      a.assign(max(a, needle)); tip.assign(max(tip, needle.mul(tt)));
    }, 'b');
    const alpha = clamp(max(a, twig), 0, 1);
    const green = mix(vec3(0.05, 0.095, 0.035), vec3(0.1, 0.17, 0.055), smoothstep(0.3, 1, tip)).mul(pn(uv.mul(40), 40, 30).mul(0.25).add(0.85));   // a stone pine's needles: a full, deep green, a little lighter towards their tips
    const col = mix(green, vec3(0.3, 0.2, 0.12), twig.mul(float(1).sub(a.mul(0.7))));
    return { h: alpha, col, rough: float(0.8) };
  },
};
