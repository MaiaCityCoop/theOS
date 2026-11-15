# Deploying the website, the game and its API

- **The website** (`OS/`): the front page and the dashboard of intents and stories. Static.
- **The game** (`TheGame/`): its pages, and the way back from aven.id. Static.
- **The game's API** (`API/`): who is signed in and each person's avatar. Bun and Postgres, in Docker Compose.

GitHub Actions builds the sites at a commit on `main` and installs them together with the API's source on the
environment's host over SSH. Caddy on that host serves each site over HTTPS on its own name, and hands the API's paths
on the game's name to the API.

| Environment | Website | Game | Signs in with | Host |
| --- | --- | --- | --- | --- |
| `next` | https://next.maia.city | https://play.next.maia.city | https://next.aven.id | 46.225.44.193 (`maia-city-next`) |
| `prod` (no host yet) | https://maia.city | https://play.maia.city | https://aven.id | none |

`environments/<name>.json` holds the two origins and the aven.id `Issuer`:

- The game is built with `VITE_AVEN_ISSUER`, which `TheGame/src/account/config.js` reads.
- The website is built with `VITE_GAME`, the game origin it frames (`OS/src/main.js`).
- The issuer must have the client `maia-city` registered with the redirect URI `<Game>/callback`.

## What a build holds

Neither site has a server once deployed. Each build writes what its dev server answered as files:

- **The website** (`OS/vite.config.js`):
  - `/api/intents`, `/api/ideas`, `/api/scenes` and `/api/stories`, each a list at `<path>/index.json`;
  - each intent, scene and story file;
  - story shots and previews;
  - `/api/me`, which names no one.
- **The game** (`TheGame/vite.config.js`):
  - the pages `index`, `callback`, `timeline`, `lenses` and `library`;
  - `/story/list` and `/story/<id>/timeline.json`;
  - `/cine/list` and `/cine/timelines/*`;
  - `/api/scenes/<id>/scene.json`, which the film pages read.
- **Both:** `brand/`.

Two things are missing from both builds:

- **Scene media** (`Stories/objects/`), which isn't in git.
- **Editing.** The dev servers' POST endpoints (keeping timelines, previews and shots) have no server to write to.

## The API

`API/README.md` describes the calls. On the host:

- **`/etc/maia-city/compose.yml`** (`deploy/compose.yml`, owned by root) runs the API and Postgres 18:
  - Postgres sits on an internal network with no way out, and its data lives in the volume `maia-city_pgdata`.
  - The API listens on `127.0.0.1:8083` only. It runs as uid 1000 on a read-only filesystem, with no capabilities,
    and reaches out only for aven.id's keys.
  - A deploy can't change this file, so it can't change what the API may touch.
- **`/etc/maia-city/api.env`** (root only) holds the database password, made once by the host setup, plus the
  issuer and the game's origin.
- **`/usr/local/bin/maia-api-up <release>`** (`deploy/api-up.sh`) builds one release's API image and starts it.
  It waits until the API and Postgres are healthy, then removes the images of releases no longer kept. It is the
  only command the `deploy` user may run as root.

There are no backups of the database yet.

## How a deploy works

1. `.github/workflows/ci.yml` runs on every push and pull request touching the sites. It runs the frozen installs, the
   sign-in checks (`TheGame/tools/account-check.js`) and both builds for `next`.
2. **Actions → Deploy → Run workflow** takes an environment and a full commit SHA on `main`. Set the repository
   variable `AUTO_DEPLOY_NEXT` to `true` and every push to `main` deploys to `next` by itself once CI passes.
3. `deploy/bundle.sh` builds both sites for the environment. It adds `version.json` (commit, origins, issuer) to each
   and packs them as `website/` and `game/` in one tar, with the API's source as `api/`.
4. The tar goes over SSH to the `deploy` user. That key can only run `/usr/local/bin/maia-deploy`
   (`deploy/deploy.sh`). The script:
   - refuses anything but plain files and directories under `website/`, `game/` and `api/`;
   - unpacks the release into `/srv/maia-city/releases/<commit>-<time>`;
   - builds and starts the release's API (`sudo maia-api-up`), and stops there if it doesn't come up;
   - switches the `/srv/maia-city/current` link, so both sites change at once;
   - checks on `127.0.0.1:8081` (website) and `127.0.0.1:8082` (game and API) that Caddy serves the new release and
     its API, and otherwise puts the previous release and its API back;
   - asks both public names through the host's own Caddy, and only warns while a name's DNS record or certificate
     is missing;
   - keeps the last five releases.

**Rolling back** is deploying an earlier commit that has an API (the deploy refuses an archive without `api/`).
`curl https://next.maia.city/version.json` says which commit is live, and `curl https://play.next.maia.city/api/health`
says which commit the API runs.

## Caddy

`deploy/Caddyfile`:

- **Paths:** `/callback` serves `callback.html` and `/api/stories` serves `api/stories/index.json`. Anything that is
  not a file gets a 404, never a page.
- **Caching:** `/assets/*` is cached as immutable, since Vite names those files by content hash. Everything else is
  `no-cache`.
- **Framing:** the website may frame only itself. The game may be framed by itself and the website.
- **The API:** on the game's name, `/api/session`, `/api/me`, `/api/me/*` and `/api/health` go to `127.0.0.1:8083`.
  The game's other `/api/` paths (its scenes) stay files.

The game signs in by sending the whole tab to aven.id, because aven.id's pages can't be framed. When the website
frames it from another origin, the person comes back to the game on its own name.

A change to the Caddyfile reaches the host by running the host setup again, not by a deploy.

## Setting up a host

On a fresh Ubuntu 24.04 or 26.04 host that your own SSH key reaches as root:

```sh
ssh-keygen -t ed25519 -N '' -C 'github-actions deploy MaiaCityCoop/theOS next' -f ./maia-next-deploy
deploy/setup-host.sh root@<host> deploy/environments/next.json ./maia-next-deploy.pub
```

The setup is safe to run again. It:

- installs Caddy from Caddy's own apt repository, with the signing key pinned by fingerprint;
- installs Docker and Compose from Ubuntu's archive;
- creates the `deploy` user with that key bound to `maia-deploy`, and lets it run `maia-api-up` as root (nothing
  else);
- writes `/etc/maia-city/compose.yml` and `/etc/maia-city/api.env`, keeping the database password once made;
- writes `/etc/caddy/Caddyfile` and `/srv/maia-city/hosts` for the environment's two names;
- turns off SSH passwords;
- opens only 22, 80 and 443 in ufw;
- enables unattended upgrades.

Then, in **Settings → Environments → `<name>`** of MaiaCityCoop/theOS (deployments limited to `main`):

| Kind | Name | Value |
| --- | --- | --- |
| secret | `DEPLOY_SSH_KEY` | the private key `maia-next-deploy` |
| variable | `DEPLOY_HOST` | the host's address, e.g. `46.225.44.193` |
| variable | `DEPLOY_HOST_KEY` | `ssh-keyscan -t ed25519 <host> \| cut -d' ' -f2-`, checked against the host's console |
| variable | `SITE_URL` | the environment's website |

Delete the private key file once it is stored as the secret. Point both names' DNS `A` records at the host; Caddy
gets the certificates on the next request.
