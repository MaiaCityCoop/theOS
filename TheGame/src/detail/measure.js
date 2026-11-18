// The one measure (intent 0038): how large a thing is on the screen. Every choice of detail in the game is made by it,
// on the CPU and on the GPU, and every one asks here: nowhere else is a pixel counted. No asset, kind or kit says where
// its detail changes: each rung of a thing carries its error in metres (src/detail/error.js), and comes where that error,
// seen from where it stands, is within the dial (only the stress world's zoo still keeps its ladder,
// assets/kit/ladder.js, until 8b); this says what such a pixel is, and keeps the dial.
//
// One definition of a pixel: the pixels drawn, the inside's (the governor's ratio of the screen's: src/core/screen.js),
// through the walker's 68° lens (the lens every level is set for; a longer one is the detail governor's factor, U.uLodInv:
// src/core/governor.js, folded into every distance: src/world/noise.nodes.js camDist).
//
//   pxK()                pixels drawn a metre covers one metre from the eye (error.js: kept here, live)
//   ERROR_PX()           the dial: the most pixels drawn a rung may differ from the thing at full detail (error.js;
//                        kept here with the live pixel: keep)
//                        the one rule (error.js): a rung of error e metres, dist metres off, differs by e pxK() / dist
//                        pixels drawn, and stands in where that is within the dial
//   pxOn(size, dist)     how many pixels drawn a thing `size` metres large covers `dist` metres off, the distance as the
//                        68° lens sees it (times U.uLodInv); in the dial's pixels, what it meets a switch or a level at,
//                        dialPx(pxOn(…)) (error.js: every size on screen it says is one, so none changes with the dial)
//   dialK()              the live pixel in the dial's pixels: pxK() / ERROR_PX(), what every distance of a level moves by
//   farFor(px, size)     how far off a thing covers px dial pixels, as far as a level drawn down to px reaches (how far
//                        anything is drawn: farFor(GONE, the largest thing's size), error.js GONE)
//   distanceAt(px, size, h)   the same through the lens alone on a picture h pixels tall (a library's picture)
//   pxKMost(), farMost(px, size)   the live pixel at the most pixels the screen can draw (its own ratio, the dial at rest,
//                        1: the governor only raises it): what a capacity is sized for, so no turn of a dial overfills it
//   pxThrough(camera, h) pixels a metre covers one metre off through a camera's own lens (what moves on the screen:
//                        src/core/temporal.js; the scale bar: src/camera/rig.js); lensOf(camera): how many times larger
//                        than the 68° lens a camera shows a thing
//   U.uPxK, U.uErrorPx   the live pixel and the dial as uniforms (the shared set's, kept current here); in node code
//                        pxAt(size, dist), spanAt(size, dist) and dialPxAt(px), the twins of the above
//   onMeasure(f), measureVersion()   what reckons a band of distances once (a tier's, the meadow's rings) reckons it again
//                        when either number changes: the window, the governor's ratio, the dial
//   TRUTH, DIAL_LEAST, truthAfter   ?truth: the same measure, the dial turned down to TRUTH_DIAL once the game's start
//                        has settled (src/boot.js); every capacity sized for the least dial (pxKMost)
import { float, max } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { flag, flagNum } from '../core/flags.js';
import { ERROR_PX, pxK, keepNumbers } from './error.js';


const LENS = 1 / Math.tan((68 / 2) * Math.PI / 180);   // the walker's 68° lens as a projection's scale (what a camera's projectionMatrix holds at [5])

/** Pixels a metre covers at one metre away, through the walker's 68° lens, on a picture h pixels tall. */
const pxKAt = (h) => h / (2 * Math.tan((68 / 2) * Math.PI / 180));
/** Where a size on screen is reached: metres away, for a thing of span metres, as the walker's lens sees it, on a picture
    h pixels tall (none: the live pixel's, whatever ?truth says: the library). */
export const distanceAt = (px, span, h = 0) => (span * (h ? pxKAt(h) : pxK())) / px;
/** Pixels a metre covers at one metre away through a camera's own lens, on a picture h pixels tall. */
export const pxThrough = (camera, h) => camera.projectionMatrix.elements[5] * h * 0.5;
/** How many times larger a camera shows a thing than the walker's 68° lens. */
export const lensOf = (camera) => camera.projectionMatrix.elements[5] / LENS;

// ---- the live pixel and the dial, kept ----
let inside = () => 1, most = () => 1;   // the governor's ratio of the pixels drawn (keepMeasure: the screen's inside), and the most it can be (the canvas's, as it is now: src/core/output.js)
const listeners = new Set(); let version = 0;
/** The inside's height, pixels drawn, as the screen has it now (the window's CSS height at the governor's ratio). */
const drawnHeight = () => (globalThis.innerHeight || 1080) * inside();
/** Both numbers to error.js, the uniforms and whoever listens, where either changed. */
function keep(dial = ERROR_PX()) {
  const k = pxKAt(drawnHeight());
  if (k === pxK() && dial === ERROR_PX()) return false;
  keepNumbers({ k, dial }); U.uPxK.value = k; U.uErrorPx.value = dial; version++;
  for (const f of listeners) f();
  return true;
}
keep();   // (from the start, before the screen says its ratio: the window's own pixels)
/** Keep the measure current: drawn, the screen's ratio of the pixels drawn (src/core/screen.js inside), and out, the most
    it can be (the canvas's, src/core/output.js: read as it is now, a resize changes it); the window's size is followed,
    and each frame asks again (measureNow). */
export function keepMeasure(drawn = null, out = () => 1) {
  if (drawn) inside = drawn;
  most = () => Math.max(1, out());
  keep(); addEventListener('resize', () => keep());
}
/** The live pixel in the dial's pixels: dial pixels a metre covers one metre from the eye (error.js). */
export const dialK = () => pxK() / ERROR_PX();
/** The live pixel at the most pixels the screen can draw (its own ratio) and the least the dial will be on this page
    (DIAL_LEAST: 1, the governor only raises it; or the truth's), in the dial's pixels so: what a capacity is sized for. */
export const pxKMost = () => pxKAt((globalThis.innerHeight || 1080) * most()) / DIAL_LEAST;
/** How far off a thing `size` metres large is still px dial pixels large, at the most (pxKMost). */
export const farMost = (px, size) => (size * pxKMost()) / px;
/** Each frame, before anything chooses (src/boot.js choose, tools/bench.js): the governor may have changed the inside's
    ratio. True where the measure changed. */
export const measureNow = () => keep();
/** ?truth: the dial turned down to TRUTH_DIAL once the game's start (`ready`, src/boot.js) has settled; the game: nothing. */
export const truthAfter = (ready) => { if (TRUTH) ready.then(() => keep(TRUTH_DIAL)); };
/** f() whenever the live pixel or the dial changes (a tier's band, the meadow's rings); returns what stops it. */
export const onMeasure = (f) => { listeners.add(f); return () => listeners.delete(f); };
/** A number that changes whenever the measure does: what packs by it packs again. */
export const measureVersion = () => version;

// ---- ?truth: the one measure, the dial turned down ----
// The gate's reference picture (tools/gate.js) is the game's own measure with the dial turned down to TRUTH_DIAL: every
// rung within a fraction of a pixel drawn of the thing at full detail, at every distance, so what is far off is as near
// the truth as what is near, and nothing is drawn finer than the view can show. There is no truth of its own: no reach,
// no "everything within it measured huge". A ?truth page starts as the game starts, at the dial's rest (the world built
// at the game's pace, the far ends baked a frame at a time at the game's frame rate), and turns the dial down once that
// start has settled (src/boot.js); then it is drawn as a still (src/core/screen.js, src/core/temporal.js). `?truth=d`
// draws at dial d.
/** Whether the address asks for the truth (`?truth`). */
export const TRUTH = flag('truth');
/** The dial the truth is drawn at: a quarter of a pixel drawn by default. The truth is drawn at every pixel of the canvas
    (a third again finer than the game's inside each way) over 32 places of a pixel, so a quarter of an inside pixel is
    below what its picture can show. */
const ASKED = TRUTH ? flagNum('truth', 0.25) : 1;   // (a dial between 0 and 1; anything else, a reach in metres as ?truth once took, is the default)
const TRUTH_DIAL = TRUTH ? (ASKED > 0 && ASKED < 1 ? Math.max(1e-3, ASKED) : 0.25) : 1;
/** The least the dial will be on this page: 1 (the governor only raises it), or the truth's. What every capacity is sized
    for (pxKMost), so a turn of the dial down to it finds room. */
export const DIAL_LEAST = TRUTH ? TRUTH_DIAL : 1;

/** How many pixels drawn a thing `size` metres large covers `dist` metres off, as the 68° lens sees that distance. */
export const pxOn = (size, dist) => (size * U.uPxK.value) / dist;
/** How far off (metres, as the 68° lens sees them) a thing `size` metres large covers px dial pixels: as far as a level
    of it drawn down to px reaches. */
export const farFor = (px, size) => (size * dialK()) / px;
// ---- on the GPU ----
/** The uniforms the measure is kept in (of the shared set, so every material binds them with the rest): the live pixel
    and the dial. */
export const uPxK = U.uPxK;
/** A thing `size` metres large, `dist` metres off as the 68° lens sees it (camDist): the pixels drawn it covers at one
    metre, a node (its pixels on screen are this over dist). size, dist: nodes. */
export const spanAt = (size, dist) => size.mul(U.uPxK);
/** Its pixels drawn, a node. */
export const pxAt = (size, dist) => spanAt(size, dist).div(max(dist, 1e-3));
/** A size on screen (pixels drawn, a node) in the dial's pixels: what it meets every switch and level at (error.js
    dialPx's twin). */
export const dialPxAt = (px) => px.div(U.uErrorPx);
