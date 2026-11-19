// The canvas's size, by the output (src/core/budget.js OUTPUT): what every view is laid on (src/core/screen.js), and
// what the governor's drawn ratio stays within (src/core/governor.js).
import { OUTPUT } from './budget.js';

/** The canvas's pixel ratio for a window of w × h CSS pixels (the window as it is now): the screen's own, up to two
    pixels a point, and no more pixels in all than OUTPUT has. Its shape is the window's; the browser lays it on the
    screen. A 1990 × 1100 window at a ratio of 2 (a MacBook's): 0.973, a canvas of 1936 × 1070 (it was 3980 × 2200). */
export const outputRatio = (w = globalThis.innerWidth ?? OUTPUT.width, h = globalThis.innerHeight ?? OUTPUT.height) =>
  Math.min(globalThis.devicePixelRatio || 1, 2, Math.sqrt((OUTPUT.width * OUTPUT.height) / Math.max(1, w * h)));
/** The rows the world is drawn at, at the most: the output's own (OUTPUT.height) at the canvas's ratio for the output's
    window (outputRatio: the game's rule, which src/core/screen.js holds its inside to and the governor its drawn ratio
    within, src/core/governor.js), never more than the output has. What the gate draws its stills and its bench at
    (tools/gate.js INSIDE) and what the measure's pixels are counted at (tools/gate/pop.js, the motion's line). */
export const drawnRows = () => Math.min(OUTPUT.height, OUTPUT.height * outputRatio(OUTPUT.width, OUTPUT.height));
