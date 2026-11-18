// The one measure of detail (intent 0038), plain JS: the page reads it through the measure (src/detail/measure.js), and
// what is built in the recipes' workers (the crowd kit, the surfaces' builder) reads it here, where nothing of the page or
// of three is. A recipe's version holds it (tools/registry.js SHARED): a change of it builds every plant again.
//
// An asset says only what it is at full detail. Everything coarser that stands in for it is a rung: a first share of a
// crowd's sprigs, its clumps, its impostor, a cluster's parent, a ring of wider blades, and last of all nothing (the
// land under it). Each rung has its error against the thing at full detail, measured on the thing itself: the farthest
// any point of the rung lies from where the thing is, in metres, over the thing's size (its largest side; a tree's
// height: assets/kinds.js sizeOf). Every switch of detail is the one function below: a rung stands in where its error is
// at most ERROR_PX pixels drawn (switchPx), and over the BAND above that it comes in. No asset, kind or engine holds a
// size on screen or a distance of its own.

/** The most a thing drawn at a rung may differ from it at full detail, in pixels drawn: the one number of detail (the
    governor may raise it to hold 60 fps before it gives up pixels). */
export const ERROR_PX = 1;

/** The pixels drawn a pixel of the measure, as the budget draws a 4K screen: about 1440p inside, brought up to the screen
    by the temporal pass (intent 0038, Define). What is chosen before a frame is drawn (which parts a level holds, where
    a crowd hands over to its clumps) matches a baked texel against the pixels drawn by it; what is chosen in the frame
    reads the pixels drawn as they are (measure.js drawnAt). (Once the measure counts the pixels drawn, measure.js DRAWN,
    this is 1.) */
export const BUDGET_DRAWN = 4 / 3;

// ---- the one function ----
/** The pixels drawn by which a rung of error `e` (metres over the thing's size) differs from the thing at full detail,
    the thing `px` pixels of the measure on screen. */
export const errorPx = (e, px) => e * px * BUDGET_DRAWN;
/** Every switch point of detail: the size on screen (pixels of the measure) under which a rung of error `e` differs from
    full detail by at most ERROR_PX pixels drawn. */
export const switchPx = (e) => ERROR_PX / (Math.max(e, 1e-12) * BUDGET_DRAWN);
/** The same as a distance (metres, as the measure has them): how far off a rung of `metres` of error is within ERROR_PX,
    K the measure's pixels a metre covers at a metre (measure.js pxK): a ring of blades, measured in metres. */
export const switchAt = (metres, K) => (metres * K * BUDGET_DRAWN) / ERROR_PX;

// ---- how a rung comes and goes ----
/** Every hand-over spans this in size on screen: a cluster turns into its parent while the parent's error on screen falls
    from BAND times the most allowed to the most allowed (src/scatter/cut.js), a level hands over to the next over it
    (src/detail/handover.js), a thing sinks away over it, a ring of blades hands over to the next over it. A group's error
    at least is BAND times its children's (assets/kit/clusters.js). */
export const BAND = 1.5;
/** Half the width of a level's hand-over, on a log scale (src/detail/handover.js): BAND from end to end. */
export const FADE = Math.log(BAND) / 2;
/** Where a thing is gone, its last rung nothing: what stands in for it then is what is under it. Leaving out a thing that
    stands `e` of its size off what stays (a plant: its height over the land, which wears its stand's colour or its floor;
    a rock or a made thing on the meadow: all of it, 1) differs by that much: it is gone under switchPx(e), sinking away
    over the BAND above (src/detail/handover.js). GONE: a thing of which nothing stays, e 1. */
export const goneAt = (e) => switchPx(Math.min(1, e));
export const GONE = goneAt(1);

// ---- the levels: where the work of drawing a thing is shared out ----
// A level is only which of a thing's rungs are at hand, never a look: two levels meet where each holds all that the size
// there asks for, so a thing passed from one to the next shows no change. Every thing's levels are cut at the same sizes
// on screen (rungPx): from PX_CUT pixels drawn down, each half the one before, down to where things are gone.
/** The size on screen, pixels drawn, from which a surface's clusters are tested one by one (src/scatter/cut.js). */
export const PX_CUT = 256;
/** Level l's lowest size on screen (pixels of the measure): where the next takes over. */
export const rungPx = (l) => PX_CUT / (BUDGET_DRAWN * 2 ** l);
/** The level whose lowest size is the largest at or under px (a thing that ends at px ends with it, a little later). */
export const rungAt = (px) => Math.max(0, Math.ceil(Math.log2(PX_CUT / (BUDGET_DRAWN * px)) - 1e-9));

// ---- a surface's levels (stage 8): what of its cluster hierarchy (assets/kit/clusters.js) is held where ----
// What is drawn of a surface is chosen cluster by cluster, by the cut's rule (src/scatter/cut.js): a cluster where its own
// error is at most the error its size on screen allows (ERROR_PX over its pixels drawn) and its parent's is over it. The
// levels only say which clusters a thing of a size needs at hand, so the same rule can be run on as few as it takes:
//   - level 0, a thing PX_CUT pixels drawn or larger: every cluster it may need, tested one by one in a compute pass
//     (each by its own distance, so a boulder at the eye is fine at its near end and coarse at its far end);
//   - level l from 1 on, smaller: the clusters any size between half its largest and its largest may need (errors
//     `surfaceBand(l)`), each tested by the thing's own size in the vertex stage.
/** How many levels a surface has: the last is drawn down to where it is gone (GONE). */
export const SURFACE_LEVELS = rungAt(GONE) + 1;
/** The errors (of the thing's largest side) level l's clusters are chosen between: [lo, hi] (a level reaches a hand-over
    further than its own coarsest: a thing packed a moment late is still all there). */
export const surfaceBand = (l) => { const lo = l ? (ERROR_PX / PX_CUT) * 2 ** (l - 1) : 0, top = (ERROR_PX / PX_CUT) * 2 ** l; return [lo, l === SURFACE_LEVELS - 1 ? Infinity : top * BAND]; };
/** The size on screen (pixels of the measure) level l is drawn down to: where the next takes over (its least error's
    switch: rungPx(l)). The last: where the thing is gone. */
export const surfacePx = (l) => (l + 1 < SURFACE_LEVELS ? switchPx(surfaceBand(l + 1)[0]) : GONE);
