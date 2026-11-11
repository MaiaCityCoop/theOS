// The governor: one frame budget, two dials.
//
// Detail. Every range of detail in the world (terrain levels, blades, rocks) is measured in metres
// as the walker's 68° lens sees them. A longer lens shows a thing larger, so the ranges are
// stretched by the lens factor: how many times larger than through 68° a thing shows. Full
// stretch costs about that many times the blades, so the stretch is capped, and the cap moves
// with the frame time: `lod` is what the world is drawn with.
//
// Pixels. The canvas's pixel ratio, between 1 and the screen's.
//
// Too slow: the cap comes down first, then pixels. Room again: pixels first, then the cap.
export function createGovernor(renderer, { refFov = 68, startCap = 3, maxCap = 16 } = {}) {
  const REF = 1 / Math.tan((refFov * Math.PI) / 360);
  const DPR_MAX = Math.min(window.devicePixelRatio || 1, 2), DPR_MIN = Math.min(1, DPR_MAX);   // under 1 the picture only blurs
  let dpr = Math.min(DPR_MAX, 1.5), resize = false, ceiling = DPR_MAX, ceilingAt = 0;
  let cap = startCap, zoom = 1, lod = 1, ema = 16.7, calm = 0, at = 0;
  let held = false, hot = 0, downAt = -1e9;   // a film playing: no turning of the dials, so its frames come out even (it plays the same every time, too)
  renderer.setPixelRatio(dpr);
  return {
    /** Before drawing: a change of pixel ratio empties the canvas, so it is made only here. */
    begin() { if (resize) { renderer.setPixelRatio(dpr); resize = false; } },
    /** The detail factor for this camera, this frame. */
    detail(camera) { zoom = Math.max(1, camera.projectionMatrix.elements[5] / REF); lod = Math.min(zoom, cap); return lod; },
    /** After drawing: the frame's time, and whether a tier ran out of patches. */
    end(ms, now, over) {
      if (ms < 250) ema += (ms - ema) * 0.08;   // a longer gap is the browser holding the page back, not the picture's cost
      if (now - at < 700 || document.hidden || held) return;
      at = now;
      // Calm, so the picture does not change its detail every second: down only when it stays too slow (two looks
      // in a row) or is far too slow; up only after about three seconds of room, never soon after a step down,
      // and by a small step. Every change makes the world choose its patches anew, which itself costs a frame.
      let next = dpr;
      const slow = ema > 18.6 || over, urgent = ema > 24 || over;
      if (slow) {
        calm = 0;
        if (urgent || ++hot >= 2) {
          hot = 0; downAt = now;
          if (lod > 1.05) cap = Math.max(1, lod * (urgent ? 0.7 : 0.87));
          else if (ema > 18.6) { next = Math.max(DPR_MIN, dpr - (ema > 24 ? 0.25 : 0.125)); ceiling = Math.max(DPR_MIN, next); ceilingAt = now; }
        }
      } else if (ema < 16.9) {
        hot = 0;
        if (++calm >= 4 && now - downAt > 8000) { calm = 0; if (dpr < Math.min(DPR_MAX, ceiling)) next = Math.min(DPR_MAX, ceiling, dpr + 0.125); else if (cap < zoom) cap = Math.min(maxCap, cap * 1.12); }
      } else { calm = 0; hot = 0; }
      if (now - ceilingAt > 20000) ceiling = DPR_MAX;
      if (next !== dpr) { dpr = next; resize = true; ema = 16.7; }
    },
    /** Hold the dials where they are (true), or let them move again (false). */
    hold(on) { held = !!on; },
    get ms() { return ema; }, get dpr() { return dpr; }, get lod() { return lod; }, get zoom() { return zoom; }, get cap() { return cap; },
  };
}
