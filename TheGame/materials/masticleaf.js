// Mastic branch end: one card of a mastic's foliage (Pistacia lentiscus), painted once: the last span of a branch, a
// woody twig from the card's foot that forks into three shoots, and along each its leaves, alternate, compound as a
// mastic's are: a winged reddish stalk with two to four pairs of leaflets and none at its end (paripinnate), the
// leaflets narrow pointed ovals about three centimetres long on a card of half a metre, leathery, dark glossy green
// above, a few turned to show their paler, greyer underside; the leaves shorter towards each shoot's tip, the youngest
// there bronze-red. Not a tiling texture: the card's whole picture, its height the cut-out (src/scatter/trees.js). A
// mastic's own leaves, not a holm oak's sprig: a bush is laid as its branch ends (assets/kit/tree.js bush), as a fern is
// laid as its fronds.
//
// Where the shoots and leaves lie is worked out once, from the branch's own dice (they are the same on every card), apart
// from the painting (masticleaf.twigs.js: a mastic's finest level reads them, and its main shoot is painted alone by them).
// A point of the card weighs each leaf's stalk, and of its leaflets only the two nearest on its own side of that stalk
// (a leaflet reaches no further than its neighbour's place), so the work is two leaflets a leaf, not all of them.
import { float, vec2, vec3, mix, smoothstep, max, min, abs, sin, cos, pow, clamp, floor, fract, step } from 'three/tsl';
import { pn, each } from '../src/materials/paint.js';
import { SHOOTS, LEAF } from './masticleaf.twigs.js';

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
  paint: (uv) => branchOf(uv, SHOOTS, LEAF),
};
/** A mastic's branch end painted at uv: its shoots and their leaves (masticleaf.twigs.js), all of them (this card), or
    its main shoot alone (materials/mastictwig.js: what its finest level is laid out of): { h, col, rough }. */
export function branchOf(uv, shoots, leaves) {
  {
    // (where nothing is drawn the card is leaf green too: a far-off card's texels are means of their neighbours)
    const alpha = float(0).toVar(), col = vec3(0.045, 0.08, 0.033).toVar();
    // the shoots, woody and red-brown, thinner as they go (each a line bowing out: along it, and off it)
    each(shoots, (S) => ({ foot: S.foot, dir: S.dir, perp: S.perp, bow: S.bow, L: S.L, end: S.L * 0.96, thick: S.thick }), (S) => {
      const d = uv.sub(S.foot), a = d.dot(S.dir), off = d.dot(S.perp).sub(a.mul(a).mul(S.bow)), w = S.thick.mul(float(1).sub(a.div(S.L).mul(0.55)));
      const wood = float(1).sub(smoothstep(w, w.mul(1.5), abs(off))).mul(smoothstep(-0.004, 0.006, a)).mul(float(1).sub(smoothstep(S.end, S.L, a)));
      col.assign(mix(col, vec3(0.13, 0.085, 0.06), wood)); alpha.assign(max(alpha, wood));
    }, 's');
    // (a leaf's numbers, as its painting reads them: where it leaves its shoot, its way along and across, its stalk's
    // length and the marks on it (its wing's, its end's), its leaflets' length and width, where the first pair stands
    // and how far apart the pairs are, its last pair, how young it is, its leaflets' dice)
    const leafNumbers = (F) => ({ at: F.at, dir: F.dir, across: [F.dir[1], -F.dir[0]], L: F.L, end: F.L * 0.96, wing: [0.15 * F.L, 0.3 * F.L, F.L * 0.9], young: F.young, len: F.leaflet, wide: F.leaflet * 0.3,
      u0: F.L * 0.24, sp: (F.L * 0.72) / Math.max(1, F.P - 1), last: F.P - 1, tip: F.P - 1.5, seed: F.seed * 16 });
    each(leaves, leafNumbers, (F) => {
      const d = uv.sub(F.at), u = d.dot(F.dir).toVar(), v = d.dot(F.across).toVar();   // along its stalk from the shoot, and across it
      // its stalk, red, with a narrow green wing between the pairs
      const stalk = float(1).sub(smoothstep(0.0018, 0.0032, abs(v))).mul(smoothstep(-0.004, 0.006, u)).mul(float(1).sub(smoothstep(F.end, F.L, u)));
      const wing = float(1).sub(smoothstep(0.003, 0.005, abs(v))).mul(smoothstep(F.wing.x, F.wing.y, u)).mul(float(1).sub(smoothstep(F.wing.z, F.L, u)));
      col.assign(mix(col, vec3(0.05, 0.085, 0.035), wing)); col.assign(mix(col, mix(vec3(0.12, 0.065, 0.04), vec3(0.15, 0.06, 0.04), F.young), stalk));
      alpha.assign(max(alpha, max(stalk, wing)));
      // its leaflets: a pair at each of P places up the stalk, the last at its end, each nearly half as long as the stalk
      // and a third as wide, pointing on towards the stalk's end; of them the two nearest on this point's side
      const len = F.len, wide = F.wide, s = step(0, v).mul(2).sub(1);
      const j0 = clamp(floor(u.sub(F.u0).div(F.sp)), 0, F.last);
      for (const dj of [0, 1]) {
        const j = min(j0.add(dj), F.last), id = j.mul(2).add(s).add(F.seed), tone = hash(id).mul(0.4).add(0.78), under = step(0.92, hash(id.add(0.5)));
        const ang = s.mul(mix(0.95, 0.52, step(F.tip, j))).add(hash(id.add(0.25)).sub(0.5).mul(0.25)), la = vec2(sin(ang), cos(ang)), lb = vec2(cos(ang), sin(ang).negate());
        const p = vec2(v, u.sub(j.mul(F.sp).add(F.u0))), aa = p.dot(la).div(len).toVar(), b = p.dot(lb).toVar();   // along it 0..1 from its foot, and across it
        const half = pow(sin(pow(clamp(aa, 0, 1), 0.75).mul(Math.PI)), 0.9).mul(wide);   // a pointed oval, rounder at its foot
        const leaf = float(1).sub(smoothstep(half.mul(0.72), half, abs(b))).mul(smoothstep(0, 0.04, aa)).mul(float(1).sub(smoothstep(0.97, 1, aa)));
        const rib = float(1).sub(smoothstep(0.0005, 0.0014, abs(b)));
        const green = mix(vec3(0.03, 0.06, 0.025), vec3(0.068, 0.112, 0.044), smoothstep(wide.negate(), wide, b)).mul(tone);   // leathery and glossy: one half takes the light
        const top = mix(mix(green, vec3(0.13, 0.055, 0.035).mul(tone), F.young), vec3(0.1, 0.12, 0.06), rib.mul(0.5));   // the youngest bronze-red; its midrib pale
        const back = mix(vec3(0.095, 0.12, 0.075), vec3(0.13, 0.15, 0.1), rib.mul(0.5)).mul(tone);   // its underside: paler, greyer
        col.assign(mix(col, mix(top, back, under).mul(aa.mul(0.2).add(0.88)), leaf)); alpha.assign(max(alpha, leaf));
      }
    }, 'f');
    return { h: clamp(alpha, 0, 1), col: col.mul(pn(uv.mul(40), 40, 37).mul(0.18).add(0.91)), rough: float(0.45) };
  }
}
