#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true ]] || { echo 'This fixture is restricted to disposable CI runners'; exit 1; }
TASK_DIR="$(mktemp -d -t system-ops-adapters-XXXXXX)"
TASK_CONTAINER="system-ops-fixture-${GITHUB_RUN_ID:-local}"
trap 'docker rm -f "$TASK_CONTAINER" >/dev/null 2>&1 || true' EXIT
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TASK_DIR/key.pem" -out "$TASK_DIR/cert.pem" -days 2 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 >/dev/null 2>&1
docker run -d --name "$TASK_CONTAINER" alpine:3.22 sh -c 'echo adapter-fixture-log; sleep 300'
ADAPTER_FIXTURE_DIR="$TASK_DIR" ADAPTER_FIXTURE_CONTAINER="$TASK_CONTAINER" node scripts/adapter-fixture.js
