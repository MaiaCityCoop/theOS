// What a change of a surface looks like (intent 0038): the physics the surfaces' builder counts error by
// (assets/kit/clusters.js). The one place it lives (tools/health.js: a module named physics.js), with its unit and its
// source.

/** How far a surface looks moved where its normal (or its colour, lit the same) is δ off over a way r from where it is
    right: δ r times this, the tilt growing from none to δ along the way. unit: 1. source: the mean of a linear ramp,
    the integral of t from 0 to 1 */
export const RAMP = 1 / 2;
