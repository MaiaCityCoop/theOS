// The world, loading: the veil every page that draws the world shows from its first paint (brand.css, html.os-loading),
// told what is being made and how far along; gone, faded into the sky, once the first frame is drawn.
const root = document.documentElement;
if (!root.classList.contains('os-loading')) root.classList.add('os-loading');

/** What is being made now, and how far along the whole start is (0..1). Waits a frame (or, hidden, a moment), so the page shows it. */
export function loadingStep(text, share) {
  document.body.dataset.step = text; root.style.setProperty('--os-load', `${Math.round(share * 100)}%`);
  return new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 60); });   // a hidden page has no frames: on regardless
}
/** The world is drawn: the veil fades away. */
export function loadingDone() {
  root.style.setProperty('--os-load', '100%'); root.classList.add('os-loaded');
  setTimeout(() => { root.classList.remove('os-loading', 'os-loaded'); delete document.body.dataset.step; }, 950);
}
