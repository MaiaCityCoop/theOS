// The governor: one frame budget, two dials.
//
// Detail. Every range of detail in the world (terrain levels, blades, rocks) is measured in metres
// as the walker's 68° lens sees them. A longer lens shows a thing larger, so the ranges are
// stretched by the lens factor: how many times larger than through 68° a thing shows. Full
// stretch costs about that many times the blades, so the stretch is capped, and the cap moves
// with the frame time: `lod` is what the world is drawn with.
//
// Pixels. The pixel ratio the world is drawn at (in the game: inside, then laid on the screen at the screen's own
// resolution, which is never given up: src/core/screen.js), between 1 and the screen's; and below 1, the last dial,
// down to FLOOR: the picture a little soft, but never slower than 60 frames a second. 60 fps is the hard gate, the picture's detail the soft one.
//
// What it goes by, since its last look: the share of frames that missed 60 fps by far (longer than SLOW ms), and the
// mean of all its frames but the worst (MEAN ms: a screen that shows a frame whenever it is ready runs every frame a
// little late, at 52 fps with none of them longer than SLOW). A hitch now and then (a pass made again, another
// program taking the GPU for a moment) is neither, and must not cost the picture its sharpness. Too slow (more than LATE of the frames late, three looks running: under 55 fps; two
// when most frames are late): the cap comes down first, then pixels (to 1, then under). A step down in pixels is on
// trial: if it bought no frames (the pixels were not what was slow) it is taken back, and none tried again for a while
// (longer each time). Room again (hardly a frame late, under ROOM): pixels first, then the cap. Nothing is decided
// while the page is still starting.
//
// Pixels over the screen's own points (a ratio above 1) are a luxury, and the first thing given back: a step at the
// first look that is too slow, not on trial (fewer of them is always right). Whether they fit can only be found by
// trying (a screen shows no more than its 60 frames, however much room there is): a ratio that proves too much right
// after it was tried is left alone for a while, longer each time; one that had held and then grew slow (the picture
// got heavier) is tried again soon.
//
// Under the screen's own points pixels are given up only for what fewer pixels can mend: the usual frame too long
// (the middle one of a look, MEAN ms), most frames late, or frames late look after look (STREAK of them). A frame
// dropped now and then is none of these: read in Samuel's Safari on 2026-11-13, a walk dropped one frame in sixteen
// at a ratio of 1 and just as many at 0.625 (the cause was not the pixels), and the ratio had gone to the floor for
// them and stayed there. And the way back up to the screen's own points allows a dropped frame or two a look, and is
// tried ten seconds after a step down (read on 2026-11-14: his picture sat under the screen's points in half his rows,
// a minute at a time after something else had used the GPU for seconds).
export function createGovernor(renderer, { refFov = 68, startCap = 3, maxCap = 16, apply = (r) => renderer.setPixelRatio(r) } = {}) {   // apply: what takes the pixel ratio it decides (the game: the inside's, src/core/screen.js; the screen keeps its own)
  const REF = 1 / Math.tan((refFov * Math.PI) / 360);
  const DPR_MAX = Math.min(window.devicePixelRatio || 1, 2), DPR_MIN = Math.min(1, DPR_MAX), FLOOR = 0.6;   // DPR_MIN: where it starts and comes back to first; FLOOR: how soft it may go to hold 60 fps
  const SLOW = 20, LATE = 0.08, ROOM = 0.02, MEAN = 17.5, WARM = 4000, MOST = 0.35, STREAK = 6, EASY = 0.05;   // a frame longer than SLOW (ms) missed 60 fps by far; the shares of such frames that are too many, and few enough to try more; the mean frame (ms) that is under 57 fps; ms after the start before the first look
  let dpr = DPR_MIN, resize = false, ceiling = DPR_MAX, ceilingAt = 0, hold = 45000;   // ceiling: the ratio not gone over for `hold` ms from ceilingAt
  let upAt = -1e9, probe = 45000, probeAt = -1e9, low = 10000;   // (low: how long a ratio under the screen's own points is not gone over again after a step down: short, longer each time the way back up proved too much)   // when the ratio was last raised; how long a ratio that proved too much right after is left alone (longer each time), and when one last did
  let cap = startCap, zoom = 1, lod = 1, ema = 16.7, calm = 0, at = 0;
  const times = new Float32Array(160); let tn = 0, mid = 16.7, streak = 0, midAvg = 16.7, lateAvg = 0;   // (midAvg, lateAvg: the middle frame and the late share over the last few seconds: what one look hides when frames lie at the edge of 60)   // a look's frame times, the middle one of them, and how many looks running had too many late frames
  let born = -1, n = 0, late = 0, share = 0, sum = 0, worst = 0, mean = 16.7;   // frames since the last look, how many of them late, that share; their times' sum and the worst, the mean without it   // frames since the last look, how many of them late, and that share
  let nb = 0, trial = null, noPixels = 0, wait = 15000;   // (nb: frames since the last look that were busy with something besides drawing)   // a step down in pixels on trial; until noPixels none is tried (wait: how long, longer each time one fails)
  let held = false, hot = 0, downAt = -1e9;   // a film playing: no turning of the dials, so its frames come out even (it plays the same every time, too)
  apply(dpr);
  return {
    /** Before drawing: a change of pixel ratio empties the canvas, so it is made only here. */
    begin() { if (resize) { apply(dpr); resize = false; } },
    /** The detail factor for this camera, this frame. */
    detail(camera) { zoom = Math.max(1, camera.projectionMatrix.elements[5] / REF); lod = Math.min(zoom, cap); return lod; },
    /** After drawing: the frame's time, and whether a tier ran out of patches. */
    end(ms, now, over, busy = false) {
      // (a frame that packed tiers again or put meshes on the GPU is long for that, not for its pixels: not counted. Read
      // in his Safari on 2026-11-14: a walk took the ratio from 1 to 0.625 and was no smoother for it)
      if (busy && ms < 250) nb++;
      if (ms < 250 && !busy) { ema += (ms - ema) * 0.08; n++; sum += ms; if (ms > worst) worst = ms; if (ms > SLOW) late++; if (tn < times.length) times[tn++] = ms; }   // a longer gap is the browser holding the page back, not the picture's cost
      if (born < 0) born = now;
      if (document.hidden || held || now - born < WARM) { n = late = sum = worst = tn = 0; return; }   // (a page starting compiles and fills: its slow frames say nothing of the picture's cost)
      if (now - at < 700 || (n < 8 && now - at < 3000)) return;   // (a look needs frames to go by: while most are busy, a longer one)
      const busyShare = nb / Math.max(1, n + nb); nb = 0;   // how much of the look the stand was taking things in (the camera travelling)
      at = now; share = n ? late / n : 0; mean = n > 2 ? (sum - worst) / (n - 1) : 16.7; mid = tn > 4 ? times.subarray(0, tn).sort()[tn >> 1] : 16.7; streak = share > LATE ? streak + 1 : 0; n = late = sum = worst = tn = 0;
      midAvg += (mid - midAvg) * 0.25; lateAvg += (share - lateAvg) * 0.25; if (trial) { trial.n++; trial.lates += share; trial.mids += mid; }
      let next = dpr;
      // a step down in pixels, looked at again: kept only if it bought frames
      // (taken back when what was slow, the late frames or every frame a little, is as slow as before)
      if (trial && now >= trial.at) {
        // (by the looks since the step, taken together: one look of frames at the edge of 60 says little)
        const sh = trial.lates / Math.max(1, trial.n), md = trial.mids / Math.max(1, trial.n);
        if ((trial.share > LATE && sh > LATE / 2 && sh > trial.share * 0.7 && md > trial.mean - 0.5) || (trial.mean > MEAN - 0.3 && md > MEAN - 0.3 && md > trial.mean - 0.5 && sh > trial.share * 0.7)) { next = trial.from; ceiling = Math.max(ceiling, next); noPixels = now + wait; wait = Math.min(120000, wait * 2); }
        else wait = 15000;
        trial = null;
      }
      // Calm, so the picture does not change its detail every second: down only when it stays too slow (two looks
      // in a row) or is far too slow; up only after about three seconds of room, never soon after a step down,
      // and by a small step. Every change makes the world choose its patches anew, which itself costs a frame.
      // (dragging: what fewer pixels or less detail can mend; a frame dropped now and then is not)
      // (and frames that lie at the edge of 60 for seconds, a look over and a look under: read in his Safari on
      // 2026-11-14, forty seconds at 48 to 56 fps with the ratio never moved, no three looks running being slow)
      const edge = midAvg > MEAN - 0.3 || (lateAvg > 0.15 && midAvg > 17), dragging = mid > MEAN || share > MOST || streak >= STREAK || edge, slow = dragging || over, urgent = share > 0.4 || mid > 22 || over;
      if (next !== dpr) calm = hot = 0;   // (a step taken back this look: nothing more)
      // Travelling: most frames busy with what comes into view. Pixels over the screen's own points are a luxury then:
      // given back a notch a look (two when nearly every frame is busy), and none tried, till it has passed. (Read in
      // his Safari on 2026-11-14: the ratio had climbed to 1.6 on a fast flight and the frames fell to 43 a second.)
      else if (busyShare > 0.5 && dpr > DPR_MIN) { next = Math.max(DPR_MIN, dpr - (busyShare > 0.75 ? 0.25 : 0.125)); calm = hot = 0; downAt = now; }
      else if (busyShare > 0.25 && !(mid > MEAN || share > MOST)) { calm = 0; hot = 0; }   // (some of it: nothing tried, nothing given up)
      else if ((share > LATE || mean > MEAN) && dpr > DPR_MIN) {
        // pixels over the screen's own: given back at once, a step a look (two when most frames are late). Slow right
        // after a step up: that step was too much, and is left alone for a while, longer each time. Slow at a ratio
        // that had held: the picture got heavier (a walk into a thicker stand, a burst of new things), tried again soon
        calm = hot = 0; downAt = now;
        next = Math.max(DPR_MIN, dpr - (share > 0.4 ? 0.25 : 0.125));
        if (now - upAt < 4000) { probe = now - probeAt < probe + 30000 ? Math.min(300000, probe * 2) : 45000; probeAt = now; hold = probe; } else hold = 10000;
        ceiling = next; ceilingAt = now;
      } else if (slow) {
        calm = 0;
        if (++hot >= (urgent ? 2 : 3)) {   // (two looks even when far too slow: a jump of the view, a film's cut, is a burst of late frames, not a slow picture)
          hot = 0; downAt = now;
          if (lod > 1.05) cap = Math.max(1, lod * (urgent ? 0.7 : 0.87));
          else if (dragging && dpr > FLOOR && now > noPixels && !trial) {
            // (under the screen's own points the picture is soft, so the way back is tried soon: ten seconds on. Slow
            // again right after a step up: that step was too much here, and is left alone twice as long each time, up to
            // two minutes. So what took the GPU for a while (another program, another tab) costs the sharpness seconds,
            // not a minute, and a heavy place does not swing between two ratios)
            low = now - upAt < 6000 ? Math.min(120000, low * 2) : 10000;
            next = Math.max(FLOOR, dpr - (urgent ? 0.25 : 0.125)); ceiling = Math.max(FLOOR, next); ceilingAt = now; hold = low;
            trial = { from: dpr, share: Math.max(share, lateAvg), mean: Math.max(mid, midAvg), at: now + 2700, n: -1, lates: 0, mids: 0 };   // four looks on, the first not counted (it holds the resize's own slow frame)
            midAvg = Math.min(midAvg, MEAN - 0.4); lateAvg = Math.min(lateAvg, 0.1);   // (what the seconds before the step said is not held against the new ratio)
          }
        }
      } else if (share <= EASY && mid < MEAN - 0.4 && midAvg < MEAN - 0.4) {   // (room: the usual frame in time, a dropped frame or two a look allowed)
        hot = 0;
        if (++calm >= (dpr >= DPR_MIN ? 6 : 4) && now - downAt > 8000) { calm = 0; if (dpr < Math.min(DPR_MAX, ceiling)) { next = Math.min(DPR_MAX, ceiling, dpr + 0.125); upAt = now; } else if (cap < zoom) cap = Math.min(maxCap, cap * 1.12); }
      } else { calm = 0; hot = 0; }
      if (now - ceilingAt > hold) ceiling = DPR_MAX;   // what was too much is not tried again for a while
      if (next !== dpr) { dpr = next; resize = true; n = late = sum = worst = tn = 0; }
    },
    /** Hold the dials where they are (true), or let them move again (false). */
    hold(on) { held = !!on; },
    get ms() { return ema; }, get late() { return share; }, get mid() { return mid; }, get dpr() { return dpr; }, get lod() { return lod; }, get zoom() { return zoom; }, get cap() { return cap; },
  };
}
