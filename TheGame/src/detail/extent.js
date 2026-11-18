// The frame's extent (intent 0038): how far anything is drawn, from need, one number for every pass that reaches out.
//
// Nothing is drawn past where the largest thing any engine places is gone (the one measure's GONE, src/detail/error.js:
// leaving it out differs by all of it, and that is within the dial). So the camera's far plane, the land's levels, the
// land's pages kept in round the eye and the air's froxels all end there, and nothing stands past the land, the land's
// pages or the air. What this file knows is only the largest thing; how far a size is drawn is the measure's (farFor,
// farMost). Distances are the measure's, as the 68° lens sees them; a longer lens (the governor's lod, its zoom) sees
// that many times as far into the world.
//
//   sizeMost()           the largest thing any engine places: its size as the measure has it (assets/kinds.js sizeOf) at
//                        the largest of its placement's scales
//   farthest()           how far it is drawn now: metres
//   farthestMost()       the same at the most this screen can show: what is made once, at the start (the land's levels),
//                        is made for it
import { recipes } from '../core/registry.js';
import { sizeOf, most } from '../../assets/kinds.js';
import { farFor, farMost } from './measure.js';
import { GONE } from './error.js';

let SIZE = 0;
/** The largest thing any engine places, metres (read from the registry once, when it is first asked for). */
export const sizeMost = () => (SIZE ||= Math.max(1, ...recipes('asset').filter((a) => a.placement && a.size).map((a) => sizeOf(a) * most(a.placement.scale ?? 1))));
/** How far the largest thing is drawn now (the live pixel and the dial: src/detail/measure.js farFor), metres as the
    68° lens sees them. */
export const farthest = () => farFor(GONE, sizeMost());
/** The most farthest() can be on this screen (its most pixels, the dial at rest: measure.js farMost): what is made once
    is made for it. */
export const farthestMost = () => farMost(GONE, sizeMost());
