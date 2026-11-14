#!/bin/sh
# Installed on the host as /usr/local/bin/maia-deploy and bound to the deploy key in
# ~deploy/.ssh/authorized_keys (command="..."), so that key can run nothing else.
#
# Standard input is a tar archive holding website/ (OS/dist) and game/ (TheGame/dist), each with version.json at its
# root, made by bundle.sh. The script checks the archive, unpacks it as /srv/maia-city/releases/<commit>-<time>,
# switches /srv/maia-city/current to it (both sites at once), checks that Caddy serves both, and keeps the last few
# releases. Rolling back is deploying an earlier commit.
set -eu
umask 022
root=${MAIA_ROOT:-/srv/maia-city}
keep=5
max_bytes=$((300 * 1024 * 1024))
# The public names, one per line: website=<host>, game=<host> (setup-host.sh writes them).
host() { sed -n "s/^$1=//p" "$root/hosts" | head -n 1; }

if [ "${SSH_ORIGINAL_COMMAND:-deploy}" != deploy ]; then
	echo "This key can only deploy." >&2
	exit 2
fi

stage=$(mktemp -d "$root/releases/.stage.XXXXXX")
trap 'rm -rf "$stage"' EXIT
head -c $((max_bytes + 1)) >"$stage/archive.tar"
if [ "$(wc -c <"$stage/archive.tar")" -gt "$max_bytes" ]; then
	echo "The archive is larger than $max_bytes bytes." >&2
	exit 2
fi
# Only plain files and directories, under website/ or game/, and no way out of the release directory.
if tar -tvf "$stage/archive.tar" | grep -qv '^[-d]' \
	|| tar -tf "$stage/archive.tar" | grep -qE '(^/|(^|/)\.\.(/|$))' \
	|| tar -tf "$stage/archive.tar" | grep -qvE '^(\./)?(website|game)(/|$)'; then
	echo "The archive may only hold plain files and directories under website/ and game/." >&2
	exit 2
fi
mkdir "$stage/release"
tar -x -C "$stage/release" --no-same-owner --no-same-permissions -f "$stage/archive.tar"
for file in website/index.html website/version.json game/index.html game/callback.html game/version.json; do
	if [ ! -f "$stage/release/$file" ]; then
		echo "The archive is missing $file." >&2
		exit 2
	fi
done
commit_of() { sed -n 's/.*"commit": *"\([0-9a-f]\{40\}\)".*/\1/p' "$stage/release/$1/version.json" | head -n 1; }
commit=$(commit_of website)
if [ -z "$commit" ] || [ "$(commit_of game)" != "$commit" ]; then
	echo "version.json must name the same full commit SHA for both sites." >&2
	exit 2
fi
chmod -R u=rwX,go=rX "$stage/release"

# A new directory each time, so redeploying the commit being served never removes it first.
release="$root/releases/$commit-$(date +%s)"
mv "$stage/release" "$release"
previous=$(readlink "$root/current" 2>/dev/null || true)
ln -sfn "$release" "$root/.current.new"
mv -T "$root/.current.new" "$root/current"

# The local listeners serve the same roots as the public sites, so this proves Caddy serves the new release.
served() { curl -fsS --max-time 5 "http://127.0.0.1:$1/$2" 2>/dev/null; }
if ! served 8081 version.json | grep -q "$commit" || ! served 8081 index.html >/dev/null || ! served 8081 api/intents >/dev/null \
	|| ! served 8082 version.json | grep -q "$commit" || ! served 8082 index.html >/dev/null || ! served 8082 callback >/dev/null; then
	echo "Caddy does not serve the new release; switching back." >&2
	if [ -n "$previous" ] && [ -d "$previous" ]; then
		ln -sfn "$previous" "$root/.current.new"
		mv -T "$root/.current.new" "$root/current"
	fi
	exit 1
fi

# Keep the newest releases and whatever current points to.
current=$(readlink "$root/current")
ls -1t "$root/releases" | grep -E '^[0-9a-f]{40}-[0-9]+$' | tail -n +$((keep + 1)) | while read -r old; do
	[ "$root/releases/$old" = "$current" ] || rm -rf "${root:?}/releases/$old"
done

# A public name only answers once its DNS record points here and Caddy holds its certificate (the first can take a minute).
for name in $(host website) $(host game); do
	attempt=0
	until curl -fsS --max-time 10 --connect-to "$name:443:127.0.0.1:443" "https://$name/version.json" 2>/dev/null | grep -q "$commit"; do
		attempt=$((attempt + 1))
		if [ "$attempt" -ge 30 ]; then
			echo "warning: https://$name is not served yet. Point its DNS record at this host; Caddy then gets a certificate." >&2
			continue 2
		fi
		sleep 2
	done
	echo "Serving https://$name"
done
echo "Deployed $commit"
