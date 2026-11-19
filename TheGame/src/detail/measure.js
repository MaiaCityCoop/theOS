// The one measure (intent 0038): how large a thing is on the screen. Every choice of detail in the game is made by it,
// on the CPU and on the GPU, and every one asks here: nowhere else is a pixel counted. No asset, kind or kit says where
// its detail changes: each rung of a thing carries its error in metres (src/detail/error.js), and comes where that error,
// seen from where it stands, is within the dial (only the stress world's zoo still keeps its ladder,
// assets/kit/ladder.js, until 8b); this says what such a pixel is, and keeps the dial.
//
// One definition of a pixel: one drawn, the rows the governor draws inside (src/core/screen.js drawn: the canvas's,
// src/core/output.js, at the most), through the walker's 68° lens (the lens every level is set for; a longer one is the
// detail governor's factor, U.uLodInv: src/core/governor.js, folded into every distance: src/world/noise.nodes.js
// camDist). It moves only once it lies a BAND off (keep), and what it moves fades over FADE (src/detail/error.js). (Till
// 2026-11-19 it was the canvas's rows, however many were drawn, so a step of the governor moved no switch; but detail
// finer than a drawn pixel cannot be drawn, only aliased, and the picture built over time cannot recover it for what
// sways in the wind: a phone drawing its inside low showed its far grass shimmering. Since the governor steps only on
// a real overload and never back and forth, a switch moves only on a large, rare step.) What a capacity is sized for is
// still the most the canvas can draw (pxKMost).
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
//   pxKMost(dial), farMost(px, size, dial)   the live pixel at the most pixels the screen can draw (its own ratio) and the dial at
//                        rest (restDial): what a capacity is sized for, so no turn of a dial overfills it
//   restDial(), raiseRest(d)   the dial at rest on this page: the address's (?truth: under 1), else 1, raised where the
//                        device's memory cannot hold what follows the dial at it (src/core/gpu.js byDial): the one knob
//                        of memory, the same for every store, so none is short for having come late
//   pxThrough(camera, h) pixels a metre covers one metre off through a camera's own lens (what moves on the screen:
//                        src/core/temporal.js; the scale bar: src/camera/rig.js); lensOf(camera): how many times larger
//                        than the 68° lens a camera shows a thing
//   U.uPxK, U.uErrorPx   the live pixel and the dial as uniforms (the shared set's, kept current here); in node code
//                        pxAt(size, dist), spanAt(size, dist) and dialPxAt(px), the twins of the above
//   onMeasure(f), measureVersion()   what reckons a band of distances once (a tier's, the meadow's rings) reckons it again
//                        when either number changes: the window, the governor's ratio, the dial
//   DIAL_ASKED, dialAfter   ?truth: the same measure, the dial turned down to what the address asks once the game's
//                        start has settled (src/boot.js); every capacity sized for the dial at rest (pxKMost)
import { float, max } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { flagText } from '../core/flags.js';
import { ERROR_PX, pxK, keepNumbers, BAND } from './error.js';


const LENS = 1 / Math.tan((68 / 2) * Math.PI / 180);   // the walker's 68° lens as a projection's scale (what a camera's projectionMatrix holds at [5])

/** Pixels a metre covers at one metre away, through the walker's 68° lens, on a picture h pixels tall. */
export const pxKAt = (h) => h / (2 * Math.tan((68 / 2) * Math.PI / 180));
/** Where a size on screen is reached: metres away, for a thing of span metres, as the walker's lens sees it, on a picture
    h pixels tall (none: the live pixel's, whatever ?truth says: the library). */
export const distanceAt = (px, span, h = 0) => (span * (h ? pxKAt(h) : pxK())) / px;
/** Pixels a metre covers at one metre away through a camera's own lens, on a picture h pixels tall. */
export const pxThrough = (camera, h) => camera.projectionMatrix.elements[5] * h * 0.5;
/** How many times larger a camera shows a thing than the walker's 68° lens. */
export const lensOf = (camera) => camera.projectionMatrix.elements[5] / LENS;

// ---- the live pixel and the dial, kept ----
let output = () => 1, most = () => 1;   // the drawn rows' ratio (keepMeasure: src/core/screen.js drawn, as it is now), and the most the inside may be drawn at, the canvas's (no fewer than the window's own points)
const listeners = new Set(); let version = 0;
/** The rows drawn (the window's CSS height at the drawn ratio): what can be drawn of a thing, the picture built over time
    laying them out to the canvas's (src/core/temporal.js). A step of the governor's within a BAND moves no switch. */
const outputHeight = () => (globalThis.innerHeight || 1080) * output();
/** Both numbers to error.js, the uniforms and whoever listens, where either changed: the live pixel only once it lies a
    BAND off the one kept (a window drawn a little larger or smaller moves no switch, and none goes back and forth: every
    hand-over spans a BAND, src/detail/error.js), the dial at once; fresh: the live pixel as it is now, outright (the
    canvas's first: what was kept before it stood in for it, and is no measure a BAND should hold). */
function keep(dial = ERROR_PX(), fresh = false) {
  const now = pxKAt(outputHeight()), was = pxK(), k = !fresh && was > 0 && now < was * BAND && now > was / BAND ? was : now;
  if (k === was && dial === ERROR_PX()) return false;
  keepNumbers({ k, dial }); U.uPxK.value = k; U.uErrorPx.value = dial; version++;
  for (const f of listeners) f();
  return true;
}
keep();   // (from the start, before the screen says its ratio: the window's own pixels)
/** Keep the measure current: drawn, the drawn rows' ratio (src/core/screen.js drawn: read as it is now, the governor
    and a resize change it); full, the most it may be, the canvas's (src/core/output.js), what a capacity is sized for.
    The window's size is followed, and each frame asks again (measureNow). The rows are taken outright the first time:
    held to the window's own points by the BAND, as they were till 2026-11-19, a start's detail hung on its order
    (WebKit at 1512 × 945 at 2 kept 945 rows of a canvas of 1138; a window opened at another size kept that one's). */
export function keepMeasure(drawn = () => 1, full = drawn) {
  output = drawn;
  most = () => Math.max(1, full());
  keep(ERROR_PX(), true); addEventListener('resize', () => keep());
}
/** The live pixel in the dial's pixels: dial pixels a metre covers one metre from the eye (error.js). */
export const dialK = () => pxK() / ERROR_PX();
/** The live pixel at the most pixels the screen can draw (its own ratio) and the dial at rest on this page (restDial),
    or another (dial: for what holds its own, the land, src/terrain/terrain.js), in the dial's pixels so: what a
    capacity is sized for. */
export const pxKMost = (dial = REST) => pxKAt((globalThis.innerHeight || 1080) * most()) / dial;
/** How far off a thing `size` metres large is still px dial pixels large, at the most (pxKMost). */
export const farMost = (px, size, dial) => (size * pxKMost(dial)) / px;
/** Each frame, before anything chooses (src/boot.js choose, tools/bench.js): the governor may have changed the inside's
    ratio. True where the measure changed. */
export const measureNow = () => keep();
/** The dial turned to its rest (restDial) once the page's start (`ready`, src/boot.js) has settled: the game's is 1, or
    what this device's memory raised it to, so nothing turns but where it rose; the truth's a fraction of a pixel. */
export const dialAfter = (ready) => ready.then(() => keep(REST));
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
// start has settled (src/boot.js: dialAfter); then it is drawn as a still (src/core/screen.js, src/core/temporal.js).
// `?truth=d` draws at dial d. Nothing else of it is a mode: what differs is what the dial at its least implies.
/** The dial the address asks for (dialAsked: the truth's, under 1), or 1: where the dial rests unless this device's
    memory raises it (restDial). */
export const DIAL_ASKED = dialAsked(flagText('truth'));
// ---- the dial at rest: memory's one knob ----
// Every store that follows the dial (what lies within reach at it: things, cells, rings) is sized at the dial at rest,
// and takes its need there, never what its class has left. Where a device's memory cannot hold all of them at it
// (src/core/gpu.js byDial), it rises, the same for every store: all are a little coarser, none is left out for coming
// late. It is never lowered: no store sized at it finds less room than it took.
let REST = DIAL_ASKED;
/** The dial at rest on this page: the least it is, what every capacity is sized for (pxKMost). */
export const restDial = () => REST;
/** The dial at rest raised to d (src/core/gpu.js byDial): the dial with it where it was finer, and every capacity sized
    at it again (onMeasure). True where it rose. */
export function raiseRest(d) {
  if (!(d > REST)) return false;
  REST = d;
  if (!keep(Math.max(ERROR_PX(), d))) { version++; for (const f of listeners) f(); }
  return true;
}
/** The dial an address's `truth` asks for (its text; none: it asks for none, the dial's rest). The truth is drawn at a
    quarter of a pixel drawn by default: at every pixel of the canvas (a third again finer than the game's inside each
    way) over 32 places of a pixel, so a quarter of an inside pixel is below what its picture can show; `?truth=d` at d,
    a dial over 0 and under 1 (anything else, a reach in metres as ?truth once took, the default). */
function dialAsked(t) {
  if (t == null) return 1;
  const d = +t;
  return d > 0 && d < 1 ? Math.max(1e-3, d) : 0.25;
}

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
