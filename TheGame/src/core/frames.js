// Where each frame's time went on the page's thread (intent 0038, 2026-11-19: WebKit has no profiler of the page's
// thread, and a stall of it showed to the gate only as submissions done late with no pass in them: of 315-403 ms every
// 0.4 s, 15-25 s past ready, the master's check of 969339e). The one frame loop (src/boot.js frame) begins and ends
// each frame here, and says which of its parts it is in as it goes (enter): the systems' updates by their own names,
// and what it encodes by the passes' names (src/core/gpu.js mark: pass), so a pass's time on the page's thread is named
// as its time on the GPU is. A frame's length is from its begin to the next one's; what lies between its end and the
// next begin is outside it: the page's other work (a worker's message, what an await resumes, a timer, the browser's
// own) and the wait for the screen. The slowest second's worth of frames (FPS of them) since the last take are kept,
// part by part, in typed arrays: no allocation a frame (only when a part is first named), a performance.now() a part.
// A measure, never a dial: nothing of the look reads it.
//
//   part(name)    a part's index, by its name (made the first time it is asked)
//   begin()       a frame begins (and the one before is weighed: kept, where it is among the slowest)
//   enter(k)      the frame goes on in the loop's part k
//   pass(name)    a pass named so begins (null: it ends, the frame back in the loop's part it was in)
//   end()         the frame ends
//   now()         the frame so far, { part: ms } (the hitch log's: src/boot.js)
//   take()        the frames since the last take: { frames (how many), long (how many longer than TASK_MS), slow (the
//                 slowest, slowest first: { at, ms, own, outside (ms), parts: [[name, ms]], largest first }) }; and anew
import { FPS, TASK_MS } from './budget.js';

const NAMES = ['the rest'], INDEX = new Map([['the rest', 0]]), LEN = new Float64Array(FPS), BEGAN = new Float64Array(FPS), OWN = new Float64Array(FPS), OUT = new Float64Array(FPS);
let NOW = new Float64Array(NAMES.length), KEPT = new Float64Array(FPS * NAMES.length);
let kept = 0, frames = 0, long = 0, began = 0, ended = -1, at = 0, cur = 0, loop = 0, inFrame = false;

/** A part's index, by its name: a new one widens the tables (the one allocation, once a name). */
export function part(name) {
  let k = INDEX.get(name);
  if (k !== undefined) return k;
  k = NAMES.push(name) - 1; INDEX.set(name, k);
  const was = KEPT, w = NAMES.length; NOW = Float64Array.from({ length: w }, (_, j) => NOW[j] ?? 0); KEPT = new Float64Array(FPS * w);
  for (let s = 0; s < kept; s++) for (let j = 0; j < w - 1; j++) KEPT[s * w + j] = was[s * (w - 1) + j];
  return k;
}
/** The time since the frame last changed part was the part it was in; it goes on in part k. */
const go = (k) => { if (!inFrame) return; const t = performance.now(); NOW[cur] += t - at; at = t; cur = k; };
/** A frame begins; the one before, now whole (its length: to this begin), kept where it is among the slowest. */
export function begin() {
  const t = performance.now();
  if (ended >= began) weigh(t);   // (a frame that threw before its end is not weighed)
  NOW.fill(0); began = at = t; cur = loop = 0; inFrame = true;
}
function weigh(t) {
  const ms = t - began; frames++; if (ms > TASK_MS) long++;
  let s = kept;
  if (kept < FPS) kept++;
  else { s = 0; for (let j = 1; j < FPS; j++) if (LEN[j] < LEN[s]) s = j; if (LEN[s] >= ms) return; }
  LEN[s] = ms; BEGAN[s] = began; OWN[s] = ended - began; OUT[s] = t - ended; KEPT.set(NOW, s * NAMES.length);
}
/** The frame goes on in the loop's part k (src/boot.js). */
export const enter = (k) => { loop = k; go(k); };
/** A pass named `name` begins (src/core/gpu.js mark); null: it ends, and the frame is back in the loop's part. */
export const pass = (name) => go(name ? part(name) : loop);
/** The frame ends. */
export const end = () => { go(0); inFrame = false; ended = at; };
const r2 = (v) => +v.toFixed(2);
/** The frame so far: each part's ms where it took any. */
export const now = () => Object.fromEntries(NAMES.map((n, k) => [n, r2(NOW[k] + (k === cur && inFrame ? performance.now() - at : 0))]).filter(([, ms]) => ms > 0));
/** The frames since the last take (above), and begin anew. */
export function take() {
  const w = NAMES.length, order = Array.from({ length: kept }, (_, s) => s).sort((a, b) => LEN[b] - LEN[a]);
  const out = { frames, long, slow: order.map((s) => ({ at: Math.round(BEGAN[s]), ms: r2(LEN[s]), own: r2(OWN[s]), outside: r2(OUT[s]), parts: NAMES.map((n, k) => [n, r2(KEPT[s * w + k])]).filter(([, ms]) => ms > 0).sort((a, b) => b[1] - a[1]) })) };
  kept = frames = long = 0;
  return out;
}
