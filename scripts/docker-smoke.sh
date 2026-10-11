#!/usr/bin/env bash
set -euo pipefail

# Disposable image/container/volume; no production service or host mounts.
IMAGE="system-ops-smoke:${GITHUB_RUN_ID:-local}-$$"
CONTAINER="system-ops-smoke-$$"
DATA_VOLUME="system-ops-smoke-data-$$"
COMPOSE_DIR="$(mktemp -d -t system-ops-compose-smoke.XXXXXX)"
export APP_PASSWORD="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
export SESSION_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$DATA_VOLUME" >/dev/null 2>&1 || true
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
  rm -f "$COMPOSE_DIR/.env.docker" "$COMPOSE_DIR/config.json"
  rmdir "$COMPOSE_DIR" || true
}
trap cleanup EXIT

# Check env_file credentials without --env-file interpolation or shell defaults.
printf 'APP_PASSWORD=%s\nSESSION_SECRET=%s\nOLLAMA_URL=http://fixture:11434\n' \
  "$APP_PASSWORD" "$SESSION_SECRET" > "$COMPOSE_DIR/.env.docker"
docker compose --project-directory "$COMPOSE_DIR" -f docker-compose.yml config --format json > "$COMPOSE_DIR/config.json"
node -e 'const c = require(process.argv[1]); const a = require("assert/strict"); const e = c.services["system-ops"].environment; a.equal(e.APP_PASSWORD, process.env.APP_PASSWORD); a.equal(e.SESSION_SECRET, process.env.SESSION_SECRET); a.equal(e.OLLAMA_URL, "http://fixture:11434")' "$COMPOSE_DIR/config.json"

docker build -t "$IMAGE" .

# A deployed image with missing credentials must fail before accepting requests.
if docker run --rm -e APP_PASSWORD= -e SESSION_SECRET= "$IMAGE"; then
  echo "FAIL: production image accepted missing credentials" >&2
  exit 1
fi

docker run -d --name "$CONTAINER" -p 127.0.0.1::9080 \
  -e APP_PASSWORD -e SESSION_SECRET -e ENABLE_GO_COLLECTOR=false \
  -v "$DATA_VOLUME:/app/data" "$IMAGE" >/dev/null
PORT="$(docker port "$CONTAINER" 9080/tcp | head -1 | awk -F: '{print $NF}')"
export SMOKE_BASE_URL="http://127.0.0.1:$PORT"
node scripts/runtime-smoke.js

# Recreate the container and verify settings survive in the named volume.
docker rm -f "$CONTAINER" >/dev/null
docker run -d --name "$CONTAINER" -p 127.0.0.1::9080 \
  -e APP_PASSWORD -e SESSION_SECRET -e ENABLE_GO_COLLECTOR=false \
  -v "$DATA_VOLUME:/app/data" "$IMAGE" >/dev/null
PORT="$(docker port "$CONTAINER" 9080/tcp | head -1 | awk -F: '{print $NF}')"
curl --fail --silent --retry 20 --retry-connrefused --retry-delay 1 \
  "http://127.0.0.1:$PORT/api/v2/settings/branding" > /tmp/"$CONTAINER-branding.json"
node -e 'const fs = require("fs"); const assert = require("assert/strict"); assert.equal(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).siteName, "system-ops-smoke")' /tmp/"$CONTAINER-branding.json"
rm /tmp/"$CONTAINER-branding.json"
echo "PASS: settings persist after container recreation"
