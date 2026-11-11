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
  renderer.setPixelRatio(dpr);
  return {
    /** Before drawing: a change of pixel ratio empties the canvas, so it is made only here. */
    begin() { if (resize) { renderer.setPixelRatio(dpr); resize = false; } },
    /** The detail factor for this camera, this frame. */
    detail(camera) { zoom = Math.max(1, camera.projectionMatrix.elements[5] / REF); lod = Math.min(zoom, cap); return lod; },
    /** After drawing: the frame's time, and whether a tier ran out of patches. */
    end(ms, now, over) {
      if (ms < 250) ema += (ms - ema) * 0.08;   // a longer gap is the browser holding the page back, not the picture's cost
      if (now - at < 700 || document.hidden) return;
      at = now;
      let next = dpr;
      if (ema > 18.6 || over) {
        if (lod > 1.05) cap = Math.max(1, lod * (ema > 24 || over ? 0.7 : 0.87));
        else if (ema > 18.6) { next = Math.max(DPR_MIN, dpr - (ema > 24 ? 0.25 : 0.125)); ceiling = Math.max(DPR_MIN, next); ceilingAt = now; }
        calm = 0;
      } else if (ema < 17.3) {
        if (++calm >= 2) { calm = 0; if (dpr < Math.min(DPR_MAX, ceiling)) next = Math.min(DPR_MAX, ceiling, dpr + 0.125); else if (cap < zoom) cap = Math.min(maxCap, cap * 1.25); }
      } else calm = 0;
      if (now - ceilingAt > 20000) ceiling = DPR_MAX;
      if (next !== dpr) { dpr = next; resize = true; ema = 16.7; }
    },
    get ms() { return ema; }, get dpr() { return dpr; }, get lod() { return lod; }, get zoom() { return zoom; }, get cap() { return cap; },
  };
}
