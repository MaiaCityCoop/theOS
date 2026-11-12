// The governor: one frame budget, two dials.
//
// Detail. Every range of detail in the world (terrain levels, blades, rocks) is measured in metres
// as the walker's 68° lens sees them. A longer lens shows a thing larger, so the ranges are
// stretched by the lens factor: how many times larger than through 68° a thing shows. Full
// stretch costs about that many times the blades, so the stretch is capped, and the cap moves
// with the frame time: `lod` is what the world is drawn with.
//
// Pixels. The canvas's pixel ratio, between 1 and the screen's; and below 1, the last dial, down to FLOOR: the picture
// a little soft, but never slower than 60 frames a second. 60 fps is the hard gate, the picture's detail the soft one.
//
// What it goes by: the share of frames that missed 60 fps (longer than SLOW ms) since its last look, not their mean:
// a hitch now and then (a pass made again, another program taking the GPU for a moment) is not a slow picture, and
// must not cost it its sharpness. Too slow (more than LATE of the frames late, two looks running: under 55 fps): the
// cap comes down first, then pixels (to 1, then under). A step down in pixels is on trial: if it bought no frames (the
// pixels were not what was slow) it is taken back, and none tried again for a while (longer each time). Room again
// (hardly a frame late, under ROOM): pixels first, then the cap. Nothing is decided while the page is still starting.
export function createGovernor(renderer, { refFov = 68, startCap = 3, maxCap = 16 } = {}) {
  const REF = 1 / Math.tan((refFov * Math.PI) / 360);
  const DPR_MAX = Math.min(window.devicePixelRatio || 1, 2), DPR_MIN = Math.min(1, DPR_MAX), FLOOR = 0.6;   // DPR_MIN: where it starts and comes back to first; FLOOR: how soft it may go to hold 60 fps
  const SLOW = 20, LATE = 0.08, ROOM = 0.02, WARM = 4000;   // a frame longer than SLOW (ms) missed 60 fps; the shares of such frames that are too many, and few enough to try more; ms after the start before the first look
  let dpr = DPR_MIN, resize = false, ceiling = DPR_MAX, ceilingAt = 0;
  let cap = startCap, zoom = 1, lod = 1, ema = 16.7, calm = 0, at = 0;
  let born = -1, n = 0, late = 0, share = 0;   // frames since the last look, how many of them late, and that share
  let trial = null, noPixels = 0, wait = 15000;   // a step down in pixels on trial; until noPixels none is tried (wait: how long, longer each time one fails)
  let held = false, hot = 0, downAt = -1e9;   // a film playing: no turning of the dials, so its frames come out even (it plays the same every time, too)
  renderer.setPixelRatio(dpr);
  return {
    /** Before drawing: a change of pixel ratio empties the canvas, so it is made only here. */
    begin() { if (resize) { renderer.setPixelRatio(dpr); resize = false; } },
    /** The detail factor for this camera, this frame. */
    detail(camera) { zoom = Math.max(1, camera.projectionMatrix.elements[5] / REF); lod = Math.min(zoom, cap); return lod; },
    /** After drawing: the frame's time, and whether a tier ran out of patches. */
    end(ms, now, over) {
      if (ms < 250) { ema += (ms - ema) * 0.08; n++; if (ms > SLOW) late++; }   // a longer gap is the browser holding the page back, not the picture's cost
      if (born < 0) born = now;
      if (document.hidden || held || now - born < WARM) { n = late = 0; return; }   // (a page starting compiles and fills: its slow frames say nothing of the picture's cost)
      if (now - at < 700) return;
      at = now; share = n ? late / n : 0; n = late = 0;
      let next = dpr;
      // a step down in pixels, looked at again: kept only if it bought frames
      if (trial && now >= trial.at) {
        if (share > LATE / 2 && share > trial.share * 0.7) { next = trial.from; ceiling = Math.max(ceiling, next); noPixels = now + wait; wait = Math.min(120000, wait * 2); }
        else wait = 15000;
        trial = null;
      }
      // Calm, so the picture does not change its detail every second: down only when it stays too slow (two looks
      // in a row) or is far too slow; up only after about three seconds of room, never soon after a step down,
      // and by a small step. Every change makes the world choose its patches anew, which itself costs a frame.
      const slow = share > LATE || over, urgent = share > 0.4 || over;
      if (next !== dpr) calm = hot = 0;   // (a step taken back this look: nothing more)
      else if (slow) {
        calm = 0;
        if (urgent || ++hot >= 2) {
          hot = 0; downAt = now;
          if (lod > 1.05) cap = Math.max(1, lod * (urgent ? 0.7 : 0.87));
          else if (share > LATE && dpr > FLOOR && now > noPixels && !trial) {
            next = Math.max(FLOOR, dpr - (urgent ? 0.25 : 0.125)); ceiling = Math.max(FLOOR, next); ceilingAt = now;
            trial = { from: dpr, share, at: now + 1300 };   // two looks on (the first holds the resize's own slow frame)
          }
        }
      } else if (share <= ROOM) {
        hot = 0;
        if (++calm >= 4 && now - downAt > 8000) { calm = 0; if (dpr < Math.min(DPR_MAX, ceiling)) next = Math.min(DPR_MAX, ceiling, dpr + 0.125); else if (cap < zoom) cap = Math.min(maxCap, cap * 1.12); }
      } else { calm = 0; hot = 0; }
      if (now - ceilingAt > 45000) ceiling = DPR_MAX;   // what was too much is not tried again for a while
      if (next !== dpr) { dpr = next; resize = true; n = late = 0; }
    },
    /** Hold the dials where they are (true), or let them move again (false). */
    hold(on) { held = !!on; },
    get ms() { return ema; }, get late() { return share; }, get dpr() { return dpr; }, get lod() { return lod; }, get zoom() { return zoom; }, get cap() { return cap; },
  };
}
