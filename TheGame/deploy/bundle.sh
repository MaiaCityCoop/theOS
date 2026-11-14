#!/usr/bin/env bash
# Builds the game for one environment and packs the archive that deploy.sh installs on a host:
#   deploy/bundle.sh <environment.json> <commit> <output.tar>
# Run from TheGame/ after `bun install --frozen-lockfile`. The environment names the game's public origin and
# the aven.id issuer it signs in with (src/account/config.js reads VITE_AVEN_ISSUER at build time).
set -euo pipefail
environment=${1:?Usage: $0 <environment.json> <commit> <output.tar>}
commit=${2:?Usage: $0 <environment.json> <commit> <output.tar>}
output=${3:?Usage: $0 <environment.json> <commit> <output.tar>}
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Use a full commit SHA." >&2; exit 1; }
origin=$(jq -er '.Origin | select(test("^https://[a-z0-9.-]+$"))' "$environment")
issuer=$(jq -er '.Issuer | select(test("^https://[a-z0-9.-]+$"))' "$environment")

rm -rf dist
VITE_AVEN_ISSUER="$issuer" bun run build
grep -rqF "$issuer" dist/assets || { echo "The build does not name the issuer $issuer." >&2; exit 1; }
jq -n --arg commit "$commit" --arg origin "$origin" --arg issuer "$issuer" \
	'{commit: $commit, origin: $origin, issuer: $issuer}' >dist/version.json
tar -C dist --owner=0 --group=0 --numeric-owner -cf "$output" .
