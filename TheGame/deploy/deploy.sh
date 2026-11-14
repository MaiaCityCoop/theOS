#!/bin/sh
# Installed on the host as /usr/local/bin/maia-deploy and bound to the deploy key in
# ~deploy/.ssh/authorized_keys (command="..."), so that key can run nothing else.
#
# Standard input is a tar archive of the built site (TheGame/dist) with version.json at its root,
# made by bundle.sh. The script checks the archive, unpacks it as /srv/maia-city/releases/<commit>-<time>,
# switches /srv/maia-city/current to it, checks that Caddy serves it and keeps the last few releases.
# Rolling back is deploying an earlier commit.
set -eu
umask 022
root=${MAIA_ROOT:-/srv/maia-city}
public_host=${MAIA_PUBLIC_HOST:-$(cat "$root/host")}
keep=5
max_bytes=$((200 * 1024 * 1024))

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
# Only plain files and directories, no absolute paths and no way out of the release directory.
if tar -tvf "$stage/archive.tar" | grep -qv '^[-d]' \
	|| tar -tf "$stage/archive.tar" | grep -qE '(^/|(^|/)\.\.(/|$))'; then
	echo "The archive may only hold plain files and directories inside the site." >&2
	exit 2
fi
mkdir "$stage/site"
tar -x -C "$stage/site" --no-same-owner --no-same-permissions -f "$stage/archive.tar"
for file in index.html callback.html version.json; do
	if [ ! -f "$stage/site/$file" ]; then
		echo "The archive is missing $file." >&2
		exit 2
	fi
done
commit=$(sed -n 's/.*"commit": *"\([0-9a-f]\{40\}\)".*/\1/p' "$stage/site/version.json" | head -n 1)
if [ -z "$commit" ]; then
	echo "version.json names no full commit SHA." >&2
	exit 2
fi
chmod -R u=rwX,go=rX "$stage/site"

# A new directory each time, so redeploying the commit being served never removes it first.
release="$root/releases/$commit-$(date +%s)"
mv "$stage/site" "$release"
previous=$(readlink "$root/current" 2>/dev/null || true)
ln -sfn "$release" "$root/.current.new"
mv -T "$root/.current.new" "$root/current"

# The local listener serves the same root as the public site, so this proves Caddy serves the new release.
served() { curl -fsS --max-time 5 "http://127.0.0.1:8081/$1" 2>/dev/null; }
if ! served version.json | grep -q "$commit" || ! served callback >/dev/null || ! served index.html >/dev/null; then
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

# The public name only answers once its DNS record points here and Caddy holds a certificate.
if curl -fsS --max-time 10 --connect-to "$public_host:443:127.0.0.1:443" "https://$public_host/version.json" 2>/dev/null \
	| grep -q "$commit"; then
	echo "Serving https://$public_host"
else
	echo "warning: https://$public_host is not served yet. Point its DNS record at this host; Caddy then gets a certificate." >&2
fi
echo "Deployed $commit"
