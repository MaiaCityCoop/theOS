// The snow: how deep it lies (metres), and all that is the snow's own in the light: it settles on what faces up, the
// ground rises under it and what stands sinks in, the grass shorter than it is buried. A weather condition
// (index.js); the light's contract (src/world/light.js) hands its nodes on to the materials. The weather panel sets
// it, from none to 50 cm, and keeps it; a film may set it per shot.
import { Fn, float, vec3, If, smoothstep } from 'three/tsl';
import { U } from '../../core/uniforms.js';
import { tile } from '../tile.js';

const MAX = 0.5, read = (m) => (m < 0.0025 ? 'No snow' : `Snow ${Math.round(m * 100)} cm`);

/** how deep it lies, metres */
export const snowDepth = U.uSnow;
/** snow's own colour, lit like any surface: white, a little blue in its shade */
export const SNOW = vec3(0.86, 0.89, 0.94);
/** How much of a surface the snow covers: it settles on what faces up, as deep as it lies; what stands `lift` metres out
    of the ground under it (a pebble's top, a blade's tip) shows through until the snow is deeper than that. */
export const snowCover = (n, lift = float(0)) => smoothstep(0.3, 0.75, n.y).mul(smoothstep(lift, lift.add(0.012), U.uSnow));
/** how the snow drifts over the land at p (0..1): deeper in some places, thinner on others; one fetch from the baked billows */
export const snowDrift = (p) => tile('billows', p.div(23)).g.sub(0.5).mul(2.2).add(0.5).clamp(0, 1);
// how high, at w, the snow must lie before it covers a thing whose snow is `clumps` metres uneven (its kind's or its own
// `snow`, assets/kinds.js): in clumps where it held, bare between, the same pattern at every level of detail; one fetch
// from the baked billows (a tile, not noise worked out per pixel), and only while snow lies
const clumpsAt = (w) => tile('billows', w.xz.mul(0.37).add(w.y.mul(0.29)));
const liftF = Fn(([w, clumps]) => { const l = float(9).toVar(); If(U.uSnow.greaterThan(0.001), () => { l.assign(clumpsAt(w).g.sub(0.5).mul(2.4).add(0.5).clamp(0, 1).mul(clumps)); }); return l; });
const liftV = Fn(([w, clumps]) => { const l = float(9).toVar(); If(U.uSnow.greaterThan(0.001), () => { l.assign(clumpsAt(w).level(0).g.sub(0.5).mul(2.4).add(0.5).clamp(0, 1).mul(clumps)); }); return l; });
export const snowLift = (w, clumps) => liftF(w, float(clumps));
/** the same in a vertex stage (a texture is read there at a level it is told: the tile's own) */
export const snowLiftAtVertex = (w, clumps) => liftV(w, float(clumps));

export default {
  id: 'snow', label: 'Snow', order: 20, range: [0, MAX, 0.005], start: 0,
  read: (m) => (m < 0.0025 ? '' : read(m)),
  apply(m) { U.uSnow.value = m; },
  packs: true,   // the grass shorter than the snow is deep is buried: not packed
  // on a surface: its own colour stays where no snow lies, the snow's is laid where it does
  surface(n, lift) { const s = snowCover(n, lift); return { keep: float(1).sub(s), add: SNOW.mul(s) }; },
};
