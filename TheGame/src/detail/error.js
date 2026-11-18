// The one measure of detail (intent 0038), plain JS: the page reads it through the measure (src/detail/measure.js), the
// recipes' workers (the crowd kit, the surfaces' builder) here. A recipe's version holds it (tools/registry.js SHARED).
//
// An asset says only what it is at full detail. What stands in for it coarser is a rung (a first share of a crowd's
// sprigs, its clumps, its impostor, a cluster's parent, a ring of wider blades, last of all nothing), and each rung
// carries its error in object space: the farthest any of it lies from where the thing is, in metres, measured on the
// thing itself. Nothing that builds a rung knows a pixel. Pixels exist only at runtime, and there is one definition of
// them: the pixels drawn (the inside's, at the governor's ratio of the screen's: src/core/screen.js), through the
// walker's 68° lens. One rule decides every switch of detail, at runtime:
//
//     errorPx(e, dist) = e · pxK() / dist  ≤  ERROR_PX()        on the GPU: errPx(e, dist) ≤ U.uErrorPx (measure.js)
//
// e in metres (a thing drawn at a scale: its object-space metres times that scale), dist as the measure has distances
// (through the lens: src/world/noise.nodes.js camDist). ERROR_PX is a dial, not a constant: the governor turns it with
// the pixel ratio (src/core/governor.js). The page keeps both numbers here (measure.js keepMeasure); the workers never
// ask for them.
//
// Every size on screen this file says (a switch, a level's ends, where a thing is gone) is in the dial's pixels: as many
// pixels drawn as the dial is, each. So it never changes: a thing x pixels drawn large meets them at x / ERROR_PX()
// (dialPx; on the GPU measure.js dialPxAt), whatever the dial. A level, a band, a ring is reckoned once and holds at
// every turn of the dial; only distances move (measure.js dialK, onMeasure).

// ---- the dial, the live pixel, the switch (src/detail/measure.js keeps them) ----
let DIAL = 1, K = NaN;   // (K: none until the page says: the workers never ask)
/** The dial: the most pixels drawn by which a rung may differ from the thing at full detail. 1 at rest; the governor
    turns it (src/core/governor.js), through the measure (measure.js setErrorPx). */
export const ERROR_PX = () => DIAL;
/** The live pixel: pixels drawn a metre covers one metre from the eye, through the walker's 68° lens (the inside's height
    in pixels, at the governor's ratio: measure.js keepMeasure). */
export const pxK = () => K;
/** The pixels drawn by which a rung of error e (metres) differs from the thing at full detail, seen dist metres off. */
export const errorPx = (e, dist) => (e * K) / Math.max(dist, 1e-9);
/** The one rule: whether a rung of error e (metres) may stand in for the thing, dist metres off. */
export const fits = (e, dist) => errorPx(e, dist) <= DIAL;
/** The page's numbers now, kept by the measure only (src/detail/measure.js): the live pixel and the dial. */
export const keepNumbers = ({ k = K, dial = DIAL } = {}) => { K = k; DIAL = dial; };

// ---- the same rule in the shapes that are handy: a distance, a size on screen ----
/** The distance (as the measure has distances) from which a rung of error e (metres) fits. */
export const fitsFrom = (e) => (e * K) / DIAL;
/** The most dial pixels a thing may cover for a rung whose error is the share `s` of its size (metres over its size) to
    fit: a size on screen at any dial. */
export const switchPx = (s) => 1 / Math.max(s, 1e-12);
/** A size on screen, pixels drawn now, in the dial's pixels: what it meets every switch and level at. */
export const dialPx = (px) => px / DIAL;

// ---- hand-overs (the rung errors' work: BAND, FADE and the hand-over's direction, src/detail/handover.js) ----
/** Every hand-over spans this in size on screen: a cluster's into its parent (src/scatter/cut.js; a group's error at least
    BAND times its children's, assets/kit/clusters.js), a level's into the next, a thing's sinking away, a ring's of
    blades into the next. FADE: half of it, on a log scale (src/detail/handover.js). */
export const BAND = 1.5, FADE = Math.log(BAND) / 2;

// ---- nothing: where a thing is gone ----
/** Leaving a thing out differs by how far it stands off what stays: a plant its height over the land (which wears its
    stand's colour or its floor), a rock or a made thing all of it (s at most 1: a share of its size). Where it is gone,
    dial pixels; it sinks away over the BAND above. */
export const goneAt = (s) => switchPx(Math.min(1, s));
/** Where a thing that is all its error is gone (a rock, a made thing; the largest thing anything places: how far
    anything is drawn, src/detail/extent.js), dial pixels: one. */
export const GONE = goneAt(1);

// ---- the levels: where the work of drawing is shared out, never a look ----
// A thing's levels are cut by the error allowed it, a share of its size (ERROR_PX over the pixels drawn it covers, one
// over its dial pixels): level 0 holds what any share under 1/PX_CUT may need, level l what shares from 2^(l-1)/PX_CUT
// to 2^l/PX_CUT need, down to where everything may go (a share of 1). Those shares never change, nor the dial pixels
// the levels meet at (rungPx), so a dial turned changes no mesh and no level.
/** The size on screen, dial pixels, from which a surface's clusters are tested one by one (src/scatter/cut.js): where
    level 0 ends. */
export const PX_CUT = 256;
/** The share of its size a thing at the coarse end of level l may be off by (2^l / PX_CUT). */
export const levelErr = (l) => 2 ** l / PX_CUT;
/** The level whose shares hold the share s (the error allowed a thing, over its size). */
export const levelOf = (s) => Math.max(0, Math.ceil(Math.log2(Math.max(s, 1e-12) * PX_CUT) - 1e-9));
/** Level l's lowest size on screen (dial pixels); rungAt(px): the level whose lowest is the largest at or under px. */
export const rungPx = (l) => switchPx(levelErr(l));
export const rungAt = (px) => levelOf(1 / Math.max(px, 1e-12));

// ---- a surface's levels (stage 8): which clusters of its hierarchy (assets/kit/clusters.js) each holds ----
// What is drawn is chosen cluster by cluster by the cut's rule (src/scatter/cut.js): a cluster where its own error is
// within the error allowed (ERROR_PX over its pixels drawn) and its parent's is not. Level 0: every cluster a thing may
// need at a share under 1/PX_CUT, tested one by one in a compute pass, each by its own distance; level l from 1: the
// clusters any share between half its largest and its largest may need (surfaceBand), tested in the vertex stage.
export const SURFACE_LEVELS = levelOf(1) + 1;
/** The errors (shares of the thing's largest side) level l's clusters are chosen between: [lo, hi] (a level reaches a
    BAND further than its own coarsest: a thing packed a moment late is still all there). The same at every dial. */
export const surfaceBand = (l) => { const lo = l ? levelErr(l - 1) : 0, top = levelErr(l); return [lo, l === SURFACE_LEVELS - 1 ? Infinity : top * BAND]; };
/** The size on screen (dial pixels) level l is drawn down to: its least error's switch; the last: where it is gone. */
export const surfacePx = (l) => (l + 1 < SURFACE_LEVELS ? switchPx(surfaceBand(l + 1)[0]) : GONE);
