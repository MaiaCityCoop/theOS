// The ground in relief (intent 0038, stage 6c): how the ground's own height (its virtual texture's: src/terrain/pages.js)
// is shown, by the one measure. There is one ground: one quadtree, one mesh, one material, one light. Near the eye the
// land's quadtree goes on into finer levels (down to the walker's eye: src/terrain/terrain.js), and the land's own vertices
// are raised by the page's height (src/terrain/material.js, the land's vertex stage); further out the pixels take the
// height on along the eye's ray (parallax: pages.js read); past that the ground is drawn flat. Nothing here draws.
import { float, clamp, smoothstep } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { pxKMost, pxAt } from '../detail/measure.js';
import { BAND } from '../detail/error.js';
import { SOIL_RELIEF } from '../world/physics.js';

// (the ground's own height, from a page's lowest ground to its highest, its height 0 … 1, the land's own at 0.5: the
// soil's, src/world/physics.js SOIL_RELIEF; how it is shown at a distance follows from it by the one measure)

/** The parallax's steps down the eye's ray: as many as keep a step of it within a pixel drawn, the dial at rest, where
    the geometry lets go (half the relief's first level's reach R: reliefShares), at the most pixels this screen draws
    (pxKMost: the steps are made once, so for the largest picture; a dial turned up only makes a step's error smaller
    than it is allowed). */
export const parallaxSteps = (R) => Math.ceil((SOIL_RELIEF * pxKMost()) / (R * 0.5));
/** How the ground's own height is shown at d metres off (as the 68° lens sees them; node): as geometry (the land's
    vertices near the eye raised by it), along the eye's ray (parallax), or not at all. Drawn flat, the ground is off by
    its height on screen: e, its pixels drawn. Parallax's steps (parallaxSteps) leave a step of it. So geometry where
    even parallax would be off by more than the dial (ERROR_PX: U.uErrorPx); parallax where the flat ground would be;
    nothing where neither;
    each handed over within BAND of its line (src/detail/error.js). And no geometry where the relief's first level morphs
    into the land's level 0 (from 0.6 of its reach R: material.js RELIEF_REACH), so the two meet: there parallax
    takes it. -> { geometry, parallax }, shares 0 … 1 */
export const reliefShares = (d, R) => {
  const e = pxAt(float(SOIL_RELIEF), d).toVar(), held = float(1).sub(smoothstep(R * 0.5, R * 0.6, d)), n = parallaxSteps(R);
  const geometry = smoothstep(U.uErrorPx.mul(n), U.uErrorPx.mul(n * BAND), e).mul(held).toVar();
  return { geometry, parallax: smoothstep(U.uErrorPx, U.uErrorPx.mul(BAND), e).mul(float(1).sub(geometry)) };
};
/** How much of the ground's relief stands out of the snow (snow deeper than the relief buries it). */
export const reliefOverSnow = (depth) => clamp(float(1).sub(depth.div(SOIL_RELIEF)), 0, 1);
