// The picture's colours at the screen's top and bottom edges, for Safari's tab on an iPhone. Safari cannot draw a page
// that does not scroll under its status bar or its toolbar: it paints them from the page (WebKit, LocalFrameView::
// fixedContainerEdges): at each edge, the background colour of the fixed element at the middle of that edge, 4px in, if
// it is about the page's width and more than 10px deep; with none, the page's background (the game's is a light blue).
// So the page gives them the picture's own: the sky's at the top, the ground's at the bottom, read off the frame every
// second and a half (two thin rows, read without waiting on the GPU), carried by a 12px strip at each edge (brand.css
// .os-edge) and by the page's background. Safari reads the colour again only when a fixed element comes or goes, not when
// one changes colour, so the strips are made anew whenever the colours change. Framed by the dashboard, the game tells it
// the colours instead (OS/src/main.js makes its own strips). As a web app on the home screen there are no bars to paint
// (the picture goes under the status bar itself); on a computer, or in another phone's browser, nothing reads the page's
// colours for its bars: nothing is read there.
import { flagText } from '../core/flags.js';
const LOADING = { top: '#242e3c', bottom: '#9c8560' };   // the veil's edges (brand.css html.os-loading), as an iPhone shows them
const EVERY = 1500;   // ms between reads
const root = document.documentElement;
const own = parent === window;   // the whole window, with strips of its own
const whole = own || flagText('in') === 'os';   // or the dashboard's frame; not a picture in a page (?embed, a film's player)
const wanted = whole && navigator.standalone === false && matchMedia('(pointer: coarse)').matches;   // Safari's tab on iOS (navigator.standalone is iOS's own: false in a tab, true in a web app on the home screen)

/** The two strips, made anew (Safari samples the edges again when a fixed element comes or goes). */
function strips() {
  for (const e of document.querySelectorAll('body > .os-edge')) e.remove();
  for (const side of ['t', 'b']) { const e = document.createElement('i'); e.className = `os-edge ${side}`; e.setAttribute('aria-hidden', 'true'); document.body.append(e); }
}
function apply(top, bottom) {
  if (!own) { parent.postMessage({ maia: 1, cmd: 'edges', top, bottom }, '*'); return; }
  root.style.setProperty('--os-edge-t', top); root.style.setProperty('--os-edge-b', bottom);
  root.style.backgroundColor = document.body.style.backgroundColor = top;   // what Safari takes where no strip is (the body's before the root's)
  strips();
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

if (wanted) apply(LOADING.top, LOADING.bottom);   // (every page that draws the world starts under the loading veil: src/ui/loading.js)

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

