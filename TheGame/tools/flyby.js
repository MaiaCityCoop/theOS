// `?flyby`: the game's own camera flown by itself, on a loop, to watch the plants' levels of detail change (intent 0033:
// what pumps, pops or snaps as a plant comes nearer or goes round). Loaded only with ?flyby (src/main.js).
//
//   ?flyby (or ?flyby=zoom)  the rig's one zoom (src/camera/rig.js: the height, from 12 km to the walker's eyes), over a
//                            holm oak at the pine forest's edge, from the top down to eye level NEAR metres before it and
//                            back up, evenly in the height's logarithm (SECS each way, a moment held at each end)
//   ?flyby=orbit             round the same oak, the rig at the height where the oak stands PX pixels tall (`&px=`,
//                            default 60: where a crown's cards give way to its clumps), once in ORBIT seconds
//   &secs=                   the zoom's seconds each way (default 30)
// A line at the top left says where the flight is: the way, the camera's distance from the oak, and how tall the oak
// stands on the screen. Nothing else of the game changes: the picture, the governor and the frame are the game's own.
//
// The oak: one of the pine forest's holm oaks (the stand's packing read back at its edge, 2026-11-17: its foot and its
// height in metres), at the forest's east edge, with the river and the meadow before it to the east: the camera comes
// in from the east, over the water, so for most of the way nothing stands between it and the oak.
import { poseAt } from '../src/camera/rig.js';
import { heightAt } from '../src/world/land.js';
import { flagText, flagNum } from '../src/core/flags.js';
import RIG from '../camera/rig.js';

export const OAK = { x: -1342.09, z: 604.37, height: 12.84 };
const YAW = Math.PI / 2;   // facing west, at the oak (the rig's yaw: it looks along (-sin, -cos))
const NEAR = 10;           // metres east of the oak the walker stands at the end (its crown above the eyes, the whole of its trunk)
const SECS = flagNum('secs', 30), HOLD = 3, ORBIT = 40, PX = flagNum('px', 60);

const smooth = (t) => t * t * (3 - 2 * t);
/** How tall the oak stands on the screen (pixels) seen from a pose. */
function pxOf(P) {
  const g = heightAt(OAK.x, OAK.z), d = Math.hypot(P.pos[0] - OAK.x, P.pos[1] - (g + OAK.height / 2), P.pos[2] - OAK.z);
  return (OAK.height / (2 * d * Math.tan((P.fov * Math.PI) / 360))) * innerHeight;
}
/** The rig's height where the oak, at the rig's point, stands px pixels tall (higher: smaller). */
function heightForPx(px, yaw) {
  let lo = Math.log(RIG.eye * 2), hi = Math.log(RIG.top);
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (pxOf(poseAt(OAK.x, OAK.z, yaw, Math.exp(m))) > px) lo = m; else hi = m; }
  return Math.exp((lo + hi) / 2);
}

export function run() {
  const C = window.__game.controls, mode = flagText('flyby') === 'orbit' ? 'orbit' : 'zoom';
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:12px;top:12px;z-index:99999;background:rgba(255,253,246,0.9);color:#1f2a1c;font:12px/1.4 ui-monospace,Menlo,monospace;padding:6px 10px;border-radius:8px;pointer-events:none';
  document.body.appendChild(label);
  const L0 = Math.log(RIG.eye), L1 = Math.log(RIG.top), cycle = 2 * SECS + 2 * HOLD, t0 = performance.now();
  const hOrbit = mode === 'orbit' ? heightForPx(PX, YAW) : 0;
  let shown = '', held = null;
  // (for stills and films of the flight, frame by frame: window.__flyby.at(seconds) holds it there, at(null) lets it go on)
  window.__flyby = { mode, cycle: mode === 'zoom' ? cycle : ORBIT, at(s) { held = s; } };
  const step = (now) => {
    requestAnimationFrame(step);
    const t = held ?? (now - t0) / 1000;
    let x, z, yaw, h;
    if (mode === 'zoom') {
      const c = t % cycle, q = c < SECS ? 1 - c / SECS : c < SECS + HOLD ? 0 : c < 2 * SECS + HOLD ? (c - SECS - HOLD) / SECS : 1;   // 1 at the top, 0 at the eyes
      yaw = YAW; h = Math.exp(L0 + (L1 - L0) * (q + smooth(q)) / 2);   // (eased only half: the middle heights, where the levels change, not rushed)
      // the rig looks at the point it hangs over: the oak itself, but never nearer than NEAR (low down, where the rig hangs
      // back less than that, the point is before the oak, so the camera stays NEAR off and the oak in view)
      const off = Math.max(0, NEAR - poseAt(OAK.x, OAK.z, yaw, h).back); x = OAK.x + off * Math.sin(yaw); z = OAK.z + off * Math.cos(yaw);
    } else {
      yaw = YAW + ((t % ORBIT) / ORBIT) * Math.PI * 2; x = OAK.x; z = OAK.z; h = hOrbit;
    }
    C.place(x, z, yaw); C.height = h;   // (place puts the rig at the eyes; the height after it)
    const P = poseAt(x, z, yaw, h), d = Math.hypot(P.pos[0] - OAK.x, P.pos[2] - OAK.z, P.pos[1] - heightAt(OAK.x, OAK.z)), px = pxOf(P);
    const txt = `flyby ${mode} · ${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d.toFixed(0) + ' m'} from the oak · oak ${px >= 10 ? px.toFixed(0) : px.toFixed(1)} px tall`;
    if (txt !== shown) { shown = txt; label.textContent = txt; }
  };
  requestAnimationFrame(step);
}
