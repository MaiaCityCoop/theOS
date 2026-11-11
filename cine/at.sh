#!/bin/bash
# Runs the world as it was at a commit, with today's virtual camera laid over it, on its own port:
#   bash cine/at.sh <commit> [port]        (default port 5174)
# The stage is checked out beside the repository, never in the tree you work in.
set -e
hash="$1"; port="${2:-5174}"
[ -n "$hash" ] || { echo "usage: at.sh <commit> [port]"; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel)"
short="$(git -C "$root" rev-parse --short=9 "$hash")"
dir="$(dirname "$root")/theos-at-$short"
[ -d "$dir" ] || git -C "$root" worktree add --detach "$dir" "$hash"
cd "$dir" || exit 1
[ "$(git rev-parse --show-toplevel)" = "$dir" ] || { echo "not in the stage's own tree"; exit 1; }
rm -rf cine && cp -R "$here" cine && cp "$root/timeline.html" "$root/lenses.html" "$root/vite.config.js" .
grep -q 'cine/cine.js' index.html || sed -i '' 's|</body>|<script type="module" src="/cine/cine.js"></script>\n</body>|' index.html
grep -q 'cine/menu.js' index.html || sed -i '' 's|</body>|<script type="module" src="/cine/menu.js"></script>\n</body>|' index.html
bun install --silent
echo "stage $short on http://localhost:$port  (remove it with: git worktree remove --force $dir)"
exec bunx --bun vite --port "$port" --strictPort
