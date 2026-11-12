// A dial in the top right corner: a value read out, a slider, and a button if it needs one, on one pill of glass.
// Dials stack downwards in the order they are made (the clock first, the wind under it). None on a film's page or a
// picture: a film sets its own hour and weather, the library keeps its own light.
export const dialsShown = () => !/(timeline|library)\.html$/.test(location.pathname) && !new URLSearchParams(location.search).has('embed');

/** { label, min, max, step, value, read(v) -> text, input(v), button: { text, click } } -> { set(v), button(text, on) } or null */
export function createDial({ label, min, max, step, value, read, input, button }) {
  if (!dialsShown()) return null;
  const n = document.querySelectorAll('.os-dial').length, el = document.createElement('div');
  el.className = 'os-dial glass'; el.setAttribute('aria-label', label); el.style.setProperty('--row', n);
  el.innerHTML = `<b></b><input type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}">${button ? '<button type="button" class="g-btn quiet"></button>' : ''}`;
  document.body.append(el); document.body.style.setProperty('--dials', n + 1); document.body.classList.add('has-dials');
  const out = el.querySelector('b'), range = el.querySelector('input'), btn = el.querySelector('button');
  range.addEventListener('input', () => { input(+range.value); out.textContent = read(+range.value); });
  if (btn) btn.addEventListener('click', button.click);
  el.addEventListener('pointerdown', (e) => e.stopPropagation()); el.addEventListener('wheel', (e) => e.stopPropagation());   // the camera does not take what the dial does
  const dial = {
    set(v) { out.textContent = read(v); if (document.activeElement !== range) range.value = v; },
    button(text, on) { if (btn) { btn.textContent = text; btn.classList.toggle('quiet', !on); } },
  };
  dial.set(value); if (button) dial.button(button.text, false);
  return dial;
}
