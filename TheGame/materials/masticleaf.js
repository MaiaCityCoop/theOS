// Mastic branch end: one card of a mastic's foliage (Pistacia lentiscus), painted once: the last span of a branch, a
// woody twig from the card's foot that forks into three shoots, and along each its leaves, alternate, compound as a
// mastic's are: a winged reddish stalk with two to four pairs of leaflets and none at its end (paripinnate), the
// leaflets narrow pointed ovals about three centimetres long on a card of half a metre, leathery, dark glossy green
// above, a few turned to show their paler, greyer underside; the leaves shorter towards each shoot's tip, the youngest
// there bronze-red. Not a tiling texture: the card's whole picture, its height the cut-out (src/scatter/trees.js). A
// mastic's own leaves, not a holm oak's sprig: a bush is laid as its branch ends (assets/kit/tree.js bush), as a fern is
// laid as its fronds.
//
// Where the shoots and leaves lie is worked out once, here, from the branch's own dice (they are the same on every card).
// A point of the card weighs each leaf's stalk, and of its leaflets only the two nearest on its own side of that stalk
// (a leaflet reaches no further than its neighbour's place), so the work is two leaflets a leaf, not all of them.
import { float, vec2, vec3, mix, smoothstep, max, min, abs, sin, cos, pow, clamp, floor, fract, step } from 'three/tsl';
import { pn } from '../src/materials/paint.js';
import { rng } from '../src/core/hash.js';

const R = rng(5531);
// The shoots: where each leaves its parent (its foot), its way (from upright), its length, how far it bows out, how
// thick it is at its foot, and how many leaves it bears. The main one runs up the card; two side shoots fork from it.
const along = (S, a) => [S.foot[0] + S.dir[0] * a + S.perp[0] * a * a * S.bow, S.foot[1] + S.dir[1] * a + S.perp[1] * a * a * S.bow];
const tangent = (S, a) => { const t = [S.dir[0] + S.perp[0] * 2 * a * S.bow, S.dir[1] + S.perp[1] * 2 * a * S.bow], l = Math.hypot(...t); return [t[0] / l, t[1] / l]; };
const shoot = (foot, ang, L, bow, thick, leaves) => ({ foot, dir: [Math.sin(ang), Math.cos(ang)], perp: [Math.cos(ang), -Math.sin(ang)], L, bow: bow * Math.sign(ang || 1), thick, leaves });
const MAIN = shoot([0.5, 0.02], 0.05, 0.93, 0.04, 0.0055, 10);
const SHOOTS = [MAIN, shoot(along(MAIN, 0.22), -0.62, 0.55, 0.16, 0.0045, 8), shoot(along(MAIN, 0.42), 0.56, 0.47, 0.16, 0.004, 7)];
// Each leaf: where it leaves its shoot, its way (lower leaves spread wider), its stalk's length (shorter towards the tip),
// its pairs of leaflets, how young it is. Kept inside the card.
const LEAF = SHOOTS.flatMap((S, si) => Array.from({ length: S.leaves }, (_, k) => {
  const t = (si ? 0.14 : 0.2) + ((0.97 - (si ? 0.14 : 0.2)) * k) / (S.leaves - 1), at = along(S, t * S.L), tg = tangent(S, t * S.L), side = (k + si) % 2 ? 1 : -1;
  const turn = side * (0.95 - 0.4 * t + (R() - 0.5) * 0.2), dir = [tg[0] * Math.cos(turn) + tg[1] * Math.sin(turn), -tg[0] * Math.sin(turn) + tg[1] * Math.cos(turn)];
  const room = Math.min(...[[0.02, 0.98], [0.02, 0.98]].map(([lo, hi], i) => (dir[i] > 0 ? (hi - at[i]) / dir[i] : dir[i] < 0 ? (lo - at[i]) / dir[i] : 9)));
  const L = Math.max(0.02, Math.min((0.21 - 0.11 * t) * (0.9 + 0.2 * R()), room * 0.8)), P = t < 0.45 ? 4 : t < 0.8 ? 3 : 2;
  return { at, dir, L, P, young: Math.min(1, Math.max(0, (t - 0.68) / 0.3)) * (0.6 + 0.4 * R()), seed: si * 31 + k * 7 + 3 };
}));
const hash = (x) => fract(sin(x.mul(12.9898)).mul(43758.5453));   // a leaflet's own number, 0..1

export default {
  uid: 'caac10dc-f24f-4509-a3b4-7f9c817afd63',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Mastic branch end',
  kind: 'foliage',
  about: 'A forked twig of compound leaves: paired, dark glossy leaflets on red stalks, the youngest bronze. A foliage card.',
  usedBy: 'the mastic bushes',
  swatch: [0.05, 0.085, 0.035],
  bump: 0.05,
  paint: (uv) => {
    // (where nothing is drawn the card is leaf green too: a far-off card's texels are means of their neighbours)
    const alpha = float(0).toVar(), col = vec3(0.045, 0.08, 0.033).toVar();
    // the shoots, woody and red-brown, thinner as they go (each a line bowing out: along it, and off it)
    for (const S of SHOOTS) {
      const d = uv.sub(vec2(...S.foot)), a = d.dot(vec2(...S.dir)), off = d.dot(vec2(...S.perp)).sub(a.mul(a).mul(S.bow)), w = float(S.thick).mul(float(1).sub(a.div(S.L).mul(0.55)));
      const wood = float(1).sub(smoothstep(w, w.mul(1.5), abs(off))).mul(smoothstep(-0.004, 0.006, a)).mul(float(1).sub(smoothstep(S.L * 0.96, S.L, a)));
      col.assign(mix(col, vec3(0.13, 0.085, 0.06), wood)); alpha.assign(max(alpha, wood));
    }
    for (const F of LEAF) {
      const d = uv.sub(vec2(...F.at)), u = d.dot(vec2(...F.dir)).toVar(), v = d.dot(vec2(F.dir[1], -F.dir[0])).toVar();   // along its stalk from the shoot, and across it
      // its stalk, red, with a narrow green wing between the pairs
      const stalk = float(1).sub(smoothstep(0.0018, 0.0032, abs(v))).mul(smoothstep(-0.004, 0.006, u)).mul(float(1).sub(smoothstep(F.L * 0.96, F.L, u)));
      const wing = float(1).sub(smoothstep(0.003, 0.005, abs(v))).mul(smoothstep(0.15 * F.L, 0.3 * F.L, u)).mul(float(1).sub(smoothstep(F.L * 0.9, F.L, u)));
      col.assign(mix(col, vec3(0.05, 0.085, 0.035), wing)); col.assign(mix(col, mix(vec3(0.12, 0.065, 0.04), vec3(0.15, 0.06, 0.04), F.young), stalk));
      alpha.assign(max(alpha, max(stalk, wing)));
      // its leaflets: a pair at each of P places up the stalk, the last at its end, each nearly half as long as the stalk
      // and a third as wide, pointing on towards the stalk's end; of them the two nearest on this point's side
      const len = F.L * 0.42, wide = len * 0.3, u0 = F.L * 0.24, sp = (F.L * 0.72) / Math.max(1, F.P - 1), s = step(0, v).mul(2).sub(1);
      const j0 = clamp(floor(u.sub(u0).div(sp)), 0, F.P - 1);
      for (const dj of [0, 1]) {
        const j = min(j0.add(dj), F.P - 1), id = j.mul(2).add(s).add(F.seed * 16), tone = hash(id).mul(0.4).add(0.78), under = step(0.92, hash(id.add(0.5)));
        const ang = s.mul(mix(0.95, 0.52, step(F.P - 1.5, j))).add(hash(id.add(0.25)).sub(0.5).mul(0.25)), la = vec2(sin(ang), cos(ang)), lb = vec2(cos(ang), sin(ang).negate());
        const p = vec2(v, u.sub(j.mul(sp).add(u0))), aa = p.dot(la).div(len).toVar(), b = p.dot(lb).toVar();   // along it 0..1 from its foot, and across it
        const half = pow(sin(pow(clamp(aa, 0, 1), 0.75).mul(Math.PI)), 0.9).mul(wide);   // a pointed oval, rounder at its foot
        const leaf = float(1).sub(smoothstep(half.mul(0.72), half, abs(b))).mul(smoothstep(0, 0.04, aa)).mul(float(1).sub(smoothstep(0.97, 1, aa)));
        const rib = float(1).sub(smoothstep(0.0005, 0.0014, abs(b)));
        const green = mix(vec3(0.03, 0.06, 0.025), vec3(0.068, 0.112, 0.044), smoothstep(-wide, wide, b)).mul(tone);   // leathery and glossy: one half takes the light
        const top = mix(mix(green, vec3(0.13, 0.055, 0.035).mul(tone), F.young), vec3(0.1, 0.12, 0.06), rib.mul(0.5));   // the youngest bronze-red; its midrib pale
        const back = mix(vec3(0.095, 0.12, 0.075), vec3(0.13, 0.15, 0.1), rib.mul(0.5)).mul(tone);   // its underside: paler, greyer
        col.assign(mix(col, mix(top, back, under).mul(aa.mul(0.2).add(0.88)), leaf)); alpha.assign(max(alpha, leaf));
      }
    }
    return { h: clamp(alpha, 0, 1), col: col.mul(pn(uv.mul(40), 40, 37).mul(0.18).add(0.91)), rough: float(0.45) };
  },
};
