#!/usr/bin/env bash
#
# Build the optional Go collector sidecar for Linux.
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COLLECTOR_DIR="$ROOT_DIR/go-collector"
OUTPUT="$COLLECTOR_DIR/bin/system-ops-collector"

if ! command -v go >/dev/null 2>&1; then
  echo "Go is not installed. Skipping collector build."
  exit 0
fi

mkdir -p "$COLLECTOR_DIR/bin"

echo "Building Go collector -> $OUTPUT"
cd "$COLLECTOR_DIR"
CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o "$OUTPUT" .

chmod 755 "$OUTPUT"
echo "Go collector built successfully."
