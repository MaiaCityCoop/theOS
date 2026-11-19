// The mastic branch end's painting as numbers (materials/masticleaf.js paints by them; materials/mastictwig.js paints
// its main shoot alone by them): its shoots and the leaves on them, worked out once from the branch's own dice (the same
// on every card). And, for what makes a mastic's finest level (assets/kit/tree.js splayOf), its shoots as a spray's
// twigs (each one's angle from upright, its length) and the main shoot painted alone: its foot, its length, how far
// either side its leaves reach. Plain numbers, apart from the paintings: they are read in the recipes' workers, where
// nothing that paints can be read.
import { rng } from '../src/core/hash.js';

const R = rng(5531);
// The shoots: where each leaves its parent (its foot), its way (from upright), its length, how far it bows out, how
// thick it is at its foot, and how many leaves it bears. The main one runs up the card; two side shoots fork from it.
const along = (S, a) => [S.foot[0] + S.dir[0] * a + S.perp[0] * a * a * S.bow, S.foot[1] + S.dir[1] * a + S.perp[1] * a * a * S.bow];
const tangent = (S, a) => { const t = [S.dir[0] + S.perp[0] * 2 * a * S.bow, S.dir[1] + S.perp[1] * 2 * a * S.bow], l = Math.hypot(...t); return [t[0] / l, t[1] / l]; };
const shoot = (foot, ang, L, bow, thick, leaves) => ({ foot, ang, dir: [Math.sin(ang), Math.cos(ang)], perp: [Math.cos(ang), -Math.sin(ang)], L, bow: bow * Math.sign(ang || 1), thick, leaves });
export const MAIN = shoot([0.5, 0.02], 0.05, 0.93, 0.04, 0.0055, 10);
export const SHOOTS = [MAIN, shoot(along(MAIN, 0.22), -0.62, 0.55, 0.16, 0.0045, 8), shoot(along(MAIN, 0.42), 0.56, 0.47, 0.16, 0.004, 7)];
// Each leaf: which shoot it is on, where it leaves it, its way (lower leaves spread wider), its stalk's length (shorter
// towards the tip), its pairs of leaflets and how long a leaflet is (nearly half its stalk), how young it is. Kept inside
// the card.
export const LEAF = SHOOTS.flatMap((S, si) => Array.from({ length: S.leaves }, (_, k) => {
  const t = (si ? 0.14 : 0.2) + ((0.97 - (si ? 0.14 : 0.2)) * k) / (S.leaves - 1), at = along(S, t * S.L), tg = tangent(S, t * S.L), side = (k + si) % 2 ? 1 : -1;
  const turn = side * (0.95 - 0.4 * t + (R() - 0.5) * 0.2), dir = [tg[0] * Math.cos(turn) + tg[1] * Math.sin(turn), -tg[0] * Math.sin(turn) + tg[1] * Math.cos(turn)];
  const room = Math.min(...[[0.02, 0.98], [0.02, 0.98]].map(([lo, hi], i) => (dir[i] > 0 ? (hi - at[i]) / dir[i] : dir[i] < 0 ? (lo - at[i]) / dir[i] : 9)));
  const L = Math.max(0.02, Math.min((0.21 - 0.11 * t) * (0.9 + 0.2 * R()), room * 0.8)), P = t < 0.45 ? 4 : t < 0.8 ? 3 : 2;
  return { si, at, dir, L, P, leaflet: L * 0.42, young: Math.min(1, Math.max(0, (t - 0.68) / 0.3)) * (0.6 + 0.4 * R()), seed: si * 31 + k * 7 + 3 };
}));
/** How far either side of a shoot's foot its leaves reach, of the card: each leaf's stalk across, and a leaflet more. */
const reachOf = (leaves, foot) => Math.max(...leaves.map((F) => Math.abs(F.at[0] - foot[0]) + F.L * Math.abs(F.dir[0]) + F.leaflet));
export default { foot: MAIN.foot, twigs: SHOOTS.map((S) => [S.ang, S.L]), twig: { foot: MAIN.foot, length: MAIN.L, half: reachOf(LEAF.filter((F) => F.si === 0), MAIN.foot) } };
