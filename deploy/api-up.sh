#!/bin/sh
# Installed on the host as /usr/local/bin/maia-api-up, owned by root. The deploy user may run it with sudo and nothing
# else as root (/etc/sudoers.d/maia-deploy): it builds the API of one release in /srv/maia-city/releases and starts it
# with Postgres, as /etc/maia-city/compose.yml (deploy/compose.yml) says, and waits until both are healthy.
#   maia-api-up <commit>-<time>
set -eu
release=${1:-}
if [ $# -ne 1 ] || ! printf '%s' "$release" | grep -qxE '[0-9a-f]{40}-[0-9]+'; then
	echo "Usage: maia-api-up <commit>-<time>, a release in /srv/maia-city/releases" >&2
	exit 2
fi
if [ ! -f "/srv/maia-city/releases/$release/api/Dockerfile" ]; then
	echo "The release $release has no API." >&2
	exit 2
fi
compose() { RELEASE=$release docker compose --project-name maia-city --file /etc/maia-city/compose.yml --env-file /etc/maia-city/api.env --progress quiet "$@"; }
if ! compose up --detach --build --wait --wait-timeout 120 --remove-orphans; then
	echo "The API of $release did not come up:" >&2
	compose logs --no-color --tail 40 api >&2 || true
	exit 1
fi
# The images of releases no longer kept, and build leftovers.
docker image ls --format '{{.Repository}}:{{.Tag}}' maia-city-api | while read -r image; do
	tag=${image#maia-city-api:}
	[ "$tag" = "$release" ] || [ -d "/srv/maia-city/releases/$tag" ] || docker image rm "$image" >/dev/null 2>&1 || true
done
docker image prune --force >/dev/null 2>&1 || true
echo "The API of $release is up"
