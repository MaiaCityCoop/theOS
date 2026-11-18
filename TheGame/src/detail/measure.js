// The one measure (intent 0038): how large a thing is on the screen. Every choice of detail in the game is made by it,
// on the CPU and on the GPU, and every one asks here: nowhere else is a pixel counted. Assets, kinds and kits say only
// how many pixels a level is drawn down to (assets/kinds.js, assets/kit/ladder.js, assets/kit/crowd.js); this says
// what such a pixel is, and how many of them a thing covers.
//
//   pxK(h)               pixels on the screen a metre covers one metre from the eye, through the walker's 68° lens (the
//                        lens every level is set for; a longer one is the detail governor's factor, U.uLodInv:
//                        src/core/governor.js), on a picture h pixels tall (none: the measure's own unit, below)
//   pxOn(size, dist)     how many pixels a thing `size` metres large covers `dist` metres off, the distance as the 68°
//                        lens sees it (times U.uLodInv: src/world/noise.nodes.js camDist)
//   farFor(px, size)     and back: how far off it covers px pixels, as far as a level drawn down to px reaches
//   distanceAt(px, size, h)   the same through the lens alone, whatever ?truth says (a placer's grid, the library)
//   pxThrough(camera, h) pixels a metre covers one metre off through a camera's own lens (what moves on the screen:
//                        src/core/temporal.js; the scale bar: src/camera/rig.js); lensOf(camera): how many times larger
//                        than the 68° lens a camera shows a thing
//   uPxK                 pxK as a uniform (the shared set's, kept current here: keepMeasure); in node code pxAt(size,
//                        dist), spanAt(size, dist) and farAt(px, size), the twins of the above; drawnAt(px): a size
//                        on screen as the pixels drawn, whatever the unit (what a baked texel is matched against)
//   bandAt(near, far, finest, pad)   a level's band of distances, as ?truth has it
//   ERROR_PX             the most a thing drawn at a level may differ from it at full detail, in pixels drawn: the one
//                        number of detail (src/detail/error.js, plain, so the recipes' workers read it too). The crowd
//                        kit's rungs are chosen by it (assets/kit/crowd.js: its clumps take over where their texels
//                        are ERROR_PX pixels drawn, and the crowd thins down to there); the rocks' and the made things'
//                        are to be (stage 8), and the governor may raise it to hold 60 fps before it gives up pixels
//   BUDGET_DRAWN         the pixels drawn a pixel of the measure, as the budget draws a 4K screen (error.js)
//
// Its unit, today: the window's CSS pixels (innerHeight), the pixels every level's numbers were set in (intent 0002).
// What is drawn is more: the inside's pixels, the governor's ratio of the CSS pixels (src/core/screen.js), two to three
// times as many on a 4K screen, so every band lands that much nearer than it was set for. Counting the pixels drawn is
// one line, DRAWN below: off until the gate has measured what it does (tools/gate.js). (Switched on, what reckons a
// band once must reckon it again when the governor's ratio changes, as it does when the window's size does.)
//
// ?truth (the gate's reference picture): every thing within REACH metres of the eye, as the 68° lens sees them, is
// measured BIG times as large as it is, so every engine draws it at its finest: a plant's whole crowd, none of it
// enlarged, no far body; the rocks' and the made things' full meshes; nothing thinned or sunk. Past REACH it is measured
// as always. `?truth=<metres>` reaches as far as it says. What an engine cuts by distance besides (the grass's rings,
// the land's mesh) it widens under ?truth where it does it.
import { float, max } from 'three/tsl';
import { U } from '../core/uniforms.js';
import { flag, flagNum } from '../core/flags.js';

export { ERROR_PX, BUDGET_DRAWN } from './error.js';

const LENS = 1 / Math.tan((68 / 2) * Math.PI / 180);   // the walker's 68° lens as a projection's scale (what a camera's projectionMatrix holds at [5])
// the unit: false, the window's CSS pixels; true, the pixels drawn (the inside's: the governor's ratio of the CSS pixels)
const DRAWN = false;   // ← the one switch of the measure's unit; off: every level's pixels were set in CSS pixels
let ratio = () => 1;   // (the governor's ratio of the pixels drawn: keepMeasure)
const unit = () => (DRAWN ? innerHeight * ratio() : innerHeight);

/** Pixels on screen a metre covers at one metre away, through the walker's 68° lens, on a picture h pixels tall. */
export const pxK = (h = unit()) => h / (2 * Math.tan((68 / 2) * Math.PI / 180));
/** Where a size on screen is reached: metres away, for a thing of span metres, as the walker's lens sees it. */
export const distanceAt = (px, span, h) => (span * pxK(h)) / px;
/** Pixels a metre covers at one metre away through a camera's own lens, on a picture h pixels tall. */
export const pxThrough = (camera, h) => camera.projectionMatrix.elements[5] * h * 0.5;
/** How many times larger a camera shows a thing than the walker's 68° lens. */
export const lensOf = (camera) => camera.projectionMatrix.elements[5] / LENS;

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

/** How many pixels a thing `size` metres large covers `dist` metres off, as the 68° lens sees that distance. */
export const pxOn = (size, dist) => { const px = (size * U.uPxK.value) / dist; return TRUTH && dist < REACH ? px * BIG : px; };
/** How far off (metres, as the 68° lens sees them) a thing `size` metres large covers px pixels: as far as a level of it
    drawn down to px reaches (under ?truth, at least REACH: everything within it is large). */
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
/** The uniform the measure is kept in (one of the shared set, so every material binds it with the rest). */
export const uPxK = U.uPxK;
/** A thing `size` metres large, `dist` metres off as the 68° lens sees it (camDist): the pixels it covers at one metre,
    a node (its pixels on screen are this over dist). size, dist: nodes. */
export const spanAt = (size, dist) => (TRUTH ? size.mul(U.uPxK).mul(dist.lessThan(REACH).select(float(BIG), float(1))) : size.mul(U.uPxK));
/** Its pixels on screen, a node. */
export const pxAt = (size, dist) => spanAt(size, dist).div(max(dist, 1e-3));
/** How far off (metres, as the 68° lens sees them) a thing `size` metres large covers px pixels, a node (px, size:
    numbers): farFor's twin. */
export const farAt = (px, size) => (TRUTH ? max(U.uPxK.mul(size / px), REACH) : U.uPxK.mul(size / px));
/** Its pixels on screen (pxAt's) as the pixels drawn, a node: what a baked texel is matched against (an impostor comes
    where its texels are no larger than the pixels drawn: src/scatter/trees.js, src/detail/impostor.js). U.uDrawn: the
    pixels drawn a CSS pixel, kept as a frame is drawn (src/core/temporal.js). */
export const drawnAt = (px) => (DRAWN ? px : px.mul(U.uDrawn));

/** Keep uPxK current: every engine's levels measure by it. drawn: the governor's ratio of the pixels drawn (the
    screen's inside: src/core/screen.js), read only where the unit is the pixels drawn (DRAWN). */
export function keepMeasure(drawn = null) {
  if (drawn) ratio = drawn;
  const set = () => { U.uPxK.value = pxK(); };
  set(); addEventListener('resize', set);
}
