// Your person's card (me.html, intent 0024): who you are, the human kit's own choices (characters/kit/avatar.js), and
// keeping them. Who you are is the game's API's to say (src/account/api.js, GET /api/me); only a citizen may keep a
// person (PUT /api/me/avatar), which the API checks on its own server, whatever this page shows. Nothing here waits for
// the world: the card works while the land is still waking, or where it cannot be drawn at all. What the stage shows
// (stage.js) is said to it as the event `me:person` on document, and kept as window.__mePerson for a stage that comes later.
import { CHOICES, HEIGHTS, LIMITS, TINTED, avatarOf, randomAvatar } from '../../characters/kit/avatar.js';
import { whoAmI, keepAvatar } from '../account/api.js';
import { session, forget } from '../account/session.js';
import { ACCOUNT } from '../account/config.js';

const card = document.getElementById('me');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// what a choice looks like on screen: linear, times the material it tints where it tints one, made sRGB (roughly)
const hex = (c) => '#' + c.map((v) => Math.round(Math.sqrt(Math.min(1, Math.max(0, v))) * 255).toString(16).padStart(2, '0')).join('');
const LOOK = { skin: (v) => v, shoes: (v) => v, hair: (v) => v.map((x, i) => x * TINTED.hair[i]), shirt: (v) => v.map((x, i) => x * TINTED.shirt[i]) };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MOVES = [{ id: 'idle', name: 'Idle' }, { id: 'walk', name: 'Walk' }, { id: 'wave', name: 'Wave' }];   // the kit's moves (characters/kit/human.js)
const LABEL = { skin: 'Skin', hair: 'Hair', shirt: 'Shirt · linen, dyed', shoes: 'Shoes and belt · leather' };

// mode: loading, out (not signed in), again (signed in here, but the API has no session), traveler, citizen, down (no API)
let mode = 'loading', who = null, avatar = randomAvatar(), kept = null, said = '', busy = false, move = 'idle';
const HEAD = {
  loading: ['Your person', 'Asking who you are…', ''],
  out: ['Your person', 'Make your person', 'Sign in with aven.id to make the one you will be in the city.'],
  again: ['Your person', 'Sign in once more', 'You are signed in here, but the game could not open your session. Sign in again and your person can be kept.'],
  traveler: ['Your person · Traveler', 'Who you could be', 'Your own person is for citizens. This is someone you could be: become a citizen at aven.id and make them yours. Just became one? Sign in again so the game knows.'],
  citizen: ['Your person · Citizen', '', 'Your body, your height, your skin and hair, the dye of your shirt and the leather of your shoes. The city knows you by them.'],
  down: ['Your person', 'Your person waits', 'The game’s server cannot be reached right now, so your person cannot be shown or kept. Try again in a moment.'],
};

function show() {
  window.__mePerson = { avatar, name: who?.name || 'You', move };
  document.dispatchEvent(new CustomEvent('me:person', { detail: window.__mePerson }));
}

async function ask() {
  const r = await whoAmI();
  if (r.ok) { who = r.body; mode = who.citizen ? 'citizen' : 'traveler'; if (who.avatar) avatar = kept = avatarOf(who.avatar) ?? avatar; }
  else mode = r.status === 401 ? (session() ? 'again' : 'out') : 'down';
  render(); show();
}

const swatches = (k) => `<div class="sw" role="radiogroup" aria-label="${k}">${CHOICES[k].map((c, i) => `<button type="button" role="radio" aria-checked="${same(c.v, avatar[k])}" class="${same(c.v, avatar[k]) ? 'on' : ''}" data-k="${k}" data-i="${i}" title="${c.name}" aria-label="${c.name}" style="background:${hex(LOOK[k](c.v))}"></button>`).join('')}</div>`;
const nameOf = (k) => CHOICES[k].find((c) => same(c.v, avatar[k]))?.name ?? 'Your own';

function render() {
  const [label, title0, text] = HEAD[mode], title = title0 || esc(who?.name || 'You');
  const can = mode === 'citizen', dirty = !same(avatar, kept), controls = mode !== 'loading' && mode !== 'down';
  card.classList.toggle('locked', !can);
  card.innerHTML = `<header><span class="g-label">${label}</span><h2 class="g-title big">${title}</h2><p class="g-text">${text}</p></header>`
    + (mode === 'out' || mode === 'again' ? `<div class="g-part acts"><button type="button" class="g-btn" data-do="in">Sign in with aven.id</button></div>` : '')
    + (mode === 'traveler' ? `<div class="g-part acts"><a class="g-btn" href="${esc(ACCOUNT.issuer.replace(/\/$/, ''))}/" target="_top">Become a citizen</a><button type="button" class="g-btn quiet" data-do="in">Already one? Sign in again</button><button type="button" class="g-btn quiet" data-do="another">Someone else</button></div>` : '')
    + (controls ? `<div class="g-cell g-part ctl"><span class="g-label">Body</span><div class="row"><button type="button" class="step" data-do="body-" aria-label="The body before">‹</button><b>Body ${avatar.body + 1} of ${LIMITS.body[1] + 1}</b><button type="button" class="step" data-do="body+" aria-label="The next body">›</button></div></div>`
      + `<div class="g-cell g-part ctl"><span class="g-label">Height · ${avatar.height.toFixed(2)} m</span><input type="range" id="height" min="${HEIGHTS.min}" max="${HEIGHTS.max}" step="${HEIGHTS.step}" value="${avatar.height}" aria-label="Height in metres"></div>`
      + Object.keys(LABEL).map((k) => `<div class="g-cell g-part ctl"><span class="g-label">${LABEL[k]} · ${nameOf(k)}</span>${swatches(k)}</div>`).join('')
      + `<div class="g-cell g-part"><span class="g-label">See them move</span><div class="moves">${MOVES.map((m) => `<button type="button" class="g-btn quiet${m.id === move ? ' on' : ''}" data-move="${m.id}">${m.name}</button>`).join('')}</div></div>` : '')
    + (can ? `<div class="g-part acts"><button type="button" class="g-btn" data-do="keep"${dirty && !busy ? '' : ' disabled'}>${busy ? 'Keeping…' : !kept ? 'Keep your person' : dirty ? 'Keep the changes' : 'Kept'}</button><button type="button" class="g-btn quiet" data-do="another">Surprise me</button>${kept && dirty ? '<button type="button" class="g-btn quiet" data-do="undo">As kept</button>' : ''}</div>`
      + `<p class="g-text said">${esc(said || (kept ? (dirty ? 'Not kept yet.' : 'Kept. This is you wherever you sign in.') : 'Not kept yet.'))}</p>` : '');
  // the slider moves the person as it goes; the card is drawn again only when it is let go (so the slider keeps its hold)
  const h = card.querySelector('#height');
  if (h) {
    h.oninput = () => { avatar = { ...avatar, height: +(+h.value).toFixed(2) }; said = ''; h.previousElementSibling.textContent = `Height · ${avatar.height.toFixed(2)} m`; show(); };
    h.onchange = () => render();
  }
}

function change(next) { avatar = avatarOf(next) ?? avatar; said = ''; render(); show(); }
card.addEventListener('click', async (e) => {
  const sw = e.target.closest('[data-k]'), mv = e.target.closest('[data-move]'), b = e.target.closest('[data-do]');
  if (sw) return change({ ...avatar, [sw.dataset.k]: CHOICES[sw.dataset.k][+sw.dataset.i].v });
  if (mv) { move = mv.dataset.move; render(); return show(); }
  if (!b || b.disabled) return;
  const d = b.dataset.do, n = LIMITS.body[1] + 1;
  if (d === 'body-' || d === 'body+') return change({ ...avatar, body: (avatar.body + (d === 'body+' ? 1 : n - 1)) % n });
  if (d === 'another') return change(randomAvatar());
  if (d === 'undo') return change(kept);
  if (d === 'in') { if (session()) forget(); document.querySelector('.account-pill')?.click(); return; }   // the account's pill signs in (src/account/index.js)
  if (d === 'keep') {
    busy = true; render();
    const r = await keepAvatar(avatar);
    busy = false;
    if (r.ok) { kept = avatarOf(r.body.avatar); avatar = kept; said = ''; }
    else if (r.status === 401) mode = session() ? 'again' : 'out';
    else if (r.body?.error === 'citizens_only') mode = 'traveler';
    else said = r.status === 0 ? 'The game’s server could not be reached. Try again.' : `It could not be kept (${r.body?.error || r.status}).`;
    render();
  }
});
addEventListener('beforeunload', (e) => { if (mode === 'citizen' && !same(avatar, kept)) e.preventDefault(); });   // changes not kept: the browser asks first

render(); show(); ask();
