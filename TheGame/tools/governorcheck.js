// The governor and the measure, on the CPU (intent 0038, 2026-11-19: Samuel's walk unusable from pops, his HUD's detail
// stepping x1.58, x1.10, x1.00 of x1.6 while he stood still, drawn x1.00 of x1.33). What is proved, at the canvases and
// lenses a player has (the output x1, x1.33, x2 the window's points; the lens x1, x1.6, x4 the walker's):
//   - standing still while the page's thread is slow (90 to 290 ms a frame, the GPU's own time 8 ms): no dial moves, so
//     the measure and every tier's bands stay as they are;
//   - a real overload of the GPU (its own time over the frame, the page's thread quick): it steps down only while the
//     GPU's own time is over the frame (once, where one step fits it), and never back up; with room, it steps up only
//     to where the frame still fits, and never back down: no going back and forth;
//   - the measure: the output's rows, so the governor's ratio drawn inside moves no switch, and a window a little larger
//     or smaller neither (it moves only a BAND at a time).
// Exit 1 where any fails.   bun tools/governorcheck.js
import { mock } from './gpu-mock.js';
await mock();
globalThis.document ??= { hidden: false };
const { createGovernor } = await import('../src/core/governor.js');
const M = await import('../src/detail/measure.js');
const { BAND } = await import('../src/detail/error.js');

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** A camera whose lens shows a thing `zoom` times larger than the walker's (its projection's scale: measure.js lensOf;
    the walker's lens's, pixels a metre over a picture two pixels tall). */
const camera = (zoom) => ({ projectionMatrix: { elements: [0, 0, 0, 0, 0, M.pxKAt(2) * zoom] } });

/** A governor run for `seconds` of frames on a canvas of `out` times the window's points through a lens of `zoom`:
    frame(dpr, lod) -> { gpu, js } (ms), judged as the game judges now (its own time on the GPU, the page's thread
    beside it) or as before (the time between frames). Its dials' steps, in turn. */
function run(seconds, frame, now, out, zoom) {
  let ratio = 1;
  const G = createGovernor(null, { apply: (r) => (ratio = r), most: () => out }), cam = camera(zoom), steps = [];
  let t = 0, was = null, first = null;
  while (t < seconds * 1000) {
    G.begin();
    const lod = G.detail(cam), { gpu, js } = frame(ratio, lod), between = Math.max(gpu, js, 1000 / 60);
    t += between;
    if (now) G.end(gpu, t, false, false, js); else G.end(between, t, false, false);
    const at = [+ratio.toFixed(3), +G.lod.toFixed(2)];
    if (was && (at[0] !== was[0] || at[1] !== was[1])) steps.push({ s: +(t / 1000).toFixed(1), at });
    was = at; first ??= at;
  }
  return Object.assign(steps, { first });
}
const show = (steps) => (steps.length ? steps.map((x) => `${x.s} s: pixels x${x.at[0]}, detail x${x.at[1]}`).join('; ') : 'none');
const upward = (steps) => steps.some((x, i) => i > 0 && (x.at[0] > steps[i - 1].at[0] || x.at[1] > steps[i - 1].at[1]));
/** Whether the GPU's own time (heavy, below) is over the frame at a step's dials; whether every step was down and taken
    while it was over, or up and landed where it is not: one way, no going back and forth. */
const overAt = (at) => heavy(...at).gpu > 1000 / 60, down = (a, b) => b[0] <= a[0] && b[1] <= a[1];
const oneWay = (steps) => steps.every((x, i) => { const was = i ? steps[i - 1].at : steps.first; return overAt(was) ? down(was, x.at) : !down(was, x.at) && !overAt(x.at); }) && !(steps.some((x, i) => down(i ? steps[i - 1].at : steps.first, x.at)) && upward(steps));
let failed = false;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed = true; };

// ---- standing still with the page's thread slow (a reband's readbacks and relayouts), and a real GPU overload, whose
// own time grows with the pixels drawn (their square) and the detail's stretch ----
const still = () => ({ gpu: 8, js: 90 + 200 * rand() });
const heavy = (dpr, lod) => ({ gpu: 12 * dpr * dpr * lod, js: 5 });
for (const out of [1, 1.33, 2]) for (const zoom of [1, 1.6, 4]) {
  const s0 = run(60, still, false, out, zoom), s1 = run(60, still, true, out, zoom), h0 = run(180, heavy, false, out, zoom), h1 = run(180, heavy, true, out, zoom);
  console.log(`output x${out}, lens x${zoom}:\n  standing still, 60 s at 90 to 290 ms on the page's thread, 8 ms on the GPU: as before ${s0.length} steps (${show(s0)}); now ${show(s1)}` +
    `\n  a GPU overload, 180 s (12 ms x pixels² x detail on the GPU, 5 ms on the page's thread): as before ${h0.length} steps (${show(h0)}); now ${show(h1)}`);
  check(s1.length === 0, `output x${out}, lens x${zoom}: standing still with the page's thread slow, no dial moves`);
  check(oneWay(h1) && (!overAt(h1.first) || h1.length > 0), `output x${out}, lens x${zoom}: ${overAt(h1.first) ? 'a GPU overload steps down only while it is over the frame' : 'with room, steps up only to where the frame fits'} (${h1.length}), and not back`);
}

// ---- the measure: the output's rows, moved only a BAND at a time ----
let out = 1, fired = 0;
M.keepMeasure(() => out); M.onMeasure(() => fired++);
const rows = () => globalThis.innerHeight * out, k = () => +(M.uPxK.value).toFixed(3);
check(Math.abs(M.uPxK.value - M.pxKAt(rows())) < 1e-9, `the live pixel is the output's rows': ${k()} (pxKAt(${rows()}))`);
for (let i = 0; i < 50; i++) M.measureNow();   // (the governor's ratio inside, stepping: not read)
check(fired === 0, 'the governor\'s ratio drawn inside moves no switch');
const near = [1.2, 1.1, 1.3, 1.2, 1.4, 1.3, 1.45];   // (a window a little larger, then back and forth: within a BAND)
for (const f of near) { out = f; M.measureNow(); }
check(fired === 0, `a window within a BAND (x${near.join(', x')}) moves no switch`);
out = 1.6; M.measureNow();
check(fired === 1 && Math.abs(M.uPxK.value - M.pxKAt(rows())) < 1e-9, `one a BAND larger (x1.6 > x${BAND}) moves them once: ${k()}`);
for (const f of [1.3, 1.5, 1.2, 1.4]) { out = f; M.measureNow(); }
check(fired === 1, 'and back within a BAND of it, not again');
process.exit(failed ? 1 : 0);
