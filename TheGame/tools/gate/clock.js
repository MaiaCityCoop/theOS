// The gate's clock for a page of the game (intent 0038): an init script, run before the page's own, that puts the
// page's frames and its clock under the gate's hand. tools/gate/motion.js steps the paths' frames by it; stills hold a
// page on it between views and tiles, while another run has the GPU (tools/gpu/lock.js).

/** An init script (before the page's own): the page's frames and its clock under the gate's hand, window.__gateClock.
    Off, as the page starts, it runs as it would. On (start()), no frame is drawn until step(t) asks for one, with t as
    its timestamp (what the world's clock, the film camera and the frame's time are reckoned from: src/boot.js), and
    performance.now moves only while a frame is being drawn, so the seconds the gate takes to read a frame back are not
    the page's (the temporal pass lets go of what it kept after 250 ms without a frame: src/core/temporal.js). Nothing is
    drawn between two steps: the page holds the GPU idle, for another run to time its frames. */
export function stepper() {
  const raf = window.requestAnimationFrame.bind(window), real = performance.now.bind(performance);
  let on = false, queue = [], last = 0, skew = 0, base = 0, spent = 0, inFrame = false, at = 0;
  performance.now = () => (on ? base + spent + (inFrame ? real() - at : 0) : real() - skew);
  window.requestAnimationFrame = (cb) => {
    if (on) { queue.push(cb); return 0; }
    return raf((t) => { if (on) queue.push(cb); else { last = t; cb(t); } });   // (a frame asked for before the clock was taken: held for the first step)
  };
  window.__gateClock = {
    get on() { return on; },
    /** The timestamp of the last frame drawn. */
    get last() { return last; },
    start() { if (on) return; base = performance.now(); spent = 0; if (!last) last = real(); on = true; },   // (taken before any frame was drawn: its time now, on the frames' own timeline)
    stop() {
      if (!on) return;
      const now = base + spent; on = false; skew = real() - now;
      const q = queue; queue = []; for (const cb of q) raf((t) => { last = t; cb(t); });
    },
    /** One frame, every callback asked for since the last called with timestamp t: a promise, once it is drawn. */
    step(t) {
      return new Promise((res) => raf(() => {
        const q = queue; queue = []; inFrame = true; at = real(); last = t;
        try { for (const cb of q) { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } } } finally { spent += real() - at; inFrame = false; }
        res();
      }));
    },
  };
}
