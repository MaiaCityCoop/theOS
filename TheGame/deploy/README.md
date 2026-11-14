# Deploying the game

The game is a static site. GitHub Actions builds it at a commit on `main` and installs it on the environment's
host over SSH. Caddy on that host serves it over HTTPS.

| Environment | Site | Signs in with | Host |
| --- | --- | --- | --- |
| `next` | https://maia.city | https://next.aven.id | 46.225.44.193 (`maia-city-next`) |

`environments/<name>.json` holds the site's `Origin` and the aven.id `Issuer` the build bakes in
(`VITE_AVEN_ISSUER`, read by `src/account/config.js`). The issuer must have the client `maia-city` registered
with the redirect URI `<Origin>/callback`.

## How a deploy works

1. `.github/workflows/game.yml` runs on every push and pull request touching `TheGame/`. It runs
   `bun install --frozen-lockfile`, the sign-in checks (`tools/account-check.js`) and the build.
2. **Actions → Deploy game → Run workflow** takes an environment and a full commit SHA on `main`. Set the
   repository variable `AUTO_DEPLOY_NEXT` to `true` and every push to `main` deploys to `next` by itself once
   the checks pass.
3. `deploy/bundle.sh` builds the site with the environment's issuer, adds `version.json` (commit, origin,
   issuer) and packs `dist/` into a tar.
4. The tar goes over SSH to the `deploy` user. That key can only run `/usr/local/bin/maia-deploy`
   (`deploy/deploy.sh`). The script:
   - refuses anything but plain files and directories;
   - unpacks the release into `/srv/maia-city/releases/<commit>-<time>`;
   - switches the `/srv/maia-city/current` link;
   - checks on `127.0.0.1:8081` that Caddy serves the new `version.json`, `/callback` and `index.html`, and
     switches back if not;
   - keeps the last five releases.
5. The script then asks `https://<host>/version.json` through the host's own Caddy. Until the DNS record points
   at the host, Caddy has no certificate; the deploy still succeeds and only warns.

**Rolling back** is deploying an earlier commit. `curl https://maia.city/version.json` says which commit is
live.

## Caddy

`deploy/Caddyfile` is the site configuration:

- `/callback` serves `callback.html` (`try_files {path} {path}.html`).
- Paths that are no file get a 404, never the game page.
- `/assets/*` is cached as immutable, since Vite names those files by content hash. Everything else is
  `no-cache`.
- Only this origin may frame the game (`frame-ancestors 'self'`).

A change to the Caddyfile reaches the host by running the host setup again, not by a deploy.

## Setting up a host

On a fresh Ubuntu 24.04 or 26.04 host that your own SSH key reaches as root:

```sh
ssh-keygen -t ed25519 -N '' -C 'github-actions deploy MaiaCityCoop/theOS next' -f ./maia-next-deploy
cd TheGame
deploy/setup-host.sh root@<host> deploy/environments/next.json ../maia-next-deploy.pub
```

The setup is safe to run again. It:

- installs Caddy from Caddy's own apt repository, with the signing key pinned by fingerprint;
- creates the `deploy` user with that key bound to `maia-deploy`;
- writes `/etc/caddy/Caddyfile` for the environment's host name;
- turns off SSH passwords;
- opens only 22, 80 and 443 in ufw;
- enables unattended upgrades.

Then, in **Settings → Environments → `<name>`** of MaiaCityCoop/theOS:

| Kind | Name | Value |
| --- | --- | --- |
| secret | `DEPLOY_SSH_KEY` | the private key `maia-next-deploy` |
| variable | `DEPLOY_HOST` | the host's address, e.g. `46.225.44.193` |
| variable | `DEPLOY_HOST_KEY` | `ssh-keyscan -t ed25519 <host> \| cut -d' ' -f2-`, checked against the host's console |
| variable | `SITE_URL` | the environment's `Origin` |

Delete the private key file once it is stored as the secret. Point the site's DNS `A` record at the host; Caddy
gets its certificate on the next request.
