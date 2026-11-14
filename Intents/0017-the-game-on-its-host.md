---
id: "0017"
title: The website and the game on their host, deployed by GitHub Actions
state: build           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-14
story:
---

# 0017 · The website and the game on their host, deployed by GitHub Actions

## Idea

Daniel, 2026-11-14: "Let's deploy the game on the new host using github actions. similar to the aven.dotnet
actions." The new host is 46.225.44.193 (`maia-city-next`); the game is to be reachable at https://maia.city and
sign in with aven.id (intent 0016). The way aven-dotnet deploys: CI checks every change; a Deploy workflow takes
an environment and a commit on `main`, builds the archive and sends it over SSH to a key that can only deploy.

Daniel, the same day: "Let's split the website of the game and the game into own directories. These will be served
from different subdomains later (no subdomain/www and play.maia.city)." And a `next` environment: https://next.maia.city
the website, https://play.next.maia.city the game; live: https://maia.city and https://play.maia.city. "the old stuff
is moved to archive.maia.city". "Let's use the existing split then": the website is `OS/`, the game `TheGame/`. "first
we want to get every 'next.*' instance up and running".

## Define

Asked outright, with no surprise in it: built straight away.

**Deliverables**

1. `.github/workflows/game.yml`: on every push and pull request touching `TheGame/`, a frozen install, the
   sign-in checks and the build.
2. `.github/workflows/deploy-game.yml`: by hand (environment, full SHA on `main`), or after a push to `main`
   when `AUTO_DEPLOY_NEXT` is `true`. It builds with the environment's aven.id and installs the release over
   SSH.
3. `deploy/`, at the repository's root: the environment `next` (the website https://next.maia.city, the game
   https://play.next.maia.city, signing in with https://next.aven.id), `prod` named for later; the pack of both
   sites (`bundle.sh`), the host's deploy command (`deploy.sh`), Caddy's two sites (`Caddyfile`), the host setup
   (`setup-host.sh`), and how it all goes (`README.md`).
5. Both sites build to what their dev servers answered: `OS/` gets `bun run build` with every `/api` answer as a
   file; the game's build makes the pages the website frames, its stories, timelines, scenes and the brand.
4. The host 46.225.44.193 set up, and the GitHub environment `next` holding its deploy key and host key.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The host serves a deployed release and `/callback` | `deploy.sh`'s own check on `127.0.0.1:8081`; `version.json` names the commit |
| 2 | The deploy key can do nothing else, and a bad archive is refused | `ssh deploy@host id` and a tar holding a symlink, both refused |
| 3 | Only 22, 80 and 443 reach the host; HTTP goes to HTTPS | `ufw status`; `curl` from outside on 8081 and 80 |
| 4 | The Game workflow passes on the pull request | its run on GitHub |
| 5 | A Deploy game run installs a commit on `main` | its run on GitHub, then `version.json` on the host |
| 6 | https://next.maia.city serves the website and https://play.next.maia.city the game | `curl` each page and `/api` path; `version.json` on both |
| 7 | A real sign-in on play.next.maia.city | needs next.aven.id to send `maia-city` back to `https://play.next.maia.city/callback` |

**Out of scope**

- DNS records (Daniel's), and archive.maia.city (the old site).
- `prod` (https://maia.city, https://play.maia.city, aven.id): named in `deploy/environments/prod.json`; no host yet.
- A scene's media (`Stories/objects/`, not in git) and the dev servers' editing (POST) on the deployed sites.

## Build

- **Caddy from Caddy's own apt repository** (2.11.9 on the host), not Ubuntu's 2.6.2 from 2022. Its signing key
  is pinned by fingerprint in `setup-host.sh`.
- **Caddy runs natively, not in Docker** as aven-dotnet's does. The game has no application server, so the
  `deploy` user needs neither the docker group nor sudo: it owns `/srv/maia-city` and nothing else. Caddy serves
  the `current` link, so a deploy switches the link and never reloads Caddy.
- **Each release gets its own directory**, `<commit>-<time>`, so redeploying the commit being served never
  removes it first.
- **The deploy checks itself** on a listener bound to `127.0.0.1:8081` that serves the same root. If Caddy does
  not serve the new `version.json`, `/callback` and `index.html`, the link goes back.
- **The public check only warns.** Caddy cannot get a certificate for maia.city until its DNS record points at
  the host, so the public HTTPS check warns and does not fail the deploy.
- **bun 1.4.4 in CI.** `TheGame/bun.lock` is lockfile version 2, which bun 1.3 cannot read frozen.
- **Two sites, one release.** `website/` and `game/` are unpacked and switched in together, so the website never
  frames a game of another commit. Caddy serves each name from its own folder of `current`.
- **No server on either site.** Each Vite config writes its dev server's answers into the build (`publish`), from
  the same functions its dev server now uses, so the two cannot drift. A list whose path is also its items' folder
  (`/api/stories`, `/api/stories/<id>/…`) is written as `<path>/index.json`, and Caddy's `try_files` finds it.
- **The game reads its scenes itself.** Its own build holds `api/scenes/<id>/scene.json`, at the path its film
  pages fetch, so the game never calls the website and needs no CORS.
- **Sign-in from inside the website.** The website frames the game from another origin now. A frame of another
  origin sends the whole tab to aven.id (whose pages may not be framed) and comes back to the game on its own.
- **The brand was missing from the first game release.** `/brand/*` was only ever served by the dev server; both
  builds now copy `brand/`.
- **No code split.** The build warns that `index.js` is over 500 kB (358 kB gzipped). Left as it is.

---

## Todo

- [x] Workflows, `deploy/` and docs
- [x] Host set up, a release deployed and checked from here
- [x] GitHub environment `next`: deploy key, host key, host, site URL (deploys only from `main`)
- [ ] CI green on the pull request
- [ ] Merged, then a Deploy game run on `main`
- [x] next.maia.city and play.next.maia.city served from the host
- [ ] next.aven.id sends `maia-city` back to play.next.maia.city, then a real sign-in

## Changelog

### 2026-11-14

- **Asked:** deploy the game on the new host with GitHub Actions, like aven-dotnet.
- **Delivered:**
  - the two workflows and `TheGame/deploy/`;
  - the host set up: Caddy, the `deploy` user, ufw;
  - from this machine, 76bd82c deployed through the same `bundle.sh` and the deploy key as the workflow.
- **Good:** `/callback` answered 200 as `callback.html`, and `/story/list` answered 404 instead of the game
  page. `version.json` named the commit and next.aven.id. A key used for anything else was refused ("This key
  can only deploy."), and so was an archive holding a symlink. Port 8081 was unreachable from outside, and
  port 80 redirected to https://maia.city/.
- **Broke / not there yet:**
  - The committed `bun.lock` did not install frozen with bun 1.3.x; CI uses bun 1.4.4.
  - https://maia.city waits for its DNS record (still 188.245.31.46).

### 2026-11-14, later

- **Asked:** the website (`OS/`) and the game (`TheGame/`) apart, each on its own name: next.maia.city and
  play.next.maia.city first.
- **Delivered:**
  - `deploy/` at the root, for both sites;
  - `OS/` with `bun run build`;
  - the game's build with its framed pages, stories, scenes and brand;
  - the two-site Caddyfile on the host;
  - commit 888ad5e plus these changes deployed through `maia-deploy` as the `deploy` user (the local deploy key was
    deleted once GitHub held it).
- **Good:**
  - Both names answered over HTTPS with their own certificates, and their DNS already pointed at the host.
  - The website: `/`, `/api/intents`, `/api/stories/day-0001/hook.json` and `/brand/brand.css` were 200;
    `/nope` was 404.
  - The game: `/`, `/callback`, `/timeline.html`, `/story/list`, `/api/scenes/trailer/scene.json` and
    `/brand/loading.js` were 200. It answered `frame-ancestors 'self' https://next.maia.city`.
- **Broke / not there yet:**
  - Sign-in waits for next.aven.id to send `maia-city` back to play.next.maia.city (jaensen/aven-dotnet#12).
  - archive.maia.city points at this host, but nothing serves it here.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-14 | `305a617` | The two workflows, `TheGame/deploy/` and its README |
