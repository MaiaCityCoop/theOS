#!/usr/bin/env bash
# Prepares an Ubuntu 24.04 or 26.04 LTS host to serve the website and the game, or brings one up to date. Run it from
# your own machine with root SSH access to the host; it is safe to run again (Deploy/README.md):
#   Deploy/setup-host.sh root@<host> <environment.json> <deploy-key.pub>
# It installs Caddy from Caddy's own apt repository and Docker from Ubuntu's, creates the `deploy` user whose key can only
# run /usr/local/bin/maia-deploy (and that user may run only /usr/local/bin/maia-api-up as root), writes
# /etc/caddy/Caddyfile for the environment's two host names and /etc/maia-city/ for the game's API, and turns on the
# firewall.
set -euo pipefail
target=${1:?Usage: $0 root@<host> <environment.json> <deploy-key.pub>}
environment=${2:?Usage: $0 root@<host> <environment.json> <deploy-key.pub>}
key_file=${3:?Usage: $0 root@<host> <environment.json> <deploy-key.pub>}
here=$(cd "$(dirname "$0")" && pwd)
name() { jq -er --arg k "$1" '.[$k] | select(test("^https://[a-z0-9.-]+$")) | sub("^https://"; "")' "$environment"; }
website_host=$(name Website)
game_host=$(name Game)
issuer=$(jq -er '.Issuer | select(test("^https://[a-z0-9.-]+$"))' "$environment")
key=$(head -n 1 "$key_file")
[[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]] || { echo "$key_file is not an ssh-ed25519 public key." >&2; exit 1; }

payload=$(mktemp -d)
trap 'rm -rf "$payload"' EXIT
cp "$here/deploy.sh" "$payload/maia-deploy"
cp "$here/api-up.sh" "$payload/maia-api-up"
cp "$here/compose.yml" "$payload/compose.yml"
printf 'ISSUER=%s\nORIGINS=https://%s\n' "$issuer" "$game_host" >"$payload/api.env"
printf 'deploy ALL=(root) NOPASSWD: /usr/local/bin/maia-api-up\n' >"$payload/sudoers"
sed "s/@WEBSITE_HOST@/$website_host/g; s/@GAME_HOST@/$game_host/g" "$here/Caddyfile" >"$payload/Caddyfile"
printf 'website=%s\ngame=%s\n' "$website_host" "$game_host" >"$payload/hosts"
printf 'command="/usr/local/bin/maia-deploy",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty %s\n' \
	"$key" >"$payload/authorized_keys"

# The host side, unpacked there with the files above and run with no standard input.
cat >"$payload/setup.sh" <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
incoming=$1

# Caddy's signing key, pinned by fingerprint (https://caddyserver.com/docs/install#debian-ubuntu-raspbian).
apt-get update -qq
apt-get install -y -qq curl gnupg ufw unattended-upgrades >/dev/null
fingerprint=65760C51EDEA2017CEA2CA15155B6D79CA56EA34
key=$(mktemp)
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$key"
if ! gpg --show-keys --with-colons "$key" 2>/dev/null | grep -q "^fpr:::::::::$fingerprint:"; then
	echo "Caddy's apt key does not have the expected fingerprint." >&2
	exit 1
fi
install -d -m 755 /etc/apt/keyrings
gpg --dearmor <"$key" >/etc/apt/keyrings/caddy-stable.gpg
rm -f "$key"
echo 'deb [signed-by=/etc/apt/keyrings/caddy-stable.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main' \
	>/etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy >/dev/null

# Docker from Ubuntu's own archive, for the game's API and its Postgres (Deploy/compose.yml). The ports it publishes
# are on 127.0.0.1 only, so ufw's rules below are not bypassed.
apt-get install -y -qq docker.io docker-compose-v2 sudo openssl >/dev/null
systemctl enable --now docker >/dev/null 2>&1

# The deploy user owns only the releases; Caddy reads them.
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/sh deploy
passwd -l deploy >/dev/null
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
install -o deploy -g deploy -m 600 "$incoming/authorized_keys" /home/deploy/.ssh/authorized_keys
install -o root -g root -m 755 "$incoming/maia-deploy" /usr/local/bin/maia-deploy
install -o root -g root -m 755 "$incoming/maia-api-up" /usr/local/bin/maia-api-up
visudo -cqf "$incoming/sudoers"
install -o root -g root -m 440 "$incoming/sudoers" /etc/sudoers.d/maia-deploy

# The API's settings: only root reads them. The database password is made once and kept, and so is the secret for
# aven.id's roles back channel once it has been put there (Deploy/README.md); the rest follows the environment.
install -d -o root -g root -m 755 /etc/maia-city
install -o root -g root -m 644 "$incoming/compose.yml" /etc/maia-city/compose.yml
password=$(sed -n 's/^POSTGRES_PASSWORD=//p' /etc/maia-city/api.env 2>/dev/null || true)
[ -n "$password" ] || password=$(openssl rand -hex 32)
roles_secret=$(sed -n 's/^AVEN_ROLES_SECRET=//p' /etc/maia-city/api.env 2>/dev/null || true)
umask 077
{ printf 'POSTGRES_PASSWORD=%s\n' "$password"; [ -z "$roles_secret" ] || printf 'AVEN_ROLES_SECRET=%s\n' "$roles_secret"; cat "$incoming/api.env"; } >/etc/maia-city/api.env.new
mv /etc/maia-city/api.env.new /etc/maia-city/api.env
chmod 600 /etc/maia-city/api.env
umask 022
install -d -o deploy -g deploy -m 755 /srv/maia-city /srv/maia-city/releases
install -o root -g root -m 644 "$incoming/hosts" /srv/maia-city/hosts
rm -f /srv/maia-city/host
if [ ! -e /srv/maia-city/current ]; then
	# Until the first deploy, a page that says so.
	for site in website game; do
		install -d -o deploy -g deploy -m 755 /srv/maia-city/releases/empty/$site
		printf '<!doctype html><title>Maia City</title><p>Nothing is deployed here yet.</p>\n' >/srv/maia-city/releases/empty/$site/index.html
	done
	chown -R deploy:deploy /srv/maia-city/releases/empty
	ln -s /srv/maia-city/releases/empty /srv/maia-city/current
	chown -h deploy:deploy /srv/maia-city/current
fi

caddy validate --adapter caddyfile --config "$incoming/Caddyfile" >/dev/null 2>&1 \
	|| { caddy validate --adapter caddyfile --config "$incoming/Caddyfile"; exit 1; }
install -o root -g root -m 644 "$incoming/Caddyfile" /etc/caddy/Caddyfile
systemctl enable --now caddy >/dev/null 2>&1
systemctl reload caddy

cat >/etc/ssh/sshd_config.d/10-maia.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHD
sshd -t
systemctl reload ssh

ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
for rule in 22/tcp 80/tcp 443/tcp 443/udp; do ufw allow "$rule" >/dev/null; done
ufw --force enable >/dev/null
systemctl enable --now unattended-upgrades >/dev/null 2>&1

echo "Host ready: $(caddy version | cut -d' ' -f1), serving $(tr '\n' ' ' </srv/maia-city/hosts)from $(readlink /srv/maia-city/current)"
REMOTE

tar -C "$payload" -cf - setup.sh maia-deploy maia-api-up compose.yml api.env sudoers Caddyfile hosts authorized_keys | ssh -o BatchMode=yes "$target" \
	'set -e; d=$(mktemp -d); trap "rm -rf \"$d\"" EXIT; tar -x -C "$d" -f -; bash "$d/setup.sh" "$d" </dev/null'
