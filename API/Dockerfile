# The game's API (src/server.js): no packages to install, only Bun. Built on the host by maia-api-up from the release
# deploy/bundle.sh packs (api/: this file, package.json, src/, migrations/, version.json); deploy/compose.yml runs it.
FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4
WORKDIR /app
COPY . .
USER bun
EXPOSE 3000
CMD ["bun", "src/server.js"]
