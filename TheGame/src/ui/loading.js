// The world, loading: the veil every page that draws the world shows from its first paint (brand.css, html.os-loading),
// told what is being made and how far along; gone, faded into the sky, once the first frame is drawn. A page that lost a
// file of its build keeps it, saying so (html.os-lost: brand/loading.js).
import { aboutTo } from '../core/journal.js';

const root = document.documentElement;
if (!root.classList.contains('os-loading')) root.classList.add('os-loading');
const lost = () => root.classList.contains('os-lost');

/** The line under the veil's step that says what is being made now (brand.css #os-detail), made once it is first said. */
let detailLine = null;
const detailOf = () => { if (!detailLine) { detailLine = document.createElement('div'); detailLine.id = 'os-detail'; document.body.append(detailLine); } return detailLine; };
/** What is being made (text: its phase), how far along the whole start is (0..1), how many of its parts are made
    (count: '306 / 395'; none: the line left empty) and which it makes now (detail: a quiet line under the veil's line
    of how far), said at once (not on a page that lost a file: it says that). */
export function loadingSay(text, share, { count = '', detail = '' } = {}) {
  if (lost()) return;
  if (document.body.dataset.step !== text) aboutTo(`the start: ${text}`);   // (each phase begun, in the journal: src/core/journal.js)
  document.body.dataset.step = text; document.body.dataset.count = count; root.style.setProperty('--os-load', `${Math.round(share * 100)}%`);
  if (detail || detailLine) detailOf().textContent = detail;
}
/** The same, then a frame waited for (or, hidden, a moment), so the page shows it. */
export function loadingStep(text, share) {
  loadingSay(text, share);
  return new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 60); });   // a hidden page has no frames: on regardless
}
/** What the last start reached, where it was killed (src/core/lastrun.js): a quiet line on the veil, under its own. */
export function loadingLast(text) { if (lost() || !text) return; const el = document.createElement('div'); el.id = 'os-last'; el.textContent = text; document.body.append(el); }
/** The world is drawn: the veil fades away. */
export function loadingDone() {
  if (lost()) return;
  root.style.setProperty('--os-load', '100%'); root.classList.add('os-loaded');
  setTimeout(() => { if (lost()) return; root.classList.remove('os-loading', 'os-loaded'); delete document.body.dataset.step; delete document.body.dataset.count; detailLine?.remove(); detailLine = null; document.getElementById('os-last')?.remove(); }, 950);
}
