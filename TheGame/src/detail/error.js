// The one measure of detail (intent 0038), plain JS: the page reads it through the measure (src/detail/measure.js), the
// recipes' workers (the crowd kit, the surfaces' builder) here. A recipe's version holds it (tools/registry.js SHARED).
//
// An asset says only what it is at full detail. What stands in for it coarser is a rung (a first share of a crowd's
// sprigs, its clumps, its impostor, a cluster's parent, a ring of wider blades, last of all nothing), and each rung's
// error is measured on the thing itself: the farthest any of it lies from where the thing is, in metres over the thing's
// size (assets/kinds.js sizeOf). One function says every switch of detail: the pixels of difference a rung makes at
// a size on screen (errorPx); a rung stands in where that is at most ERROR_PX (switchPx), coming in over the BAND above.

/** The most a thing drawn at a rung may differ from it at full detail, in pixels drawn: the one number of detail (the
    governor may raise it to hold 60 fps before it gives up pixels). */
export const ERROR_PX = 1;
/** The pixels drawn a pixel of the measure, as the budget draws a 4K screen: about 1440p inside, brought up to the screen
    by the temporal pass (intent 0038, Define). (Once the measure counts the pixels drawn, measure.js DRAWN, this is 1.) */
export const BUDGET_DRAWN = 4 / 3;

/** The one function: the pixels drawn by which a rung of error `e` differs from full detail at `px` pixels of the measure. */
export const errorPx = (e, px) => e * px * BUDGET_DRAWN;
/** Every switch point: the size on screen (pixels of the measure) under which a rung of error `e` is within ERROR_PX. */
export const switchPx = (e) => ERROR_PX / errorPx(Math.max(e, 1e-12), 1);
/** The same as a distance: metres off (as the measure has them, K its pxK) beyond which `metres` of error are within it. */
export const switchAt = (metres, K) => (metres * K * BUDGET_DRAWN) / ERROR_PX;
/** Every hand-over spans this in size on screen: a cluster's into its parent (src/scatter/cut.js; a group's error at least
    BAND times its children's, assets/kit/clusters.js), a level's into the next, a thing's sinking away, a ring's of
    blades into the next. FADE: half of it, on a log scale (src/detail/handover.js). */
export const BAND = 1.5, FADE = Math.log(BAND) / 2;
/** Where a thing is gone: leaving it out differs by how far it stands off what stays (e: a plant its height over the
    land, which wears its stand's colour or its floor; a rock or a made thing all of it, GONE); it sinks over the BAND above. */
export const goneAt = (e) => switchPx(Math.min(1, e)), GONE = goneAt(1);

// ---- the levels: where the work of drawing is shared out, never a look ----
// Two levels meet where each holds all that the size there asks for. Everything's are cut at the same sizes (rungPx):
// from PX_CUT pixels drawn down, each half the one before, to where things are gone.
/** The size on screen, pixels drawn, from which a surface's clusters are tested one by one (src/scatter/cut.js). */
export const PX_CUT = 256;
/** Level l's lowest size on screen (pixels of the measure); rungAt(px): the level whose lowest is the largest at or under px. */
export const rungPx = (l) => PX_CUT / (BUDGET_DRAWN * 2 ** l);
export const rungAt = (px) => Math.max(0, Math.ceil(Math.log2(PX_CUT / (BUDGET_DRAWN * px)) - 1e-9));

// ---- a surface's levels (stage 8): which clusters of its hierarchy (assets/kit/clusters.js) each holds ----
// What is drawn is chosen cluster by cluster by the cut's rule (src/scatter/cut.js): a cluster where its own error is
// within ERROR_PX over its pixels drawn and its parent's is not. Level 0, a thing PX_CUT pixels drawn or larger: every
// cluster it may need, tested one by one in a compute pass, each by its own distance; level l from 1, smaller: the
// clusters any size between half its largest and its largest may need (surfaceBand), tested in the vertex stage.
export const SURFACE_LEVELS = rungAt(GONE) + 1;
/** The errors (of the thing's largest side) level l's clusters are chosen between: [lo, hi] (a level reaches a BAND
    further than its own coarsest: a thing packed a moment late is still all there). */
export const surfaceBand = (l) => { const lo = l ? (ERROR_PX / PX_CUT) * 2 ** (l - 1) : 0, top = (ERROR_PX / PX_CUT) * 2 ** l; return [lo, l === SURFACE_LEVELS - 1 ? Infinity : top * BAND]; };
/** The size on screen (pixels of the measure) level l is drawn down to: its least error's switch; the last: GONE. */
export const surfacePx = (l) => (l + 1 < SURFACE_LEVELS ? switchPx(surfaceBand(l + 1)[0]) : GONE);
