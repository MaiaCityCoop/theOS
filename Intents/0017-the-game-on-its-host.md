---
id: "0017"
title: The game on its own host, deployed by GitHub Actions
state: build           # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-14
story:
---

# 0017 · The game on its own host, deployed by GitHub Actions

## Idea

Daniel, 2026-11-14: "Let's deploy the game on the new host using github actions. similar to the aven.dotnet
actions." The new host is 46.225.44.193 (`maia-city-next`); the game is to be reachable at https://maia.city and
sign in with aven.id (intent 0016). The way aven-dotnet deploys: CI checks every change; a Deploy workflow takes
an environment and a commit on `main`, builds the archive and sends it over SSH to a key that can only deploy.

## Define

Asked outright, with no surprise in it: built straight away.

**Deliverables**

1. `.github/workflows/game.yml`: on every push and pull request touching `TheGame/`, a frozen install, the
   sign-in checks and the build.
2. `.github/workflows/deploy-game.yml`: by hand (environment, full SHA on `main`), or after a push to `main`
   when `AUTO_DEPLOY_NEXT` is `true`. It builds with the environment's aven.id and installs the release over
   SSH.
3. `TheGame/deploy/`: the environment `next` (https://maia.city, signing in with https://next.aven.id), the
   pack (`bundle.sh`), the host's deploy command (`deploy.sh`), Caddy's site (`Caddyfile`), the host setup
   (`setup-host.sh`), and how it all goes (`README.md`).
4. The host 46.225.44.193 set up, and the GitHub environment `next` holding its deploy key and host key.

**Checks**

| # | Check | How |
| --- | --- | --- |
| 1 | The host serves a deployed release and `/callback` | `deploy.sh`'s own check on `127.0.0.1:8081`; `version.json` names the commit |
| 2 | The deploy key can do nothing else, and a bad archive is refused | `ssh deploy@host id` and a tar holding a symlink, both refused |
| 3 | Only 22, 80 and 443 reach the host; HTTP goes to HTTPS | `ufw status`; `curl` from outside on 8081 and 80 |
| 4 | The Game workflow passes on the pull request | its run on GitHub |
| 5 | A Deploy game run installs a commit on `main` | its run on GitHub, then `version.json` on the host |
| 6 | https://maia.city serves the game | needs maia.city's DNS record to point at the host |

**Out of scope**

- maia.city's DNS record (Daniel's to change).
- An environment for production aven.id. The table in `deploy/README.md` gets a row when there is one.
- The other pages (film, library, lenses): the build has only ever made `index.html`, and now `callback.html`.

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
- **No code split.** The build warns that `index.js` is over 500 kB (358 kB gzipped). Left as it is.

---

## Todo

- [x] Workflows, `deploy/` and docs
- [x] Host set up, a release deployed and checked from here
- [ ] GitHub environment `next`: deploy key, host key, host, site URL
- [ ] The Game workflow green on the pull request
- [ ] Merged, then a Deploy game run on `main`
- [ ] maia.city's DNS at 46.225.44.193, then https://maia.city checked and a real sign-in against next.aven.id

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

## Trail

| When | Commit | What |
| --- | --- | --- |
