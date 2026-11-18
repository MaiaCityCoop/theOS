// The ground in relief (intent 0038, stage 6c): how the ground's own height (its virtual texture's: src/terrain/pages.js)
// is shown, by the one measure. There is one ground: one quadtree, one mesh, one material, one light. Near the eye the
// land's quadtree goes on into finer levels (LEVELS below level 0: src/terrain/terrain.js), and the land's own vertices
// are raised by the page's height (src/terrain/material.js, the land's vertex stage); further out the pixels take the
// height on along the eye's ray (parallax: pages.js read); past that the ground is drawn flat. Nothing here draws.
import { float, clamp, smoothstep } from 'three/tsl';
import { ERROR_PX, pxAt, drawnAt } from '../detail/measure.js';
import { BAND } from '../detail/error.js';

/** The ground's own height: metres from a page's lowest ground to its highest (its height 0 … 1, the land's own at
    0.5). The one size of the ground's relief: how it is shown at a distance follows from it by the one measure
    (reliefShares). */
export const RELIEF = 0.05;
/** The parallax's steps down the ray. */
export const PSTEPS = 6;
/** The relief's levels below the land's level 0 (each a node half as large, its quads 1/16 of it: the finest 1.6 cm
    apart). */
export const LEVELS = 5;
/** How the ground's own height is shown at d metres off (as the 68° lens sees them; node): as geometry (the land's
    vertices near the eye raised by it), along the eye's ray (parallax), or not at all. Drawn flat, the ground is off by
    its height on screen: e, its pixels drawn. Parallax's PSTEPS steps leave a step of it, e / PSTEPS. So geometry where
    even parallax would be off by more than ERROR_PX; parallax where the flat ground would be; nothing where neither;
    each handed over within BAND of its line (src/detail/error.js). And no geometry where the relief's first level morphs
    into the land's level 0 (from 0.6 of its reach R: material.js RELIEF_REACH), so the two meet: there parallax
    takes it. -> { geometry, parallax }, shares 0 … 1 */
export const reliefShares = (d, R) => {
  const e = drawnAt(pxAt(float(RELIEF), d)).toVar(), held = float(1).sub(smoothstep(R * 0.5, R * 0.6, d));
  const geometry = smoothstep(PSTEPS * ERROR_PX, PSTEPS * ERROR_PX * BAND, e).mul(held).toVar();
  return { geometry, parallax: smoothstep(ERROR_PX, ERROR_PX * BAND, e).mul(float(1).sub(geometry)) };
};
/** How much of the ground's relief stands out of the snow (snow deeper than the relief buries it). */
export const reliefOverSnow = (depth) => clamp(float(1).sub(depth.div(RELIEF)), 0, 1);
