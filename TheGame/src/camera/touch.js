// Fingers for the one camera (intent 0003): a joystick at the bottom left walks or moves it; one finger elsewhere turns
// it (and tilts it up and down, at every height); two fingers pinch it up and down and turn it. The numbers are in
// camera/touch.js. It hands the rig the same things the keys and the mouse do: a move, a turn and look, a change of height.
import TOUCH from '../../camera/touch.js';

export function createTouch(canvas, { look, height }) {
  const move = { x: 0, y: 0, run: false };
  let stick = null, el = null, knob = null;
  const pts = new Map();   // the fingers on the picture, not on the stick
  let pinch0 = null;
  function build() {   // the joystick appears with the first touch: a mouse never sees it
    if (el) return;
    const S = TOUCH.stick;
    el = document.createElement('div'); el.className = 'os-stick glass'; el.style.cssText = `width:${S.size}px;height:${S.size}px;left:calc(var(--edge) + ${S.margin}px);bottom:calc(var(--edge-b) + var(--pill-h) + 12px + ${S.margin}px)`;
    knob = document.createElement('i'); knob.style.cssText = `width:${S.knob}px;height:${S.knob}px`; el.append(knob); document.body.append(el);
    el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch {} stick = { id: e.pointerId }; drive(e); });
    el.addEventListener('pointermove', (e) => { if (stick?.id === e.pointerId) drive(e); });
    const up = (e) => { if (stick?.id !== e.pointerId) return; stick = null; move.x = move.y = 0; move.run = false; knob.style.transform = ''; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function drive(e) {
    const S = TOUCH.stick, r = el.getBoundingClientRect(), R = S.size / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const d = Math.hypot(dx, dy), k = d > R ? R / d : 1; dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, d / R), a = m < S.dead ? 0 : (m - S.dead) / (1 - S.dead), n = d || 1;
    move.x = (dx / n) * a; move.y = (-dy / n) * a; move.run = m > S.run;
  }
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    build(); try { canvas.setPointerCapture(e.pointerId); } catch {} pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), t: Math.atan2(b.y - a.y, b.x - a.x) }; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) look(dx * TOUCH.look.speed, dy * TOUCH.look.speed);
    else if (pts.size === 2 && pinch0) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), t = Math.atan2(b.y - a.y, b.x - a.x);
      height(-Math.log2(d / pinch0.d) * TOUCH.pinch.speed * Math.LN2);   // spread: down; pinch: up
      let dt = t - pinch0.t; dt = Math.atan2(Math.sin(dt), Math.cos(dt)); look(-dt * TOUCH.pinch.turn, 0, true);
      pinch0 = { d, t };
    }
  });
  const lift = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
  canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
  return { move };
}
