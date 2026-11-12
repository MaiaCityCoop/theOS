// The weather panel: one pill at the top centre (beside the page's own nav, if it has one) that reads the time and the
// wind, and opens into a card to set them: the hour with Auto, the wind from calm to a storm. Closed by default. The same
// on every viewer (the walk, the library, the lenses); a film sets its own weather per shot, so it shows none.
const shown = () => !/timeline\.html$/.test(location.pathname) && !new URLSearchParams(location.search).has('embed');
let panel = null;

function build() {
  const bar = document.createElement('div'); bar.className = 'os-topbar';
  const nav = document.querySelector('.os-top'); if (nav) bar.append(nav);   // the page's own nav joins the row
  const el = document.createElement('div'); el.className = 'os-weather';
  el.innerHTML = '<button type="button" class="os-weather-pill glass" aria-expanded="false" aria-label="Weather"><span></span><i aria-hidden="true">▾</i></button><div class="os-weather-card glass" hidden></div>';
  bar.append(el); document.body.append(bar); document.body.classList.add('has-weather');
  const pill = el.querySelector('button'), card = el.querySelector('.os-weather-card'), sum = pill.querySelector('span');
  pill.addEventListener('click', () => { const open = card.hidden; card.hidden = !open; pill.setAttribute('aria-expanded', String(open)); });
  for (const e of ['pointerdown', 'wheel', 'keydown']) el.addEventListener(e, (ev) => ev.stopPropagation());   // the camera does not take what the panel does
  const parts = [];
  return { card, summary: () => (sum.textContent = parts.map((p) => p()).filter(Boolean).join(' · ')), parts };
}

/** A row of the panel: { label, min, max, step, value, read(v) -> text, input(v), button: { text, click } } -> { set(v), button(text, on) }, or null where no panel is shown. */
export function weatherRow({ label, min, max, step, value, read, input, button }) {
  if (!shown()) return null;
  panel ||= build();
  const row = document.createElement('label'); row.className = 'os-weather-row';
  row.innerHTML = `<span class="g-label">${label}</span><b></b><input type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}">${button ? '<button type="button" class="g-btn quiet"></button>' : ''}`;
  panel.card.append(row);
  const out = row.querySelector('b'), range = row.querySelector('input'), btn = row.querySelector('button');
  let now = value; panel.parts.push(() => read(now));
  range.addEventListener('input', () => { now = +range.value; input(now); out.textContent = read(now); panel.summary(); });
  if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); button.click(); });
  const r = {
    set(v) { now = v; out.textContent = read(v); if (document.activeElement !== range) range.value = v; panel.summary(); },
    button(text, on) { if (btn) { btn.textContent = text; btn.classList.toggle('quiet', !on); } },
  };
  r.set(value); if (button) r.button(button.text, false);
  return r;
}
