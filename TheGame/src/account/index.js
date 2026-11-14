// Sign in with aven.id: a small pill at the top right of the game, on the brand's glass (brand/brand.css: .glass, .g-*).
// Signed out it is the button; signed in it names the person and their role, and opens into a card with Sign out, and
// for a traveler the way to become a citizen (their aven.id account). It stands apart from the world: loaded by its own
// script, it neither waits for the world nor holds it up, and when aven.id cannot be reached the game plays on.
//
// The flow (TheGame/README.md, "Signing in"): here, aven.id's description is read, a state, a nonce and a PKCE verifier
// are made and kept for the round trip, and the tab goes to aven.id; the person signs in there with their passkey;
// aven.id sends them to callback.html (src/account/callback.js), which checks everything and comes back here.
//
// What the role changes is only what the game shows: the game runs in the person's own browser.
import { ACCOUNT } from './config.js';
import { AccountError, random, challengeOf, discover, returnPath } from './oidc.js';
import { session, forget, startTrip, heard } from './session.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ROLE = { traveler: 'Traveler', citizen: 'Citizen' };

// the tab itself: inside the dashboard (a frame of this origin) the whole tab goes to aven.id and comes back, as
// aven.id's page may not be framed; a frame of another origin can only send itself
function tab() { try { if (window.top !== window && window.top.location.origin === location.origin) return window.top; } catch {} return window; }

async function signIn() {
  const issuer = ACCOUNT.issuer, meta = await discover(issuer);
  const state = random(), nonce = random(), verifier = random(), top = tab();
  const back = returnPath(top.location.pathname + top.location.search + top.location.hash, location.origin, { fallback: ACCOUNT.home, callback: ACCOUNT.redirectUri });
  startTrip({ state, nonce, verifier, issuer, redirectUri: ACCOUNT.redirectUri, back });
  const url = new URL(meta.authorization_endpoint);
  for (const [k, v] of Object.entries({ response_type: 'code', client_id: ACCOUNT.clientId, redirect_uri: ACCOUNT.redirectUri, scope: ACCOUNT.scope,
    state, nonce, code_challenge: await challengeOf(verifier), code_challenge_method: 'S256' })) url.searchParams.set(k, v);
  top.location.assign(url.href);
}

function build() {
  const el = document.createElement('div');
  el.className = 'account'; el.setAttribute('aria-label', 'Account');
  el.innerHTML = '<button type="button" class="account-pill glass" aria-expanded="false"></button><div class="account-card glass" hidden role="dialog" aria-label="Account"></div>';
  document.body.append(el);
  const style = document.createElement('style');
  style.textContent = `.account{position:fixed;right:var(--edge);top:var(--edge);z-index:7;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
  body.framed .account{top:88px}   /* inside the dashboard: under its own header, whose Visit button stands at the right */
  body.embed .account{display:none}
  .account-pill{display:flex;align-items:center;gap:8px;height:30px;box-sizing:border-box;padding:0 13px;border-radius:999px;cursor:pointer;font:550 12px/1 var(--glass-font);color:var(--on-glass);white-space:nowrap}
  .account-pill:hover{box-shadow:var(--glass-shadow),inset 0 0 0 99px var(--glass-hover)}
  .account-pill:disabled{cursor:progress}
  .account-pill .role{font:500 11.5px/1 var(--mono);color:var(--on-glass-2)}
  .account-pill i{font-style:normal;font-size:10px;color:var(--on-glass-2);transition:transform .2s}
  .account-pill[aria-expanded="true"] i{transform:rotate(180deg)}
  .account-pill .who{max-width:16ch;overflow:hidden;text-overflow:ellipsis}
  .account-card{width:272px;box-sizing:border-box;padding:16px;border-radius:var(--radius-s);display:grid;gap:13px}
  .account-card[hidden]{display:none}
  .account-card .acts{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
  .account-card a.g-btn{text-decoration:none}
  .account-card .g-chip{justify-self:start}
  .account .dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.7);box-shadow:none}
  .account .dot.citizen{background:var(--sun);box-shadow:0 0 8px var(--sun)}
  @media (max-width:700px){.account .long{display:none}.account-card{width:min(272px,calc(100vw - 2 * var(--edge)))}}`;
  document.head.append(style);
  // the camera does not take what is done here: no pointer lock, no zoom; the keys that work a button (Space, Enter,
  // Tab, Esc) stay here, any other gives the focus back to the game and walks. Keyup always goes on, so a key held
  // into the pill is let go of by the walker too.
  for (const e of ['pointerdown', 'mousedown', 'wheel']) el.addEventListener(e, (ev) => ev.stopPropagation());
  el.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape') { open(false); pill.focus(); }
    if (['Space', 'Enter', 'NumpadEnter', 'Tab', 'Escape'].includes(ev.code)) ev.stopPropagation(); else document.activeElement?.blur?.();
  });
  document.addEventListener('pointerdown', () => open(false));   // a click anywhere else closes the card (its own are stopped above)
  const pill = el.querySelector('.account-pill'), card = el.querySelector('.account-card');
  const open = (on) => { card.hidden = !on; pill.setAttribute('aria-expanded', String(on)); };
  return { el, pill, card, open };
}

export function createAccount() {
  const ui = build();
  let message = heard(), busy = false;   // (why the last sign-in did not work, said once, from the callback)

  function render() {
    const s = session(), { pill, card } = ui;
    pill.disabled = busy;
    if (busy) { pill.innerHTML = 'Signing in<span class="long">&nbsp;with aven.id</span>…'; return; }
    if (!s) {
      pill.innerHTML = 'Sign in<span class="long">&nbsp;with aven.id</span>';
      pill.removeAttribute('aria-haspopup');
      card.innerHTML = message ? `<span class="g-label">Not signed in</span><p class="g-text">${esc(message)}</p><p class="g-text">The game plays on as it is.</p>
        <div class="acts"><button type="button" class="g-btn" data-do="in">Try again</button><button type="button" class="g-btn quiet" data-do="close">Close</button></div>` : '';
      ui.open(!!message);
      return;
    }
    const citizen = s.roles.includes('citizen'), role = citizen ? ROLE.citizen : ROLE.traveler, who = s.name || s.email || 'Signed in';
    pill.setAttribute('aria-haspopup', 'dialog');
    pill.innerHTML = `<span class="who long">${esc(who)}</span><span class="role">${role}</span><i aria-hidden="true">▾</i>`;
    card.innerHTML = `<div><span class="g-label">Signed in with aven.id</span><span class="g-name" style="margin-top:9px">${esc(who)}</span>${s.email && s.email !== who ? `<span class="g-sub">${esc(s.email)}</span>` : ''}</div>
      <span class="g-chip"><i class="dot${citizen ? ' citizen' : ''}"></i>${role}</span>
      ${citizen ? '' : `<div class="g-part acts"><p class="g-text">A citizen is an aven.id subscription.</p><a class="g-btn" href="${esc(s.issuer.replace(/\/$/, ''))}/" target="_top">Become a citizen</a></div>`}
      <div class="g-part acts"><button type="button" class="g-btn quiet" data-do="out">Sign out</button></div>`;
  }

  ui.pill.addEventListener('click', () => {
    if (busy) return;
    if (session()) { ui.open(ui.card.hidden); return; }
    go();
  });
  ui.card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]'); if (!b) return;
    if (b.dataset.do === 'out') { forget(); ui.open(false); render(); ui.pill.focus(); }
    if (b.dataset.do === 'in') go();
    if (b.dataset.do === 'close') { message = ''; render(); }
  });
  async function go() {
    busy = true; message = ''; ui.open(false); render();
    try { await signIn(); }   // (the tab leaves for aven.id; if it does not, it is because of what is caught here)
    catch (e) { busy = false; message = e instanceof AccountError ? e.message : `The sign-in could not start (${e?.message || e}).`; render(); }
  }
  // a session that ends while the game runs: the pill says so at the next look
  setInterval(() => { if (!busy && !session() && ui.pill.hasAttribute('aria-haspopup')) render(); }, 60e3);
  // back from aven.id's page without signing in (the browser's Back, the page kept as it was): no longer signing in
  addEventListener('pageshow', (e) => { if (e.persisted && busy) { busy = false; render(); } });
  render();
  return { get session() { return session(); } };
}

createAccount();
