---
id: "0016"
title: Sign in with aven.id, as a traveler or a citizen
state: propose           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-14
story:
---

# 0016 · Sign in with aven.id, as a traveler or a citizen

## Idea

Daniel's brief (passed on by the agent that opened this; not his words verbatim): add "sign in with aven.id" to
TheGame. aven.id, an OpenID Connect provider being added to aven-dotnet now, signs people in with a passkey; the game
becomes a public client using the authorization code with PKCE (S256) in the browser.

Two roles: **traveler** (any aven.id account, free) and **citizen** (a paid aven.id subscription; later citizens get
access to an MCP server). aven.id will put them in the ID token as `aven_roles` when the scope `roles` is asked for;
that claim does not exist yet, and a missing claim means traveler. The game is browser-only: the role decides only
what the game shows; anything that must really hold (the MCP, later) checks tokens on its own server.

## Define

Asked for outright, with the deliverables and checks spelled out in the brief; this definition holds no surprise, so
it was built straight away.

**Deliverables**

1. `TheGame/src/account/`, one job: config in one place (issuer `https://aven.id`, overridable for next by
   `VITE_AVEN_ISSUER` or `?issuer=` on localhost only; client `maia-city`; redirect `<origin><base>callback`).
2. Sign-in: discovery checked (`issuer` exact), state, nonce, PKCE verifier and S256 challenge kept in
   `sessionStorage` for the round trip only, the redirect to `authorization_endpoint`.
3. `callback.html` (in the build's pages): state, `error`, the code exchanged by a form POST, the round trip cleared,
   the ID token checked in the browser (ES256 only, key by `kid` from `jwks_uri`, WebCrypto P-256, iss, aud/azp,
   exp/iat, nonce, sub, `amr` with `passkey`), then back to a same-origin path saved before.
4. Session `{ sub, email, name, roles, expiresAt }` in `sessionStorage`, no tokens; its length chosen and said why;
   sign-out forgets it.
5. A brand pill in the game: *Sign in with aven.id*; signed in, the name or email, the role, *Sign out*, and for a
   traveler *Become a citizen* (`<issuer>/`, the same tab). Its keys and clicks stay out of the walker's way.
6. Errors said plainly, the game never broken, playing on when aven.id is unreachable.
7. `TheGame/README.md`: the folder in the table; the flow, the config, the two roles, the browser-only limit.
8. A check that runs under bun for the pure parts.

**Checks** (how each is shown to be done)

| # | Check | How |
| --- | --- | --- |
| 1 | The pure parts hold | `bun tools/account-check.js` in TheGame: PKCE (RFC 7636 appendix B), parsing, ES256 with a key made there, and refusal of a wrong key, a DER signature, `none`/`HS256`/`EdDSA`, wrong iss/aud/nonce/exp, no passkey `amr`; the way-back check |
| 2 | It builds, with the callback page | `bun run build` in TheGame: `dist/callback.html` beside `dist/index.html` |
| 3 | The whole round trip in a browser | Chromium against a stand-in OIDC provider on localhost (`?issuer=`): signed in as traveler and citizen, the refusals said, nothing of the tokens kept |
| 4 | Under the dashboard's base, and framed | the same at `/game/`: redirect `/game/callback`; from a frame of the same origin the tab goes and comes back |
| 5 | The pill keeps out of the walker's way | Space on the pill does not reach the game, W does; a click on it is no mousedown of the game and takes no pointer lock |
| 6 | It looks like the brand | a screenshot, wide and phone |

**Out of scope**

- aven.id itself: its OIDC, registering `maia-city` there, the `aven_roles` claim, CORS on its endpoints.
- The citizens' MCP server and any server-side check of tokens.
- Deploying: how the host that serves the built game answers `/callback`.

## Build

- `src/account/`: `config.js` (the numbers), `oidc.js` (the protocol and the ID token's check; nothing of the page in
  it, so it runs under bun), `session.js` (what the tab keeps), `index.js` (the pill), `callback.js` (the way back).
- The pill is loaded by its own script in `index.html`, before `src/main.js`, not wired in `main.js`: it neither waits
  for the world nor holds it up (in headless Chromium the world took 28 s to start; the pill was there in about one).
  Only the game's page shows it (`index.html`), not the film, the library or the lenses; hidden as a picture
  (`?embed`); inside the dashboard it sits under the dashboard's own header, whose Visit button is at the top right.
- **Session length: 12 hours** (or the tab's closing), not the ID token's 5 minutes. The game keeps no token to show
  anyone, only who signed in and their roles, and those decide only what it shows; a role changed at aven.id shows
  at the next sign-in.
- **Storage:** `sessionStorage` only: `maia.account` (the session, with the issuer added to the brief's fields, so
  *Become a citizen* links to the issuer the person signed in with), `maia.account.trip` (the round trip, read once,
  forgotten after 10 minutes), `maia.account.said` (a message from the callback for the game to show once).
- **Inside the dashboard** the game is a frame of the same origin; aven.id's page may not be framed (and a passkey in
  a framed page needs permissions), so the whole tab goes to aven.id and comes back to the dashboard's own path. A
  same-origin frame in the same tab reads the same `sessionStorage`, so the game in the frame finds the session.
- The ID token is also refused if it was issued more than ten minutes ago, if it carries `crit`, if `azp` is given
  and is not the game (not only when there are several audiences), and if the issuer's key says another `use` or
  `alg`. The callback checks RFC 9207's `iss` where the issuer sends it. Discovery's endpoints must be on https (http
  only for an issuer on this machine), and PKCE S256 must be among its methods where it lists them.
- Keys on the pill: Space, Enter, Tab and Esc stay there; any other key gives the focus back to the game and walks.
  Keyup is never stopped, so a key held while clicking the pill is let go of by the walker too.
- The brief said to add `callback.html` "to the Vite build inputs like the other pages"; there were none: the build
  made `index.html` alone. `vite.config.js` now names two inputs, the game and the callback; the film, the library and
  the lenses are still not in the build (as before).
- `bun install` with bun 1.3.1 rewrote `TheGame/bun.lock` to an older format; put back, not committed.

## Propose

**Delivered:** `TheGame/src/account/` (`config.js`, `oidc.js`, `session.js`, `index.js`, `callback.js`),
`TheGame/callback.html`, `TheGame/tools/account-check.js`, `TheGame/index.html` (the pill's script),
`TheGame/vite.config.js` (the two pages of the build), `TheGame/README.md` (the folder, "Signing in"). Look at it on
`/game/` (top right); a real sign-in needs aven.id's OIDC (below).

**Checks, as they were** (2026-11-14)

| # | Result | Evidence |
| --- | --- | --- |
| 1 | passed | `bun tools/account-check.js`: 67 passed, 0 failed. Each of four checks taken out of `oidc.js` in turn (alg, amr, nonce, signature) made it fail (5, 1, 2, 2 failed) |
| 2 | passed | `bun run build`: `dist/index.html`, `dist/callback.html`, `assets/callback-*.js` |
| 3 | passed | headless Chromium (Playwright) against a stand-in provider on `localhost:5199`, the game's dev server on 5175 (5173 was taken by another project's server), the world left out of the page for this run: 22 of 22. Authorize sent `response_type=code`, `client_id=maia-city`, `scope=openid profile email roles`, S256, state and nonce of 43 characters; the token request a form POST with a 43-character verifier; back on `/?issuer=…&x=1#here` as "Ada Lovelace · Traveler", then "Citizen", and no `aven_roles` read as Traveler; `sessionStorage` held `maia.account` alone, no token; nothing in `localStorage`. Refused and said: `access_denied` ("cancelled"), a token signed by another key ("its signature does not hold"), `amr` without passkey, a state not ours, the callback opened with no sign-in begun, an unreachable issuer ("Couldn't reach localhost:5198."); a bad `?issuer=` fell back to `https://aven.id` |
| 4 | passed | the same 22 of 22 with the dev server at `--base /game/`: `redirect_uri` `http://localhost:5176/game/callback`; from a frame the tab went to the provider and came back to the top page's path, signed in |
| 5 | passed | in check 3: the window saw `KeyW` and not `Space`; after a click on the pill no `mousedown` reached the window and `pointerLockElement` was null |
| 6 | passed | screenshots at 1400×860 (pill and open card, top right; the readout bottom right, the pill bottom centre) and 390×844 ("Sign in" alone), over a painted sky: the world was left out of the page for them |

**Known gaps:**

- Not signed in against aven.id itself: its OIDC is not deployed yet, `maia-city` is not registered there, and the
  `aven_roles` claim does not exist yet. aven.id must also answer discovery, keys and the token endpoint to the game's
  origin (CORS), and send `amr: ["passkey"]` and ES256 tokens, or every sign-in is refused (as it should be).
- The production host must answer `/callback` with `callback.html`; not checked (nothing deployed).
- Not seen in Safari or Firefox, nor on a touch screen; the screenshots were over a painted sky, not the world.
- A frame of another origin can only send itself to aven.id; inside the dashboard (same origin) the whole tab goes.
- No story folder spawned: no story has been told of this yet, and Samuel's lines can only be his own words.

## Story

## Archived

---

## Todo

- [x] The account folder: config, protocol and check, session, the pill, the callback
- [x] `callback.html` in the build
- [x] README: folder table, Signing in
- [x] `tools/account-check.js` passes
- [x] The round trip in a browser against a stand-in provider, at `/` and at `/game/`
- [ ] A real sign-in once aven.id's OIDC is deployed and `maia-city` is registered with its redirect URIs
- [ ] See *Citizen* once aven.id sends `aven_roles`
- [ ] The production host answers `/callback`
- [ ] Look at it in Safari and on a phone, over the world

## Changelog

### 2026-11-14

- **Asked:** sign in with aven.id in the game (OIDC, code with PKCE S256 in the browser), traveler and citizen from
  `aven_roles`, the ID token checked in the browser, a session in `sessionStorage`, a brand pill, plain errors, its
  own folder, a check runnable with bun.
- **Delivered:** `src/account/`, `callback.html` in the build, the pill at the top right, `tools/account-check.js`,
  the README's "Signing in". Committed on `feat/aven-id-sign-in`; not pushed, not deployed.
- **Good:** the check (67) and the whole round trip in Chromium against a stand-in provider (22, at `/` and at
  `/game/`) passed; the pill is there before the world has started and does not depend on it.
- **Broke / not there yet:** no real sign-in: aven.id's OIDC, the `maia-city` client and the `aven_roles` claim do
  not exist yet. On the way: the first browser runs failed on the test itself (a non-breaking space in the label; the
  W press took the pointer lock, as the game does, and the next clicks went to it; a wait that matched the page it
  was already on); `bun install` rewrote the lockfile, put back.

## Trail

| When | Commit | What |
| --- | --- | --- |
