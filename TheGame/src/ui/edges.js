// The picture's colours at the screen's top and bottom edges, for a phone's browser. Safari cannot draw a page that does
// not scroll under its status bar or its toolbar: it paints them with the colour of the fixed thing at that edge of
// the page (here a light blue: the dashboard's frame), or else with the page's background. So the page gives them the
// picture's own: the sky's at the top, the ground's at the bottom, read off the frame every second and a half (two thin
// rows, read without waiting on the GPU), set on the page (its background, and a thin strip at each edge: brand.css
// .os-edge) and told to the dashboard that frames it (OS/src/main.js colours its frame and strips the same).
// As a web app on the home screen there are no bars to paint (the picture goes under the status bar itself), and on a
// computer none either: nothing is read there.
import { flagText } from '../core/flags.js';
const LOADING = { top: '#242e3c', bottom: '#9c8560' };   // the veil's edges (brand.css html.os-loading), as an iPhone shows them
const EVERY = 1500;   // ms between reads
const root = document.documentElement;
const whole = parent === window || flagText('in') === 'os';   // the whole window: not a picture in a page (?embed, a film's player)
const wanted = whole && matchMedia('(pointer: coarse)').matches && !matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

function apply(top, bottom) {
  root.style.setProperty('--os-edge-t', top); root.style.setProperty('--os-edge-b', bottom);
  root.style.backgroundColor = top;   // what Safari takes where no fixed thing stands at the edge
  if (parent !== window) parent.postMessage({ maia: 1, cmd: 'edges', top, bottom }, '*');
}
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 4);
/** The mean colour of RGBA bytes, or null where they are not bytes. */
function mean(px) {
  if (!(px instanceof Uint8Array) || px.length < 4) return null;
  const s = [0, 0, 0]; let n = 0;
  for (let i = 0; i < px.length; i += 16) { s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; n++; }   // every fourth pixel
  return s.map((v) => v / n);
}

if (wanted) {
  for (const side of ['t', 'b']) { const e = document.createElement('i'); e.className = `os-edge ${side}`; document.body.append(e); }
  if (root.classList.contains('os-loading')) apply(LOADING.top, LOADING.bottom);
}

/** After each frame: now and then, the top and bottom rows of what the world drew (the screen's own target), set as
 * the edges' colours. A no-op where nothing needs them. */
export function followEdges(renderer, screen) {
  if (!wanted) return () => {};
  let next = 0, reading = false, last = null;
  return () => {
    const now = performance.now();
    if (reading || now < next || document.hidden || root.classList.contains('os-loading')) return;
    const rt = screen.target; if (!rt || rt.height < 4) return;
    next = now + EVERY; reading = true;
    const x = Math.round(rt.width * 0.2), w = Math.max(1, Math.round(rt.width * 0.6));   // the middle: no vignette, no corner
    Promise.all([renderer.readRenderTargetPixelsAsync(rt, x, 0, w, 2), renderer.readRenderTargetPixelsAsync(rt, x, rt.height - 2, w, 2)])
      .then(([a, b]) => {
        const first = mean(a), lastRow = mean(b); if (!first || !lastRow) { next = now + 60000; return; }
        const [top, bottom] = renderer.backend.isWebGPUBackend ? [first, lastRow] : [lastRow, first];   // WebGPU's rows run from the top, WebGL's from the bottom
        if (last && near(top, last[0]) && near(bottom, last[1])) return;
        last = [top, bottom]; apply(hex(top), hex(bottom));
      })
      .catch(() => { next = now + 60000; })   // a backend that cannot read it: not again for a minute
      .finally(() => { reading = false; });
  };
}

