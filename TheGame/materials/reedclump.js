// Reed clump: one card of common reed (Phragmites), painted once: a few dozen tall, narrow leaves and stems rising from
// the card's foot, each bending a little its own way, green below, yellowing towards the tips, and over the tallest a
// handful of feathery plumes, purple-brown fading to straw. Not a tiling texture: the card's whole picture, its height
// the cut-out (what is not reed is not drawn; src/scatter/trees.js). The reeds of a lake's shallows (assets/reeds.js).
import { float, vec2, vec3, mix, smoothstep, max, abs, clamp, pow } from 'three/tsl';
import { pn, each } from '../src/materials/paint.js';
import { rng } from '../src/core/hash.js';

// its blades as numbers (worked out once here, not per pixel): where its foot is across the card, how tall, how far
// and which way it bends, how wide at its foot, how light; the tallest carry a plume
const R = rng(9113);
const BLADES = Array.from({ length: 38 }, () => ({ x: 0.5 + (R() - 0.5) * 0.42, h: 0.5 + 0.47 * R(), bend: (R() - 0.5) * 0.34, w: 0.005 + 0.007 * R(), tone: 0.75 + 0.5 * R() }))
  .sort((a, b) => b.h - a.h);   // (the tall ones first: the short ones lie in front of them)
const PLUMES = BLADES.slice(0, 7);

export default {
  uid: '307376d9-da36-4388-8c5a-8cfb308ee312',   // its stable id: every reference to it, everywhere, is this (src/core/registry.js)
  type: 'material',
  name: 'Reed clump',
  kind: 'foliage',
  about: 'Tall narrow reed leaves under feathery plumes. A foliage card.',
  usedBy: 'the reeds in the shallows',
  swatch: [0.2, 0.26, 0.1],
  bump: 0.06,
  paint: (uv) => {
    const alpha = float(0).toVar(), col = vec3(0.16, 0.22, 0.08).toVar();
    // (a blade's numbers as its painting reads them: its height, where its foot is, its bend, its width at its foot and
    // at its tip, how light, its light edge's two ends)
    each(BLADES, (B) => ({ h: B.h, x: B.x, bend: B.bend, w: [B.w, B.w * 0.12], tone: B.tone, edge: [B.w * -0.5, B.w * 0.5] }), (B) => {
      const t = uv.y.sub(0.02).div(B.h), cx = B.x.add(pow(clamp(t, 0, 1), 2).mul(B.bend)), half = mix(B.w.x, B.w.y, clamp(t, 0, 1));
      const blade = float(1).sub(smoothstep(half.mul(0.6), half, abs(uv.x.sub(cx)))).mul(smoothstep(0, 0.02, t)).mul(float(1).sub(smoothstep(0.97, 1, t))).toVar();
      const green = mix(vec3(0.11, 0.17, 0.06), vec3(0.42, 0.4, 0.2), smoothstep(0.45, 1, t)).mul(B.tone).mul(mix(0.7, 1.08, smoothstep(B.edge.x, B.edge.y, uv.x.sub(cx))));   // (one edge in the light)
      col.assign(mix(col, green, blade)); alpha.assign(max(alpha, blade));
    }, 'b');
    // a plume: a loose spray of fine hairs over its stem's tip, leaning with it (the hairs the same for every plume)
    const hairs = pn(uv.mul(vec2(220, 60)), [220, 60], 12).mul(0.6).add(pn(uv.mul(90), 90, 13).mul(0.4)).toVar();
    each(PLUMES, (B) => ({ top: [B.x + B.bend, 0.02 + B.h], lean: [B.bend * 0.15, 0.06] }), (B) => {
      const e = uv.sub(B.top.sub(B.lean)), r = e.div(vec2(0.024, 0.07)), d = r.dot(r);
      const plume = float(1).sub(smoothstep(0.55, 1, d.add(hairs.mul(0.45)))).toVar();
      col.assign(mix(col, mix(vec3(0.24, 0.16, 0.15), vec3(0.42, 0.35, 0.25), hairs), plume)); alpha.assign(max(alpha, plume));
    }, 'p');
    return { h: clamp(alpha, 0, 1), col: col.mul(pn(uv.mul(30), 30, 14).mul(0.18).add(0.91)), rough: float(0.6) };
  },
};
