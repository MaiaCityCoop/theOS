#!/bin/sh
# Installed on the host as /usr/local/bin/maia-deploy and bound to the deploy key in
# ~Deploy/.ssh/authorized_keys (command="..."), so that key can run nothing else.
#
# Standard input is a tar archive holding website/ (Website/dist), game/ (TheGame/dist) and api/ (the API's source), each
# with version.json at its root, made by bundle.sh. The script checks the archive, unpacks it as
# /srv/maia-city/releases/<commit>-<time>, has root build and start that release's API (sudo maia-api-up, the one
# command this user may run as root), switches /srv/maia-city/current to it (both sites at once), checks that Caddy
# serves both sites and the new API, and keeps the last few releases. Anything that fails puts the last release back.
# Rolling back is deploying an earlier commit. A release also serves the build before it (its hashed files), so a page
# that loaded just before the switch still finds its own.
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
# Only plain files and directories, under website/, game/ or api/, and no way out of the release directory.
if tar -tvf "$stage/archive.tar" | grep -qv '^[-d]' \
	|| tar -tf "$stage/archive.tar" | grep -qE '(^/|(^|/)\.\.(/|$))' \
	|| tar -tf "$stage/archive.tar" | grep -qvE '^(\./)?(website|game|api)(/|$)'; then
	echo "The archive may only hold plain files and directories under website/, game/ and api/." >&2
	exit 2
fi
mkdir "$stage/release"
tar -x -C "$stage/release" --no-same-owner --no-same-permissions -f "$stage/archive.tar"
for file in website/index.html website/version.json game/index.html game/callback.html game/version.json \
	api/Dockerfile api/src/server.js api/version.json; do
	if [ ! -f "$stage/release/$file" ]; then
		echo "The archive is missing $file." >&2
		exit 2
	fi
done
commit_of() { sed -n 's/.*"commit": *"\([0-9a-f]\{40\}\)".*/\1/p' "$stage/release/$1/version.json" | head -n 1; }
commit=$(commit_of website)
if [ -z "$commit" ] || [ "$(commit_of game)" != "$commit" ] || [ "$(commit_of api)" != "$commit" ]; then
	echo "version.json must name the same full commit SHA for both sites and the API." >&2
	exit 2
fi
chmod -R u=rwX,go=rX "$stage/release"

# A new directory each time, so redeploying the commit being served never removes it first.
release="$root/releases/$commit-$(date +%s)"
mv "$stage/release" "$release"
previous=$(readlink "$root/current" 2>/dev/null || true)
# A page that loaded before this deploy still asks for its own build's hashed files (its chunks and its workers, named by
# their content: never another build's in their place), and the switch would take them from under it. So this release
# serves the previous one's too, hard-linked (nothing copied), and records which files are its own (<site>.assets,
# outside what is served): the next deploy carries only those, so one build back is served, never more.
for site in website game; do
	(cd "$release/$site" && find assets -type f 2>/dev/null | LC_ALL=C sort) >"$release/$site.assets"
	[ -n "$previous" ] && [ -d "$previous/$site/assets" ] || continue
	if [ -f "$previous/$site.assets" ]; then cat "$previous/$site.assets"; else (cd "$previous/$site" && find assets -type f); fi |
		while IFS= read -r file; do
			[ -e "$release/$site/$file" ] || { mkdir -p "$(dirname "$release/$site/$file")" && ln "$previous/$site/$file" "$release/$site/$file"; }
		done
done
# The API of the release that was served, started again (if it had one).
api_back() {
	if [ -n "$previous" ] && [ -f "$previous/api/Dockerfile" ]; then
		sudo -n /usr/local/bin/maia-api-up "$(basename "$previous")" >&2 || echo "The previous API did not come back up either." >&2
	fi
}
if ! sudo -n /usr/local/bin/maia-api-up "$(basename "$release")"; then
	echo "The new API did not start; the last release stays." >&2
	api_back
	exit 1
fi
ln -sfn "$release" "$root/.current.new"
mv -T "$root/.current.new" "$root/current"

# The local listeners serve the same roots as the public sites, so this proves Caddy serves the new release.
served() { curl -fsS --max-time 5 "http://127.0.0.1:$1/$2" 2>/dev/null; }
if ! served 8081 version.json | grep -q "$commit" || ! served 8081 index.html >/dev/null || ! served 8081 api/intents >/dev/null \
	|| ! served 8082 version.json | grep -q "$commit" || ! served 8082 index.html >/dev/null || ! served 8082 callback >/dev/null \
	|| ! served 8082 api/health | grep -q "$commit"; then
	echo "Caddy does not serve the new release and its API; switching back." >&2
	if [ -n "$previous" ] && [ -d "$previous" ]; then
		ln -sfn "$previous" "$root/.current.new"
		mv -T "$root/.current.new" "$root/current"
	fi
	api_back
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
