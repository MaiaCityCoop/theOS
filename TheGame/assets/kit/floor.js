// The floor kit (intent 0038, stage 7): what lies on the forest's floor, as forms whose species are their parameters: a
// fallen branch or log, a strewing of what a tree drops (cones, twigs, needles, leaves), a stone bedded in the soil.
// Built with the tree kit's builder (assets/kit/tree.js), so the crowd kit makes every level of it as of any plant
// (assets/kit/crowd.js): a recipe says only what it is at full detail. Plain JS: the recipes' workers read it too.
// What lies on the ground covers it (its feet: the tree kit's builder): a branch's or a log's wood, ring to ring, as
// wide as it is (its twigs, propped off the ground, cover none); a stone, its outline where it comes out of the soil.
import { tube, cards, FOOT } from './tree.js';
import { add, mul, norm, cross } from './math.js';
import { rng } from '../../src/core/hash.js';

export { FOOT };   // (how deep what stands in a stand is set into the ground: what lies on it is built so much higher)

/** A fallen branch or log, lying, bowed a little sideways, its thin end lifted off the ground where its twigs prop it,
    its twigs off to either side and up, the lower ones resting on the ground. S: { len, r (its radius at its thick end),
    bow, lift (metres), twigs (how many), taper (its radius at its thin end, of r), seed }. */
export function fallen(b, S) {
  const R0 = rng(S.seed), sides = S.r > 0.1 ? 8 : 6, n = 6, a0 = R0() * Math.PI, dir = [Math.cos(a0), 0, Math.sin(a0)], side = cross(dir, [0, 1, 0]), taper = S.taper ?? 0.28;
  const at = (t) => add(add(mul(dir, (t - 0.5) * S.len), mul(side, Math.sin(t * Math.PI) * S.bow)), [0, FOOT + S.r * (1 - (1 - taper) * 0.85 * t) * 0.85 + t * t * S.lift, 0]);
  const pts = Array.from({ length: n + 1 }, (_, i) => at(i / n)), rad = pts.map((_, i) => S.r * (1 - (1 - taper) * (i / n)));
  tube(b, pts, rad, sides);
  for (let i = 0; i < n; i++) b.feet.push([pts[i][0], pts[i][2], pts[i + 1][0], pts[i + 1][2], rad[i], rad[i + 1], 0]);   // (the ground under its wood)
  for (let k = 0; k < S.twigs; k++) {
    const t = 0.25 + 0.65 * R0(), p = at(t), sgn = R0() < 0.5 ? -1 : 1, up = R0() * 0.9 - 0.15, L = S.len * (0.14 + 0.2 * R0()) * (1 - 0.4 * t), r = S.r * (1 - (1 - taper) * t) * 0.55;
    const d = norm(add(add(mul(side, sgn), mul(dir, 0.5 + 0.6 * R0())), [0, up, 0])), e = add(p, mul(d, L));
    if (e[1] < FOOT + r) e[1] = FOOT + r;
    tube(b, [p, add(add(p, mul(d, L * 0.5)), [0, L * 0.06, 0]), e], [r, r * 0.75, r * 0.4], 4);
  }
  return b;
}

/** A strewing of what a tree drops, within r metres of its middle: cones (short tubes, swelling in the middle), twigs
    (thin bowed tubes) and its sprig's cards laid along the ground (needles, leaves). S: { r, cones: [n, length, girth],
    twigs: [n, length, girth], sprigs: [n, size], seed }. */
export function strewn(b, S) {
  const R0 = rng(S.seed), where = () => { const a = R0() * 2 * Math.PI, d = S.r * Math.sqrt(R0()); return [Math.cos(a) * d, 0, Math.sin(a) * d]; };
  const lying = () => { const a = R0() * 2 * Math.PI; return [Math.cos(a), 0, Math.sin(a)]; };
  const [nc = 0, lc = 0.1, gc = 0.035] = S.cones ?? [], [nt = 0, lt = 0.3, gt = 0.006] = S.twigs ?? [], [ns = 0, ss = 0.2] = S.sprigs ?? [];
  for (let i = 0; i < nc; i++) {   // a cone on its side, its scales a few rings
    const c = where(), d = lying(), L = lc * (0.75 + 0.5 * R0()), g = gc * (0.8 + 0.4 * R0()), K = [0, 0.2, 0.45, 0.7, 0.9, 1], k = [0.35, 0.85, 1, 0.85, 0.55, 0.15];
    tube(b, K.map((t) => add(add(c, mul(d, (t - 0.5) * L)), [0, FOOT + g * 0.9, 0])), k.map((x) => x * g), 7);
  }
  for (let i = 0; i < nt; i++) {   // a twig, bowed, lying
    const c = where(), d = lying(), L = lt * (0.6 + 0.8 * R0()), g = gt * (0.7 + 0.6 * R0()), s = cross(d, [0, 1, 0]), bow = (R0() - 0.5) * 0.3 * L;
    tube(b, [-0.5, 0, 0.5].map((t, j) => add(add(add(c, mul(d, t * L)), mul(s, j === 1 ? bow : 0)), [0, FOOT + g + (j === 1 ? g : 0), 0])), [g, g * 0.8, g * 0.5], 3);
  }
  for (let i = 0; i < ns; i++) {   // a sprig of its needles or leaves, fallen: its cards along the ground
    const c = where(), d = norm(add(lying(), [0, -0.06, 0])), s = ss * (0.7 + 0.6 * R0());
    cards(b, add(c, [0, FOOT + 0.012, 0]), d, s, [0, 1, 0], 0.55 + 0.25 * R0(), R0);
  }
  return b;
}

/** A stone bedded in the soil: a lumpy dome, its foot under the ground, its top rounded by the weather, its skin the
    rock's (its `wood`). S: { r, h, lumps (how uneven, 0..1), seed }. */
export function bedded(b, S) {
  const R0 = rng(S.seed), sides = 12, rings = 6, wob = Array.from({ length: sides }, () => 1 - S.lumps * 0.5 + S.lumps * R0()), tilt = [R0() - 0.5, R0() - 0.5].map((x) => x * S.lumps * 0.4), row = [], at = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings, ang = u * Math.PI * 0.5, rr = S.r * Math.cos(ang), y = FOOT - 0.25 * S.h + S.h * 1.25 * Math.sin(ang), ring = [];
    for (let k = 0; k <= sides; k++) {
      const t = (k / sides) * 2 * Math.PI, w = wob[k % sides] * (1 + 0.12 * Math.sin(3 * t + S.seed) * S.lumps), p = [Math.cos(t) * rr * w, y + (Math.cos(t) * tilt[0] + Math.sin(t) * tilt[1]) * rr, Math.sin(t) * rr * w];
      const nrm = norm([Math.cos(t) * Math.cos(ang) * S.h, Math.sin(ang) * S.r, Math.sin(t) * Math.cos(ang) * S.h]);
      ring.push(b.v(p, nrm, [(k / sides) * 3 * S.r, (u * S.h * 2) / 1.0], 0, 0.45 + 0.55 * u, [0, 0, 0], [0, FOOT, 0]));
      (at[k] ??= []).push(p);
    }
    row.push(ring);
  }
  // (its outline where it comes out of the ground: each of its sides where it crosses it, or its foot where its tilt
  // lifts that out; above the ground it only narrows, so this is all the ground it covers)
  const out = at.slice(0, sides).map((col) => {
    const i = col.findIndex((p) => p[1] >= FOOT); if (i === 0) return col[0];   // (the first of its rings out of the ground on this side; its top always is)
    const p = col[i - 1], q = col[i], t = (FOOT - p[1]) / (q[1] - p[1]); return [p[0] + (q[0] - p[0]) * t, FOOT, p[2] + (q[2] - p[2]) * t];
  });
  out.forEach((p, k) => { const q = out[(k + 1) % sides]; b.feet.push([p[0], p[2], q[0], q[2], 0, 0, 1]); });
  for (let i = 0; i < rings; i++) for (let k = 0; k < sides; k++) { const p0 = row[i][k], p1 = row[i][k + 1], p2 = row[i + 1][k], p3 = row[i + 1][k + 1]; b.index.push(p0, p2, p3, p0, p3, p1); }
  return b;
}
