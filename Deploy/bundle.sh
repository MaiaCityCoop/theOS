#!/usr/bin/env bash
# Builds the website (Website/) and the game (TheGame/) for one environment and packs the archive deploy.sh installs, with
# the game's API (API/) as source for the host to build (Deploy/api-up.sh):
#   Deploy/bundle.sh <environment.json> <commit> <output.tar>
# Run from the repository's root after `bun install --frozen-lockfile` in Website/ and TheGame/. The environment names
# both origins and the aven.id issuer the game signs in with: the game reads VITE_AVEN_ISSUER at build time
# (src/account/config.js) and VITE_OS for its way back (cine/menu.js), and the website frames the game at VITE_GAME
# (Website/src/main.js).
set -euo pipefail
environment=${1:?Usage: $0 <environment.json> <commit> <output.tar>}
commit=${2:?Usage: $0 <environment.json> <commit> <output.tar>}
output=${3:?Usage: $0 <environment.json> <commit> <output.tar>}
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Use a full commit SHA." >&2; exit 1; }
origin() { jq -er --arg k "$1" '.[$k] | select(test("^https://[a-z0-9.-]+$"))' "$environment"; }
website=$(origin Website)
game=$(origin Game)
issuer=$(origin Issuer)
root=$(cd "$(dirname "$0")/.." && pwd)
pack=$(mktemp -d)
trap 'rm -rf "$pack"' EXIT

version() { jq -n --arg commit "$commit" --arg website "$website" --arg game "$game" --arg issuer "$issuer" \
	'{commit: $commit, website: $website, game: $game, issuer: $issuer}'; }

# The game's pill (TheGame/cine/menu.js) leads back to the website at VITE_OS.
(cd "$root/TheGame" && rm -rf dist && VITE_AVEN_ISSUER="$issuer" VITE_OS="$website" bun run build)
grep -rqF "$issuer" "$root/TheGame/dist/assets" || { echo "The game's build does not name the issuer $issuer." >&2; exit 1; }
grep -rqF "$website" "$root/TheGame/dist/assets" || { echo "The game's build does not lead back to the website at $website." >&2; exit 1; }
(cd "$root/Website" && rm -rf dist && VITE_GAME="$game" bun run build)
grep -rqF "$game" "$root/Website/dist/assets" || { echo "The website's build does not name the game at $game." >&2; exit 1; }

cp -R "$root/TheGame/dist" "$pack/game"
cp -R "$root/Website/dist" "$pack/website"
mkdir "$pack/api"
cp -R "$root/API/Dockerfile" "$root/API/.dockerignore" "$root/API/package.json" "$root/API/src" "$root/API/migrations" "$pack/api/"
version >"$pack/game/version.json"
version >"$pack/website/version.json"
version >"$pack/api/version.json"
tar -C "$pack" --owner=0 --group=0 --numeric-owner -cf "$output" website game api
