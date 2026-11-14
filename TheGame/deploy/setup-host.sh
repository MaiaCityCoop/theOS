#!/usr/bin/env bash
# Prepares an Ubuntu 24.04 or 26.04 LTS host to serve the game, or brings one up to date. Run it from your own
# machine with root SSH access to the host; it is safe to run again (TheGame/deploy/README.md):
#   deploy/setup-host.sh root@<host> <environment.json> <deploy-key.pub>
# It installs Caddy from Caddy's own apt repository, creates the `deploy` user whose key can only run
# /usr/local/bin/maia-deploy, writes /etc/caddy/Caddyfile for the environment's host name, and turns on the firewall.
set -euo pipefail
target=${1:?Usage: $0 root@<host> <environment.json> <deploy-key.pub>}
environment=${2:?Usage: $0 root@<host> <environment.json> <deploy-key.pub>}
key_file=${3:?Usage: $0 root@<host> <environment.json> <deploy-key.pub>}
here=$(cd "$(dirname "$0")" && pwd)
site_host=$(jq -er '.Origin | select(test("^https://[a-z0-9.-]+$")) | sub("^https://"; "")' "$environment")
key=$(head -n 1 "$key_file")
[[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]] || { echo "$key_file is not an ssh-ed25519 public key." >&2; exit 1; }

payload=$(mktemp -d)
trap 'rm -rf "$payload"' EXIT
cp "$here/deploy.sh" "$payload/maia-deploy"
sed "s/@SITE_HOST@/$site_host/" "$here/Caddyfile" >"$payload/Caddyfile"
printf '%s\n' "$site_host" >"$payload/host"
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

# The deploy user owns only the releases; Caddy reads them.
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/sh deploy
passwd -l deploy >/dev/null
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
install -o deploy -g deploy -m 600 "$incoming/authorized_keys" /home/deploy/.ssh/authorized_keys
install -o root -g root -m 755 "$incoming/maia-deploy" /usr/local/bin/maia-deploy
install -d -o deploy -g deploy -m 755 /srv/maia-city /srv/maia-city/releases
install -o root -g root -m 644 "$incoming/host" /srv/maia-city/host
if [ ! -e /srv/maia-city/current ]; then
	# Until the first deploy, a page that says so.
	install -d -o deploy -g deploy -m 755 /srv/maia-city/releases/empty
	printf '<!doctype html><title>Maia City</title><p>Nothing is deployed here yet.</p>\n' >/srv/maia-city/releases/empty/index.html
	chown deploy:deploy /srv/maia-city/releases/empty/index.html
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

echo "Host ready: $(caddy version | cut -d' ' -f1), serving $(cat /srv/maia-city/host) from $(readlink /srv/maia-city/current)"
REMOTE

tar -C "$payload" -cf - setup.sh maia-deploy Caddyfile host authorized_keys | ssh -o BatchMode=yes "$target" \
	'set -e; d=$(mktemp -d); trap "rm -rf \"$d\"" EXIT; tar -x -C "$d" -f -; bash "$d/setup.sh" "$d" </dev/null'
