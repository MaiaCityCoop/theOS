// The one number of detail (intent 0038), plain JS: the page reads it through the measure (src/detail/measure.js), and
// what is built in the recipes' workers (the crowd kit, assets/kit/crowd.js) reads it here, where nothing of the page or
// of three is. A recipe's version holds it (tools/registry.js SHARED): a change of it builds every plant again.

/** The most a thing drawn at a level may differ from it at full detail, in pixels drawn. */
export const ERROR_PX = 1;

/** The pixels drawn a pixel of the measure, as the budget draws a 4K screen: about 1440p inside, brought up to the screen
    by the temporal pass (intent 0038, Define). What is chosen before a frame is drawn (which parts a level holds, where
    a crowd hands over to its clumps) matches a baked texel against the pixels drawn by it; what is chosen in the frame
    reads the pixels drawn as they are (measure.js drawnAt). (Once the measure counts the pixels drawn, measure.js DRAWN,
    this is 1.) */
export const BUDGET_DRAWN = 4 / 3;

// ---- a surface's levels (stage 8): what of its cluster hierarchy (assets/kit/clusters.js) is held where ----
// What is drawn of a surface is chosen cluster by cluster, by the cut's rule (src/scatter/cut.js): a cluster where its own
// error is at most the error its size on screen allows (ERROR_PX over its pixels drawn) and its parent's is over it. The
// levels only say which clusters a thing of a size needs at hand, so the same rule can be run on as few as it takes:
//   - level 0, a thing PX_CUT pixels drawn or larger: every cluster it may need, tested one by one in a compute pass
//     (each by its own distance, so a boulder at the eye is fine at its near end and coarse at its far end);
//   - level l from 1 on, smaller: the clusters any size between half its largest and its largest may need (errors
//     `surfaceBand(l)`), each tested by the thing's own size in the vertex stage.
// Two levels meet where each holds the whole cut that size asks for, the same clusters turned as far into their parents:
// a thing passed from one to the next shows no change. No number here is a look: they share the work out.
/** How many times a group's error at least is its children's (assets/kit/clusters.js): a cluster turns into its parent
    while the parent's error on screen falls from BAND times the most allowed to the most allowed, and has done so before
    the parent is drawn. */
export const BAND = 1.5;
/** The size on screen, pixels drawn, from which a thing's clusters are tested one by one. */
export const PX_CUT = 256;
/** How many levels a surface has: the last is drawn down to under two pixels of the measure. */
export const SURFACE_LEVELS = 9;
/** How much further than its own coarsest a level reaches (a thing packed a moment late is still all there). */
const REACHES = 1.5;
/** The errors (of the thing's largest side) level l's clusters are chosen between: [lo, hi]. */
export const surfaceBand = (l) => { const lo = l ? (ERROR_PX / PX_CUT) * 2 ** (l - 1) : 0, top = (ERROR_PX / PX_CUT) * 2 ** l; return [lo, l === SURFACE_LEVELS - 1 ? Infinity : top * REACHES]; };
/** The size on screen (pixels of the measure) level l is drawn down to: where the next takes over. */
export const surfacePx = (l) => (l + 1 < SURFACE_LEVELS ? ERROR_PX / (surfaceBand(l + 1)[0] * BUDGET_DRAWN) : 0);
