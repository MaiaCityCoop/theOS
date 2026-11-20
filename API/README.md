# The game's API

Who is signed in to the game, and each person's avatar (intent 0024). Bun and Postgres only: `Bun.sql` and WebCrypto,
no packages. Deployed with Docker Compose beside the static sites (`Deploy/compose.yml`, `Deploy/README.md`).

| Call | What |
| --- | --- |
| `POST /api/session` `{ id_token }` | Opens a session with the ID token aven.id just gave the game. Answers `{ sub, name, citizen }` and sets an HttpOnly cookie for 12 hours. |
| `DELETE /api/session` | Signs out of the API. |
| `GET /api/me` | `{ sub, name, citizen, avatar }`, where `avatar` is `null` until one is kept; `401` when signed out. |
| `PUT /api/me/avatar` `{ avatar }` | Keeps the avatar. Only a citizen may (`403 citizens_only`). |
| `GET /api/health` | `{ ok, commit }` once Postgres answers. |

## Signing in

aven.id's access tokens are opaque, live five minutes and come with no refresh token, so the API can't use them for
a day's play. Instead the game hands the API its ID token once, right after signing in
(`TheGame/src/account/callback.js`). The API checks the token itself (`src/token.js`):

- signed ES256 by a key from the issuer's JWKS;
- `iss` is the issuer, `aud` is `maia-city`, and `exp` has not passed;
- issued within the last 10 minutes and signed in with a passkey.

Each ID token opens one session at most, standing in for the nonce, which only the tab that signed in knows.

A person is first a citizen when the ID token that opened the session had the `citizen` role (`aven_roles`). After
that, the API asks aven.id's roles back channel (`src/roles.js`, `GET <issuer>/oauth2/roles?sub=`) whenever its last
answer is more than 30 seconds old (`ROLES_MAX_AGE_SECONDS`).

- It asks with the client id and `AVEN_ROLES_SECRET` as Basic credentials. aven.id holds only the secret's SHA-256.
- A citizenship bought or ended at aven.id shows in moments, without signing in again. The game asks again when its
  tab comes back into view.
- If aven.id can't answer, what was known stands. An account aven.id no longer has ends its sessions.
- Without the secret, roles change only at the next sign-in.

Every call that changes something must come from the game's origin (`ORIGINS`) as `application/json`, and the cookie
is `SameSite=Strict`, so another site's page can't act for a signed-in browser.

## The avatar

The avatar holds only the human kit's own numbers: body, height, skin, hair, shirt dye and shoes, each in a range
(`src/avatar.js`). The game builds the person from them (`TheGame/characters/kit/avatar.js`, the same rules;
`test/api.test.js` checks that the two agree).

## Running it here

```sh
docker run -d --rm --name maia-pg -e POSTGRES_PASSWORD=dev -p 127.0.0.1:55432:5432 postgres:18-alpine
DATABASE_URL=postgres://postgres:dev@127.0.0.1:55432/postgres bun test
DATABASE_URL=postgres://postgres:dev@127.0.0.1:55432/postgres ISSUER=https://next.aven.id \
  ORIGINS=http://localhost:5173 INSECURE_COOKIE=1 PORT=8083 bun src/server.js
```

The game's dev server hands `/api/session` and `/api/me` on to `MAIA_API`, which defaults to
`http://127.0.0.1:8083`. Signing in for real from this machine needs an issuer that knows its redirect URI; with
next.aven.id that is only `https://play.next.maia.city/callback`.

Migrations are `migrations/NNNN-*.sql`. The API applies the new ones at start, in order, each in a transaction.
