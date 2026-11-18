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
//   ERROR_PX()           the dial: the most pixels drawn a rung may differ from the thing at full detail (error.js; the
//                        governor turns it: setErrorPx)
//   errorPx(e, dist), fits(e, dist)   the one rule, e in metres (error.js); on the GPU errPx(e, dist) against U.uErrorPx
//   pxOn(size, dist)     how many pixels drawn a thing `size` metres large covers `dist` metres off, the distance as the
//                        68° lens sees it (times U.uLodInv)
//   farFor(px, size)     and back: how far off it covers px pixels, as far as a level drawn down to px reaches
//   pxKAt(h), distanceAt(px, size, h)   the same through the lens alone on a picture h pixels tall (a library's picture)
//   pxKMost(), farMost(px, size)   the live pixel at the most pixels the screen can draw (its own ratio, the dial at rest):
//                        what a capacity is sized for, so no turn of a dial overfills it
//   pxThrough(camera, h) pixels a metre covers one metre off through a camera's own lens (what moves on the screen:
//                        src/core/temporal.js; the scale bar: src/camera/rig.js); lensOf(camera): how many times larger
//                        than the 68° lens a camera shows a thing
//   U.uPxK, U.uErrorPx   the live pixel and the dial as uniforms (the shared set's, kept current here); in node code
//                        pxAt(size, dist), spanAt(size, dist), farAt(px, size) and errPx(e, dist), the twins of the above
//   onMeasure(f), measureVersion()   what reckons a band of distances once (a tier's, the meadow's rings) reckons it again
//                        when either number changes: the window, the governor's ratio, the dial
//   bandAt(near, far, finest, pad)   a level's band of distances, as ?truth has it
//
// ?truth (the gate's reference picture): every thing within REACH metres of the eye, as the 68° lens sees them, is
// measured BIG times as large as it is, so every engine draws it at its finest: a plant's whole crowd, none of it
// enlarged, no far body; the rocks' and the made things' full meshes; nothing thinned or sunk. Past REACH it is measured
// as always. `?truth=<metres>` reaches as far as it says. What an engine cuts by distance besides (the grass's rings,
// the land's mesh) it widens under ?truth where it does it.
import { float, max } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { flag, flagNum } from '../core/flags.js';
import { ERROR_PX, pxK, keepNumbers } from './error.js';

export { ERROR_PX, pxK, errorPx, fits } from './error.js';

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
let inside = () => 1, most = 1;   // the governor's ratio of the pixels drawn (keepMeasure: the screen's inside), and the most it can be (the screen's own)
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
    it can be (the screen's own); the window's size is followed, and each frame asks again (measureNow). */
export function keepMeasure(drawn = null, out = 1) {
  if (drawn) inside = drawn;
  most = Math.max(1, out);
  keep(); addEventListener('resize', () => keep());
}
/** The live pixel at the most pixels the screen can draw (its own ratio) and the dial at rest (the governor only raises
    it): what a capacity is sized for. */
export const pxKMost = () => pxKAt((globalThis.innerHeight || 1080) * most);
/** How far off a thing `size` metres large is still px pixels drawn large, at the most (pxKMost). */
export const farMost = (px, size) => (size * pxKMost()) / px;
/** Each frame, before anything chooses (src/boot.js choose, tools/bench.js): the governor may have changed the inside's
    ratio. True where the measure changed. */
export const measureNow = () => keep();
/** The governor's dial (src/core/governor.js): ERROR_PX from now on. */
export const setErrorPx = (v) => keep(Math.max(0, v));
/** f() whenever the live pixel or the dial changes (a tier's band, the meadow's rings); returns what stops it. */
export const onMeasure = (f) => { listeners.add(f); return () => listeners.delete(f); };
/** A number that changes whenever the measure does: what packs by it packs again. */
export const measureVersion = () => version;

// ---- ?truth ----
// (how far the truth reaches where the address names no other: read in headless Chrome on Samuel's Mac, 2026-11-17,
// 800 m held at the pine stand, 1.6 s a frame at 1280×720; 1000 m and 2000 m lost the WebGPU device there. At 600 m a
// frame there took 1.2 s at 1280×720 and 3.3 s at 4K, 1 GB held; past it the gate's views are as the game draws them)
const REACHES = 600;
/** How far ?truth measures every thing as large: metres, as the 68° lens sees them (0: not asked for). */
export const REACH = flag('truth') ? Math.max(0, flagNum('truth', REACHES)) || REACHES : 0;
/** Whether the address asks for the truth (`?truth`). */
export const TRUTH = REACH > 0;
const BIG = 1e6;   // how many times larger the truth measures a thing within its reach

/** How many pixels drawn a thing `size` metres large covers `dist` metres off, as the 68° lens sees that distance. */
export const pxOn = (size, dist) => { const px = (size * U.uPxK.value) / dist; return TRUTH && dist < REACH ? px * BIG : px; };
/** How far off (metres, as the 68° lens sees them) a thing `size` metres large covers px pixels drawn: as far as a level
    of it drawn down to px reaches (under ?truth, at least REACH: everything within it is large). */
export const farFor = (px, size) => (TRUTH ? Math.max(REACH, (size * pxK()) / px) : (size * pxK()) / px);
/** A level's band of distances [near, far] (metres, as the 68° lens sees them) as ?truth has it: the finest level holds
    everything within REACH, every other level nothing there. pad: how far past its band a level's packing reaches.
    [0, 0]: none at all. */
export const bandAt = (near, far, finest, pad = 0) => {
  if (!TRUTH) return [near, far];
  if (finest) return [near, Math.max(far, REACH + pad)];
  const n = Math.max(near, REACH - pad); return n < far ? [n, far] : [0, 0];
};

// ---- on the GPU ----
/** The uniforms the measure is kept in (of the shared set, so every material binds them with the rest): the live pixel
    and the dial. */
export const uPxK = U.uPxK, uErrorPx = U.uErrorPx;
/** The one rule's measure on the GPU: the pixels drawn by which a rung of error e (metres, a node) differs from the
    thing, seen dist metres off as the measure has distances (camDist); it may stand in where this is at most U.uErrorPx. */
export const errPx = (e, dist) => float(e).mul(U.uPxK).div(max(dist, 1e-3));
/** A thing `size` metres large, `dist` metres off as the 68° lens sees it (camDist): the pixels drawn it covers at one
    metre, a node (its pixels on screen are this over dist). size, dist: nodes. */
export const spanAt = (size, dist) => (TRUTH ? size.mul(U.uPxK).mul(dist.lessThan(REACH).select(float(BIG), float(1))) : size.mul(U.uPxK));
/** Its pixels drawn, a node. */
export const pxAt = (size, dist) => spanAt(size, dist).div(max(dist, 1e-3));
/** How far off (metres, as the 68° lens sees them) a thing `size` metres large covers px pixels drawn, a node (px, size:
    numbers): farFor's twin. */
export const farAt = (px, size) => (TRUTH ? max(U.uPxK.mul(size / px), REACH) : U.uPxK.mul(size / px));
