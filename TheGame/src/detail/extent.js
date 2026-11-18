// The frame's extent (intent 0038): how far anything is drawn, from need, one number for every pass that reaches out.
//
// Nothing is drawn past where the largest thing any engine places is gone: GONE pixels of the measure, where leaving it
// out differs by all of it and that is within ERROR_PX pixels drawn (src/detail/error.js). So the camera's far
// plane, the land's levels, the land's pages kept in round the eye and the air's froxels all end there, and nothing
// stands past the land, the land's pages or the air. Distances are the measure's, as the 68° lens sees them; a longer
// lens (the governor's lod, its zoom) sees that many times as far into the world.
//
//   sizeMost()           the largest thing any engine places: its size as the measure has it (assets/kinds.js sizeOf) at
//                        the largest of its placement's scales
//   farthest(h)          how far it is drawn on a picture h pixels tall (the measure's unit, src/detail/measure.js): metres
//   farthestMost()       the same on the largest picture this screen can show: what is made once, at the start (the
//                        land's levels), is made for it
import { recipes } from '../core/registry.js';
import { sizeOf, most } from '../../assets/kinds.js';
import { pxK } from './measure.js';
import { ERROR_PX, BUDGET_DRAWN } from './error.js';

/** Where a thing is gone, pixels of the measure: all of it within ERROR_PX pixels drawn. */
const GONE = ERROR_PX / BUDGET_DRAWN;

let SIZE = 0;
/** The largest thing any engine places, metres (read from the registry once, when it is first asked for). */
export const sizeMost = () => (SIZE ||= Math.max(1, ...recipes('asset').filter((a) => a.placement && a.size).map((a) => sizeOf(a) * most(a.placement.scale ?? 1))));
/** How far the largest thing is drawn on a picture h pixels tall (none: the measure's unit now), metres as the 68° lens
    sees them. */
export const farthest = (h) => (sizeMost() * pxK(h)) / GONE;
/** The most farthest() can be on this screen (its full height): what is made once is made for it. */
export const farthestMost = () => farthest(Math.max(globalThis.innerHeight ?? 0, globalThis.screen?.height ?? 0, 1));
