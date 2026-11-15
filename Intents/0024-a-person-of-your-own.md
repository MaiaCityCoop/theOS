---
id: "0024"
title: A person of your own, kept by the game's API
state: build           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-15
story:
---

# 0024 · A person of your own, kept by the game's API

## Idea

Daniel: "I need some kind of profile page. A user needs to create an avatar for the game." Then: "let's use a simple
docker compose stack with a bun api and postgres", and "just the existing kit. avatar can only be created once you're
a paid member."

The person is the human kit's own (intent 0019): a walker kind's proportions, a height, skin, hair, the linen shirt's
dye and the leather. Account details (name, email, subscription) stay with aven.id.

## Define

Asked outright, with no surprise in the definition, so built straight away.

**Deliverables**

1. **The API** (`API/`): Bun and Postgres, no packages.
   - `POST /api/session` takes the ID token aven.id just gave the game, checks it on the server and takes each one
     once. It then opens the API's own session as an HttpOnly cookie.
   - `GET /api/me` answers who the person is, whether they are a citizen, and their avatar.
   - `PUT /api/me/avatar` keeps the avatar for citizens only.
   - `DELETE /api/session` signs out; `GET /api/health` answers when Postgres does.
2. **The stack** (`deploy/compose.yml`): the API and Postgres on the environment's host.
   - The compose file is root's, not the deploy's.
   - Postgres is on an internal network; the API listens on 127.0.0.1 only, unprivileged.
   - The deploy builds and starts each release's API through one root command (`maia-api-up`) and rolls back
     both the sites and the API if either fails.
3. **The game:**
   - after signing in, it opens the API session; signing out ends it;
   - the account card gains "Your person";
   - a new page, `me.html`, shows you on the library's stage with the kit's choices;
   - a citizen keeps the person, and a traveler sees who they could be and the way to become a citizen.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The API holds | `bun test` in `API/` on Postgres: tokens refused for issuer, client, age, passkey, signature; one session per token; only citizens keep; only the game's origin, as JSON |
| 2 | The game and the API agree on what an avatar is | the same test, over the page's every choice and random avatars |
| 3 | A citizen keeps a person | `me` in a browser with a citizen's session: change it, keep it, load the page again and it is still them |
| 4 | A traveler cannot | the same with a traveler's session: the choices are locked; the API answers 403 `citizens_only` |
| 5 | The page works without the world | where the 3D cannot be drawn, the card still says who you are |
| 6 | Deployed on next | `https://play.next.maia.city/api/health` names the deployed commit; a real sign-in on play.next.maia.city, then `me` |

**Out of scope**

- New clothes, hairstyles or faces: only the existing kit.
- Showing the person in the world, or to other people.
- Database backups, and prod.

## Build

- **The API keeps its own session.** aven.id's access tokens are opaque, live five minutes and come with no refresh
  token. So the ID token, checked on the server for `aud` `maia-city`, is shown once and opens a 12-hour cookie
  session, the same length as the game's own.
- **The nonce isn't checked on the server**, because only the signing-in tab knows it. Instead each ID token opens
  one session at most.
- **Citizenship is read from the ID token when the session opens.** A subscription changed at aven.id shows at the
  next sign-in, as in the game.
- **The avatar's rules exist twice**, in `API/src/avatar.js` and `TheGame/characters/kit/avatar.js`, because the
  API's image is built from `API/` alone. A test checks that they agree.
  - The game's copy sits in `characters/kit/`: the registry reads every `characters/*.js` as a recipe.
- **The page is two modules.** The card (`src/me/card.js`) must not wait for the world, and the stage
  (`src/me/stage.js`) loads `src/main.js` itself.
  - In a build, the world's chunk is shared with the other pages and runs before the page's own code. A renderer
    that failed (headless Firefox, no WebGL) left the card on "Asking who you are…" until the stage loaded the
    world itself.
- **The host builds the API image.** `deploy/compose.yml` and the settings are root's; a release brings only the
  source. A push to `main` therefore runs code in the API's container, with its database, but not on the host.

---

## Todo

- [x] The API, its migrations and tests
- [x] Compose, `maia-api-up`, the deploy's rollback, Caddy, the host setup, CI with Postgres
- [x] The game: session after sign-in, "Your person", `me.html`
- [x] Checked here: tests, and a browser as citizen, traveler and signed out
- [x] CI green on the pull request
- [x] The host set up again (Docker, `/etc/maia-city`), merged, deployed to next
- [x] Citizenship sold on next (aven.id Market, Polar sandbox), and bought
- [ ] A real sign-in as a citizen on play.next.maia.city, then a person kept

## Changelog

### 2026-11-15

- **Asked:** a profile page where a person makes their avatar for the game, with a Docker Compose stack of a Bun API
  and Postgres; only the existing kit; only paid members (citizens).
- **Delivered:** the API with its tests, the stack and its deploy, and the page `me.html` with its link from the
  account card.
- **Good:**
  - `bun test` in `API/`: 26 passed, 0 failed, on Postgres 18. `tools/account-check.js`: 67 passed.
  - The built game and the API ran here behind a stand-in for Caddy:
    - signed out, the card said "Make your person";
    - as a traveler, the choices were locked;
    - as a citizen, choosing a skin, hair, shirt and the next body, keeping, and loading the page again showed the
      same person, "Kept".
  - On the GPU, the person stood on the stage in the chosen colours.
- **Broke / not there yet:**
  - The card waited for the world until the stage loaded it itself (Build).
  - Blond read almost white and was toned down.
  - A real sign-in has not been tried: next.aven.id sends `maia-city` only to play.next.maia.city.

### 2026-11-15, later

- **Asked:** go (merge and deploy); then create the citizen product in the Polar sandbox: one euro a day, billed
  monthly, tax inclusive.
- **Delivered:**
  - PR #3 merged and deployed to next (Deploy run 43664619486). `/api/health` named de16641; signed out, `/api/me`
    answered 401; another origin 403, a made-up token 401; 8083 and 5432 closed from outside; both containers
    healthy, the API as 1000:1000 on a read-only filesystem with no capabilities.
  - The Polar sandbox product "Maia City citizen", EUR 30.00 a month, tax inclusive, added to aven.id's Market on
    next (jaensen/aven-dotnet#13). Polar first refused the checkout ("You already have an active subscription"):
    the organization allowed one subscription per customer, and Daniel has avenCEO. Allowing several fixed it.
  - "Already one? Sign in again" for a traveler, in the account card and on `me`.
- **Good:** Daniel bought citizenship on next; Polar shows it active and Market took both webhooks (202).
- **Broke / not there yet:** the game still said traveler: a role is read at sign-in, and the game's session (and
  the API's) predated the subscription. Signing out and in again reads it; the new button says so.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-15 | `5c496ed` | The API, its stack and deploy, the session after sign-in, `me.html` |
| 2026-11-15 | `7e8e049` | "Already one? Sign in again" for a traveler; the changelog of the deploy and the purchase |
